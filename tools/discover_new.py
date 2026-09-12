#!/usr/bin/env python3
"""नया-डेटा खोजक (discover_new.py) — बिना API key
विकिडेटा SPARQL: जिन मानवों की जनजाति (P172) भारत की प्रमुख आदिवासी समूहों में है
और जो हमारे डेटाबेस/कतार में अभी नहीं — उन्हें स्रोत-सहित नई candidate प्रविष्टि बनाता है।
डुप्लिकेट-रोक: नाम-सामान्यीकरण + review/discovered_seen.json (Q-id)।
नीति अटूट: नई प्रविष्टि केवल 'pending' — प्रकाशन हेतु सत्यापन (स्वतः या एडमिन) आवश्यक।"""
import json, os, re, sys, datetime, urllib.request, urllib.parse

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE_F = os.path.join(APP, 'review', 'pending.json')
SEEN_F = os.path.join(APP, 'review', 'discovered_seen.json')
UA = {'User-Agent': 'GondwanaCalendarBot/1.0 (new-candidate discovery; contact: saiyyamdeveloper@users.noreply.github.com)'}
CAP = 12
TRIBES = '"Gond people"@en "Gonds"@en "Santal"@en "Oraon people"@en "Kharia people"@en "Bhumij"@en "Ho people"@en "Savara"@en "Gadaba"@en "Juang"@en "Kond people"@en "Naga people"@en "Ao people"@en "Kuki people"@en "Angami"@en "Dhodia"@en "Varli"@en "Santhal people"@en "Bhil people"@en "Munda people"@en "Oraon"@en "Baiga"@en "Korku people"@en "Saharia"@en "Kol people"@en "Bodo people"@en "Garo people"@en "Khasi people"@en "Mizo people"@en "Warli"@en "Bhilala"@en "Pardhi"@en "Khond"@en "Maria people"@en'

QUERY = """
SELECT ?p ?nameHi ?nameEn ?birth ?death ?tribeLabel ?hiwiki ?enwiki WHERE {
  VALUES ?tl { %s }
  ?tribe rdfs:label ?tl .
  ?p wdt:P31 wd:Q5 ; wdt:P172 ?tribe .
  FILTER(EXISTS { ?p wdt:P27 wd:Q668 } || EXISTS { ?p wdt:P19 ?bpl . ?bpl wdt:P17 wd:Q668 })
  ?tribe rdfs:label ?tribeLabel FILTER(LANG(?tribeLabel)="en")
  OPTIONAL { ?p rdfs:label ?nameHi FILTER(LANG(?nameHi)="hi") }
  OPTIONAL { ?p rdfs:label ?nameEn FILTER(LANG(?nameEn)="en") }
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p wdt:P570 ?death }
  OPTIONAL { ?hiwiki schema:about ?p ; schema:inLanguage "hi" }
  OPTIONAL { ?enwiki schema:about ?p ; schema:inLanguage "en" }
} LIMIT 200
""" % TRIBES

def norm(s): return re.sub(r'\s+', '', str(s or '').lower())

def main():
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': QUERY, 'format': 'json'})
    req = urllib.request.Request(url, headers=dict(UA, Accept='application/sparql-results+json'))
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = json.load(r)['results']['bindings']
    except Exception as e:
        print('discover: SPARQL विफल —', e); return 0
    queue = json.load(open(QUEUE_F, encoding='utf-8'))
    seen = json.load(open(SEEN_F, encoding='utf-8')) if os.path.exists(SEEN_F) else {'qids': [], 'names': []}
    known_names = {norm(x) for x in seen['names']}
    for q in queue['queue']:
        p = q.get('payload', {}) or {}
        known_names.add(norm(p.get('name_hi'))); known_names.add(norm(p.get('name_en')))
        known_names.add(norm(q.get('title')))
    today = datetime.date.today().isoformat()
    added = 0
    for row in rows:
        if added >= CAP: break
        qid = row['p']['value'].rsplit('/', 1)[-1]
        if qid in seen['qids']: continue
        nhi = row.get('nameHi', {}).get('value'); nen = row.get('nameEn', {}).get('value')
        title = nhi or nen
        if not title or norm(title) in known_names: continue
        tribe = row.get('tribeLabel', {}).get('value', '')
        srcs = []
        if row.get('hiwiki'): srcs.append(row['hiwiki']['value'])
        if row.get('enwiki'): srcs.append(row['enwiki']['value'])
        srcs.append('https://www.wikidata.org/wiki/' + qid)
        by = lambda k: (row[k]['value'][:4] if k in row and re.match(r'\d{4}', row[k]['value']) else None)
        queue['queue'].append({
            'id': f'person:wd-{qid}', 'kind': 'person', 'subtype': 'auto-discovered',
            'title': title, 'subtitle': tribe + ' · विकिडेटा से स्वतः खोज',
            'reason': 'विकिडेटा जनजाति-माइनिंग (P172) से नई खोज — प्रकाशन पूर्व सत्यापन आवश्यक',
            'source_file': 'mahapurush_database.json', 'record_id': 'wd-' + qid,
            'payload': {'id': 'wd-' + qid, 'name_hi': nhi or title, 'name_en': nen,
                        'birth': by('birth'), 'death': by('death'), 'tribe_hi': tribe,
                        'category': 'auto-discovered', 'sources': srcs, 'verify': True,
                        'verify_note': 'स्वतः-खोज: विकिडेटा P172=' + tribe},
            'status': 'pending', 'added': today, 'added_by': 'automation:discover',
            'isNew': True, 'decision': None, 'decided_by': None, 'decided_at': None, 'note': ''})
        seen['qids'].append(qid); seen['names'].append(norm(title))
        known_names.add(norm(title))
        added += 1
        print('  + नई खोज:', title, f'({tribe})')
    if added:
        json.dump(queue, open(QUEUE_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(seen, open(SEEN_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'discover: {added} नई प्रविष्टियाँ (SPARQL पंक्तियाँ: {len(rows)})')
    return 0

if __name__ == '__main__':
    sys.exit(main())
