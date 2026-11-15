// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files and makes no network request. Sounds are short and
// cheap: one oscillator or noise buffer per effect, reused where possible.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function burst(freq, dur, gain, type = 'square') {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(dur, gain, cutoff) {
    const c = ensure();
    if (!c || !noiseBuf) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur);
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    shot(kind) {
      if (kind === 'shotgun') noise(0.22, 0.5, 1400);
      else if (kind === 'pistol') noise(0.1, 0.32, 2400);
      else noise(0.12, 0.4, 1800);
      burst(160, 0.07, 0.18);
    },
    enemyShot() {
      noise(0.1, 0.16, 1200);
    },
    hit() {
      burst(880, 0.05, 0.14, 'sine');
    },
    kill() {
      burst(660, 0.08, 0.16, 'sine');
      burst(990, 0.1, 0.14, 'sine');
    },
    hurt() {
      burst(120, 0.16, 0.3, 'sawtooth');
    },
    reload() {
      burst(1400, 0.04, 0.1, 'sine');
    },
    dry() {
      burst(2200, 0.03, 0.08, 'sine');
    },
    grenade() {
      noise(0.7, 0.6, 500);
      burst(60, 0.6, 0.5, 'sine');
    },
    beep(final) {
      burst(final ? 1760 : 1170, 0.09, 0.16, 'sine');
    },
    plant() {
      burst(520, 0.12, 0.16, 'sine');
      burst(780, 0.14, 0.16, 'sine');
    },
    roundWin() {
      burst(523, 0.14, 0.16, 'sine');
      burst(659, 0.14, 0.16, 'sine');
      burst(784, 0.22, 0.18, 'sine');
    },
    roundLose() {
      burst(392, 0.16, 0.16, 'sine');
      burst(311, 0.24, 0.16, 'sine');
    },
    buy() {
      burst(1046, 0.06, 0.12, 'sine');
    },
  };
}
