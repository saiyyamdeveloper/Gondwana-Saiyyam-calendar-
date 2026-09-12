#!/usr/bin/env python3
"""एडमिन-पैनल फ़ाइलों की संरचनात्मक जाँच (CI) — check_admin.py
पास: exit 0 · विफल: exit 1 (CI लाल)"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
FAILS = []

def load(rel):
    return json.load(open(os.path.join(APP, rel), encoding='utf-8'))

def check(cond, msg):
    if not cond:
        FAILS.append(msg)

# 1) credentials
c = load('admin-credentials.json')
check(str(c.get('algorithm','')).lower().replace('-','').replace('+',' ').split()[0] in ('sha256',), 'algorithm गलत')
check(isinstance(c.get('salt'), str) and len(c['salt']) >= 32, 'salt कमज़ोर/गायब')
check(len(c.get('accounts', [])) >= 1, 'कोई खाता नहीं')
roles = set()
for a in c['accounts']:
    roles.add(a['role'])
    check(a['role'] in ('superadmin', 'admin'), f"अमान्य भूमिका: {a['role']}")
    check(re.fullmatch(r'[0-9a-f]{64}', a.get('hash', '')) is not None, f"hash अमान्य: {a['email']}")
    check(re.fullmatch(r'\d{4}-\d{2}-\d{2}', a.get('expires', '')) is not None, f"expires अमान्य: {a['email']}")
    check('password' not in a and 'pw' not in a and 'plain' not in json.dumps(a), f"plaintext-संदिग्ध फ़ील्ड: {a['email']}")
check('superadmin' in roles, 'superadmin खाता अनिवार्य')
raw = open(os.path.join(APP, 'admin-credentials.json'), encoding='utf-8').read()
check('6KYpYEdRjrMmud' not in raw and 'gyKfzqw7jBJe2g' not in raw, 'plaintext पासवर्ड फ़ाइल में नहीं होना चाहिए')

# 2) pending queue
p = load('review/pending.json')
q = p.get('queue', [])
check(len(q) > 0, 'कतार खाली — seeder चलाएँ')
ids = set()
KINDS = {'person', 'photo', 'place', 'festival', 'announcement'}
for item in q:
    for k in ('id', 'kind', 'title', 'payload', 'status', 'added'):
        check(k in item, f'प्रविष्टि में {k} गायब: {item.get("id", "?")}')
    check(item['kind'] in KINDS, f'अमान्य kind: {item["id"]}')
    check(item['status'] in ('pending', 'approved', 'rejected'), f'अमान्य status: {item["id"]}')
    check(isinstance(item['payload'], dict), f'payload dict नहीं: {item["id"]}')
    check(item['id'] not in ids, f'दोहरा id: {item["id"]}')
    ids.add(item['id'])
    if item.get('isNew') and item['kind'] in ('person', 'place', 'festival'):
        check(len(item['payload'].get('sources', [])) >= 1, f'नई प्रविष्टि बिना स्रोत: {item["id"]}')

# 3) decisions log
d = load('review/decisions.json')
check(isinstance(d.get('decisions'), list), 'decisions list नहीं')
for dec in d['decisions']:
    check(dec.get('decision') in ('approved', 'rejected'), f'लॉग में अमान्य निर्णय: {dec.get("id")}')
    check(dec.get('by'), f'लॉग में by गायब: {dec.get("id")}')

# 3.5) मीडिया manifest
man = load('media/manifest.json')
MTYPES = {'image', 'audio', 'song', 'video', 'doc', 'other'}
MSTAT = {'candidate', 'verified', 'rejected'}
MLIC = {'own', 'PD', 'CC-BY', 'CC-BY-SA', 'copyright-pending', 'unknown'}
mids = set()
for it in man.get('items', []):
    for k in ('id', 'type', 'title', 'status', 'license', 'added'):
        check(k in it, f"manifest में {k} गायब: {it.get('id', '?')}")
    check(it.get('type') in MTYPES, f"manifest अमान्य type: {it.get('id')}")
    check(it.get('status') in MSTAT, f"manifest अमान्य status: {it.get('id')}")
    check(it.get('license') in MLIC, f"manifest अमान्य license: {it.get('id')}")
    check(it.get('id') not in mids, f"manifest दोहरा id: {it.get('id')}")
    mids.add(it.get('id'))
    check(bool(it.get('title', '').strip()), f"manifest खाली title: {it.get('id')}")
    check(bool(it.get('path') or it.get('url') or it.get('note')), f"manifest में path/url/note में से एक चाहिए: {it.get('id')}")
    if it.get('path'):
        full = os.path.join(APP, it['path'])
        if not it['path'].startswith('media/inbox'):
            check(os.path.exists(full), f"manifest path मौजूद नहीं: {it['path']}")
check(os.path.isdir(os.path.join(APP, 'media', 'inbox')), 'media/inbox डिरेक्टरी गायब')

# 3.7) evidence index स्कीमा
evp = os.path.join(APP, 'review', 'evidence', 'index.json')
if os.path.exists(evp):
    evid = json.load(open(evp, encoding='utf-8'))
    VSET = {'pass', 'partial', 'conflict', 'weak', 'nosource'}
    for eid, v in evid.items():
        check(isinstance(v.get('score'), int) and 0 <= v['score'] <= 100, f'evidence स्कोर अमान्य: {eid}')
        check(v.get('verdict') in VSET, f'evidence verdict अमान्य: {eid}')
        check(bool(v.get('summary_hi')), f'evidence सारांश खाली: {eid}')

# 4) पैनल फ़ाइलें
for f in ('admin.html', 'admin.js'):
    check(os.path.exists(os.path.join(APP, f)), f'{f} गायब')
adm = open(os.path.join(APP, 'admin.js'), encoding='utf-8').read()
check('sha256' in adm and 'crypto.subtle' in adm, 'admin.js में hash-लॉगिन नहीं')
check('sessionStorage' in adm, 'admin.js सत्र-प्रबंधन नहीं')
html = open(os.path.join(APP, 'admin.html'), encoding='utf-8').read()
check('noindex' in html, 'admin.html noindex नहीं')

if FAILS:
    print('❌ check_admin विफल:')
    for f in FAILS:
        print('  -', f)
    sys.exit(1)
print(f'✅ check_admin पास ({len(q)} कतार-प्रविष्टियाँ, {len(c["accounts"])} खाते, {len(d["decisions"])} निर्णय-लॉग)')
