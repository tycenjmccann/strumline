/* The note highway: a perspective fretboard where strums and picks fly toward the hit line. */
(function () {
  'use strict';
  const GS = window.GS;
  const TL = GS.timeline;

  const SECTION_COLORS = {
    intro: '#a8977f',
    verse: '#ffb547',
    prechorus: '#ff9f6b',
    chorus: '#ff6a3d',
    bridge: '#b48bff',
    solo: '#35e0c2',
    outro: '#a8977f',
  };
  const STRING_COLORS = ['#d3a46a', '#cf9f68', '#c99a66', '#c5a27a', '#dfe3ea', '#eef1f5'];

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function mix(hex, toHex, t) {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(toHex.slice(1), 16);
    const ch = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }

  function makeBokehSprite(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, rgba(color, 0.9));
    grd.addColorStop(0.45, rgba(color, 0.35));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  class Highway {
    constructor(canvas, { demo = false } = {}) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      this.demo = demo;
      this.tl = null;
      this.loop = null;
      this.flash = new Array(6).fill(0);
      this.flashColor = new Array(6).fill('#ffffff');
      this.vib = Array.from({ length: 6 }, () => ({ amp: 0, phase: 0 }));
      this.particles = [];
      this.rings = [];
      this.popups = [];
      this.lastBeat = null;
      this.lastNow = 0;
      this.sprites = ['#ffb547', '#ff6a3d', '#35e0c2', '#ff5c8a'].map(makeBokehSprite);
      const r = GS.synth.rng(42);
      this.bokeh = Array.from({ length: 34 }, () => ({
        x: r(),
        y: r() * 0.55,
        size: 10 + r() * 46,
        a: 0.05 + r() * 0.16,
        sp: (r() - 0.5) * 0.006,
        tw: r() * 6.28,
        sprite: Math.floor(r() * 4),
      }));
      this.grain = Array.from({ length: 16 }, () => ({ off: (r() - 0.5) * 2, a: 0.02 + r() * 0.05 }));
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
      this.resize();
    }

    destroy() {
      this.ro.disconnect();
    }

    setTimeline(tl) {
      this.tl = tl;
      this.lastBeat = null;
      this.resize();
    }

    setLoop(range) {
      this.loop = range;
    }

    resize() {
      const dpr = (this.dpr = Math.min(2, window.devicePixelRatio || 1));
      const w = Math.max(10, Math.floor(this.c.clientWidth * dpr));
      const h = Math.max(10, Math.floor(this.c.clientHeight * dpr));
      if (this.c.width !== w || this.c.height !== h) {
        this.c.width = w;
        this.c.height = h;
      }
      this.w = w;
      this.h = h;
      this.hitY = h * (this.demo ? 0.84 : 0.8);
      this.vanY = h * 0.03;
      this.cx = w / 2;
      this.halfW = Math.min(w * 0.4, h * 0.58);
      this.lane = (this.halfW * 2 * 0.92) / 6;
      if (this.tl) {
        this.look = Math.max(this.tl.meter * 1.25, (3.4 * this.tl.bpm) / 60);
        if (this.demo) this.look *= 0.9;
        this.k = 4 / this.look;
        const sBottom = (h - this.vanY) / (this.hitY - this.vanY);
        this.zMin = (1 / sBottom - 1) / this.k;
      }
    }

    S(z) {
      return 1 / (1 + this.k * z);
    }

    Y(z) {
      return this.vanY + (this.hitY - this.vanY) * this.S(z);
    }

    laneX(s, z) {
      return this.cx + (s - 2.5) * this.lane * this.S(z);
    }

    edgeX(side, z) {
      return this.cx + side * (this.halfW + 10 * this.dpr) * this.S(z);
    }

    windows(beat) {
      const lo = beat + this.zMin;
      const hi = beat + this.look;
      const L = this.loop;
      if (L && beat < L.end && hi > L.end) {
        return [
          { from: lo, to: L.end, off: 0 },
          { from: L.start, to: L.start + (hi - L.end), off: L.end - L.start },
        ];
      }
      return [{ from: lo, to: hi, off: 0 }];
    }

    fog(z) {
      const t = Math.max(0, z / this.look);
      return Math.max(0, 1 - t * t * 0.85);
    }

    judge(text, color) {
      this.popups.push({ text, color, t: 0 });
    }

    // Visual feedback for every hit that crossed the line since the last frame.
    trigger(beat, now) {
      const tl = this.tl;
      if (this.lastBeat === null || beat < this.lastBeat || beat - this.lastBeat > 2) {
        this.lastBeat = beat;
        return;
      }
      const hits = tl.hits;
      for (let i = TL.lowerBound(hits, this.lastBeat); i < hits.length && hits[i].beat <= beat; i++) {
        if (hits[i].beat <= this.lastBeat) continue;
        const h = hits[i];
        const color = tl.shapes[h.chord].color;
        for (const s of h.strings) {
          this.flash[s] = 1;
          this.flashColor[s] = color;
          this.vib[s].amp = Math.min(1.2, this.vib[s].amp + (h.kind === 'mute' ? 0.15 : 0.55 + h.vel * 0.5));
          const n = h.kind === 'pick' ? 7 : h.dir === 'down' ? 5 : 3;
          for (let p = 0; p < n; p++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
            const sp = (120 + Math.random() * 320) * this.dpr;
            this.particles.push({
              x: this.laneX(s, 0),
              y: this.hitY,
              vx: Math.cos(ang) * sp,
              vy: Math.sin(ang) * sp,
              life: 0,
              max: 0.35 + Math.random() * 0.45,
              color: h.kind === 'mute' ? '#a8977f' : color,
              size: (1.5 + Math.random() * 2.8) * this.dpr,
            });
          }
        }
        if (h.step === 0 && h.kind !== 'mute') {
          this.rings.push({ x: this.cx, y: this.hitY, life: 0, color });
        }
      }
      this.lastBeat = beat;
    }

    frame(beat, now, { level = 0, chordColor = '#ffb547' } = {}) {
      if (!this.tl || !this.k) return;
      const dt = Math.min(0.05, Math.max(0, now - this.lastNow || 0.016));
      this.lastNow = now;
      const g = this.g;
      const { w, h, dpr } = this;
      this.trigger(beat, now);

      this.drawBackground(g, w, h, level, now, chordColor);
      const wins = this.windows(beat);
      this.drawHighwayBody(g, chordColor);
      for (const win of wins) this.drawSpans(g, beat, win);
      for (const win of wins) this.drawBeatLines(g, beat, win);
      this.drawStrings(g, now, dt);
      this.drawHitLine(g, chordColor, dt);
      for (let wi = wins.length - 1; wi >= 0; wi--) this.drawHits(g, beat, wins[wi]);
      for (const win of wins) this.drawGates(g, beat, win);
      for (const win of wins) this.drawSectionTags(g, beat, win);
      this.drawFx(g, dt);
      this.drawFogTop(g);
      if (beat < 0 && !this.demo) this.drawCountIn(g, beat);
      if (this.loop && !this.demo) this.drawLoopTag(g);
    }

    drawBackground(g, w, h, level, now, color) {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#090606');
      bg.addColorStop(0.6, '#110b09');
      bg.addColorStop(1, '#160e0b');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const glow = g.createRadialGradient(this.cx, this.hitY, 0, this.cx, this.hitY, w * 0.7);
      glow.addColorStop(0, rgba(color, 0.1 + Math.min(0.25, level * 1.6)));
      glow.addColorStop(0.5, rgba('#ff6a3d', 0.04));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);

      g.globalCompositeOperation = 'lighter';
      for (const b of this.bokeh) {
        b.x = (b.x + b.sp * 0.016 + 1) % 1;
        const tw = 0.6 + 0.4 * Math.sin(now * 0.7 + b.tw);
        const s = b.size * this.dpr;
        g.globalAlpha = b.a * tw * (1 + level * 2);
        g.drawImage(this.sprites[b.sprite], b.x * w - s / 2, b.y * h - s / 2, s, s);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    drawHighwayBody(g, color) {
      const zt = this.look;
      const zb = this.zMin;
      const yt = this.Y(zt);
      const yb = this.Y(zb);
      g.beginPath();
      g.moveTo(this.edgeX(-1, zt), yt);
      g.lineTo(this.edgeX(1, zt), yt);
      g.lineTo(this.edgeX(1, zb), yb);
      g.lineTo(this.edgeX(-1, zb), yb);
      g.closePath();
      const grd = g.createLinearGradient(0, yt, 0, yb);
      grd.addColorStop(0, 'rgba(32,20,14,0.0)');
      grd.addColorStop(0.25, 'rgba(36,23,16,0.85)');
      grd.addColorStop(0.8, 'rgba(48,30,20,0.96)');
      grd.addColorStop(1, 'rgba(26,16,11,0.96)');
      g.fillStyle = grd;
      g.fill();

      // Rosewood grain lines converging on the vanishing point.
      g.lineWidth = 1 * this.dpr;
      for (const gr of this.grain) {
        g.strokeStyle = `rgba(255,214,170,${gr.a * 0.6})`;
        g.beginPath();
        g.moveTo(this.cx + gr.off * this.halfW * this.S(zt), yt);
        g.lineTo(this.cx + gr.off * this.halfW * this.S(zb), yb);
        g.stroke();
      }

      // Neon side rails take on the current chord's color.
      g.save();
      g.shadowColor = color;
      g.shadowBlur = 18 * this.dpr;
      g.lineWidth = 3 * this.dpr;
      for (const side of [-1, 1]) {
        const lg = g.createLinearGradient(0, yt, 0, yb);
        lg.addColorStop(0, rgba(color, 0));
        lg.addColorStop(0.35, rgba(color, 0.55));
        lg.addColorStop(1, rgba(color, 0.95));
        g.strokeStyle = lg;
        g.beginPath();
        g.moveTo(this.edgeX(side, zt), yt);
        g.lineTo(this.edgeX(side, zb), yb);
        g.stroke();
      }
      g.restore();
    }

    quad(g, z0, z1, inset) {
      const ins = inset || 0;
      g.beginPath();
      g.moveTo(this.cx - (this.halfW - ins) * this.S(z1), this.Y(z1));
      g.lineTo(this.cx + (this.halfW - ins) * this.S(z1), this.Y(z1));
      g.lineTo(this.cx + (this.halfW - ins) * this.S(z0), this.Y(z0));
      g.lineTo(this.cx - (this.halfW - ins) * this.S(z0), this.Y(z0));
      g.closePath();
    }

    drawSpans(g, beat, win) {
      const spans = this.tl.spans;
      for (let i = TL.spanIndexAt(this.tl, win.from); i < spans.length && spans[i].beat < win.to; i++) {
        const sp = spans[i];
        const end = sp.beat + sp.len;
        if (end <= win.from) continue;
        const z0 = Math.max(sp.beat, win.from) - beat + win.off;
        const z1 = Math.min(end, win.to) - beat + win.off;
        if (z1 <= z0) continue;
        this.quad(g, z0, z1, 0);
        g.fillStyle = rgba(sp.color, 0.07);
        g.fill();
        // Inner color stripes mark how long the chord lasts.
        g.lineWidth = 4 * this.dpr;
        g.strokeStyle = rgba(sp.color, 0.5);
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(this.cx + side * (this.halfW - 6 * this.dpr) * this.S(z0), this.Y(z0));
          g.lineTo(this.cx + side * (this.halfW - 6 * this.dpr) * this.S(z1), this.Y(z1));
          g.stroke();
        }
      }
    }

    drawBeatLines(g, beat, win) {
      const tl = this.tl;
      const pulse = tl.pulse || 1;
      for (let b = Math.ceil(win.from); b < win.to; b++) {
        if (b < 0) continue;
        const z = b - beat + win.off;
        const inBar = b % tl.meter;
        const isBar = inBar === 0;
        const isPulse = inBar % pulse === 0;
        const s = this.S(z);
        const fog = this.fog(z);
        g.strokeStyle = isBar ? `rgba(240,228,210,${0.42 * fog})` : `rgba(240,228,210,${(isPulse ? 0.16 : 0.07) * fog})`;
        g.lineWidth = (isBar ? 3.2 : 1.3) * s * this.dpr;
        const y = this.Y(z);
        g.beginPath();
        g.moveTo(this.cx - this.halfW * s, y);
        g.lineTo(this.cx + this.halfW * s, y);
        g.stroke();
      }
    }

    drawStrings(g, now, dt) {
      const zt = this.look;
      const zb = this.zMin;
      const yt = this.Y(zt);
      const yb = this.Y(zb);
      for (let s = 0; s < 6; s++) {
        const v = this.vib[s];
        v.amp *= Math.exp(-dt * 3.2);
        v.phase += dt * (34 - s * 2.5);
        const wdt = (3.4 - s * 0.42) * this.dpr;
        g.lineWidth = wdt;
        const col = STRING_COLORS[s];
        if (v.amp > 0.02) {
          g.save();
          g.shadowColor = this.flashColor[s];
          g.shadowBlur = 14 * this.dpr * v.amp;
          g.strokeStyle = mix(col, this.flashColor[s], Math.min(0.7, v.amp * 0.6));
          g.beginPath();
          const N = 26;
          for (let i = 0; i <= N; i++) {
            const u = i / N;
            const z = zt + (zb - zt) * u;
            const env = Math.sin(Math.PI * Math.pow(u, 1.6));
            const dx = v.amp * 7 * this.dpr * env * Math.sin(v.phase * 6.283 + u * 3);
            const x = this.laneX(s, z) + dx;
            const y = this.Y(z);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
          g.restore();
        } else {
          const lg = g.createLinearGradient(0, yt, 0, yb);
          lg.addColorStop(0, rgba(col, 0));
          lg.addColorStop(0.3, rgba(col, 0.45));
          lg.addColorStop(1, rgba(col, 0.85));
          g.strokeStyle = lg;
          g.beginPath();
          g.moveTo(this.laneX(s, zt), yt);
          g.lineTo(this.laneX(s, zb), yb);
          g.stroke();
        }
      }
    }

    drawHitLine(g, color, dt) {
      const y = this.hitY;
      const x0 = this.edgeX(-1, 0);
      const x1 = this.edgeX(1, 0);
      g.save();
      g.shadowColor = color;
      g.shadowBlur = 24 * this.dpr;
      const lg = g.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, rgba(color, 0.2));
      lg.addColorStop(0.5, rgba('#fff3dc', 0.95));
      lg.addColorStop(1, rgba(color, 0.2));
      g.strokeStyle = lg;
      g.lineWidth = 3.5 * this.dpr;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
      g.restore();

      for (let s = 0; s < 6; s++) {
        const x = this.laneX(s, 0);
        const f = (this.flash[s] = Math.max(0, this.flash[s] - dt * 3.4));
        const r = (12 + f * 6) * this.dpr;
        if (f > 0) {
          g.save();
          g.shadowColor = this.flashColor[s];
          g.shadowBlur = 30 * this.dpr * f;
          g.fillStyle = rgba(this.flashColor[s], 0.25 + f * 0.6);
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        g.strokeStyle = f > 0 ? rgba('#fff3dc', 0.6 + f * 0.4) : 'rgba(246,231,207,0.35)';
        g.lineWidth = 2 * this.dpr;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(246,231,207,0.55)';
        g.font = `600 ${11 * this.dpr}px "Bricolage Grotesque", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(GS.theory.STRING_LABELS[s], x, y + r + 6 * this.dpr);
      }
    }

    roundRect(g, x, y, w, h, r) {
      r = Math.min(r, h / 2, w / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    arrow(g, x, y, size, dir) {
      const d = dir === 'up' ? -1 : 1;
      g.beginPath();
      g.moveTo(x, y + d * size * 0.62);
      g.lineTo(x - size * 0.55, y - d * size * 0.02);
      g.lineTo(x - size * 0.2, y - d * size * 0.02);
      g.lineTo(x - size * 0.2, y - d * size * 0.6);
      g.lineTo(x + size * 0.2, y - d * size * 0.6);
      g.lineTo(x + size * 0.2, y - d * size * 0.02);
      g.lineTo(x + size * 0.55, y - d * size * 0.02);
      g.closePath();
      g.fill();
    }

    drawHits(g, beat, win) {
      const tl = this.tl;
      const hits = tl.hits;
      const i0 = TL.lowerBound(hits, win.from);
      let i1 = i0;
      while (i1 < hits.length && hits[i1].beat < win.to) i1++;
      const dpr = this.dpr;
      // Far to near so closer notes overlap distant ones.
      for (let i = i1 - 1; i >= i0; i--) {
        const hit = hits[i];
        const z = hit.beat - beat + win.off;
        if (z > this.look || z < this.zMin) continue;
        const s = this.S(z);
        const y = this.Y(z);
        let alpha = this.fog(z);
        if (z < 0) alpha *= Math.max(0, 1 + z / (this.demo ? 0.5 : 0.35));
        if (alpha <= 0.01) continue;
        const color = tl.shapes[hit.chord].color;
        g.globalAlpha = alpha;

        if (hit.kind === 'pick') {
          for (const st of hit.strings) {
            const x = this.laneX(st, z);
            const r = 13 * s * dpr;
            g.save();
            g.shadowColor = color;
            g.shadowBlur = 16 * s * dpr;
            const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
            grd.addColorStop(0, mix(color, '#ffffff', 0.55));
            grd.addColorStop(1, color);
            g.fillStyle = grd;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
            g.restore();
            g.strokeStyle = 'rgba(255,255,255,0.75)';
            g.lineWidth = 1.6 * s * dpr;
            g.stroke();
            g.fillStyle = '#1a1210';
            g.font = `800 ${15 * s * dpr}px "Big Shoulders Display", sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(hit.frets[st]), x, y + 0.5 * s * dpr);
          }
          continue;
        }

        const lo = Math.min(...hit.strings);
        const hi = Math.max(...hit.strings);
        const pad = this.lane * 0.42 * s;
        const x0 = this.laneX(lo, z) - pad;
        const x1 = this.laneX(hi, z) + pad;
        const down = hit.dir === 'down';
        const th = (hit.kind === 'mute' ? 10 : down ? 16 : 11) * s * dpr * (0.85 + hit.vel * 0.25);

        if (hit.kind === 'mute') {
          this.roundRect(g, x0, y - th / 2, x1 - x0, th, th / 2);
          g.fillStyle = 'rgba(168,151,127,0.75)';
          g.fill();
          g.strokeStyle = '#1a1210';
          g.lineWidth = 2.4 * s * dpr;
          const cx = (x0 + x1) / 2;
          const q = 5 * s * dpr;
          g.beginPath();
          g.moveTo(cx - q, y - q);
          g.lineTo(cx + q, y + q);
          g.moveTo(cx + q, y - q);
          g.lineTo(cx - q, y + q);
          g.stroke();
          continue;
        }

        g.save();
        g.shadowColor = color;
        g.shadowBlur = (down ? 22 : 12) * s * dpr;
        this.roundRect(g, x0, y - th / 2, x1 - x0, th, th / 2);
        if (down) {
          const lg = g.createLinearGradient(0, y - th / 2, 0, y + th / 2);
          lg.addColorStop(0, mix(color, '#ffffff', 0.45));
          lg.addColorStop(0.5, color);
          lg.addColorStop(1, mix(color, '#000000', 0.25));
          g.fillStyle = lg;
          g.fill();
        } else {
          g.fillStyle = rgba(color, 0.22);
          g.fill();
          g.strokeStyle = mix(color, '#ffffff', 0.35);
          g.lineWidth = 2.4 * s * dpr;
          g.stroke();
        }
        g.restore();

        // Direction badge sits where the pick enters the strings.
        const bx = down ? x0 + pad * 0.2 : x1 - pad * 0.2;
        const br = (down ? 13 : 11) * s * dpr;
        g.fillStyle = down ? '#1a1210' : mix(color, '#ffffff', 0.25);
        g.beginPath();
        g.arc(bx, y, br, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = down ? color : 'rgba(26,18,16,0.6)';
        g.lineWidth = 2 * s * dpr;
        g.stroke();
        g.fillStyle = down ? mix(color, '#ffffff', 0.3) : '#1a1210';
        this.arrow(g, bx, y, br * 1.05, hit.dir);
      }
      g.globalAlpha = 1;
    }

    drawGates(g, beat, win) {
      const spans = this.tl.spans;
      const dpr = this.dpr;
      for (let i = TL.spanIndexAt(this.tl, win.from); i < spans.length && spans[i].beat < win.to; i++) {
        const sp = spans[i];
        if (sp.beat < win.from) continue;
        const z = sp.beat - beat + win.off;
        if (z < -0.05 || z > this.look) continue;
        const s = this.S(z);
        const y = this.Y(z);
        const fog = this.fog(z);
        const near = z < 0.6 ? Math.max(0, z / 0.6) : 1;
        g.save();
        g.globalAlpha = fog;
        g.shadowColor = sp.color;
        g.shadowBlur = 20 * s * dpr;
        g.strokeStyle = sp.color;
        g.lineWidth = 4 * s * dpr;
        g.beginPath();
        g.moveTo(this.edgeX(-1, z), y);
        g.lineTo(this.edgeX(1, z), y);
        g.stroke();
        g.restore();

        if (near <= 0) continue;
        const parts = GS.theory.chordParts(sp.chord);
        const size = 64 * s * dpr;
        const lx = this.edgeX(1, z) + 16 * s * dpr;
        g.save();
        g.globalAlpha = fog * near;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.font = `900 ${size}px "Big Shoulders Display", sans-serif`;
        g.shadowColor = sp.color;
        g.shadowBlur = 22 * s * dpr;
        g.fillStyle = sp.color;
        g.fillText(parts.root, lx, y);
        const rw = g.measureText(parts.root).width;
        if (parts.quality) {
          g.font = `800 ${size * 0.5}px "Big Shoulders Display", sans-serif`;
          g.fillText(parts.quality, lx + rw + 2 * s * dpr, y - size * 0.14);
        }
        g.restore();
      }
    }

    drawSectionTags(g, beat, win) {
      const dpr = this.dpr;
      for (const sec of this.tl.sections) {
        if (sec.start < win.from || sec.start >= win.to) continue;
        const z = sec.start - beat + win.off;
        if (z < 0 || z > this.look) continue;
        const s = this.S(z);
        const y = this.Y(z);
        const color = SECTION_COLORS[sec.type] || '#ffb547';
        const x = this.edgeX(-1, z) - 18 * s * dpr;
        g.save();
        g.globalAlpha = this.fog(z) * Math.min(1, z / 0.5 + 0.2);
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.font = `800 ${Math.max(10, 26 * s) * dpr}px "Big Shoulders Display", sans-serif`;
        g.fillStyle = color;
        g.shadowColor = color;
        g.shadowBlur = 12 * dpr * s;
        g.fillText(sec.name.toUpperCase(), x, y);
        g.restore();
      }
    }

    drawFx(g, dt) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        p.life += dt;
        p.vy += 520 * this.dpr * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = Math.max(0, 1 - p.life / p.max);
        g.fillStyle = rgba(p.color, a);
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        g.fill();
      }
      this.particles = this.particles.filter((p) => p.life < p.max);
      for (const r of this.rings) {
        r.life += dt;
        const t = r.life / 0.55;
        g.strokeStyle = rgba(r.color, Math.max(0, 0.5 * (1 - t)));
        g.lineWidth = 3 * this.dpr * (1 - t) + 0.5;
        g.beginPath();
        g.ellipse(r.x, r.y, this.halfW * (0.4 + t * 0.9), 26 * this.dpr * (0.4 + t * 1.4), 0, 0, Math.PI * 2);
        g.stroke();
      }
      this.rings = this.rings.filter((r) => r.life < 0.55);
      g.restore();

      for (const p of this.popups) {
        p.t += dt;
        const a = Math.max(0, 1 - p.t / 0.8);
        g.save();
        g.globalAlpha = a;
        g.font = `900 ${30 * this.dpr * (1 + (1 - a) * 0.25)}px "Big Shoulders Display", sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = p.color;
        g.shadowColor = p.color;
        g.shadowBlur = 16 * this.dpr;
        g.fillText(p.text, this.cx, this.hitY - 60 * this.dpr - p.t * 60 * this.dpr);
        g.restore();
      }
      this.popups = this.popups.filter((p) => p.t < 0.8);
    }

    drawFogTop(g) {
      const yt = this.Y(this.look);
      const grd = g.createLinearGradient(0, 0, 0, yt + 70 * this.dpr);
      grd.addColorStop(0, 'rgba(9,6,6,1)');
      grd.addColorStop(0.55, 'rgba(9,6,6,0.65)');
      grd.addColorStop(1, 'rgba(9,6,6,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.w, yt + 70 * this.dpr);
    }

    drawCountIn(g, beat) {
      const meter = this.tl.meter;
      const n = Math.floor(beat) + meter + 1;
      if (n < 1 || n > meter) return;
      const frac = beat - Math.floor(beat);
      const dpr = this.dpr;
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 1 - frac * 0.7;
      g.font = `900 ${(150 + (1 - frac) * 40) * dpr}px "Big Shoulders Display", sans-serif`;
      g.fillStyle = '#fff3dc';
      g.shadowColor = '#ffb547';
      g.shadowBlur = 40 * dpr;
      g.fillText(String(n), this.cx, this.h * 0.42);
      g.globalAlpha = 0.8;
      g.shadowBlur = 0;
      g.font = `700 ${16 * dpr}px "Bricolage Grotesque", sans-serif`;
      g.fillStyle = '#ffb547';
      g.fillText('COUNT-IN · GET YOUR FIRST CHORD READY', this.cx, this.h * 0.42 + 110 * dpr);
      g.restore();
    }

    drawLoopTag(g) {
      const dpr = this.dpr;
      g.save();
      g.font = `700 ${12 * dpr}px "Bricolage Grotesque", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = '#35e0c2';
      g.fillText('⟲  LOOPING THIS SECTION', this.cx, 18 * dpr);
      g.restore();
    }
  }

  GS.Highway = Highway;
  GS.SECTION_COLORS = SECTION_COLORS;
  GS.color = { rgba, mix };
})();
