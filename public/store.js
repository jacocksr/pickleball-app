(function () {
  'use strict';
  var KEY = 'pickleball-data-v3';
  var OLD = 'pickleball-data-v2';
  var MIN = 3;
  var MAX_COURTS = 12;
  var failing = false;

  function rid(n) {
    var a = new Uint8Array(n), i;
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function blank() {
    return { token: rid(24), here: {}, sits: {}, streak: {}, rank: {}, snap: null, courts: 0, round: null, players: [], games: [], admin: null, adminOn: false, editId: null, windowMin: 120 };
  }

  function load() {
    var s = blank();
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object') {
        if (/^[0-9a-f]{32,64}$/.test(d.token || '')) s.token = d.token;
        s.here = d.here || {};
        s.sits = d.sits || {};
        s.streak = d.streak || {};
        s.rank = d.rank || {};
        s.snap = d.snap || null;
        s.courts = d.courts >= 0 && d.courts <= MAX_COURTS ? Math.floor(d.courts) : 0;
        s.round = d.round || null;
        if (s.round && !s.round.waiting) s.round.waiting = s.round.sitting || [];
        if (s.round && !(s.round.courts >= 0)) s.round.courts = 0;
        s.players = Array.isArray(d.players) ? d.players : [];
        s.games = Array.isArray(d.games) ? d.games : [];
        s.admin = d.admin && d.admin.expires > Date.now() ? d.admin : null;
      }
    } catch (e) {}
    return s;
  }

  var S = load();
  applyHere();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ token: S.token, here: S.here, sits: S.sits, streak: S.streak, rank: S.rank, snap: S.snap, courts: S.courts, round: S.round, players: S.players, games: S.games, admin: S.admin }));
    } catch (e) {}
  }

  function applyHere() { S.players.forEach(function (p) { p.here = !!S.here[p.id]; }); }
  function byName(a, b) { return a.name.localeCompare(b.name); }
  function ids(list) { return list.map(function (p) { return p.id; }); }
  function fail(e) { return { ok: false, msg: e && e.message ? e.message : 'Something went wrong.' }; }
  function copy(o) { var r = {}; Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; }); return r; }

  /* ---------- Server calls ---------- */
  function api(path, body) {
    var opts = { headers: { 'X-Client-Token': S.token }, cache: 'no-store' };
    if (S.admin) opts.headers.Authorization = 'Bearer ' + S.admin.token;
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Request failed (' + r.status + ').');
          e.code = j.code; e.status = r.status;
          throw e;
        }
        return j;
      });
    }).catch(function (e) {
      if (e && e.status) throw e;
      var n = new Error("Can't reach the server. Check your connection and try again.");
      n.network = true;
      throw n;
    });
  }

  function reconcile() {
    if (!S.round) return;
    var byId = {};
    S.games.forEach(function (g) { byId[g.id] = g; });
    S.round.matches.forEach(function (m) { m.winner = byId[m.id] ? byId[m.id].winner : null; });
  }

  function refresh() {
    return api('/api/data').then(function (d) {
      var live = {};
      S.players = d.players.map(function (p) { live[p.id] = 1; return { id: p.id, name: p.name, here: !!S.here[p.id] }; });
      Object.keys(S.here).forEach(function (k) { if (!live[k]) delete S.here[k]; });
      S.games = d.games;
      S.editId = d.canEdit || null;
      S.windowMin = d.editWindowMinutes || 120;
      S.adminOn = !!d.admin;
      if (S.admin && !d.admin) S.admin = null;
      reconcile();
      save();
      failing = false;
      return { ok: true };
    }).catch(function (e) {
      var first = !failing;
      failing = true;
      return { ok: false, first: first, msg: e.message };
    });
  }

  function sig() {
    return S.players.map(function (p) { return p.id + ':' + p.name; }).join(',') + '|' + S.games.map(function (g) { return g.id + g.winner; }).join(',') + '|' + S.adminOn + '|' + S.editId;
  }

  /* ---------- Today's lineup (stays on this device) ---------- */
  function here() { return S.players.filter(function (p) { return p.here; }); }
  function away() { return S.players.filter(function (p) { return !p.here; }).sort(byName); }
  function setHere(id, val) {
    if (val) S.here[id] = true; else delete S.here[id];
    applyHere(); save();
    return { ok: true, msg: '' };
  }
  function clearWaits() { S.sits = {}; S.streak = {}; S.rank = {}; S.snap = null; }
  function clearToday() { S.here = {}; clearWaits(); applyHere(); save(); }
  function resetLocal() { S.here = {}; S.round = null; clearWaits(); applyHere(); save(); }

  function addPlayer(name) {
    name = String(name || '').trim().split(' ').filter(Boolean).join(' ');
    if (!name) return Promise.resolve({ ok: false, msg: 'Type a name first.' });
    var low = name.toLowerCase();
    var ex = S.players.filter(function (p) { return p.name.toLowerCase() === low; })[0];
    if (ex) {
      if (ex.here) return Promise.resolve({ ok: false, msg: ex.name + ' is already here.' });
      setHere(ex.id, true);
      return Promise.resolve({ ok: true, msg: 'Welcome back, ' + ex.name + '.' });
    }
    return api('/api/players', { name: name }).then(function (r) {
      var p = r.player;
      if (!S.players.some(function (x) { return x.id === p.id; })) S.players.push({ id: p.id, name: p.name, here: false });
      S.players.sort(byName);
      S.here[p.id] = true;
      applyHere(); save();
      return { ok: true, msg: 'Added ' + p.name + '.' };
    }).catch(fail);
  }

  function removePlayer(id) {
    return api('/api/admin/player/delete', { id: id }).then(function () { return refresh(); }).then(function () { return { ok: true }; }).catch(fail);
  }

  /* ---------- Courts and shuffle ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function courts() { return S.courts; }
  function setCourts(n) {
    n = Math.round(Number(n));
    if (!(n >= 0)) n = 0;
    if (n > MAX_COURTS) n = MAX_COURTS;
    S.courts = n;
    save();
    return n;
  }

  /* How many play, given the head count and the courts. 0 courts means no limit. */
  function plan(n, c) {
    var cap = c > 0 ? c * 4 : Infinity;
    var p = n > cap ? cap : n - (n % 2);
    return { play: p, doubles: Math.floor(p / 4), singles: p % 4 >= 2 ? 1 : 0, waiting: n - p };
  }

  /* Who plays first: longest wait in a row, then most waits today, then place in line, then luck. */
  function order(list) {
    var keyed = shuffle(list).map(function (p, i) { return { p: p, i: i }; });
    keyed.sort(function (a, b) {
      var sa = S.streak[a.p.id] || 0, sb = S.streak[b.p.id] || 0;
      if (sa !== sb) return sb - sa;
      var ta = S.sits[a.p.id] || 0, tb = S.sits[b.p.id] || 0;
      if (ta !== tb) return tb - ta;
      var ra = S.rank[a.p.id] == null ? Infinity : S.rank[a.p.id];
      var rb = S.rank[b.p.id] == null ? Infinity : S.rank[b.p.id];
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a.i - b.i;
    });
    return keyed.map(function (k) { return k.p; });
  }

  function deal(playing) {
    var pool = shuffle(playing), matches = [], f;
    while (pool.length >= 4) {
      f = pool.splice(0, 4);
      matches.push({ id: rid(12), type: 'doubles', a: [f[0], f[1]], b: [f[2], f[3]], winner: null });
    }
    if (pool.length === 2) matches.push({ id: rid(12), type: 'singles', a: [pool[0]], b: [pool[1]], winner: null });
    return matches;
  }

  function nextRound() {
    var all = here().map(function (p) { return { id: p.id, name: p.name }; });
    if (all.length < MIN) return null;
    S.snap = { sits: copy(S.sits), streak: copy(S.streak), rank: copy(S.rank) };
    var pl = plan(all.length, S.courts);
    var sorted = order(all);
    var playing = sorted.slice(0, pl.play);
    var waiting = sorted.slice(pl.play);
    playing.forEach(function (p) { S.streak[p.id] = 0; delete S.rank[p.id]; });
    waiting.forEach(function (p) {
      S.sits[p.id] = (S.sits[p.id] || 0) + 1;
      S.streak[p.id] = (S.streak[p.id] || 0) + 1;
    });
    waiting = order(waiting);
    waiting.forEach(function (p, i) { S.rank[p.id] = i; });
    S.round = { id: rid(12), courts: S.courts, matches: deal(playing), waiting: waiting };
    save();
    return S.round;
  }

  function hasResults() {
    return !!(S.round && S.round.matches.some(function (m) { return m.winner; }));
  }

  /* Plan this round again from the counts as they stood before it. Anyone who has to play still plays,
     and the rest of the waiting spots are drawn fresh, so nobody is passed over unfairly. */
  function redeal() {
    var r = S.round;
    if (!r || hasResults()) return nextRound();
    if (S.snap) {
      S.sits = copy(S.snap.sits); S.streak = copy(S.snap.streak); S.rank = copy(S.snap.rank);
      return nextRound();
    }
    var playing = [];
    r.matches.forEach(function (m) { m.a.concat(m.b).forEach(function (p) { playing.push(p); }); });
    r.matches = deal(playing);
    r.edited = false;
    save();
    return r;
  }

  /* ---------- Manual changes ---------- */
  function locate(id) {
    var r = S.round, i, j, s, k, sides = ['a', 'b'];
    if (!r) return null;
    for (i = 0; i < r.matches.length; i++) {
      for (s = 0; s < 2; s++) {
        var list = r.matches[i][sides[s]];
        for (j = 0; j < list.length; j++) {
          if (list[j].id === id) return { list: list, idx: j, m: r.matches[i], wait: false };
        }
      }
    }
    for (k = 0; k < r.waiting.length; k++) {
      if (r.waiting[k].id === id) return { list: r.waiting, idx: k, m: null, wait: true };
    }
    return null;
  }

  /* Swap two players in the current round. Moving someone on or off court keeps the wait counts fair. */
  function swap(aId, bId) {
    var a = locate(aId), b = locate(bId);
    if (!a || !b) return { ok: false, msg: 'That player is not in this round.' };
    if ((a.m && a.m.winner) || (b.m && b.m.winner)) return { ok: false, msg: 'That match already has a result.' };
    var pa = a.list[a.idx], pb = b.list[b.idx];
    a.list[a.idx] = pb;
    b.list[b.idx] = pa;
    if (a.wait !== b.wait) {
      var on = a.wait ? pa : pb, off = a.wait ? pb : pa, sn = S.snap;
      S.sits[on.id] = sn ? (sn.sits[on.id] || 0) : Math.max(0, (S.sits[on.id] || 1) - 1);
      S.streak[on.id] = 0;
      delete S.rank[on.id];
      S.sits[off.id] = (sn ? (sn.sits[off.id] || 0) : (S.sits[off.id] || 0)) + 1;
      S.streak[off.id] = (sn ? (sn.streak[off.id] || 0) : (S.streak[off.id] || 0)) + 1;
    }
    S.round.waiting.forEach(function (p, i) { S.rank[p.id] = i; });
    S.round.edited = true;
    save();
    return { ok: true, msg: '' };
  }

  /* ---------- Games (shared) ---------- */
  function replaceGame(g) {
    if (!g) return;
    S.games = S.games.filter(function (x) { return x.id !== g.id; });
    S.games.unshift(g);
  }

  function setWinner(matchId, side) {
    var m = S.round && S.round.matches.filter(function (x) { return x.id === matchId; })[0];
    if (!m) return Promise.resolve({ ok: false, msg: 'Match not found.' });
    var req;
    if (m.winner === side) {
      req = api('/api/games/delete', { id: m.id }).then(function () {
        S.games = S.games.filter(function (g) { return g.id !== m.id; });
        m.winner = null;
      });
    } else if (m.winner) {
      req = api('/api/games/update', { id: m.id, winner: side }).then(function (r) { replaceGame(r.game); m.winner = side; });
    } else {
      req = api('/api/games', { id: m.id, a: ids(m.a), b: ids(m.b), winner: side }).then(function (r) {
        replaceGame(r.game);
        if (r.canEdit) S.editId = r.canEdit;
        m.winner = side;
      });
    }
    return req.then(function () { save(); return refresh(); }).then(function () { return { ok: true, winner: m.winner }; }).catch(fail);
  }

  function deleteGame(id) {
    return api('/api/games/delete', { id: id }).then(function () { return refresh(); }).then(function () { return { ok: true }; }).catch(fail);
  }
  function flipGame(id) {
    var g = S.games.filter(function (x) { return x.id === id; })[0];
    if (!g) return Promise.resolve({ ok: false, msg: 'Game not found.' });
    return api('/api/games/update', { id: id, winner: g.winner === 'a' ? 'b' : 'a' }).then(function () { return refresh(); }).then(function () { return { ok: true }; }).catch(fail);
  }
  function canEdit(id) { return S.adminOn || S.editId === id; }

  /* ---------- Stats ---------- */
  function stats(filter) {
    var map = {};
    var games = S.games.slice().sort(function (x, y) { return x.ts - y.ts; });
    games.forEach(function (g) {
      if (filter && filter !== 'all' && g.type !== filter) return;
      ['a', 'b'].forEach(function (side) {
        var won = g.winner === side;
        g[side].forEach(function (p) {
          var r = map[p.id] || (map[p.id] = { id: p.id, name: p.name, w: 0, l: 0, streak: 0 });
          if (won) { r.w++; r.streak = r.streak > 0 ? r.streak + 1 : 1; }
          else { r.l++; r.streak = r.streak < 0 ? r.streak - 1 : -1; }
        });
      });
    });
    var cur = {};
    S.players.forEach(function (p) { cur[p.id] = p.name; });
    return Object.keys(map).map(function (k) {
      var r = map[k];
      if (cur[r.id]) r.name = cur[r.id];
      r.g = r.w + r.l;
      r.pct = r.g ? r.w / r.g : 0;
      return r;
    });
  }

  /* ---------- Administrator ---------- */
  function adminLogin(pw) {
    return api('/api/admin/login', { password: pw }).then(function (r) {
      S.admin = { token: r.token, expires: r.expires };
      S.adminOn = true;
      save();
      return refresh();
    }).then(function () { return { ok: true }; }).catch(fail);
  }
  function adminLogout() { S.admin = null; S.adminOn = false; save(); return refresh(); }

  function sendImport(d) {
    return api('/api/admin/import', { players: d.players || [], games: d.games || [] }).then(function (r) {
      return refresh().then(function () {
        return { ok: true, msg: 'Added ' + r.added + ' games and ' + r.players + ' players (' + r.skipped + ' skipped).' };
      });
    }).catch(fail);
  }
  function importBackup(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return Promise.resolve({ ok: false, msg: 'That file is not valid JSON.' }); }
    if (!d || (!Array.isArray(d.players) && !Array.isArray(d.games))) return Promise.resolve({ ok: false, msg: 'This does not look like a backup from this app.' });
    return sendImport(d);
  }
  function importLocalOld() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(OLD)); } catch (e) {}
    if (!d || !Array.isArray(d.games) || !d.games.length) return Promise.resolve({ ok: false, msg: 'No saved games from the old version were found on this device.' });
    return sendImport(d);
  }
  function exportJSON() {
    return JSON.stringify({ app: 'dink-teams', version: 3, exported: new Date().toISOString(), players: S.players.map(function (p) { return { id: p.id, name: p.name }; }), games: S.games }, null, 2);
  }

  window.PB = { store: {
    MIN: MIN, MAX_COURTS: MAX_COURTS, state: function () { return S; }, sig: sig, refresh: refresh,
    here: here, away: away, addPlayer: addPlayer, setHere: setHere, clearToday: clearToday, removePlayer: removePlayer, resetLocal: resetLocal,
    courts: courts, setCourts: setCourts, plan: plan, nextRound: nextRound, redeal: redeal, swap: swap, hasResults: hasResults, buildRound: nextRound,
    setWinner: setWinner, deleteGame: deleteGame, flipGame: flipGame, canEdit: canEdit, stats: stats,
    isAdmin: function () { return S.adminOn; }, editMinutes: function () { return S.windowMin; },
    adminLogin: adminLogin, adminLogout: adminLogout, importBackup: importBackup, importLocalOld: importLocalOld, exportJSON: exportJSON
  } };
})();
