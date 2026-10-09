/* Jam mode: listens through the mic, detects strum onsets, and scores them against the chart. */
(function () {
  'use strict';
  const GS = window.GS;

  const WIN_PERFECT = 0.055;
  const WIN_GOOD = 0.105;
  const WIN_OK = 0.17;
  const SUB = 128;

  const jam = {
    active: false,
    level: 0,
    stats: null,

    reset() {
      this.stats = { score: 0, streak: 0, bestStreak: 0, judged: 0, good: 0, perfect: 0, miss: 0 };
    },

    async start(engine, player, { onJudge }) {
      const ctx = engine.ctx;
      this.reset();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      this.player = player;
      this.onJudge = onJudge;
      this.src = ctx.createMediaStreamSource(this.stream);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 90;
      this.proc = ctx.createScriptProcessor(512, 1, 1);
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      this.src.connect(hp);
      hp.connect(this.proc);
      this.proc.connect(this.sink);
      this.sink.connect(ctx.destination);

      let fast = 0;
      let slow = 0.001;
      let lastOnset = 0;
      const sr = ctx.sampleRate;
      // What you hear is late by the output latency, and what the mic hears is late again on the way in.
      const comp = (ctx.outputLatency || ctx.baseLatency || 0.02) + 0.025;
      this.proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        const blockStart = ctx.currentTime - d.length / sr;
        let peak = 0;
        for (let o = 0; o < d.length; o += SUB) {
          let s = 0;
          for (let i = o; i < o + SUB; i++) s += d[i] * d[i];
          const rms = Math.sqrt(s / SUB);
          peak = Math.max(peak, rms);
          fast = rms > fast ? rms : fast * 0.6 + rms * 0.4;
          slow = slow * 0.985 + rms * 0.015;
          const t = blockStart + o / sr;
          if (fast > slow * 2.4 && fast > 0.012 && t - lastOnset > 0.085) {
            lastOnset = t;
            this.judge(t - comp);
          }
        }
        this.level = this.level * 0.7 + peak * 0.3;
      };
      this.missTimer = setInterval(() => this.sweepMisses(), 60);
      this.active = true;
    },

    stop() {
      this.active = false;
      clearInterval(this.missTimer);
      if (this.proc) {
        this.proc.onaudioprocess = null;
        this.proc.disconnect();
      }
      if (this.src) this.src.disconnect();
      if (this.sink) this.sink.disconnect();
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.level = 0;
    },

    judgeable(hit) {
      return hit.kind !== 'mute' && (hit.dir === 'down' || hit.kind === 'pick');
    },

    judge(t) {
      const p = this.player;
      if (!p || p.state !== 'playing') return;
      let best = null;
      let bestDt = Infinity;
      for (const item of p.scheduled) {
        if (item.matched || item.missed) continue;
        const dt = t - item.time;
        if (Math.abs(dt) < Math.abs(bestDt)) {
          bestDt = dt;
          best = item;
        }
      }
      if (!best || Math.abs(bestDt) > WIN_OK) return;
      best.matched = true;
      const st = this.stats;
      const a = Math.abs(bestDt);
      let label;
      let color;
      let pts;
      if (a <= WIN_PERFECT) {
        label = 'PERFECT';
        color = '#35e0c2';
        pts = 100;
        st.perfect++;
        st.good++;
      } else if (a <= WIN_GOOD) {
        label = 'GOOD';
        color = '#ffc23d';
        pts = 60;
        st.good++;
      } else {
        label = bestDt < 0 ? 'EARLY' : 'LATE';
        color = '#ff8a4c';
        pts = 20;
      }
      st.judged++;
      st.streak = pts >= 60 ? st.streak + 1 : 0;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      const mult = 1 + Math.min(3, Math.floor(st.streak / 8));
      st.score += pts * mult;
      if (this.onJudge) this.onJudge({ label: mult > 1 && pts >= 60 ? `${label} ×${mult}` : label, color });
    },

    sweepMisses() {
      const p = this.player;
      if (!p || p.state !== 'playing') return;
      const now = p.e.now - WIN_OK - 0.05;
      for (const item of p.scheduled) {
        if (item.matched || item.missed || item.time > now) continue;
        item.missed = true;
        if (!this.judgeable(item.hit)) continue;
        this.stats.miss++;
        this.stats.judged++;
        this.stats.streak = 0;
        if (this.onJudge) this.onJudge({ label: 'MISS', color: '#ff5c8a' });
      }
    },
  };

  jam.reset();
  GS.jam = jam;
})();
