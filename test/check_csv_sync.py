#!/usr/bin/env python3
"""CSV ↔ JSON sync checker (CI).
महापुरुष CSV और स्थल CSV की हर पंक्ति मास्टर JSON से मेल खानी चाहिए (id, name_hi, state)."""
import csv, json, sys, io, os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
fails = []

def rows(csv_path):
    with open(csv_path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

# 1) mahapurush
db = json.load(open(os.path.join(APP, 'mahapurush_database.json'), encoding='utf-8'))
cs = rows(os.path.join(APP, 'Aadivasi_Mahapurush_Starter_Database.csv'))
if len(db['persons']) != len(cs):
    fails.append(f"mahapurush: JSON {len(db['persons'])} != CSV {len(cs)}")
cmap = {r['id']: r for r in cs}
for p in db['persons']:
    r = cmap.get(p['id'])
    if not r:
        fails.append(f"mahapurush: CSV में id नहीं: {p['id']}"); continue
    if r['name_hi'] != p['name_hi']:
        fails.append(f"mahapurush {p['id']}: name_hi अलग")
    if r['state'] != (p.get('state') or ''):
        fails.append(f"mahapurush {p['id']}: state अलग")

# 2) places
pdb = json.load(open(os.path.join(APP, 'gondwana_places.json'), encoding='utf-8'))
pcs = rows(os.path.join(APP, 'Gondwana_Places_GPS.csv'))
if len(pdb['places']) != len(pcs):
    fails.append(f"places: JSON {len(pdb['places'])} != CSV {len(pcs)}")
pmap = {r['id']: r for r in pcs}
for p in pdb['places']:
    r = pmap.get(p['id'])
    if not r:
        fails.append(f"places: CSV में id नहीं: {p['id']}"); continue
    if r['name_hi'] != p['name_hi']:
        fails.append(f"places {p['id']}: name_hi अलग")
    if abs(float(r['lat']) - p['lat']) > 1e-6 or abs(float(r['lon']) - p['lon']) > 1e-6:
        fails.append(f"places {p['id']}: lat/lon अलग")

if fails:
    print("CSV↔JSON SYNC FAIL:")
    for f in fails:
        print("  ✗", f)
    sys.exit(1)
print(f"CSV↔JSON sync OK (mahapurush={len(cs)}, places={len(pcs)})")
