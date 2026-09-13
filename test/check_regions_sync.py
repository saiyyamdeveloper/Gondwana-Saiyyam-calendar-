#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""regions sync: gondwana_regions.json ↔ regions_data.js + पुनर्जनन-स्थिरता"""
import json, os, sys
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = json.load(open(os.path.join(APP, 'gondwana_regions.json'), encoding='utf-8'))
txt = open(os.path.join(APP, 'regions_data.js'), encoding='utf-8').read()
m = txt[txt.index('{'):txt.rindex('}') + 1]
J2 = json.loads(m)
if J != J2:
    print('REGIONS SYNC FAIL: JSON ≠ regions_data.js'); sys.exit(1)
ids = [u['id'] for u in J['units']]
if len(ids) != len(set(ids)):
    print('REGIONS SYNC FAIL: duplicate ids'); sys.exit(1)
print(f'regions sync OK: {len(ids)} units, {J["meta"]["coverage"]["entities"]} entities')
