#!/usr/bin/env python3
"""Link checker (weekly CI job).
JSON डेटाबेसों के sources/स्रोतों में मौजूद http(s) URLs की ज़िंदा-जाँच।
टिप: अधिकांश स्रोत अभी टेक्स्ट-विवरण हैं; जैसे-जैसे URLs जुड़ेंगे, यह उन्हें पकड़ेगा।
Exit 1 यदि कोई URL मृत (>=400) — timeout/403 को warning माना जाता है (बॉट-ब्लॉक आम है)।"""
import json, re, sys, os
import urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
FILES = ['mahapurush_database.json', 'gondwana_places.json', 'extra_data.json']
URL_RE = re.compile(r'https?://[^\s"\'<>,;)\]]+')

urls = set()
for fn in FILES:
    path = os.path.join(APP, fn)
    if not os.path.exists(path):
        continue
    text = open(path, encoding='utf-8').read()
    urls.update(URL_RE.findall(text))

urls = sorted(urls)
if not urls:
    print("कोई URL नहीं मिला — ठीक है (स्रोत टेक्स्ट-रूप में हैं)")
    sys.exit(0)

dead, warned = [], []
for u in urls:
    try:
        req = urllib.request.Request(u, method='HEAD', headers={'User-Agent': 'Mozilla/5.0 (GondwanaApp-CI linkcheck)'})
        with urllib.request.urlopen(req, timeout=15) as r:
            if r.status >= 400:
                dead.append((u, r.status))
    except urllib.error.HTTPError as e:
        if e.code in (403, 405, 429):
            warned.append((u, e.code))
        else:
            # GET fallback once
            try:
                req2 = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (GondwanaApp-CI linkcheck)'})
                with urllib.request.urlopen(req2, timeout=15):
                    pass
            except Exception as e2:
                dead.append((u, str(e2)[:60]))
    except Exception as e:
        warned.append((u, str(e)[:60]))

print(f"links checked={len(urls)} dead={len(dead)} warned={len(warned)}")
for u, s in warned:
    print(f"  ⚠ {u} → {s}")
for u, s in dead:
    print(f"  ✗ DEAD {u} → {s}")
sys.exit(1 if dead else 0)
