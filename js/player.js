/* Transport: lookahead scheduler that maps song beats onto the audio clock (speed, loops, count-in). */
(function () {
  'use strict';
  const GS = window.GS;
  const TL = GS.timeline;

  const LOOKAHEAD = 0.14;
  const TICK_MS = 25;
  const START_DELAY = 0.09;

  class Player {
    constructor(engine) {
      this.e = engine;
      this.tl = null;
      this.state = 'idle';
      this.speed = 1;
      this.capo = 0;
      this.loop = null;
      this.countIn = true;
      this.metronome = false;
      this.anchors = [];
      this.pausedBeat = 0;
      this.sess = null;
      this.timer = null;
      this.handlers = {};
      this.scheduled = [];
    }

    on(evt, fn) {
      (this.handlers[evt] = this.handlers[evt] || []).push(fn);
      return () => (this.handlers[evt] = this.handlers[evt].filter((f) => f !== fn));
    }

    emit(evt, data) {
      (this.handlers[evt] || []).forEach((fn) => fn(data));
    }

    load(tl, { capo = 0 } = {}) {
      this.stop();
      this.tl = tl;
      this.capo = capo;
      this.loop = null;
      this.pausedBeat = 0;
      this.setState('ready');
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.emit('state', s);
    }

    get playing() {
      return this.state === 'playing';
    }

    secPerBeat() {
      return 60 / (this.tl.bpm * this.speed);
    }

    beatAt(time) {
      const a = this.anchors;
      if (!a.length) return this.pausedBeat;
      let i = a.length - 1;
      while (i > 0 && a[i].time > time) i--;
      return a[i].beat + (time - a[i].time) / this.secPerBeat();
    }

    get beat() {
      if (this.state !== 'playing') return this.pausedBeat;
      return this.beatAt(this.e.now);
    }

    get seconds() {
      return (Math.max(0, this.beat) * 60) / this.tl.bpm;
    }

    async prepare(onProgress) {
      await this.e.resume();
      await this.e.bank.prepare(TL.guitarMidis(this.tl, this.capo), TL.bassMidis(this.tl, this.capo), onProgress);
    }

    async play({ countIn } = {}) {
      if (!this.tl || this.state === 'playing') return;
      await this.prepare();
      if (this.state === 'ended' || this.pausedBeat >= this.tl.totalBeats) this.pausedBeat = this.loop ? this.loop.start : 0;
      const useCount = countIn == null ? this.countIn : countIn;
      const start = this.pausedBeat - (useCount ? this.tl.meter : 0);
      this.startAt(start);
    }

    startAt(beat) {
      this.e.killSession(this.sess);
      this.sess = this.e.newSession();
      const t = this.e.now + START_DELAY;
      this.anchors = [{ time: t, beat }];
      this.schedBeat = beat;
      this.scheduled = [];
      this.setState('playing');
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.tick();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.pausedBeat = Math.max(0, Math.min(this.tl.totalBeats, this.beat));
      this.halt();
      this.setState('paused');
    }

    stop() {
      this.halt();
      this.pausedBeat = 0;
      if (this.tl) this.setState('ready');
    }

    halt() {
      clearInterval(this.timer);
      this.timer = null;
      this.e.killSession(this.sess);
      this.sess = null;
      this.anchors = [];
    }

    toggle() {
      if (this.state === 'playing') this.pause();
      else this.play();
    }

    seek(beat, { countIn = false } = {}) {
      beat = Math.max(0, Math.min(this.tl.totalBeats - 0.001, beat));
      const was = this.state === 'playing';
      this.halt();
      this.pausedBeat = beat;
      if (was) this.startAt(beat - (countIn ? this.tl.meter : 0));
      else this.setState('paused');
      this.emit('seek', beat);
    }

    // Changing tempo or pitch re-anchors at the current beat so the timeline never jumps.
    restartHere() {
      if (this.state === 'playing') this.startAt(Math.max(0, this.beat));
    }

    setSpeed(x) {
      const b = this.beat;
      const was = this.state === 'playing';
      if (was) this.halt();
      this.speed = x;
      if (was) {
        this.pausedBeat = Math.max(0, b);
        this.startAt(this.pausedBeat);
      }
    }

    async setCapo(c) {
      this.capo = c;
      if (this.state === 'playing') {
        const b = this.beat;
        this.halt();
        await this.prepare();
        this.pausedBeat = Math.max(0, b);
        this.startAt(this.pausedBeat);
      }
    }

    setLoop(range) {
      this.loop = range;
      this.emit('loop', range);
      if (range && this.state === 'playing') {
        const b = this.beat;
        if (b < range.start || b >= range.end) this.seek(range.start);
        else this.restartHere();
      }
    }

    tick() {
      if (this.state !== 'playing') return;
      const now = this.e.now;
      const horizon = now + LOOKAHEAD;
      const spb = this.secPerBeat();
      let guard = 0;
      while (guard++ < 8) {
        const a = this.anchors[this.anchors.length - 1];
        const endBeat = a.beat + (horizon - a.time) / spb;
        const lp = this.loop;
        if (lp && this.schedBeat < lp.end && endBeat >= lp.end) {
          this.scheduleRange(this.schedBeat, lp.end, a, spb);
          this.anchors.push({ time: a.time + (lp.end - a.beat) * spb, beat: lp.start });
          this.schedBeat = lp.start;
          continue;
        }
        if (endBeat > this.schedBeat) this.scheduleRange(this.schedBeat, endBeat, a, spb);
        this.schedBeat = Math.max(this.schedBeat, endBeat);
        break;
      }
      while (this.anchors.length > 1 && this.anchors[1].time <= now) this.anchors.shift();
      this.scheduled = this.scheduled.filter((x) => x.time > now - 1.5);

      const b = this.beatAt(now);
      if (!this.loop && b >= this.tl.totalBeats + this.tl.meter * 0.5) {
        clearInterval(this.timer);
        this.timer = null;
        this.pausedBeat = this.tl.totalBeats;
        this.setState('ended');
        this.emit('end');
        // Let the last chord ring out before releasing the session.
        const sess = this.sess;
        setTimeout(() => {
          if (this.sess === sess && this.state === 'ended') {
            this.e.killSession(sess, 0.8);
            this.sess = null;
          }
        }, 2600);
      }
    }

    scheduleRange(b0, b1, anchor, spb) {
      const tl = this.tl;
      const e = this.e;
      const sess = this.sess;
      const timeOf = (b) => anchor.time + (b - anchor.beat) * spb;
      const floor = e.now;

      // Metronome: the count-in always clicks; afterwards only when enabled.
      const pulse = tl.pulse || 1;
      for (let k = Math.ceil(b0 - 1e-9); k < b1; k++) {
        if (k < 0 || this.metronome) {
          const inBar = ((k % tl.meter) + tl.meter) % tl.meter;
          if (inBar % pulse !== 0 && k >= 0) continue;
          const level = inBar === 0 ? 2 : inBar % pulse === 0 && pulse > 1 ? 1 : k < 0 ? 1 : 0;
          const t = timeOf(k);
          if (t >= floor) e.playClick(sess, t, level);
        }
      }
      if (b1 <= 0) return;

      const hits = tl.hits;
      for (let i = TL.lowerBound(hits, Math.max(0, b0)); i < hits.length && hits[i].beat < b1; i++) {
        const h = hits[i];
        const t = timeOf(h.beat);
        if (t < floor - 0.005) continue;
        e.strum(sess, h, t, this.capo, this.speed);
        this.scheduled.push({ hit: h, time: t });
      }
      const band = tl.band;
      for (let i = TL.lowerBound(band, Math.max(0, b0)); i < band.length && band[i].beat < b1; i++) {
        const n = band[i];
        const t = timeOf(n.beat);
        if (t < floor - 0.005) continue;
        if (n.inst === 'bass') e.playBass(sess, n.midi + this.capo, t, n.vel);
        else e.playDrum(sess, n.inst, t, n.vel);
      }
    }
  }

  GS.Player = Player;
})();
