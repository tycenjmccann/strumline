/* Web Audio graph: guitar body + room reverb, cajón-style kit, bass, metronome. */
(function () {
  'use strict';
  const GS = window.GS;
  const T = GS.theory;

  class Engine {
    constructor() {
      this.ctx = null;
      this.vol = { guitar: 0.9, band: 0.7, click: 0.7 };
      this.muted = { guitar: false, band: false, click: false };
    }

    init() {
      if (this.ctx) return this.ctx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));
      this.bank = new GS.synth.SoundBank(ctx);
      this.noise = GS.synth.makeNoise(ctx, 1.5);
      this.chuck = GS.synth.makeChuck(ctx);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.85;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(comp);
      comp.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = GS.synth.makeImpulse(ctx, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      this.reverb.connect(wet);
      wet.connect(this.master);

      // Acoustic body: low-mid warmth, a little top-end air, no boom.
      const chain = [
        this.biquad('highpass', 75, 0.7),
        this.biquad('peaking', 105, 1.2, 3.5),
        this.biquad('peaking', 230, 1.4, 2),
        this.biquad('peaking', 520, 1.6, -2.5),
        this.biquad('peaking', 3000, 0.9, 2),
        this.biquad('highshelf', 7500, 0.7, -5),
      ];
      for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
      const body = chain[chain.length - 1];

      this.bus = {};
      this.bus.guitar = ctx.createGain();
      this.bus.guitar.connect(chain[0]);
      body.connect(this.master);
      this.send(body, 0.45);

      this.bus.band = ctx.createGain();
      this.bus.band.connect(this.master);
      this.send(this.bus.band, 0.16);

      this.bus.click = ctx.createGain();
      this.bus.click.connect(this.master);
      this.applyVolumes();
      return ctx;
    }

    biquad(type, freq, q, gain) {
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      if (gain != null) f.gain.value = gain;
      return f;
    }

    send(node, amount) {
      const g = this.ctx.createGain();
      g.gain.value = amount;
      node.connect(g);
      g.connect(this.reverb);
    }

    async resume() {
      this.init();
      if (this.ctx.state !== 'running') await this.ctx.resume();
    }

    get now() {
      return this.ctx ? this.ctx.currentTime : 0;
    }

    setVolume(bus, v) {
      this.vol[bus] = v;
      this.applyVolumes();
    }

    setMuted(bus, m) {
      this.muted[bus] = m;
      this.applyVolumes();
    }

    applyVolumes() {
      if (!this.ctx) return;
      for (const k of ['guitar', 'band', 'click']) {
        const v = this.muted[k] ? 0 : this.vol[k];
        this.bus[k].gain.setTargetAtTime(v * v * 1.2, this.ctx.currentTime, 0.02);
      }
    }

    level() {
      if (!this.analyser) return 0;
      const a = (this._lvl = this._lvl || new Float32Array(this.analyser.fftSize));
      this.analyser.getFloatTimeDomainData(a);
      let s = 0;
      for (let i = 0; i < a.length; i += 4) s += a[i] * a[i];
      return Math.sqrt(s / (a.length / 4));
    }

    // A session owns every source for one continuous playback run so pause/seek can silence it at once.
    newSession() {
      const ctx = this.init();
      const sess = { sources: new Set(), voices: new Array(6).fill(null), bassVoice: null, alive: true, out: {}, pan: [] };
      for (const k of ['guitar', 'band', 'click']) {
        sess.out[k] = ctx.createGain();
        sess.out[k].connect(this.bus[k]);
      }
      for (let s = 0; s < 6; s++) {
        const p = ctx.createStereoPanner();
        p.pan.value = -0.22 + s * 0.088;
        p.connect(sess.out.guitar);
        sess.pan.push(p);
      }
      return sess;
    }

    killSession(sess, fade = 0.05) {
      if (!sess || !sess.alive) return;
      sess.alive = false;
      const t = this.ctx.currentTime;
      for (const k in sess.out) {
        const g = sess.out[k].gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + fade);
      }
      setTimeout(() => {
        for (const src of sess.sources) {
          try {
            src.stop();
          } catch (e) {
            /* already stopped */
          }
        }
        for (const k in sess.out) sess.out[k].disconnect();
      }, (fade + 0.08) * 1000);
    }

    track(sess, src) {
      sess.sources.add(src);
      src.onended = () => sess.sources.delete(src);
    }

    choke(sess, s, t, tau = 0.012) {
      const prev = sess.voices[s];
      if (!prev) return;
      prev.g.gain.setTargetAtTime(0, Math.max(t, prev.t), tau);
      try {
        prev.src.stop(Math.max(t, prev.t) + tau * 10);
      } catch (e) {
        /* already stopped */
      }
      sess.voices[s] = null;
    }

    playString(sess, s, midi, t, vel, tone) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.bank.get('gtr', midi, tone);
      src.detune.value = (Math.random() - 0.5) * 5;
      const g = ctx.createGain();
      g.gain.value = vel * vel * 0.42;
      src.connect(g);
      g.connect(sess.pan[s]);
      this.choke(sess, s, t);
      src.start(t);
      sess.voices[s] = { src, g, t };
      this.track(sess, src);
    }

    strum(sess, hit, t, capo, speed) {
      if (hit.kind === 'mute') return this.playMute(sess, hit, t);
      const order = hit.dir === 'down' ? hit.strings : hit.strings.slice().reverse();
      const tone = hit.kind === 'strum' && hit.dir === 'down' && hit.vel > 0.7 ? 'hard' : 'soft';
      if (hit.kind === 'pick') {
        for (const s of hit.strings) this.playString(sess, s, T.OPEN_MIDI[s] + hit.frets[s] + capo, t, hit.vel, 'soft');
        return;
      }
      // Harder strums are faster sweeps; centre the sweep on the beat.
      const sweep = (hit.dir === 'down' ? 0.03 : 0.022) * (1.25 - hit.vel * 0.45) * Math.min(1.2, 1 / Math.sqrt(speed));
      const step = order.length > 1 ? sweep / (order.length - 1) : 0;
      const t0 = t - sweep * 0.35;
      order.forEach((s, i) => {
        const jitter = (Math.random() - 0.5) * 0.003;
        const v = hit.vel * (1 - i * 0.025) * (0.94 + Math.random() * 0.1);
        this.playString(sess, s, T.OPEN_MIDI[s] + hit.frets[s] + capo, Math.max(this.ctx.currentTime, t0 + i * step + jitter), v, tone);
      });
    }

    playMute(sess, hit, t) {
      for (let s = 0; s < 6; s++) this.choke(sess, s, t, 0.006);
      const src = this.ctx.createBufferSource();
      src.buffer = this.chuck;
      const g = this.ctx.createGain();
      g.gain.value = hit.vel * 0.6;
      src.connect(g);
      g.connect(sess.out.guitar);
      src.start(t);
      this.track(sess, src);
    }

    playBass(sess, midi, t, vel) {
      const ctx = this.ctx;
      if (sess.bassVoice) {
        sess.bassVoice.g.gain.setTargetAtTime(0, t, 0.02);
        try {
          sess.bassVoice.src.stop(t + 0.2);
        } catch (e) {
          /* already stopped */
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = this.bank.get('bass', midi);
      const lp = this.biquad('lowpass', 950, 0.8);
      const g = ctx.createGain();
      g.gain.value = vel * 0.95;
      src.connect(lp);
      lp.connect(g);
      g.connect(sess.out.band);
      src.start(t);
      sess.bassVoice = { src, g };
      this.track(sess, src);
    }

    noiseHit(sess, t, { type, freq, q, decay, gain, attack = 0.001 }) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.biquad(type, freq, q);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
      src.connect(f);
      f.connect(g);
      g.connect(sess.out.band);
      const off = Math.random() * 0.8;
      src.start(t, off, attack + decay + 0.05);
      this.track(sess, src);
    }

    playDrum(sess, inst, t, vel) {
      const ctx = this.ctx;
      if (inst === 'kick') {
        // Cajón bass tone: a fast pitch drop with a soft knock on top.
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel * 0.95, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.connect(g);
        g.connect(sess.out.band);
        o.start(t);
        o.stop(t + 0.35);
        this.track(sess, o);
        this.noiseHit(sess, t, { type: 'lowpass', freq: 900, q: 0.7, decay: 0.03, gain: vel * 0.25 });
      } else if (inst === 'snare') {
        // Cajón slap: bright snap plus the wooden ring of the box.
        this.noiseHit(sess, t, { type: 'bandpass', freq: 2400, q: 0.8, decay: 0.13, gain: vel * 0.55 });
        this.noiseHit(sess, t, { type: 'highpass', freq: 5000, q: 0.5, decay: 0.07, gain: vel * 0.22 });
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(170, t + 0.06);
        g.gain.setValueAtTime(vel * 0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g);
        g.connect(sess.out.band);
        o.start(t);
        o.stop(t + 0.12);
        this.track(sess, o);
      } else if (inst === 'shaker') {
        this.noiseHit(sess, t, { type: 'highpass', freq: 6500, q: 0.6, decay: 0.05, gain: vel * 0.2, attack: 0.012 });
      }
    }

    playClick(sess, t, level) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = level === 2 ? 1760 : level === 1 ? 1320 : 990;
      const amp = level === 2 ? 0.5 : level === 1 ? 0.34 : 0.26;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g);
      g.connect(sess.out.click);
      o.start(t);
      o.stop(t + 0.06);
      this.track(sess, o);
    }

    // One-off chord preview for the Learn tab and chord cards.
    async previewChord(shape, { capo = 0, arpeggio = false } = {}) {
      await this.resume();
      const midis = shape.frets.map((f, s) => (f >= 0 ? T.OPEN_MIDI[s] + f + capo : null)).filter((m) => m != null);
      await this.bank.prepare(midis, []);
      if (this.preview) this.killSession(this.preview, 0.03);
      const sess = (this.preview = this.newSession());
      const t = this.ctx.currentTime + 0.05;
      const strings = shape.frets.map((f, s) => (f >= 0 ? s : null)).filter((s) => s != null);
      if (arpeggio) {
        strings.forEach((s, i) => this.playString(sess, s, T.OPEN_MIDI[s] + shape.frets[s] + capo, t + i * 0.16, 0.75, 'soft'));
        const tEnd = t + strings.length * 0.16 + 0.25;
        this.strum(sess, { kind: 'strum', dir: 'down', strings, frets: shape.frets, vel: 0.9 }, tEnd, capo, 1);
      } else {
        this.strum(sess, { kind: 'strum', dir: 'down', strings, frets: shape.frets, vel: 0.92 }, t, capo, 1);
      }
      return sess;
    }
  }

  GS.engine = new Engine();
})();
