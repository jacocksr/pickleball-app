(function () {
  'use strict';
  var dock = document.querySelector('.dock');
  if (!dock) return;
  var NEED = 5, WINDOW = 2000, COUNT = 20, SPAWN = 1000, SETTLE_MS = 500, FLOOR_MAX = 6500, HARD_STOP = 14000;
  var G = 2000, REST = 0.6, WALL = 0.7, HIT = 0.5, STEP = 1 / 240, ITER = 3;
  var taps = [], running = false;

  dock.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-tab="play"]') : null;
    if (!a) return;
    var now = Date.now();
    taps.push(now);
    taps = taps.filter(function (t) { return now - t <= WINDOW; });
    if (taps.length >= NEED && !running) { taps = []; start(); }
  }, true);

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

    var balls = [];
    for (var i = 0; i < COUNT; i++) {
      var r = 13 + Math.random() * 8;
      balls.push({
        x: r + Math.random() * Math.max(1, W - 2 * r), y: -r - Math.random() * 60,
        vx: (Math.random() - 0.5) * 260, vy: Math.random() * 200,
        r: r, a: Math.random() * 6.28, w: (Math.random() - 0.5) * 8,
        at: (i * SPAWN) / COUNT + Math.random() * 40, live: false, gone: false, floor: false
      });
    }
    var t0 = performance.now(), last = t0, floorOn = true, calm = 0, acc = 0, raf = 0;

    function collide(p, q) {
      var dx = q.x - p.x, dy = q.y - p.y, min = p.r + q.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = min - d;
      var mp = p.r * p.r, mq = q.r * q.r, ip = 1 / mp, iq = 1 / mq, sum = ip + iq;
      p.x -= nx * over * (ip / sum); p.y -= ny * over * (ip / sum);
      q.x += nx * over * (iq / sum); q.y += ny * over * (iq / sum);
      var rvx = p.vx - q.vx, rvy = p.vy - q.vy;
      var vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        var e = -vn < 150 ? 0 : HIT;
        var j = (-(1 + e) * vn) / sum;
        p.vx += j * ip * nx; p.vy += j * ip * ny;
        q.vx -= j * iq * nx; q.vy -= j * iq * ny;
      }
      var tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
      var jt = (-vt * 0.2) / sum;
      p.vx += jt * ip * tx; p.vy += jt * ip * ty;
      q.vx -= jt * iq * tx; q.vy -= jt * iq * ty;
    }

    function bounds() {
      for (var k = 0; k < balls.length; k++) {
        var b = balls[k];
        if (!b.live || b.gone) continue;
        if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * WALL; }
        else if (b.x > W - b.r) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * WALL; }
        if (floorOn && b.y > H - b.r) {
          b.y = H - b.r;
          if (b.vy > 0) b.vy = b.vy * REST > 100 ? -b.vy * REST : 0;
          b.floor = true;
        }
      }
    }

    function step(h, el) {
      var k, m, b, it;
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (b.gone) continue;
        if (!b.live) { if (el >= b.at) b.live = true; else continue; }
        b.vy += G * h;
        b.vx *= 1 - 0.15 * h;
        if (b.floor) {
          b.vx *= 1 - 4 * h;
          if (Math.abs(b.vx) < 10) b.vx = 0;
          b.w = b.vx / b.r;
        }
        b.floor = false;
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

    function openFloor() {
      floorOn = false;
      balls.forEach(function (b) { if (!b.gone) b.vx += (Math.random() - 0.5) * 160; });
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
          var fast = false;
          for (k = 0; k < balls.length; k++) {
            b = balls[k];
            if (b.live && !b.gone && b.vx * b.vx + b.vy * b.vy > 1600) { fast = true; break; }
          }
          calm = fast ? 0 : calm + dt * 1000;
          if (calm > SETTLE_MS) openFloor();
        }
      } else {
        for (k = 0; k < balls.length; k++) {
          b = balls[k];
          if (b.live && !b.gone && b.y > H + b.r + 20) b.gone = true;
        }
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
