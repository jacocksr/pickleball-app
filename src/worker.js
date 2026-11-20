const VERSION = 'dink-1.0.0';
const MAX_PLAYERS = 500;
const MAX_GAMES_PER_HOUR = 60;
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' };
const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
const HIDDEN = ['/src', '/wrangler', '/package', '/readme', '/.'];
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, deleted_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, ts INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('doubles','singles')), winner TEXT NOT NULL CHECK(winner IN ('a','b')), creator_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER, edited_by TEXT, deleted_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS game_players(game_id TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('a','b')), player_id INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY(game_id, side, player_id))`,
  `CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT, detail TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_games_ts ON games(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_games_creator ON games(creator_hash, created_at)`
];

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || 'ERROR'; }
}
function need(cond, message, status, code) { if (!cond) throw new HttpError(status || 400, message, code); }
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC } });
}

const enc = new TextEncoder();
function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
async function sha(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function same(a, b) { return (await sha(a)) === (await sha(b)); }

let ready = null;
function ensure(db) {
  if (!ready) ready = db.batch(SCHEMA.map(function (s) { return db.prepare(s); })).catch(function (e) { ready = null; throw e; });
  return ready;
}

/* ---------- Identity: anonymous device token and administrator session ---------- */
function clientToken(req) {
  const t = req.headers.get('X-Client-Token') || '';
  return /^[0-9a-f]{32,64}$/.test(t) ? t : null;
}
async function creatorOf(req) {
  const t = clientToken(req);
  return t ? sha('dink-client|' + t) : null;
}
async function makeToken(env) {
  const exp = Date.now() + 12 * 3600 * 1000;
  return { token: exp + '.' + (await hmac(env.ADMIN_PASSWORD, 'dink-admin|' + exp)), expires: exp };
}
async function isAdmin(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = req.headers.get('Authorization') || '';
  if (h.slice(0, 7) !== 'Bearer ') return false;
  const t = h.slice(7), i = t.indexOf('.');
  if (i < 1) return false;
  const exp = Number(t.slice(0, i));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return same(t.slice(i + 1), await hmac(env.ADMIN_PASSWORD, 'dink-admin|' + exp));
}
function editWindow(env) { return (Number(env.EDIT_WINDOW_MINUTES) || 120) * 60000; }

/* ---------- Validation helpers ---------- */
function cleanName(v) {
  const s = Array.from(String(v == null ? '' : v)).filter(function (c) { return c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127; }).join('');
  const out = s.split(' ').filter(Boolean).join(' ');
  need(out.length >= 1 && out.length <= 20, 'Names must be 1 to 20 characters.');
  return out;
}
function tryName(v) { try { return cleanName(v); } catch (e) { return null; } }
function gameId(v) {
  need(typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v), 'Invalid game ID.');
  return v;
}
function idList(v) {
  need(Array.isArray(v) && v.length >= 1 && v.length <= 2, 'A match is 1 v 1 or 2 v 2.');
  return v.map(function (x) { need(Number.isInteger(x) && x > 0, 'Invalid player.'); return x; });
}
function parseGame(b) {
  need(b && typeof b === 'object', 'Invalid request.');
  const a = idList(b.a), c = idList(b.b);
  need(a.length === c.length, 'Both sides need the same number of players.');
  need(new Set(a.concat(c)).size === a.length + c.length, 'A player cannot be on both sides.');
  need(b.winner === 'a' || b.winner === 'b', 'Pick a winner.');
  return { a: a, b: c, type: a.length === 1 ? 'singles' : 'doubles', winner: b.winner };
}
async function playersByIds(db, ids) {
  const marks = ids.map(function () { return '?'; }).join(',');
  const rows = (await db.prepare('SELECT id,name FROM players WHERE deleted_at IS NULL AND id IN (' + marks + ')').bind(...ids).all()).results;
  need(rows.length === ids.length, 'One of those players no longer exists.', 400, 'UNKNOWN_PLAYER');
  return new Map(rows.map(function (r) { return [r.id, r.name]; }));
}

/* ---------- Game helpers ---------- */
function gameStmts(db, id, g, names) {
  const s = [db.prepare('DELETE FROM game_players WHERE game_id=?').bind(id)];
  [['a', g.a], ['b', g.b]].forEach(function (pair) {
    pair[1].forEach(function (pid) {
      s.push(db.prepare('INSERT INTO game_players(game_id,side,player_id,name) VALUES(?,?,?,?)').bind(id, pair[0], pid, names.get(pid)));
    });
  });
  return s;
}
function audit(db, actor, action, id, detail) {
  return db.prepare('INSERT INTO audit(ts,actor,action,game_id,detail) VALUES(?,?,?,?,?)').bind(Date.now(), actor, action, id || null, JSON.stringify(detail || {}));
}
async function gameJson(db, id) {
  const g = await db.prepare('SELECT id,ts,type,winner FROM games WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!g) return null;
  const rows = (await db.prepare('SELECT side,player_id,name FROM game_players WHERE game_id=?').bind(id).all()).results;
  const out = { id: g.id, ts: g.ts, type: g.type, winner: g.winner, a: [], b: [] };
  rows.forEach(function (r) { out[r.side].push({ id: r.player_id, name: r.name }); });
  return out;
}
async function latestBy(db, me) {
  return db.prepare('SELECT id,created_at FROM games WHERE creator_hash=? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(me).first();
}
async function mayEdit(db, env, req, game, admin) {
  if (admin) return 'admin';
  const me = await creatorOf(req);
  const msg = 'Only an administrator can change this result.';
  need(me && game.creator_hash === me, msg, 403, 'ADMIN_ONLY');
  const last = await latestBy(db, me);
  need(last && last.id === game.id, 'You can only change your most recent game. Ask an administrator for older results.', 403, 'ADMIN_ONLY');
  need(Date.now() - game.created_at <= editWindow(env), 'The edit window for this game has closed. Ask an administrator.', 403, 'ADMIN_ONLY');
  return 'creator';
}
async function loadGame(db, id) {
  const g = await db.prepare('SELECT * FROM games WHERE id=? AND deleted_at IS NULL').bind(id).first();
  need(g, 'Game not found.', 404, 'NOT_FOUND');
  return g;
}
async function checkRate(db, me) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE creator_hash=? AND created_at>?').bind(me, Date.now() - 3600000).first();
  need(row.n < MAX_GAMES_PER_HOUR, 'Too many games logged from this device in the last hour.', 429, 'RATE_LIMIT');
}

/* ---------- Reads ---------- */
async function readData(db, req, env) {
  const res = await db.batch([
    db.prepare('SELECT id,name FROM players WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT id,ts,type,winner FROM games WHERE deleted_at IS NULL ORDER BY ts DESC LIMIT 3000'),
    db.prepare('SELECT game_id,side,player_id,name FROM game_players WHERE game_id IN (SELECT id FROM games WHERE deleted_at IS NULL ORDER BY ts DESC LIMIT 3000)')
  ]);
  const by = new Map();
  res[2].results.forEach(function (r) {
    const o = by.get(r.game_id) || { a: [], b: [] };
    o[r.side].push({ id: r.player_id, name: r.name });
    by.set(r.game_id, o);
  });
  const games = res[1].results.map(function (r) {
    const o = by.get(r.id) || { a: [], b: [] };
    return { id: r.id, ts: r.ts, type: r.type, winner: r.winner, a: o.a, b: o.b };
  });
  let canEdit = null;
  const me = await creatorOf(req);
  if (me) {
    const last = await latestBy(db, me);
    if (last && Date.now() - last.created_at <= editWindow(env)) canEdit = last.id;
  }
  return { players: res[0].results, games: games, admin: await isAdmin(req, env), canEdit: canEdit, editWindowMinutes: editWindow(env) / 60000, version: VERSION, serverTime: Date.now() };
}

/* ---------- Writes ---------- */
async function addPlayer(db, b) {
  const name = cleanName(b.name), key = name.toLowerCase();
  let row = await db.prepare('SELECT id,name,deleted_at FROM players WHERE name_key=?').bind(key).first();
  if (!row) {
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM players WHERE deleted_at IS NULL').first()).n;
    need(n < MAX_PLAYERS, 'The player list is full.', 409, 'FULL');
    await db.prepare('INSERT OR IGNORE INTO players(name,name_key,created_at) VALUES(?,?,?)').bind(name, key, Date.now()).run();
    row = await db.prepare('SELECT id,name,deleted_at FROM players WHERE name_key=?').bind(key).first();
  } else if (row.deleted_at) {
    await db.prepare('UPDATE players SET deleted_at=NULL WHERE id=?').bind(row.id).run();
  }
  return { ok: true, player: { id: row.id, name: row.name } };
}

async function createGame(db, req, b) {
  const me = await creatorOf(req);
  need(me, 'Missing device token. Reload the page and try again.');
  const id = gameId(b.id), g = parseGame(b);
  const old = await db.prepare('SELECT * FROM games WHERE id=?').bind(id).first();
  if (old) {
    need(old.creator_hash === me, 'That game ID is already used.', 409, 'CONFLICT');
    if (!old.deleted_at) return { ok: true, replay: true, game: await gameJson(db, id), canEdit: id };
  }
  await checkRate(db, me);
  const names = await playersByIds(db, g.a.concat(g.b));
  const now = Date.now();
  const head = old
    ? db.prepare('UPDATE games SET deleted_at=NULL, ts=?, type=?, winner=?, created_at=?, updated_at=NULL, edited_by=NULL WHERE id=?').bind(now, g.type, g.winner, now, id)
    : db.prepare('INSERT INTO games(id,ts,type,winner,creator_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id, now, g.type, g.winner, me, now);
  await db.batch([head].concat(gameStmts(db, id, g, names), [audit(db, 'user', 'create', id, { type: g.type, winner: g.winner })]));
  return { ok: true, game: await gameJson(db, id), canEdit: id };
}

async function updateGame(db, env, req, b, admin) {
  const id = gameId(b.id), cur = await loadGame(db, id);
  const actor = await mayEdit(db, env, req, cur, admin);
  const old = await gameJson(db, id);
  const snap = new Map();
  old.a.concat(old.b).forEach(function (p) { snap.set(p.id, p.name); });
  const g = parseGame({ a: b.a || old.a.map(function (p) { return p.id; }), b: b.b || old.b.map(function (p) { return p.id; }), winner: b.winner || cur.winner });
  const missing = g.a.concat(g.b).filter(function (pid) { return !snap.has(pid); });
  if (missing.length) (await playersByIds(db, missing)).forEach(function (v, k) { snap.set(k, v); });
  await db.batch([db.prepare('UPDATE games SET type=?, winner=?, updated_at=?, edited_by=? WHERE id=?').bind(g.type, g.winner, Date.now(), actor, id)]
    .concat(gameStmts(db, id, g, snap), [audit(db, actor, 'update', id, { before: { type: old.type, winner: old.winner }, after: { type: g.type, winner: g.winner } })]));
  return { ok: true, game: await gameJson(db, id) };
}

async function deleteGame(db, env, req, b, admin) {
  const id = gameId(b.id), cur = await loadGame(db, id);
  const actor = await mayEdit(db, env, req, cur, admin);
  const old = await gameJson(db, id);
  await db.batch([
    db.prepare('UPDATE games SET deleted_at=?, edited_by=? WHERE id=?').bind(Date.now(), actor, id),
    audit(db, actor, 'delete', id, { type: old.type, winner: old.winner, a: old.a.map(function (p) { return p.name; }), b: old.b.map(function (p) { return p.name; }) })
  ]);
  return { ok: true };
}

async function importData(db, b) {
  const plist = Array.isArray(b.players) ? b.players : [], glist = Array.isArray(b.games) ? b.games : [];
  need(plist.length <= MAX_PLAYERS && glist.length <= 5000, 'Too many rows in that file.', 413);
  const names = new Map();
  function add(n) { const c = tryName(n); if (c) names.set(c.toLowerCase(), c); }
  plist.forEach(function (p) { add(p && p.name); });
  glist.forEach(function (g) {
    ['a', 'b'].forEach(function (s) { (Array.isArray(g && g[s]) ? g[s] : []).forEach(function (p) { add(p && p.name); }); });
  });
  need(names.size <= MAX_PLAYERS, 'Too many different players in that file.', 413);
  const now = Date.now(), entries = Array.from(names.entries());
  for (let i = 0; i < entries.length; i += 50) {
    await db.batch(entries.slice(i, i + 50).map(function (e) { return db.prepare('INSERT OR IGNORE INTO players(name,name_key,created_at) VALUES(?,?,?)').bind(e[1], e[0], now); }));
  }
  const idMap = new Map((await db.prepare('SELECT id,name_key FROM players').all()).results.map(function (r) { return [r.name_key, r.id]; }));
  const have = new Set((await db.prepare('SELECT id FROM games').all()).results.map(function (r) { return r.id; }));
  let added = 0, skipped = 0, stmts = [];
  async function flush() { if (stmts.length) { await db.batch(stmts); stmts = []; } }
  for (const g of glist) {
    try {
      const id = gameId(g.id);
      if (have.has(id)) { skipped++; continue; }
      const side = function (s) { return g[s].map(function (p) { const n = cleanName(p.name); return { id: idMap.get(n.toLowerCase()), name: n }; }); };
      const a = side('a'), c = side('b');
      const parsed = parseGame({ a: a.map(function (p) { return p.id; }), b: c.map(function (p) { return p.id; }), winner: g.winner });
      const ts = Number.isFinite(Number(g.ts)) ? Math.min(Number(g.ts), now + 86400000) : now;
      const nm = new Map();
      a.concat(c).forEach(function (p) { nm.set(p.id, p.name); });
      stmts.push(db.prepare('INSERT INTO games(id,ts,type,winner,creator_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id, ts, parsed.type, parsed.winner, 'import', now));
      gameStmts(db, id, parsed, nm).slice(1).forEach(function (s) { stmts.push(s); });
      have.add(id); added++;
      if (stmts.length >= 60) await flush();
    } catch (e) { skipped++; }
  }
  await flush();
  await audit(db, 'admin', 'import', null, { players: names.size, added: added, skipped: skipped }).run();
  return { ok: true, players: names.size, added: added, skipped: skipped };
}

/* ---------- Router ---------- */
async function api(request, env, url) {
  const db = env.DB, path = url.pathname;
  if (request.method === 'GET') {
    if (path === '/api/data') return json(await readData(db, request, env));
    if (path === '/api/admin/audit') {
      need(await isAdmin(request, env), 'Administrator sign-in required.', 401, 'ADMIN_ONLY');
      return json({ rows: (await db.prepare('SELECT ts,actor,action,game_id,detail FROM audit ORDER BY id DESC LIMIT 100').all()).results });
    }
    return json({ error: 'Not found' }, 404);
  }
  need(request.method === 'POST', 'Method not allowed.', 405);
  need(request.headers.get('Origin') === url.origin, 'Cross-origin or missing-origin write rejected.', 403);
  need((request.headers.get('Content-Type') || '').startsWith('application/json'), 'JSON required.', 415);
  const text = await request.text();
  need(text.length <= (path === '/api/admin/import' ? 1500000 : 20000), 'Request too large.', 413);
  let b;
  try { b = text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, 'Invalid JSON.'); }
  need(b && typeof b === 'object', 'Invalid request.');

  if (path === '/api/admin/login') {
    need(env.ADMIN_PASSWORD, 'The administrator password has not been set up yet.', 503, 'NO_ADMIN');
    if (!(await same(String(b.password || ''), env.ADMIN_PASSWORD))) {
      await new Promise(function (r) { setTimeout(r, 600); });
      throw new HttpError(401, 'That password is not correct.', 'BAD_PASSWORD');
    }
    return json(Object.assign({ ok: true }, await makeToken(env)));
  }
  if (path === '/api/players') return json(await addPlayer(db, b));
  if (path === '/api/games') return json(await createGame(db, request, b));

  const admin = await isAdmin(request, env);
  if (path === '/api/games/update') return json(await updateGame(db, env, request, b, admin));
  if (path === '/api/games/delete') return json(await deleteGame(db, env, request, b, admin));

  need(admin, 'Administrator sign-in required.', 401, 'ADMIN_ONLY');
  if (path === '/api/admin/import') return json(await importData(db, b));
  if (path === '/api/admin/player/rename') {
    const id = Number(b.id), name = cleanName(b.name), key = name.toLowerCase();
    need(Number.isInteger(id), 'Invalid player.');
    const dup = await db.prepare('SELECT id FROM players WHERE name_key=? AND id<>?').bind(key, id).first();
    need(!dup, 'Another player already has that name.', 409, 'CONFLICT');
    await db.batch([db.prepare('UPDATE players SET name=?, name_key=? WHERE id=?').bind(name, key, id), audit(db, 'admin', 'rename-player', null, { id: id, name: name })]);
    return json({ ok: true });
  }
  if (path === '/api/admin/player/delete') {
    const id = Number(b.id);
    need(Number.isInteger(id), 'Invalid player.');
    await db.batch([db.prepare('UPDATE players SET deleted_at=? WHERE id=?').bind(Date.now(), id), audit(db, 'admin', 'delete-player', null, { id: id })]);
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

async function serveAsset(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Not found' }, 404);
  const p = url.pathname.toLowerCase();
  if (HIDDEN.some(function (h) { return p.startsWith(h); })) return new Response('Not found', { status: 404, headers: SEC });
  need(env.ASSETS, 'Missing ASSETS binding.', 503);
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  Object.keys(SEC).forEach(function (k) { out.headers.set(k, SEC[k]); });
  if ((out.headers.get('Content-Type') || '').indexOf('text/html') >= 0) out.headers.set('Content-Security-Policy', CSP);
  return out;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health') return json({ ok: true, app: 'dink-teams', version: VERSION });
      if (url.pathname !== '/api' && url.pathname.indexOf('/api/') !== 0) return await serveAsset(request, env, url);
      need(env.DB, 'The database is not connected yet.', 503, 'NO_DB');
      await ensure(env.DB);
      return await api(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on the server.', code: 'SERVER_ERROR' }, 500);
    }
  }
};
