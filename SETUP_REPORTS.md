# 📥 जन-रिपोर्ट सिस्टम — स्टेप-बाय-स्टेप सेटअप गाइड (शुरुआती-मित्रवत)

कुल समय: ~15-20 मिनट · तीन हिस्से: (A) OAuth Client ID, (B) Apps Script deploy, (C) मान जाँच।
सब कुछ **मुफ़्त** है। एक ही Gmail से करें (सुझाव: gondwanaroots@gmail.com)।

> 🔒 **सुरक्षा-नियम:** `GH_TOKEN` (GitHub पासवर्ड-जैसा) **केवल Apps Script की Script Properties में** डालें — न चैट में, न ईमेल में, न कहीं और। मुझे केवल 2 चीज़ें भेजनी हैं: **Client ID** और **Web app URL** (दोनों सार्वजनिक-सुरक्षित हैं)।

---

## हिस्सा A — Google OAuth Client ID (Gmail साइन-इन हेतु)

1. खोलें: **https://console.cloud.google.com** → अपने Gmail (gondwanaroots@gmail.com) से साइन-इन करें।
2. पहली बार हो तो शर्तें स्वीकार करें (Continue/Agree)।
3. ऊपर बाईं ओर **प्रोजेक्ट ड्रॉपडाउन** (जहाँ "Select a project" लिखा है) → **NEW PROJECT**:
   - Project name: `gondwana-app` → **CREATE** → ऊपर घंटी-आइकन से तैयार होने का इंतज़ार → ड्रॉपडाउन से यही प्रोजेक्ट चुनें।
4. बाएँ मेनू (☰) → **APIs & Services → OAuth consent screen** (नई UI में: **Google Auth Platform → Overview**):
   - **Get Started / Configure** पर क्लिक करें:
     - App name: `गोंडवाना कैलेंडर` · User support email: अपना Gmail · Developer contact: अपना Gmail → Next/Save करते जाएँ।
   - **Audience** खंड: User type = **External** चुनें।
   - **Test users** में अपना Gmail जोड़ें (+ Add users → gondwanaroots@gmail.com) — परीक्षण के लिए।
   - ⚠ बाद में जब सब ठीक चले: Audience → **Publish app** दबाएँ (तभी *आम जनता* रिपोर्ट कर पाएगी; तब तक केवल test-users)।
5. बाएँ मेनू → **Credentials** → ऊपर **+ CREATE CREDENTIALS** → **OAuth client ID**:
   - Application type: **Web application**
   - Name: `gondwana-web`
   - **Authorized JavaScript origins** → + Add URI → बिल्कुल यह डालें: `https://saiyyamdeveloper.github.io`
   - (Authorized redirect URIs खाली छोड़ें)
   - **CREATE** → पॉप-अप में **Client ID** कॉपी करें — यह `xxxxx.apps.googleusercontent.com` जैसा दिखता है। (Secret की ज़रूरत नहीं, उसे बंद कर दें।)

✅ **हिस्सा A पूरा** — Client ID मुझे भेजें (या repo की `report_config.json` → `google_client_id` में पेस्ट करें)।

---

## हिस्सा B — Apps Script deploy (रिपोर्ट-रिसीवर)

1. खोलें: **https://script.google.com** → उसी Gmail से साइन-इन।
2. ऊपर बाएँ **+ New project**।
3. इस repo की फ़ाइल **`tools/apps_script/Code.gs`** खोलें → सारा कोड कॉपी करें → Apps Script एडिटर में जो पहले से `function myFunction() {}` है उसे हटाकर **पेस्ट** करें → 💾 Save (Ctrl+S) → प्रोजेक्ट का नाम `gondwana-reports` रख दें।
4. **GitHub Token बनाना** (यदि पहले वाला याद/सुरक्षित नहीं):
   - https://github.com/settings/tokens → **Generate new token (classic)**
   - Note: `gondwana-reports` · Expiration: 90 दिन (या No expiration) · Scopes: केवल **repo** पर ✓
   - **Generate token** → टोकन कॉपी करें (`ghp_...` या `github_pat_...`) — ⚠ यह किसी को न भेजें।
5. Apps Script में बाएँ मेनू → ⚙️ **Project Settings** → नीचे **Script Properties** → **Add script properties** — ये 4 लाइनें जोड़ें:

   | Property | Value |
   |---|---|
   | `GH_TOKEN` | (चरण 4 वाला टोकन — केवल यहीं!) |
   | `GH_REPO` | `saiyyamdeveloper/Gondwana-Saiyyam-calendar-` |
   | `GH_BRANCH` | `main` |
   | `GOOGLE_CLIENT_ID` | (हिस्सा A वाला Client ID) |

   → **Save script properties**।
6. ऊपर दाएँ **Deploy → New deployment** → बाएँ गियर-आइकन ⚙ → **Web app** चुनें:
   - Description: `v1`
   - **Execute as:** `Me (आपका gmail)`
   - **Who has access:** **Anyone** ← यह ज़रूरी है
   - **Deploy** → पहली बार अनुमति माँगेगा: **Review permissions** → अपना खाता चुनें → *"Google hasn't verified this app"* स्क्रीन पर **Advanced** → **Go to gondwana-reports (unsafe)** → **Allow** (यह आपका ही कोड है, सुरक्षित है)।
7. Deploy होते ही **Web app URL** मिलेगा — `https://script.google.com/macros/s/AKfy.../exec` जैसा। **कॉपी करें।**

✅ **हिस्सा B पूरा** — Web app URL मुझे भेजें (या `report_config.json` → `report_endpoint` में पेस्ट करें)।

> नोट: बाद में Code.gs बदलें तो Deploy → **Manage deployments → ✎ Edit → Version: New → Deploy** करें; URL वही रहता है।

---

## हिस्सा C — जाँच (मैं आपके मान भरने के बाद करूँगा)

1. दोनों मान मिलते ही मैं `report_config.json` भरकर push करूँगा (~2 मिनट में लाइव)।
2. ऐप खोलें → **और → सभी पृष्ठ → ⚠️ गलती रिपोर्ट**:
   - "Google से साइन-इन" नीला बटन दिखेगा → अपने Gmail से साइन-इन → ✅ सत्यापित दिखे।
   - कोई भी प्रविष्टि चुनें → एक फ़ील्ड पर ✓ → सही मान + प्रमाण-URL → **📤 रिपोर्ट भेजें**।
3. ~1 मिनट में एडमिन-पैनल → **📥 जन-रिपोर्ट** दृश्य में रिपोर्ट दिखेगी (Gmail-सत्यापित ✓ बैज, diff-तालिका सहित)।
4. आप ✓ स्वीकार करें → सुधार कतार में → 📦 प्रकाशन → मास्टर-DB में लागू। पूरा लूप पूरा।

## समस्या-निवारण
| लक्षण | कारण/हल |
|---|---|
| साइन-इन पॉप-अप में "access_blocked" | OAuth consent screen की Audience External नहीं / Test user नहीं जोड़ा |
| साइन-इन दिखता ही नहीं | `report_config.json` में client_id खाली, या JavaScript origins में URL गलत (बिल्कुल `https://saiyyamdeveloper.github.io`) |
| रिपोर्ट पर "github 401/403" | GH_TOKEN गलत/समय-समाप्त — नया token बनाकर Script Properties में बदलें |
| रिपोर्ट पर "identity-अमान्य" | GOOGLE_CLIENT_ID property वही नहीं जो report_config.json में है |
| आम लोगों को साइन-इन नहीं मिल रहा | OAuth consent screen पर app अभी Testing में है → **Publish app** करें |
