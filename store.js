(function () {
  'use strict';
  var KEY = 'pickleball-data-v2';
  var OLD = 'pickleball-players-v1';
  var MIN = 4;
  var MAX = 20;
  var S = load();

  function blank() { return { nextId: 1, players: [], games: [], sits: {}, round: null }; }
  function pl(p) { return { id: +p.id, name: String(p.name || '?').slice(0, 20) }; }
  function uid() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function clean(d, keepRound) {
    var s = blank();
    if (!d || typeof d !== 'object') return s;
    var max = 0;
    (Array.isArray(d.players) ? d.players : []).forEach(function (p) {
      if (p && typeof p.name === 'string' && typeof p.id === 'number') {
        s.players.push({ id: p.id, name: p.name.slice(0, 20), here: p.here !== false });
        max = Math.max(max, p.id);
      }
    });
    (Array.isArray(d.games) ? d.games : []).forEach(function (g) {
      if (g && typeof g.id === 'string' && Array.isArray(g.a) && Array.isArray(g.b) && (g.winner === 'a' || g.winner === 'b')) {
        s.games.push({ id: g.id, ts: +g.ts || Date.now(), type: g.type === 'singles' ? 'singles' : 'doubles', a: g.a.map(pl), b: g.b.map(pl), winner: g.winner });
      }
    });
    if (d.sits && typeof d.sits === 'object') s.sits = d.sits;
    if (keepRound && d.round && Array.isArray(d.round.matches)) {
      s.round = {
        id: String(d.round.id),
        sitting: (d.round.sitting || []).map(pl),
        matches: d.round.matches.map(function (m) {
          return { id: String(m.id), type: m.type === 'singles' ? 'singles' : 'doubles', a: (m.a || []).map(pl), b: (m.b || []).map(pl), winner: m.winner === 'a' || m.winner === 'b' ? m.winner : null };
        })
      };
    }
    s.nextId = Math.max(+d.nextId || 1, max + 1);
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return clean(JSON.parse(raw), true);
      var old = JSON.parse(localStorage.getItem(OLD));
      if (Array.isArray(old)) return clean({ players: old }, false);
    } catch (e) {}
    return blank();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function here() { return S.players.filter(function (p) { return p.here; }); }
  function away() {
    return S.players.filter(function (p) { return !p.here; }).sort(function (x, y) { return x.name.localeCompare(y.name); });
  }
  function find(id) { return S.players.filter(function (p) { return p.id === id; })[0]; }

  function addPlayer(name) {
    name = String(name || '').trim().split(' ').filter(Boolean).join(' ');
    if (!name) return { ok: false, msg: 'Type a name first.' };
    var low = name.toLowerCase();
    var ex = S.players.filter(function (p) { return p.name.toLowerCase() === low; })[0];
    if (ex) {
      if (ex.here) return { ok: false, msg: ex.name + ' is already here.' };
      if (here().length >= MAX) return { ok: false, msg: 'Max ' + MAX + ' players today.' };
      ex.here = true; save();
      return { ok: true, msg: 'Welcome back, ' + ex.name + '.' };
    }
    if (S.players.length >= 100) return { ok: false, msg: 'Player list is full (100).' };
    if (here().length >= MAX) return { ok: false, msg: 'Max ' + MAX + ' players today.' };
    S.players.push({ id: S.nextId++, name: name, here: true });
    save();
    return { ok: true, msg: 'Added ' + name + '.' };
  }

  function setHere(id, val) {
    var p = find(id);
    if (!p) return { ok: false, msg: 'Player not found.' };
    if (val && !p.here && here().length >= MAX) return { ok: false, msg: 'Max ' + MAX + ' players today.' };
    p.here = !!val; save();
    return { ok: true, msg: '' };
  }

  function clearToday() { S.players.forEach(function (p) { p.here = false; }); save(); }

  function removePlayer(id) {
    S.players = S.players.filter(function (p) { return p.id !== id; });
    delete S.sits[id];
    save();
  }

  function buildRound() {
    var pool = shuffle(here().map(function (p) { return { id: p.id, name: p.name }; }));
    if (pool.length < MIN) return null;
    var sitting = [];
    if (pool.length % 2 === 1) {
      var min = Infinity;
      pool.forEach(function (p) { min = Math.min(min, S.sits[p.id] || 0); });
      var idx = 0;
      for (var i = 0; i < pool.length; i++) { if ((S.sits[pool[i].id] || 0) === min) { idx = i; break; } }
      var sitter = pool.splice(idx, 1)[0];
      S.sits[sitter.id] = (S.sits[sitter.id] || 0) + 1;
      sitting.push(sitter);
    }
    var matches = [];
    while (pool.length >= 4) {
      var f = pool.splice(0, 4);
      matches.push({ id: uid(), type: 'doubles', a: [f[0], f[1]], b: [f[2], f[3]], winner: null });
    }
    if (pool.length === 2) matches.push({ id: uid(), type: 'singles', a: [pool[0]], b: [pool[1]], winner: null });
    S.round = { id: uid(), matches: matches, sitting: sitting };
    save();
    return S.round;
  }

  function setWinner(matchId, side) {
    if (!S.round) return null;
    var m = S.round.matches.filter(function (x) { return x.id === matchId; })[0];
    if (!m) return null;
    var existing = S.games.filter(function (g) { return g.id === m.id; })[0];
    if (m.winner === side) {
      m.winner = null;
      S.games = S.games.filter(function (g) { return g.id !== m.id; });
    } else {
      m.winner = side;
      if (existing) { existing.winner = side; }
      else { S.games.push({ id: m.id, ts: Date.now(), type: m.type, a: m.a, b: m.b, winner: side }); }
    }
    save();
    return m;
  }

  function deleteGame(id) {
    S.games = S.games.filter(function (g) { return g.id !== id; });
    if (S.round) S.round.matches.forEach(function (m) { if (m.id === id) m.winner = null; });
    save();
  }

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

  function exportJSON() {
    return JSON.stringify({ app: 'pickleteams', version: 2, exported: new Date().toISOString(), nextId: S.nextId, players: S.players, games: S.games, sits: S.sits }, null, 2);
  }

  function importJSON(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, msg: 'That file is not valid JSON.' }; }
    if (!d || (!Array.isArray(d.players) && !Array.isArray(d.games))) return { ok: false, msg: 'This does not look like a PickleTeams backup.' };
    S = clean(d, false);
    save();
    return { ok: true, msg: 'Restored ' + S.players.length + ' players and ' + S.games.length + ' games.' };
  }

  function resetGames() { S.games = []; S.sits = {}; S.round = null; save(); }
  function resetAll() { S = blank(); save(); }
  function dropRound() { S.round = null; save(); }

  window.PB = { store: {
    MIN: MIN, MAX: MAX, state: function () { return S; },
    here: here, away: away, addPlayer: addPlayer, setHere: setHere, clearToday: clearToday, removePlayer: removePlayer,
    buildRound: buildRound, setWinner: setWinner, deleteGame: deleteGame, stats: stats,
    exportJSON: exportJSON, importJSON: importJSON, resetGames: resetGames, resetAll: resetAll, dropRound: dropRound
  } };
})();
