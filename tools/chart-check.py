#!/usr/bin/env python3
# usage: python3 tools/chart-check.py "song artist" ...   (prints section labels + chord symbols only; lyrics are discarded)
# Fetches the top-rated Ultimate Guitar chord chart for a song and prints ONLY section labels + chord symbols (lyrics discarded in code).
import sys, re, json, html, urllib.request, urllib.parse
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read().decode('utf-8', 'ignore')
def store(page):
    m = re.search(r'class="js-store" data-content="([^"]+)"', page)
    return json.loads(html.unescape(m.group(1))) if m else None
def search(q):
    s = store(get('https://www.ultimate-guitar.com/search.php?search_type=title&value=' + urllib.parse.quote(q)))
    res = s['store']['page']['data'].get('results', [])
    res = [r for r in res if r.get('type') == 'Chords']
    res.sort(key=lambda r: (r.get('votes') or 0), reverse=True)
    return res[:3]
def chords_only(url):
    s = store(get(url))
    d = s['store']['page']['data']
    tab = d['tab_view']['wiki_tab']['content']
    meta = d['tab_view'].get('meta', {})
    capo = meta.get('capo'); tonality = d['tab'].get('tonality_name')
    out = []
    for line in tab.replace('\r', '').split('\n'):
        sec = re.match(r'\s*\[(?!ch\]|/ch\]|tab\]|/tab\])([^\]]{1,30})\]\s*$', line)
        if sec:
            out.append('\n[' + sec.group(1).strip() + ']'); continue
        chs = re.findall(r'\[ch\]([^\[]+)\[/ch\]', line)
        if chs: out.append(' '.join(chs))
    return capo, tonality, ' | '.join(out).replace(' | \n', '\n').strip()
for q in sys.argv[1:]:
    try:
        rs = search(q)
        if not rs: print(f'# {q}: no chords result'); continue
        r = rs[0]
        capo, ton, body = chords_only(r['tab_url'])
        print(f"# {q} :: {r.get('song_name')} by {r.get('artist_name')} | votes {r.get('votes')} rating {round(r.get('rating') or 0, 2)} | capo {capo} | key {ton}")
        print(body[:1800]); print()
    except Exception as e:
        print(f'# {q}: error {e}')
