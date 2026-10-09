/*
 * Song schema (every song file follows this shape):
 *   meter    beats per bar            sub    pattern steps per beat (2 = eighths, 4 = sixteenths)
 *   pulse    beats per metronome click group (3 for 6/8 feel)
 *   feel     backing band style: country | folk | rock | ballad | sixeight | sixteen | reggae
 *   capo     fret to match the record (audio follows the capo selector)
 *   patterns steps string, one char per step:  D down  d soft down  U up  u soft up  x mute  . rest
 *            or space-separated picking tokens: B root bass  b alternate bass  1–6 string number  (e.g. "B 3 2 1 2 3")
 *   sections bars = space-separated bars; "G,D" splits a bar between chords; repeat = times through
 *            band = full | light | hit | off
 */
GS.registerSong({
  id: 'wagon-wheel',
  order: 1,
  title: 'Wagon Wheel',
  artist: 'Old Crow Medicine Show',
  also: 'Darius Rucker',
  level: 'beginner',
  bpm: 148,
  meter: 4,
  sub: 2,
  capo: 2,
  key: 'A',
  feel: 'country',
  blurb:
    'The campfire anthem. Four open chords, one strum pattern, and the same eight-bar loop from start to finish — the perfect first full song.',
  skills: ['G · D · Em · C', 'Country strum', 'Chord changes on the beat'],
  patterns: {
    main: {
      name: 'Country strum',
      steps: 'D.DU.UDU',
      about:
        'Down, down-up, up-down-up. Your hand never stops moving — on the silent beat 3 you still swing down, just miss the strings.',
    },
    half: {
      name: 'Breakdown',
      steps: 'D...D...',
      about: 'Two big strums per bar. Let them ring — this is where the crowd sings.',
    },
    end: { name: 'Last strum', steps: 'D.......', about: 'One big strum. Let it ring out.' },
  },
  sections: [
    { name: 'Intro', type: 'intro', pattern: 'main', bars: 'G D Em C G D C C' },
    { name: 'Verse 1', type: 'verse', pattern: 'main', bars: 'G D Em C G D C C', repeat: 2 },
    { name: 'Chorus', type: 'chorus', pattern: 'main', bars: 'G D Em C G D C C', repeat: 2 },
    { name: 'Fiddle Break', type: 'solo', pattern: 'main', bars: 'G D Em C G D C C' },
    { name: 'Verse 2', type: 'verse', pattern: 'main', bars: 'G D Em C G D C C', repeat: 2 },
    { name: 'Chorus', type: 'chorus', pattern: 'main', bars: 'G D Em C G D C C', repeat: 2 },
    { name: 'Harmonica Break', type: 'solo', pattern: 'main', bars: 'G D Em C G D C C' },
    { name: 'Verse 3', type: 'verse', pattern: 'main', bars: 'G D Em C G D C C', repeat: 2 },
    { name: 'Breakdown', type: 'bridge', pattern: 'half', bars: 'G D Em C G D C C', band: 'light' },
    { name: 'Final Chorus', type: 'chorus', pattern: 'main', bars: 'G D Em C G D C C', repeat: 2 },
    { name: 'Outro', type: 'outro', pattern: 'end', bars: 'G', band: 'hit' },
  ],
  tips: [
    'Capo on fret 2 to sound like the record. Every shape stays exactly the same — the capo does the transposing.',
    'G → Em is the easy one: your index finger stays on the A string, 2nd fret. Pivot around it.',
    'Em → C: keep your middle finger on the D string, 2nd fret, and drop the other two into place.',
    'C lasts two full bars at the end of every loop — use that time to get ready for the G.',
    'Upstrokes only need the top three or four strings. Keep them light.',
    'Start at 60% speed with the click on. Speed up only when every change lands on beat 1.',
  ],
});
