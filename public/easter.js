(function () {
  'use strict';
  var dock = document.querySelector('.dock');
  if (!dock) return;
  var NEED = 5, WINDOW = 2000, COUNT = 20, SPAWN = 1000, CALM_MS = 2500, FLOOR_MAX = 9000, HARD_STOP = 16000;
  var G = 2000, E_BALL = 0.55, E_WALL = 0.6, E_FLOOR = 0.6, MU = 0.35, INERTIA = 2 / 3, KF = 1 + 1 / INERTIA;
  var BOUNCE_MIN = 120, STEP = 1 / 240, ITER = 4, SLOP = 0.2, PUSH = 0.8;
  var WAKE_V = 80, SWIPE_R = 16, MAX_V = 2200, MIN_SWIPE = 150;
  var taps = [], running = false;

  dock.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-tab="play"]') : null;
    if (!a) return;
    var now = Date.now();
    taps.push(now);
    taps = taps.filter(function (t) { return now - t <= WINDOW; });
    if (taps.length >= NEED && !running) { taps = []; start(); }
  }, true);

  function bounce(e, v) {
    var s = (v - BOUNCE_MIN) / 500;
    return s <= 0 ? 0 : Math.min(e, e * s);
  }
  function wake(b) { if (b.sleep) { b.sleep = false; b.rest = 0; } }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function start() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    running = true;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60';
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var cs = getComputedStyle(document.documentElement);
    var brand = cs.getPropertyValue('--brand').trim() || '#14935a';
    var fill = cs.getPropertyValue('--card').trim() || '#ffffff';
    var dots = [[12, 7.2], [7.6, 10], [16.4, 10], [12, 12], [8.4, 15], [15.6, 15], [12, 16.8]];
    var prevTouch = document.documentElement.style.touchAction;
    document.documentElement.style.touchAction = 'none';

    var balls = [];
    for (var i = 0; i < COUNT; i++) {
      var r = 13 + Math.random() * 8;
      balls.push({
        x: r + Math.random() * Math.max(1, W - 2 * r), y: -r - Math.random() * 60,
        vx: (Math.random() - 0.5) * 240, vy: Math.random() * 200,
        r: r, m: r * r, a: Math.random() * 6.28, w: (Math.random() - 0.5) * 6,
        at: (i * SPAWN) / COUNT + Math.random() * 40,
        live: false, gone: false, floor: false, touch: false, sleep: false, rest: 0, freed: false
      });
    }
    var t0 = performance.now(), last = t0, floorOn = true, calm = 0, acc = 0, raf = 0, lp = null;

    function collide(p, q) {
      var dx = q.x - p.x, dy = q.y - p.y, min = p.r + q.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      var vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
      if (vn < -WAKE_V) { wake(p); wake(q); }
      var ip = p.sleep ? 0 : 1 / p.m, iq = q.sleep ? 0 : 1 / q.m, sum = ip + iq;
      if (sum === 0) return;
      var pen = min - d - SLOP;
      if (pen > 0) {
        var c = (PUSH * pen) / sum;
        p.x -= nx * c * ip; p.y -= ny * c * ip;
        q.x += nx * c * iq; q.y += ny * c * iq;
      }
      p.touch = true; q.touch = true;
      var jn = 0;
      if (vn < 0) {
        jn = (-(1 + bounce(E_BALL, -vn)) * vn) / sum;
        p.vx += jn * ip * nx; p.vy += jn * ip * ny;
        q.vx -= jn * iq * nx; q.vy -= jn * iq * ny;
      }
      var tx = -ny, ty = nx;
      var vt = (p.vx - q.vx) * tx + (p.vy - q.vy) * ty + p.w * p.r + q.w * q.r;
      var jt = -vt / (KF * sum), lim = MU * jn;
      if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
      p.vx += jt * ip * tx; p.vy += jt * ip * ty;
      q.vx -= jt * iq * tx; q.vy -= jt * iq * ty;
      if (!p.sleep) p.w += jt / (INERTIA * p.m * p.r);
      if (!q.sleep) q.w += jt / (INERTIA * q.m * q.r);
    }

    function bounds() {
      for (var k = 0; k < balls.length; k++) {
        var b = balls[k];
        if (!b.live || b.gone || b.sleep) continue;
        if (!b.freed) {
          if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * bounce(E_WALL, -b.vx); }
          else if (b.x > W - b.r) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * bounce(E_WALL, b.vx); }
        }
        if (floorOn && b.y > H - b.r) {
          b.y = H - b.r;
          var jn = 0;
          if (b.vy > 0) {
            var e = bounce(E_FLOOR, b.vy);
            jn = (1 + e) * b.vy * b.m;
            b.vy = -e * b.vy;
          }
          var vs = b.vx - b.w * b.r;
          var jt = (-vs * b.m) / KF, lim = MU * jn;
          if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
          b.vx += jt / b.m;
          b.w -= jt / (INERTIA * b.m * b.r);
          b.floor = true;
        }
      }
    }

    function step(h, el) {
      var k, m, b, it;
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (b.gone || b.sleep) continue;
        if (!b.live) { if (el >= b.at) b.live = true; else continue; }
        b.vy += G * h;
        b.vx *= 1 - 0.1 * h;
        b.w *= 1 - 0.1 * h;
        if (b.floor) {
          b.vx *= 1 - 3 * h;
          b.w *= 1 - 3 * h;
        }
        if (b.touch) {
          b.vx *= 1 - 3 * h; b.vy *= 1 - 3 * h; b.w *= 1 - 5 * h;
        }
        if ((b.floor || b.touch) && b.vx * b.vx + b.vy * b.vy < 225 && Math.abs(b.w * b.r) < 15) b.rest += h;
        else b.rest = 0;
        if (b.rest > 0.25) { b.sleep = true; b.vx = 0; b.vy = 0; b.w = 0; }
        b.floor = false; b.touch = false;
        if (b.sleep) continue;
        b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h;
      }
      for (it = 0; it < ITER; it++) {
        for (k = 0; k < balls.length; k++) {
          if (!balls[k].live || balls[k].gone) continue;
          for (m = k + 1; m < balls.length; m++) {
            if (balls[m].live && !balls[m].gone) collide(balls[k], balls[m]);
          }
        }
        bounds();
      }
    }

    function hit(ax, ay, px, py, pvx, pvy) {
      for (var k = 0; k < balls.length; k++) {
        var b = balls[k];
        if (!b.live || b.gone) continue;
        if (segDist(b.x, b.y, ax, ay, px, py) > b.r + SWIPE_R) continue;
        wake(b);
        b.vx += (pvx * 0.8 - b.vx) * 0.6;
        b.vy += (pvy * 0.8 - b.vy) * 0.6;
        var sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; sp = MAX_V; }
        b.w += (((px - b.x) * pvy - (py - b.y) * pvx) / (b.r * b.r)) * 0.3;
        if (sp > 500) b.freed = true;
      }
    }
    function onDown(e) { lp = { x: e.clientX, y: e.clientY, t: performance.now() }; }
    function onMove(e) {
      var now = performance.now(), x = e.clientX, y = e.clientY;
      if (lp && now > lp.t) {
        var dt = Math.max(now - lp.t, 8) / 1000;
        var vx = (x - lp.x) / dt, vy = (y - lp.y) / dt;
        if (Math.hypot(vx, vy) > MIN_SWIPE) hit(lp.x, lp.y, x, y, vx, vy);
      }
      lp = { x: x, y: y, t: now };
    }
    function onEnd() { lp = null; }
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd, { passive: true });
    window.addEventListener('pointercancel', onEnd, { passive: true });

    function openFloor() {
      floorOn = false;
      balls.forEach(function (b) {
        if (b.gone) return;
        wake(b);
        b.vx += (Math.random() - 0.5) * 120;
      });
    }

    function draw(b) {
      var s = b.r / 9;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.scale(s, s);
      ctx.translate(-12, -12);
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, 6.2832);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = brand;
      ctx.stroke();
      ctx.fillStyle = brand;
      dots.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.3, 0, 6.2832); ctx.fill(); });
      ctx.restore();
    }

    function finish() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.documentElement.style.touchAction = prevTouch;
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      running = false;
    }

    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05), k, b;
      last = now;
      var el = now - t0;
      acc += dt;
      while (acc >= STEP) { step(STEP, el); acc -= STEP; }
      if (floorOn) {
        if (el > FLOOR_MAX) openFloor();
        else if (el > SPAWN + 300) {
          var busy = false;
          for (k = 0; k < balls.length; k++) {
            b = balls[k];
            if (b.live && !b.gone && !b.sleep) { busy = true; break; }
          }
          calm = busy ? 0 : calm + dt * 1000;
          if (calm > CALM_MS) openFloor();
        }
      }
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (!b.live || b.gone) continue;
        if (b.x < -b.r - 30 || b.x > W + b.r + 30 || b.y < -H * 3 || (!floorOn && b.y > H + b.r + 20)) b.gone = true;
      }
      var alive = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (b.gone) continue;
        alive++;
        if (b.live) draw(b);
      }
      if (alive === 0 || el > HARD_STOP) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
})();
