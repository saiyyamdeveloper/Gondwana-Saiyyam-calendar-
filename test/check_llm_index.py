#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""रिग्रेशन-गार्ड: यदि किसी डॉसियर में llm है तो index.json में भी llm/__meta होना चाहिए
(बग 2026-09: रात्रि auto_verify index-entry बदलकर llm मिटा देता था → पैनल झूठा 'secrets नहीं' संदेश दिखाता)"""
import json, glob, os, sys
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
idx = json.load(open(os.path.join(APP, 'review/evidence/index.json'), encoding='utf-8'))
dossier_llm = 0
for f in glob.glob(os.path.join(APP, 'review/evidence/*.json')):
    if f.endswith('index.json'): continue
    try: d = json.load(open(f, encoding='utf-8'))
    except Exception: continue
    if isinstance(d, dict) and d.get('llm'): dossier_llm += 1
index_llm = sum(1 for k, v in idx.items() if not k.startswith('__') and isinstance(v, dict) and v.get('llm'))
meta_ok = bool((idx.get('__meta') or {}).get('llm_runs'))
if dossier_llm > 0 and index_llm == 0 and not meta_ok:
    print(f'LLM-INDEX SYNC FAIL: {dossier_llm} डॉसियर llm-सहित, पर index में 0 — स्टेल-संदेश बग लौटा!'); sys.exit(1)
print(f'lllm-index sync OK: dossiers={dossier_llm} index={index_llm} __meta={"हाँ" if meta_ok else "नहीं"}')
