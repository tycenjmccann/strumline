#!/usr/bin/env python3
"""Rebuild each song's arrangement from the real recording's timing.

Inputs (data/.cache/<id>.json from tools/fetch-sources.py):
  * time-synced lyrics (LRCLIB): when each sung line starts on the record
  * chord-over-words chart (Ultimate Guitar): which chord sits over which word, plus section labels
Method: match chart lines to timed lines, turn every chord's position in its line into a time,
fit a bar grid (tempo + downbeat) to those times, then snap chords to half bars.
Outputs:
  * js/songs/<id>.js   bpm + sections replaced (chords and structure only; safe to commit)
  * data/lyrics/<id>.js timed lyric lines with chords over the words (personal use; gitignored)
Prints numbers only; never prints lyric text.
usage: python3 tools/build-arrangements.py [--write] [song-id ...]
"""
import difflib, json, math, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', '.cache')
LYR = os.path.join(ROOT, 'data', 'lyrics')

PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
SPELL = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
SECTION_RE = re.compile(r'^\s*\[(?!ch\]|/ch\]|tab\]|/tab\])([^\]]{1,40})\]\s*$')
CH_RE = re.compile(r'\[ch\]([^\[]+)\[/ch\]')
REPEAT_RE = re.compile(r'[x×]\s*(\d)\b|\((\d)x\)', re.I)


def node_json(js):
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))


def load_song_meta():
    js = ("global.window=global;const fs=require('fs');require('./js/theory.js');"
          "for(const f of fs.readdirSync('js/songs'))require('./js/songs/'+f);"
          "console.log(JSON.stringify({chords:Object.keys(GS.theory.CHORDS),songs:GS.songs.map(s=>({id:s.id,bpm:s.bpm,meter:s.meter||4,sub:s.sub||2,"
          "capo:s.capo||0,patterns:Object.keys(s.patterns),shapes:Object.keys(s.shapes||{}),sections:s.sections,"
          "pcs:Object.fromEntries([...Object.keys(GS.theory.CHORDS),...Object.keys(s.shapes||{})].map(n=>[n,GS.theory.shape(n,s.shapes).pitchClasses.slice().sort((a,b)=>a-b).join(',')]))}))}))")
    return node_json(js)


# ---------------------------------------------------------------- chord names
def parse_chord(name):
    m = re.match(r'^([A-G])([#b]?)(.*)$', name.strip())
    if not m:
        return None
    pc = (PC[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)) % 12
    return pc, m.group(3)


def to_library(name, shift, available):
    """Transpose by `shift` semitones and map to the nearest shape the app has."""
    p = parse_chord(name.split('/')[0])
    if not p:
        return None
    pc, qual = p
    root = SPELL[(pc + shift) % 12]
    full = name if shift == 0 else None
    if full and full in available:
        return full
    candidates = [qual]
    simplify = [(r'^maj7$', ''), (r'^6$', ''), (r'^add9$', 'add9'), (r'^add9$', ''), (r'^sus2$', 'sus2'), (r'^sus2$', ''),
                (r'^m7$', 'm7'), (r'^m7$', 'm'), (r'^m9$', 'm'), (r'^7sus4$', '7sus4'), (r'^7sus4$', 'sus4'), (r'^sus4$', 'sus4'),
                (r'^sus4$', ''), (r'^9$', '7'), (r'^7$', '7'), (r'^7$', ''), (r'^5$', '5'), (r'^m6$', 'm'), (r'^dim.*$', 'm'), (r'^m$', 'm')]
    for pat, rep in simplify:
        if re.match(pat, qual):
            candidates.append(re.sub(pat, rep, qual))
    candidates.append('m' if qual.startswith('m') and not qual.startswith('maj') else '')
    for q in candidates:
        for r in ([root] + ([{'C#': 'Db', 'Eb': 'D#', 'F#': 'Gb', 'Ab': 'G#', 'Bb': 'A#'}[root]] if root in ('C#', 'Eb', 'F#', 'Ab', 'Bb') else [])):
            if r + q in available:
                return r + q
    return None


# ---------------------------------------------------------------- parsing
def parse_lrc(text):
    out = []
    for line in text.split('\n'):
        m = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$', line.strip())
        if m:
            t = int(m.group(1)) * 60 + float(m.group(2))
            words = m.group(3).strip()
            if words:
                out.append({'t': t, 'text': words})
    return out


def parse_chart(content):
    """Ordered entries: section markers, instrumental chord lines, and vocal lines with chord columns."""
    lines = [l.replace('\r', '') for l in content.split('\n')]
    entries = []
    i = 0
    while i < len(lines):
        raw = lines[i].replace('[tab]', '').replace('[/tab]', '')
        sec = SECTION_RE.match(raw)
        if sec:
            entries.append({'kind': 'section', 'name': sec.group(1).strip()})
            i += 1
            continue
        chords = list(CH_RE.finditer(raw))
        rest = CH_RE.sub('', raw)
        if chords and not re.sub(r'[\s|\-x×\d()/.:]+', '', rest):
            cols, off = [], 0
            for m in chords:
                cols.append((m.start() - off, m.group(1).strip()))
                off += len(m.group(0)) - len(m.group(1))
            rep = REPEAT_RE.search(rest)
            nxt = lines[i + 1].replace('[tab]', '').replace('[/tab]', '') if i + 1 < len(lines) else ''
            if nxt.strip() and not CH_RE.search(nxt) and not SECTION_RE.match(nxt) and not REPEAT_RE.fullmatch(nxt.strip()):
                entries.append({'kind': 'vocal', 'chords': cols, 'text': nxt.rstrip()})
                i += 2
                continue
            entries.append({'kind': 'inst', 'chords': [c for _, c in cols], 'repeat': int((rep.group(1) or rep.group(2))) if rep else 1})
            i += 1
            continue
        if chords:
            cols, off = [], 0
            for m in chords:
                cols.append((m.start() - off, m.group(1).strip()))
                off += len(m.group(0))
            entries.append({'kind': 'vocal', 'chords': cols, 'text': rest.rstrip()})
            i += 1
            continue
        if raw.strip() and not REPEAT_RE.fullmatch(raw.strip()):
            entries.append({'kind': 'vocal', 'chords': [], 'text': raw.rstrip()})
        i += 1
    return entries


def expand_repeats(entries):
    out, last = [], {}
    cur = None
    i = 0
    while i < len(entries):
        e = entries[i]
        if e['kind'] == 'section':
            j = i + 1
            body = []
            while j < len(entries) and entries[j]['kind'] != 'section':
                body.append(entries[j]); j += 1
            base = re.sub(r'[^a-z]', '', e['name'].lower())
            if not [b for b in body if b['kind'] == 'vocal'] and base in last and not [b for b in body if b['kind'] == 'inst']:
                body = [dict(b) for b in last[base]]
            if [b for b in body if b['kind'] in ('vocal', 'inst')]:
                last[base] = body
            out.append(e); out.extend(body)
            i = j
            continue
        out.append(e); i += 1
    return out


def words(s):
    return re.findall(r"[a-z0-9']+", s.lower())


def similarity(a, b):
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return 0
    return difflib.SequenceMatcher(None, wa, wb).ratio()


def align(chart_lines, lrc):
    """Monotonic alignment of chart vocal lines to timed lines (DP, gaps allowed)."""
    n, m = len(chart_lines), len(lrc)
    S = [[similarity(chart_lines[i]['text'], lrc[j]['text']) for j in range(m)] for i in range(n)]
    INF = -1e9
    best = [[0.0] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        for j in range(m + 1):
            if i == 0 and j == 0:
                continue
            opts = []
            if i > 0:
                opts.append((best[i - 1][j], (i - 1, j, False)))
            if j > 0:
                opts.append((best[i][j - 1], (i, j - 1, False)))
            if i > 0 and j > 0 and S[i - 1][j - 1] >= 0.45:
                opts.append((best[i - 1][j - 1] + S[i - 1][j - 1], (i - 1, j - 1, True)))
            best[i][j], back[i][j] = max(opts, key=lambda o: o[0]) if opts else (INF, None)
    pairs, i, j = {}, n, m
    while i > 0 or j > 0:
        pi, pj, matched = back[i][j]
        if matched:
            pairs[pi] = pj
        i, j = pi, pj
    return pairs


# ---------------------------------------------------------------- timing
def chord_times(line, t0, t1):
    """Time of each chord in a sung line, from its column over the words."""
    text = line['text']
    L = max(1, len(text.rstrip()))
    span = max(0.6, (t1 - t0) * 0.92)
    out = []
    for col, name in line['chords']:
        frac = min(1.0, max(0.0, col / L))
        out.append((t0 + frac * span, name))
    return out


def fit_bars(times, bar_guess, span=0.2):
    """Bar length + downbeat phase that put sung-line starts on bar lines (pickups absorbed in the phase)."""
    best = None
    steps = 120
    for k in range(-steps, steps + 1):
        P = bar_guess * (1 + span * k / steps)
        for ph_i in range(60):
            ph = P * ph_i / 60
            d = [min((t - ph) % P, P - (t - ph) % P) for t in times]
            d.sort()
            core = d[: max(3, int(len(d) * 0.8))]  # ignore the worst 20% (late entries, held notes)
            err = sum(x * x for x in core) / len(core)
            if best is None or err < best[0]:
                best = (err, P, ph)
    err, P, ph = best
    ks = [round((t - ph) / P) for t in times]
    n = len(ks)
    mk, mt = sum(ks) / n, sum(times) / n
    var = sum((k - mk) ** 2 for k in ks)
    if var > 0:
        P2 = sum((k - mk) * (t - mt) for k, t in zip(ks, times)) / var
        if 0.97 * P < P2 < 1.03 * P:
            P, ph = P2, mt - P2 * mk
    d = sorted(abs(t - (ph + round((t - ph) / P) * P)) for t in times)
    resid = d[int(len(d) * 0.8) - 1] if len(d) > 4 else d[-1]
    return P, ph, resid


SECTION_TYPES = [(r'pre.?chorus|build', 'prechorus'), (r'chorus|refrain', 'chorus'), (r'verse', 'verse'), (r'bridge|breakdown|middle', 'bridge'),
                 (r'solo|instrumental|interlude|riff|break|post', 'solo'), (r'intro', 'intro'), (r'outro|coda|end', 'outro')]


def section_type(name):
    for pat, t in SECTION_TYPES:
        if re.search(pat, name, re.I):
            return t
    return 'verse'


def build(song, cache, library):
    chart = cache.get('chart')
    lrcd = cache.get('lrc')
    if not chart or not lrcd:
        return None, 'missing sources'
    lrc = parse_lrc(lrcd['synced'])
    rec_len = lrcd['duration']
    entries = expand_repeats(parse_chart(chart['content']))
    available = set(library) | set(song['shapes'])
    shift = (int(chart.get('capo') or 0) - song['capo']) % 12
    hand_set = {c for hs in song['sections'] for b in hs['bars'].split() for c in b.split(',')}

    def chart_pcs(name):
        # Notes of a chart chord after the capo shift (root + quality intervals).
        p = parse_chord(name.split('/')[0])
        if not p:
            return None
        Q = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11], 'sus4': [0, 5, 7],
             'sus2': [0, 2, 7], 'add9': [0, 2, 4, 7], '7sus4': [0, 5, 7, 10], '5': [0, 7], '6': [0, 4, 7, 9]}
        if p[1] not in Q:
            return None
        return ','.join(str(x) for x in sorted({(p[0] + shift + i) % 12 for i in Q[p[1]]}))

    def map_chord(name):
        # Same notes as a chord the arrangement already uses (e.g. Gsus2 = Dsus4): use that name.
        pcs = chart_pcs(name)
        for c in hand_set:
            if pcs and song['pcs'].get(c) == pcs:
                return c
        return to_library(name, shift, available)
    for e in entries:
        if e['kind'] == 'vocal':
            e['chords'] = [(c, map_chord(n)) for c, n in e['chords']]
            e['chords'] = [(c, n) for c, n in e['chords'] if n]
        elif e['kind'] == 'inst':
            e['chords'] = [n for n in (map_chord(x) for x in e['chords']) if n]
    vocal = [e for e in entries if e['kind'] == 'vocal']
    pairs = align(vocal, lrc)
    matched = len(pairs)
    if matched < max(4, 0.4 * len([v for v in vocal if v['chords']])):
        return None, f'only {matched} chart lines matched the timed lyrics'

    # Bar grid from when sung lines start (lines start on or just before a downbeat).
    for idx, e in enumerate(vocal):
        if idx in pairs:
            e['t'] = lrc[pairs[idx]]['t']
    starts = sorted({lrc[j]['t'] for j in pairs.values()})
    if len(starts) < 6:
        return None, 'too few timed lines'
    # Tempo candidates: the arrangement's own bpm and the beat-tracked preview tempo (folded to the same beat unit).
    if cache.get('previewBpm'):
        # Beat-tracked preview tempo is precise; fold it to the arrangement's beat unit and only nudge it.
        pb = cache['previewBpm']
        center = min([pb * m for m in (0.5, 2 / 3, 0.75, 1, 4 / 3, 1.5, 2)], key=lambda x: abs(math.log(x / song['bpm'])))
        P, ph, resid = fit_bars(starts, song['meter'] * 60 / center, 0.015)
    else:
        P, ph, resid = fit_bars(starts, song['meter'] * 60 / song['bpm'], 0.05)
    h = P / 2
    first_bar = math.ceil((0.05 - ph) / P)
    t_start = ph + first_bar * P

    def bar_of(t):
        return int(round((t - t_start) / P))

    def slot(t):
        return int(round((t - t_start) / h))

    end_bar = bar_of(rec_len)
    timed_lines = [e for e in vocal if 't' in e]
    for k, e in enumerate(timed_lines):
        nxt = timed_lines[k + 1]['t'] if k + 1 < len(timed_lines) else e['t'] + 2 * P
        if e['chords']:
            # The first chord sits over the downbeat word, so its estimated time skips any pickup.
            t_first = chord_times({'text': e['text'], 'chords': e['chords'][:1]}, e['t'], min(nxt, e['t'] + 4 * P))[0][0]
            e['bar'] = int(round((t_first - t_start) / P))
        else:
            e['bar'] = int(round((e['t'] + 0.25 * P - t_start) / P))

    # Sections from chart labels; a sung section starts at the bar of its first timed line.
    secs = []
    for e in entries:
        if e['kind'] == 'section':
            secs.append({'name': e['name'], 'bar': None, 'tokens': [], 'sung': False})
        elif secs:
            if e['kind'] == 'vocal':
                secs[-1]['sung'] = True
                secs[-1]['tokens'] += [n for _, n in e['chords']]
                if secs[-1]['bar'] is None and 'bar' in e:
                    secs[-1]['bar'] = e['bar']
            elif e['kind'] == 'inst':
                secs[-1]['tokens'] += e['chords'] * e['repeat']
    if not secs:
        return None, 'chart has no sections'
    if secs[0]['bar'] is None and not secs[0]['sung']:
        secs[0]['bar'] = 0
    hand_bars = [b for hs in song['sections'] for b in hs['bars'].split()]
    cpb = max(1.0, sum(len(b.split(',')) for b in hand_bars) / max(1, len(hand_bars)))
    # Unsung sections between two anchors: give them the tail of the gap, sized by their written chords.
    for i, sc in enumerate(secs):
        if sc['bar'] is not None:
            continue
        prev = next((x for x in reversed(secs[:i]) if x['bar'] is not None), None)
        nxt_i = next((k for k in range(i + 1, len(secs)) if secs[k]['bar'] is not None), None)
        nxt_bar = secs[nxt_i]['bar'] if nxt_i is not None else end_bar
        unsung = [secs[k] for k in range(i, nxt_i if nxt_i is not None else len(secs)) if secs[k]['bar'] is None]
        need = sum(max(2, math.ceil(len(x['tokens']) / cpb)) for x in unsung)
        start = max((prev['bar'] if prev else 0) + 2, nxt_bar - need)
        for x in unsung:
            x['bar'] = start
            start += max(2, math.ceil(len(x['tokens']) / cpb))
    secs = [x for x in secs if x['bar'] is not None and x['bar'] < end_bar]
    secs.sort(key=lambda x: x['bar'])
    clean = []
    for x in secs:
        if clean and x['bar'] <= clean[-1]['bar']:
            if x['sung'] or not clean[-1]['sung']:
                clean[-1] = x
            continue
        clean.append(x)
    secs = clean
    secs[0]['bar'] = 0

    # Verified chord loops from the hand-built arrangement, by section type.
    loops = {}
    for hs in song['sections']:
        t = hs.get('type', 'verse')
        if hs.get('pattern') == 'end':
            continue
        loops.setdefault(t, (hs['bars'].split(), hs.get('pattern', 'main')))
    any_loop = loops.get('verse') or next(iter(loops.values()))

    def fill(loop, n):
        out = []
        while len(out) + len(loop) <= n:
            out += loop
        r = n - len(out)
        if r and (r > 2 or not out):
            out += loop[:r]
        elif r:
            out += [out[-1].split(',')[-1]] * r  # a bar or two of hold before the next part
        return out

    def loop_for(x):
        typ = section_type(x['name'])
        by_type = loops.get(typ) or (loops.get('chorus') if typ == 'prechorus' else None) or (
            loops.get('solo') or loops.get('verse') if typ in ('intro', 'outro', 'bridge', 'solo') else None) or any_loop
        tk = set(x['tokens'])
        if not tk:
            return by_type
        # The hand-built loop whose chords best match what the chart writes for this part.
        def score(lp):
            ch = {c for b in lp[0] for c in b.split(',')}
            return len(tk & ch) / len(tk | ch)
        chords_of = lambda lp: {c for b in lp[0] for c in b.split(',')}
        if typ in loops and score(by_type) >= 0.6:
            return by_type
        covering = [lp for lp in loops.values() if tk <= chords_of(lp)]
        if by_type in covering:
            return by_type
        if covering:
            return max(covering, key=score)
        best = max(loops.values(), key=lambda lp: (score(lp), lp is by_type))
        return best if score(best) > score(by_type) else by_type

    est = [x['bar'] for x in secs] + [end_bar]
    snapped = [0]
    for i, x in enumerate(secs):
        loop = loop_for(x)[0]
        q = len(loop) // 2 if len(loop) >= 8 else len(loop)
        q = max(1, q)
        target = est[i + 1]
        if i == len(secs) - 1:
            # The record usually fades; end on a whole loop at or just before the fade.
            q = max(1, len(loop))
            n = max(q, int(round((target - snapped[-1]) / q)) * q)
        else:
            cands = [k * q for k in range(1, 64)]
            n = min(cands, key=lambda c: abs(snapped[-1] + c - target))
            if abs(snapped[-1] + n - target) > 2:  # loop doesn't fit this gap; trust the timing
                n = max(1, target - snapped[-1])
        snapped.append(snapped[-1] + n)
    for i, x in enumerate(secs):
        x['bar'] = snapped[i]
    end_bar = snapped[-1]

    sections = []
    for i, x in enumerate(secs):
        n = (secs[i + 1]['bar'] if i + 1 < len(secs) else end_bar) - x['bar']
        if n <= 0:
            continue
        typ = section_type(x['name'])
        loop, pat = loop_for(x)
        hand_chords = {c for b in loop for c in b.split(',')}
        chart_chords = set(x['tokens'])
        if not x['sung'] and x['tokens'] and len(chart_chords & hand_chords) / len(chart_chords | hand_chords) < 0.6:
            # Instrumental with its own changes (not the song loop): play the chart's chords, cpb per bar.
            per = max(1, int(round(cpb)))
            tk = x['tokens']
            bars_tk = [','.join(tk[k:k + per]) if len(set(tk[k:k + per])) > 1 else tk[k] for k in range(0, len(tk), per)]
            loop = bars_tk
        elif x['tokens'] and len(set(x['tokens']) & hand_chords) / len(set(x['tokens']) | hand_chords) < 0.5:
            # No hand-built loop for this part: spread the chart's chords over its bars.
            tk = x['tokens']
            loop = [tk[min(len(tk) - 1, int(k * len(tk) / n))] for k in range(n)]
        if pat not in song['patterns'] or pat == 'end':
            pat = any_loop[1]
        name = re.sub(r'\s+', ' ', x['name']).strip().title()
        sections.append({'name': name, 'type': typ, 'pattern': pat, 'bars': ' '.join(fill(loop, n))})
    hand_end = [hs for hs in song['sections'] if hs.get('pattern') == 'end' or hs.get('name') == 'End']
    last_chord = hand_end[-1]['bars'].split()[-1] if hand_end else sections[-1]['bars'].split()[-1].split(',')[-1]
    default_pat = any_loop[1]
    slots = [0] * (2 * end_bar)
    sec_starts = secs
    end_pat = 'end' if 'end' in song['patterns'] else default_pat
    sections.append({'name': 'End', 'type': 'outro', 'pattern': end_pat, 'bars': last_chord, 'band': 'hit'})

    bpm = round(song['meter'] * 60 / P, 1)
    # Lyrics on the song's beat clock, with chords over the words.
    beat = lambda t: (t - t_start) / (P / song['meter'])
    lyric_lines = []
    inv = {j: i for i, j in pairs.items()}
    for j, ln in enumerate(lrc):
        item = {'beat': round(beat(ln['t']), 3), 'text': ln['text']}
        if j in inv and vocal[inv[j]]['chords']:
            ch = vocal[inv[j]]
            item['chart'] = ch['text']
            item['chords'] = [[c, n] for c, n in ch['chords']]
        if j in inv:
            item['bar'] = vocal[inv[j]].get('bar')
        lyric_lines.append(item)

    report = {
        'matched': f'{matched}/{len(vocal)}', 'resid_ms': round(resid * 1000), 'bar_ms': round(P * 1000), 'bpm': bpm, 'bar_s': round(P, 2),
        'start_s': round(t_start, 2), 'bars': len(slots) // 2, 'rec_s': round(rec_len), 'sections': len(sections),
    }
    return {'bpm': bpm, 'sections': sections, 'lyrics': {'source': 'LRCLIB + Ultimate Guitar', 'startSeconds': round(t_start, 3),
                                                        'lines': lyric_lines}, 'report': report}, None


def js_sections(sections):
    out = '  sections: [\n'
    for s in sections:
        out += (f"    {{ name: {json.dumps(s['name'])}, type: '{s['type']}', pattern: '{s['pattern']}', bars: '{s['bars']}'"
                + (f", band: '{s['band']}'" if s.get('band') else '') + ' },\n')
    return out + '  ],'


def replace_block(src, key, new):
    i = src.index(f'  {key}: [')
    depth, j = 0, i + len(f'  {key}: ')
    for k in range(j, len(src)):
        if src[k] == '[':
            depth += 1
        elif src[k] == ']':
            depth -= 1
            if depth == 0:
                end = k + 1 + (1 if src[k + 1] == ',' else 0)
                return src[:i] + new + src[end:]
    raise ValueError(key)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    meta = load_song_meta()
    os.makedirs(LYR, exist_ok=True)
    for song in meta['songs']:
        if args and song['id'] not in args:
            continue
        p = os.path.join(CACHE, song['id'] + '.json')
        if not os.path.exists(p):
            continue
        res, err = build(song, json.load(open(p)), meta['chords'])
        if err:
            print(f"{song['id']:22} skipped: {err}")
            continue
        r = res['report']
        print(f"{song['id']:22} matched {r['matched']:>6}  fit ±{r['resid_ms']:>3}/{r['bar_ms']}ms  bpm {r['bpm']:>6}  bars {r['bars']:>3}  "
              f"start {r['start_s']:>5}s  rec {r['rec_s']}s  sections {r['sections']}")
        if '--show' in sys.argv:
            for sec in res['sections']:
                print(f"     {sec['name'][:18]:18} {sec['bars']}")
        if write:
            f = os.path.join(ROOT, 'js', 'songs', song['id'] + '.js')
            src = open(f).read()
            src = re.sub(r'\n  bpm: [\d.]+,', f"\n  bpm: {res['bpm']},", src, count=1)
            src = replace_block(src, 'sections', js_sections(res['sections']))
            open(f, 'w').write(src)
            with open(os.path.join(LYR, song['id'] + '.js'), 'w') as out:
                out.write('// Personal-use lyrics cache built by tools/build-arrangements.py. Not committed.\n')
                out.write(f"(window.GS = window.GS || {{}}).lyrics = window.GS.lyrics || {{}};\nGS.lyrics[{json.dumps(song['id'])}] = ")
                out.write(json.dumps(res['lyrics'], ensure_ascii=False) + ';\n')


if __name__ == '__main__':
    main()
