(function () {
  'use strict';
  var dock = document.querySelector('.dock');
  if (!dock) return;
  var NEED = 5, WINDOW = 2000, COUNT = 24, SPAWN = 1000, FLOOR_MS = 4500, HARD_STOP = 14000;
  var G = 2000, REST = 0.7, WALL = 0.8, HIT = 0.8;
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
      var r = 14 + Math.random() * 10;
      balls.push({
        x: r + Math.random() * Math.max(1, W - 2 * r), y: -r - Math.random() * 60,
        vx: (Math.random() - 0.5) * 300, vy: Math.random() * 200,
        r: r, a: Math.random() * 6.28, w: (Math.random() - 0.5) * 8,
        at: (i * SPAWN) / COUNT + Math.random() * 40, live: false, gone: false
      });
    }
    var t0 = performance.now(), last = t0, floorOn = true, raf = 0;

    function collide(p, q) {
      var dx = q.x - p.x, dy = q.y - p.y, min = p.r + q.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = (min - d) / 2;
      p.x -= nx * over; p.y -= ny * over; q.x += nx * over; q.y += ny * over;
      var vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
      if (vn >= 0) return;
      var mp = p.r * p.r, mq = q.r * q.r;
      var j = (-(1 + HIT) * vn) / (1 / mp + 1 / mq);
      p.vx += (j / mp) * nx; p.vy += (j / mp) * ny;
      q.vx -= (j / mq) * nx; q.vy -= (j / mq) * ny;
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
      var dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      var el = now - t0;
      if (floorOn && el > FLOOR_MS) floorOn = false;
      var alive = 0, k, b;
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (b.gone) continue;
        if (!b.live) { if (el >= b.at) b.live = true; else { alive++; continue; } }
        b.vy += G * dt;
        b.vx *= 1 - 0.15 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * WALL; b.w *= 0.9; }
        else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * WALL; b.w *= 0.9; }
        if (floorOn && b.y > H - b.r && b.vy > 0) {
          b.y = H - b.r;
          b.vy = -b.vy * REST;
          if (Math.abs(b.vy) < 90) b.vy = 0;
          b.vx *= 0.985;
          b.w = b.vx / b.r;
        }
        if (!floorOn && b.y > H + b.r + 20) { b.gone = true; continue; }
        alive++;
      }
      for (k = 0; k < balls.length; k++) {
        if (!balls[k].live || balls[k].gone) continue;
        for (var m = k + 1; m < balls.length; m++) {
          if (balls[m].live && !balls[m].gone) collide(balls[k], balls[m]);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (k = 0; k < balls.length; k++) { if (balls[k].live && !balls[k].gone) draw(balls[k]); }
      if (alive === 0 || el > HARD_STOP) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
})();
