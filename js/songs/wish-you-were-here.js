GS.registerSong({
  id: 'wish-you-were-here',
  order: 20,
  title: 'Wish You Were Here',
  artist: 'Pink Floyd',
  level: 'intermediate',
  bpm: 58.6,
  meter: 4,
  sub: 4,
  capo: 0,
  key: 'G',
  feel: 'folk',
  blurb:
    'The iconic acoustic riff rides on two anchored fingers, and the slow verse adds a D/F# that teaches you to move the bass line under your chords.',
  skills: ['Em7 · G · A7sus4 · C · D/F# · Am', 'Anchored ring + pinky', 'Slow sixteenth strum'],
  shapes: {
    G: { frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] },
    'D/F#': { frets: [2, -1, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3] },
  },
  patterns: {
    riff: {
      name: 'Bass and strum',
      steps: 'B . D U . U D U b . D U . U D U',
      about:
        'Pick the bass note on beat 1 and the alternate bass on beat 3, strumming the chord in between. A six-string stand-in for the 12-string intro riff.',
    },
    verse: {
      name: 'Sixteenth strum',
      steps: 'D.D.DUDU.UDUD.DU',
      about: 'Count "1 e & a". Downs on the beats and "&"s, ups on the "e"s and "a"s. Keep the hand swinging even where you skip.',
    },
    jam: {
      name: 'Open strum',
      steps: 'D...D.DU.U.UD.DU',
      about: 'Roomier sixteenths for the outro jam. Let beat 1 ring before you start moving.',
    },
    end: { name: 'Last strum', steps: 'D...............', about: 'One strum. Let it fade like the wind at the end of the record.' },
  },
  sections: [
    { name: "Intro", type: 'intro', pattern: 'riff', bars: 'Em7 G Em7 G Em7 A7sus4 Em7 A7sus4 G Em7 G Em7 G Em7 A7sus4 Em7 A7sus4 G Em7 G Em7 G Em7 A7sus4' },
    { name: "Verse 1", type: 'verse', pattern: 'verse', bars: 'C D/F# Am G D/F# C Am G' },
    { name: "Verse 2", type: 'verse', pattern: 'verse', bars: 'C D/F# Am G D/F# C Am G' },
    { name: "Instrumental", type: 'solo', pattern: 'riff', bars: 'Em7 G Em7 G Em7 A7sus4 Em7 A7sus4' },
    { name: "Verse 3", type: 'verse', pattern: 'verse', bars: 'C D/F# Am G D/F# C Am G C D/F# Am G D/F# C Am G' },
    { name: "Instrumental", type: 'solo', pattern: 'riff', bars: 'Em7 G Em7 G Em7 A7sus4 Em7 A7sus4 G Em7 G Em7 G Em7 A7sus4 Em7 A7sus4 G' },
    { name: "End", type: 'outro', pattern: 'end', bars: 'G', band: 'hit' },
  ],
  tips: [
    'Ring finger on the B string fret 3 and pinky on high e fret 3 stay down for Em7, G and A7sus4. The whole riff pivots on them.',
    'Em7 → G: your index stays on the A string, fret 2. Only your middle moves, from the D string fret 2 to the low E string fret 3.',
    'Em7 → A7sus4: your middle stays on the D string, fret 2. Lift the index and start the strum from the open A string.',
    'D/F#: index on the low E string fret 2, with its tip leaning on the A string to mute it. Middle, ring and pinky make the D shape on top.',
    'G → D/F# in the verse: the bass steps down one fret on the low E string, from fret 3 to fret 2.',
    'At 61 bpm the bars are long. Count sixteenths out loud and keep the strumming hand moving so you do not rush the changes.',
  ],
});
