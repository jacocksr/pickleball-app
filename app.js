(function () {
  'use strict';
  var P = window.PB.store;
  var TABS = ['players', 'stats', 'play', 'history', 'more'];
  var TIMES = String.fromCharCode(215);
  var TROPHY = String.fromCodePoint(0x1F3C6);
  var MEDALS = [0x1F947, 0x1F948, 0x1F949].map(function (c) { return String.fromCodePoint(c); });
  var statFilter = 'all';
  var seen = {};
  var current = 'play';
  var toastTimer;

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function names(list) { return list.map(function (p) { return p.name; }).join(' & '); }
  function count(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2200);
  }

  function status(el, msg, ok) {
    el.textContent = msg;
    el.className = 'status' + (msg ? (ok ? ' ok' : ' error') : '');
  }

  function shake(input) {
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
  }

  /* ---------- Play ---------- */
  function renderPlay() {
    var here = P.here();
    var n = here.length;
    var c = $('count');
    c.textContent = n + ' / ' + P.MAX;
    c.classList.toggle('full', n >= P.MAX);

    var list = $('chips');
    list.innerHTML = '';
    var next = {};
    here.forEach(function (p) {
      var li = h('li', 'chip' + (seen[p.id] ? '' : ' new'));
      li.appendChild(h('span', null, p.name));
      var b = h('button', null, TIMES);
      b.type = 'button';
      b.setAttribute('aria-label', 'Remove ' + p.name + ' from today');
      b.addEventListener('click', function () {
        li.classList.add('leaving');
        setTimeout(function () { P.setHere(p.id, false); renderPlay(); renderRoster(); }, 200);
      });
      li.appendChild(b);
      list.appendChild(li);
      next[p.id] = 1;
    });
    seen = next;
    $('empty').hidden = n > 0;
    $('clearToday').disabled = n === 0;

    var away = P.away();
    $('regWrap').hidden = away.length === 0;
    var regs = $('regulars');
    regs.innerHTML = '';
    away.forEach(function (p) {
      var b = h('button', 'reg', '+ ' + p.name);
      b.type = 'button';
      b.addEventListener('click', function () {
        var r = P.setHere(p.id, true);
        if (!r.ok) toast(r.msg, true);
        renderPlay(); renderRoster();
      });
      regs.appendChild(b);
    });
    var dl = $('awayList');
    dl.innerHTML = '';
    away.forEach(function (p) { var o = document.createElement('option'); o.value = p.name; dl.appendChild(o); });

    $('addBtn').disabled = n >= P.MAX;
    $('shuffle').disabled = n < P.MIN;
    var pv = $('preview');
    if (n < P.MIN) {
      pv.textContent = 'Add ' + count(P.MIN - n, 'more player', 'more players') + ' to start.';
    } else {
      var d = Math.floor(n / 4), left = n % 4, parts = [];
      if (d) parts.push(count(d, 'doubles match', 'doubles matches'));
      if (left >= 2) parts.push('1 singles match');
      if (left % 2) parts.push('1 sitting out');
      pv.textContent = parts.join(' \u00b7 ');
    }
  }

  function renderResults(animate) {
    var box = $('results');
    box.innerHTML = '';
    var r = P.state().round;
    if (!r) return;
    var dn = 0;
    r.matches.forEach(function (m, i) {
      var card = h('article', 'match' + (animate ? ' enter' : ''));
      if (animate) card.style.animationDelay = (i * 90) + 'ms';
      card.appendChild(h('h3', null, m.type === 'doubles' ? 'Doubles ' + (++dn) : 'Singles'));
      var sides = h('div', 'sides');
      ['a', 'b'].forEach(function (side, k) {
        var cls = 'side ' + side + (m.winner === side ? ' win' : '') + (m.winner && m.winner !== side ? ' lose' : '');
        var b = h('button', cls);
        b.type = 'button';
        b.setAttribute('aria-pressed', m.winner === side ? 'true' : 'false');
        b.setAttribute('aria-label', names(m[side]) + (m.winner === side ? ', winner. Tap to undo.' : '. Tap if they won.'));
        m[side].forEach(function (p) { b.appendChild(h('span', null, p.name)); });
        if (m.winner === side) b.appendChild(h('span', 'tag', TROPHY + ' Winner'));
        b.addEventListener('click', function () {
          var res = P.setWinner(m.id, side);
          toast(res && res.winner ? 'Win logged for ' + names(m[side]) : 'Result cleared');
          renderResults(false);
        });
        sides.appendChild(b);
        if (k === 0) sides.appendChild(h('div', 'vs', 'vs'));
      });
      card.appendChild(sides);
      box.appendChild(card);
    });
    if (r.sitting.length) {
      var c = h('article', 'match sitcard' + (animate ? ' enter' : ''));
      if (animate) c.style.animationDelay = (r.matches.length * 90) + 'ms';
      c.appendChild(h('h3', null, 'Sitting out'));
      c.appendChild(h('p', null, r.sitting[0].name + ' rests this round.'));
      box.appendChild(c);
    }
    if (r.matches.length) box.insertBefore(h('p', 'muted hint', 'Tap the winning side to log a result. Tap again to undo.'), box.firstChild);
  }

  /* ---------- Players ---------- */
  function renderRoster() {
    var all = {};
    P.stats('all').forEach(function (r) { all[r.id] = r; });
    var ul = $('roster');
    ul.innerHTML = '';
    var players = P.state().players.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('rosterEmpty').hidden = players.length > 0;
    players.forEach(function (p) {
      var li = h('li');
      var sw = h('label', 'switch');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = p.here;
      cb.setAttribute('aria-label', p.name + ' is here today');
      cb.addEventListener('change', function () {
        var r = P.setHere(p.id, cb.checked);
        if (!r.ok) { toast(r.msg, true); cb.checked = false; }
        renderPlay();
      });
      sw.appendChild(cb);
      sw.appendChild(h('span', 'slider'));
      li.appendChild(sw);
      var nm = h('div', 'rname', p.name);
      var rec = all[p.id];
      nm.appendChild(h('small', null, rec ? rec.w + ' W \u00b7 ' + rec.l + ' L' : 'No games yet'));
      li.appendChild(nm);
      var del = h('button', 'btn small ghost', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!window.confirm('Delete ' + p.name + '? Their past games stay in History.')) return;
        P.removePlayer(p.id);
        renderPlay(); renderRoster();
        toast(p.name + ' deleted');
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    var rows = P.stats(statFilter);
    var by = $('sortBy').value;
    rows.sort(function (a, b) {
      if (by === 'pct') return b.pct - a.pct || b.w - a.w || b.g - a.g;
      if (by === 'games') return b.g - a.g || b.w - a.w;
      return b.w - a.w || b.pct - a.pct || a.g - b.g;
    });
    var games = P.state().games.filter(function (g) { return statFilter === 'all' || g.type === statFilter; });
    $('tGames').textContent = games.length;
    $('tPlayers').textContent = rows.length;
    $('tLeader').textContent = rows.length ? rows[0].name : '-';

    var box = $('board');
    box.innerHTML = '';
    if (!rows.length) {
      box.appendChild(h('p', 'muted empty', 'No results yet. Log a winner on the Play tab.'));
      return;
    }
    var t = document.createElement('table');
    var hr = document.createElement('tr');
    ['#', 'Player', 'W', 'L', 'Win %', 'Streak'].forEach(function (x) { hr.appendChild(h('th', null, x)); });
    var thead = document.createElement('thead'); thead.appendChild(hr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r, i) {
      var tr = document.createElement('tr');
      tr.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
      tr.appendChild(h('td', null, MEDALS[i] && by !== 'games' ? MEDALS[i] : String(i + 1)));
      var nm = h('td', 'name', r.name);
      var bar = h('span', 'bar'); var fill = document.createElement('i'); fill.style.width = Math.round(r.pct * 100) + '%'; bar.appendChild(fill); nm.appendChild(bar);
      tr.appendChild(nm);
      tr.appendChild(h('td', null, String(r.w)));
      tr.appendChild(h('td', null, String(r.l)));
      tr.appendChild(h('td', null, Math.round(r.pct * 100) + '%'));
      var s = r.streak;
      tr.appendChild(h('td', s >= 3 ? 'hot' : (s <= -3 ? 'cold' : ''), s > 0 ? 'W' + s : 'L' + (-s)));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    box.appendChild(t);
  }

  /* ---------- History ---------- */
  function renderHistory() {
    var games = P.state().games.slice().sort(function (a, b) { return b.ts - a.ts; });
    var box = $('histList');
    box.innerHTML = '';
    $('histEmpty').hidden = games.length > 0;
    var lastDay = '';
    games.forEach(function (g) {
      var d = new Date(g.ts);
      var day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (day !== lastDay) { box.appendChild(h('div', 'day', day)); lastDay = day; }
      var win = g.winner, lose = win === 'a' ? 'b' : 'a';
      var row = h('div', 'game');
      var txt = h('div', 'txt');
      txt.appendChild(h('span', 'w', names(g[win])));
      txt.appendChild(document.createTextNode(' beat ' + names(g[lose])));
      txt.appendChild(h('small', null, (g.type === 'doubles' ? 'Doubles' : 'Singles') + ' \u00b7 ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
      row.appendChild(txt);
      var del = h('button', null, TIMES);
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete this game');
      del.addEventListener('click', function () {
        P.deleteGame(g.id);
        renderHistory(); renderStats(); renderRoster(); renderResults(false);
        toast('Game deleted');
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function renderAll() { renderPlay(); renderRoster(); renderStats(); renderHistory(); }

  /* ---------- Router and dock ---------- */
  var dock = document.querySelector('.dock');
  var ind = $('dockInd');
  function moveInd(animate) {
    var a = dock.querySelector('[aria-current=page]');
    if (!a) return;
    var d = dock.getBoundingClientRect(), r = a.getBoundingClientRect();
    ind.style.width = r.width + 'px';
    ind.style.height = r.height + 'px';
    ind.style.transform = 'translate(' + (r.left - d.left) + 'px,' + (r.top - d.top) + 'px)';
    ind.classList.add('on');
    ind.classList.toggle('anim', !!animate);
  }

  function show(tab, animate) {
    if (TABS.indexOf(tab) < 0) tab = 'play';
    current = tab;
    TABS.forEach(function (t) { $('view-' + t).hidden = t !== tab; });
    Array.prototype.forEach.call(dock.querySelectorAll('a'), function (a) {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (tab === 'stats') renderStats();
    if (tab === 'history') renderHistory();
    if (tab === 'players') renderRoster();
    moveInd(animate);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', function () { show(location.hash.slice(1), true); });
  window.addEventListener('resize', function () { moveInd(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveInd(false); });

  /* ---------- Settings ---------- */
  var gear = $('gear'), pop = $('settings');
  function setPop(open) { pop.hidden = !open; gear.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  gear.addEventListener('click', function (e) { e.stopPropagation(); setPop(pop.hidden); });
  document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setPop(false); });
  function markTheme() {
    Array.prototype.forEach.call(pop.querySelectorAll('[data-theme-choice]'), function (b) {
      b.classList.toggle('on', b.dataset.themeChoice === window.PickleTheme.get());
    });
  }
  Array.prototype.forEach.call(pop.querySelectorAll('[data-theme-choice]'), function (b) {
    b.addEventListener('click', function () { window.PickleTheme.set(b.dataset.themeChoice); markTheme(); });
  });
  markTheme();

  /* ---------- Events ---------- */
  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('nameInput');
    var r = P.addPlayer(inp.value);
    status($('msg'), r.msg, r.ok);
    if (r.ok) { inp.value = ''; } else { shake(inp); }
    renderPlay(); renderRoster();
    inp.focus();
  });

  $('pForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('pName');
    var r = P.addPlayer(inp.value);
    status($('pMsg'), r.msg, r.ok);
    if (r.ok) { inp.value = ''; } else { shake(inp); }
    renderPlay(); renderRoster();
  });

  $('clearToday').addEventListener('click', function () {
    P.clearToday();
    status($('msg'), '', true);
    renderPlay(); renderRoster();
  });

  $('shuffle').addEventListener('click', function () {
    var b = $('shuffle');
    var round = P.buildRound();
    if (!round) return;
    b.classList.remove('spin');
    void b.offsetWidth;
    b.classList.add('spin');
    $('shuffleLbl').textContent = 'Shuffle again';
    renderResults(true);
    var first = $('results').firstChild;
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('statSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    statFilter = b.dataset.f;
    Array.prototype.forEach.call($('statSeg').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
    renderStats();
  });
  $('sortBy').addEventListener('change', renderStats);

  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([P.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pickleteams-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    status($('dataMsg'), 'Backup downloaded.', true);
  });
  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      if (!window.confirm('Replace everything on this device with this backup?')) return;
      var r = P.importJSON(String(rd.result));
      status($('dataMsg'), r.msg, r.ok);
      if (r.ok) { seen = {}; $('shuffleLbl').textContent = 'Shuffle teams'; renderAll(); renderResults(false); }
    };
    rd.readAsText(f);
    e.target.value = '';
  });
  $('resetStats').addEventListener('click', function () {
    if (!window.confirm('Clear all logged games and sit-out counts? Players are kept.')) return;
    P.resetGames();
    renderAll(); renderResults(false);
    toast('Game history cleared');
  });
  $('resetAll').addEventListener('click', function () {
    if (!window.confirm('Erase all players and games on this device?')) return;
    P.resetAll();
    seen = {};
    $('shuffleLbl').textContent = 'Shuffle teams';
    renderAll(); renderResults(false);
    toast('Everything erased');
  });

  /* ---------- Start ---------- */
  renderAll();
  renderResults(false);
  if (P.state().round) $('shuffleLbl').textContent = 'Shuffle again';
  var start = location.hash.slice(1);
  show(TABS.indexOf(start) >= 0 ? start : 'play', false);
})();
