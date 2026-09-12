#!/usr/bin/env python3
"""स्व-सत्यापन इंजन — परत 1 (बिना API key) + हाइब्रिड स्वतः-स्वीकृति नीति
हर कतार-प्रविष्टि पर गहरी cross-जाँच:
  · विकिपीडिया HI + EN (अस्तित्व, नाम-रूपांतर, सारांश)
  · विकिडेटा (जन्म/मृत्यु-वर्ष, निर्देशांक — अंक-दर-अंक तुलना)
  · स्रोत-URL: ज़िंदा? शीर्षक में नाम-टोकन?
  · आंतरिक: sources[], category, gps_precision
नतीजा: review/evidence/<id>.json + index.json (स्कोर 0-100, verdict, फ़ील्ड-तालिका, हिंदी सारांश)
हाइब्रिड नीति (उपयोगकर्ता-अनुमोदित): score>=90 AND >=2 स्वतंत्र डोमेन AND शून्य विरोध
  AND kind in (person, place, festival) → status=approved (audit-log सहित); प्रकाशन-क्लिक फिर भी मैन्युअल।
Usage: python3 tools/auto_verify.py [--limit N] [--digest]"""
import json, os, re, sys, math, datetime, urllib.request, urllib.parse, smtplib, ssl
from email.mime.text import MIMEText

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE_F = os.path.join(APP, 'review', 'pending.json')
DEC_F = os.path.join(APP, 'review', 'decisions.json')
EV_DIR = os.path.join(APP, 'review', 'evidence')
UA = {'User-Agent': 'GondwanaCalendarBot/1.0 (tribal-encyclopedia verification; contact: saiyyamdeveloper@users.noreply.github.com)'}
YEAR = re.compile(r'(1[5-9]\d{2}|20\d{2})')

def get(url, as_json=True):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            txt = r.read().decode('utf-8', 'replace')
            return json.loads(txt) if as_json else txt
    except Exception:
        return None

def wiki_search(lang, q):
    d = get(f'https://{lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(q)}&srlimit=3&format=json')
    hits = (d or {}).get('query', {}).get('search', [])
    return hits[0]['title'] if hits else None

def wiki_summary(lang, title):
    d = get(f'https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}')
    return (d or {}).get('extract', '') or ''

def wd_search(q):
    d = get('https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=' + urllib.parse.quote(q) + '&srlimit=3&format=json')
    hits = (d or {}).get('query', {}).get('search', [])
    return hits[0]['title'] if hits else None

def wd_entity(qid):
    d = get(f'https://www.wikidata.org/w/api.php?action=wbgetentities&ids={qid}&props=claims&format=json')
    ent = ((d or {}).get('entities', {}) or {}).get(qid, {}).get('claims', {})
    out = {}
    for key, pid in (('birth', 'P569'), ('death', 'P570')):
        cs = ent.get(pid) or []
        if cs:
            v = cs[0].get('mainsnak', {}).get('datavalue', {}).get('value', {})
            t = v.get('time', '')
            m = YEAR.search(t)
            if m: out[key] = int(m.group(1))
            if v.get('precision') == 11 and re.match(r'\+\d{4}-\d{2}-\d{2}', t):
                out[key + '_date'] = t[1:11]
    cs = ent.get('P625') or []
    if cs:
        v = cs[0].get('mainsnak', {}).get('datavalue', {}).get('value', {})
        if 'latitude' in v: out['lat'] = v['latitude']; out['lon'] = v['longitude']
    return out

def url_alive(u):
    try:
        req = urllib.request.Request(u, headers=dict(UA, Accept='text/html,*/*'))
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read(200000).decode('utf-8', 'replace')
            m = re.search(r'<title[^>]*>(.*?)</title>', body, re.S | re.I)
            return r.status < 400, (m.group(1).strip() if m else '')
    except Exception:
        return False, ''

def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))

def yr(s):
    m = YEAR.search(str(s or ''))
    return int(m.group(1)) if m else None

def dom(u):
    try: return urllib.parse.urlparse(u).netloc.lower().replace('www.', '')
    except Exception: return ''

class Ev:
    def __init__(self, item):
        self.item = item; self.checks = []; self.conflicts = []; self.domains = set(); self.score = 0
    def add(self, name, ok, pts, detail='', link=''):
        self.checks.append({'name': name, 'ok': bool(ok), 'pts': pts, 'detail': detail, 'link': link})
        if ok: self.score += pts
    def conflict(self, field, ours, theirs, src):
        self.conflicts.append({'field': field, 'ours': ours, 'theirs': theirs, 'source': src})
        self.score -= 30

def name_tokens(t):
    return [w for w in re.split(r'\s+', str(t or '')) if len(w) > 3][:4]

def verify(item):
    ev = Ev(item); p = item.get('payload', {}) or {}
    kind = item['kind']
    nm = p.get('name_hi') or p.get('deva') or item.get('title', '')
    nm_en = p.get('name_en') or ''
    # विकिपीडिया HI/EN
    for lang, pts in (('hi', 20), ('en', 20)):
        q = nm if lang == 'hi' else (nm_en or nm)
        t = wiki_search(lang, q) if q else None
        if t:
            summ = wiki_summary(lang, t)
            hit = any(tok.lower() in summ.lower() for tok in name_tokens(nm_en or nm)) or lang == 'hi'
            ev.add(f'wiki-{lang}', True, pts, f'पृष्ठ मिला: {t}' + ('; सारांश में नाम-टोकन ✓' if hit else ''), f'https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(t)}')
            ev.domains.add(f'{lang}.wikipedia.org')
        else:
            ev.add(f'wiki-{lang}', False, 0, 'कोई पृष्ठ नहीं मिला')
    # विकिडेटा
    qid = wd_search(nm_en or nm) if (nm_en or nm) else None
    wd = wd_entity(qid) if qid else {}
    if qid:
        ev.add('wikidata', True, 15, f'आइटम {qid}', f'https://www.wikidata.org/wiki/{qid}')
        ev.domains.add('wikidata.org')
        for fld, ours in (('birth', yr(p.get('birth'))), ('death', yr(p.get('death')))):
            theirs = wd.get(fld)
            if ours and theirs:
                if abs(ours - theirs) <= 1: ev.add(f'wd-{fld}-match', True, 13, f'हमारा {ours} ↔ विकिडेटा {theirs}')
                else: ev.conflict(fld, ours, theirs, 'wikidata')
        if kind == 'place' and p.get('lat') and 'lat' in wd:
            d = km(float(p['lat']), float(p['lon']), wd['lat'], wd['lon'])
            if d <= 50: ev.add('wd-gps', True, 30 if kind == 'place' else 10, f'निर्देशांक-दूरी {d:.1f} किमी (सीमा 50)')
            else: ev.conflict('gps', f"{p['lat']},{p['lon']}", f"{wd['lat']},{wd['lon']}", 'wikidata')
    else:
        ev.add('wikidata', False, 0, 'विकिडेटा आइटम नहीं मिला')
    # स्रोत-URL
    for u in (p.get('sources') or [])[:2]:
        alive, title = url_alive(u)
        tok_hit = any(tok.lower() in title.lower() for tok in name_tokens(nm_en or nm))
        ev.add('source-url', alive, 10 + (5 if (alive and tok_hit) else 0),
               ('ज़िंदा' + ('; शीर्षक में नाम ✓' if tok_hit else '')) if alive else 'मृत/अगम्य', u)
        if alive: ev.domains.add(dom(u))
    for fld, hi in (('birth_date', 'जन्म-तिथि'), ('death_date', 'मृत्यु-तिथि')):
        if wd.get(fld):
            ev.add('wd-' + fld, True, 0, f'{hi} (विकिडेटा, दिन-सटीक): {wd[fld]}')
    ev.dates = {'birth': wd.get('birth_date'), 'death': wd.get('death_date'), 'source': ('wikidata:' + qid) if qid else None}
    # आंतरिक
    ev.add('internal-sources', bool(p.get('sources')), 5, 'sources[] भरा है' if p.get('sources') else 'sources[] खाली')
    ev.add('internal-category', bool(p.get('category') or p.get('type')), 5, 'श्रेणी लेबल मौजूद' if p.get('category') or p.get('type') else 'श्रेणी नहीं')
    if kind == 'place' and p.get('gps_precision'):
        ev.add('internal-gps-label', True, 5, f"gps_precision={p['gps_precision']}")
    ev.score = max(0, min(100, ev.score))
    n = len(ev.domains)
    if ev.conflicts: verdict = 'conflict'
    elif ev.score >= 90 and n >= 2: verdict = 'pass'
    elif ev.score >= 50: verdict = 'partial'
    elif n: verdict = 'weak'
    else: verdict = 'nosource'
    return ev, verdict

VERDICT_HI = {'pass': '🟢 स्वतः-सत्यापित', 'partial': '🟡 आंशिक सबूत', 'conflict': '🔴 विरोध मिला', 'weak': '🟠 कमज़ोर सबूत', 'nosource': '⚪ स्वतंत्र स्रोत नहीं'}

def summary_hi(item, ev, verdict):
    p = item.get('payload', {}) or {}
    bits = [f"{item['title']}: स्कोर {ev.score}/100 ({VERDICT_HI[verdict]})।"]
    ok = [c['name'] for c in ev.checks if c['ok']]
    bits.append('मिले सबूत: ' + (', '.join(ok) if ok else 'कोई नहीं') + '।')
    if ev.conflicts:
        bits.append('विरोध: ' + '; '.join(f"{c['field']} हमारा={c['ours']} बनाम {c['source']}={c['theirs']}" for c in ev.conflicts) + ' — मानव-निर्णय आवश्यक।')
    if verdict == 'nosource':
        bits.append('विकिपीडिया/विकिडेटा पर प्रलेखन नहीं मिला — यह असत्य का प्रमाण नहीं (कई आदिवासी नायक ऑनलाइन अनुपलब्ध); आपकी जाँच निर्णायक।')
    if verdict == 'pass':
        bits.append(f"{len(ev.domains)} स्वतंत्र डोमेन सहमत — हाइब्रिड नीति लागू।")
    return ' '.join(bits)

def main():
    args = sys.argv[1:]
    if '--digest' in args: return digest()
    if '--dates' in args: return enrich_dates()
    limit = 40
    if '--limit' in args: limit = int(args[args.index('--limit') + 1])
    os.makedirs(EV_DIR, exist_ok=True)
    queue = json.load(open(QUEUE_F, encoding='utf-8'))['queue']
    dec = json.load(open(DEC_F, encoding='utf-8'))
    index = {}
    if os.path.exists(os.path.join(EV_DIR, 'index.json')):
        index = json.load(open(os.path.join(EV_DIR, 'index.json'), encoding='utf-8'))
    pending = [q for q in queue if q['status'] == 'pending'][:limit]
    counts = {}
    for item in pending:
        ev, verdict = verify(item)
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', item['id'])
        rec = {'id': item['id'], 'dates': getattr(ev, 'dates', None), 'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'score': ev.score, 'verdict': verdict, 'checks': ev.checks, 'conflicts': ev.conflicts,
               'sources_domains': sorted(ev.domains), 'summary_hi': summary_hi(item, ev, verdict), 'llm': None}
        old = os.path.join(EV_DIR, safe + '.json')
        if os.path.exists(old):
            try: rec['llm'] = json.load(open(old, encoding='utf-8')).get('llm')
            except Exception: pass
        json.dump(rec, open(old, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        index[item['id']] = {k: rec[k] for k in ('score', 'verdict', 'checked_at', 'summary_hi')}
        index[item['id']]['n_sources'] = len(ev.domains)
        counts[verdict] = counts.get(verdict, 0) + 1
        # हाइब्रिड स्वतः-स्वीकृति
        if verdict == 'pass' and item['kind'] in ('person', 'place', 'festival'):
            item['status'] = 'approved'
            item['decided_by'] = 'automation:auto-verify (hybrid policy)'
            item['decided_at'] = rec['checked_at']
            item['note'] = f"स्वतः-स्वीकृत: स्कोर {ev.score}, स्रोत-डोमेन {len(ev.domains)}, शून्य विरोध"
            dec['decisions'].append({'id': item['id'], 'kind': item['kind'], 'title': item['title'],
                                     'decision': 'approved', 'note': item['note'], 'by': item['decided_by'], 'at': item['decided_at']})
            counts['auto-approved'] = counts.get('auto-approved', 0) + 1
        print(f"  {rec['score']:3} {verdict:9} {item['id']}")
    json.dump(index, open(os.path.join(EV_DIR, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'meta': {'title': 'गोंडवाना समीक्षा-कतार', 'updated': datetime.datetime.now(datetime.timezone.utc).isoformat()}, 'queue': queue},
              open(QUEUE_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(dec, open(DEC_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('auto-verify:', counts or 'कुछ नहीं (कतार खाली/सीमा)')
    return 0

def enrich_dates():
    """गहरी research: विकिडेटा से दिन-सटीक जन्म/मृत्यु तिथियाँ मास्टर DB + CSV में दर्ज"""
    import csv as _csv
    nrm = lambda x: re.sub(r'\s+', '', str(x or '').lower())
    dbp = os.path.join(APP, 'mahapurush_database.json')
    db = json.load(open(dbp, encoding='utf-8'))
    got = skipped = 0
    for p in db['persons']:
        if p.get('birth_date') and p.get('death_date'):
            continue
        qid = wd_search(p.get('name_en') or p.get('name_hi')) or wd_search(p.get('name_hi'))
        if not qid:
            skipped += 1; continue
        d = get(f'https://www.wikidata.org/w/api.php?action=wbgetentities&ids={qid}&props=claims|labels&format=json')
        ent = ((d or {}).get('entities', {}) or {}).get(qid, {})
        claims = ent.get('claims', {})
        dates = {}
        for k, pid in (('birth', 'P569'), ('death', 'P570')):
            cs = claims.get(pid) or []
            if cs:
                v = cs[0].get('mainsnak', {}).get('datavalue', {}).get('value', {})
                t = v.get('time', '')
                if v.get('precision') == 11 and re.match(r'\+\d{4}-\d{2}-\d{2}', t):
                    dates[k] = t[1:11]
        labels = [l.get('value', '') for l in (ent.get('labels') or {}).values()]
        lab_ok = nrm(p.get('name_hi')) in {nrm(v) for v in labels} or nrm(p.get('name_en') or '') in {nrm(v) for v in labels}
        yr_ok = True
        for k in ('birth', 'death'):
            ours, theirs = yr(p.get(k)), (int(dates[k][:4]) if k in dates else None)
            if ours and theirs and abs(ours - theirs) > 1: yr_ok = False
        if not (lab_ok or yr_ok) or not dates:
            skipped += 1; continue
        ch = False
        for k, fld in (('birth', 'birth_date'), ('death', 'death_date')):
            if k in dates and not p.get(fld):
                ours = yr(p.get(k))
                if ours and ours != int(dates[k][:4]): continue   # वर्ष-विरोध → मानव-निर्णय
                p[fld] = dates[k]; ch = True
                if not p.get(k): p[k] = dates[k][:4]
        if ch:
            p['date_source'] = 'wikidata:' + qid; got += 1
        else:
            skipped += 1
    json.dump(db, open(dbp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    csvp = os.path.join(APP, 'Aadivasi_Mahapurush_Starter_Database.csv')
    cols = ['id', 'name_hi', 'name_en', 'gender', 'tribe_hi', 'state', 'district', 'birth', 'death',
            'birth_date', 'death_date', 'category', 'tags', 'first_achievement', 'medals', 'awards',
            'verify', 'verify_note', 'sources', 'memorial', 'date_source']
    with open(csvp, 'w', encoding='utf-8-sig', newline='') as f:
        w = _csv.writer(f, lineterminator='\r\n')
        w.writerow(cols)
        for p in db['persons']:
            row = []
            for c in cols:
                v = p.get(c)
                if c == 'tags': v = ';'.join(v or [])
                if c == 'sources': v = ' | '.join(v or [])
                row.append('' if v is None else v)
            w.writerow(row)
    print(f'enrich-dates: {got} व्यक्तियों में दिन-सटीक तिथियाँ दर्ज (स्रोत: विकिडेटा); {skipped} छोड़े')
    return 0

def digest():
    host = os.environ.get('SMTP_HOST'); user = os.environ.get('SMTP_USER'); pw = os.environ.get('SMTP_PASS')
    if not (host and user and pw): print('digest: SMTP secrets नहीं — छोड़ा'); return 0
    index = json.load(open(os.path.join(EV_DIR, 'index.json'), encoding='utf-8')) if os.path.exists(os.path.join(EV_DIR, 'index.json')) else {}
    queue = json.load(open(QUEUE_F, encoding='utf-8'))['queue']
    pend = [q for q in queue if q['status'] == 'pending']
    vc = {}
    for v in index.values(): vc[v['verdict']] = vc.get(v['verdict'], 0) + 1
    lines = ['🤖 गोंडवाना स्व-सत्यापन — साप्ताहिक सारांश', '',
             f'समीक्षा-बाकी: {len(pend)} · जाँचे गए: {len(index)}',
             ' ' + ' · '.join(f'{VERDICT_HI[k]}: {n}' for k, n in sorted(vc.items())), '',
             '🔴/🟠/⚪ वाली प्रविष्टियाँ आपकी नज़र माँगती हैं:', '']
    for q in pend:
        v = index.get(q['id'])
        if v and v['verdict'] in ('conflict', 'weak', 'nosource'):
            lines.append(f"  · {q['title']} — {v['summary_hi'][:110]}")
    lines += ['', 'पैनल: https://saiyyamdeveloper.github.io/Gondwana-Saiyyam-calendar-/admin.html', '— स्वचालित: auto-verify.yml']
    msg = MIMEText('\n'.join(lines), 'plain', 'utf-8')
    msg['Subject'] = '🤖 स्व-सत्यापन साप्ताहिक सारांश — गोंडवाना'
    msg['From'] = user; msg['To'] = os.environ.get('MAIL_TO', 'gondwanaroots@gmail.com')
    try:
        with smtplib.SMTP(host, int(os.environ.get('SMTP_PORT', '587')), timeout=30) as s:
            s.starttls(context=ssl.create_default_context()); s.login(user, pw)
            s.sendmail(user, [x.strip() for x in msg['To'].split(',')], msg.as_string())
        print('digest: मेल भेजी')
    except Exception as e:
        print('digest: विफल', e)
    return 0

if __name__ == '__main__':
    sys.exit(main())
