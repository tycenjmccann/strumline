/* SVG chord box whose finger dots glide between shapes, so learners see which fingers move. */
(function () {
  'use strict';
  const GS = window.GS;
  const NS = 'http://www.w3.org/2000/svg';

  const X0 = 26;
  const GAP_X = 18;
  const NUT_Y = 36;
  const GAP_Y = 25;
  const FRETS = 5;
  const W = 142;
  const H = NUT_Y + GAP_Y * FRETS + 12;

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  const sx = (s) => X0 + s * GAP_X;
  const fy = (fret, base) => NUT_Y + (fret - base + 0.5) * GAP_Y;

  class ChordDiagram {
    constructor(host, { animate = true, compact = false } = {}) {
      this.svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chord-svg' + (compact ? ' compact' : '') });
      this.animate = animate;
      const ease = animate ? 'transform .34s cubic-bezier(.34,1.45,.5,1), opacity .22s ease' : 'none';

      this.nut = el('rect', { x: X0 - 2, y: NUT_Y - 5, width: GAP_X * 5 + 4, height: 6, rx: 2, class: 'cd-nut' }, this.svg);
      for (let i = 0; i <= FRETS; i++) {
        el('line', { x1: X0, x2: X0 + GAP_X * 5, y1: NUT_Y + i * GAP_Y, y2: NUT_Y + i * GAP_Y, class: 'cd-fret' }, this.svg);
      }
      for (let s = 0; s < 6; s++) {
        el('line', { x1: sx(s), x2: sx(s), y1: NUT_Y, y2: NUT_Y + GAP_Y * FRETS, class: 'cd-string', 'stroke-width': 2.4 - s * 0.3 }, this.svg);
      }
      this.baseLabel = el('text', { x: X0 - 12, y: NUT_Y + GAP_Y * 0.5 + 4, class: 'cd-base', 'text-anchor': 'end' }, this.svg);

      this.barre = el('rect', { x: 0, y: -8, height: 16, rx: 8, class: 'cd-barre' }, this.svg);
      this.barre.style.transition = animate ? 'transform .34s cubic-bezier(.34,1.45,.5,1), opacity .2s, width .3s' : 'none';
      this.barre.style.opacity = 0;

      this.markers = [];
      for (let s = 0; s < 6; s++) {
        const t = el('text', { x: sx(s), y: NUT_Y - 13, class: 'cd-marker', 'text-anchor': 'middle' }, this.svg);
        t.style.transition = animate ? 'opacity .2s' : 'none';
        this.markers.push(t);
      }

      this.dots = [];
      for (let f = 1; f <= 4; f++) {
        const g = el('g', { class: 'cd-dot' }, this.svg);
        el('circle', { r: 9.2, class: 'cd-dot-ring' }, g);
        const c = el('circle', { r: 8.2, class: 'cd-dot-fill' }, g);
        const txt = el('text', { y: 3.9, 'text-anchor': 'middle', class: 'cd-dot-num' }, g);
        txt.textContent = f;
        g.style.transition = ease;
        g.style.opacity = 0;
        g.style.transform = `translate(${sx(2)}px, ${fy(1, 1)}px)`;
        this.dots.push({ g, c });
      }
      host.appendChild(this.svg);
    }

    set(shape, { anchors = [] } = {}) {
      if (!shape) return;
      this.shape = shape;
      const base = shape.baseFret || 1;
      this.svg.style.setProperty('--cd-color', shape.color);
      this.nut.style.opacity = base === 1 ? 1 : 0;
      this.baseLabel.textContent = base > 1 ? base + 'fr' : '';

      for (let s = 0; s < 6; s++) {
        const f = shape.frets[s];
        const m = this.markers[s];
        m.textContent = f < 0 ? '✕' : 'o';
        m.classList.toggle('muted', f < 0);
        m.style.opacity = f <= 0 ? 1 : 0;
      }

      const b = shape.barre;
      if (b) {
        const w = (b.to - b.from) * GAP_X + 18;
        this.barre.setAttribute('width', w);
        this.barre.style.transform = `translate(${sx(b.from) - 9}px, ${fy(b.fret, base)}px)`;
        this.barre.style.opacity = 1;
      } else {
        this.barre.style.opacity = 0;
      }

      const anchorSet = new Set(anchors.map((a) => a.finger));
      for (let f = 1; f <= 4; f++) {
        const d = this.dots[f - 1];
        let s = -1;
        if (b && f === 1) s = b.from;
        else s = shape.fingers.findIndex((x, i) => x === f && shape.frets[i] > 0);
        if (s < 0) {
          d.g.style.opacity = 0;
          continue;
        }
        d.g.style.transform = `translate(${sx(s)}px, ${fy(shape.frets[s], base)}px)`;
        d.g.style.opacity = 1;
        d.g.classList.toggle('anchor', anchorSet.has(f));
      }
    }
  }

  function staticSVG(shape, opts) {
    const host = document.createElement('div');
    const d = new ChordDiagram(host, { animate: false, ...opts });
    d.set(shape);
    return host.innerHTML;
  }

  GS.diagram = { ChordDiagram, staticSVG };
})();
