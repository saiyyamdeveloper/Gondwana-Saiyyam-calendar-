/** गोंडवाना जन-रिपोर्ट रिसीवर — Google Apps Script
 *  वेब-ऐप के रूप में deploy करें (नीचे SETUP_REPORTS.md देखें)।
 *  कार्य: सार्वजनिक फ़ॉर्म से रिपोर्ट → Google id_token सत्यापन (strict) → GitHub repo में
 *        review/reports.json पर सीधा commit। PAT केवल यहाँ (Script Properties) रहता है।
 *  Script Properties (आवश्यक): GH_TOKEN, GH_REPO (=saiyyamdeveloper/Gondwana-Saiyyam-calendar-),
 *        GH_BRANCH (=main), GOOGLE_CLIENT_ID (वही जो report_config.json में)। */

var FILE = 'review/reports.json';
var MAX_PER_HOUR = 12, MAX_LEN = 4000;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return out({ ok: false, error: 'busy' }); }
  try {
    var p = JSON.parse(e.postData.contents);
    // honeypot + आकार-सीमा
    if (p.hp) return out({ ok: false, error: 'spam' });
    var s = JSON.stringify(p);
    if (s.length > 20000) return out({ ok: false, error: 'too-large' });
    // rate-limit (प्रति-ईमेल/घंटा)
    var email = verifyToken(p.id_token);
    if (!email) return out({ ok: false, error: 'identity-अमान्य — Google साइन-इन आवश्यक' });
    var cache = CacheService.getScriptCache();
    var rk = 'rl-' + email;
    var n = parseInt(cache.get(rk) || '0', 10);
    if (n >= MAX_PER_HOUR) return out({ ok: false, error: 'सीमा — प्रति घंटा अधिकतम ' + MAX_PER_HOUR + ' रिपोर्ट' });
    cache.put(rk, String(n + 1), 3600);
    // रिपोर्ट-आकार
    var rep = {
      id: p.id || ('rpt-' + new Date().getTime().toString(36)),
      ts: new Date().toISOString(),
      status: 'new',
      kind: String(p.kind || 'other').slice(0, 20),
      item_id: String(p.item_id || '').slice(0, 120),
      item_title: String(p.item_title || '').slice(0, 160),
      reporter: { email: email, name: String(p.reporter_name || '').slice(0, 80), verified: true },
      fields: (p.fields || []).slice(0, 12).map(function (f) {
        return { field: String(f.field || '').slice(0, 40), current: String(f.current || '').slice(0, MAX_LEN), proposed: String(f.proposed || '').slice(0, MAX_LEN) };
      }),
      new_entry: p.new_entry || null,
      wrong_note: String(p.wrong_note || '').slice(0, MAX_LEN),
      evidence: (p.evidence || []).slice(0, 5).map(function (u) { return String(u).slice(0, 300); }),
      admin_note: '', decided_by: null, decided_at: null
    };
    if (!rep.evidence.length) return out({ ok: false, error: 'प्रमाण-स्रोत अनिवार्य' });
    if (!rep.fields.length && !rep.new_entry && !rep.wrong_note) return out({ ok: false, error: 'रिपोर्ट खाली' });
    // GitHub पर commit
    var props = PropertiesService.getScriptProperties();
    var tok = props.getProperty('GH_TOKEN'), repo = props.getProperty('GH_REPO'), br = props.getProperty('GH_BRANCH') || 'main';
    if (!tok || !repo) return out({ ok: false, error: 'server-config अधूरा' });
    var H = { 'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.github+json' };
    var url = 'https://api.github.com/repos/' + repo + '/contents/' + FILE + '?ref=' + br;
    var sha = null, data = { meta: { title: 'जन-रिपोर्ट इनबॉक्स' }, reports: [] };
    var g = UrlFetchApp.fetch(url, { headers: H, muteHttpExceptions: true });
    if (g.getResponseCode() === 200) {
      var cur = JSON.parse(g.getContentText());
      sha = cur.sha;
      try { data = JSON.parse(Utilities.newBlob(cur.content).getDataAsString()); } catch (x) {}
    }
    data.reports = data.reports || [];
    data.reports.unshift(rep);
    if (data.reports.length > 500) data.reports = data.reports.slice(0, 500);
    data.meta.updated = new Date().toISOString();
    var body = {
      message: 'जन-रिपोर्ट: ' + rep.kind + ' — ' + rep.item_title + ' (' + email + ')',
      content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(data, null, 1)).getBytes()),
      branch: br
    };
    if (sha) body.sha = sha;
    var r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + FILE, {
      method: 'post', headers: H, contentType: 'application/json',
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200 || r.getResponseCode() === 201) return out({ ok: true, id: rep.id });
    return out({ ok: false, error: 'github ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200) });
  } catch (err) {
    return out({ ok: false, error: String(err).slice(0, 200) });
  } finally { lock.releaseLock(); }
}

/** id_token सत्यापन: tokeninfo से aud+exp+email — strict पहचान */
function verifyToken(token) {
  if (!token) return null;
  var props = PropertiesService.getScriptProperties();
  var cid = props.getProperty('GOOGLE_CLIENT_ID');
  try {
    var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    var d = JSON.parse(r.getContentText());
    if (cid && d.aud !== cid) return null;
    if (!d.email || d.email !== (d.email || '').toLowerCase()) return null;
    if (d.email_verified !== true && d.email_verified !== 'true') return null;
    return d.email;
  } catch (e) { return null; }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
