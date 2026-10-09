/* Physical-model string synthesis (extended Karplus–Strong) rendered into reusable AudioBuffers. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // One vibrating polarization of a string, mixed into `out`.
  // Loop delay = L (ring buffer) + S (two-point loss filter) + f (allpass) = sr / freq exactly.
  function addString(out, freq, sr, o, rand, gain) {
    const N = sr / freq;
    const S = o.stretch;
    let L = Math.floor(N - S);
    let f = N - S - L;
    if (f < 0.2) {
      L -= 1;
      f += 1;
    }
    const C = (1 - f) / (1 + f);
    const rho = Math.pow(0.001, 1 / (o.t60 * freq));

    const ex = new Float32Array(L);
    const k = 0.06 + 0.9 * o.bright * o.bright;
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < L; i++) {
      lp += k * (rand() * 2 - 1 - lp);
      ex[i] = lp;
      mean += lp;
    }
    mean /= L;
    // Comb at the pluck point removes harmonics with a node there — the "where you pick" timbre.
    const P = Math.max(1, Math.round(L * o.pickPos));
    const dl = new Float32Array(L);
    let peak = 1e-9;
    for (let i = 0; i < L; i++) {
      dl[i] = ex[i] - mean - (ex[(i - P + L) % L] - mean);
      peak = Math.max(peak, Math.abs(dl[i]));
    }
    for (let i = 0; i < L; i++) dl[i] /= peak;

    let ptr = 0;
    let prev = 0;
    let apx = 0;
    let apy = 0;
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const x0 = dl[ptr];
      const y = ((1 - S) * x0 + S * prev) * rho;
      prev = x0;
      const ap = C * y + apx - C * apy;
      apx = y;
      apy = ap;
      dl[ptr] = ap;
      out[i] += x0 * gain;
      if (++ptr === L) ptr = 0;
    }
  }

  function finish(out, sr, fadeSec) {
    // DC blocker, normalize, and fade the tail so buffers never click when they end.
    let x1 = 0;
    let y1 = 0;
    let peak = 1e-9;
    for (let i = 0; i < out.length; i++) {
      const y = out[i] - x1 + 0.995 * y1;
      x1 = out[i];
      y1 = y;
      out[i] = y;
      peak = Math.max(peak, Math.abs(y));
    }
    const g = 0.9 / peak;
    const fade = Math.floor(fadeSec * sr);
    const fs = out.length - fade;
    for (let i = 0; i < out.length; i++) {
      let v = out[i] * g;
      if (i >= fs) v *= 1 - (i - fs) / fade;
      out[i] = v;
    }
    return out;
  }

  function renderPluck(freq, sr, opts) {
    const o = Object.assign({ bright: 0.7, dur: 3.5, t60: 3, stretch: 0.5, pickPos: 0.13, seed: 1, body: 0.32 }, opts);
    const out = new Float32Array(Math.floor(o.dur * sr));
    addString(out, freq, sr, o, rng(o.seed), 1);
    if (o.body) {
      // Second, slightly detuned polarization gives the slow shimmer of a real string.
      addString(out, freq * 1.00065, sr, { ...o, t60: o.t60 * 0.7, pickPos: o.pickPos * 1.4 }, rng(o.seed * 7 + 3), o.body);
    }
    return finish(out, sr, Math.min(0.25, o.dur * 0.1));
  }

  function guitarVoice(midi, tone) {
    const T = GS.theory;
    const freq = T.midiToFreq(midi);
    const hi = Math.max(0, Math.min(1, (midi - 40) / 36));
    return {
      freq,
      opts: {
        bright: tone === 'hard' ? 0.88 : 0.58,
        t60: 7 * Math.pow(2, -(midi - 40) / 28),
        dur: midi < 55 ? 4.2 : 3.4,
        stretch: 0.5 - hi * 0.22,
        pickPos: tone === 'hard' ? 0.12 : 0.18,
        seed: midi * 31 + (tone === 'hard' ? 7 : 1),
        body: 0.32,
      },
    };
  }

  function bassVoice(midi) {
    const freq = GS.theory.midiToFreq(midi);
    return { freq, opts: { bright: 0.3, t60: 2.4, dur: 2.4, stretch: 0.5, pickPos: 0.22, seed: midi * 13 + 5, body: 0.2 } };
  }

  function makeNoise(ctx, sec) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(99);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  // Palm-muted chuck: a scratchy burst plus a short choked thump.
  function makeChuck(ctx) {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 0.09);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const r = rng(1234);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += 0.35 * (r() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t / 0.012) * 0.9 + Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t / 0.02) * 0.5;
    }
    return buf;
  }

  function makeImpulse(ctx, sec) {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const r = rng(c ? 777 : 333);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        // Darken the tail over time, like air absorbing highs in a room.
        const k = 0.75 * Math.exp(-t * 2.2) + 0.05;
        lp += k * (r() * 2 - 1 - lp);
        const pre = t < 0.012 ? t / 0.012 : 1;
        d[i] = lp * Math.exp(-t * 3.1) * pre;
      }
    }
    return buf;
  }

  class SoundBank {
    constructor(ctx) {
      this.ctx = ctx;
      this.buffers = new Map();
    }

    key(kind, midi, tone) {
      return kind + ':' + midi + ':' + (tone || '');
    }

    render(kind, midi, tone) {
      const k = this.key(kind, midi, tone);
      if (this.buffers.has(k)) return this.buffers.get(k);
      const v = kind === 'bass' ? bassVoice(midi) : guitarVoice(midi, tone);
      const data = renderPluck(v.freq, this.ctx.sampleRate, v.opts);
      const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buf.copyToChannel(data, 0);
      this.buffers.set(k, buf);
      return buf;
    }

    get(kind, midi, tone) {
      return this.buffers.get(this.key(kind, midi, tone)) || this.render(kind, midi, tone);
    }

    // Renders in small batches so the UI can keep animating while strings are "tuned".
    async prepare(guitarMidis, bassMidis, onProgress) {
      const jobs = [];
      for (const m of guitarMidis) for (const tone of ['hard', 'soft']) jobs.push(['gtr', m, tone]);
      for (const m of bassMidis) jobs.push(['bass', m, '']);
      const todo = jobs.filter(([k, m, t]) => !this.buffers.has(this.key(k, m, t)));
      for (let i = 0; i < todo.length; i++) {
        this.render(...todo[i]);
        if (i % 6 === 5) {
          if (onProgress) onProgress((i + 1) / todo.length);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (onProgress) onProgress(1);
    }
  }

  GS.synth = { renderPluck, guitarVoice, bassVoice, makeNoise, makeChuck, makeImpulse, SoundBank, rng };
})();
