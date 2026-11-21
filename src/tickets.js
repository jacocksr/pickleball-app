const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' };
const KINDS = ['bug', 'idea', 'other'];
const LABEL = { bug: 'Bug', idea: 'Idea', other: 'Other' };
const PER_DEVICE_HOUR = 5;
const ALL_DEVICES_HOUR = 60;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('bug','idea','other')), message TEXT NOT NULL, contact TEXT, context TEXT, creator_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), resolved_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(creator_hash, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, ts)`
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

function clean(v, multi) {
  let s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  s = Array.from(s).filter(function (c) { const n = c.charCodeAt(0); return n === 10 || (n > 31 && n !== 127); }).join('');
  if (multi) return s.split('\n').map(function (l) { return l.trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.split(/\s+/).filter(Boolean).join(' ');
}
function cleanContext(c) {
  const out = {};
  if (c && typeof c === 'object') {
    ['tab', 'viewport', 'theme', 'ua'].forEach(function (k) {
      if (typeof c[k] === 'string') { const v = clean(c[k], false).slice(0, 200); if (v) out[k] = v; }
    });
  }
  return out;
}

async function sendAlert(env, t, origin) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return;
  const lines = [LABEL[t.kind] + ' report #' + t.id, '', t.message, '', 'Contact: ' + (t.contact || 'not given')];
  Object.keys(t.context).forEach(function (k) { lines.push(k + ': ' + t.context[k]); });
  lines.push('', 'Review it: ' + origin + '/#more');
  const body = {
    from: env.ALERT_FROM || 'DINK TEAMS <onboarding@resend.dev>',
    to: [env.ALERT_EMAIL],
    subject: '[DINK TEAMS] ' + LABEL[t.kind] + ': ' + t.message.replace(/\s+/g, ' ').slice(0, 60),
    text: lines.join('\n')
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.contact)) body.reply_to = t.contact;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) console.error('Alert email failed', r.status, await r.text());
  } catch (e) { console.error('Alert email error', e); }
}

async function createTicket(db, env, ctx, request, b, origin) {
  const me = await creatorOf(request);
  need(me, 'Missing device token. Reload the page and try again.');
  if (typeof b.website === 'string' && b.website.trim()) return { ok: true };
  need(KINDS.indexOf(b.kind) >= 0, 'Pick what kind of report this is.');
  const message = clean(b.message, true);
  need(Array.from(message).length >= 10, 'Please write at least 10 characters.');
  need(Array.from(message).length <= 1000, 'Please keep it under 1000 characters.');
  const contact = b.contact ? clean(b.contact, false) : '';
  need(Array.from(contact).length <= 100, 'Contact info must be 100 characters or fewer.');
  const context = cleanContext(b.context);
  const since = Date.now() - 3600000;
  const mine = (await db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE creator_hash=? AND ts>?').bind(me, since).first()).n;
  need(mine < PER_DEVICE_HOUR, 'You have sent several reports in the last hour. Please try again later.', 429, 'RATE_LIMIT');
  const all = (await db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE ts>?').bind(since).first()).n;
  need(all < ALL_DEVICES_HOUR, 'Too many reports right now. Please try again later.', 429, 'RATE_LIMIT');
  const ts = Date.now();
  const res = await db.prepare('INSERT INTO tickets(ts,kind,message,contact,context,creator_hash) VALUES(?,?,?,?,?,?)').bind(ts, b.kind, message, contact || null, JSON.stringify(context), me).run();
  const job = sendAlert(env, { id: res.meta.last_row_id, kind: b.kind, message: message, contact: contact, context: context }, origin);
  if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  return { ok: true };
}

async function listTickets(db) {
  const rows = (await db.prepare("SELECT id,ts,kind,message,contact,context,status,resolved_at FROM tickets ORDER BY (status='done'), ts DESC LIMIT 100").all()).results;
  const open = (await db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status='open'").first()).n;
  return {
    open: open,
    rows: rows.map(function (r) {
      let c = {};
      try { c = JSON.parse(r.context) || {}; } catch (e) {}
      return { id: r.id, ts: r.ts, kind: r.kind, message: r.message, contact: r.contact, context: c, status: r.status, resolvedAt: r.resolved_at };
    })
  };
}

export async function handleTickets(request, env, ctx) {
  try {
    const url = new URL(request.url), path = url.pathname;
    need(env.DB, 'The database is not connected yet.', 503, 'NO_DB');
    await ensure(env.DB);
    if (request.method === 'GET' && path === '/api/admin/tickets') {
      need(await isAdmin(request, env), 'Administrator sign-in required.', 401, 'ADMIN_ONLY');
      return json(await listTickets(env.DB));
    }
    need(request.method === 'POST', 'Method not allowed.', 405);
    need(request.headers.get('Origin') === url.origin, 'Cross-origin or missing-origin write rejected.', 403);
    need((request.headers.get('Content-Type') || '').startsWith('application/json'), 'JSON required.', 415);
    const text = await request.text();
    need(text.length <= 8000, 'Request too large.', 413);
    let b;
    try { b = text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, 'Invalid JSON.'); }
    need(b && typeof b === 'object', 'Invalid request.');
    if (path === '/api/tickets') return json(await createTicket(env.DB, env, ctx, request, b, url.origin));
    need(await isAdmin(request, env), 'Administrator sign-in required.', 401, 'ADMIN_ONLY');
    if (path === '/api/admin/tickets/resolve') {
      const id = Number(b.id);
      need(Number.isInteger(id) && id > 0, 'Invalid ticket.');
      need(b.status === 'done' || b.status === 'open', 'Invalid status.');
      const r = await env.DB.prepare('UPDATE tickets SET status=?, resolved_at=? WHERE id=?').bind(b.status, b.status === 'done' ? Date.now() : null, id).run();
      need(r.meta.changes > 0, 'Ticket not found.', 404, 'NOT_FOUND');
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.', code: 'SERVER_ERROR' }, 500);
  }
}
