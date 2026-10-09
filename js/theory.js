/* Music theory primitives, chord shape library, and song registry. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});

  // Standard tuning, index 0 = low E (6th string) → index 5 = high e (1st string).
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
  const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high e'];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FINGER_NAMES = ['', 'index', 'middle', 'ring', 'pinky'];

  // One hue per root letter so a chord keeps its color everywhere in the app.
  const ROOT_COLORS = {
    C: '#5aa9ff',
    D: '#35e0c2',
    E: '#ff5c8a',
    F: '#ff8a4c',
    G: '#ffc23d',
    A: '#b48bff',
    B: '#9fe35f',
  };

  // frets: low E → high e, -1 muted, 0 open. fingers: 1 index … 4 pinky.
  // barre: { fret, from, to } string indexes covered by one finger.
  const CHORDS = {
    C: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
    Cadd9: { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4] },
    C7: { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
    D: { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
    Dsus2: { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] },
    D7: { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
    Dm: { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
    E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
    E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
    Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 1, 2, 0, 0, 0] },
    Em7: { frets: [0, 2, 2, 0, 3, 3], fingers: [0, 1, 2, 0, 3, 4] },
    F: { frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
    Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
    'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 2, from: 0, to: 5 } },
    G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
    G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
    'G/B': { frets: [-1, 2, 0, 0, 0, 3], fingers: [0, 1, 0, 0, 0, 3] },
    A: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
    A7: { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
    Asus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] },
    Asus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
    A7sus4: { frets: [-1, 0, 2, 0, 3, 3], fingers: [0, 0, 2, 0, 3, 4] },
    Am: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
    Am7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
    Bm: { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, from: 1, to: 5 } },
    B7: { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  };

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12];

  function parseRoot(name) {
    const m = /^([A-G])([#b]?)/.exec(name || '');
    if (!m) return null;
    let pc = LETTER_PC[m[1]];
    if (m[2] === '#') pc += 1;
    if (m[2] === 'b') pc -= 1;
    return { letter: m[1], accidental: m[2], pc: (pc + 12) % 12, quality: name.slice(m[0].length) };
  }

  function chordColor(name) {
    const r = parseRoot(name);
    return r ? ROOT_COLORS[r.letter] : '#d8c9b0';
  }

  function chordParts(name) {
    const r = parseRoot(name);
    if (!r) return { root: name, quality: '' };
    return { root: r.letter + r.accidental, quality: r.quality };
  }

  function lowestPlayable(frets) {
    for (let s = 0; s < 6; s++) if (frets[s] >= 0) return s;
    return 0;
  }

  // Alternating-bass partner for picking patterns ("B" = root, "b" = alternate).
  function altBass(frets, bass) {
    const want = bass === 0 ? 2 : bass + 1;
    if (want < 6 && frets[want] >= 0) return want;
    for (let s = 0; s < 6; s++) if (s !== bass && frets[s] >= 0) return s;
    return bass;
  }

  const cache = new Map();
  function shape(name, overrides) {
    const src = (overrides && overrides[name]) || CHORDS[name];
    if (!src) throw new Error('Unknown chord shape: ' + name);
    const key = name + '|' + src.frets.join(',');
    if (cache.has(key)) return cache.get(key);
    const frets = src.frets.slice();
    const fretted = frets.filter((f) => f > 0);
    const maxFret = fretted.length ? Math.max(...fretted) : 0;
    const minFret = fretted.length ? Math.min(...fretted) : 1;
    const bass = src.bass != null ? src.bass : lowestPlayable(frets);
    const out = {
      name,
      frets,
      fingers: src.fingers.slice(),
      barre: src.barre || null,
      baseFret: maxFret > 5 ? minFret : 1,
      bass,
      alt: altBass(frets, bass),
      color: chordColor(name),
      pitchClasses: [...new Set(frets.map((f, s) => (f >= 0 ? (OPEN_MIDI[s] + f) % 12 : null)).filter((x) => x !== null))],
    };
    cache.set(key, out);
    return out;
  }

  // Bass guitar root in the E1–D#2 octave.
  function bassMidi(name, interval) {
    const [chord, slash] = name.split('/');
    const r = parseRoot(interval ? chord : slash || chord);
    if (!r) return null;
    return 28 + ((r.pc - 4 + 12) % 12) + (interval || 0);
  }

  function strumAdvice(shp) {
    const first = lowestPlayable(shp.frets);
    const mutedInside = shp.frets.some((f, s) => s > first && f < 0);
    if (mutedInside) return 'Mute the ✕ strings';
    if (first === 0) return 'Strum all 6 strings';
    return 'Strum from the ' + STRING_NAMES[first] + ' string';
  }

  function fingerGuide(shp) {
    const lines = [];
    const seen = new Set();
    for (let s = 0; s < 6; s++) {
      const f = shp.frets[s];
      const finger = shp.fingers[s];
      if (f <= 0 || !finger) continue;
      if (shp.barre && finger === 1 && f === shp.barre.fret && s >= shp.barre.from && s <= shp.barre.to) {
        if (seen.has('barre')) continue;
        seen.add('barre');
        lines.push({
          finger,
          text: `Index barres fret ${f}, ${STRING_NAMES[shp.barre.from]} → ${STRING_NAMES[shp.barre.to]}`,
        });
        continue;
      }
      lines.push({ finger, text: `${cap(FINGER_NAMES[finger])} → ${STRING_NAMES[s]} string, fret ${f}` });
    }
    return lines.sort((a, b) => a.finger - b.finger);
  }

  // Finds fingers that stay put between two shapes; the core trick for clean changes.
  function anchors(a, b) {
    const out = [];
    for (let s = 0; s < 6; s++) {
      if (a.frets[s] > 0 && a.frets[s] === b.frets[s] && a.fingers[s] && a.fingers[s] === b.fingers[s]) {
        out.push({ finger: a.fingers[s], string: s, fret: a.frets[s] });
      }
    }
    return out;
  }

  function changeTip(a, b) {
    const anc = anchors(a, b);
    if (anc.length) {
      const list = anc.map((x) => `${FINGER_NAMES[x.finger]} finger (${STRING_LABELS[x.string]} string, fret ${x.fret})`);
      return `Anchor: keep your ${list.join(' + ')} planted and pivot around it.`;
    }
    const shared = [];
    for (let s = 0; s < 6; s++) {
      if (a.frets[s] > 0 && b.frets[s] > 0 && a.fingers[s] === b.fingers[s] && a.fingers[s]) shared.push(a.fingers[s]);
    }
    if (shared.length) {
      return `Your ${FINGER_NAMES[shared[0]]} finger stays on its string — slide it, don't lift it.`;
    }
    return 'No shared fingers — lift together and land all fingers as one shape.';
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  };

  GS.songs = GS.songs || [];
  GS.registerSong = (song) => {
    GS.songs.push(song);
    GS.songs.sort((a, b) => (a.order || 99) - (b.order || 99));
  };

  GS.theory = {
    OPEN_MIDI,
    STRING_LABELS,
    STRING_NAMES,
    FINGER_NAMES,
    NOTE_NAMES,
    CHORDS,
    ROOT_COLORS,
    midiToFreq,
    noteName,
    parseRoot,
    chordColor,
    chordParts,
    shape,
    bassMidi,
    strumAdvice,
    fingerGuide,
    anchors,
    changeTip,
    fmtTime,
  };
})();
