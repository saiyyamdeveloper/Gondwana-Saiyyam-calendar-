#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""दैनिक-चयन — रोज़ एक स्रोतित/स्वीकृत प्रविष्टि 'आज का चयन' के रूप में प्रकाशित।
रोटेशन नियतात्मक (pointer review/daily_state.json) ⇒ कोई दोहराव नहीं जब तक पूरा पूल न घूमे।
पूल: महापुरुष-DB + स्थल-DB + पर्व-DB + क्षेत्र-कोश की स्वीकृत इकाइयाँ — सब पहले से स्रोतित।"""
import json, os, sys, datetime

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(APP, 'daily_digest.json')
STATE = os.path.join(APP, 'review', 'daily_state.json')

def load(p, d):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d

def ist_today():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')

def pool():
    items = []
    H = load(os.path.join(APP, 'mahapurush_database.json'), {}).get('persons', [])
    for p in H:
        items.append({'kind': 'person', 'id': 'p:' + str(p.get('id')), 'title_hi': p.get('name_hi'),
                      'summary_hi': (p.get('first_achievement') or '')[:300],
                      'region': ' · '.join(filter(None, [p.get('state'), p.get('district')])),
                      'sources': list(p.get('sources') or [])[:3]})
    P = load(os.path.join(APP, 'gondwana_places.json'), {}).get('places', [])
    for p in P:
        items.append({'kind': 'place', 'id': 'l:' + str(p.get('id')), 'title_hi': p.get('name_hi'),
                      'summary_hi': (p.get('significance') or '')[:300],
                      'region': ' · '.join(filter(None, [p.get('state'), p.get('district')])),
                      'sources': list(p.get('sources') or [])[:3]})
    X = load(os.path.join(APP, 'extra_data.json'), {})
    for f in X.get('festivals', []):
        items.append({'kind': 'festival', 'id': 'f:' + str(f.get('id')),
                      'title_hi': f.get('deva') or f.get('name_hi') or f.get('name'),
                      'summary_hi': ((f.get('story') or '') + ' ' + (f.get('ritual') or '')).strip()[:300],
                      'region': f.get('region') or 'गोंडवाना',
                      'sources': list(f.get('sources') or ['गोंडवाना कैलेंडर पर्व-कोश (AGPE 2025/समुदाय)'])[:3]})
    for pin in X.get('map_pins', []):
        items.append({'kind': 'place', 'id': 'm:' + str(pin.get('id')),
                      'title_hi': pin.get('deva') or pin.get('name'),
                      'summary_hi': (pin.get('history') or '')[:300],
                      'region': (pin.get('zone') or '') + ' गोंडवाना',
                      'sources': [pin.get('source')] if pin.get('source') else []})
    R = load(os.path.join(APP, 'gondwana_regions.json'), {}).get('units', [])
    for u in R:
        path = []
        x = u
        by = {y['id']: y for y in R}
        g = 0
        while x and g < 8:
            path.insert(0, x['name_hi']); x = by.get(x.get('parent')); g += 1
        for e in u.get('entities', []):
            if e.get('verify') or not e.get('sources'): continue  # केवल स्रोतित/स्वीकृत
            items.append({'kind': e['kind'], 'id': 'r:' + u['id'] + ':' + e['name_hi'],
                          'title_hi': e['name_hi'], 'summary_hi': (e.get('desc_hi') or '')[:300],
                          'region': ' · '.join(path), 'sources': list(e['sources'])[:3]})
    items = [i for i in items if i['title_hi'] and (i['summary_hi'] or i['sources'])]
    items.sort(key=lambda i: i['id'])
    return items

def main():
    items = pool()
    if not items:
        print('[daily] पूल खाली'); return 1
    st = load(STATE, {'idx': -1})
    idx = (int(st.get('idx', -1)) + 1) % len(items)
    st['idx'] = idx
    st['pool_size'] = len(items)
    st['updated'] = ist_today()
    pick = items[idx]
    dig = load(OUT, {'meta': {'title': 'आज का चयन — दैनिक एक स्रोतित प्रविष्टि'}, 'history': []})
    dig['today'] = dict(pick); dig['today']['date_ist'] = ist_today()
    dig['meta']['updated'] = ist_today()
    dig['meta']['pool_size'] = len(items)
    dig['history'] = ([dig['today']] + dig.get('history', []))[:8]
    with open(STATE, 'w', encoding='utf-8') as f: json.dump(st, f, ensure_ascii=False, indent=1)
    with open(OUT, 'w', encoding='utf-8') as f: json.dump(dig, f, ensure_ascii=False, indent=1)
    print(f"[daily] {ist_today()} → {pick['kind']}: {pick['title_hi']} (पूल {len(items)}, idx {idx})")
    return 0

if __name__ == '__main__':
    sys.exit(main())
