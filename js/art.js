/* Procedural cover art: a soundhole rosette painted in each song's chord colors. */
(function () {
  'use strict';
  const GS = window.GS;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function cover(song, { strings = true } = {}) {
    const r = GS.synth.rng(hash(song.id));
    const chords = [...new Set(song.sections.flatMap((s) => s.bars.trim().split(/\s+/).flatMap((b) => b.split(','))))].filter(
      (c) => c !== 'NC',
    );
    const colors = chords.map((c) => GS.theory.chordColor(c));
    const base = colors[0] || '#ffb547';
    const id = 'c' + hash(song.id).toString(36);
    let rings = '';
    let rad = 60;
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const col = colors[i % colors.length];
      const w = 2 + r() * 5;
      const dash = `${(1 + r() * 9).toFixed(1)} ${(1 + r() * 6).toFixed(1)}`;
      const rot = Math.floor(r() * 360);
      rings += `<circle cx="100" cy="100" r="${rad.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-dasharray="${dash}" opacity="${(0.55 + r() * 0.45).toFixed(2)}" transform="rotate(${rot} 100 100)"/>`;
      rad += w + 2 + r() * 4;
    }
    let lines = '';
    if (strings) {
      for (let s = 0; s < 6; s++) {
        const x = 70 + s * 12;
        const col = s < 4 ? '#d3a46a' : '#e9edf2';
        lines += `<line x1="${x}" y1="-5" x2="${x}" y2="205" stroke="${col}" stroke-width="${(2.2 - s * 0.28).toFixed(2)}" opacity=".8"/>`;
      }
    }
    return `<svg viewBox="0 0 200 200" class="cover-svg" aria-hidden="true">
      <defs>
        <radialGradient id="${id}g" cx="50%" cy="45%" r="75%">
          <stop offset="0" stop-color="${GS.color.mix(base, '#1a110c', 0.55)}"/>
          <stop offset="1" stop-color="#0d0908"/>
        </radialGradient>
        <radialGradient id="${id}h" cx="50%" cy="50%" r="50%">
          <stop offset="0.7" stop-color="#050303"/>
          <stop offset="1" stop-color="#140d0a"/>
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill="url(#${id}g)"/>
      ${rings}
      <circle cx="100" cy="100" r="54" fill="url(#${id}h)"/>
      <circle cx="100" cy="100" r="54" fill="none" stroke="${base}" stroke-opacity=".35" stroke-width="1"/>
      ${lines}
    </svg>`;
  }

  GS.art = { cover };
})();
