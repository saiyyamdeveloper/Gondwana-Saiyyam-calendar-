# 📥 जन-रिपोर्ट सिस्टम — सेटअप गाइड (एकबारगी, ~15 मिनट)

चार चीज़ें चाहिए: (1) Google OAuth Client-ID, (2) Apps Script deploy, (3) Script Properties, (4) URL ऐप में।

## चरण 1 — Google OAuth Client ID (Gmail साइन-इन हेतु)
1. https://console.cloud.google.com → नया प्रोजेक्ट (जैसे `gondwana-app`)।
2. **APIs & Services → OAuth consent screen**: External, ऐप-नाम भरें, अपने Gmail को *Test user* में जोड़ें (publish नहीं करना पड़ेगा)।
3. **Credentials → Create Credentials → OAuth client ID**:
   - Type: **Web application**
   - Authorized JavaScript origins: `https://saiyyamdeveloper.github.io`
4. बनी **Client ID** कॉपी करें → repo की `report_config.json` में `google_client_id` में डालें (या मुझे दें)।

## चरण 2 — Apps Script deploy (रिपोर्ट-रिसीवर)
1. https://script.google.com → **New project** → `Code.gs` का पूरा कोड `tools/apps_script/Code.gs` (repo) से पेस्ट करें।
2. **Project Settings → Script Properties** में 4 property:
   | Property | Value |
   |---|---|
   | `GH_TOKEN` | आपका GitHub PAT (repo contents:write — वही जो पैनल-प्रकाशन में प्रयोग होता है) |
   | `GH_REPO` | `saiyyamdeveloper/Gondwana-Saiyyam-calendar-` |
   | `GH_BRANCH` | `main` |
   | `GOOGLE_CLIENT_ID` | चरण-1 वाली Client ID |
3. **Deploy → New deployment → Web app**:
   - Execute as: **Me** · Who has access: **Anyone**
4. Deploy के बाद मिला **Web app URL** कॉपी करें → `report_config.json` में `report_endpoint` में डालें (या मुझे दें)।

## चरण 3 — जाँच
- ऐप → **गलती रिपोर्ट** टैब → "Google से साइन-इन" बटन दिखना चाहिए (client-id मिलते ही)।
- एक परीक्षण-रिपोर्ट भेजें → एडमिन-पैनल → **📥 जन-रिपोर्ट** दृश्य में ~1 मिनट में दिखे (repo commit होता है)।
- बिना साइन-इन रिपोर्ट बटन निष्क्रिय रहेगा (strict नीति)।

## सुरक्षा-टिप्पणियाँ (पारदर्शिता)
- PAT सिर्फ़ Apps Script की Script Properties में — न ऐप में, न पैनल में, न चैट में।
- हर रिपोर्ट का Google id_token **सर्वर-साइड सत्यापन** (tokeninfo: aud+exp+email_verified) — नकली ईमेल असंभव।
- Rate-limit: 12 रिपोर्ट/घंटा/ईमेल + honeypot + आकार-सीमा।
- स्वीकार/अस्वीकार व सुधार-लागू करना केवल एडमिन-पैनल से (आपका लॉगिन: Gmail साइन-इन या पासवर्ड)।

## गोपनीयता
रिपोर्ट-कर्ता का Gmail पता केवल सत्यापन व audit हेतु `review/reports.json` में संग्रहित होता है; सार्वजनिक ऐप में कभी प्रदर्शित नहीं होता (एडमिन-दृश्य मात्र)।
