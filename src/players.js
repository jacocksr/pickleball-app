const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' };
const RENAMES_PER_HOUR = 10;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, deleted_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS game_players(game_id TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('a','b')), player_id INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY(game_id, side, player_id))`,
  `CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT, detail TEXT)`
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
async function creatorOf(req) {
  const t = req.headers.get('X-Client-Token') || '';
  return /^[0-9a-f]{32,64}$/.test(t) ? sha('dink-client|' + t) : null;
}

let ready = null;
function ensure(db) {
  if (!ready) ready = db.batch(SCHEMA.map(function (s) { return db.prepare(s); })).catch(function (e) { ready = null; throw e; });
  return ready;
}

function cleanName(v) {
  const s = Array.from(String(v == null ? '' : v)).filter(function (c) { return c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127; }).join('');
  const out = s.split(' ').filter(Boolean).join(' ');
  need(out.length >= 1 && out.length <= 20, 'Names must be 1 to 20 characters.');
  return out;
}

function distance(a, b) {
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}
/* A normal user may fix a typo or finish a name, not turn one person into another. */
function isSmallFix(from, to) {
  const a = from.toLowerCase(), b = to.toLowerCase();
  if (a === b) return true;
  if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
  const limit = Math.min(3, Math.floor(Math.max(a.length, b.length) / 2));
  return distance(a, b) <= limit;
}

async function rename(request, env, b) {
  const db = env.DB;
  const admin = await isAdmin(request, env);
  const me = await creatorOf(request);
  need(admin || me, 'Missing device token. Reload the page and try again.');
  const id = Number(b.id);
  need(Number.isInteger(id) && id > 0, 'Invalid player.');
  const name = cleanName(b.name), key = name.toLowerCase();
  const row = await db.prepare('SELECT id,name FROM players WHERE id=? AND deleted_at IS NULL').bind(id).first();
  need(row, 'Player not found.', 404, 'NOT_FOUND');
  if (row.name === name) return { ok: true, player: { id: id, name: name }, unchanged: true };
  const dup = await db.prepare('SELECT id FROM players WHERE name_key=? AND id<>?').bind(key, id).first();
  need(!dup, 'Another player already has that name.', 409, 'CONFLICT');
  const actor = admin ? 'admin' : 'u:' + me.slice(0, 12);
  if (!admin) {
    need(isSmallFix(row.name, name), 'That is a big change. Ask an administrator to rename this player.', 403, 'ADMIN_ONLY');
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor=? AND action='rename-player' AND ts>?").bind(actor, Date.now() - 3600000).first()).n;
    need(n < RENAMES_PER_HOUR, 'Too many name changes from this device in the last hour.', 429, 'RATE_LIMIT');
  }
  await db.batch([
    db.prepare('UPDATE players SET name=?, name_key=? WHERE id=?').bind(name, key, id),
    db.prepare('UPDATE game_players SET name=? WHERE player_id=?').bind(name, id),
    db.prepare('INSERT INTO audit(ts,actor,action,game_id,detail) VALUES(?,?,?,?,?)').bind(Date.now(), actor, 'rename-player', null, JSON.stringify({ id: id, from: row.name, to: name }))
  ]);
  return { ok: true, player: { id: id, name: name } };
}

export async function handlePlayers(request, env) {
  try {
    const url = new URL(request.url);
    need(env.DB, 'The database is not connected yet.', 503, 'NO_DB');
    await ensure(env.DB);
    need(request.method === 'POST', 'Method not allowed.', 405);
    need(request.headers.get('Origin') === url.origin, 'Cross-origin or missing-origin write rejected.', 403);
    need((request.headers.get('Content-Type') || '').startsWith('application/json'), 'JSON required.', 415);
    const text = await request.text();
    need(text.length <= 2000, 'Request too large.', 413);
    let b;
    try { b = text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, 'Invalid JSON.'); }
    need(b && typeof b === 'object', 'Invalid request.');
    return json(await rename(request, env, b));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.', code: 'SERVER_ERROR' }, 500);
  }
}
