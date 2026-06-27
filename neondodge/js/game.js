// =============================================================
// game.js · Lógica pura del juego (sin DOM ni auth)
// =============================================================

const Game = (() => {
  const { W, H } = CONFIG.CANVAS;
  const { MAX_MS, SCORE_RATE_MIN, SCORE_RATE_MAX } = CONFIG.DIFFICULTY;
  const { RADIUS, LERP, TRAIL_LENGTH } = CONFIG.PLAYER;

  let canvas, ctx;
  let state = 'idle';
  let player, obstacles, particles, trailPoints;
  let score, frame, spawnAccum;
  let startTime, elapsedMs;
  let onDeathCallback;
  let spawnTimer = 0;
  let lastPhaseNotified = -1;
  let onPhaseCallback;

  // ----------------------------------------------------------
  // Curva de dificultad
  // ----------------------------------------------------------
  function easeInOut(x) {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  function getDiffFactor(ms) {
    return Math.min(1, ms / MAX_MS);
  }

  function getDiffConfig(ms) {
    const f = easeInOut(getDiffFactor(ms));
    return {
      baseSpeed:      2.5 + f * 5.5,
      spawnRate:      Math.max(10, 52 - f * 42),
      maxObstacles:   Math.floor(8 + f * 32),
      bigChance:      f * 0.35,
      fastSmallChance:f * 0.30,
      bigSizeMin:     24 + f * 20,
      bigSizeMax:     40 + f * 30,
      smallSizeMin:   5 + (1 - f) * 8,
      smallSizeMax:   10 + (1 - f) * 10,
      fastMult:       1.5 + f * 2.5,
    };
  }

  function getScoreRate(ms) {
    const f = easeInOut(Math.min(1, ms / MAX_MS));
    return SCORE_RATE_MIN + f * (SCORE_RATE_MAX - SCORE_RATE_MIN);
  }

  // ----------------------------------------------------------
  // Spawn de obstáculos
  // ----------------------------------------------------------
  function spawnObstacle(cfg) {
    if (obstacles.length >= cfg.maxObstacles) return;

    const side = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const roll = Math.random();
    let isBig = false, isFast = false, size;

    if (roll < cfg.bigChance) {
      isBig = true;
      size = cfg.bigSizeMin + Math.random() * (cfg.bigSizeMax - cfg.bigSizeMin);
    } else if (roll < cfg.bigChance + cfg.fastSmallChance) {
      isFast = true;
      size = cfg.smallSizeMin + Math.random() * (cfg.smallSizeMax - cfg.smallSizeMin);
    } else {
      size = 10 + Math.random() * 14;
    }

    const spd = cfg.baseSpeed
      * (isFast ? cfg.fastMult : (0.75 + Math.random() * 0.5))
      * (isBig ? 0.65 : 1);

    if (side === 0) { x = Math.random() * W; y = -size - 5; vx = (Math.random() - 0.5) * 1.5; vy = spd; }
    else if (side === 1) { x = W + size + 5; y = Math.random() * H; vx = -spd; vy = (Math.random() - 0.5) * 1.5; }
    else if (side === 2) { x = Math.random() * W; y = H + size + 5; vx = (Math.random() - 0.5) * 1.5; vy = -spd; }
    else { x = -size - 5; y = Math.random() * H; vx = spd; vy = (Math.random() - 0.5) * 1.5; }

    const hues = [0, 20, 40, 160, 180, 270, 300, 330];
    const shapes = ['rect', 'circle', 'tri', 'diamond'];
    obstacles.push({
      x, y, vx, vy, isBig, isFast, size,
      hue: hues[Math.floor(Math.random() * hues.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.08,
    });
  }

  // ----------------------------------------------------------
  // Partículas
  // ----------------------------------------------------------
  function emitParticles(x, y, hue, n, big) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = big ? (2 + Math.random() * 6) : (1 + Math.random() * 3);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        hue,
        size: big ? (3 + Math.random() * 4) : (1.5 + Math.random() * 2.5),
      });
    }
  }

  // ----------------------------------------------------------
  // Colisión
  // ----------------------------------------------------------
  function checkCollision(o) {
    const dx = player.x - o.x, dy = player.y - o.y;
    return Math.sqrt(dx * dx + dy * dy) < RADIUS + o.size / 2 * 0.78;
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  function lerp(a, b, t) { return a + (b - a) * t; }

  function drawObstacle(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    const col = `hsla(${o.hue},100%,${o.isBig ? 60 : 70}%,${o.isBig ? 1 : o.isFast ? 0.9 : 0.85})`;
    ctx.strokeStyle = col;
    ctx.lineWidth = o.isBig ? 2.5 : (o.isFast ? 1.2 : 1.8);
    ctx.shadowColor = col;
    ctx.shadowBlur = o.isBig ? 18 : (o.isFast ? 6 : 12);
    ctx.beginPath();
    const s = o.size / 2;
    if (o.shape === 'rect') { ctx.rect(-s, -s, o.size, o.size); }
    else if (o.shape === 'circle') { ctx.arc(0, 0, s, 0, Math.PI * 2); }
    else if (o.shape === 'tri') { ctx.moveTo(0, -s); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); }
    else { ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    player.hue = (player.hue + 1.5) % 360;
    trailPoints.unshift({ x: player.x, y: player.y, hue: player.hue });
    if (trailPoints.length > TRAIL_LENGTH) trailPoints.pop();

    for (let i = 1; i < trailPoints.length; i++) {
      const t = trailPoints[i];
      const a = 1 - i / trailPoints.length;
      ctx.beginPath();
      ctx.arc(t.x, t.y, RADIUS * (1 - i / trailPoints.length) * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${t.hue},100%,65%,${a * 0.25})`;
      ctx.fill();
    }

    ctx.save();
    ctx.shadowColor = `hsl(${player.hue},100%,70%)`;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(player.x, player.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${player.hue},100%,68%)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x, player.y, RADIUS * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  // ----------------------------------------------------------
  // Loop principal
  // ----------------------------------------------------------
  function loop(now) {
    if (state !== 'playing') return;
    frame++;
    elapsedMs = now - startTime;

    const cfg = getDiffConfig(elapsedMs);

    // Notificar fases a UI
    const phase = elapsedMs < 10000 ? 0 : elapsedMs < 20000 ? 1 : elapsedMs < 30000 ? 2 : 3;
    if (phase !== lastPhaseNotified) {
      lastPhaseNotified = phase;
      if (onPhaseCallback) onPhaseCallback(phase);
    }

    score += getScoreRate(elapsedMs) / 60;

    spawnAccum++;
    if (spawnAccum >= cfg.spawnRate) { spawnObstacle(cfg); spawnAccum = 0; }

    ctx.fillStyle = 'rgba(10,10,18,0.20)';
    ctx.fillRect(0, 0, W, H);

    player.x = lerp(player.x, player.tx, LERP);
    player.y = lerp(player.y, player.ty, LERP);
    player.x = Math.max(RADIUS, Math.min(W - RADIUS, player.x));
    player.y = Math.max(RADIUS, Math.min(H - RADIUS, player.y));

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x += o.vx; o.y += o.vy; o.rot += o.rotV;
      const margin = o.size + 10;
      if (o.x < -margin || o.x > W + margin || o.y < -margin || o.y > H + margin) {
        obstacles.splice(i, 1);
        emitParticles(Math.max(0, Math.min(W, o.x)), Math.max(0, Math.min(H, o.y)), o.hue, o.isBig ? 5 : 2, o.isBig);
        continue;
      }
      if (checkCollision(o)) {
        state = 'dead';
        emitParticles(player.x, player.y, player.hue, 50, true);
        if (onDeathCallback) onDeathCallback({ score: Math.floor(score), timeMs: elapsedMs });
        return;
      }
      drawObstacle(o);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.028; p.vx *= 0.93; p.vy *= 0.93;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,65%,${p.life})`;
      ctx.shadowColor = `hsla(${p.hue},100%,65%,0.4)`;
      ctx.shadowBlur = 6;
      ctx.fill();
    }

    drawPlayer();
    requestAnimationFrame(loop);
  }

  // ----------------------------------------------------------
  // API pública
  // ----------------------------------------------------------
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      player.tx = (e.clientX - r.left) * (W / r.width);
      player.ty = (e.clientY - r.top) * (H / r.height);
    });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      player.tx = (e.touches[0].clientX - r.left) * (W / r.width);
      player.ty = (e.touches[0].clientY - r.top) * (H / r.height);
    }, { passive: false });
  }

  function start() {
    player = { x: W / 2, y: H / 2, r: RADIUS, tx: W / 2, ty: H / 2, hue: 160 };
    obstacles = []; particles = []; trailPoints = [];
    score = 0; frame = 0; spawnAccum = 0;
    startTime = performance.now(); elapsedMs = 0;
    lastPhaseNotified = -1;
    state = 'playing';
    requestAnimationFrame(loop);
  }

  function getState() { return { score: Math.floor(score), elapsedMs, state }; }
  function onDeath(cb) { onDeathCallback = cb; }
  function onPhase(cb) { onPhaseCallback = cb; }

  return { init, start, getState, onDeath, onPhase };
})();
