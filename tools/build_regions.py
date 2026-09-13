#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""क्षेत्र-कोश बिल्डर — gondwana_regions.json (master) → regions_data.js (app-ready)
संरचना: state → district → tehsil → post → panchayat → village (BFS-चैकलिस्ट; क्रॉलर review/region_crawl.json से)
नीति: हर entity का sources[] अनिवार्य; मौजूदा DB (महापुरुष/स्थल) स्वतः ref-लिंक — duplication नहीं।"""
import json, os, sys, datetime

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPATH = os.path.join(APP, 'gondwana_regions.json')
JSPATH = os.path.join(APP, 'regions_data.js')
LEVELS = ['state', 'district', 'tehsil', 'post', 'panchayat', 'village']
KINDS = {'festival': 'पर्व/मेला', 'belief': 'मान्यता/रस्म', 'person': 'महापुरुष/विद्वान',
         'martyr': 'अमर शहीद', 'revolutionary': 'वीर क्रांतिकारी', 'place': 'धार्मिक/दर्शन स्थल',
         'story': 'लोक-कथा (बुजुर्ग-वाणी)'}

# TRTI/2011 जनगणना ST-जनसंख्या (हज़ार) — प्राथमिकता-क्रम इसी से
STATES = [
    ('cg', 'छत्तीसगढ़', 'Chhattisgarh', 7823, 30.62), ('ml', 'मेघालय', 'Meghalaya', 2556, 86.15),
    ('mz', 'मिज़ोरम', 'Mizoram', 1036, 94.44), ('nl', 'नागालैंड', 'Nagaland', 1711, 86.46),
    ('jh', 'झारखंड', 'Jharkhand', 8645, 26.21), ('ar', 'अरुणाचल प्रदेश', 'Arunachal Pradesh', 952, 68.79),
    ('mn', 'मणिपुर', 'Manipur', 903, 35.14), ('tr', 'त्रिपुरा', 'Tripura', 1167, 31.76),
    ('od', 'ओडिशा', 'Odisha', 9591, 22.85), ('mp', 'मध्य प्रदेश', 'Madhya Pradesh', 15317, 21.09),
    ('gj', 'गुजरात', 'Gujarat', 8917, 14.76), ('rj', 'राजस्थान', 'Rajasthan', 9239, 13.48),
    ('ts', 'तेलंगाना', 'Telangana', 3199, 9.0), ('ap', 'आंध्र प्रदेश', 'Andhra Pradesh', 5918, 7.0),
    ('wb', 'पश्चिम बंगाल', 'West Bengal', 5297, 5.8), ('ka', 'कर्नाटक', 'Karnataka', 4249, 7.0),
    ('as', 'असम', 'Assam', 3884, 12.38), ('jk', 'जम्मू-कश्मीर', 'Jammu & Kashmir', 1493, 11.9),
    ('br', 'बिहार', 'Bihar', 1337, 1.28), ('up', 'उत्तर प्रदेश', 'Uttar Pradesh', 1134, 0.57),
    ('mh', 'महाराष्ट्र', 'Maharashtra', 10510, 9.35), ('tn', 'तमिलनाडु', 'Tamil Nadu', 795, 1.1),
    ('kl', 'केरल', 'Kerala', 485, 1.45), ('hp', 'हिमाचल प्रदेश', 'Himachal Pradesh', 392, 5.71),
    ('uk', 'उत्तराखंड', 'Uttarakhand', 292, 2.9), ('sk', 'सिक्किम', 'Sikkim', 206, 33.79),
    ('ga', 'गोवा', 'Goa', 149, 0.05), ('hr', 'हरियाणा', 'Haryana', 0, 0.0), ('pb', 'पंजाब', 'Punjab', 0, 0.0),
]
CG_DISTRICTS = ['बलौदा बाज़ार-भाटापारा', 'बलोद', 'बलरामपुर-रामानुजगंज', 'बस्तर', 'बेमेतरा', 'बीजापुर',
                'बिलासपुर', 'दंतेवाड़ा', 'धमतरी', 'दुर्ग', 'गरीबंद', 'गौरेला-पेंड्रा-मरवाही',
                'जंजगीर-चांपा', 'जशपुर', 'कबीरधाम', 'कांकेर', 'कोंडागांव', 'कोरबा', 'कोरिया',
                'खैरागढ़-छुईखदान-गंडई', 'महासमुंद', 'मनेंद्रगढ़-चिरमिरी-भरतपुर', 'मोहला-मनपुर-अंबागढ़ चौकी',
                'मुंगेली', 'नारायणपुर', 'रायगढ़', 'रायपुर', 'राजनांदगांव', 'सक्ती', 'सारंगढ़-बिलाईगढ़',
                'सुकमा', 'सूरजपुर', 'सरगुजा']
CG_DISTRICTS_EN = ['Baloda Bazar', 'Balod', 'Balrampur-Ramanujganj', 'Bastar', 'Bemetara', 'Bijapur',
                   'Bilaspur', 'Dantewada', 'Dhamtari', 'Durg', 'Gariaband', 'Gaurela-Pendra-Marwahi',
                   'Janjgir-Champa', 'Jashpur', 'Kabeerdham', 'Kanker', 'Kondagaon', 'Korba', 'Koriya',
                   'Khairagarh-Chhuikhadan-Gandai', 'Mahasamund', 'Manendragarh-Chirmiri-Bharatpur',
                   'Mohla-Manpur-Ambagarh Chowki', 'Mungeli', 'Narayanpur', 'Raigarh', 'Raipur',
                   'Rajnandgaon', 'Sakti', 'Sarangarh-Bilaigarh', 'Sukma', 'Surajpur', 'Surguja']
# हस्त-स्रोतित बीज (पिछले शोध-चरण से; हर entity में स्रोत)
MANUAL_SEED = [
    ('district:cg/bastar', 'festival', 'बस्तर दशहरा',
     'माँ दंतेश्वरी परंपरा का 75-दिवसीय विश्व-प्रसिद्ध दशहरा (जगदलपुर) — राजपरिवारागत रस्में, मई से अक्टूबर तक।',
     ['https://en.wikipedia.org/wiki/Bastar_Dussehra']),
    ('district:cg/bastar', 'festival', 'माड़ी मड़ई',
     'बस्तर-क्षेत्र का प्रमुख देव-मेला चक्र (गाँव-गाँव माड़ी/देवगुड़ी मेले)।',
     ['गोंडवाना कैलेंडर ज़ोन-सर्वेक्षण (AGPE 2025 + समुदाय-स्रोत)']),
    ('district:cg/kondagaon', 'belief', 'घोटुल परंपरा (मुरिया)',
     'मुरिया जनजाति का किशोर-सामूहिक गृह; Verrier Elwin ने "The Muria and their Ghotul" (1947) में प्रलेखित किया।',
     ['https://en.wikipedia.org/wiki/Ghotul', 'Verrier Elwin, The Muria and their Ghotul (1947)']),
    ('district:cg/kabirdham', 'place', 'भोरमदेव मंदिर (कवर्धा)',
     'मैकाल पहाड़ियों पर 10वीं-12वीं सदी का शिव-मंदिर समूह — "छत्तीसगढ़ का खजुराहो"।',
     ['https://en.wikipedia.org/wiki/Bhoramdeo_Temple']),
    ('district:ts/adilabad', 'festival', 'नागोबा जतरा (केशलापुर)',
     'इंदरवेल्ली मंडल, केशलापुर में नाग-रूपी पूर्वज-देव की दक्षिण-गोंडवाना की सबसे बड़ी जतरा (माघ/पौष); मेश्रम पुजारी-वंश महापूजा।',
     ['https://en.wikipedia.org/wiki/Nagoba_Jatara', 'तेलंगाना पर्यटन/समाचार रिपोर्टें']),
    ('district:ts/mulugu', 'festival', 'सम्मक्का-सरलम्मा मेदरम जतरा',
     'एशिया की सबसे बड़ी आदिवासी जतरा (कोया परंपरा, द्वि-वार्षिक) — देवी सम्मक्का-सरलम्मा।',
     ['https://en.wikipedia.org/wiki/Sammakka_Saralamma_Jatara']),
    ('district:mp/bhopal', 'festival', 'कचारगढ़ मेला',
     'माँ काली-कंकाली गोंड आदि-शक्तिपीठ पर मध्य प्रदेश का सबसे बड़ा आदिवासी समागम (महाशिवरात्रि से चैत्र तक)।',
     ["Sahapedia — 'Kali Kankali Shrine of Kachargarh: A Gondi Pilgrimage Site'"]),
    ('district:rj/dungarpur', 'place', 'मांगढ़ धाम — आदिवासी जलियाँवाला',
     '17 नवंबर 1913 — गोविंद गुरु के नेतृत्व में ~1500 भील शहीद।',
     ['https://en.wikipedia.org/wiki/Govind_Guru', 'रिसर्च डॉसियर (मांगढ़ 1913, बहु-स्रोत)']),
    ('state:cg', 'festival', 'पोला (बैल-पूजा)',
     'गोंडवाना-क्षेत्र का प्रमुख कृषि-पर्व; बालाघाट में भव्यतम।',
     ['गोंडवाना कैलेंडर ज़ोन-सर्वेक्षण (AGPE 2025 + समुदाय-स्रोत)']),
    ('state:cg', 'festival', 'हरेली',
     'छत्तीसगढ़ का कृषि-नवपल्लव पर्व (श्रावण)।',
     ['गोंडवाना कैलेंडर ज़ोन-सर्वेक्षण (AGPE 2025 + समुदाय-स्रोत)']),
    ('state:cg', 'festival', 'चेरचेरा',
     'फसल-कट के पश्चात दान-पर्व (अगहन-पूस)।',
     ['गोंडवाना कैलेंडर ज़ोन-सर्वेक्षण (AGPE 2025 + समुदाय-स्रोत)']),
    ('state:cg', 'belief', 'परसा पेन पूजा',
     'गोंड परंपरा के महापुरुष-देव परसा पेन की वार्षिक पूजा (मार्गशीर्ष/भादों)।',
     ['गोंडवाना कैलेंडर ज़ोन-सर्वेक्षण (AGPE 2025 + समुदाय-स्रोत)']),
]

def slug(s):
    out, prev = '', ''
    for ch in s:
        if ch.isascii() and ch.isalnum(): out += ch.lower()
        elif ch in ' -_/·': out += '-'
        else: out += ''  # देवनागरी slug में हटाएँ; पढ़ने-योग्य id बनाने के लिए नीचे fallback
        prev = ch
    out = '-'.join([p for p in out.split('-') if p])
    return out

def dslug(state_id, name_hi, name_en=''):
    s = slug(name_en) or slug(state_id + '-' + name_hi) or name_hi
    return f'district:{state_id}/{s}' if False else s  # placeholder (unused)

def norm(s):
    return ''.join(c for c in str(s or '') if not c.isspace()).replace('़', '')

def load(p, default):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return default

def build():
    data = load(RPATH, None)
    if data is None:
        data = {'meta': {'title': 'गोंडवाना क्षेत्र-कोश — राज्य→जिला→तहसील→पोस्ट→पंचायत→गाँव',
                         'levels': LEVELS, 'entity_kinds': KINDS, 'updated': ''},
                'units': []}
    units = {u['id']: u for u in data['units']}

    def unit(uid, level, name_hi, parent=None, name_en='', extra=None):
        if uid not in units:
            u = {'id': uid, 'level': level, 'name_hi': name_hi, 'parent': parent, 'entities': []}
            if name_en: u['name_en'] = name_en
            if extra: u.update(extra)
            units[uid] = u
        return units[uid]

    # 1) राज्य नोड्स
    st_by_name = {}
    for sid, nm, en, pop, pct in STATES:
        unit(f'state:{sid}', 'state', nm, name_en=en,
             extra={'st_population_k_2011': pop, 'st_pct_2011': pct,
                    'source_pop': 'TRTI/जनगणना 2011 ST-सारणी'})
        st_by_name[norm(nm)] = sid
    st_by_name[norm('आंध्र प्रदेश')] = 'ap'

    # 2) छ.ग. के 33 जिले (आधिकारिक सूची)
    for hi, en in zip(CG_DISTRICTS, CG_DISTRICTS_EN):
        did = slug(en)
        unit(f'district:cg/{did}', 'district', hi, parent='state:cg', name_en=en,
             extra={'source_admin': 'छत्तीसगढ़ सरकार — जिला सूची (15 अगस्त 2021 पुनर्गठन सहित)'})

    # 3) हस्त-बीज entities
    for uid, kind, name, desc, srcs in MANUAL_SEED:
        if uid not in units:
            # जिला नोड स्वयं बनाओ (जैसे district:ts/adilabad → parent state:ts)
            _, rest = uid.split(':')
            sid, d = rest.split('/')
            unit(uid, 'district', d, parent='state:' + sid, extra={'source_admin': 'क्रॉलर-बीज'})
        u = units[uid]
        if not any(e['name_hi'] == name for e in u['entities']):
            u['entities'].append({'kind': kind, 'name_hi': name, 'desc_hi': desc,
                                  'sources': srcs, 'added': 'seed', 'verify': False})

    # 4) मौजूदा DB स्वतः लिंक (ref से dedupe)
    heroes = load(os.path.join(APP, 'mahapurush_database.json'), {}).get('persons', [])
    places = load(os.path.join(APP, 'gondwana_places.json'), {}).get('places', [])

    def find_state_district(state, district):
        sid = st_by_name.get(norm(state))
        if not sid: return None, None
        suid = f'state:{sid}'
        did = None
        if district:
            for uid, u in units.items():
                if uid.startswith(f'district:{sid}/') and u.get('parent') == suid:
                    if norm(district) in norm(u['name_hi']) or norm(u['name_hi']) in norm(district):
                        did = uid; break
        return suid, did

    def person_kind(p):
        blob = ' '.join(str(p.get(k, '')) for k in ('first_achievement', 'tags', 'category', 'death', 'name_hi'))
        if any(w in blob for w in ('शहीद', 'शहादत', 'फाँसी', 'बलिदान')): return 'martyr'
        if p.get('category') in ('freedom', 'military', 'collective'): return 'revolutionary'
        return 'person'

    linked = 0
    for p in heroes:
        suid, did = find_state_district(p.get('state'), p.get('district'))
        tgt = did or suid
        if not tgt: continue
        ref = 'mahapurush:' + str(p.get('id'))
        u = units[tgt]
        if not any(e.get('ref') == ref for e in u['entities']):
            u['entities'].append({'kind': person_kind(p), 'name_hi': p.get('name_hi'), 'ref': ref,
                                  'desc_hi': (p.get('first_achievement') or '')[:220],
                                  'sources': list(p.get('sources') or [])[:3] or ['महापुरुष-DB (स्रोतित)'],
                                  'added': 'auto-link', 'verify': False})
            linked += 1
    for p in places:
        suid, did = find_state_district(p.get('state'), p.get('district'))
        tgt = did or suid
        if not tgt: continue
        ref = 'place:' + str(p.get('id'))
        u = units[tgt]
        if not any(e.get('ref') == ref for e in u['entities']):
            u['entities'].append({'kind': 'place', 'name_hi': p.get('name_hi'), 'ref': ref,
                                  'desc_hi': (p.get('significance') or '')[:220],
                                  'sources': list(p.get('sources') or [])[:3] or ['स्थल-DB (स्रोतित)'],
                                  'added': 'auto-link', 'verify': bool(p.get('verify'))})
            linked += 1

    # 5) coverage + js
    data['units'] = sorted(units.values(), key=lambda u: (LEVELS.index(u['level']), u['id']))
    cov = {'states': 0, 'districts': 0, 'tehsils': 0, 'posts': 0, 'panchayats': 0, 'villages': 0, 'entities': 0}
    key = {'state': 'states', 'district': 'districts', 'tehsil': 'tehsils', 'post': 'posts',
           'panchayat': 'panchayats', 'village': 'villages'}
    for u in data['units']:
        cov[key[u['level']]] += 1
        cov['entities'] += len(u['entities'])
    data['meta']['coverage'] = cov
    data['meta']['updated'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    with open(RPATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(JSPATH, 'w', encoding='utf-8') as f:
        f.write('/* क्षेत्र-कोश — gondwana_regions.json से जनित (tools/build_regions.py) */\n')
        f.write('window.GW_REGIONS = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    print(f'[regions] units={len(data["units"])} (states={cov["states"]} districts={cov["districts"]} tehsils={cov["tehsils"]}) entities={cov["entities"]} · auto-linked={linked}')
    return data

if __name__ == '__main__':
    build()
