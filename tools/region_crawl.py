#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""क्षेत्र-क्रॉलर — संरचित BFS, रैंडम खोज नहीं।
क्रम: राज्य → जिले → तहसील → (पोस्ट/पंचायत/गाँव: आधिकारिक-डेटा चरण; चैकलिस्ट में दर्ज)
विधि: हर इकाई के विकिपीडिया-पृष्ठ के सुसंगत अनुभाग (त्यौहार/संस्कृति, इतिहास/आंदोलन,
पर्यटन/देवस्थान, प्रशासनिक-विभाजन) + OR-खोज — उम्मीदवार review/pending.json में kind='region'
(प्रकाशन सदैव मानव-सत्यापन के बाद)। चैकलिस्ट jobs कभी मिटते नहीं ⇒ 'कोई छूटे नहीं'।"""
import json, os, re, sys, time, difflib, hashlib, urllib.parse, urllib.request, datetime

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CK = os.path.join(APP, 'review', 'region_crawl.json')
RPATH = os.path.join(APP, 'gondwana_regions.json')
QUEUE_PATH = os.path.join(APP, 'review', 'pending.json')
UA = {'User-Agent': 'GondwanaCalendar/1.0 (research; gondwanaroots@gmail.com)'}
TRIBE_RE = re.compile(r'आदिवासी|जनजाति|tribal|गोंड|मुंडा|संताल|भूमिज|कोरकू|भील|कोंध|मुरिया|मड़िया|हल्बा|कमार|बैगा|खरिया|कोया|गरासिया|मीना|सहरिया|गोंडवाना', re.I)
EN_JUNK = re.compile(r'^(artificial|dam|lake|river|hill|hills|forest|park|road|bridge|railway|station|market|agriculture|industry|electricity|hydropower|water|navratri|dussehra|diwali|holi|eid|christmas|temple|fort|palace|festival|dance|music|art|craft)$', re.I)
SELF_REF = re.compile(r'lok sabha|assembly constituency|railway station|junction|district,|,\s*(bihar|haryana|himachal|pradesh|maharashtra|odisha|gujarat)', re.I)
BLACK_RE = re.compile(r'^(त्योहार|त्यौहार|मेला|मेले|उत्सव|पर्व|जीव[- ]?जन्तुओं?|देवी[- ]?देवताओं?|देवताओं?|देवी|कला|कलाकृति|संस्कृति|परंपरा|आदिवासी|आदिवासियों|जनजाति|गांव|गाँव|जिला|नगर|नृत्य|गीत|भाषा|भाषाएँ|वन|कृषि)$', re.I)
STOP_RE = re.compile(r'^(विकिपीडिया|श्रेणी|भारत|छत्तीसगढ़|सूची|मुखपृष्ठ|चित्र|फ़ाइल|साँचा|portal|category|file|template|wikipedia|india|list of)', re.I)
FEST_SEC = re.compile(r'त्यौहार|त्योहार|तीज|मेला|उत्सव|संस्कृति|कला|परंपरा|festival|culture|fair', re.I)
HIST_SEC = re.compile(r'इतिहास|स्वातंत्र्य|आंदोलन|विद्रोह|history|freedom|movement', re.I)
PLACE_SEC = re.compile(r'पर्यटन|दर्शनीय|देवी|देव[^ा-िी]|मंदिर|तीर्थ|स्थल|tourism|temple|shrine|places?', re.I)
ADMIN_SEC = re.compile(r'प्रशासन|तहसील|तालुका|अनुविभाग|मंडल|प्रखंड|ब्लॉक|division|tehsil|tahsil|mandal|revenue', re.I)

def api(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            if i == 2: return {'error': str(e)}
            time.sleep(1.5 * (i + 1))

def wikitext(lang, title):
    u = f'https://{lang}.wikipedia.org/w/api.php?action=parse&page=' + urllib.parse.quote(title) + '&prop=wikitext&format=json&redirects=1'
    d = api(u)
    return (d.get('parse') or {}).get('wikitext', {}).get('*', '')

def search(lang, query, limit=5):
    u = (f'https://{lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=' +
         urllib.parse.quote(query) + f'&gsrnamespace=0&gsrlimit={limit}&prop=extracts&exsentences=2&exintro=1&explaintext=1&format=json&redirects=1')
    d = api(u)
    pages = (d.get('query') or {}).get('pages') or {}
    return [{'title': p.get('title', ''), 'snippet': (p.get('extract') or '')[:500],
             'url': f'https://{lang}.wikipedia.org/wiki/' + urllib.parse.quote(p.get('title', '').replace(' ', '_'))}
            for p in sorted(pages.values(), key=lambda x: x.get('index', 99))[:limit]]

def today():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')

def load(p, d):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d

def save(p, o):
    with open(p, 'w', encoding='utf-8') as f: json.dump(o, f, ensure_ascii=False, indent=1)

def slug(s):
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s or 'x'

def clean_name(t):
    t = re.sub(r'\s*(जिला|district|तहसील|tahsil|tehsil)\s*$', '', t, flags=re.I).strip(' -।.')
    return t

def sections(wt):
    """wikitext → [(head, body)] — पंक्ति-आधारित (inline == से सुरक्षित)"""
    out, cur = [], None
    for line in wt.split('\n'):
        m = re.match(r'^\s*(={2,6})\s*([^=].*?)\s*=*\s*$', line)
        if m and len(m.group(2)) < 60:
            cur = [m.group(2).strip('= '), []]
            out.append((cur[0], cur[1]))
        elif cur is not None:
            cur[1].append(line)
    return [(h, '\n'.join(b)) for h, b in out]

FEST_WORD = re.compile(r'मेला|जतरा|उत्सव|पर्व|त्यौहार|त्योहार|दशहरा|पूजा|नवरात्रि|नवाखाई|हरियाली|अकती|चैतराई|माड़ी|नृत्य|जश्न|festival|fair|mela|jatra', re.I)

def comma_lists(body):
    """'X, Y, Z आदि मुख्य त्यौहार हैं' जैसे वाक्यों से नाम-सूचियाँ"""
    out = []
    for m in re.finditer(r'([^.।]{10,260}?)\s*(?:आदि\s*)?(?:मुख्य\s*|प्रमुख\s*)?(त्यौहार|त्योहार|मेले|पर्व|देवी[ -]?देवता|उत्सव)', body):
        frag = m.group(0)
        frag = re.sub(r'\[\[([^\]|]*)\|?([^\]]*)\]\]', lambda x: (x.group(2) or x.group(1)), frag)
        frag = re.sub(r'\{\{[^}]*\}\}|<ref[^>]*>|\'\'', ' ', frag)
        names = re.split(r'[,;।]| तथा | और ', frag)
        for t in names:
            t = clean_name(t.strip())
            if 2 < len(t) < 28 and not STOP_RE.match(t) and not BLACK_RE.match(t) and not re.search(r'^\d|http|हैं|है$|मनाया|प्रसिद्ध|क्षेत्र|कला में|बनाना|मूर्तियाँ|यहाँ|जिले|राज्य', t):
                out.append((t, re.sub(r'\s+', ' ', m.group(0))[:240]))
    return out

def candidates_from(body):
    """अनुभाग-टेक्स्ट → नाम-उम्मीदवार (लिंक + बोल्ड) + context"""
    cands = []
    for m in re.finditer(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", body):
        t = m.group(2) or m.group(1)
        t = clean_name(t.strip())
        if t: cands.append((t, m.start()))
    for m in re.finditer(r"'''([^']{3,40})'''", body):
        t = clean_name(m.group(1).strip())
        if t: cands.append((t, m.start()))
    out = []
    for t, pos in cands:
        if len(t) < 3 or len(t) > 44 or STOP_RE.match(t) or BLACK_RE.match(t) or EN_JUNK.match(t) or SELF_REF.search(t) or re.search(r'\d{4}|http|\.jpg|\.png', t): continue
        ctx = re.sub(r'\{\{[^}]*\}\}|\[\[|\]\]|\'\'|<ref[^>]*/?>|<ref.*?</ref>', ' ', body[max(0, pos - 120):pos + 240])
        ctx = re.sub(r'\s+', ' ', ctx).strip()
        out.append((t, ctx))
    seen, uniq = set(), []
    for t, c in out:
        k = t.lower()
        if k in seen: continue
        seen.add(k); uniq.append((t, c))
    return uniq

REG = None

def by_id(uid):
    for u in REG['units']:
        if u['id'] == uid: return u
    return None

def unit_path(u):
    parts = [u['name_hi']]; p = u.get('parent'); g = 0
    while p and g < 8:
        pu = by_id(p)
        if not pu: break
        parts.insert(0, pu['name_hi']); p = pu.get('parent'); g += 1
    return ' · '.join(parts)

def queue_entity(u, kind, name, desc, src, queue):
    existing = {e['name_hi'] for e in u['entities']}
    existing |= {q['payload']['entity']['name_hi'] for q in queue
                 if q.get('kind') == 'region' and (q.get('payload') or {}).get('unit_id') == u['id']}
    if name in existing or any(difflib.SequenceMatcher(None, name, x).ratio() > 0.85 for x in existing):
        return False
    base = (u.get('name_en') or u['name_hi']).lower()
    if name.lower() == base or difflib.SequenceMatcher(None, name.lower(), base).ratio() > 0.9:
        return False  # स्वयं का नाम प्रविष्टि नहीं
    qid = 'region:' + slug(u['id'].replace(':', '-'))[:40] + '-' + hashlib.md5(name.encode('utf-8')).hexdigest()[:8]
    if any(q['id'] == qid for q in queue): return False
    queue.insert(0, {
        'id': qid, 'kind': 'region', 'subtype': kind,
        'title': name, 'subtitle': unit_path(u),
        'reason': f'क्षेत्र-क्रॉलर ({u["level"]}-अनुभाग-खनन): {kind} उम्मीदवार — प्रकाशन पूर्व मानव-सत्यापन आवश्यक',
        'source_file': 'gondwana_regions.json', 'record_id': u['id'],
        'payload': {'unit_id': u['id'], 'entity': {
            'kind': kind, 'name_hi': name, 'desc_hi': desc[:280],
            'sources': [src], 'added': 'crawl', 'verify': True}},
        'status': 'pending', 'added': today(), 'added_by': 'region-crawl',
        'decision': None, 'decided_by': None, 'decided_at': None, 'note': ''})
    return True

def classify_context(kind_hint, ctx):
    if re.search(r'शहीद|फाँसी|बलिदान|martyr', ctx): return 'martyr'
    if re.search(r'विद्रोह|क्रांतिकारी|rebel|rebellion|आंदोलन', ctx): return 'revolutionary'
    if re.search(r'मान्यता|रस्म|रीति|ritual|worship|पूजा', ctx): return 'belief'
    if re.search(r'मंदिर|देवस्थान|तीर्थ|temple|shrine|स्मारक|memorial|जलप्रपात|झरना|अभयारण्य', ctx): return 'place'
    return kind_hint

def find_page(u):
    """जिला/तहसील पृष्ठ खोजो (hi → en → search-फ़ॉलबैक)"""
    hi, en = u['name_hi'], u.get('name_en', '')
    cands = ([f'{hi} जिला', hi] if u['level'] == 'district' else [hi, f'{hi} तहसील']) + \
            ([f'{en} district', en] if en else [])
    for c in cands:
        lang = 'en' if re.fullmatch(r'[A-Za-z .\'-]+', c or '') else 'hi'
        w = wikitext(lang, c)
        if w and len(w) > 800:
            return w, f'https://{lang}.wikipedia.org/wiki/' + urllib.parse.quote(c.replace(' ', '_')), lang
    hs = search('hi', f'{hi} छत्तीसगढ़ OR जिला OR तहसील', limit=3) if u['level'] != 'state' else []
    for h in hs:
        if any(k in h['title'] for k in (hi[:4], en[:4] if en else '\0')):
            w = wikitext('hi', h['title'])
            if w and len(w) > 800:
                return w, h['url'], 'hi'
    return '', '', ''

def mine_unit(u, queue, log):
    """जिला/तहसील पृष्ठ के अनुभागों से संरचित खनन"""
    wt, page, lang = find_page(u)
    children = 0; ents = 0
    if not wt:
        return 0, 0, 'पृष्ठ नहीं मिला'
    for head, body in sections(wt):
        is_admin = bool(ADMIN_SEC.search(head))
        is_fest = bool(FEST_SEC.search(head)) or bool(re.search(r'दशहरा|त्योहार|त्यौहार|घोटुल|मृतक स्तम्भ', head))
        is_hist = bool(HIST_SEC.search(head))
        is_place = bool(PLACE_SEC.search(head))
        if is_admin and u['level'] == 'district' and children < 40:
            nm = u['id'].split(':')[1]
            for t, ctx in candidates_from(body):
                if not (re.search(r'तहसील|तालुका|मंडल|ब्लॉक|प्रखंड|tehsil|tahsil|mandal|block', ctx + ' ' + t, re.I)): continue
                tid = f'tehsil:{nm}/{slug(t)}'
                if by_id(tid): continue
                REG['units'].append({'id': tid, 'level': 'tehsil', 'name_hi': t, 'parent': u['id'],
                                     'entities': [], 'source_admin': page})
                children += 1
        if not (is_fest or is_hist or is_place): continue
        hint = 'festival' if is_fest else ('place' if is_place else 'person')
        pool = [(t, c, 'link') for t, c in candidates_from(body)]
        if is_fest: pool += [(t, c, 'list') for t, c in comma_lists(body)]
        for t, ctx, tag in pool:
            if is_hist and not (TRIBE_RE.search(ctx) or re.search(r'शहीद|विद्रोह|क्रांतिकारी|1857|आंदोलन', ctx)): continue
            if is_fest and tag == 'link' and not (FEST_WORD.search(t) or FEST_WORD.search(head)): continue
            if not is_hist and not (TRIBE_RE.search(ctx + ' ' + head) or is_fest or is_place): continue
            kind = classify_context(hint, ctx)
            if ents < 8 and queue_entity(u, kind, t, ctx, page, queue): ents += 1
    return children, ents, ''

def do_districts(job, log):
    uid = job['unit']; u = by_id(uid)
    en = u.get('name_en') or u['name_hi']
    wt = wikitext('en', f'List of districts of {en}')
    if not wt:
        job.update(status='blocked', note='विकिपीडिया जिला-सूची नहीं मिली', blocked_at=now()); return
    names = set()
    for m in re.finditer(r'\[\[([A-Za-z .\'-]+?) district(?:\|[^\]]*)?\]\]', wt):
        names.add(m.group(1).strip())
    names = {n for n in names if len(n) > 2 and not re.search(r'list|former|category|portal', n, re.I)}
    sid = uid.split(':')[1]; created = 0
    for n in sorted(names):
        nid = f'district:{sid}/{slug(n)}'
        if by_id(nid): continue
        hi = n
        hs = search('hi', f'{n} जिला {u["name_hi"]}', limit=2)
        if hs and n.lower() in hs[0]['title'].lower():
            hi = clean_name(hs[0]['title'])
        REG['units'].append({'id': nid, 'level': 'district', 'name_hi': hi, 'name_en': n,
                             'parent': uid, 'entities': [],
                             'source_admin': f'Wikipedia: List of districts of {en}'})
        created += 1
    job.update(status='done', done_at=now(), created=created)
    log.append(f'{uid}: {created} जिले जुड़े')

def do_unit(job, queue, log):
    uid = job['unit']; u = by_id(uid)
    if not u:
        job.update(status='blocked', note='इकाई नहीं मिली'); return
    children, ents, note = mine_unit(u, queue, log)
    if children == 0 and ents == 0:
        job.update(status='blocked', note=note or 'अनुभाग/उम्मीदवार नहीं मिले — आधिकारिक-डेटा चरण या मैन्युअल शोध', blocked_at=now())
    else:
        job.update(status='done', done_at=now(), children=children, entities_queued=ents)
        if u['level'] == 'district' and children == 0:
            job['children_note'] = 'तहसील-सूची अनुभाग नहीं मिला — आधिकारिक-डेटा चरण में'
    log.append(f'{uid}: तहसील={children} उम्मीदवार={ents}' + (f' [{note}]' if note else ''))

PRIO = ['cg', 'jh', 'od', 'mp', 'ts', 'mh', 'gj', 'rj', 'ap', 'wb', 'as', 'ka',
        'ml', 'mz', 'nl', 'tr', 'mn', 'ar', 'jk', 'br', 'up', 'tn', 'kl', 'hp', 'uk', 'sk', 'ga', 'hr', 'pb']

def ensure_checklist():
    ck = load(CK, None)
    if ck is None:
        ck = {'meta': {'title': 'क्षेत्र-क्रॉल चैकलिस्ट (BFS) — jobs कभी नहीं मिटते; कोई इकाई नहीं छूटेगी',
                       'created': now(), 'order': 'ST-जनसंख्या प्राथमिकता → क्रमवार BFS'},
              'jobs': []}
    have = {j['unit'] for j in ck['jobs']}
    for u in REG['units']:
        if u['level'] == 'state' and u['id'] not in have:
            ck['jobs'].append({'unit': u['id'], 'task': 'districts', 'status': 'pending'}); have.add(u['id'])
        elif u['level'] in ('district', 'tehsil') and u['id'] not in have:
            ck['jobs'].append({'unit': u['id'], 'task': 'mine', 'status': 'pending'}); have.add(u['id'])
    def key(j):
        sid = j['unit'].split(':')[1].split('/')[0]
        rank = PRIO.index(sid) if sid in PRIO else 9
        lvl = 0 if j['unit'].startswith('district:cg/') else (1 if j['task'] == 'districts' else 2)
        return (lvl, rank, j['unit'])
    ck['jobs'].sort(key=key)
    return ck

def main():
    global REG
    limit = 6
    if '--limit' in sys.argv: limit = int(sys.argv[sys.argv.index('--limit') + 1])
    REG = load(RPATH, None)
    if REG is None:
        print('[crawl] gondwana_regions.json नहीं मिला — पहले build_regions.py'); return 1
    ck = ensure_checklist()
    qd = load(QUEUE_PATH, {'meta': {}, 'queue': []})
    queue = qd['queue']
    jobs = [j for j in ck['jobs'] if j['status'] == 'pending'][:limit]
    log = []
    for j in jobs:
        try:
            if j['task'] == 'districts': do_districts(j, log)
            else: do_unit(j, queue, log)
        except Exception as e:
            j.update(status='blocked', note=str(e)[:200], blocked_at=now()); log.append(f"{j['unit']}: त्रुटि {e}")
        time.sleep(0.4)
    have = {j['unit'] for j in ck['jobs']}
    for u in REG['units']:
        if u['level'] in ('district', 'tehsil') and u['id'] not in have:
            ck['jobs'].append({'unit': u['id'], 'task': 'mine', 'status': 'pending'}); have.add(u['id'])
    ck['meta']['updated'] = now()
    done = sum(1 for j in ck['jobs'] if j['status'] == 'done')
    blocked = sum(1 for j in ck['jobs'] if j['status'] == 'blocked')
    ck['meta']['progress'] = f'{done}/{len(ck["jobs"])} done, {blocked} blocked'
    save(CK, ck)
    qd['meta']['updated'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    save(QUEUE_PATH, qd)
    save(RPATH, REG)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_regions
    build_regions.build()
    print('\n'.join('[crawl] ' + l for l in log))
    print(f'[crawl] प्रगति: {ck["meta"]["progress"]}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
