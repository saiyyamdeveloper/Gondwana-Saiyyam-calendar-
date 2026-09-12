# 🪔 गोंडवाना कैलेंडर — Gondwana Calendar PWA

[![Gondwana CI — स्वचालित निरीक्षण](https://github.com/saiyyamdeveloper/Gondwana-Saiyyam-calendar-/actions/workflows/ci.yml/badge.svg)](https://github.com/saiyyamdeveloper/Gondwana-Saiyyam-calendar-/actions/workflows/ci.yml)
[![Pages](https://img.shields.io/badge/GitHub_Pages-live-brightgreen)](https://saiyyamdeveloper.github.io/Gondwana-Saiyyam-calendar-/)

**🌐 लाइव ऐप (Live):** <https://saiyyamdeveloper.github.io/Gondwana-Saiyyam-calendar-/> — *फ़ोन में खोलें → Chrome मेनू → "Install app" / "Add to Home screen" → ऑफ़लाइन चलेगा*

गोंडी माह, दृक्-पंचांग, पर्व, देवस्थल-नक्शा, मसराम गोंडी लिपि-कन्वर्टर, **आदिवासी महापुरुष डेटाबेस (60)** और **स्थल-कोश GPS सहित (45)** — एक ही ऑफ़लाइन ऐप में।

> A fully offline, **zero-dependency** Progressive Web App for the Gondwana calendar (Masram Gondi script), built from primary research — no external APIs, no build step, no tracking.

---

## 📑 विषय-सूची / Contents
- [फ़ीचर](#-फ़ीचर--features)
- [7 टैब](#-7-टैब)
- [स्वचालित निरीक्षण (Automation)](#-स्वचालित-निरीक्षण-automation)
- [फ़ाइल-संरचना](#-फ़ाइल-संरचना)
- [स्थानीय जाँच](#-स्थानीय-जाँच)
- [खगोल-इंजन](#-खगोल-इंजन-दृक्-पंचांग)
- [डेटा-नीति](#-डेटा-नीति-data-honesty)
- [स्रोत](#-स्रोत--sources)
- [योगदान](#-योगदान--contributing)
- [लाइसेंस](#-लाइसेंस--license)

---

## ✨ फ़ीचर / Features

| | फ़ीचर | विवरण |
|---|---|---|
| 🗓️ | **3-परत कैलेंडर** | Gregorian + गोंडी माह (Akadi…Bud Bhavai) + दृक्-पंचांग — एक ही ग्रिड में |
| 🌙 | **स्वनिर्मित पंचांग-इंजन** | तिथि · नक्षत्र · राशि (गोंडी नाम सहित) · ऋतु · चंद्र-कला SVG · सूर्योदय/सूर्यास्त · **धोंडा (अधिक मास)** |
| 🪔 | **53 पर्व** | क्षेत्रानुसार (14 शहर), स्रोत-टैग, verify-फ़्लैग, समुदाय-घोषित जतराएँ (मेदरम, केशलापुर) |
| 🗺️ | **गोंडवाना नक्शा** | 4 ज़ोन (उत्तर/पश्चिम/दक्षिण/पूर्व) + 13 देवस्थल-पिन + दूरी/दिशा (haversine) + geolocation |
| 🧑🏽‍🤝‍🧑🏽 | **महापुरुष डेटाबेस** | 60 सत्यापित आदिवासी महापुरुष एवं महांगनाएँ, 9 श्रेणियाँ, "आज का नायक/नायिका" रोटेशन |
| 📍 | **स्थल-कोश (GPS)** | 45 धार्मिक/शहीदी/स्मारक/ऐतिहासिक स्थल — 12 राज्य, GPS + Google Maps लिंक + चुने क्षेत्र से दूरी |
| 🔤 | **मसराम गोंडी** | Unicode U+11D00–11D5F कन्वर्टर + संख्या-कन्वर्टर + लिपि-चार्ट + शब्दावली (Noto फ़ॉन्ट बंडल, 15 KB) |
| 📴 | **पूर्ण ऑफ़लाइन PWA** | manifest + service worker → होम-स्क्रीन इंस्टॉल, बिना इंटरनेट चलता है |
| 🔔 | **सूचनाएँ** | कल के पर्व/पूनम/अमावस की Web Notification |
| 🆘 | **हेल्पलाइन** | NALSA 15100 · NCST 1800-11-7777 · 112/181/1098 · VSS भोपाल |

## 🧭 7 टैब
`कैलेंडर` · `पर्व` · `पंचांग` · `नक्शा` · `महापुरुष` · `स्थल` · `सीखें`

---

## 🤖 स्वचालित निरीक्षण (Automation)

यह repo **खुद अपनी जाँच करता है** — तीन परतों में:

**परत 1 — रनटाइम सेल्फ-चेक** ([`validate.js`](validate.js))
हर बार ऐप खुलने पर **1051 जाँच** चलती हैं (ऑफ़लाइन, बिना DOM):
- डेटा-अखंडता: duplicate-ID, आवश्यक फ़ील्ड, `sources[]` अनिवार्य, जन्म ≤ निधन, category/gps_precision वैधता, GPS भारत-सीमा (6–38°N, 67–99°E), फ़ोटो↔लाइसेंस-स्रोत युग्म, `map_pin_id` अस्तित्व
- **इंजन anchor-tests**: सत्यापित पर्व-तिथियाँ (दशहरा 2026-10-20, दीपावली 2026-11-09, पुनाल साल 2026-03-19…) + अधिक-मास 2023/2026
- विफलता पर ऐप चलता रहता है (graceful fallback) + यूज़र को ⚠ toast, विवरण कंसोल में

**परत 2 — CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
- हर push/PR: `validate_node.js` + `smoke.js` (सभी 7 टैब रेंडर) + `check_csv_sync.py` → गलत डेटा **publish ही नहीं होगा**
- हर सोमवार 03:30 UTC: `check_links.py` — मरे हुए स्रोत-लिंक पकड़ता है

**परत 3 — समीक्षा-चक्र** ([`tools/make_review_checklist.py`](tools/make_review_checklist.py))
[`REVIEW_CHECKLIST.md`](REVIEW_CHECKLIST.md) auto-generate होती है: कौन-से तथ्य verify-बाकी हैं, कितनी फ़ोटो जोड़नी हैं, किन समुदाय-घोषित जतरों की तिथि-पुष्टि करनी है। सत्यापन होते ही सूची छोटी होती जाती है।

> ✅ **स्थिति:** परत 1 (runtime self-check) ऐप में सक्रिय · परत 2 (CI) [`Actions`](https://github.com/saiyyamdeveloper/Gondwana-Saiyyam-calendar-/actions) में हरा — हर push पर 1051 जाँच + smoke test + CSV-sync · परत 3 [`REVIEW_CHECKLIST.md`](REVIEW_CHECKLIST.md) तैयार · GitHub Pages लाइव।

> 🐛 **इसने पकड़ा हुआ पहला बग:** `monthInfoAtJD` में अधिक-मास की जाँच *पिछली* अमावस्या से तुलना करती थी — असली अधिक माह सामान्य दिखता था और अगला निज-माह "अधिक" बन जाता। FIX: अगली अमावस्या से तुलना। अब अधिक श्रावण 2023 (18 जुलाई–16 अगस्त) और अधिक ज्येष्ठ 2026 (17 मई–15 जून) दोनों सही पहचाने जाते हैं।

---

## 📁 फ़ाइल-संरचना

```
index.html  styles.css  app.js        → UI (7 टैब, शीट, नोटिफिकेशन)
engine.js                              → खगोल/पंचांग इंजन (Meeus/Duffett-Smith)
converter.js                           → मसराम गोंडी लिपि-कन्वर्टर
validate.js                            → ⚙️ सेल्फ-चेक (परत 1)
data.js                                → GW_DATA + GW_EXTRA + GW_HEROES + GW_PLACES
extra_data.json                        → पर्व/पिन/शहर/टाइमलाइन स्रोत-डेटा
mahapurush_database.json               → 60 महापुरुष (मास्टर)
gondwana_places.json                   → 45 स्थल GPS सहित (मास्टर)
*.csv                                  → Excel-रेडी एक्सपोर्ट (UTF-8 BOM)
test/     tools/     .github/          → परीक्षण, जनरेटर, CI
NotoSansMasaramGondi.woff2             → Masram Gondi फ़ॉन्ट (लोकल)
APP_BUILD.md                           → बिल्ड डॉसियर · REVIEW_CHECKLIST.md → समीक्षा-सूची
```

## 🧪 स्थानीय जाँच

```bash
node test/smoke.js           # सभी 7 टैब रेंडर + इंजन stress (कोई dependency नहीं)
node test/validate_node.js   # 1051 डेटा-जाँच — exit 1 = विफल
python3 test/check_csv_sync.py           # CSV ↔ JSON मेल
python3 tools/make_review_checklist.py   # समीक्षा-सूची बनाएँ
```

कोई `npm install` नहीं चाहिए — शुद्ध Node + Python3।

## 🔭 खगोल-इंजन (दृक्-पंचांग)
- सूर्य/चंद्र देशांतर: Meeus + Duffett-Smith सन्निकटन (±1 मिनट स्तर)
- तिथि सूर्योदय-आधारित (उदय-तिथि); दशहरा → अपराह्न-व्यापिनी; जन्माष्टमी/शिवरात्रि → निशिथ-व्यापिनी
- अमावस्या: न्यू-मून moment bisection; अधिक मास: दो अमावस्याओं के बीच संक्रांति न हो → **धोंडा/घोड़ा**
- क्षय-तिथि fallback; अमांत ↔ गोंडी माह मानचित्रण (चैत्र = Chaith … ज्येष्ठ = Bud Bhavai)

## 📏 डेटा-नीति (Data honesty)
1. **कोई गढ़ंत तथ्य नहीं** — हर प्रविष्टि में `sources[]` अनिवार्य (CI इसी की जाँच करता है)
2. अनिश्चित तथ्य → `verify:true` → ऐप में ⚠ बैज; फ़ील्ड-सत्यापन के बाद ही हटता है
3. **फ़ोटो केवल PD/CC** लाइसेंस-जाँच के बाद (अभी सभी `photo:null` — जान-बूझकर)
4. GPS पर `gps_precision` लेबल: exact / approximate / city-level / region-level
5. असत्यापित नाम जोड़े नहीं गए (स्रोत मिलने पर ही)

## 📚 स्रोत / Sources
- Vahia & Halkare — *Gonds of Central India* (arXiv:1306.2416)
- Unicode **L2/15-090R** — Masram Gondi script proposal
- AGPE *रॉयल गोंडवाना रिसर्च जर्नल* 2025 (गोंडी माह तालिका)
- गोंड समाज महासभा म.प्र. — छपा गोंडी कैलेंडर 2026 (बालाघाट/मंडला)
- Registrar General of India — ST-2011 जनगणना सारणी; PIB ISFR (वन-आँकड़े)
- द्रिक पंचांग एवं समाचार स्रोत (verify-फ़्लैग सहित)

## 🤝 योगदान / Contributing
1. नई प्रविष्टि जोड़ने से पहले [`REVIEW_CHECKLIST.md`](REVIEW_CHECKLIST.md) और डेटा-नीति पढ़ें
2. JSON मास्टर में बदलें → CSV दोबारा export करें → `data.js` rebuild करें
3. `sw.js` का cache-version bump करें (वरना पुराना ऑफ़लाइन-कैश दिखेगा)
4. **बिना स्रोत के PR स्वीकार नहीं होंगे** — CI भी यही जाँचता है

## 📜 लाइसेंस / License
- **डेटा**: CC-BY-SA 4.0 भावना-अनुरूप — स्रोत-सहित पुनर्वितरण स्वागत है
- **कोड**: MIT
- **फ़ॉन्ट**: Noto Sans Masaram Gondi — SIL Open Font License

## 🧭 आगे की योजना
[`FUTURE_PLAN.md`] में दर्ज — लक्ष्य: 1000–3000 महापुरुष + 705 जनजातियाँ + स्मारक-इंडेक्स = *भारत का सबसे बड़ा आदिवासी ज्ञानकोश* (विकिपीडिया-क्लोन नहीं, स्रोत-अनुशासित संपादित कोश)।

---
बनाया गया ❤️ के साथ गोंडवाना की विरासत हेतु · **पुकार — जोहार!**
