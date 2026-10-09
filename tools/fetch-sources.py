#!/usr/bin/env python3
"""Download per-song sources into data/.cache (gitignored): recording length (iTunes),
time-synced lyrics (LRCLIB) and the top-voted chord chart (Ultimate Guitar).
Prints counts only.  usage: python3 tools/fetch-sources.py [song-id ...]"""
import json, os, re, sys, html, subprocess, urllib.request, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', '.cache')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}

def get(url, headers=UA):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25).read().decode('utf-8', 'ignore')

def songs():
    js = "global.window=global;const fs=require('fs');require('./js/theory.js');for(const f of fs.readdirSync('js/songs'))require('./js/songs/'+f);" \
         "console.log(JSON.stringify(GS.songs.map(s=>({id:s.id,title:s.title,artist:s.artist,also:s.also||null,tags:s.tags||[]}))))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def itunes(title, artist):
    q = urllib.parse.urlencode({'term': f'{title} {artist}', 'entity': 'song', 'limit': 15})
    res = json.loads(get('https://itunes.apple.com/search?' + q))['results']
    t0 = norm(re.sub(r'\(.*?\)', '', title))
    good = [r for r in res if norm(artist)[:6] in norm(r.get('artistName', '')) and t0[:8] in norm(r.get('trackName', ''))]
    good = [r for r in good if not re.search(r'live|remix|karaoke|instrumental|acoustic|version|edit', r.get('trackName', '') + ' ' + r.get('collectionName', ''), re.I)] or good
    if not good: return None
    # Earliest release is usually the original studio recording.
    good.sort(key=lambda r: r.get('releaseDate', '9999'))
    return {'seconds': round(good[0]['trackTimeMillis'] / 1000, 1), 'track': good[0]['trackName'], 'album': good[0]['collectionName']}

def lrclib(title, artist, seconds):
    res = json.loads(get('https://lrclib.net/api/search?' + urllib.parse.urlencode({'track_name': title, 'artist_name': artist}),
                         {'User-Agent': 'Strumline/1.0 (personal guitar practice)'}))
    res = [r for r in res if r.get('syncedLyrics') and r.get('duration')]
    if not res: return None
    res.sort(key=lambda r: abs(r['duration'] - seconds) if seconds else 0)
    return res[0]

def ug(title, artist):
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('cc', os.path.join(ROOT, 'tools', 'chart-check.py'))
    cc = importlib.util.module_from_spec(spec); sys.argv, saved = ['x'], sys.argv; spec.loader.exec_module(cc); sys.argv = saved
    r = cc.search(f'{title} {artist}')
    if not r: return None
    st = cc.store(cc.get(r[0]['tab_url']))['store']['page']['data']
    return {'url': r[0]['tab_url'], 'votes': r[0].get('votes'), 'capo': st['tab_view'].get('meta', {}).get('capo'),
            'content': st['tab_view']['wiki_tab']['content']}

def main():
    want = set(sys.argv[1:])
    for s in songs():
        if want and s['id'] not in want: continue
        out = os.path.join(CACHE, s['id'] + '.json')
        rec = None
        try:
            rec = itunes(s['title'], s['artist']) if s['artist'] not in ('Traditional',) else None
        except Exception as e:
            print(s['id'], 'itunes error', e)
        try:
            lr = lrclib(s['title'], s['artist'], rec and rec['seconds'])
        except Exception as e:
            lr = None; print(s['id'], 'lrclib error', e)
        try:
            chart = ug(s['title'], s['artist'])
        except Exception as e:
            chart = None; print(s['id'], 'ug error', e)
        json.dump({'recording': rec, 'lrc': lr and {'duration': lr['duration'], 'album': lr.get('albumName'), 'synced': lr['syncedLyrics']},
                   'chart': chart}, open(out, 'w'))
        dl = f"{lr['duration']:.0f}s" if lr else '-'
        print(f"{s['id']:22} rec {rec['seconds'] if rec else '-':>6}  lrc {dl:>5} {'lines ' + str(lr['syncedLyrics'].count(chr(10)) + 1) if lr else ''}  chart {('votes ' + str(chart['votes'])) if chart else '-'}")

if __name__ == '__main__':
    main()
