#!/usr/bin/env python3
"""llm_research प्रॉम्प्ट-अखंडता जाँच: brace-रूप placeholder कभी KeyError न दें"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import llm_research as m
p = m.build_prompt(json.dumps({'id': 'person:x', 'title': 'जाँच'}, ensure_ascii=False),
                   json.dumps({'score': 50, 'verdict': 'partial', 'checks': []}, ensure_ascii=False))
assert '__ITEM__' not in p and '__LAYER1__' not in p, 'placeholder भरा नहीं'
assert '"verdict"' in p and 'person:x' in p, 'प्रॉम्प्ट सामग्री अधूरी'
# format-शैली कॉल कभी न हो: PROMPT में {item}/{layer1} नहीं बचे
assert '{item}' not in m.PROMPT and '{layer1}' not in m.PROMPT, 'पुराना format-placeholder बचा'
print('✅ check_llm पास (प्रॉम्प्ट brace-सुरक्षित)')
