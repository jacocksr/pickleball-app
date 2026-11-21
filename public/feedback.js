(function () {
  'use strict';
  var P = window.PB && window.PB.store;
  var more = document.getElementById('view-more');
  var adminOut = document.getElementById('adminOut');
  if (!P || !more || !adminOut) return;
  var KINDS = { bug: 'Bug', idea: 'Idea', other: 'Other' };
  var MAX = 1000;

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function status(el, msg, ok) {
    el.textContent = msg;
    el.className = 'status' + (msg ? (ok ? ' ok' : ' error') : '');
  }
  function field(label, control) {
    var l = h('label', 'field');
    l.appendChild(document.createTextNode(label));
    l.appendChild(control);
    return l;
  }
  function call(path, body) {
    var st = P.state();
    var headers = { 'X-Client-Token': st.token };
    if (st.admin) headers.Authorization = 'Bearer ' + st.admin.token;
    var opts = { headers: headers, cache: 'no-store' };
    if (body !== undefined) {
      opts.method = 'POST';
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ').');
        return j;
      });
    }, function () {
      throw new Error("Can't reach the server. Check your connection and try again.");
    });
  }

  /* ---------- Report form ---------- */
  var card = h('div', 'card');
  var head = h('div', 'card-head');
  var emoji = h('span', 'emoji', String.fromCodePoint(0x1F4AC));
  emoji.setAttribute('aria-hidden', 'true');
  head.appendChild(emoji);
  head.appendChild(h('h2', null, 'Report a problem or idea'));
  card.appendChild(head);
  card.appendChild(h('p', 'muted', 'Found a bug or have a suggestion? Send it here. Please do not include passwords or private details.'));

  var form = document.createElement('form');
  form.autocomplete = 'off';
  var kind = document.createElement('select');
  [['bug', 'Something is broken'], ['idea', 'An idea or suggestion'], ['other', 'Something else']].forEach(function (o) {
    var op = document.createElement('option');
    op.value = o[0]; op.textContent = o[1];
    kind.appendChild(op);
  });
  var msg = document.createElement('textarea');
  msg.maxLength = MAX; msg.rows = 5; msg.required = true;
  msg.placeholder = 'What happened? What did you expect? Which tab were you on?';
  var count = h('p', 'count', '0 / ' + MAX);
  msg.addEventListener('input', function () { count.textContent = msg.value.length + ' / ' + MAX; });
  var contact = document.createElement('input');
  contact.type = 'text'; contact.maxLength = 100;
  contact.placeholder = 'Name or email, if you want a reply';
  var trap = h('div', 'hp');
  trap.setAttribute('aria-hidden', 'true');
  var trapIn = document.createElement('input');
  trapIn.type = 'text'; trapIn.name = 'website'; trapIn.tabIndex = -1; trapIn.autocomplete = 'off';
  trap.appendChild(trapIn);
  var send = h('button', 'btn primary', 'Send report');
  send.type = 'submit';
  var out = h('p', 'status');
  out.setAttribute('role', 'status');
  out.setAttribute('aria-live', 'polite');
  form.appendChild(field('Type', kind));
  form.appendChild(field('Details', msg));
  form.appendChild(count);
  form.appendChild(field('Contact (optional)', contact));
  form.appendChild(trap);
  form.appendChild(send);
  form.appendChild(out);
  card.appendChild(form);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (msg.value.trim().length < 10) { status(out, 'Please write at least 10 characters.', false); return; }
    send.disabled = true;
    status(out, 'Sending...', true);
    call('/api/tickets', {
      kind: kind.value,
      message: msg.value,
      contact: contact.value,
      website: trapIn.value,
      context: {
        tab: location.hash.slice(1) || 'play',
        viewport: window.innerWidth + 'x' + window.innerHeight,
        theme: document.documentElement.getAttribute('data-theme') || 'auto',
        ua: navigator.userAgent || ''
      }
    }).then(function () {
      msg.value = ''; contact.value = ''; kind.value = 'bug';
      count.textContent = '0 / ' + MAX;
      status(out, 'Thanks, got it. We will take a look.', true);
    }).catch(function (err) {
      status(out, err.message, false);
    }).then(function () { send.disabled = false; });
  });

  var first = more.querySelector('.card');
  if (first && first.nextSibling) first.parentNode.insertBefore(card, first.nextSibling);
  else more.appendChild(card);

  /* ---------- Administrator ticket list ---------- */
  var box = h('div', 'tickets');
  var bar = h('div', 'card-head');
  var title = h('h2', null, 'Tickets');
  bar.appendChild(title);
  var refresh = h('button', 'btn small', 'Refresh');
  refresh.type = 'button';
  bar.appendChild(refresh);
  var list = h('div');
  var tmsg = h('p', 'status');
  tmsg.setAttribute('role', 'status');
  box.appendChild(bar);
  box.appendChild(list);
  box.appendChild(tmsg);
  adminOut.appendChild(box);

  function when(ts) {
    return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function render(data) {
    title.textContent = 'Tickets (' + data.open + ' open)';
    list.innerHTML = '';
    if (!data.rows.length) { list.appendChild(h('p', 'muted empty', 'No tickets yet.')); return; }
    data.rows.forEach(function (t) {
      var row = h('div', 'ticket' + (t.status === 'done' ? ' done' : ''));
      var top = h('div');
      top.appendChild(h('span', 'kind', KINDS[t.kind] || t.kind));
      top.appendChild(document.createTextNode(' #' + t.id + ' \u00b7 ' + when(t.ts) + (t.status === 'done' ? ' \u00b7 done' : '')));
      row.appendChild(top);
      row.appendChild(h('p', 'msg', t.message));
      if (t.contact) row.appendChild(h('small', null, 'Contact: ' + t.contact));
      var ctx = Object.keys(t.context || {}).map(function (k) { return k + ': ' + t.context[k]; }).join(' \u00b7 ');
      if (ctx) row.appendChild(h('small', null, ctx));
      var btn = h('button', 'btn small', t.status === 'done' ? 'Reopen' : 'Mark done');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        call('/api/admin/tickets/resolve', { id: t.id, status: t.status === 'done' ? 'open' : 'done' })
          .then(load)
          .catch(function (err) { status(tmsg, err.message, false); btn.disabled = false; });
      });
      var r = h('div', 'row');
      r.appendChild(btn);
      row.appendChild(r);
      list.appendChild(row);
    });
  }
  function load() {
    return call('/api/admin/tickets').then(function (d) { status(tmsg, '', true); render(d); })
      .catch(function (err) { status(tmsg, err.message, false); });
  }
  refresh.addEventListener('click', load);
  new MutationObserver(function () {
    if (!adminOut.hidden) load(); else list.innerHTML = '';
  }).observe(adminOut, { attributes: true, attributeFilter: ['hidden'] });
  if (!adminOut.hidden) load();
})();
