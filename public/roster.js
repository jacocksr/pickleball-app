(function () {
  'use strict';
  var P = window.PB && window.PB.store;
  var ul = document.getElementById('roster');
  if (!P || !ul) return;
  var W = 104, openRow = null, asked = {}, toastTimer;

  var css = [
    '.roster li.sw{display:block;position:relative;overflow:hidden;padding:0}',
    '.sw-under{position:absolute;top:0;right:0;bottom:0;width:' + W + 'px;display:flex}',
    '.sw-under button{flex:1;border:0;background:var(--danger);color:#fff;font:inherit;font-size:.85rem;font-weight:800;line-height:1.15;cursor:pointer;padding:0 8px}',
    '.sw-under button:disabled{opacity:.6;cursor:default}',
    '[data-theme=dark] .sw-under button{color:#2b0805}',
    '.sw-front{position:relative;display:flex;align-items:center;gap:12px;padding:10px 0;background:var(--card);transition:transform .25s var(--ease);touch-action:pan-y}',
    '.sw-front.drag{transition:none}',
    '.sw-pill{border:1.5px solid var(--brand);background:transparent;color:var(--brand);border-radius:999px;padding:.2rem .75rem;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;flex:none}',
    '.sw-pill.primary{background:var(--brand);color:#fff}',
    '.sw-pill:disabled{opacity:.5;cursor:default}',
    '.sw-pill:focus-visible{outline:3px solid var(--brand);outline-offset:2px}',
    '.sw-form{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
    '.sw-form input{flex:1;min-width:0;width:auto;padding:.5rem .7rem;border-radius:12px}',
    '.sw-err{flex-basis:100%;color:var(--danger);font-weight:600;font-size:.85rem}',
    '.sw-front.editing>.switch,.sw-front.editing>.rname,.sw-front.editing>.sw-edit{display:none}'
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pill(text, cls) {
    var b = h('button', cls, text);
    b.type = 'button';
    return b;
  }
  function toast(msg, err) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }
  function call(path, body) {
    var st = P.state();
    var headers = { 'X-Client-Token': st.token, 'Content-Type': 'application/json' };
    if (st.admin) headers.Authorization = 'Bearer ' + st.admin.token;
    return fetch(path, { method: 'POST', headers: headers, cache: 'no-store', body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ').');
        return j;
      });
    }, function () {
      throw new Error("Can't reach the server. Check your connection and try again.");
    });
  }
  /* app.js re-renders whenever a sync finds changes, so ask it to sync. */
  function resync() { document.dispatchEvent(new Event('visibilitychange')); }

  function setOpen(front, on) {
    front.style.transform = on ? 'translateX(-' + W + 'px)' : '';
    if (on) {
      if (openRow && openRow !== front) setOpen(openRow, false);
      openRow = front;
    } else if (openRow === front) {
      openRow = null;
    }
  }

  function edit(front, p) {
    var form = document.createElement('form');
    form.className = 'sw-form';
    form.autocomplete = 'off';
    var inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 20; inp.value = p.name;
    inp.setAttribute('aria-label', 'Name for ' + p.name);
    inp.setAttribute('autocapitalize', 'words');
    inp.setAttribute('enterkeyhint', 'done');
    var save = pill('Save', 'sw-pill primary');
    save.type = 'submit';
    var cancel = pill('Cancel', 'sw-pill');
    var err = h('div', 'sw-err');
    err.setAttribute('role', 'alert');
    form.appendChild(inp); form.appendChild(save); form.appendChild(cancel); form.appendChild(err);
    function stop() { form.remove(); front.classList.remove('editing'); }
    cancel.addEventListener('click', stop);
    form.addEventListener('keydown', function (e) { if (e.key === 'Escape') stop(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = inp.value.split(' ').filter(Boolean).join(' ');
      if (!v) { err.textContent = 'Type a name first.'; return; }
      if (v === p.name) { stop(); return; }
      save.disabled = true;
      err.textContent = '';
      call('/api/players/rename', { id: p.id, name: v }).then(function (r) {
        toast('Renamed to ' + r.player.name);
        stop();
        resync();
      }).catch(function (x) {
        err.textContent = x.message;
        save.disabled = false;
      });
    });
    setOpen(front, false);
    front.classList.add('editing');
    front.appendChild(form);
    inp.focus();
    inp.select();
  }

  function act(front, p, btn) {
    if (P.isAdmin()) {
      if (!window.confirm('Delete ' + p.name + ' from the shared list? Their past games stay in History.')) { setOpen(front, false); return; }
      P.removePlayer(p.id).then(function (res) {
        if (!res.ok) { toast(res.msg, true); return; }
        toast(p.name + ' deleted');
        resync();
      });
      return;
    }
    btn.disabled = true;
    call('/api/tickets', {
      kind: 'other',
      message: 'Delete request: please remove "' + p.name + '" (player #' + p.id + ') from the shared player list.',
      contact: '',
      context: { tab: 'players', viewport: window.innerWidth + 'x' + window.innerHeight }
    }).then(function () {
      asked[p.id] = true;
      btn.textContent = 'Requested';
      toast('Request sent to the administrator.');
      setTimeout(function () { setOpen(front, false); }, 900);
    }).catch(function (x) {
      btn.disabled = false;
      toast(x.message, true);
    });
  }

  function decorate(li) {
    if (li.classList.contains('sw')) return;
    var rn = li.querySelector('.rname');
    var nm = rn && rn.firstChild ? rn.firstChild.nodeValue : '';
    var p = P.state().players.filter(function (x) { return x.name === nm; })[0];
    if (!p) return;
    var old = li.querySelector('button.btn');
    if (old) old.remove();
    li.classList.add('sw');
    var front = h('div', 'sw-front');
    while (li.firstChild) front.appendChild(li.firstChild);
    var under = h('div', 'sw-under');
    var del = h('button', null, P.isAdmin() ? 'Delete' : (asked[p.id] ? 'Requested' : 'Request delete'));
    del.type = 'button';
    del.disabled = !P.isAdmin() && !!asked[p.id];
    del.addEventListener('focus', function () { setOpen(front, true); });
    del.addEventListener('click', function () { act(front, p, del); });
    under.appendChild(del);
    var ed = pill('Edit', 'sw-pill sw-edit');
    ed.setAttribute('aria-label', 'Edit name for ' + p.name);
    ed.addEventListener('click', function () { edit(front, p); });
    front.appendChild(ed);
    li.appendChild(under);
    li.appendChild(front);

    var sx = 0, sy = 0, base = 0, x = 0, mode = 0, pid = null, moved = false;
    front.addEventListener('pointerdown', function (e) {
      if (front.classList.contains('editing') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (openRow && openRow !== front) setOpen(openRow, false);
      sx = e.clientX; sy = e.clientY; base = openRow === front ? -W : 0; x = base; mode = 0; moved = false; pid = e.pointerId;
    });
    front.addEventListener('pointermove', function (e) {
      if (pid === null || e.pointerId !== pid) return;
      var mx = e.clientX - sx, my = e.clientY - sy;
      if (mode === 0) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        if (Math.abs(my) > Math.abs(mx)) { mode = 2; return; }
        mode = 1;
        try { front.setPointerCapture(pid); } catch (err) {}
        front.classList.add('drag');
      }
      if (mode !== 1) return;
      moved = true;
      x = Math.max(-W * 1.3, Math.min(0, base + mx));
      front.style.transform = 'translateX(' + x + 'px)';
    });
    function end(e) {
      if (pid === null || e.pointerId !== pid) return;
      pid = null;
      if (mode !== 1) return;
      front.classList.remove('drag');
      setOpen(front, x < -W / 2);
      setTimeout(function () { moved = false; }, 0);
    }
    front.addEventListener('pointerup', end);
    front.addEventListener('pointercancel', end);
    front.addEventListener('click', function (e) {
      if (moved || openRow === front) {
        e.preventDefault();
        e.stopPropagation();
        if (openRow === front && !moved) setOpen(front, false);
      }
    }, true);
  }

  function decorateAll() { Array.prototype.forEach.call(ul.children, decorate); }
  document.addEventListener('pointerdown', function (e) {
    if (openRow && !openRow.parentNode.contains(e.target)) setOpen(openRow, false);
  });
  new MutationObserver(function () { openRow = null; decorateAll(); }).observe(ul, { childList: true });
  decorateAll();
})();
