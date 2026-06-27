// =============================================================
// music.js · Música procedural para Neon Dodge
// Piano + synth, melodía real que escala por fases.
// Fases: 0 (0-10s) 1 (10-20s) 2 (20-30s) 3 (30s+, loop)
// =============================================================

const NeonMusic = (() => {

  let ctx = null;
  let master = null;
  let running = false;
  let phase = 0;
  let loopTimeout = null;
  let barCount = 0;

  // ----------------------------------------------------------
  // Utilidades de síntesis
  // ----------------------------------------------------------
  function piano(freq, when, duration, vol = 0.4) {
    // Imita el ataque percusivo + decaimiento del piano
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.01; // leve armónico

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(master);

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(vol * 0.3, when + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc1.start(when); osc1.stop(when + duration + 0.05);
    osc2.start(when); osc2.stop(when + duration + 0.05);
  }

  function synth(freq, when, duration, vol = 0.18) {
    // Synth suave tipo pad — para acordes de fondo
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    filt.Q.value = 0.8;

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(master);

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.06);
    gain.gain.setValueAtTime(vol, when + duration - 0.1);
    gain.gain.linearRampToValueAtTime(0, when + duration);

    osc.start(when); osc.stop(when + duration + 0.05);
  }

  function kick(when) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.07);
    osc.connect(gain); gain.connect(master);
    gain.gain.setValueAtTime(0.7, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
    osc.start(when); osc.stop(when + 0.22);
  }

  function hihat(when, vol = 0.06) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 8000;
    const gain = ctx.createGain();
    src.connect(filt); filt.connect(gain); gain.connect(master);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.start(when); src.stop(when + 0.06);
  }

  // ----------------------------------------------------------
  // Escala: La menor natural (A B C D E F G A)
  // Frecuencias de referencia en octavas 3, 4 y 5
  // ----------------------------------------------------------
  const N = {
    A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66,
    E4: 329.63, F4: 349.23, G4: 392.00,
    A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33,
    E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
    // Acordes de acompañamiento (octava baja)
    A2: 110.00, C3: 130.81, E3: 164.81, G3: 196.00,
    F3: 174.61, D3: 146.83, E2: 82.41,
  };

  // ----------------------------------------------------------
  // BPM y duración de beat
  // ----------------------------------------------------------
  const BPM = 100;
  const B = 60 / BPM; // duración de un beat en segundos

  // ----------------------------------------------------------
  // Acordes de acompañamiento: Am - F - C - G (loop de 4 compases)
  // Cada compás = 4 beats
  // ----------------------------------------------------------
  const CHORD_ROOTS = [
    [N.A2, N.C3, N.E3],   // Am
    [N.F3, N.A3, N.C4],   // F
    [N.C3, N.E3, N.G3],   // C
    [N.G3, N.B3, N.D4],   // G
  ];

  // ----------------------------------------------------------
  // Melodía principal — misma frase en todos los compases,
  // pero la instrumentación y el acompañamiento escalan.
  // Frase de 8 beats (2 compases), se repite x2 por bloque.
  //
  // Formato: [nota, duración_en_beats]
  // ----------------------------------------------------------
  const MELODY = [
    // compás 1
    [N.E4, 1], [N.D4, 0.5], [N.E4, 0.5], [N.A4, 1], [N.G4, 1],
    // compás 2
    [N.F4, 1], [N.E4, 1], [N.D4, 1], [null, 1],
    // compás 3
    [N.C4, 0.5], [N.D4, 0.5], [N.E4, 1], [N.A4, 0.75], [N.G4, 0.25], [N.F4, 1],
    // compás 4
    [N.E4, 2], [N.A3, 1], [null, 1],
  ];

  // Melodía adicional para fase 2+ (contrapunto en octava alta)
  const MELODY_HIGH = [
    [N.A5, 0.5], [N.G5, 0.5], [N.A5, 1], [N.E5, 1], [N.C5, 1],
    [N.F5, 0.5], [N.E5, 0.5], [N.D5, 1], [N.C5, 0.5], [N.B4, 0.5], [N.A4, 0.5],
    [N.E5, 0.5], [N.D5, 0.5], [N.C5, 0.5], [N.B4, 0.5], [N.A4, 0.5], [N.G4, 0.5], [N.F4, 0.5], [N.E4, 0.5],
    [N.A4, 0.25], [N.B4, 0.25], [N.C5, 0.25], [N.D5, 0.25], [N.E5, 2], [N.A5, 1],
  ];

  // Arpegio por acorde — toca las notas del acorde en semicorcheas
  // [raiz, tercera, quinta, octava, quinta, tercera] → sube y baja
  function scheduleArp(chord, startTime, beats, vol) {
    const notes = [chord[0], chord[1], chord[2], chord[2] * 2, chord[1] * 2, chord[0] * 2, chord[1] * 2, chord[2]];
    const step  = B * 0.5; // cada corchea
    const total = Math.floor(beats / 0.5);
    for (let i = 0; i < total; i++) {
      const note = notes[i % notes.length];
      piano(note, startTime + i * step, step * 0.8, vol);
    }
  }

  // ----------------------------------------------------------
  // Planificador de un bloque de 4 compases
  // ----------------------------------------------------------
  function scheduleBlock(startTime) {
    const p = Math.min(phase, 3);
    const totalBeats = 16; // 4 compases × 4 beats

    // ── Acompañamiento base (siempre, desde fase 0) ───────────
    for (let c = 0; c < 4; c++) {
      const t     = startTime + c * 4 * B;
      const chord = CHORD_ROOTS[c];

      // Acorde sostenido con synth — desde fase 0, volumen crece
      const padVol = [0.08, 0.11, 0.14, 0.22][p];
      chord.forEach((freq, i) => synth(freq, t, 3.8 * B, padVol - i * 0.015));

      // Bajo pulsante en beats 1 y 3 — desde fase 0
      const bassVol = [0.20, 0.25, 0.30, 0.48][p];
      piano(chord[0] / 2, t,           B * 0.85, bassVol);
      piano(chord[0] / 2, t + 2 * B,  B * 0.85, bassVol * 0.85);
      // Bajo extra en beat 4 solo en fase 3 (síncopa)
      if (p >= 3) piano(chord[0] / 2, t + 3 * B, B * 0.5, bassVol * 0.65);

      // Arpegio en corcheas — desde fase 0 (volumen crece)
      const arpVol = [0.14, 0.18, 0.22, 0.34][p];
      scheduleArp(chord, t, 4, arpVol);

      // Arpegio rápido en semicorcheas encima (solo fase 3)
      if (p >= 3) {
        const highNotes = [chord[1] * 2, chord[2] * 2, chord[0] * 4, chord[2] * 2];
        const qStep = B * 0.25;
        for (let i = 0; i < 16; i++) {
          synth(highNotes[i % highNotes.length], t + i * qStep, qStep * 0.75, 0.10);
        }
      }
    }

    // ── Melodía principal (piano) ──────────────────────────────
    let t = startTime;
    const melVol = [0.38, 0.42, 0.46, 0.50][p];
    MELODY.forEach(([freq, dur]) => {
      if (freq !== null) piano(freq, t, dur * B * 0.88, melVol);
      t += dur * B;
    });

    // ── Segunda voz: contrapunto medio (fase 1+) ───────────────
    // Melodía secundaria en la octava de en medio, más suave
    if (p >= 1) {
      const MELODY2 = [
        [N.C4, 0.5], [N.E4, 0.5], [N.G4, 1],   [N.A4, 1],   [N.G4, 1],
        [N.A4, 0.5], [N.G4, 0.5], [N.F4, 0.5],  [N.E4, 0.5], [N.D4, 1], [N.C4, 1],
        [N.E4, 1],   [N.G4, 1],   [N.A4, 0.5],  [N.B4, 0.5], [N.A4, 1],
        [N.G4, 0.5], [N.F4, 0.5], [N.E4, 0.5],  [N.D4, 0.5], [N.C4, 2],
      ];
      let t2 = startTime;
      const vol2 = [0, 0.16, 0.20, 0.24][p];
      MELODY2.forEach(([freq, dur]) => {
        if (freq !== null) synth(freq, t2, dur * B * 0.82, vol2);
        t2 += dur * B;
      });
    }

    // ── Contrapunto alto (fase 2+) ─────────────────────────────
    if (p >= 2) {
      let th = startTime;
      const volH = [0, 0, 0.12, 0.16][p];
      MELODY_HIGH.forEach(([freq, dur]) => {
        if (freq !== null) synth(freq, th, dur * B * 0.85, volH);
        th += dur * B;
      });
    }

    // ── Batería ────────────────────────────────────────────────
    // Fase 0: hihat muy sutil en cada beat (ritmo sin percusión agresiva)
    // Fase 1+: kick + snare + hihat completo
    for (let beat = 0; beat < totalBeats; beat++) {
      const t        = startTime + beat * B;
      const beatInBar = beat % 4;

      if (p === 0) {
        hihat(t, 0.030);
      } else if (p < 3) {
        if (beatInBar === 0 || beatInBar === 2) kick(t);
        hihat(t, 0.055);
        if (p >= 2) hihat(t + B * 0.5, 0.038);
      } else {
        // Fase 3: kick en cada beat + doble en beat 3, hihat en semicorcheas
        kick(t);
        if (beatInBar === 2) kick(t + B * 0.5);
        hihat(t,            0.07);
        hihat(t + B * 0.25, 0.04);
        hihat(t + B * 0.5,  0.06);
        hihat(t + B * 0.75, 0.04);
      }
    }

    barCount += 4;
  }

  // ----------------------------------------------------------
  // Loop — agenda el siguiente bloque justo antes de que acabe
  // ----------------------------------------------------------
  let nextBlockTime = 0;
  const BLOCK_DURATION = 16 * (60 / BPM); // 4 compases en segundos

  function scheduleLoop() {
    if (!running) return;
    scheduleBlock(nextBlockTime);
    nextBlockTime += BLOCK_DURATION;
    // Agenda el siguiente bloque 200ms antes de que acabe el actual
    const delay = (nextBlockTime - ctx.currentTime - 0.2) * 1000;
    loopTimeout = setTimeout(scheduleLoop, Math.max(0, delay));
  }

  // ----------------------------------------------------------
  // API pública
  // ----------------------------------------------------------
  function start() {
    if (running) return;
    ctx    = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    phase         = 0;
    barCount      = 0;
    running       = true;
    nextBlockTime = ctx.currentTime + 0.05;

    // Fade in suave al arrancar
    master.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 1.5);

    scheduleLoop();
  }

  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(loopTimeout);

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 1.2);

    setTimeout(() => {
      try { ctx.close(); } catch(e) {}
      ctx = null; master = null; phase = 0; barCount = 0;
    }, 1300);
  }

  function setPhase(newPhase) {
    if (!running || newPhase === phase) return;
    phase = newPhase;
    // Pequeño bump de volumen al subir de fase
    if (ctx) {
      const now = ctx.currentTime;
      const current = master.gain.value;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(current, now);
      master.gain.linearRampToValueAtTime(Math.min(1, current + 0.05), now + 0.5);
    }
  }

  function getPhase() { return phase; }

  // Volumen base guardado para restaurar tras unmute
  let _targetVol = 0.8;

  function setVolume(val) {
    // val: 0–1
    _targetVol = val;
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(val, now + 0.08);
  }

  function mute() {
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.15);
  }

  function unmute() {
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(_targetVol, now + 0.15);
  }

  return { start, stop, setPhase, getPhase, setVolume, mute, unmute };

})();
