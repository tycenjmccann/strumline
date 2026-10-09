#!/usr/bin/env node
// Validates every song file: chords resolve, patterns exist and fit the bar, timeline builds.
// usage: node tools/validate-songs.js [song-file ...]   (default: all of js/songs)
global.window = global;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'js');
require(path.join(root, 'theory.js'));
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(root, 'songs')).map((f) => path.join(root, 'songs', f));
for (const f of files) require(path.resolve(f));
require(path.join(root, 'arrange.js'));
let bad = 0;
const ids = new Set();
for (const s of GS.songs) {
  const errs = [];
  if (ids.has(s.id)) errs.push('duplicate id');
  ids.add(s.id);
  for (const k of ['id', 'title', 'artist', 'level', 'bpm', 'patterns', 'sections']) if (s[k] == null) errs.push('missing ' + k);
  if (!['beginner', 'intermediate'].includes(s.level)) errs.push('level must be beginner|intermediate');
  const steps = (s.meter || 4) * (s.sub || 2);
  for (const [k, p] of Object.entries(s.patterns || {})) {
    const n = p.steps.trim().includes(' ') ? p.steps.trim().split(/\s+/).length : p.steps.trim().length;
    if (steps % n !== 0 && n % steps !== 0) errs.push(`pattern ${k}: ${n} steps does not fit ${steps} per bar`);
  }
  let tl = null;
  try {
    tl = GS.arrange(s);
    GS.arrange(GS.timeline.drillSong(s, tl.chordNames[0], tl.chordNames[1] || tl.chordNames[0]));
  } catch (e) {
    errs.push(e.message);
  }
  if (errs.length) {
    bad++;
    console.log(`✗ ${s.id}: ${errs.join('; ')}`);
  } else {
    console.log(`✓ ${String(s.order).padStart(2)} ${s.id.padEnd(22)} ${s.level.padEnd(12)} ${GS.theory.fmtTime(tl.durationSec)}  ${tl.bars.length} bars  ${tl.chordNames.join(' ')}`);
  }
}
process.exit(bad ? 1 : 0);
