#!/usr/bin/env python3
"""Review-checklist generator (परत 3).
verify:true वाले सभी तथ्य + समुदाय-घोषित पर्व + बिना-फ़ोटो प्रविष्टियाँ →
REVIEW_CHECKLIST.md — समीक्षक इसी सूची से फ़ील्ड-सत्यापन करें।"""
import json, os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

heroes = json.load(open(os.path.join(APP, 'mahapurush_database.json'), encoding='utf-8'))
places = json.load(open(os.path.join(APP, 'gondwana_places.json'), encoding='utf-8'))
extra = json.load(open(os.path.join(APP, 'extra_data.json'), encoding='utf-8'))

out = []
out.append("# 📋 समीक्षा-सूची (Review Checklist) — सत्यापन बाकी तथ्य")
out.append(f"\n> जनरेट: {date.today().isoformat()} · `python3 tools/make_review_checklist.py` से दोबारा बनाएँ\n")

hv = [p for p in heroes['persons'] if p.get('verify')]
out.append(f"## 1. महापुरुष — verify फ़्लैग ({len(hv)}/{len(heroes['persons'])})\n")
out.append("| ✓ | नाम | श्रेणी | क्या जाँचना है |")
out.append("|---|---|---|---|")
for p in hv:
    out.append(f"| ☐ | {p['name_hi']} | {p['category']} | {p.get('verify_note','—')} |")

np_ = [p for p in heroes['persons'] if not p.get('photo')]
out.append(f"\n## 2. महापुरुष — फ़ोटो जोड़ना बाकी ({len(np_)})\n")
out.append("नीति: केवल PD/CC (Wikimedia Commons, लाइसेंस-जाँच के बाद) या सरकारी स्रोत।\n")
out.append("· " + " · ".join(p['name_hi'] for p in np_))

pv = [p for p in places['places'] if p.get('verify')]
out.append(f"\n\n## 3. स्थल-कोश — verify फ़्लैग ({len(pv)}/{len(places['places'])})\n")
out.append("| ✓ | स्थल | राज्य | सटीकता | क्या जाँचना है |")
out.append("|---|---|---|---|---|")
for p in pv:
    out.append(f"| ☐ | {p['name_hi']} | {p['state']} | {p['gps_precision']} | {p.get('verify_note','—')} |")

fv = [f for f in extra['festivals'] if f.get('verify')]
out.append(f"\n## 4. पर्व — verify फ़्लैग ({len(fv)}/{len(extra['festivals'])})\n")
for f in fv:
    out.append(f"- ☐ **{f['deva']}** ({f['id']}): {f.get('verify_note','फील्ड-सत्यापन शेष')}")

comm = [f for f in extra['festivals'] if f.get('type') in ('community', 'season', 'announce') or 'community' in str(f.get('type', ''))]
out.append(f"\n## 5. समुदाय/मौसम-घोषित पर्व — हर साल तिथि-पुष्टि चाहिए ({len(comm)})\n")
for f in comm:
    out.append(f"- ☐ **{f['deva']}** ({f['id']}) — अगली तिथि समुदाय/आयोजक से पुष्ट कराएँ")

out.append("\n---\n*यह सूची auto-generated है। सत्यापन पूरा होने पर JSON में verify:false करें और दोबारा generate करें — सूची अपने आप छोटी होती जाएगी।*")

path = os.path.join(APP, 'REVIEW_CHECKLIST.md')
open(path, 'w', encoding='utf-8').write("\n".join(out) + "\n")
print(f"REVIEW_CHECKLIST.md written: heroes-verify={len(hv)} photos-pending={len(np_)} places-verify={len(pv)} fest-verify={len(fv)} community={len(comm)}")
