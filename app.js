(function () {
  'use strict';

  var MIN = 4;
  var MAX = 20;
  var KEY = 'pickleball-players-v1';

  var form = document.getElementById('add-form');
  var input = document.getElementById('name-input');
  var addBtn = document.getElementById('add-btn');
  var list = document.getElementById('player-list');
  var emptyMsg = document.getElementById('empty');
  var countEl = document.getElementById('count');
  var msg = document.getElementById('message');
  var preview = document.getElementById('preview');
  var shuffleBtn = document.getElementById('shuffle-btn');
  var clearBtn = document.getElementById('clear-btn');
  var results = document.getElementById('results');

  var players = load();
  var sitCounts = {};
  var nextId = players.reduce(function (m, p) { return Math.max(m, p.id); }, 0) + 1;

  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(data)) {
        return data.slice(0, MAX).filter(function (p) { return p && typeof p.name === 'string' && typeof p.id === 'number'; });
      }
    } catch (e) {}
    return [];
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(players)); } catch (e) {}
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function plan(n) {
    var doubles = Math.floor(n / 4);
    var left = n % 4;
    return { doubles: doubles, singles: left >= 2 ? 1 : 0, sit: left % 2 };
  }

  function buildRound() {
    var pool = shuffle(players);
    var sitting = [];
    if (pool.length % 2 === 1) {
      var min = Infinity;
      pool.forEach(function (p) { min = Math.min(min, sitCounts[p.id] || 0); });
      var idx = pool.findIndex(function (p) { return (sitCounts[p.id] || 0) === min; });
      var sitter = pool.splice(idx, 1)[0];
      sitCounts[sitter.id] = (sitCounts[sitter.id] || 0) + 1;
      sitting.push(sitter);
    }
    var matches = [];
    while (pool.length >= 4) {
      var four = pool.splice(0, 4);
      matches.push({ type: 'doubles', a: [four[0], four[1]], b: [four[2], four[3]] });
    }
    if (pool.length === 2) matches.push({ type: 'singles', a: [pool[0]], b: [pool[1]] });
    return { matches: matches, sitting: sitting };
  }

  function setMessage(text, ok) {
    msg.textContent = text;
    msg.className = 'message' + (ok ? ' ok' : '');
  }

  function addPlayer(name) {
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) return fail('Type a name first.');
    if (players.length >= MAX) return fail('Max ' + MAX + ' players.');
    var dup = players.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (dup) return fail(name + ' is already added.');
    var p = { id: nextId++, name: name };
    players.push(p);
    save();
    list.appendChild(chip(p));
    setMessage('Added ' + name + '.', true);
    clearResults();
    update(true);
    return true;
  }

  function fail(text) {
    setMessage(text, false);
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    return false;
  }

  function removePlayer(id, el) {
    players = players.filter(function (p) { return p.id !== id; });
    delete sitCounts[id];
    save();
    clearResults();
    el.classList.add('leaving');
    var done = false;
    function finish() { if (done) return; done = true; el.remove(); }
    el.addEventListener('animationend', finish);
    setTimeout(finish, 350);
    setMessage('', true);
    update(true);
  }

  function chip(p) {
    var li = document.createElement('li');
    li.className = 'chip';
    var span = document.createElement('span');
    span.textContent = p.name;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.setAttribute('aria-label', 'Remove ' + p.name);
    btn.addEventListener('click', function () { removePlayer(p.id, li); });
    li.appendChild(span);
    li.appendChild(btn);
    return li;
  }

  function update(pop) {
    var n = players.length;
    countEl.textContent = n + ' / ' + MAX;
    countEl.classList.toggle('full', n >= MAX);
    if (pop) {
      countEl.classList.remove('pop');
      void countEl.offsetWidth;
      countEl.classList.add('pop');
    }
    emptyMsg.hidden = n > 0;
    addBtn.disabled = n >= MAX;
    clearBtn.disabled = n === 0;
    shuffleBtn.disabled = n < MIN;

    if (n < MIN) {
      var need = MIN - n;
      preview.textContent = 'Add ' + plural(need, 'more player') + ' to start.';
    } else {
      var p = plan(n);
      var parts = [];
      if (p.doubles) parts.push(plural(p.doubles, 'doubles match').replace('matchs', 'matches'));
      if (p.singles) parts.push('1 singles match');
      if (p.sit) parts.push('1 sitting out');
      preview.textContent = parts.join(' · ');
    }
  }

  function clearResults() { results.innerHTML = ''; }

  function side(cls, people) {
    var d = document.createElement('div');
    d.className = 'side ' + cls;
    people.forEach(function (p) {
      var s = document.createElement('span');
      s.textContent = p.name;
      d.appendChild(s);
    });
    return d;
  }

  function render(round) {
    clearResults();
    var d = 0;
    var s = 0;
    round.matches.forEach(function (m, i) {
      var card = document.createElement('article');
      card.className = 'match';
      card.style.animationDelay = (i * 90) + 'ms';
      var h = document.createElement('h3');
      if (m.type === 'doubles') { d++; h.textContent = 'Doubles ' + d; }
      else { s++; h.textContent = 'Singles'; }
      var sides = document.createElement('div');
      sides.className = 'sides';
      var vs = document.createElement('div');
      vs.className = 'vs';
      vs.textContent = 'vs';
      sides.appendChild(side('a', m.a));
      sides.appendChild(vs);
      sides.appendChild(side('b', m.b));
      card.appendChild(h);
      card.appendChild(sides);
      results.appendChild(card);
    });
    if (round.sitting.length) {
      var c = document.createElement('article');
      c.className = 'match sit';
      c.style.animationDelay = (round.matches.length * 90) + 'ms';
      var h2 = document.createElement('h3');
      h2.textContent = 'Sitting out';
      var p = document.createElement('p');
      p.textContent = round.sitting[0].name + ' rests this round.';
      c.appendChild(h2);
      c.appendChild(p);
      results.appendChild(c);
    }
    results.firstChild && results.firstChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (addPlayer(input.value)) input.value = '';
    input.focus();
  });

  shuffleBtn.addEventListener('click', function () {
    if (players.length < MIN) return;
    shuffleBtn.classList.remove('spin');
    void shuffleBtn.offsetWidth;
    shuffleBtn.classList.add('spin');
    render(buildRound());
    shuffleBtn.textContent = 'Shuffle again';
  });

  clearBtn.addEventListener('click', function () {
    if (!players.length) return;
    if (!window.confirm('Remove all players?')) return;
    players = [];
    sitCounts = {};
    save();
    list.innerHTML = '';
    clearResults();
    shuffleBtn.textContent = 'Shuffle teams';
    setMessage('', true);
    update(true);
  });

  players.forEach(function (p) { list.appendChild(chip(p)); });
  update(false);
})();
