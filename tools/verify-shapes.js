#!/usr/bin/env node
// Checks that every chord shape (library + song overrides) sounds exactly the notes its name implies.
global.window = global;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'js');
require(path.join(root, 'theory.js'));
for (const f of fs.readdirSync(path.join(root, 'songs'))) require(path.join(root, 'songs', f));
const T = GS.theory;
const Q = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 2, 4, 7], '7sus4': [0, 5, 7, 10], 5: [0, 7], 6: [0, 4, 7, 9] };
const NOTE = (n) => T.parseRoot(n).pc;
let bad = 0;
const check = (name, frets, where) => {
  const [chord, slash] = name.split('/');
  const r = T.parseRoot(chord);
  const q = Q[r.quality];
  const sounding = frets.map((f, s) => (f >= 0 ? (T.OPEN_MIDI[s] + f) % 12 : null)).filter((x) => x !== null);
  const got = [...new Set(sounding)].sort((a, b) => a - b);
  const want = [...new Set(q.map((i) => (r.pc + i) % 12).concat(slash ? [NOTE(slash)] : []))].sort((a, b) => a - b);
  const lowest = frets.findIndex((f) => f >= 0);
  const bass = (T.OPEN_MIDI[lowest] + frets[lowest]) % 12;
  const wantBass = slash ? NOTE(slash) : r.pc;
  // Dropping the 5th is a normal voicing (e.g. x32310 C7); anything else missing or extra is wrong.
  const fifth = (r.pc + 7) % 12;
  const noFifth = want.filter((x) => x !== fifth);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok = (same(got, want) || (q.length >= 4 && same(got, noFifth))) && got.includes(r.pc);
  const note = (x) => T.NOTE_NAMES[x];
  if (!ok || bass !== wantBass) {
    const level = ok ? 'note' : 'BAD ';
    if (!ok) bad++;
    console.log(`${level} ${where.padEnd(20)} ${name.padEnd(7)} ${frets.map((f) => (f < 0 ? 'x' : f)).join('')}  sounds ${got.map(note).join(' ')}  want ${want.map(note).join(' ')}  bass ${note(bass)}${bass !== wantBass ? ' (not root)' : ''}`);
  }
};
for (const [n, c] of Object.entries(T.CHORDS)) check(n, c.frets, 'library');
for (const s of GS.songs) for (const [n, c] of Object.entries(s.shapes || {})) check(n, c.frets, s.id);
console.log(bad ? `${bad} shape(s) spell the wrong chord` : 'all shapes spell their chords');
process.exit(bad ? 1 : 0);
