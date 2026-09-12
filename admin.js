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
      const [cr, pq, dj] = await Promise.all([
        fetch('admin-credentials.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('review/pending.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('review/decisions.json', { cache: 'no-store' }).then(r => r.json())
      ]);
      CREDS = cr; QUEUE = pq.queue || []; DECISIONS = dj.decisions || [];
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
    drawStats(); drawFilters(); drawQueue(); drawDecisions();
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.__ADMIN = { buildOutputs, outputFiles, decide, QUEUE: () => QUEUE };
})();
