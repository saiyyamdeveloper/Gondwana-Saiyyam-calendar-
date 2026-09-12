#!/usr/bin/env python3
"""स्व-सत्यापन इंजन — परत 2: LLM गहरी research + citation-ढाल
repo-secrets: LLM_PROVIDER (gemini|openai), LLM_API_KEY — न हों तो चुपचाप skip।
प्रवाह: प्रविष्टि+परत-1 सबूत → LLM structured verdict + उद्धरण-URL →
दूसरा पास हर URL को खुद खोलकर जाँचता है कि दावा सच में पन्ने पर है (verify-the-verifier)।
नतीजा evidence-फ़ाइल के 'llm' खंड में। BATCH सीमित (कोटा/समय)।"""
import json, os, re, sys, urllib.request, urllib.error, datetime

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV_DIR = os.path.join(APP, 'review', 'evidence')
QUEUE_F = os.path.join(APP, 'review', 'pending.json')
BATCH = 8
UA = {'User-Agent': 'GondwanaCalendarBot/1.0 (verification citation-check)'}

def fetch_text(u, n=300000):
    try:
        req = urllib.request.Request(u, headers=dict(UA, Accept='text/html,*/*'))
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read(n).decode('utf-8', 'replace')
        txt = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', html, flags=re.S | re.I)
        txt = re.sub(r'<[^>]+>', ' ', txt)
        return re.sub(r'\s+', ' ', txt).lower()
    except Exception:
        return ''

def _chat(url, key, model, prompt, extra=None):
    hdr = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key}
    if extra: hdr.update(extra)
    base = {'model': model, 'temperature': 0.2, 'messages': [{'role': 'user', 'content': prompt}]}
    for with_rf in (True, False):   # कुछ मॉडल response_format नहीं लेते → fallback
        p = dict(base)
        if with_rf: p['response_format'] = {'type': 'json_object'}
        try:
            req = urllib.request.Request(url, data=json.dumps(p).encode(), headers=hdr)
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
            return d['choices'][0]['message']['content']
        except urllib.error.HTTPError as e:
            if with_rf and e.code in (400, 422): continue
            raise

def ask_llm(prompt):
    prov = os.environ.get('LLM_PROVIDER', 'gemini').lower()
    key = os.environ.get('LLM_API_KEY', '')
    body = None
    if prov == 'openrouter':
        return _chat('https://openrouter.ai/api/v1/chat/completions', key,
                     os.environ.get('LLM_MODEL', 'openai/gpt-4o-mini'), prompt,
                     {'X-Title': 'Gondwana-Satyapan-Panel'})
    if prov == 'gemini':
        url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}'
        body = json.dumps({'contents': [{'parts': [{'text': prompt}]}],
                           'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.2}}).encode()
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        return d['candidates'][0]['content']['parts'][0]['text']
    else:
        return _chat('https://api.openai.com/v1/chat/completions', key, 'gpt-4o-mini', prompt)


PROMPT = """तुम भारतीय आदिवासी इतिहास-सत्यापन सहायक हो। नीचे दी कतार-प्रविष्टि पर गहरी research-समीक्षा करो और केवल JSON लौटाओ:
{"verdict":"pass|fail|inconclusive","confidence":0-100,"summary_hi":"2-3 पंक्ति हिंदी सारांश",
"claims":[{"claim":"जाँचा गया दावा (हिंदी)","urls":["समर्थक वेब-URL"]}],
"red_flags":["संदिग्ध बातें या खाली"]}
नियम: हर claim के साथ कम-से-कम एक वास्तविक, सार्वजनिक URL दो जिसे तुमने सच में देखा/जाना हो; कल्पित URL वर्जित। अनिश्चय हो तो inconclusive।
प्रविष्टि: {item}
परत-1 (विकिपीडिया/विकिडेटा) पूर्व-सबूत: {layer1}"""

def main():
    if not os.environ.get('LLM_API_KEY'):
        print('llm: LLM_API_KEY secret नहीं — परत-2 छोड़ी (परत-1 जारी रहेगी)'); return 0
    queue = json.load(open(QUEUE_F, encoding='utf-8'))['queue']
    index_p = os.path.join(EV_DIR, 'index.json')
    index = json.load(open(index_p, encoding='utf-8')) if os.path.exists(index_p) else {}
    prio = {'conflict': 0, 'nosource': 1, 'weak': 2, 'partial': 3, 'pass': 4}
    todo = [q for q in queue if q['status'] == 'pending']
    todo.sort(key=lambda q: prio.get((index.get(q['id']) or {}).get('verdict', 'nosource'), 5))
    done = 0
    for item in todo[:BATCH]:
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', item['id'])
        ef = os.path.join(EV_DIR, safe + '.json')
        if not os.path.exists(ef): continue
        ev = json.load(open(ef, encoding='utf-8'))
        if (ev.get('llm') or {}).get('checked_at'): continue
        try:
            raw = ask_llm(PROMPT.format(item=json.dumps(item, ensure_ascii=False)[:3000],
                                        layer1=json.dumps({k: ev[k] for k in ('score', 'verdict', 'checks')}, ensure_ascii=False)[:2500]))
            res = json.loads(re.sub(r'^```(?:json)?|```$', '', raw.strip()))
        except Exception as e:
            print('llm: विफल', item['id'], e); continue
        # citation-ढाल: हर उद्धरण-URL को खुद जाँचो
        for cl in res.get('claims', [])[:4]:
            checked = []
            for u in (cl.get('urls') or [])[:2]:
                page = fetch_text(u)
                toks = [t for t in re.split(r'\s+', cl.get('claim', '')) if len(t) > 4][:5]
                hit = sum(1 for t in toks if t.lower() in page) if (page and toks) else 0
                ratio = hit / len(toks) if toks else 0
                checked.append({'url': u, 'reachable': bool(page), 'claim_support_ratio': round(ratio, 2),
                                'shield': 'verified' if ratio >= 0.6 else 'unverified'})
            cl['shield'] = checked
        ev['llm'] = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'provider': os.environ.get('LLM_PROVIDER', 'gemini'), **res}
        json.dump(ev, open(ef, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        shields = [c.get('shield', []) for c in res.get('claims', [])]
        nv = sum(1 for grp in shields for c in grp if isinstance(c, dict) and c.get('shield') == 'verified')
        index.setdefault(item['id'], {})['llm'] = {'verdict': res.get('verdict'), 'confidence': res.get('confidence'), 'verified_citations': nv}
        done += 1
        print(f"  llm {item['id']}: {res.get('verdict')} conf={res.get('confidence')} verified-citations={nv}")
    json.dump(index, open(index_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('llm-research:', done, 'प्रविष्टियाँ')
    return 0

if __name__ == '__main__':
    sys.exit(main())
