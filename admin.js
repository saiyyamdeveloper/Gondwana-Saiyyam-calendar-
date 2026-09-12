/* ============ गोंडवाना एडमिन पैनल — admin.js ============
   सत्यापन-कतार: शहीद/महापुरुष/क्रांतिकारी/पर्व/स्थल → एडमिन जाँच → प्रकाशन।
   सुरक्षा-मॉडल: repo में केवल SHA-256(salt+password) hash; plaintext कभी नहीं।
   प्रकाशन: (a) फ़ाइल-बंडल डाउनलोड, (b) GitHub Contents API से सीधे push (PAT केवल सत्र में)। */
(function () {
  'use strict';
  const OWNER = 'saiyyamdeveloper', REPO = 'Gondwana-Saiyyam-calendar-', BRANCH = 'main';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND_HI = { person: 'महापुरुष/शहीद', photo: 'फ़ोटो-लाइसेंस', place: 'स्थल/GPS', festival: 'पर्व', announcement: 'घोषित तिथि' };

  let CREDS = null, QUEUE = [], DECISIONS = [], SESSION = null, CREDS_DIRTY = false;
  let qFilter = 'all', qSearch = '';
  let MEDIA = [], MAN_META = {}, MEDIA_DIRTY = false;
  let mdStatus = 'candidate', mdType = 'all', mdSearch = '';
  const TYPE_HI = { image: 'इमेज', audio: 'ऑडियो/voice', song: 'गीत', video: 'वीडियो', doc: 'दस्तावेज़', other: 'अन्य' };
  const STATUS_HI = { candidate: '⏳ सत्यापन-प्रतीक्षित', verified: '✅ सत्यापित', rejected: '❌ अस्वीकृत' };
  const LICENSE_HI = { own: 'स्वयं का', PD: 'public domain', 'CC-BY': 'CC-BY', 'CC-BY-SA': 'CC-BY-SA', 'copyright-pending': 'कॉपीराइट-जाँच बाकी', unknown: 'अज्ञात' };

  /* ---------- crypto helpers ---------- */
  async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function randomPass(n) {
    n = n || 14;
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const arr = new Uint32Array(n + 3);
    crypto.getRandomValues(arr);
    let p = ''; for (let i = 0; i < n; i++) p += alpha[arr[i] % alpha.length];
    p += '!@#$%*'[arr[n] % 6];
    p += String(10 + (arr[n + 1] % 90));
    return p;
  }
  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function plus30() { const d = new Date(Date.now() + 30 * 864e5); return d.toISOString().slice(0, 10); }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function logLine(msg) {
    const box = $('#pub-log'); box.classList.remove('hidden');
    $('#adm-log').textContent += msg + '\n';
    $('#adm-log').scrollTop = 1e6;
  }

  /* ---------- boot ---------- */
  async function init() {
    try {
      const [cr, pq, dj, mf] = await Promise.all([
        fetch('admin-credentials.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('review/pending.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('review/decisions.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('media/manifest.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      ]);
      CREDS = cr; QUEUE = pq.queue || []; DECISIONS = dj.decisions || [];
      if (mf) { MAN_META = mf.meta || {}; MEDIA = mf.items || []; }
    } catch (e) {
      $('#lg-err').textContent = 'डेटा लोड विफल: ' + e.message; $('#lg-err').classList.remove('hidden');
      return;
    }
    const saved = sessionStorage.getItem('gw-admin-session');
    if (saved) { try { SESSION = JSON.parse(saved); } catch (e) { SESSION = null; } }
    if (SESSION && accountOf(SESSION.email)) showApp(); else { SESSION = null; }
    $('#lg-btn').onclick = doLogin;
    $('#lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }
  function accountOf(email) { return CREDS.accounts.find(a => a.email.toLowerCase() === String(email || '').trim().toLowerCase()); }

  async function doLogin() {
    const email = $('#lg-email').value.trim(), pw = $('#lg-pass').value;
    const err = $('#lg-err'); err.classList.add('hidden');
    const acc = accountOf(email);
    if (!acc || !pw) { err.textContent = '✗ ईमेल या पासवर्ड गलत।'; err.classList.remove('hidden'); return; }
    const hh = await sha256hex(CREDS.salt + pw);
    if (hh !== acc.hash) { err.textContent = '✗ ईमेल या पासवर्ड गलत।'; err.classList.remove('hidden'); return; }
    if (acc.expires && acc.expires < todayStr()) {
      err.textContent = '⚠ पासवर्ड ' + acc.expires + ' को समाप्त हो चुका — सुपर-एडमिन से रोटेशन कराएँ (या मासिक Gmail रोटेशन-मेल देखें)।';
      err.classList.remove('hidden'); return;
    }
    SESSION = { email: acc.email, role: acc.role, loginAt: new Date().toISOString() };
    sessionStorage.setItem('gw-admin-session', JSON.stringify(SESSION));
    showApp();
  }

  /* ---------- panel ---------- */
  function showApp() {
    $('#adm-login').classList.add('hidden');
    $('#adm-app').classList.remove('hidden');
    const acc = accountOf(SESSION.email);
    $('#adm-role').textContent = acc.role === 'superadmin' ? 'सुपर-एडमिन' : 'एडमिन';
    $('#adm-role').className = 'role-badge role-' + acc.role;
    $('#adm-user').textContent = SESSION.email;
    $('#adm-logout').onclick = () => { sessionStorage.removeItem('gw-admin-session'); sessionStorage.removeItem('gw-pat'); location.reload(); };
    if (acc.role === 'superadmin') $('#adm-super').classList.remove('hidden');
    $('#q-search').oninput = () => { qSearch = $('#q-search').value.trim().toLowerCase(); drawQueue(); };
    $('#pub-preview').onclick = previewChanges;
    $('#pub-download').onclick = downloadBundle;
    $('#na-add') && ($('#na-add').onclick = addCandidate);
    $('#acc-add').onclick = addAccount;
    $('#acc-rotate').onclick = rotateAll;
    const savedPat = sessionStorage.getItem('gw-pat');
    if (savedPat) $('#pub-pat').value = savedPat;
    $('#pub-pat').oninput = () => sessionStorage.setItem('gw-pat', $('#pub-pat').value.trim());
    $('#pub-push').onclick = pushToGitHub;
    drawStats(); drawFilters(); drawQueue(); drawDecisions(); initStorage();
  }

  function pending() { return QUEUE.filter(q => q.status === 'pending'); }
  function drawStats() {
    const c = {};
    pending().forEach(q => c[q.kind] = (c[q.kind] || 0) + 1);
    const done = QUEUE.length - pending().length;
    $('#adm-stats').innerHTML =
      `<div class="st"><b>${pending().length}</b><span>समीक्षा-बाकी</span></div>` +
      Object.keys(KIND_HI).map(k => `<div class="st"><b>${c[k] || 0}</b><span>${KIND_HI[k]}</span></div>`).join('') +
      `<div class="st"><b>${done}</b><span>इस सत्र/फ़ाइल में निर्णीत</span></div>`;
  }
  function drawFilters() {
    let html = `<button class="chip ${qFilter === 'all' ? 'active' : ''}" data-k="all">सभी</button>`;
    for (const k in KIND_HI) html += `<button class="chip ${qFilter === k ? 'active' : ''}" data-k="${k}">${KIND_HI[k]}</button>`;
    $('#q-filters').innerHTML = html;
    $$('#q-filters .chip').forEach(b => b.onclick = () => { qFilter = b.dataset.k; drawFilters(); drawQueue(); });
  }
  function drawQueue() {
    let list = pending();
    if (qFilter !== 'all') list = list.filter(q => q.kind === qFilter);
    if (qSearch) list = list.filter(q => (q.title + ' ' + (q.subtitle || '') + ' ' + (q.reason || '') + ' ' + (q.subtype || '')).toLowerCase().includes(qSearch));
    $('#q-count').textContent = list.length + ' प्रविष्टियाँ दिखाई जा रही हैं';
    $('#q-list').innerHTML = list.slice(0, 120).map(q => `
      <div class="q-card" data-id="${esc(q.id)}">
        <span class="kind-badge k-${q.kind}">${KIND_HI[q.kind] || q.kind}${q.subtype && q.subtype !== q.kind ? ' · ' + esc(q.subtype) : ''}</span>
        <span class="q-title">${esc(q.title)}</span>
        <div class="q-sub">${esc(q.subtitle || '')} · जोड़ा: ${esc(q.added)} (${esc(q.added_by || '')})</div>
        <div class="q-reason">⚠ ${esc(q.reason || '')}</div>
        <div class="q-actions">
          <button class="btn ok sm" data-act="approve">✓ स्वीकृत</button>
          <button class="btn bad sm" data-act="reject">✗ अस्वीकृत</button>
          <button class="btn ghost sm" data-act="edit">✎ payload देखें/संपादित</button>
        </div>
        <div class="q-payload"><textarea spellcheck="false">${esc(JSON.stringify(q.payload, null, 1))}</textarea>
          <div class="q-actions"><button class="btn sm" data-act="save">💾 सहेजें</button><span class="muted small">संपादन के बाद स्वीकृत करें — स्वीकृत payload ही मास्टर में जाएगा।</span></div>
        </div>
      </div>`).join('') || '<div class="card"><p class="muted">🎉 कोई समीक्षा-बाकी प्रविष्टि नहीं!</p></div>';
    $$('#q-list .q-card').forEach(card => {
      const q = QUEUE.find(x => x.id === card.dataset.id);
      card.querySelector('[data-act=approve]').onclick = () => decide(q, 'approved');
      card.querySelector('[data-act=reject]').onclick = () => {
        const r = prompt('अस्वीकृति का कारण (audit-log में दर्ज होगा):', 'स्रोत अपर्याप्त');
        if (r !== null) decide(q, 'rejected', r);
      };
      const pe = card.querySelector('[data-act=edit]'), pl = card.querySelector('.q-payload');
      pe.onclick = () => pl.classList.toggle('open');
      card.querySelector('[data-act=save]').onclick = () => {
        try {
          q.payload = JSON.parse(pl.querySelector('textarea').value);
          if (q.payload.name_hi) q.title = q.payload.name_hi;
          if (q.payload.deva) q.title = q.payload.deva;
          q.edited = true; toastLine('payload सहेजा गया ✓'); drawQueue();
        } catch (e) { alert('JSON अमान्य: ' + e.message); }
      };
    });
  }
  function toastLine(m) { const el = $('#q-count'); el.textContent = m; }

  function decide(q, status, note) {
    q.status = status;
    q.decided_by = SESSION.email + ' (' + SESSION.role + ')';
    q.decided_at = new Date().toISOString();
    q.note = note || '';
    DECISIONS.push({ id: q.id, kind: q.kind, title: q.title, decision: status, note: q.note, by: q.decided_by, at: q.decided_at });
    drawStats(); drawQueue(); drawDecisions();
  }
  function drawDecisions() {
    const recent = DECISIONS.slice(-40).reverse();
    $('#dec-log').innerHTML = recent.length
      ? recent.map(d => `<p style="border-bottom:1px dashed var(--line);padding:4px 0;margin:0">${d.decision === 'approved' ? '✅' : '❌'} <b>${esc(d.title)}</b> <span class="muted">(${esc(KIND_HI[d.kind] || d.kind)}) — ${esc(d.by)} · ${esc((d.at || '').slice(0, 16).replace('T', ' '))}${d.note ? ' · कारण: ' + esc(d.note) : ''}</span></p>`).join('')
      : '<p class="muted">अभी कोई निर्णय दर्ज नहीं।</p>';
  }

  /* ---------- नई शोध-प्रविष्टि (सुपर-एडमिन) ---------- */
  function addCandidate() {
    const kind = $('#na-kind').value;
    let payload;
    try { payload = JSON.parse($('#na-json').value); } catch (e) { alert('JSON अमान्य: ' + e.message); return; }
    if (!payload.sources || !payload.sources.length) { alert('नीति: sources[] के बिना प्रविष्टि स्वीकार नहीं।'); return; }
    const id = payload.id || (kind + '-' + Date.now().toString(36));
    QUEUE.unshift({
      id: kind + ':' + id, kind, subtype: payload.category || 'new-research',
      title: payload.name_hi || payload.deva || id,
      subtitle: [payload.tribe_hi, payload.state, payload.district].filter(Boolean).join(' · ') || 'नई शोध-प्रविष्टि',
      reason: 'auto-research/मैन्युअल जोड़ — प्रकाशन पूर्व सत्यापन आवश्यक',
      source_file: kind === 'person' ? 'mahapurush_database.json' : kind === 'place' ? 'gondwana_places.json' : 'extra_data.json',
      record_id: id, payload, status: 'pending', added: todayStr(),
      added_by: 'panel:' + SESSION.email, decision: null, decided_by: null, decided_at: null, note: '', isNew: true
    });
    $('#na-json').value = '';
    drawStats(); drawQueue();
    toastLine('नई प्रविष्टि कतार में जुड़ी ✓ (अभी public नहीं)');
  }

  /* ---------- खाते एवं रोटेशन (सुपर-एडमिन) ---------- */
  async function addAccount() {
    const email = prompt('नए एडमिन की ईमेल ID:');
    if (!email || !email.includes('@')) return;
    if (accountOf(email)) { alert('यह ईमेल पहले से है।'); return; }
    const pw = randomPass();
    CREDS.accounts.push({ role: 'admin', email, hash: await sha256hex(CREDS.salt + pw), created: todayStr(), expires: plus30(), note: 'पैनल से जोड़ा गया' });
    CREDS_DIRTY = true;
    showOnce('नया एडमिन खाता बना — पासवर्ड केवल एक बार:', email, pw);
  }
  async function rotateAll() {
    if (!confirm('सभी खातों के पासवर्ड अभी बदलें? पुराने पासवर्ड तुरंत अमान्य हो जाएँगे (credentials प्रकाशित होने पर)।')) return;
    const rows = [];
    for (const a of CREDS.accounts) {
      const pw = randomPass();
      a.hash = await sha256hex(CREDS.salt + pw);
      a.expires = plus30(); a.rotated = todayStr();
      rows.push([a.email, a.role, pw]);
    }
    CREDS.rotation.last_manual = todayStr();
    CREDS_DIRTY = true;
    $('#acc-out').innerHTML = '<p class="muted small">सभी पासवर्ड बदले गए — <b>credentials प्रकाशित करना न भूलें</b> (नीचे 📦)।</p>' +
      rows.map(r => `<p style="margin:6px 0">${esc(r[1])}: <b>${esc(r[0])}</b><br><span class="pw-once">${esc(r[2])}</span></p>`).join('');
  }
  function showOnce(label, email, pw) {
    $('#acc-out').innerHTML = `<p class="muted small">${esc(label)}</p><p><b>${esc(email)}</b><br><span class="pw-once">${esc(pw)}</span></p>
      <p class="muted small">यह पासवर्ड दोबारा नहीं दिखेगा। credentials प्रकाशित करना न भूलें।</p>`;
  }

  /* ---------- प्रकाशन: परिवर्तन लागू करें ---------- */
  function buildOutputs() {
    const heroes = JSON.parse(JSON.stringify(window.GW_HEROES));
    const places = JSON.parse(JSON.stringify(window.GW_PLACES));
    const extra = JSON.parse(JSON.stringify(window.GW_EXTRA));
    const changes = { cleared: [], removed: [], photos: [], addedNew: [] };
    QUEUE.forEach(q => {
      if (q.status === 'pending') return;
      const ok = q.status === 'approved';
      if (q.kind === 'person') {
        const i = heroes.persons.findIndex(p => p.id === q.record_id);
        if (q.isNew) { if (ok) { heroes.persons.push(q.payload); changes.addedNew.push(q.title); } return; }
        if (i === -1) return;
        if (ok) { const rec = q.payload && q.payload.id === q.record_id ? q.payload : heroes.persons[i]; rec.verify = false; delete rec.verify_note; heroes.persons[i] = rec; changes.cleared.push(q.title); }
        else { heroes.persons.splice(i, 1); changes.removed.push(q.title); }
      } else if (q.kind === 'place') {
        const i = places.places.findIndex(p => p.id === q.record_id);
        if (q.isNew) { if (ok) { places.places.push(q.payload); changes.addedNew.push(q.title); } return; }
        if (i === -1) return;
        if (ok) { const rec = q.payload && q.payload.id === q.record_id ? q.payload : places.places[i]; rec.verify = false; delete rec.verify_note; places.places[i] = rec; changes.cleared.push(q.title); }
        else { places.places.splice(i, 1); changes.removed.push(q.title); }
      } else if (q.kind === 'festival') {
        const i = extra.festivals.findIndex(f => f.id === q.record_id);
        if (q.isNew) { if (ok) { extra.festivals.push(q.payload); changes.addedNew.push(q.title); } return; }
        if (i === -1) return;
        if (ok) { const rec = q.payload && q.payload.id === q.record_id ? q.payload : extra.festivals[i]; rec.verify = false; delete rec.verify_note; extra.festivals[i] = rec; changes.cleared.push(q.title); }
        else { extra.festivals.splice(i, 1); changes.removed.push(q.title); }
      } else if (q.kind === 'photo') {
        if (ok && q.payload && q.payload.photo) {
          const p = heroes.persons.find(x => x.id === q.record_id);
          if (p) { p.photo = q.payload.photo; p.photo_source = q.payload.photo_source || 'उल्लेखित स्रोत'; changes.photos.push(q.title); }
        }
      }
      // announcement: केवल लॉग (तिथि-भरण मैन्युअल/इंजन-कार्य)
    });
    const dataJs = '/* Gondwana Calendar App — merged dataset (research + extra + mahapurush + places) */\n' +
      'window.GW_DATA = ' + JSON.stringify(window.GW_DATA) + ';\n' +
      'window.GW_EXTRA = ' + JSON.stringify(extra) + ';\n' +
      'window.GW_HEROES = ' + JSON.stringify(heroes) + ';\n' +
      'window.GW_PLACES = ' + JSON.stringify(places) + ';\n';
    return { heroes, places, extra, dataJs, changes };
  }
  function csvHeroes(heroes) {
    const cols = ['id', 'name_hi', 'name_en', 'gender', 'tribe_hi', 'state', 'district', 'birth', 'death', 'category', 'tags', 'first_achievement', 'medals', 'awards', 'verify', 'verify_note', 'sources', 'memorial'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [cols.join(',')];
    heroes.persons.forEach(p => lines.push(cols.map(c => q(c === 'tags' ? (p.tags || []).join(';') : c === 'sources' ? (p.sources || []).join(' | ') : p[c])).join(',')));
    return '\ufeff' + lines.join('\r\n');
  }
  function csvPlaces(places) {
    const cols = ['id', 'name_hi', 'name_en', 'category', 'state', 'district', 'lat', 'lon', 'gps_precision', 'year', 'significance', 'map_pin_id', 'verify', 'verify_note', 'sources'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [cols.join(',')];
    places.places.forEach(p => lines.push(cols.map(c => q(c === 'sources' ? (p.sources || []).join(' | ') : p[c])).join(',')));
    return '\ufeff' + lines.join('\r\n');
  }
  function outputFiles() {
    const o = buildOutputs();
    const files = {
      'data.js': o.dataJs,
      'mahapurush_database.json': JSON.stringify(o.heroes, null, 1),
      'gondwana_places.json': JSON.stringify(o.places, null, 1),
      'extra_data.json': JSON.stringify(o.extra, null, 1),
      'Aadivasi_Mahapurush_Starter_Database.csv': csvHeroes(o.heroes),
      'Gondwana_Places_GPS.csv': csvPlaces(o.places),
      'review/pending.json': JSON.stringify({ meta: { title: 'गोंडवाना समीक्षा-कतार', updated: new Date().toISOString() }, queue: QUEUE }, null, 1),
      'review/decisions.json': JSON.stringify({ meta: { title: 'निर्णय-लॉग (audit trail)' }, decisions: DECISIONS }, null, 1)
    };
    if (CREDS_DIRTY) files['admin-credentials.json'] = JSON.stringify(CREDS, null, 1);
    if (MEDIA_DIRTY) files['media/manifest.json'] = manifestText();
    return { files, changes: o.changes };
  }
  function previewChanges() {
    const { files, changes } = outputFiles();
    logLine('— परिवर्तन-पूर्वावलोकन —');
    logLine(`verify-फ़्लैग हटे (स्वीकृत): ${changes.cleared.length} → ${changes.cleared.slice(0, 8).join(', ')}${changes.cleared.length > 8 ? '…' : ''}`);
    logLine(`हटेंगी (अस्वीकृत): ${changes.removed.length} → ${changes.removed.join(', ') || '—'}`);
    logLine(`फ़ोटो जुड़ेंगी: ${changes.photos.length} → ${changes.photos.join(', ') || '—'}`);
    logLine(`नई स्वीकृत प्रविष्टियाँ: ${changes.addedNew.length} → ${changes.addedNew.join(', ') || '—'}`);
    logLine('अपडेट होने वाली फ़ाइलें: ' + Object.keys(files).join(', '));
    logLine(`संग्रहण: ${MEDIA.filter(m => m.status === 'verified').length} सत्यापित · ${MEDIA.filter(m => m.status === 'candidate').length} प्रतीक्षित · ${MEDIA.filter(m => m.status === 'rejected').length} अस्वीकृत`);
    const total = changes.cleared.length + changes.removed.length + changes.photos.length + changes.addedNew.length;
    logLine(total === 0 ? '⚠ अभी कोई निर्णीत परिवर्तन नहीं — पहले कतार में स्वीकृत/अस्वीकृत करें।' : 'कुल परिवर्तन: ' + total);
  }
  function downloadBundle() {
    const { files } = outputFiles();
    Object.entries(files).forEach(([name, text]) => download(name.replace(/\//g, '_'), text));
    logLine('📥 ' + Object.keys(files).length + ' फ़ाइलें डाउनलोड हुईं — repo में उसी नाम-पथ से बदल दें (या मुझसे कहें)।');
  }

  /* ---------- GitHub push (Contents API) ---------- */
  async function pushToGitHub() {
    const pat = $('#pub-pat').value.trim();
    if (!pat) { alert('PAT डालें (repo contents:write अनुमति सहित)। वह केवल इस ब्राउज़र-सत्र में रहेगा।'); return; }
    const { files, changes } = outputFiles();
    const total = changes.cleared.length + changes.removed.length + changes.photos.length + changes.addedNew.length;
    if (!total && !CREDS_DIRTY) { alert('प्रकाशित करने योग्य कोई परिवर्तन नहीं।'); return; }
    if (!confirm(Object.keys(files).length + ' फ़ाइलें GitHub पर commit होंगी। जारी रखें?')) return;
    const H = { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    logLine('☁️ push शुरू…');
    for (const [path, content] of Object.entries(files)) {
      try {
        let sha = null;
        const g = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, { headers: H });
        if (g.ok) sha = (await g.json()).sha;
        const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
          method: 'PUT', headers: H,
          body: JSON.stringify({
            message: `verify-panel: ${changes.cleared.length} स्वीकृत, ${changes.removed.length} अस्वीकृत, ${changes.photos.length} फ़ोटो, ${changes.addedNew.length} नई — ${path}`,
            content: b64(content), branch: BRANCH, sha: sha || undefined
          })
        });
        logLine((r.ok ? '  ✓ ' : '  ✗ HTTP ' + r.status + ' ') + path);
        if (!r.ok) { const e = await r.json().catch(() => ({})); logLine('    ' + (e.message || '')); }
      } catch (e) { logLine('  ✗ ' + path + ' — ' + e.message); }
    }
    logLine('पूर्ण। CI (1066+ जाँच) अपने आप चलेगा → हरा होने पर ~1 मिनट में लाइव।');
  }

  /* ============ 🗄️ संग्रहण — मीडिया लाइब्रेरी ============ */
  function manifestText() { return JSON.stringify({ meta: MAN_META, items: MEDIA }, null, 1); }
  function humanSz(n) { if (n == null) return ''; if (n < 1024) return n + 'B'; if (n < 1048576) return (n / 1024).toFixed(1) + 'KB'; return (n / 1048576).toFixed(1) + 'MB'; }
  function mdSrc(m) {
    if (m.path) return m.path.replace(/^\//, '');
    return m.url || null;
  }
  function initStorage() {
    $('#md-link-btn').onclick = () => $('#md-form').classList.toggle('hidden');
    $('#mdf-cancel').onclick = () => $('#md-form').classList.add('hidden');
    $('#mdf-save').onclick = addLink;
    $('#md-upload-btn').onclick = () => $('#md-file').click();
    $('#md-file').onchange = e => { uploadFiles(e.target.files); e.target.value = ''; };
    $('#md-search').oninput = () => { mdSearch = $('#md-search').value.trim().toLowerCase(); drawMdList(); };
    drawMdFilters(); drawMdList();
  }
  function drawMdFilters() {
    const cS = {}; MEDIA.forEach(m => cS[m.status] = (cS[m.status] || 0) + 1);
    $('#md-status-filters').innerHTML = ['all', 'candidate', 'verified', 'rejected'].map(k =>
      `<button class="chip ${mdStatus === k ? 'active' : ''}" data-s="${k}">${k === 'all' ? 'सभी' : STATUS_HI[k]}${k !== 'all' ? ' (' + (cS[k] || 0) + ')' : ''}</button>`).join('');
    $$('#md-status-filters .chip').forEach(b => b.onclick = () => { mdStatus = b.dataset.s; drawMdFilters(); drawMdList(); });
    const cT = {}; MEDIA.forEach(m => cT[m.type] = (cT[m.type] || 0) + 1);
    $('#md-type-filters').innerHTML = ['all'].concat(Object.keys(TYPE_HI)).map(k =>
      `<button class="chip ${mdType === k ? 'active' : ''}" data-t="${k}">${k === 'all' ? 'सब प्रकार' : TYPE_HI[k]}${k !== 'all' ? ' (' + (cT[k] || 0) + ')' : ''}</button>`).join('');
    $$('#md-type-filters .chip').forEach(b => b.onclick = () => { mdType = b.dataset.t; drawMdFilters(); drawMdList(); });
  }
  function drawMdList() {
    let list = MEDIA.slice();
    if (mdStatus !== 'all') list = list.filter(m => m.status === mdStatus);
    if (mdType !== 'all') list = list.filter(m => m.type === mdType);
    if (mdSearch) list = list.filter(m => ((m.title || '') + ' ' + (m.desc || '') + ' ' + (m.source || '') + ' ' + (m.attach_to || '')).toLowerCase().includes(mdSearch));
    $('#md-count').textContent = list.length + ' प्रविष्टियाँ' + (MEDIA_DIRTY ? ' · ⚠ अप्रकाशित परिवर्तन — नीचे 📦 से प्रकाशित करें' : '');
    $('#md-list').innerHTML = list.map(m => {
      const src = mdSrc(m);
      let prev = '';
      if (src && (m.type === 'image')) prev = `<div class="md-preview"><img src="${esc(src)}" alt="" loading="lazy" onerror="this.nextElementSibling.classList.remove('hidden');this.style.display='none'"><span class="muted small hidden">पूर्वावलोकन लोड नहीं हुआ (hotlink-रोध) — 🔗 खोलें से देखें</span></div>`;
      else if (src && (m.type === 'audio' || m.type === 'song')) prev = `<div class="md-preview"><audio controls preload="none" src="${esc(src)}"></audio></div>`;
      else if (src && m.type === 'video') prev = `<div class="md-preview"><video controls preload="none" src="${esc(src)}"></video></div>`;
      return `
      <div class="q-card" data-mid="${esc(m.id)}">
        <span class="st-pill st-${esc(m.status)}">${STATUS_HI[m.status] || m.status}</span>
        <span class="kind-badge k-place">${TYPE_HI[m.type] || m.type}</span>
        <span class="lic-pill">© ${esc(LICENSE_HI[m.license] || m.license || '?')}</span>
        <span class="q-title">${esc(m.title)}</span>
        <div class="q-sub">${esc(m.source || '')} · जोड़ा: ${esc(m.added || '')} (${esc(m.added_by || '')})${m.size ? ' · ' + humanSz(m.size) : ''}${m.attach_to ? ' · 📎 ' + esc(m.attach_to) : ''}</div>
        ${prev}
        <div class="q-sub" style="margin-top:4px">${esc(m.desc || '')}</div>
        ${m.note ? `<div class="q-reason">ℹ ${esc(m.note)}</div>` : ''}
        ${m.verified_by ? `<div class="q-sub">सत्यापित: ${esc(m.verified_by)} · ${esc((m.verified_at || '').slice(0, 10))}</div>` : ''}
        <div class="q-actions">
          ${m.status !== 'verified' ? `<button class="btn ok sm" data-m="verify">✓ सत्यापित व attach</button>` : ''}
          ${m.status !== 'rejected' ? `<button class="btn bad sm" data-m="reject">✗ अस्वीकृत</button>` : ''}
          <button class="btn ghost sm" data-m="edit">✎ विवरण</button>
          ${src ? `<button class="btn ghost sm" data-m="open">🔗 खोलें</button><button class="btn ghost sm" data-m="copy">📋 लिंक कॉपी</button>` : `<button class="btn ghost sm" data-m="edit">🔗 URL भरें</button>`}
        </div>
        <div class="q-payload"><textarea spellcheck="false">${esc(JSON.stringify(m, null, 1))}</textarea>
          <div class="q-actions"><button class="btn sm" data-m="save">💾 सहेजें</button></div>
        </div>
      </div>`;
    }).join('') || '<div class="card"><p class="muted">इस फ़िल्टर में कुछ नहीं — 🔗 लिंक जोड़ें, 📤 अपलोड करें, या GitHub पर media/inbox/ में फ़ाइल डालें (automation विवरण सहित यहाँ पहुँचा देगा)।</p></div>';
    $$('#md-list .q-card').forEach(card => {
      const m = MEDIA.find(x => x.id === card.dataset.mid);
      const q = s2 => card.querySelector(`[data-m="${s2}"]`);
      if (q('verify')) q('verify').onclick = () => {
        const a = prompt('किससे attach करें? (person:<id> · festival:<id> · place:<id> · calendar · app · या खाली)', m.attach_to || '');
        if (a === null) return;
        m.status = 'verified'; m.attach_to = a.trim() || null;
        m.verified_by = SESSION.email + ' (' + SESSION.role + ')'; m.verified_at = new Date().toISOString();
        MEDIA_DIRTY = true; drawMdFilters(); drawMdList();
      };
      if (q('reject')) q('reject').onclick = () => {
        const r = prompt('अस्वीकृति-कारण:', 'license अस्पष्ट');
        if (r === null) return;
        m.status = 'rejected'; m.note = (m.note ? m.note + ' · ' : '') + 'अस्वीकृत: ' + r;
        MEDIA_DIRTY = true; drawMdFilters(); drawMdList();
      };
      const pe = q('edit'); if (pe) pe.onclick = () => card.querySelector('.q-payload').classList.toggle('open');
      const sv = q('save'); if (sv) sv.onclick = () => {
        try {
          const upd = JSON.parse(card.querySelector('.q-payload textarea').value);
          if (upd.id !== m.id) { alert('id नहीं बदल सकते — वही रखें।'); return; }
          Object.assign(m, upd); MEDIA_DIRTY = true; drawMdFilters(); drawMdList();
        } catch (e) { alert('JSON अमान्य: ' + e.message); }
      };
      if (q('open')) q('open').onclick = () => window.open(m.url || ('./' + mdSrc(m)), '_blank', 'noopener');
      if (q('copy')) q('copy').onclick = () => {
        const abs = m.url || (location.origin + location.pathname.replace(/[^/]*$/, '') + mdSrc(m));
        (navigator.clipboard ? navigator.clipboard.writeText(abs) : Promise.reject()).then(() => toastLine('लिंक कॉपी हुआ ✓')).catch(() => prompt('कॉपी करें:', abs));
      };
    });
  }
  function addLink() {
    const title = $('#mdf-title').value.trim(), url = $('#mdf-url').value.trim(), source = $('#mdf-source').value.trim();
    if (!title || !url || !source) { alert('शीर्षक, URL व स्रोत अनिवार्य (नीति: स्रोत के बिना स्वीकृति नहीं)।'); return; }
    if (!/^https?:\/\//i.test(url)) { alert('URL http(s):// से शुरू होना चाहिए।'); return; }
    MEDIA.unshift({
      id: 'media-link-' + Date.now().toString(36), type: $('#mdf-type').value, title,
      desc: $('#mdf-desc').value.trim(), path: null, url, source,
      license: $('#mdf-license').value, size: null, added: todayStr(),
      added_by: 'panel:' + SESSION.email, status: 'candidate', attach_to: null,
      verified_by: null, verified_at: null, note: 'पैनल से जोड़ा गया लिंक'
    });
    MEDIA_DIRTY = true;
    ['mdf-title', 'mdf-url', 'mdf-source', 'mdf-desc'].forEach(i => $('#' + i).value = '');
    $('#md-form').classList.add('hidden');
    drawMdFilters(); drawMdList();
    toastLine('लिंक candidate बना ✓ — 📦 खंड से प्रकाशित करना न भूलें');
  }
  async function shaBuf(buf) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function fileB64(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }
  async function gh(H, apiPath, opts) {
    opts = opts || {};
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${apiPath}`, {
      method: opts.method || 'GET', headers: H, body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.message || 'HTTP ' + r.status) + ' @ ' + apiPath);
    return j;
  }
  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const pat = $('#pub-pat').value.trim();
    if (!pat) { alert('पहले 📦 खंड में GitHub PAT डालें — अपलोड सीधे repo में commit होता है (Contents API की 1MB सीमा से बचने हेतु Git Data API)।'); return; }
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024 && !confirm(`${f.name} = ${humanSz(f.size)} (>10MB) — repo/Pages भारी होगा। फिर भी जारी रखें?`)) return;
    }
    if (!confirm(`${files.length} फ़ाइल(ें) media/uploads/ में commit होंगी (candidate — सत्यापन के बिना public-दृश्य नहीं जुड़ेंगी)। जारी रखें?`)) return;
    logLine('📤 अपलोड शुरू (' + files.length + ' फ़ाइलें)…');
    const H = { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    try {
      const ref = await gh(H, `git/ref/heads/${BRANCH}`);
      const head = ref.object.sha;
      const base = await gh(H, `git/commits/${head}`);
      const treeItems = [];
      for (const f of files) {
        const name = f.name.replace(/[^\w.\-\u0900-\u097F]+/g, '_');
        const path = 'media/uploads/' + name;
        const b64c = await fileB64(f);
        const blob = await gh(H, 'git/blobs', { method: 'POST', body: { content: b64c, encoding: 'base64' } });
        treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        const sha = await shaBuf(await f.arrayBuffer());
        const ext = (name.split('.').pop() || '').toLowerCase();
        const type = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? 'image'
          : ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext) ? 'audio'
          : ['mp4', 'webm'].includes(ext) ? 'video' : ext === 'pdf' ? 'doc' : 'other';
        MEDIA.unshift({
          id: 'media-inbox-' + sha.slice(0, 10), type, title: name,
          desc: `पैनल-अपलोड स्वचालित विवरण: प्रकार=${type}, आकार=${humanSz(f.size)}, SHA-256=${sha.slice(0, 16)}…, अपलोडकर्ता=${SESSION.email}, दिनांक=${todayStr()}। शीर्षक/स्रोत/संबंध ✎ से भरें।`,
          path, url: null, source: 'पैनल-अपलोड (' + SESSION.email + ')',
          license: type === 'audio' || type === 'song' || type === 'video' ? 'own' : 'unknown',
          size: f.size, added: todayStr(), added_by: 'panel:' + SESSION.email,
          status: 'candidate', attach_to: null, verified_by: null, verified_at: null,
          note: f.size > 10 * 1024 * 1024 ? '⚠ 10MB से बड़ी' : '⏳ एडमिन-सत्यापन प्रतीक्षित'
        });
        logLine('  ✓ blob ' + path + ' (' + humanSz(f.size) + ')');
      }
      const manBlob = await gh(H, 'git/blobs', { method: 'POST', body: { content: b64(manifestText()), encoding: 'base64' } });
      treeItems.push({ path: 'media/manifest.json', mode: '100644', type: 'blob', sha: manBlob.sha });
      const tree = await gh(H, 'git/trees', { method: 'POST', body: { base_tree: base.tree.sha, tree: treeItems } });
      const commit = await gh(H, 'git/commits', { method: 'POST', body: { message: `media: ${files.length} फ़ाइल(ें) अपलोड — candidate (सत्यापन प्रतीक्षित)`, tree: tree.sha, parents: [head] } });
      await gh(H, `git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: commit.sha } });
      MEDIA_DIRTY = false;
      logLine('☁️ अपलोड commit ' + commit.sha.slice(0, 7) + ' — ~1 मिनट में Pages पर उपलब्ध। विवरण जाँचकर ✓ सत्यापित करें।');
      drawMdFilters(); drawMdList();
    } catch (e) {
      logLine('✗ अपलोड विफल: ' + e.message);
      alert('अपलोड विफल: ' + e.message + '\n(PAT में Contents+Metadata write अनुमति जाँचें)');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.__ADMIN = { buildOutputs, outputFiles, decide, QUEUE: () => QUEUE, MEDIA: () => MEDIA, manifestText };
})();
