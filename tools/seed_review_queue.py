#!/usr/bin/env python3
"""समीक्षा-कतार बीजक (seed_review_queue.py)
तीनों मास्टर डेटाबेसों से verify:true / अधूरी प्रविष्टियाँ निकालकर
review/pending.json बनाता है — एडमिन-पैनल इन्हीं को स्वीकार/अस्वीकार करेगा।

नई auto-research प्रविष्टियाँ भी इसी कतार में जोड़ें (status:"pending") —
एडमिन की स्वीकृति के बिना कुछ भी public डेटाबेस में नहीं जाता।"""
import json, os, datetime, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
OUT_DIR = os.path.join(APP, 'review')
os.makedirs(OUT_DIR, exist_ok=True)

def load(fn):
    return json.load(open(os.path.join(APP, fn), encoding='utf-8'))

heroes = load('mahapurush_database.json')
places = load('gondwana_places.json')
extra = load('extra_data.json')
today = datetime.date.today().isoformat()

queue = []

def qid(kind, ident):
    return kind + ':' + ident

# 1) महापुरुष / शहीद / क्रांतिकारी — verify फ़्लैग वाले
for p in heroes['persons']:
    if p.get('verify'):
        queue.append({
            "id": qid('person', p['id']),
            "kind": "person",
            "subtype": ("shahid" if 'shahid' in (p.get('tags') or [])
                        else ("krantikari" if p.get('category') == 'freedom' else "mahapurush")),
            "title": p.get('name_hi', p['id']),
            "subtitle": f"{p.get('tribe_hi','')} · {p.get('state','')} · {p.get('category','')}",
            "reason": p.get('verify_note') or 'तथ्य-सत्यापन शेष',
            "source_file": "mahapurush_database.json",
            "record_id": p['id'],
            "payload": p,
            "status": "pending",
            "added": today,
            "added_by": "auto:seed_review_queue.py",
            "decision": None, "decided_by": None, "decided_at": None, "note": ""
        })

# 2) फ़ोटो-रहित प्रविष्टियाँ (फ़ोटो-नीति समीक्षा)
for p in heroes['persons']:
    if not p.get('photo'):
        queue.append({
            "id": qid('photo', p['id']),
            "kind": "photo",
            "subtype": "photo-approval",
            "title": f"फ़ोटो: {p.get('name_hi', p['id'])}",
            "subtitle": "लाइसेंस-जाँच आवश्यक (केवल PD/CC)",
            "reason": "फ़ोटो जोड़ने से पहले लाइसेंस-स्रोत सत्यापित करें",
            "source_file": "mahapurush_database.json",
            "record_id": p['id'],
            "payload": {"name_hi": p.get('name_hi'), "photo": None, "photo_source": None},
            "status": "pending", "added": today, "added_by": "auto:seed_review_queue.py",
            "decision": None, "decided_by": None, "decided_at": None, "note": ""
        })

# 3) स्थल — verify फ़्लैग वाले
for p in places['places']:
    if p.get('verify'):
        queue.append({
            "id": qid('place', p['id']),
            "kind": "place",
            "subtype": p.get('category', 'place'),
            "title": p.get('name_hi', p['id']),
            "subtitle": f"{p.get('state','')} · {p.get('district','')} · GPS {p.get('lat')},{p.get('lon')} ({p.get('gps_precision')})",
            "reason": p.get('verify_note') or 'स्थिति/GPS सत्यापन शेष',
            "source_file": "gondwana_places.json",
            "record_id": p['id'],
            "payload": p,
            "status": "pending", "added": today, "added_by": "auto:seed_review_queue.py",
            "decision": None, "decided_by": None, "decided_at": None, "note": ""
        })

# 4) पर्व / festival — verify फ़्लैग वाले
for f in extra['festivals']:
    if f.get('verify'):
        queue.append({
            "id": qid('festival', f['id']),
            "kind": "festival",
            "subtype": "parv",
            "title": f.get('deva', f['id']),
            "subtitle": f"{f.get('gondi','')} · {f.get('month','')} {f.get('paksha','')} {f.get('tithi','')}",
            "reason": f.get('verify_note') or 'तिथि-नियम फ़ील्ड-सत्यापन शेष',
            "source_file": "extra_data.json",
            "record_id": f['id'],
            "payload": f,
            "status": "pending", "added": today, "added_by": "auto:seed_review_queue.py",
            "decision": None, "decided_by": None, "decided_at": None, "note": ""
        })

# 5) समुदाय-घोषित जतराएँ — हर वर्ष तिथि-पुष्टि
for f in extra['festivals']:
    if f.get('type') in ('announce', 'community'):
        queue.append({
            "id": qid('announce', f['id']),
            "kind": "announcement",
            "subtype": "community-date",
            "title": f"तिथि-पुष्टि: {f.get('deva', f['id'])}",
            "subtitle": "समुदाय/आयोजक घोषणा प्रतीक्षित",
            "reason": "इस पर्व की तिथि स्वतः नहीं गणना होती — समुदाय से पुष्टि कराएँ",
            "source_file": "extra_data.json",
            "record_id": f['id'],
            "payload": {"id": f['id'], "deva": f.get('deva'), "type": f.get('type')},
            "status": "pending", "added": today, "added_by": "auto:seed_review_queue.py",
            "decision": None, "decided_by": None, "decided_at": None, "note": ""
        })

doc = {
    "meta": {
        "title": "गोंडवाना समीक्षा-कतार (Verification Queue)",
        "generated": today,
        "generator": "tools/seed_review_queue.py",
        "policy": "एडमिन-स्वीकृति के बिना कोई प्रविष्टि public डेटाबेस में नहीं जाएगी",
        "kinds": {"person": "महापुरुष/शहीद/क्रांतिकारी", "photo": "फ़ोटो-लाइसेंस", "place": "स्थल/GPS",
                  "festival": "पर्व/त्योहार", "announcement": "समुदाय-घोषित तिथि"},
        "counts": {}
    },
    "queue": queue
}
from collections import Counter
c = Counter(q['kind'] for q in queue)
doc['meta']['counts'] = dict(c)

pending_path = os.path.join(OUT_DIR, 'pending.json')
json.dump(doc, open(pending_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# decisions log (append-only audit trail) — पहली बार बनाएँ; मौजूदा हो तो न मिटाएँ
dec_path = os.path.join(OUT_DIR, 'decisions.json')
if not os.path.exists(dec_path):
    json.dump({"meta": {"title": "निर्णय-लॉग (audit trail)", "note": "हर स्वीकृति/अस्वीकृति यहाँ दर्ज होती है"},
               "decisions": []}, open(dec_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

print(f"pending.json: {len(queue)} प्रविष्टियाँ → {dict(c)}")
print(f"decisions.json: {'मौजूद (सुरक्षित)' if os.path.exists(dec_path) else 'बना'}")
