/* App shell: routing, setlist, song player view, learn view, drills, completion. */
(function () {
  'use strict';
  const GS = window.GS;
  const T = GS.theory;
  const TL = GS.timeline;
  const engine = GS.engine;
  const player = new GS.Player(engine);
  const app = document.getElementById('app');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const PREF_KEY = 'strumline.prefs.v1';
  const prefs = Object.assign(
    { speed: 1, metronome: false, band: true, guitar: true, countIn: true, lyrics: true, vol: { guitar: 0.9, band: 0.7, click: 0.7 } },
    JSON.parse(localStorage.getItem(PREF_KEY) || '{}'),
  );
  const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  const DONE_KEY = 'strumline.done.v1';
  const done = JSON.parse(localStorage.getItem(DONE_KEY) || '{}');

  engine.vol = { ...prefs.vol };
  engine.muted = { guitar: !prefs.guitar, band: !prefs.band, click: false };
  player.metronome = prefs.metronome;
  player.countIn = prefs.countIn;
  player.speed = prefs.speed;

  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5.8v12.4a.8.8 0 0 1-1.25.66L10 12.66a.8.8 0 0 1 0-1.32l8.75-6.2A.8.8 0 0 1 20 5.8z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M11 6.2v11.6a.7.7 0 0 1-1.1.57L2.6 12.57a.7.7 0 0 1 0-1.14L9.9 5.63A.7.7 0 0 1 11 6.2zm10 0v11.6a.7.7 0 0 1-1.1.57l-7.3-5.8a.7.7 0 0 1 0-1.14l7.3-5.8A.7.7 0 0 1 21 6.2z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M13 6.2v11.6a.7.7 0 0 0 1.1.57l7.3-5.8a.7.7 0 0 0 0-1.14l-7.3-5.8A.7.7 0 0 0 13 6.2zm-10 0v11.6a.7.7 0 0 0 1.1.57l7.3-5.8a.7.7 0 0 0 0-1.14L4.1 5.63A.7.7 0 0 0 3 6.2z"/></svg>',
    down: '<svg viewBox="0 0 24 24" class="ar"><path d="M10 3h4v11h4.5L12 21.5 5.5 14H10z"/></svg>',
    up: '<svg viewBox="0 0 24 24" class="ar"><path d="M10 21h4V10h4.5L12 2.5 5.5 10H10z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate' };

  function chordName(name, cls = '') {
    const p = T.chordParts(name);
    return `<span class="cn ${cls}" style="--c:${T.chordColor(name)}">${esc(p.root)}${p.quality ? `<sup>${esc(p.quality)}</sup>` : ''}</span>`;
  }

  function songChords(song) {
    const out = [];
    for (const sec of song.sections) {
      for (const bar of sec.bars.trim().split(/\s+/)) for (const c of bar.split(',')) if (c !== 'NC' && !out.includes(c)) out.push(c);
    }
    return out;
  }

  function countLabels(meter, sub) {
    const out = [];
    for (let b = 0; b < meter; b++) {
      for (let s = 0; s < sub; s++) {
        if (s === 0) out.push(String(b + 1));
        else if (sub === 2) out.push('&');
        else if (sub === 4) out.push(['', 'e', '&', 'a'][s]);
        else if (sub === 3) out.push(['', '&', 'a'][s]);
        else out.push('·');
      }
    }
    return out;
  }

  function stepCell(tok) {
    switch (tok) {
      case 'D':
        return { html: ICON.down, cls: 'down' };
      case 'd':
        return { html: ICON.down, cls: 'down soft' };
      case 'U':
        return { html: ICON.up, cls: 'up' };
      case 'u':
        return { html: ICON.up, cls: 'up soft' };
      case 'x':
      case 'X':
        return { html: '✕', cls: 'mute' };
      case '.':
      case '-':
      case '_':
        return { html: '<i class="dot"></i>', cls: 'rest' };
      default:
        return { html: `<b>${esc(tok.replace(/B/g, 'R').replace(/b/g, 'r'))}</b>`, cls: 'pick' };
    }
  }

  function patternHTML(steps, meter, sub) {
    const toks = steps.trim().includes(' ') ? steps.trim().split(/\s+/) : steps.trim().split('');
    const per = meter * sub;
    const labels = countLabels(meter, sub);
    let html = '';
    for (let i = 0; i < Math.max(per, toks.length); i++) {
      const c = stepCell(toks[i % toks.length]);
      html += `<div class="ps-cell ${c.cls}${i % sub === 0 ? ' beat' : ''}"><div class="ps-g">${c.html}</div><div class="ps-n">${labels[i % per]}</div></div>`;
    }
    return html;
  }

  // ───────────────────────── Router ─────────────────────────
  let view = null;
  function route() {
    if (view && view.destroy) view.destroy();
    view = null;
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    window.scrollTo(0, 0);
    if (parts[0] === 'song') {
      const song = GS.songs.find((s) => s.id === parts[1]);
      if (song) return (view = SongView(song, { tab: parts[2] }));
    }
    if (parts[0] === 'drill') {
      const song = GS.songs.find((s) => s.id === parts[1]);
      if (song && parts[2] && parts[3]) return (view = SongView(TL.drillSong(song, parts[2], parts[3]), {}));
    }
    view = HomeView();
  }
  window.addEventListener('hashchange', route);

  // ───────────────────────── Home ─────────────────────────
  function HomeView() {
    const songs = GS.songs;
    const ww = songs.find((s) => s.id === 'wagon-wheel') || songs[0];
    app.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow"><span class="pulse-dot"></span> Acoustic guitar · beginner → intermediate</p>
          <h1 class="hero-title"><span class="ht-1">Play the songs</span><span class="ht-2">you actually</span><span class="ht-3">want to play.</span></h1>
          <p class="hero-sub">Chords fly down the fretboard, a synthesized band plays along, and you strum in time.
          Slow it down, loop the tricky part, and work up to the real thing — every note generated live in your browser.</p>
          <div class="hero-cta">
            <a class="btn btn-primary" href="#/song/${ww.id}">${ICON.play}<span>Start with ${esc(ww.title)}</span></a>
            <button class="btn btn-ghost" data-scroll="setlist">Browse the setlist</button>
          </div>
          <ul class="hero-stats">
            <li><b>${songs.length}</b><span>full songs</span></li>
            <li><b>${new Set(songs.flatMap(songChords)).size}</b><span>chord shapes</span></li>
            <li><b>0</b><span>logins, ever</span></li>
          </ul>
        </div>
        <div class="hero-stage">
          <canvas class="hero-canvas"></canvas>
          <div class="hero-stage-tag"><i></i>Live preview · ${esc(ww.title)}</div>
          <div class="hero-chord"></div>
        </div>
      </section>

      <section class="setlist" id="setlist">
        <header class="setlist-head">
          <div>
            <p class="eyebrow">Tonight's</p>
            <h2 class="section-title">Setlist</h2>
          </div>
          <div class="filters" role="tablist">
            <button class="pill on" data-f="all">All songs</button>
            <button class="pill" data-f="beginner">Beginner</button>
            <button class="pill" data-f="intermediate">Intermediate</button>
            <button class="pill" data-f="kids">Kids</button>
          </div>
        </header>
        <div class="cards">
          ${songs
            .map((s, i) => {
              const chords = songChords(s);
              const dur = GS.arrange(s).durationSec;
              const kids = (s.tags || []).includes('kids');
              return `<a class="card reveal" style="--c:${T.chordColor(chords[0])};--d:${Math.min(i, 12) * 60}ms" data-level="${s.level}" data-kids="${kids}" href="#/song/${s.id}">
                <div class="card-art">${GS.art.cover(s)}${done[s.id] ? '<span class="done-badge">✓ Played</span>' : ''}</div>
                <div class="card-body">
                  <div class="card-top"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="lvls">${kids ? '<span class="lvl lvl-kids">Kids</span>' : ''}<span class="lvl lvl-${s.level}">${LEVEL_LABEL[s.level]}</span></span></div>
                  <h3>${esc(s.title)}</h3>
                  <p class="by">${esc(s.artist)}</p>
                  <div class="chips">${chords.map((c) => chordName(c, 'chip')).join('')}</div>
                  <div class="card-meta"><span>${Math.round(s.bpm)} BPM</span><span>${s.capo ? 'Capo ' + s.capo : 'No capo'}</span><span>${T.fmtTime(dur)}</span></div>
                </div>
                <span class="card-go">Play ${ICON.play}</span>
              </a>`;
            })
            .join('')}
        </div>
      </section>

      <section class="how">
        <div class="how-step"><span class="how-n">1</span><h3>Learn the shapes</h3><p>Every chord with finger numbers, the strings to hit, and the one finger that never has to move.</p></div>
        <div class="how-step"><span class="how-n">2</span><h3>Lock the strum</h3><p>See and hear the pattern step by step — downs, ups, and the silent "ghost" strums in between.</p></div>
        <div class="how-step"><span class="how-n">3</span><h3>Play the whole song</h3><p>Intro to last chord on the highway. Drop the speed, loop a section, drill the hard change.</p></div>
      </section>
      <footer class="foot">Strumline · a proof of concept · all audio is synthesized in real time with Web Audio — no samples, no recordings.</footer>
    `;

    $$('.pill', app).forEach((b) =>
      b.addEventListener('click', () => {
        $$('.pill', app).forEach((x) => x.classList.toggle('on', x === b));
        const f = b.dataset.f;
        $$('.card', app).forEach((c) => c.classList.toggle('hide', f === 'kids' ? c.dataset.kids !== 'true' : f !== 'all' && c.dataset.level !== f));
      }),
    );
    $('[data-scroll]', app).addEventListener('click', () => $('#setlist').scrollIntoView({ behavior: 'smooth' }));

    // Attract mode: the real highway renderer looping a chunk of Wagon Wheel, silently.
    const tl = GS.arrange(ww);
    const hw = new GS.Highway($('.hero-canvas', app), { demo: true });
    hw.setTimeline(tl);
    const verse = tl.sections[1] || tl.sections[0];
    const loop = { start: verse.start, end: verse.start + tl.meter * 8 };
    hw.setLoop(loop);
    const chordEl = $('.hero-chord', app);
    const diag = new GS.diagram.ChordDiagram(chordEl, { compact: true });
    let lastSpan = -1;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now() / 1000;
      const beats = (((performance.now() - t0) / 1000) * tl.bpm * 0.82) / 60;
      const beat = loop.start + (beats % (loop.end - loop.start));
      const si = TL.spanIndexAt(tl, beat);
      const sp = tl.spans[si];
      if (si !== lastSpan) {
        lastSpan = si;
        diag.set(tl.shapes[sp.chord]);
        chordEl.style.setProperty('--c', sp.color);
      }
      hw.frame(beat, now, { chordColor: sp.color, level: 0.04 });
      raf = requestAnimationFrame(tick);
    };
    document.fonts.ready.then(() => (raf = requestAnimationFrame(tick)));

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.1 },
    );
    $$('.reveal', app).forEach((n) => io.observe(n));

    return {
      destroy() {
        cancelAnimationFrame(raf);
        hw.destroy();
        io.disconnect();
      },
    };
  }

  // ───────────────────────── Song ─────────────────────────
  function SongView(song, { tab }) {
    const tl = GS.arrange(song);
    const chords = tl.chordNames;
    const isDrill = !!song.drill;
    const parent = isDrill ? GS.songs.find((s) => s.id === song.drill.parent) : null;
    const capo0 = song.capo || 0;
    const firstColor = tl.spans[0].color;
    const totalSec = () => tl.durationSec / player.speed;

    app.innerHTML = `
      <section class="song" style="--chord:${firstColor}">
        <header class="song-head">
          <div class="song-id">
            <a class="back" href="${isDrill ? '#/song/' + parent.id : '#/'}" title="Back to ${isDrill ? esc(parent.title) : 'the setlist'}">←</a>
            <div class="song-cover">${GS.art.cover(isDrill ? parent : song)}</div>
            <div>
              <h1 class="song-title">${esc(song.title)}</h1>
              <p class="song-artist">${esc(song.artist)}${song.also ? ` <span>· also ${esc(song.also)}</span>` : ''}</p>
            </div>
          </div>
          <div class="song-meta">
            ${song.level ? `<span class="lvl lvl-${song.level}">${LEVEL_LABEL[song.level]}</span>` : ''}
            <span class="meta-chip"><b>${Math.round(song.bpm)}</b> BPM</span>
            <span class="meta-chip">${song.meter === 6 ? '6/8' : song.meter + '/4'}</span>
            ${capo0 ? `<span class="meta-chip capo-chip">Capo <b>${capo0}</b></span>` : ''}
            <span class="meta-chip">${T.fmtTime(tl.durationSec)}</span>
            <span class="meta-chords">${chords.map((c) => chordName(c, 'chip')).join('')}</span>
          </div>
          ${
            isDrill
              ? ''
              : `<nav class="tabs"><button class="tab on" data-tab="play">Play along</button><button class="tab" data-tab="learn">Learn it</button></nav>`
          }
        </header>

        <div class="tab-play">
          <div class="stage">
            <div class="highway-wrap">
              <canvas class="highway"></canvas>
              <div class="hud">
                <div class="hud-sec"><span class="hud-sec-name">${esc(tl.sections[0].name)}</span><span class="hud-bar">bar 1 / ${tl.sections[0].bars}</span></div>
                <div class="hud-right"><span class="hud-tempo">♩ ${Math.round(song.bpm * player.speed)}</span><span class="hud-capo"></span></div>
              </div>
              <div class="jam-hud" hidden>
                <div><b class="jam-score">0</b><span>score</span></div>
                <div><b class="jam-streak">0</b><span>streak</span></div>
                <div><b class="jam-acc">–</b><span>timing</span></div>
                <div class="jam-meter"><i></i></div>
              </div>
              <div class="lyrics" hidden>
                <div class="ly-cur"></div>
                <div class="ly-next"></div>
              </div>
              <button class="start-overlay">
                <span class="so-btn">${ICON.play}</span>
                <span class="so-title">${isDrill ? 'Start the drill' : 'Play along'}</span>
                <span class="so-sub">Space to play · ← → skip a bar · ↑ ↓ speed</span>
              </button>
            </div>
            <aside class="sidecar">
              <div class="now-card">
                <div class="sc-label">Now</div>
                <div class="now-diagram"></div>
                <div class="now-name"></div>
                <div class="now-hint"></div>
              </div>
              <div class="next-card">
                <div class="sc-label">Next <span class="next-in"></span></div>
                <div class="next-row">
                  <div class="next-diagram"></div>
                  <div class="next-side">
                    <div class="next-name"></div>
                    <svg class="next-ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="nr-bg"/><circle cx="20" cy="20" r="16" class="nr-fg"/></svg>
                  </div>
                </div>
                <div class="next-tip"></div>
              </div>
            </aside>
          </div>

          <div class="strip">
            <div class="strip-label"><span class="strip-name"></span><span class="strip-about"></span></div>
            <div class="pattern-strip"></div>
          </div>

          <div class="songmap">
            <div class="sm-track">
              ${tl.sections
                .map(
                  (s) =>
                    `<button class="sm-sec" data-i="${s.index}" style="left:${(s.start / tl.totalBeats) * 100}%;width:${((s.end - s.start) / tl.totalBeats) * 100}%;--sc:${GS.SECTION_COLORS[s.type] || '#ffb547'}" title="${esc(s.name)} · ${s.bars} bars — click to jump, shift-click to loop"><span>${esc(s.name)}</span></button>`,
                )
                .join('')}
              <div class="sm-loop" hidden></div>
              <div class="sm-head"></div>
            </div>
          </div>

          <div class="deck">
            <div class="transport">
              <button class="ibtn" data-act="restart" title="Restart (R)">${ICON.restart}</button>
              <button class="ibtn" data-act="prev" title="Previous section">${ICON.prev}</button>
              <button class="play-btn" data-act="toggle" title="Play / pause (Space)">${ICON.play}</button>
              <button class="ibtn" data-act="next" title="Next section">${ICON.next}</button>
              <div class="time"><b class="t-cur">0:00</b><span>/</span><span class="t-tot">${T.fmtTime(totalSec())}</span></div>
            </div>
            <div class="speed">
              <div class="deck-label">Speed <output class="speed-out">${Math.round(player.speed * 100)}%</output></div>
              <div class="seg">${[0.5, 0.6, 0.75, 0.9, 1].map((x) => `<button data-speed="${x}">${Math.round(x * 100)}</button>`).join('')}</div>
              <input class="speed-range" type="range" min="40" max="125" step="5" value="${Math.round(player.speed * 100)}" aria-label="Speed">
            </div>
            <div class="capo">
              <div class="deck-label">Capo</div>
              <select class="capo-sel" aria-label="Capo">${Array.from({ length: 8 }, (_, i) => `<option value="${i}" ${i === capo0 ? 'selected' : ''}>${i === 0 ? 'None' : 'Fret ' + i}${i === capo0 && capo0 ? ' ★' : ''}</option>`).join('')}</select>
              <small class="capo-note">${capo0 ? `★ = matches the record` : 'Open position'}</small>
            </div>
            <div class="pedals">
              <button class="pedal" data-toggle="metronome" title="Metronome (M)"><i class="led"></i><span>Click</span></button>
              <button class="pedal" data-toggle="band" title="Backing band"><i class="led"></i><span>Band</span></button>
              <button class="pedal" data-toggle="guitar" title="Guide guitar"><i class="led"></i><span>Guitar</span></button>
              <button class="pedal" data-toggle="countIn" title="One-bar count-in"><i class="led"></i><span>Count-in</span></button>
              <button class="pedal" data-toggle="loop" title="Loop current section (L)"><i class="led"></i><span>Loop part</span></button>
              <button class="pedal pedal-jam" data-toggle="jam" title="Listen through your mic and score your timing"><i class="led"></i><span>Jam mic</span></button>
              <button class="pedal" data-toggle="lyrics" title="Synced lyrics (local only)" hidden><i class="led"></i><span>Lyrics</span></button>
            </div>
            <div class="mixer">
              ${['guitar', 'band', 'click']
                .map(
                  (k) =>
                    `<label class="fader"><span>${k === 'click' ? 'Click' : k === 'band' ? 'Band' : 'Guitar'}</span><input type="range" min="0" max="100" value="${Math.round(engine.vol[k] * 100)}" data-vol="${k}"></label>`,
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="tab-learn" hidden></div>
      </section>
      <div class="modal" hidden></div>
    `;

    const root = $('.song', app);
    const hw = new GS.Highway($('.highway', root));
    hw.setTimeline(tl);
    const nowD = new GS.diagram.ChordDiagram($('.now-diagram', root));
    const nextD = new GS.diagram.ChordDiagram($('.next-diagram', root), { compact: true });
    const playBtn = $('.play-btn', root);
    const overlay = $('.start-overlay', root);
    const strip = $('.pattern-strip', root);
    const head = $('.sm-head', root);
    const loopEl = $('.sm-loop', root);
    const tCur = $('.t-cur', root);
    const tTot = $('.t-tot', root);
    const ring = $('.nr-fg', root);
    const RING_C = 2 * Math.PI * 16;
    ring.style.strokeDasharray = RING_C;

    player.load(tl, { capo: capo0 });
    player.speed = prefs.speed;
    hw.setLoop(null);

    // ── Controls ──
    const reflectToggles = () => {
      const st = {
        metronome: player.metronome,
        band: !engine.muted.band,
        guitar: !engine.muted.guitar,
        countIn: player.countIn,
        loop: !!player.loop,
        jam: !!(GS.jam && GS.jam.active),
        lyrics: !!prefs.lyrics,
      };
      $$('.pedal', root).forEach((p) => p.classList.toggle('on', !!st[p.dataset.toggle]));
    };
    const reflectSpeed = () => {
      const pct = Math.round(player.speed * 100);
      $('.speed-out', root).textContent = pct + '%';
      $('.speed-range', root).value = pct;
      $$('.seg button', root).forEach((b) => b.classList.toggle('on', Math.abs(Number(b.dataset.speed) - player.speed) < 0.001));
      $('.hud-tempo', root).textContent = `♩ ${Math.round(song.bpm * player.speed)}`;
      tTot.textContent = T.fmtTime(totalSec());
    };
    const reflectCapo = () => {
      $('.hud-capo', root).textContent = player.capo ? `capo ${player.capo}` : '';
    };
    const setSpeed = (x) => {
      x = Math.max(0.4, Math.min(1.25, Math.round(x * 100) / 100));
      player.setSpeed(x);
      prefs.speed = x;
      savePrefs();
      reflectSpeed();
    };
    const setLoopSection = (i) => {
      if (i == null) {
        player.setLoop(null);
      } else {
        const s = tl.sections[i];
        player.setLoop({ start: s.start, end: s.end, section: i });
      }
    };

    player.on('loop', (range) => {
      hw.setLoop(range);
      loopEl.hidden = !range;
      if (range) {
        loopEl.style.left = (range.start / tl.totalBeats) * 100 + '%';
        loopEl.style.width = ((range.end - range.start) / tl.totalBeats) * 100 + '%';
      }
      reflectToggles();
    });

    const sectionNow = () => TL.sectionIndexAt(tl, Math.max(0, player.beat));

    const actions = {
      toggle: () => {
        if (player.state === 'playing') player.pause();
        else startPlay();
      },
      restart: () => {
        const was = player.playing;
        player.stop();
        if (was) startPlay();
      },
      prev: () => {
        const b = Math.max(0, player.beat);
        let i = sectionNow();
        if (b - tl.sections[i].start < tl.meter && i > 0) i--;
        player.seek(tl.sections[i].start);
      },
      next: () => {
        const i = sectionNow();
        if (i < tl.sections.length - 1) player.seek(tl.sections[i + 1].start);
      },
    };

    async function startPlay() {
      preview.stop();
      overlay.classList.add('loading');
      $('.so-title', overlay).textContent = 'Tuning up…';
      await player.play();
      overlay.classList.remove('loading');
    }

    $$('[data-act]', root).forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));
    overlay.addEventListener('click', () => startPlay());
    $$('.seg button', root).forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
    $('.speed-range', root).addEventListener('input', (e) => setSpeed(Number(e.target.value) / 100));
    $('.capo-sel', root).addEventListener('change', async (e) => {
      await player.setCapo(Number(e.target.value));
      reflectCapo();
    });
    $$('[data-vol]', root).forEach((r) =>
      r.addEventListener('input', () => {
        const k = r.dataset.vol;
        engine.setVolume(k, Number(r.value) / 100);
        prefs.vol[k] = engine.vol[k];
        savePrefs();
      }),
    );
    $$('.pedal', root).forEach((p) =>
      p.addEventListener('click', async () => {
        const k = p.dataset.toggle;
        if (k === 'metronome') player.metronome = prefs.metronome = !player.metronome;
        else if (k === 'band') {
          prefs.band = engine.muted.band;
          engine.setMuted('band', !prefs.band);
        } else if (k === 'guitar') {
          prefs.guitar = engine.muted.guitar;
          engine.setMuted('guitar', !prefs.guitar);
        } else if (k === 'countIn') player.countIn = prefs.countIn = !player.countIn;
        else if (k === 'loop') setLoopSection(player.loop ? null : sectionNow());
        else if (k === 'jam') await toggleJam();
        else if (k === 'lyrics') {
          prefs.lyrics = !prefs.lyrics;
          lyricsEl.hidden = !(prefs.lyrics && lyrics);
          lastLine = -2;
        }
        savePrefs();
        reflectToggles();
      }),
    );

    // Song map: click to jump to a bar, shift-click a section to loop it.
    $('.sm-track', root).addEventListener('click', (e) => {
      const track = $('.sm-track', root);
      const r = track.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const secBtn = e.target.closest('.sm-sec');
      if (e.shiftKey && secBtn) {
        setLoopSection(Number(secBtn.dataset.i));
        player.seek(tl.sections[Number(secBtn.dataset.i)].start);
        return;
      }
      const bar = Math.floor((frac * tl.totalBeats) / tl.meter);
      const b = bar * tl.meter;
      if (player.loop && (b < player.loop.start || b >= player.loop.end)) setLoopSection(null);
      player.seek(b);
    });

    const offState = player.on('state', (s) => {
      playBtn.innerHTML = s === 'playing' ? ICON.pause : ICON.play;
      root.classList.toggle('is-playing', s === 'playing');
      overlay.classList.toggle('gone', s === 'playing');
      if (s === 'paused') $('.so-title', overlay).textContent = 'Paused — keep going';
      if (s === 'ready') $('.so-title', overlay).textContent = isDrill ? 'Start the drill' : 'Play along';
    });
    const offEnd = player.on('end', () => {
      if (!isDrill) {
        done[song.id] = Date.now();
        localStorage.setItem(DONE_KEY, JSON.stringify(done));
      }
      setTimeout(showComplete, 900);
    });

    const onKey = (e) => {
      if (e.target.closest('input, select, textarea')) return;
      if ($('.tab-play', root).hidden) return;
      const bar = tl.meter;
      if (e.code === 'Space') {
        e.preventDefault();
        actions.toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        player.seek(Math.floor(Math.max(0, player.beat) / bar + 1) * bar);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        player.seek(Math.max(0, Math.floor(Math.max(0, player.beat) / bar - 1) * bar));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSpeed(player.speed + 0.05);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSpeed(player.speed - 0.05);
      } else if (e.key === 'r' || e.key === 'R') actions.restart();
      else if (e.key === 'm' || e.key === 'M') $('[data-toggle="metronome"]', root).click();
      else if (e.key === 'l' || e.key === 'L') $('[data-toggle="loop"]', root).click();
    };
    window.addEventListener('keydown', onKey);

    const onVis = () => document.hidden && player.pause();
    document.addEventListener('visibilitychange', onVis);

    // ── Tabs ──
    let learnBuilt = false;
    const showTab = (t) => {
      $$('.tab', root).forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
      $('.tab-play', root).hidden = t !== 'play';
      $('.tab-learn', root).hidden = t !== 'learn';
      if (t === 'learn') {
        player.pause();
        if (!learnBuilt) {
          learnBuilt = true;
          buildLearn($('.tab-learn', root), song, tl, { goPlay: (speed) => (speed && setSpeed(speed), showTab('play')) });
        }
      } else {
        hw.resize();
      }
    };
    $$('.tab', root).forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

    // ── Jam mode ──
    async function toggleJam() {
      if (!GS.jam) return;
      if (GS.jam.active) {
        GS.jam.stop();
        $('.jam-hud', root).hidden = true;
        engine.setMuted('guitar', !prefs.guitar);
        return;
      }
      try {
        toast('Jam mode: allow the microphone. Headphones recommended so it only hears you.');
        await engine.resume();
        await GS.jam.start(engine, player, {
          onJudge: (j) => {
            hw.judge(j.label, j.color);
          },
        });
        $('.jam-hud', root).hidden = false;
        // Your guitar takes over the guide part; the band keeps you company.
        engine.setMuted('guitar', true);
        toast('Listening! Guide guitar muted — you are the guitar now.');
      } catch (err) {
        toast('Mic unavailable — allow microphone access to use Jam mode.');
      }
    }

    // ── Lyrics (personal-use cache in data/lyrics, never committed; absent on the public site) ──
    const lyricsEl = $('.lyrics', root);
    const lyCur = $('.ly-cur', root);
    const lyNext = $('.ly-next', root);
    let lyrics = null;
    let lastLine = -2;
    const lyricId = isDrill ? null : song.id;
    if (lyricId) {
      const tag = document.createElement('script');
      tag.src = `data/lyrics/${lyricId}.js`;
      tag.onload = () => {
        lyrics = GS.lyrics && GS.lyrics[lyricId];
        if (!lyrics) return;
        $('[data-toggle="lyrics"]', root).hidden = false;
        lyricsEl.hidden = !prefs.lyrics;
        reflectToggles();
      };
      tag.onerror = () => tag.remove();
      document.body.appendChild(tag);
    }
    const lineHTML = (ln) => {
      if (!ln) return '';
      if (!ln.chart || !ln.chords || !ln.chords.length) return `<span class="ly-text">${esc(ln.text)}</span>`;
      // Chords sit over the word they fall on in the chart's version of the line.
      const t = ln.chart;
      const cuts = ln.chords.map(([c]) => Math.min(c, t.length)).concat([t.length]);
      let html = cuts[0] > 0 ? `<span class="ly-seg">${esc(t.slice(0, cuts[0]))}</span>` : '';
      ln.chords.forEach(([c, name], i) => {
        const seg = t.slice(cuts[i], cuts[i + 1]) || ' ';
        html += `<span class="ly-seg"><b class="ly-ch" style="--c:${T.chordColor(name)}">${esc(name)}</b>${esc(seg)}</span>`;
      });
      return html;
    };
    const updateLyrics = (beat) => {
      if (!lyrics || lyricsEl.hidden) return;
      const L = lyrics.lines;
      // Show a line a beat early so you can read ahead.
      let i = -1;
      for (let k = 0; k < L.length; k++) {
        if (L[k].beat - 1 <= beat) i = k;
        else break;
      }
      const cur = L[i];
      const nxt = L[i + 1];
      const instrumental = !cur || (nxt && nxt.beat - cur.beat > 3 * tl.meter && beat - cur.beat > 2 * tl.meter);
      const key = instrumental ? -1 - (i + 1) : i;
      if (key !== lastLine) {
        lastLine = key;
        lyCur.innerHTML = instrumental ? '<span class="ly-inst">♪</span>' : lineHTML(cur);
        lyNext.innerHTML = lineHTML(instrumental ? nxt : L[i + 1]);
        lyCur.classList.remove('in');
        void lyCur.offsetWidth;
        lyCur.classList.add('in');
      }
      if (!instrumental && cur) {
        const end = nxt ? Math.min(nxt.beat, cur.beat + 4 * tl.meter) : cur.beat + 2 * tl.meter;
        const p = Math.max(0, Math.min(1, (beat - cur.beat) / Math.max(0.5, end - cur.beat)));
        lyCur.style.setProperty('--p', (p * 100).toFixed(1) + '%');
      }
    };

    // ── Per-frame UI ──
    let lastSpan = -1;
    let lastBar = -1;
    let lastStep = -1;
    let lastSec = -1;
    let lastT = -1;
    let raf = 0;
    const nowName = $('.now-name', root);
    const nowHint = $('.now-hint', root);
    const nextName = $('.next-name', root);
    const nextIn = $('.next-in', root);
    const nextTip = $('.next-tip', root);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const beat = player.beat;
      const b = Math.max(0, Math.min(tl.totalBeats - 0.001, beat));
      const si = TL.spanIndexAt(tl, b);
      const sp = tl.spans[si];
      const nx = tl.spans[si + 1];

      if (si !== lastSpan) {
        lastSpan = si;
        const shp = tl.shapes[sp.chord];
        const nshp = nx ? tl.shapes[nx.chord] : null;
        nowD.set(shp, { anchors: nshp ? T.anchors(shp, nshp) : [] });
        nowName.innerHTML = chordName(sp.chord);
        const secPat = song.patterns[tl.sections[sp.section].pattern];
        nowHint.textContent = /\s/.test(secPat.steps.trim()) ? `Root on the ${T.STRING_NAMES[shp.bass]} string` : T.strumAdvice(shp);
        root.style.setProperty('--chord', sp.color);
        if (nx) {
          nextD.set(nshp);
          nextName.innerHTML = chordName(nx.chord);
          nextTip.textContent = nx.chord === sp.chord ? '' : T.changeTip(shp, nshp);
          $('.next-card', root).classList.remove('empty');
        } else {
          $('.next-card', root).classList.add('empty');
          nextName.innerHTML = '<span class="cn">—</span>';
          nextTip.textContent = 'Last chord — let it ring.';
        }
      }
      if (nx) {
        const left = nx.beat - b;
        const prog = Math.max(0, Math.min(1, (b - sp.beat) / sp.len));
        ring.style.strokeDashoffset = RING_C * (1 - prog);
        const beatsLeft = Math.ceil(left - 1e-6);
        nextIn.textContent = beat < 0 ? '' : beatsLeft <= 1 ? 'change!' : `in ${beatsLeft}`;
        $('.next-card', root).classList.toggle('imminent', left <= 1 && beat >= 0);
      }

      const bi = TL.barIndexAt(tl, b);
      if (bi !== lastBar) {
        lastBar = bi;
        lastStep = -1;
        const bar = tl.bars[bi];
        strip.innerHTML = bar.tokens
          .map((tok, i) => {
            const c = stepCell(tok);
            return `<div class="ps-cell ${c.cls}${i % tl.sub === 0 ? ' beat' : ''}"><div class="ps-g">${c.html}</div><div class="ps-n">${countLabels(tl.meter, tl.sub)[i]}</div></div>`;
          })
          .join('');
        const sec = tl.sections[bar.section];
        if (bar.section !== lastSec) {
          lastSec = bar.section;
          const pat = song.patterns[sec.pattern];
          $('.strip-name', root).textContent = pat.name;
          $('.strip-about', root).textContent = pat.about || '';
          $('.hud-sec-name', root).textContent = sec.name;
          $$('.sm-sec', root).forEach((x) => x.classList.toggle('on', Number(x.dataset.i) === bar.section));
        }
        $('.hud-bar', root).textContent = `bar ${Math.floor((bar.beat - sec.start) / tl.meter) + 1} / ${sec.bars}`;
      }
      const step = beat < 0 ? -1 : Math.floor((b - tl.bars[bi].beat) * tl.sub);
      if (step !== lastStep) {
        const cells = strip.children;
        if (cells[lastStep]) cells[lastStep].classList.remove('cur');
        if (cells[step]) cells[step].classList.add('cur');
        lastStep = step;
      }

      head.style.left = (b / tl.totalBeats) * 100 + '%';
      const tsec = Math.floor((Math.max(0, beat) * 60) / (tl.bpm * player.speed));
      if (tsec !== lastT) {
        lastT = tsec;
        tCur.textContent = T.fmtTime(tsec);
      }
      if (GS.jam && GS.jam.active) {
        const st = GS.jam.stats;
        $('.jam-score', root).textContent = st.score;
        $('.jam-streak', root).textContent = st.streak;
        $('.jam-acc', root).textContent = st.judged ? Math.round((st.good / st.judged) * 100) + '%' : '–';
        $('.jam-meter i', root).style.transform = `scaleX(${Math.min(1, GS.jam.level * 8)})`;
      }
      updateLyrics(beat);
      hw.frame(beat, performance.now() / 1000, { level: player.playing ? engine.level() : 0, chordColor: sp.color });
    };
    document.fonts.ready.then(() => (raf = requestAnimationFrame(frame)));

    function showComplete() {
      const modal = $('.modal');
      const pct = Math.round(player.speed * 100);
      const idx = GS.songs.findIndex((s) => s.id === (isDrill ? parent.id : song.id));
      const nextSong = GS.songs[(idx + 1) % GS.songs.length];
      const jam = GS.jam && GS.jam.active ? GS.jam.stats : null;
      const colors = chords.map((c) => T.chordColor(c));
      modal.innerHTML = `
        <div class="modal-card">
          <div class="confetti">${Array.from({ length: 46 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--r:${Math.random() * 720 - 360}deg;--d:${Math.random() * 0.6}s;--t:${1.6 + Math.random() * 1.4}s;background:${colors[i % colors.length]}"></i>`).join('')}</div>
          <p class="eyebrow">${isDrill ? 'Drill complete' : 'Song complete'}</p>
          <h2>${isDrill ? 'Nice changes.' : 'You just played <em>' + esc(song.title) + '</em>.'}</h2>
          <p class="mc-sub">${isDrill ? `${esc(song.title)} at ${pct}% speed.` : `Intro to last chord, ${T.fmtTime(totalSec())} at ${pct}% speed.`}</p>
          ${
            jam
              ? `<div class="mc-stats"><div><b>${jam.score}</b><span>score</span></div><div><b>${jam.bestStreak}</b><span>best streak</span></div><div><b>${jam.judged ? Math.round((jam.good / jam.judged) * 100) : 0}%</b><span>on time</span></div></div>`
              : ''
          }
          <div class="mc-actions">
            <button class="btn btn-ghost" data-m="again">Play again</button>
            ${pct < 100 ? `<button class="btn btn-ghost" data-m="faster">Try at ${Math.min(100, pct + 15)}%</button>` : ''}
            ${isDrill ? `<a class="btn btn-primary" href="#/song/${parent.id}">Back to ${esc(parent.title)}</a>` : `<a class="btn btn-primary" href="#/song/${nextSong.id}">Next: ${esc(nextSong.title)} →</a>`}
          </div>
        </div>`;
      modal.hidden = false;
      const close = () => (modal.hidden = true);
      modal.onclick = (e) => e.target === modal && close();
      $('[data-m="again"]', modal).onclick = () => {
        close();
        if (GS.jam && GS.jam.active) GS.jam.reset();
        player.stop();
        startPlay();
      };
      const f = $('[data-m="faster"]', modal);
      if (f)
        f.onclick = () => {
          close();
          setSpeed(Math.min(1, player.speed + 0.15));
          player.stop();
          startPlay();
        };
      $$('a', modal).forEach((a) => a.addEventListener('click', close));
    }

    reflectToggles();
    reflectSpeed();
    reflectCapo();
    if (tab === 'learn' && !isDrill) showTab('learn');

    return {
      destroy() {
        cancelAnimationFrame(raf);
        player.stop();
        offState();
        offEnd();
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVis);
        hw.destroy();
        if (GS.jam && GS.jam.active) GS.jam.stop();
        $('.modal') && ($('.modal').hidden = true);
      },
    };
  }

  // ───────────────────────── Learn ─────────────────────────
  const preview = new GS.Player(engine);
  preview.countIn = false;

  function buildLearn(host, song, tl, { goPlay }) {
    const chords = tl.chordNames;
    const meter = tl.meter;
    const sub = tl.sub;
    const usedPatterns = [...new Set(tl.sections.map((s) => s.pattern))].filter((k) => k !== 'end');
    const pairs = new Map();
    for (let i = 0; i < tl.spans.length - 1; i++) {
      const a = tl.spans[i].chord;
      const b = tl.spans[i + 1].chord;
      if (a === b) continue;
      const k = a + '→' + b;
      pairs.set(k, { a, b, n: (pairs.get(k) || { n: 0 }).n + 1 });
    }
    const changes = [...pairs.values()].sort((x, y) => y.n - x.n);

    host.innerHTML = `
      <div class="learn">
        <p class="learn-intro">${esc(song.blurb || '')}</p>
        <ol class="path">
          ${(song.skills || []).map((s) => `<li>${esc(s)}</li>`).join('')}
        </ol>

        <section class="lb">
          <h2 class="lb-title"><span>01</span>The chords</h2>
          <p class="lb-sub">Numbers are fingers: 1 index · 2 middle · 3 ring · 4 pinky. ✕ = don't play that string, o = play it open. Tap a card to hear it.</p>
          <div class="chord-cards">
            ${chords
              .map((c) => {
                const shp = tl.shapes[c];
                return `<button class="chord-card" data-chord="${esc(c)}" style="--c:${shp.color}">
                  <div class="cc-head">${chordName(c)}<span class="cc-play">${ICON.speaker}</span></div>
                  <div class="cc-diagram">${GS.diagram.staticSVG(shp)}</div>
                  <ul class="cc-steps">${T.fingerGuide(shp)
                    .map((l) => `<li><i class="fdot f${l.finger}">${l.finger}</i>${esc(l.text)}</li>`)
                    .join('')}</ul>
                  <div class="cc-strum">${esc(T.strumAdvice(shp))}</div>
                </button>`;
              })
              .join('')}
          </div>
        </section>

        <section class="lb">
          <h2 class="lb-title"><span>02</span>The ${usedPatterns.some((p) => /\s/.test(song.patterns[p].steps.trim())) ? 'picking & strumming' : 'strum'}</h2>
          <p class="lb-sub">Read left to right. Count out loud. Your strumming hand keeps a steady down-up motion the whole time — the dots are "ghost" strums where you swing past the strings.</p>
          <div class="patterns">
            ${usedPatterns
              .map((k) => {
                const p = song.patterns[k];
                const secs = tl.sections.filter((s) => s.pattern === k).map((s) => s.name);
                return `<div class="pattern-card">
                  <div class="pc-head"><h3>${esc(p.name)}</h3><button class="btn btn-small" data-hear="${esc(k)}">${ICON.play}<span>Hear it</span></button></div>
                  <div class="pattern-strip big">${patternHTML(p.steps, meter, sub)}</div>
                  <p>${esc(p.about || '')}</p>
                  <p class="pc-used">Used in: ${esc([...new Set(secs)].join(', '))}</p>
                </div>`;
              })
              .join('')}
          </div>
        </section>

        <section class="lb">
          <h2 class="lb-title"><span>03</span>The changes</h2>
          <p class="lb-sub">Clean changes are 90% of sounding good. Drill each one until your fingers land together, on the beat.</p>
          <div class="changes">
            ${changes
              .map(
                (ch) => `<div class="change">
                  <div class="ch-pair">
                    <div class="ch-d" style="--c:${T.chordColor(ch.a)}">${GS.diagram.staticSVG(tl.shapes[ch.a], { compact: true })}${chordName(ch.a)}</div>
                    <span class="ch-arrow">→</span>
                    <div class="ch-d" style="--c:${T.chordColor(ch.b)}">${GS.diagram.staticSVG(tl.shapes[ch.b], { compact: true })}${chordName(ch.b)}</div>
                  </div>
                  <div class="ch-body">
                    <p class="ch-count">${ch.n}× in the song</p>
                    <p>${esc(T.changeTip(tl.shapes[ch.a], tl.shapes[ch.b]))}</p>
                    <a class="btn btn-small" href="#/drill/${song.id}/${encodeURIComponent(ch.a)}/${encodeURIComponent(ch.b)}">${ICON.play}<span>Drill it</span></a>
                  </div>
                </div>`,
              )
              .join('')}
          </div>
        </section>

        <section class="lb">
          <h2 class="lb-title"><span>04</span>The road map</h2>
          <div class="roadmap">
            ${tl.sections
              .map((s) => {
                const def = song.sections[s.index];
                const bars = def.bars.trim().split(/\s+/);
                return `<div class="rm-row" style="--sc:${GS.SECTION_COLORS[s.type] || '#ffb547'}">
                  <div class="rm-name"><b>${esc(s.name)}</b><span>${s.bars} bars · ${esc(song.patterns[s.pattern].name)}</span></div>
                  <div class="rm-bars">${bars.map((b) => `<span class="rm-bar">${b.split(',').map((c) => (c === 'NC' ? '<span class="cn">N.C.</span>' : chordName(c))).join('<i>·</i>')}</span>`).join('')}${def.repeat > 1 ? `<span class="rm-rep">×${def.repeat}</span>` : ''}</div>
                </div>`;
              })
              .join('')}
          </div>
        </section>

        <section class="lb">
          <h2 class="lb-title"><span>05</span>Pro tips</h2>
          <ul class="tips">${(song.tips || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </section>

        <div class="learn-cta">
          <div><h3>Ready?</h3><p>Start slow with the click on. Speed up when every change lands on beat 1.</p></div>
          <div class="lc-btns">
            <button class="btn btn-ghost" data-go="0.6">Play at 60%</button>
            <button class="btn btn-primary" data-go="1">${ICON.play}<span>Full speed</span></button>
          </div>
        </div>
      </div>`;

    $$('.chord-card', host).forEach((b) =>
      b.addEventListener('click', () => {
        b.classList.remove('ping');
        void b.offsetWidth;
        b.classList.add('ping');
        engine.previewChord(tl.shapes[b.dataset.chord], { capo: player.capo, arpeggio: true });
      }),
    );

    $$('[data-hear]', host).forEach((btn) =>
      btn.addEventListener('click', async () => {
        const k = btn.dataset.hear;
        if (preview.playing && preview.tl && preview.tl.song.previewKey === k) {
          preview.stop();
          return;
        }
        const sec = tl.sections.find((s) => s.pattern === k);
        const firstBar = song.sections[sec.index].bars.trim().split(/\s+/)[0];
        const mini = {
          id: 'preview',
          previewKey: k,
          bpm: Math.round(song.bpm * 0.85),
          meter,
          sub,
          pulse: song.pulse,
          feel: song.feel,
          shapes: song.shapes,
          patterns: { p: song.patterns[k] },
          sections: [{ name: 'Preview', pattern: 'p', bars: `${firstBar} ${firstBar}`, band: 'off' }],
        };
        preview.load(GS.arrange(mini), { capo: player.capo });
        preview.metronome = true;
        $$('[data-hear]', host).forEach((x) => x.classList.remove('on'));
        btn.classList.add('on');
        const card = btn.closest('.pattern-card');
        const cells = $$('.ps-cell', card);
        await preview.play({ countIn: true });
        const anim = () => {
          if (preview.state !== 'playing') {
            cells.forEach((c) => c.classList.remove('cur'));
            btn.classList.remove('on');
            return;
          }
          const b = preview.beat;
          const step = b < 0 ? -1 : Math.floor(b * sub) % cells.length;
          cells.forEach((c, i) => c.classList.toggle('cur', i === step));
          requestAnimationFrame(anim);
        };
        anim();
      }),
    );

    $$('[data-go]', host).forEach((b) => b.addEventListener('click', () => goPlay(Number(b.dataset.go))));
  }

  function toast(msg) {
    let t = $('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3600);
  }

  route();
})();
