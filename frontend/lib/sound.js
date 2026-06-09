/* ============================================================
   COPA DRAFT — lib/sound.js
   Tiny WebAudio SFX (Phase 4). No audio files — everything is
   synthesized from oscillators + a noise burst. One shared
   AudioContext, resumed on first gesture. Global mute honored.
   Usage: window.SFX.play('goal');  window.SFX.setEnabled(false)
   ============================================================ */
(function () {
  let ctx = null;
  let enabled = true;
  let master = null;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // a single enveloped oscillator tone
  function tone({ freq = 440, type = 'sine', start = 0, dur = 0.15, gain = 0.3, glideTo = null }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // short filtered noise burst (whistle/crowd/save thud)
  function noise({ start = 0, dur = 0.18, gain = 0.25, type = 'highpass', freq = 1200 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur);
  }

  const PATTERNS = {
    dice:   () => { noise({ dur: 0.12, gain: 0.18, freq: 2500 }); tone({ freq: 320, type: 'square', dur: 0.06, gain: 0.12 }); tone({ freq: 440, type: 'square', start: 0.07, dur: 0.06, gain: 0.12 }); },
    pick:   () => { tone({ freq: 660, type: 'triangle', dur: 0.09, gain: 0.22 }); tone({ freq: 990, type: 'triangle', start: 0.05, dur: 0.08, gain: 0.16 }); },
    select: () => { tone({ freq: 520, type: 'sine', dur: 0.07, gain: 0.18 }); },
    whistle:() => { tone({ freq: 1800, type: 'square', dur: 0.1, gain: 0.12, glideTo: 2100 }); tone({ freq: 1800, type: 'square', start: 0.13, dur: 0.18, gain: 0.12, glideTo: 2050 }); },
    goal:   () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'sawtooth', start: i * 0.08, dur: 0.18, gain: 0.16 })); noise({ start: 0, dur: 0.5, gain: 0.08, type: 'bandpass', freq: 1200 }); },
    // opponent's goal: sober, descending low tones — deliberately un-celebratory
    goalAway: () => { [330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'sine', start: i * 0.1, dur: 0.26, gain: 0.16, glideTo: f * 0.85 })); tone({ freq: 110, type: 'square', dur: 0.34, gain: 0.08 }); },
    save:   () => { tone({ freq: 180, type: 'square', dur: 0.14, gain: 0.25, glideTo: 90 }); noise({ dur: 0.12, gain: 0.12, freq: 600 }); },
    miss:   () => { tone({ freq: 300, type: 'sine', dur: 0.3, gain: 0.2, glideTo: 120 }); },
    ach:    () => { [659, 880, 1175, 1318].forEach((f, i) => tone({ freq: f, type: 'triangle', start: i * 0.07, dur: 0.16, gain: 0.16 })); },
    win:    () => { [523, 523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'sawtooth', start: i * 0.13, dur: 0.22, gain: 0.18 })); },
    lose:   () => { [392, 330, 262].forEach((f, i) => tone({ freq: f, type: 'sine', start: i * 0.16, dur: 0.3, gain: 0.2 })); },
  };

  function play(name) {
    if (!enabled) return;
    if (!ensure()) return;
    const p = PATTERNS[name];
    if (p) try { p(); } catch (e) {}
  }
  function setEnabled(v) { enabled = !!v; if (enabled) ensure(); }
  function isEnabled() { return enabled; }
  // prime the context on first user gesture (autoplay policies)
  function prime() { ensure(); }

  window.SFX = { play, setEnabled, isEnabled, prime };
})();
