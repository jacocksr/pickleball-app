(function () {
  'use strict';
  var P = window.PB.store;
  var TABS = ['players', 'stats', 'play', 'history', 'more'];
  var TIMES = String.fromCharCode(215);
  var FLIP = String.fromCharCode(0x21C4);
  var TROPHY = String.fromCodePoint(0x1F3C6);
  var MEDALS = [0x1F947, 0x1F948, 0x1F949].map(function (c) { return String.fromCodePoint(c); });
  var statFilter = 'all';
  var seen = {};
  var current = 'play';
  var toastTimer;
  var busy = false;
  var lastSig = '';
  var editing = false;
  var picked = null;
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function names(list) { return list.map(function (p) { return p.name; }).join(' & '); }
  function count(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- Ball bounce ---------- */
  function fold(a, L) {
    var m = ((a % (2 * L)) + 2 * L) % (2 * L);
    return m <= L ? m : 2 * L - m;
  }

  /* A closed path that leaves the rest point, bounces off the walls of a box with true reflections,
     and arrives back at the rest point. Built by unfolding the box into a straight line.
     Top and bottom walls always get more hits than left and right. */
  function loop(shape, x, y) {
    var W = shape.x1 - shape.x0, H = shape.y1 - shape.y0;
    var u = Math.min(Math.max(x - shape.x0, 0), W), v = Math.min(Math.max(y - shape.y0, 0), H);
    var an = Math.random() < 0.1 ? 4 : 2;
    var ni = an * (Math.random() < 0.5 ? -1 : 1);
    var nj = (an + 2 + 2 * Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1);
    var ts = [], m, k;
    for (m = 0; m < Math.abs(ni); m++) {
      k = ni > 0 ? m + 1 : -m;
      ts.push((k * W - u) / (ni * W));
    }
    for (m = 0; m < Math.abs(nj); m++) {
      k = nj > 0 ? m + 1 : -m;
      ts.push((k * H - v) / (nj * H));
    }
    ts.sort(function (a, b) { return a - b; });
    var pts = [{ x: x, y: y }];
    ts.forEach(function (t) {
      if (t <= 0 || t >= 1) return;
      pts.push({
        x: shape.x0 + fold(u + t * ni * W, W),
        y: shape.y0 + fold(v + t * nj * H, H)
      });
    });
    pts.push({ x: x, y: y });
    return pts;
  }

  /* Plays one random bounce inside the host element, then the ball glides back to rest. */
  function launch(host, mode) {
    if (!host || !host.animate || (calm && calm.matches)) return;
    var icon = host.querySelector('.ico');
    if (!icon) return;
    if (icon._ball) icon._ball.cancel();
    var ir = icon.getBoundingClientRect(), hr = host.getBoundingClientRect();
    var x = ir.left + ir.width / 2, y = ir.top + ir.height / 2;
    var dockMode = mode === 'dock';
    var pts, ballR, v0, minMs;
    if (dockMode) {
      /* Round button: run the same box bounce on a unit square, then bend the square into the circle
         so every wall hit lands on the rim and the ball still ends exactly at the center. */
      var R = hr.width / 2 - 16;
      var flip = Math.random() < 0.5;
      pts = loop({ x0: -1, x1: 1, y0: -1, y1: 1 }, 0, 0).map(function (p) {
        var sx = flip ? p.y : p.x, sy = flip ? p.x : p.y;
        return {
          x: x + sx * Math.sqrt(1 - sy * sy / 2) * R,
          y: y + sy * Math.sqrt(1 - sx * sx / 2) * R
        };
      });
      ballR = 11; v0 = 0.42 + Math.random() * 0.08; minMs = 400;
    } else {
      var m = 12;
      pts = loop({ x0: hr.left + m, x1: hr.right - m, y0: hr.top + m, y1: hr.bottom - m }, x, y);
      ballR = 9; v0 = 0.8 + Math.random() * 0.2; minMs = 700;
    }
    var cum = [0], total = 0, i;
    for (i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      cum.push(total);
    }
    if (total < 1) return;
    var turns = Math.min(3, Math.max(1, Math.round(total / (2 * Math.PI * ballR) * 0.7))) * (Math.random() < 0.5 ? -1 : 1);
    var lastSeg = pts.length - 2;
    var tcum = [0], T = 0;
    /* Each bounce costs the ball some speed, and the last leg is a long ease-out glide home. */
    for (i = 0; i <= lastSeg; i++) {
      var seg = cum[i + 1] - cum[i];
      T += (i === lastSeg ? 1.7 : 1) * seg / (v0 * Math.pow(0.94, i));
      tcum.push(T);
    }
    var frames = pts.map(function (p, k) {
      return {
        transform: 'translate(' + (p.x - x).toFixed(1) + 'px,' + (p.y - y).toFixed(1) + 'px) rotate(' + (turns * 360 * cum[k] / total).toFixed(1) + 'deg)',
        offset: tcum[k] / T,
        easing: 'linear'
      };
    });
    frames[lastSeg].easing = 'ease-out';
    icon._ball = icon.animate(frames, { duration: Math.min(1700, Math.max(minMs, T)), fill: 'none' });
  }

  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
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
    $('count').textContent = count(n, 'player', 'players');
    renderCourts();

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

    $('shuffle').disabled = n < P.MIN;
    var pv = $('preview');
    if (n < P.MIN) {
      pv.textContent = 'Add ' + count(P.MIN - n, 'more player', 'more players') + ' to start.';
    } else {
      var pl = P.plan(n, P.courts()), parts = [];
      if (pl.doubles) parts.push(count(pl.doubles, 'doubles match', 'doubles matches'));
      if (pl.singles) parts.push('1 singles match');
      if (pl.waiting) parts.push(pl.waiting + ' waiting');
      pv.textContent = parts.join(' \u00b7 ');
    }
  }

  /* ---------- Courts and rounds ---------- */
  function buildCourts() {
    var box = h('div', 'courts row');
    box.appendChild(h('span', 'muted', 'Courts available'));
    var down = h('button', 'btn small', '\u2212');
    down.type = 'button';
    down.id = 'courtsDown';
    down.setAttribute('aria-label', 'Fewer courts');
    var val = h('span', 'pill');
    val.id = 'courtsVal';
    val.setAttribute('aria-live', 'polite');
    var up = h('button', 'btn small', '+');
    up.type = 'button';
    up.id = 'courtsUp';
    up.setAttribute('aria-label', 'More courts');
    down.addEventListener('click', function () { P.setCourts(P.courts() - 1); renderPlay(); });
    up.addEventListener('click', function () { P.setCourts(P.courts() + 1); renderPlay(); });
    box.appendChild(down);
    box.appendChild(val);
    box.appendChild(up);
    var pv = $('preview');
    pv.parentNode.insertBefore(box, pv);
  }

  function renderCourts() {
    var c = P.courts();
    $('courtsVal').textContent = c ? count(c, 'court', 'courts') : 'No limit';
    $('courtsDown').disabled = c <= 0;
    $('courtsUp').disabled = c >= P.MAX_COURTS;
  }

  function buildSkip() {
    var b = h('button', 'btn small ghost', 'Next round');
    b.type = 'button';
    b.id = 'skipRound';
    b.style.display = 'none';
    b.setAttribute('aria-label', 'Skip ahead to the next round and bring in the players who are waiting');
    b.addEventListener('click', function () { runRound('next'); });
    $('shuffle').parentNode.appendChild(b);
    var e = h('button', 'btn small ghost', 'Edit teams');
    e.type = 'button';
    e.id = 'editTeams';
    e.style.display = 'none';
    e.addEventListener('click', function () {
      editing = !editing;
      picked = null;
      renderResults(false);
    });
    $('shuffle').parentNode.appendChild(e);
  }

  function updateShuffleUi() {
    var r = P.state().round;
    var can = !!r && !P.hasResults();
    var lbl = 'Shuffle teams';
    if (r) lbl = P.hasResults() ? 'Next round' : 'Re-deal teams';
    $('shuffleLbl').textContent = lbl;
    $('skipRound').style.display = can && r.waiting.length > 0 ? '' : 'none';
    var eb = $('editTeams');
    eb.style.display = can ? '' : 'none';
    eb.textContent = editing ? 'Done editing' : 'Edit teams';
  }

  function runRound(kind) {
    var r = P.state().round;
    if (kind === 'redeal' && r && r.edited && !window.confirm('Re-deal will replace the changes you made by hand. Continue?')) return;
    var round = kind === 'redeal' ? P.redeal() : P.nextRound();
    if (!round) return;
    editing = false;
    picked = null;
    launch($('shuffle'), 'pill');
    renderResults(true);
    var first = $('results').firstChild;
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function matchTitle(r, m, i, dn) {
    var kind = m.type === 'doubles' ? 'Doubles' : 'Singles';
    if (r.courts > 0) return 'Court ' + (i + 1) + ' \u00b7 ' + kind;
    return m.type === 'doubles' ? 'Doubles ' + dn : 'Singles';
  }

  function pickBtn(p) {
    var on = picked === p.id;
    var b = h('button', 'btn small ' + (on ? 'primary' : 'ghost'), p.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.addEventListener('click', function () {
      if (!picked) { picked = p.id; }
      else if (picked === p.id) { picked = null; }
      else {
        var res = P.swap(picked, p.id);
        picked = null;
        if (!res.ok) toast(res.msg, true);
        else toast('Players swapped');
      }
      renderResults(false);
    });
    return b;
  }

  function renderEdit() {
    var box = $('results');
    box.innerHTML = '';
    var r = P.state().round;
    if (!r) return;
    box.appendChild(h('p', 'muted hint', picked ? 'Now tap the player to swap with.' : 'Tap one player, then tap another to swap them. Waiting players can swap onto a court. Tap Done editing when finished.'));
    var dn = 0;
    r.matches.forEach(function (m, i) {
      if (m.type === 'doubles') dn++;
      var card = h('article', 'match');
      card.appendChild(h('h3', null, matchTitle(r, m, i, dn)));
      var sides = h('div', 'sides');
      ['a', 'b'].forEach(function (side, k) {
        var col = h('div', 'side ' + side);
        m[side].forEach(function (p) { col.appendChild(pickBtn(p)); });
        sides.appendChild(col);
        if (k === 0) sides.appendChild(h('div', 'vs', 'vs'));
      });
      card.appendChild(sides);
      box.appendChild(card);
    });
    if (r.waiting.length) {
      var c = h('article', 'match sitcard');
      c.appendChild(h('h3', null, 'Waiting'));
      var row = h('div', 'row');
      r.waiting.forEach(function (p) { row.appendChild(pickBtn(p)); });
      c.appendChild(row);
      box.appendChild(c);
    }
  }

  function renderResults(animate) {
    if (editing && (!P.state().round || P.hasResults())) { editing = false; picked = null; }
    updateShuffleUi();
    if (editing) { renderEdit(); return; }
    var box = $('results');
    box.innerHTML = '';
    var r = P.state().round;
    if (!r) return;
    var dn = 0;
    r.matches.forEach(function (m, i) {
      var card = h('article', 'match' + (animate ? ' enter' : ''));
      if (animate) card.style.animationDelay = Math.min(i, 12) * 90 + 'ms';
      if (m.type === 'doubles') dn++;
      card.appendChild(h('h3', null, matchTitle(r, m, i, dn)));
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
          if (busy) return;
          busy = true;
          P.setWinner(m.id, side).then(function (res) {
            busy = false;
            if (!res.ok) { toast(res.msg, true); return; }
            toast(res.winner ? 'Win logged for ' + names(m[side]) : 'Result cleared');
            renderResults(false); renderStats(); renderHistory();
          });
        });
        sides.appendChild(b);
        if (k === 0) sides.appendChild(h('div', 'vs', 'vs'));
      });
      card.appendChild(sides);
      box.appendChild(card);
    });
    if (r.waiting.length) {
      var c = h('article', 'match sitcard' + (animate ? ' enter' : ''));
      if (animate) c.style.animationDelay = Math.min(r.matches.length, 12) * 90 + 'ms';
      var one = r.waiting.length === 1;
      c.appendChild(h('h3', null, r.courts > 0 ? 'Waiting' : 'Sitting out'));
      if (one) c.appendChild(h('p', null, r.waiting[0].name + (r.courts > 0 ? ' waits this round and plays next.' : ' rests this round.')));
      else c.appendChild(h('p', null, 'In line, first up first: ' + r.waiting.map(function (p) { return p.name; }).join(', ') + '.'));
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
      if (P.isAdmin()) {
        var del = h('button', 'btn small ghost', 'Delete');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!window.confirm('Delete ' + p.name + ' from the shared list? Their past games stay in History.')) return;
          P.removePlayer(p.id).then(function (res) {
            if (!res.ok) { toast(res.msg, true); return; }
            renderAll();
            toast(p.name + ' deleted');
          });
        });
        li.appendChild(del);
      }
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
    $('histHint').textContent = P.isAdmin()
      ? 'Administrator mode: you can switch or delete any result.'
      : 'You can switch or delete your most recent game for ' + P.editMinutes() + ' minutes. Older results need an administrator.';
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
      if (P.canEdit(g.id)) {
        var flip = h('button', 'flip', FLIP);
        flip.type = 'button';
        flip.setAttribute('aria-label', 'Switch the winner of this game');
        flip.addEventListener('click', function () {
          if (busy) return;
          busy = true;
          P.flipGame(g.id).then(function (res) {
            busy = false;
            if (!res.ok) { toast(res.msg, true); return; }
            toast('Winner switched');
            renderAll(); renderResults(false);
          });
        });
        row.appendChild(flip);
        var del = h('button', null, TIMES);
        del.type = 'button';
        del.setAttribute('aria-label', 'Delete this game');
        del.addEventListener('click', function () {
          if (busy) return;
          if (!window.confirm('Delete this game?')) return;
          busy = true;
          P.deleteGame(g.id).then(function (res) {
            busy = false;
            if (!res.ok) { toast(res.msg, true); return; }
            toast('Game deleted');
            renderAll(); renderResults(false);
          });
        });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  function renderAdmin() {
    var on = P.isAdmin();
    $('adminIn').hidden = on;
    $('adminOut').hidden = !on;
  }

  function renderAll() { renderPlay(); renderRoster(); renderStats(); renderHistory(); renderAdmin(); }

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
  dock.querySelector('.play').addEventListener('click', function () { launch(dock.querySelector('.bubble'), 'dock'); });

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
  function submitPlayer(inputId, msgId) {
    var inp = $(inputId);
    P.addPlayer(inp.value).then(function (r) {
      status($(msgId), r.msg, r.ok);
      if (r.ok) { inp.value = ''; } else { shake(inp); }
      renderPlay(); renderRoster(); renderStats();
      if (inputId === 'nameInput') inp.focus();
    });
  }
  $('addForm').addEventListener('submit', function (e) { e.preventDefault(); submitPlayer('nameInput', 'msg'); });
  $('pForm').addEventListener('submit', function (e) { e.preventDefault(); submitPlayer('pName', 'pMsg'); });

  $('clearToday').addEventListener('click', function () {
    P.clearToday();
    status($('msg'), '', true);
    renderPlay(); renderRoster();
  });

  $('shuffle').addEventListener('click', function () {
    var r = P.state().round;
    runRound(r && !P.hasResults() ? 'redeal' : 'next');
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
    a.download = 'dink-teams-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    status($('dataMsg'), 'Copy downloaded.', true);
  });

  $('adminForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('adminPass');
    P.adminLogin(inp.value).then(function (r) {
      status($('adminMsg'), r.ok ? 'Signed in as administrator.' : r.msg, r.ok);
      if (r.ok) inp.value = '';
      renderAll(); renderResults(false);
    });
  });
  $('adminLogout').addEventListener('click', function () {
    P.adminLogout().then(function () {
      status($('adminMsg'), 'Signed out.', true);
      renderAll(); renderResults(false);
    });
  });
  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      if (!window.confirm('Add the players and games in this file to the shared stats? Games already saved are skipped.')) return;
      P.importBackup(String(rd.result)).then(function (r) {
        status($('adminMsg'), r.msg, r.ok);
        if (r.ok) { renderAll(); renderResults(false); }
      });
    };
    rd.readAsText(f);
    e.target.value = '';
  });
  $('importLocalBtn').addEventListener('click', function () {
    if (!window.confirm('Add the games saved in this browser by the old version to the shared stats? Games already saved are skipped.')) return;
    P.importLocalOld().then(function (r) {
      status($('adminMsg'), r.msg, r.ok);
      if (r.ok) { renderAll(); renderResults(false); }
    });
  });
  $('resetLocal').addEventListener('click', function () {
    if (!window.confirm('Clear who is here today and the current shuffle on this device?')) return;
    P.resetLocal();
    seen = {};
    editing = false;
    picked = null;
    renderAll(); renderResults(false);
    toast('Lineup reset');
  });

  /* ---------- Start and sync ---------- */
  function afterRefresh(res) {
    if (!res.ok) {
      if (res.first) toast("Can't reach the server. Showing the last saved stats.", true);
      return;
    }
    var s = P.sig();
    if (s !== lastSig) {
      lastSig = s;
      renderAll();
      renderResults(false);
    }
  }
  function sync() { return P.refresh().then(afterRefresh); }

  buildCourts();
  buildSkip();
  renderAll();
  renderResults(false);
  var start = location.hash.slice(1);
  show(TABS.indexOf(start) >= 0 ? start : 'play', false);
  sync();
  setInterval(function () { if (!document.hidden) sync(); }, 45000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
})();
