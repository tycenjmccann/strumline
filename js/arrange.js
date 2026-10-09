/* Flattens a song definition into a beat-addressed timeline of hits, chord spans, and band notes. */
(function () {
  'use strict';
  const GS = window.GS;
  const T = GS.theory;

  // Drum strings are spread evenly across one bar: X accent, x normal, o soft, . rest.
  // Bass entries: [fraction of bar, 'R' root | '5' fifth | '8' octave].
  const STYLES = {
    country: { kick: 'x...x...', snare: '..x...x.', shaker: 'oxoxoxox', bass: [[0, 'R'], [0.5, '5']] },
    folk: { kick: 'x...o...', snare: '..o...o.', shaker: 'o.o.o.o.', bass: [[0, 'R'], [0.5, 'R']] },
    rock: { kick: 'x...x.x.', snare: '..X...X.', shaker: 'xxxxxxxx', bass: [[0, 'R'], [0.25, 'R'], [0.5, 'R'], [0.75, 'R']] },
    ballad: { kick: 'x...o...', snare: '..x...x.', shaker: 'o.o.o.o.', bass: [[0, 'R'], [0.5, '5']] },
    sixeight: { kick: 'x.....', snare: '...x..', shaker: 'oooooo', bass: [[0, 'R'], [0.5, '5']] },
    sixteen: {
      kick: 'x.......x.x.....',
      snare: '....X.......X...',
      shaker: 'x.o.x.o.x.o.x.o.',
      bass: [[0, 'R'], [0.375, 'R'], [0.5, 'R'], [0.875, '5']],
    },
    reggae: { kick: '....X...', snare: '....x...', shaker: '.o.o.o.o', bass: [[0, 'R'], [0.375, 'R'], [0.625, '5']] },
  };
  const DRUM_VEL = { X: 1, x: 0.75, o: 0.45 };

  function parseSteps(steps) {
    const s = steps.trim();
    return s.includes(' ') ? s.split(/\s+/) : s.split('');
  }

  function playable(shape) {
    const out = [];
    for (let s = 0; s < 6; s++) if (shape.frets[s] >= 0) out.push(s);
    return out;
  }

  function pickStrings(tok, shape) {
    const out = [];
    for (const ch of tok) {
      let s = null;
      if (ch === 'B') s = shape.bass;
      else if (ch === 'b') s = shape.alt;
      else if (ch >= '1' && ch <= '6') s = 6 - Number(ch);
      if (s === null) continue;
      if (shape.frets[s] < 0) s = shape.bass;
      if (!out.includes(s)) out.push(s);
    }
    return out.sort((a, b) => a - b);
  }

  function makeHit(tok, shape, chord, beat, step, accentEvery) {
    if (tok === '.' || tok === '-' || tok === '_') return null;
    const accent = step % accentEvery === 0;
    const base = { beat, step, chord, tok, frets: shape.frets };
    const all = playable(shape);
    switch (tok) {
      case 'D':
        return { ...base, kind: 'strum', dir: 'down', strings: all, vel: accent ? 0.95 : 0.8 };
      case 'd':
        return { ...base, kind: 'strum', dir: 'down', strings: all, vel: 0.58 };
      case 'U':
        return { ...base, kind: 'strum', dir: 'up', strings: all.filter((s) => s >= 2), vel: 0.66 };
      case 'u':
        return { ...base, kind: 'strum', dir: 'up', strings: all.filter((s) => s >= 2), vel: 0.46 };
      case 'x':
      case 'X':
        return { ...base, kind: 'mute', dir: 'down', strings: all, vel: tok === 'X' ? 0.9 : 0.7 };
      default: {
        const strings = pickStrings(tok, shape);
        if (!strings.length) return null;
        const hasBass = /[Bb]/.test(tok);
        return { ...base, kind: 'pick', dir: 'down', strings, vel: (hasBass ? 0.82 : 0.68) * (accent ? 1.08 : 1) };
      }
    }
  }

  function arrange(song) {
    const meter = song.meter || 4;
    const sub = song.sub || 2;
    const pulse = song.pulse || 1;
    const stepsPerBar = meter * sub;
    const style = STYLES[song.feel] || STYLES.folk;
    const shapes = {};
    const getShape = (n) => (shapes[n] = shapes[n] || T.shape(n, song.shapes));

    const sections = [];
    const bars = [];
    const hits = [];
    const spans = [];
    const band = [];
    let beat = 0;

    const pushSpan = (chord, b, len, si) => {
      const last = spans[spans.length - 1];
      if (last && last.chord === chord && Math.abs(last.beat + last.len - b) < 1e-6) {
        last.len += len;
        return;
      }
      spans.push({ chord, beat: b, len, section: si, color: getShape(chord).color });
    };

    const bandBar = (names, barBeat, level) => {
      if (level === 'off') return;
      const segBeats = meter / names.length;
      const chordAt = (frac) => names[Math.min(names.length - 1, Math.floor((frac * meter) / segBeats + 1e-6))];
      const drums = level === 'light' ? { shaker: style.shaker } : style;
      for (const inst of ['kick', 'snare', 'shaker']) {
        const pat = drums[inst];
        if (!pat) continue;
        for (let i = 0; i < pat.length; i++) {
          const v = DRUM_VEL[pat[i]];
          if (!v) continue;
          if (level === 'hit' && i > 0) break;
          band.push({ beat: barBeat + (i / pat.length) * meter, inst, vel: v * (level === 'light' ? 0.7 : 1) });
        }
      }
      for (const [frac, deg] of style.bass) {
        if (level === 'hit' && frac > 0) break;
        const name = chordAt(frac);
        if (name === 'NC') continue;
        const startsChord = Math.abs(((frac * meter) / segBeats) % 1) < 1e-6;
        const interval = startsChord ? 0 : deg === '5' ? 7 : deg === '8' ? 12 : 0;
        const midi = T.bassMidi(name, interval);
        if (midi == null) continue;
        band.push({ beat: barBeat + frac * meter, inst: 'bass', midi, vel: level === 'light' ? 0.55 : 0.8 });
      }
    };

    song.sections.forEach((sec, si) => {
      const patKey = sec.pattern || 'main';
      const pattern = song.patterns[patKey];
      if (!pattern) throw new Error(`${song.id}: section "${sec.name}" uses missing pattern "${patKey}"`);
      const steps = parseSteps(pattern.steps);
      const barTokens = sec.bars.trim().split(/\s+/);
      const reps = sec.repeat || 1;
      const start = beat;
      let k = 0;
      for (let r = 0; r < reps; r++) {
        for (const tok of barTokens) {
          const names = tok.split(',');
          const seg = stepsPerBar / names.length;
          const bar = { index: bars.length, beat, section: si, chords: names, tokens: [], hits: [] };
          names.forEach((n, ci) => {
            if (n !== 'NC') pushSpan(n, beat + (ci * seg) / sub, seg / sub, si);
          });
          for (let s = 0; s < stepsPerBar; s++, k++) {
            const t = steps[k % steps.length];
            bar.tokens.push(t);
            const name = names[Math.min(names.length - 1, Math.floor(s / seg))];
            if (name === 'NC') continue;
            const hit = makeHit(t, getShape(name), name, beat + s / sub, s, sub * pulse);
            if (hit) {
              hit.bar = bar.index;
              hit.section = si;
              hits.push(hit);
              bar.hits.push(hit);
            }
          }
          bandBar(names, beat, sec.band || 'full');
          bars.push(bar);
          beat += meter;
        }
      }
      sections.push({
        index: si,
        name: sec.name,
        type: sec.type || 'verse',
        start,
        end: beat,
        pattern: patKey,
        bars: barTokens.length * reps,
      });
    });

    band.sort((a, b) => a.beat - b.beat);
    hits.forEach((h, i) => (h.index = i));

    return {
      song,
      meter,
      sub,
      pulse,
      stepsPerBar,
      bpm: song.bpm,
      totalBeats: beat,
      durationSec: (beat * 60) / song.bpm,
      sections,
      bars,
      spans,
      hits,
      band,
      shapes,
      chordNames: [...new Set(spans.map((s) => s.chord))],
    };
  }

  // First index whose .beat >= b.
  function lowerBound(arr, b) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].beat < b) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function findAt(arr, b) {
    const i = lowerBound(arr, b + 1e-9) - 1;
    return i >= 0 ? i : -1;
  }

  const spanIndexAt = (tl, b) => Math.max(0, findAt(tl.spans, b));
  const barIndexAt = (tl, b) => Math.max(0, Math.min(tl.bars.length - 1, Math.floor(b / tl.meter)));
  function sectionIndexAt(tl, b) {
    for (let i = tl.sections.length - 1; i >= 0; i--) if (b >= tl.sections[i].start) return i;
    return 0;
  }

  function guitarMidis(tl, capo) {
    const set = new Set();
    for (const name of tl.chordNames) {
      const shp = tl.shapes[name];
      shp.frets.forEach((f, s) => f >= 0 && set.add(T.OPEN_MIDI[s] + f + capo));
    }
    return [...set];
  }

  function bassMidis(tl, capo) {
    return [...new Set(tl.band.filter((n) => n.inst === 'bass').map((n) => n.midi + capo))];
  }

  // Generated mini-song that drills one chord change, slow to song tempo.
  function drillSong(song, a, b) {
    const meter = song.meter || 4;
    const sub = song.sub || 2;
    const steps = meter * sub;
    const one = (tok) => tok + '.'.repeat(steps - 1);
    const pulses = Array.from({ length: steps }, (_, i) => (i % sub === 0 ? 'D' : '.')).join('');
    const mainKey = song.sections[1] ? song.sections[1].pattern || 'main' : 'main';
    const main = song.patterns[mainKey] || song.patterns.main;
    return {
      ...song,
      id: `${song.id}-drill-${a}-${b}`,
      drill: { parent: song.id, a, b },
      title: `${a} ↔ ${b}`,
      artist: `Chord-change drill · ${song.title}`,
      also: null,
      bpm: Math.round(song.bpm * 0.8),
      patterns: {
        whole: { name: 'One strum per bar', steps: one('D'), about: 'One strum, then use the rest of the bar to move.' },
        pulse: { name: 'Every beat', steps: pulses, about: 'Strum on every beat. Change without stopping.' },
        song: { name: main.name, steps: main.steps, about: main.about },
      },
      sections: [
        { name: 'Slow changes', type: 'intro', pattern: 'whole', bars: `${a} ${b} ${a} ${b}`, band: 'off' },
        { name: 'On the beat', type: 'verse', pattern: 'pulse', bars: `${a} ${b} ${a} ${b}`, repeat: 2, band: 'light' },
        { name: 'Song strum', type: 'chorus', pattern: 'song', bars: `${a} ${b} ${a} ${b}`, repeat: 2 },
        { name: 'Land it', type: 'outro', pattern: 'whole', bars: a, band: 'hit' },
      ],
    };
  }

  GS.arrange = arrange;
  GS.timeline = { lowerBound, spanIndexAt, barIndexAt, sectionIndexAt, guitarMidis, bassMidis, drillSong, STYLES };
})();
