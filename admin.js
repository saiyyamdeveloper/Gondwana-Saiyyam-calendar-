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
  const KIND_HI = { person: 'महापुरुष/शहीद', photo: 'फ़ोटो-लाइसेंस', place: 'स्थल/GPS', festival: 'पर्व', announcement: 'घोषित तिथि', story: 'लोक-कथा', region: 'क्षेत्र-प्रविष्टि', correction: 'गलती-रिपोर्ट' };

  let CREDS = null, QUEUE = [], DECISIONS = [], SESSION = null, CREDS_DIRTY = false;
  let qFilter = 'all', qSearch = '';
  let MEDIA = [], MAN_META = {}, MEDIA_DIRTY = false;
  let EVID = {};
  let CRAWL = null;
  let REPORTS = [], RCFG = null;
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
      const [cr, pq, dj, mf, evi, crawl, rpt, rcfg] = await Promise.all([
        fetch('admin-credentials.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('review/pending.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('review/decisions.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('media/manifest.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('review/evidence/index.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('review/region_crawl.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('review/reports.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('report_config.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      ]);
      CREDS = cr; QUEUE = pq.queue || []; DECISIONS = dj.decisions || [];
      if (mf) { MAN_META = mf.meta || {}; MEDIA = mf.items || []; }
      if (evi) EVID = evi;
      if (crawl) CRAWL = crawl;
      if (rpt && rpt.reports) REPORTS = rpt.reports;
      RCFG = rcfg;
      applyDraft();
    } catch (e) {
      $('#lg-err').textContent = 'डेटा लोड विफल: ' + e.message; $('#lg-err').classList.remove('hidden');
      return;
    }
    setupGoogleLogin();
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
    drawStats(); drawFilters(); drawQueue(); drawDecisions(); initStorage(); initViews();
    if ((location.hash || '') === '#report') setView('report');
    if ((location.hash || '') === '#reports') setView('reports');
  }

  function pending() { return QUEUE.filter(q => q.status === 'pending' && !isPhotoSlot(q)); }
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
    let list = qFilter === 'photo' ? QUEUE.filter(q => q.status === 'pending' && q.kind === 'photo') : pending();
    if (qFilter !== 'all' && qFilter !== 'photo') list = list.filter(q => q.kind === qFilter);
    if (qSearch) list = list.filter(q => (q.title + ' ' + (q.subtitle || '') + ' ' + (q.reason || '') + ' ' + (q.subtype || '')).toLowerCase().includes(qSearch));
    $('#q-count').textContent = list.length + ' प्रविष्टियाँ दिखाई जा रही हैं';
    const slots = QUEUE.filter(q => q.status === 'pending' && isPhotoSlot(q)).length;
    const slotNote = (slots && qFilter !== 'photo') ? `<div class="card"><p class="muted small" style="margin:0">📷 ${slots} फ़ोटो-स्लॉट प्रस्ताव-प्रतीक्षित (छिपे) — संग्रहण से 📸 प्रस्ताव आते ही कतार में दिखेंगे। 'फ़ोटो-लाइसेंस' फ़िल्टर चुनें तो सभी दिखेंगे।</p></div>` : '';
    $('#q-list').innerHTML = slotNote + (list.slice(0, 120).map(q => `
      <div class="q-card" data-id="${esc(q.id)}">
        <span class="kind-badge k-${q.kind}">${KIND_HI[q.kind] || q.kind}${q.subtype && q.subtype !== q.kind ? ' · ' + esc(q.subtype) : ''}</span>${evBadge(q)}
        <span class="q-title">${esc(q.title)}</span>
        <div class="q-sub">${esc(q.subtitle || '')}${q.payload && q.payload.birth_date ? ' · 🎂 ' + esc(q.payload.birth_date) : ''} · जोड़ा: ${esc(q.added)} (${esc(q.added_by || '')})</div>
        <div class="q-reason">⚠ ${esc(q.reason || '')}</div>
        ${q.payload && q.payload.entity ? `<div class="q-sub" style="white-space:pre-wrap">${esc((q.payload.entity.desc_hi || '').slice(0, 200))}${q.payload.entity.told_by ? ' · 👴 ' + esc(q.payload.entity.told_by) : ''}${q.payload.unit_id ? ' · ' + esc(q.payload.unit_id) : ''}</div>` : ''}
        <div class="q-actions">
          <button class="btn ok sm" data-act="approve">✓ स्वीकृत</button>
          <button class="btn bad sm" data-act="reject">✗ अस्वीकृत</button>
          <button class="btn ghost sm" data-act="edit">✎ payload देखें/संपादित</button>
          <button class="btn ghost sm" data-act="evid">🔎 स्व-सबूत</button>
        </div>
        <div class="q-payload"><textarea spellcheck="false">${esc(JSON.stringify(q.payload, null, 1))}</textarea>
          <div class="q-actions"><button class="btn sm" data-act="save">💾 सहेजें</button><span class="muted small">संपादन के बाद स्वीकृत करें — स्वीकृत payload ही मास्टर में जाएगा।</span></div>
        </div>
      </div>`).join('')) || (slotNote || '<div class="card"><p class="muted">🎉 कोई समीक्षा-बाकी प्रविष्टि नहीं!</p></div>');
    $$('#q-list .q-card').forEach(card => {
      const q = QUEUE.find(x => x.id === card.dataset.id);
      card.querySelector('[data-act=approve]').onclick = () => decide(q, 'approved');
      card.querySelector('[data-act=reject]').onclick = () => {
        const r = prompt('अस्वीकृति का कारण (audit-log में दर्ज होगा):', 'स्रोत अपर्याप्त');
        if (r !== null) decide(q, 'rejected', r);
      };
      const pe = card.querySelector('[data-act=edit]'), pl = card.querySelector('.q-payload');
      pe.onclick = () => pl.classList.toggle('open');
      const eb2 = card.querySelector('[data-act=evid]'); if (eb2) eb2.onclick = () => openEvidence(card, q);
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
  function evBadge(q) {
    const e = EVID[q.id]; if (!e) return '';
    const llm = e.llm ? ` · LLM ${e.llm.verdict === 'pass' ? '🟢' : e.llm.verdict === 'fail' ? '🔴' : '🟡'}${e.llm.confidence != null ? ' ' + e.llm.confidence : ''}` : '';
    return `<span class="st-pill ev-${e.verdict}" title="${esc(e.summary_hi || '')}">${e.score}/100${llm}</span>`;
  }
  async function openEvidence(card, q) {
    let box = card.querySelector('.q-evid');
    if (!box) { box = document.createElement('div'); box.className = 'q-evid'; card.appendChild(box); }
    if (box.classList.contains('open')) { box.classList.remove('open'); return; }
    box.classList.add('open');
    if (box.dataset.loaded) return;
    box.innerHTML = '<p class="muted small">सबूत लोड हो रहे हैं…</p>';
    const safe = q.id.replace(/[^A-Za-z0-9._-]/g, '_');
    try {
      const e = await fetch('review/evidence/' + safe + '.json', { cache: 'no-store' }).then(r => r.json());
      box.innerHTML = `<p class="small"><b>${e.score}/100 · ${e.verdict}</b> · जाँचा: ${String(e.checked_at).slice(0, 16).replace('T', ' ')} · डोमेन: ${esc((e.sources_domains || []).join(', '))}</p>
        <p class="small">${esc(e.summary_hi || '')}</p>
        ${e.dates && (e.dates.birth || e.dates.death) ? `<p class="small">🎂 जन्म: <b>${esc(e.dates.birth || '—')}</b> · 🕊️ निधन: <b>${esc(e.dates.death || '—')}</b> <span class="muted">(${esc(e.dates.source || '')})</span></p>` : ''}
        <table style="width:100%;font-size:.72rem;border-collapse:collapse">${(e.checks || []).map(c => `<tr><td style="border-bottom:1px dashed var(--line);padding:3px;white-space:nowrap">${c.ok ? '✓' : '✗'} ${esc(c.name)} (+${c.pts})</td><td style="border-bottom:1px dashed var(--line);padding:3px">${esc(c.detail)}${c.link ? ` <a href="${esc(c.link)}" target="_blank" rel="noopener">↗</a>` : ''}</td></tr>`).join('')}</table>
        ${(e.conflicts || []).length ? `<div class="q-reason">⚠ विरोध: ${e.conflicts.map(c => `${esc(c.field)}: हमारा ${esc(c.ours)} बनाम ${esc(c.source)} ${esc(c.theirs)}`).join('; ')} — अंतिम निर्णय आपका</div>` : ''}
        ${e.llm ? `<p class="small" style="margin-top:6px">🤖 LLM (${esc(e.llm.provider || '')}): <b>${esc(e.llm.verdict || '')}</b> · विश्वास ${e.llm.confidence ?? '-'}<br>${esc(e.llm.summary_hi || '')}</p>${(e.llm.claims || []).map(cl => `<p class="small" style="margin:3px 0">• ${esc(cl.claim)} ${(cl.shield || []).map(sh => `<a href="${esc(sh.url)}" target="_blank" rel="noopener">${sh.shield === 'verified' ? '🛡✓' : '🛡?'}↗</a> (${Math.round((sh.claim_support_ratio || 0) * 100)}%)`).join(' ')}</p>`).join('')}${(e.llm.red_flags || []).length ? `<div class="q-reason">🚩 ${e.llm.red_flags.map(esc).join('; ')}</div>` : ''}` : (Object.values(EVID).some(v => v && v.llm) ? '<p class="muted small">🤖 LLM-बैच हर रात 3:00 IST पर 8 प्रविष्टियाँ जाँचता है (प्राथमिकता: 🔴 विरोध → ⚪ निःस्रोत → 🟠) — यह प्रविष्टि सूची में है, अगले बैच में उसका डॉसियर जुड़ेगा।</p>' : '<p class="muted small">🤖 LLM-परत अभी नहीं चली — repo secrets (LLM_PROVIDER/LLM_API_KEY) जुड़ते ही गहरी research जुड़ जाएगी।</p>')}`;
      box.dataset.loaded = '1';
    } catch (err) { box.innerHTML = '<p class="warn small">सबूत-फ़ाइल नहीं मिली: ' + esc(err.message) + '</p>'; }
  }
  function toastLine(m) { const el = $('#q-count'); el.textContent = m; }

  function decide(q, status, note) {
    q.status = status;
    q.decided_by = SESSION.email + ' (' + SESSION.role + ')';
    q.decided_at = new Date().toISOString();
    q.note = note || '';
    DECISIONS.push({ id: q.id, kind: q.kind, title: q.title, decision: status, note: q.note, by: q.decided_by, at: q.decided_at });
    drawStats(); drawQueue(); drawDecisions();
    persistDecisions(status === 'approved' ? 'verify-panel: स्वीकृत — ' + q.title : 'verify-panel: अस्वीकृत — ' + q.title);
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
    const srcs = payload.sources || (payload.entity && payload.entity.sources) || [];
    if (!srcs.length) { alert('नीति: sources[] (या entity.sources[]) के बिना प्रविष्टि स्वीकार नहीं।'); return; }
    const id = payload.id || (kind + '-' + Date.now().toString(36));
    QUEUE.unshift({
      id: kind + ':' + id, kind, subtype: payload.category || 'new-research',
      title: payload.name_hi || (payload.entity && payload.entity.name_hi) || payload.deva || id,
      subtitle: [payload.tribe_hi, payload.state, payload.district].filter(Boolean).join(' · ') || 'नई शोध-प्रविष्टि',
      reason: 'auto-research/मैन्युअल जोड़ — प्रकाशन पूर्व सत्यापन आवश्यक',
      source_file: kind === 'person' ? 'mahapurush_database.json' : kind === 'place' ? 'gondwana_places.json' : (kind === 'story' || kind === 'region') ? 'gondwana_regions.json' : kind === 'correction' ? 'data.js' : 'extra_data.json',
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
    const reg = window.GW_REGIONS ? JSON.parse(JSON.stringify(window.GW_REGIONS)) : null;
    let regDirty = false;
    const changes = { cleared: [], removed: [], photos: [], addedNew: [], regions: [], corrections: [] };
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
      } else if (q.kind === 'correction') {
        if (!ok) return;
        const fix = q.payload && q.payload.fix;
        const WL = { person: ['name_hi', 'birth', 'death', 'birth_date', 'death_date', 'first_achievement', 'tribe_hi', 'state', 'district', 'medals', 'awards', 'memorial'],
          place: ['name_hi', 'significance', 'lat', 'lon', 'gps_precision', 'year', 'district', 'state'],
          festival: ['deva', 'story', 'ritual', 'region', 'meaning'] };
        const store = fix && fix.target === 'person' ? heroes.persons : fix && fix.target === 'place' ? places.places : fix && fix.target === 'festival' ? extra.festivals : null;
        if (store && WL[fix.target].includes(fix.field)) {
          const i = store.findIndex(r => r.id === fix.id);
          if (i > -1) { store[i][fix.field] = fix.value; changes.corrections.push(q.title + ' → ' + fix.field); }
        } else changes.corrections.push(q.title + ' (स्वीकृत — मैनुअल सुधार)');
      } else if ((q.kind === 'story' || q.kind === 'region') && reg) {
        if (!ok || !q.payload || !q.payload.entity) return;
        const ent = q.payload.entity;
        const uid = q.payload.unit_id || q.record_id;
        let unit = reg.units.find(u => u.id === uid);
        if (!unit) { unit = { id: uid, level: 'district', name_hi: uid.split('/').pop(), parent: null, entities: [] }; reg.units.push(unit); }
        unit.entities = unit.entities || [];
        if (!unit.entities.some(e => e.name_hi === ent.name_hi)) {
          const e2 = Object.assign({}, ent); e2.verify = false; e2.approved = new Date().toISOString().slice(0, 10);
          unit.entities.push(e2);
          changes.regions.push(q.title); changes.addedNew.push(q.title + ' → क्षेत्र-कोश'); regDirty = true;
        }
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
    if (reg && regDirty) reg.meta.updated = new Date().toISOString();
    return { heroes, places, extra, dataJs, changes, reg, regDirty };
  }
  function csvHeroes(heroes) {
    const cols = ['id', 'name_hi', 'name_en', 'gender', 'tribe_hi', 'state', 'district', 'birth', 'death', 'birth_date', 'death_date', 'category', 'tags', 'first_achievement', 'medals', 'awards', 'verify', 'verify_note', 'sources', 'memorial', 'date_source'];
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
    if (o.reg && o.regDirty) {
      files['gondwana_regions.json'] = JSON.stringify(o.reg, null, 1);
      files['regions_data.js'] = '/* क्षेत्र-कोश — gondwana_regions.json से जनित (tools/build_regions.py) */\nwindow.GW_REGIONS = ' + JSON.stringify(o.reg) + ';\n';
    }
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
    logLine(`क्षेत्र-कोश में जुड़ीं: ${changes.regions.length} → ${changes.regions.join(', ') || '—'}`);
    logLine(`गलती-सुधार लागू: ${changes.corrections.length} → ${changes.corrections.join(', ') || '—'}`);
    logLine('अपडेट होने वाली फ़ाइलें: ' + Object.keys(files).join(', '));
    logLine(`संग्रहण: ${MEDIA.filter(m => m.status === 'verified').length} सत्यापित · ${MEDIA.filter(m => m.status === 'candidate').length} प्रतीक्षित · ${MEDIA.filter(m => m.status === 'rejected').length} अस्वीकृत`);
    const total = changes.cleared.length + changes.removed.length + changes.photos.length + changes.addedNew.length + changes.corrections.length;
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
    const total = changes.cleared.length + changes.removed.length + changes.photos.length + changes.addedNew.length + changes.corrections.length;
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

  /* ============ 📥 जन-रिपोर्ट (public reports inbox) ============ */
  function setupGoogleLogin() {
    const box = $('#lg-gis'); if (!box) return;
    if (!RCFG || !RCFG.google_client_id) { box.innerHTML = '<p class="muted small" style="margin:0">Gmail-लॉगिन सेटअप लंबित (report_config.json → google_client_id; SETUP_REPORTS.md)</p>'; return; }
    const onCred = resp => {
      try {
        const part = resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const p = JSON.parse(decodeURIComponent(escape(atob(part))));
        const acc = p && p.email && accountOf(p.email);
        const err = $('#lg-err');
        if (!acc) { err.textContent = 'यह Gmail (' + (p && p.email) + ') पैनल हेतु अनुमत नहीं — खाता-सूची में जोड़ें।'; err.classList.remove('hidden'); return; }
        err.classList.add('hidden');
        SESSION = { email: acc.email, role: acc.role, auth: 'google', at: new Date().toISOString() };
        try { sessionStorage.setItem('gw-admin-session', JSON.stringify(SESSION)); } catch (e) {}
        showApp();
      } catch (e) { /* टोकन-पठन विफल */ }
    };
    const load = () => {
      try {
        google.accounts.id.initialize({ client_id: RCFG.google_client_id, callback: onCred });
        box.innerHTML = '';
        google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'signin_with' });
      } catch (e) {}
    };
    if (window.google && window.google.accounts) load();
    else { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = load; document.head.appendChild(sc); }
  }
  function repText() { return JSON.stringify({ meta: { title: 'जन-रिपोर्ट इनबॉक्स — केवल मानव-प्रेषित, सत्यापित-Gmail', updated: new Date().toISOString() }, reports: REPORTS }, null, 1); }
  async function persistReports(msg) {
    const ok = await ghCommit({ 'review/reports.json': repText(), 'review/pending.json': queueText(), 'review/decisions.json': decText() }, msg || 'verify-panel: जन-रिपोर्ट निर्णय');
    toastLine(ok ? 'निर्णय + रिपोर्ट-स्थिति repo में सहेजी गई ✓' : '⚠ स्थानीय रूप से दर्ज — सहेजने हेतु 📦 खंड में PAT डालकर प्रकाशित करें');
  }
  function kindToTarget(k) { return k === 'person' ? 'person' : k === 'place' ? 'place' : k === 'festival' ? 'festival' : null; }
  function slugId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x'; }
  function newPayloadFromReport(r) {
    const ne = r.new_entry || {};
    const dates = String(ne.dates || '').split('/').map(x => x.trim());
    const base = { sources: (r.evidence || []).slice(), verify: true, verify_note: 'जन-सुझाव — ' + (r.reporter && r.reporter.email || '') };
    if (r.kind === 'festival') return Object.assign({ id: 'jansu-' + slugId(ne.name), deva: ne.name, story: ne.desc, ritual: '', region: ne.meta || '', meaning: '' }, base);
    if (r.kind === 'place') return Object.assign({ id: 'jansu-' + slugId(ne.name), name_hi: ne.name, name_en: '', category: 'dharmik', state: (ne.meta || '').split('·')[1] ? (ne.meta || '').split('·')[1].trim() : '', district: (ne.meta || '').split('·')[2] ? (ne.meta || '').split('·')[2].trim() : '', lat: null, lon: null, gps_precision: 'district-level', significance: ne.desc, year: dates[0] || '', event: '', tribes: (ne.meta || '').split('·')[0] ? (ne.meta || '').split('·')[0].trim() : '', map_pin_id: null, verify_note: base.verify_note + ' · प्रकाशन पूर्व lat/lon भरें' }, base);
    if (r.kind === 'story') return { unit_id: 'state:cg', entity: Object.assign({ kind: 'story', name_hi: ne.name, desc_hi: ne.desc, told_by: ne.meta || 'जन-सुझाव (पुनः जाँच आवश्यक)', added: todayStr() }, base) };
    return Object.assign({ id: 'jansu-' + slugId(ne.name), name_hi: ne.name, name_en: '', gender: '', tribe_hi: (ne.meta || '').split('·')[0] ? (ne.meta || '').split('·')[0].trim() : '', state: (ne.meta || '').split('·')[1] ? (ne.meta || '').split('·')[1].trim() : '', district: (ne.meta || '').split('·')[2] ? (ne.meta || '').split('·')[2].trim() : '', birth: dates[0] || '', death: dates[1] || '', birth_date: '', death_date: '', category: 'freedom', tags: [], first_achievement: ne.desc, medals: '', awards: '', memorial: '', date_source: '' }, base);
  }
  async function acceptReport(r) {
    const by = SESSION.email + ' (' + SESSION.role + ')';
    r.status = 'accepted'; r.decided_by = by; r.decided_at = new Date().toISOString();
    if (r.new_entry) {
      const k = ['person', 'place', 'festival', 'story'].includes(r.kind) ? r.kind : 'person';
      const pl = newPayloadFromReport(r);
      QUEUE.unshift({
        id: k + ':' + (pl.id || slugId(r.item_title)), kind: k, subtype: 'जन-सुझाव',
        title: (r.new_entry.name || r.item_title) + ' (नई प्रविष्टि)', subtitle: r.new_entry.meta || 'जन-रिपोर्ट से सुझाव',
        reason: 'जन-रिपोर्ट स्वीकृत — स्रोत जाँचकर प्रकाशित करें', source_file: k === 'person' ? 'mahapurush_database.json' : k === 'place' ? 'gondwana_places.json' : (k === 'story' ? 'gondwana_regions.json' : 'extra_data.json'),
        record_id: pl.id || slugId(r.item_title), payload: pl, status: 'pending', added: todayStr(),
        added_by: 'report:' + (r.reporter && r.reporter.email || '?'), decision: null, decided_by: null, decided_at: null, note: '', isNew: true
      });
      DECISIONS.push({ id: r.id, kind: 'report', title: r.item_title, decision: 'approved', note: 'नई प्रविष्टि-सुझाव → कतार में', by, at: r.decided_at });
    } else {
      const tgt = kindToTarget(r.kind);
      (r.fields || []).forEach(f => {
        if (!f.proposed) return;
        const qid = 'correction:' + r.id + '-' + f.field;
        if (QUEUE.some(x => x.id === qid)) return;
        QUEUE.unshift({
          id: qid, kind: 'correction', subtype: 'जन-रिपोर्ट',
          title: r.item_title + ' → ' + f.field, subtitle: 'हमारा: ' + (f.current || '—') + ' ⇒ प्रस्तावित: ' + f.proposed,
          reason: 'जन-रिपोर्ट स्वीकृत — 📦 प्रकाशन पर फ़िक्स मास्टर में लागू होगा', source_file: 'data.js',
          record_id: r.item_id, payload: { fix: { target: tgt || 'manual', id: r.item_id, field: f.field, value: f.proposed }, report_id: r.id, evidence: r.evidence },
          status: 'approved', added: todayStr(), added_by: 'report:' + (r.reporter && r.reporter.email || '?'),
          decision: 'approved', decided_by: by, decided_at: r.decided_at, note: 'जन-रिपोर्ट स्वीकृति', isNew: true
        });
        DECISIONS.push({ id: qid, kind: 'correction', title: r.item_title + ' → ' + f.field + ': ' + (f.current || '') + ' ⇒ ' + f.proposed, decision: 'approved', note: 'जन-रिपोर्ट', by, at: r.decided_at });
      });
      if (!(r.fields || []).length && r.wrong_note) {
        DECISIONS.push({ id: r.id, kind: 'report', title: r.item_title, decision: 'approved', note: 'टिप्पणी-मात्र: ' + r.wrong_note.slice(0, 120), by, at: r.decided_at });
      }
    }
    drawStats(); drawQueue(); drawDecisions(); renderReports();
    await persistReports('verify-panel: जन-रिपोर्ट स्वीकृत — ' + r.item_title);
  }
  async function rejectReport(r) {
    const reason = prompt('अस्वीकृति का कारण (audit-log + रिपोर्ट-स्थिति में दर्ज होगा):', 'प्रमाण अपर्याप्त / दायरा-नीति');
    if (reason === null) return;
    r.status = 'rejected'; r.admin_note = reason; r.decided_by = SESSION.email + ' (' + SESSION.role + ')'; r.decided_at = new Date().toISOString();
    DECISIONS.push({ id: r.id, kind: 'report', title: r.item_title, decision: 'rejected', note: reason, by: r.decided_by, at: r.decided_at });
    drawDecisions(); renderReports();
    await persistReports('verify-panel: जन-रिपोर्ट अस्वीकृत — ' + r.item_title);
  }
  function repCard(r) {
    const open = r.status === 'new' || r.status === 'reviewing';
    const rows = (r.fields || []).map(f => `<tr><td>${esc(f.field)}</td><td style="color:#8a8378">${esc(String(f.current || '—').slice(0, 120))}</td><td><b>${esc(String(f.proposed || ''))}</b></td></tr>`).join('');
    return `<div style="border:1px solid var(--line);border-radius:12px;padding:10px;margin:10px 0;background:var(--paper2)">
      <p style="margin:0"><b>${r.status === 'accepted' ? '✅' : r.status === 'rejected' ? '❌' : '🆕'} ${esc(r.item_title)}</b>
        <span class="kind-badge">${KIND_HI[r.kind] || esc(r.kind)}</span>${r.new_entry ? ' <span class="kind-badge">➕ नई प्रविष्टि-सुझाव</span>' : ''}</p>
      <p class="muted small" style="margin:3px 0">प्रेषक: <b>${esc((r.reporter || {}).email || '?')}</b>${(r.reporter || {}).verified ? ' (Gmail-सत्यापित ✓)' : ''}${(r.reporter || {}).name ? ' · ' + esc(r.reporter.name) : ''} · ${esc((r.ts || '').slice(0, 16).replace('T', ' '))}</p>
      ${rows ? `<table class="rpt-tbl"><tr><th>फ़ील्ड</th><th>हमारा मान</th><th>प्रस्तावित सुधार</th></tr>${rows}</table>` : ''}
      ${r.new_entry ? `<p class="small" style="margin:4px 0">📄 ${esc(JSON.stringify(r.new_entry).slice(0, 400))}</p>` : ''}
      ${r.wrong_note ? `<p class="small" style="margin:4px 0">💬 ${esc(r.wrong_note)}</p>` : ''}
      <p class="muted small" style="margin:4px 0">प्रमाण: ${(r.evidence || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 44))}↗</a>`).join(' · ') || '—'}</p>
      ${r.admin_note ? `<p class="small" style="margin:3px 0">📝 कारण: ${esc(r.admin_note)}</p>` : ''}
      ${open ? `<div class="q-actions"><button class="btn ok sm" data-racc="${esc(r.id)}">✓ स्वीकार (सुधार कतार में)</button><button class="btn bad sm" data-rrej="${esc(r.id)}">✗ अस्वीकार</button></div>` : `<p class="muted small">${esc(r.decided_by || '')} · ${esc((r.decided_at || '').slice(0, 16).replace('T', ' '))}</p>`}
    </div>`;
  }
  function renderReports() {
    const box = $('#adm-reports'); if (!box) return;
    const open = REPORTS.filter(r => r.status === 'new' || r.status === 'reviewing');
    const done = REPORTS.filter(r => r.status !== 'new' && r.status !== 'reviewing');
    box.innerHTML = `<h3>📥 जन-रिपोर्ट इनबॉक्स — केवल व्यक्ति-प्रेषित (सत्यापित Gmail, strict)</h3>
      <p class="muted small">${REPORTS.length} कुल · ${open.length} खुली · ${done.length} निपटाई · स्वीकार → सुधार-कतार (audit) → 📦 प्रकाशन पर मास्टर में लागू · स्थिति-बदलाव repo में सहेजा जाता है</p>
      ${open.map(repCard).join('') || '<div class="card"><p class="muted">🎉 कोई खुली जन-रिपोर्ट नहीं।</p></div>'}
      ${done.length ? `<details style="margin-top:8px"><summary class="muted small" style="cursor:pointer">निपटाई गई रिपोर्ट्स (${done.length})</summary>${done.slice(0, 40).map(repCard).join('')}</details>` : ''}`;
    $$('#adm-reports [data-racc]').forEach(b => b.onclick = () => { const r = REPORTS.find(x => x.id === b.dataset.racc); if (r) acceptReport(r); });
    $$('#adm-reports [data-rrej]').forEach(b => b.onclick = () => { const r = REPORTS.find(x => x.id === b.dataset.rrej); if (r) rejectReport(r); });
  }

  /* ============ 📊 रिपोर्ट-पैनल (स्व-निर्मित संरचना) ============ */
  let rptPeriod = 'all', CONF = {};
  function setView(v) {
    ['queue', 'storage', 'report', 'reports'].forEach(k => { const el = $('#view-' + k); if (el) el.classList.toggle('hidden', k !== v); });
    $$('#adm-views .vw-chip').forEach(b => b.classList.toggle('active', b.dataset.v === v));
    if (v === 'report') drawReport();
    if (v === 'reports') renderReports();
  }
  function initViews() { $$('#adm-views .vw-chip').forEach(b => b.onclick = () => setView(b.dataset.v)); }
  function cutoff() { return rptPeriod === 'all' ? null : new Date(Date.now() - (+rptPeriod) * 864e5).toISOString(); }
  function decInPeriod() { const c = cutoff(); return c ? DECISIONS.filter(d => (d.at || '') >= c) : DECISIONS.slice(); }
  function donut(segs) {
    const total = segs.reduce((s, x) => s + x.value, 0);
    const r = 42, C = 2 * Math.PI * r; let off = 0;
    const arcs = segs.filter(x => x.value).map(x => {
      const f = x.value / (total || 1);
      const el = `<circle r="${r}" cx="59" cy="59" fill="none" stroke="${x.color}" stroke-width="15" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off * C).toFixed(1)}" transform="rotate(-90 59 59)"/>`;
      off += f; return el;
    }).join('');
    return `<svg width="112" height="112" viewBox="0 0 118 118" style="display:block;margin:0 auto">${arcs}<text x="59" y="56" text-anchor="middle" font-size="21" font-weight="700" fill="currentColor">${total}</text><text x="59" y="72" text-anchor="middle" font-size="9" fill="#999">कुल</text></svg>
      <div class="small" style="margin-top:6px">${segs.map(x => `<span style="margin-right:9px;white-space:nowrap"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${x.color}"></i> ${esc(x.label)}: <b>${x.value}</b></span>`).join('')}</div>`;
  }
  function barRows(pairs, color) {
    const mx = Math.max(1, ...pairs.map(p => p.value));
    return pairs.map(p => `<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span class="small" style="flex:0 0 92px;overflow:hidden;text-overflow:ellipsis">${esc(p.label)}</span><div style="flex:1;background:var(--paper);border-radius:6px;height:12px"><div style="width:${(p.value / mx * 100).toFixed(0)}%;height:12px;background:${color};border-radius:6px"></div></div><b class="small" style="flex:0 0 28px;text-align:right">${p.value}</b></div>`).join('');
  }
  function rptAgg() {
    const H = window.GW_HEROES || { persons: [] }, P = window.GW_PLACES || { places: [] }, X = window.GW_EXTRA || { festivals: [] };
    const pend = QUEUE.filter(q => q.status === 'pending');
    const appr = QUEUE.filter(q => q.status === 'approved'), rej = QUEUE.filter(q => q.status === 'rejected');
    const auto = appr.filter(q => (q.decided_by || '').startsWith('automation'));
    const scores = Object.values(EVID).map(v => v.score);
    const llm = Object.values(EVID).filter(v => v.llm);
    const vc = {}; Object.values(EVID).forEach(v => vc[v.verdict] = (vc[v.verdict] || 0) + 1);
    const cats = {}; H.persons.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
    const gps = {}; P.places.forEach(p => { const k = p.gps_precision || 'अज्ञात'; gps[k] = (gps[k] || 0) + 1; });
    const lic = {}; MEDIA.forEach(m => lic[m.license] = (lic[m.license] || 0) + 1);
    const mstat = {}; MEDIA.forEach(m => mstat[m.status] = (mstat[m.status] || 0) + 1);
    const R = window.GW_REGIONS || { units: [], meta: {} };
    const cov = R.meta.coverage || {};
    const jobs = (CRAWL && CRAWL.jobs) || [];
    const jc = { done: 0, pending: 0, blocked: 0 };
    jobs.forEach(j => jc[j.status] = (jc[j.status] || 0) + 1);
    const stories = R.units.reduce((n, u) => n + (u.entities || []).filter(e => e.kind === 'story').length, 0);
    return { H, P, X, pend, appr, rej, auto, scores, llm, vc, cats, gps, lic, mstat, dec: decInPeriod(), cov, jc, jobs: jobs.length, stories };
  }
  function conflictsTbl() {
    const rows = [];
    Object.entries(CONF).forEach(([id, e]) => {
      if (!e) return;
      (e.conflicts || []).forEach(c => rows.push(`<tr><td>${esc((e.title || e.id || id).slice(0, 26))}</td><td>${esc(c.field)}</td><td><b>${esc(String(c.ours))}</b></td><td><b>${esc(String(c.theirs))}</b></td><td>${esc(c.source)}</td></tr>`));
    });
    return rows.length ? `<table class="rpt-tbl"><tr><th>प्रविष्टि</th><th>फ़ील्ड</th><th>हमारा</th><th>विरोधी मान</th><th>स्रोत</th></tr>${rows.join('')}</table>` : '<p class="muted small">कोई विरोध नहीं 🎉</p>';
  }
  async function loadConflicts() {
    const ids = Object.entries(EVID).filter(([, v]) => v.verdict === 'conflict').map(([k]) => k);
    await Promise.all(ids.map(async id => {
      if (CONF[id] !== undefined) return;
      CONF[id] = null;
      try { CONF[id] = await fetch('review/evidence/' + id.replace(/[^A-Za-z0-9._-]/g, '_') + '.json', { cache: 'no-store' }).then(r => r.json()); } catch (e) {}
    }));
    const box = $('#rpt-conflicts'); if (box) box.innerHTML = conflictsTbl();
  }
  function actionsList(A) {
    const acts = [];
    const nc = (Object.values(CONF).filter(Boolean).reduce((n, e) => n + (e.conflicts || []).length, 0)) || Object.values(EVID).filter(v => v.verdict === 'conflict').length;
    if (nc) acts.push(`🔴 <b>${nc} तिथि/तथ्य विरोध</b> — आपका निर्णय आवश्यक (नीचे तालिका); पैनल में ✎ से सुधारकर ✓ करें`);
    const ns = QUEUE.filter(q => q.status === 'pending' && q.kind === 'person' && (EVID[q.id] || {}).verdict === 'nosource').length;
    if (ns) acts.push(`⚪ <b>${ns} नायक निःस्रोत</b> — विकिपीडिया/विकिडेटा पर प्रलेखन नहीं; स्वयं स्रोत जोड़ें या अस्वीकृत करें`);
    const slots = QUEUE.filter(q => q.status === 'pending' && q.kind === 'photo' && !(q.payload && q.payload.photo)).length;
    if (slots) acts.push(`📷 <b>${slots} फ़ोटो-स्लॉट</b> प्रस्ताव-प्रतीक्षित — संग्रहण में सत्यापित इमेज से 📸 प्रस्ताव भेजें`);
    const badlic = MEDIA.filter(m => m.status !== 'rejected' && ['unknown', 'copyright-pending'].includes(m.license)).length;
    if (badlic) acts.push(`© <b>${badlic} मीडिया</b> का license अज्ञात/जाँच-बाकी — होस्टिंग से पूर्व स्पष्ट करें`);
    const rp = QUEUE.filter(q => q.status === 'pending' && (q.kind === 'region' || q.kind === 'story')).length;
    if (rp) acts.push(`🗺️ <b>${rp} क्षेत्र/लोक-कथा प्रविष्टियाँ</b> सत्यापन-प्रतीक्षित — क्षेत्र-क्रॉलर ने भेजी हैं; ✓ करने पर क्षेत्र-कोश में जुड़ेंगी`);
    if (A.jc.blocked) acts.push(`🗺️ <b>${A.jc.blocked} क्षेत्र-इकाइयाँ blocked</b> — विकिपीडिया पर पर्याप्त सामग्री नहीं; आधिकारिक पंचायत-डेटा/मैन्युअल शोध चरण आवश्यक`);
    if (MEDIA_DIRTY || CREDS_DIRTY) acts.push('📦 <b>अप्रकाशित परिवर्तन</b> लंबित — कतार-दृश्य के 📦 खंड से प्रकाशित करें');
    return acts.length ? acts.map(x => `<div class="rpt-act">${x}</div>`).join('') : '<div class="rpt-act">🎉 कोई लंबित कार्रवाई नहीं</div>';
  }
  function drawReport() {
    const A = rptAgg();
    const avg = A.scores.length ? Math.round(A.scores.reduce((a, b) => a + b, 0) / A.scores.length) : 0;
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(5, 10);
      days.push({ label: d, value: DECISIONS.filter(x => (x.at || '').slice(0, 10) === d).length });
    }
    const humAuto = [
      { label: 'automation', value: DECISIONS.filter(d => (d.by || '').startsWith('automation')).length, color: '#2563eb' },
      { label: 'मानव', value: DECISIONS.filter(d => !(d.by || '').startsWith('automation')).length, color: '#16a34a' }];
    $('#adm-report').innerHTML = `
      <h3>📊 सत्यापन-रिपोर्ट</h3>
      <p class="muted small">जनित: ${new Date().toLocaleString('hi-IN')} · अवधि-फ़िल्टर निर्णयों व KPI पर लागू · स्रोत: कतार, audit-log, evidence-index, manifest, मास्टर-DB</p>
      <div class="q-actions">
        <button class="chip ${rptPeriod === 'all' ? 'active' : ''}" data-rp="all">सभी समय</button>
        <button class="chip ${rptPeriod === '30' ? 'active' : ''}" data-rp="30">30 दिन</button>
        <button class="chip ${rptPeriod === '7' ? 'active' : ''}" data-rp="7">7 दिन</button>
        <button class="btn ghost sm" id="rpt-print">🖨️ प्रिंट/PDF</button>
        <button class="btn ghost sm" id="rpt-json">📥 JSON</button>
        <button class="btn ghost sm" id="rpt-md">📋 Markdown</button>
        <button class="btn ghost sm" id="rpt-refresh">🔄 ताज़ा</button>
      </div>
      <div class="rpt-kpis">
        <div class="st"><b>${A.pend.length}</b><span>समीक्षा-बाकी</span></div>
        <div class="st"><b>${A.dec.length}</b><span>निर्णय (अवधि)</span></div>
        <div class="st"><b>${A.auto.length}</b><span>स्वतः-स्वीकृत (audit)</span></div>
        <div class="st"><b>${A.rej.length}</b><span>अस्वीकृत</span></div>
        <div class="st"><b>${avg}</b><span>औसत स्व-सत्यापन स्कोर</span></div>
        <div class="st"><b>${A.llm.length}</b><span>LLM-जाँची</span></div>
        <div class="st"><b>${A.mstat.verified || 0}</b><span>संग्रहण-सत्यापित</span></div>
      </div>
      <div class="rpt-grid">
        <div class="rpt-box"><h4>कतार-स्थिति</h4>${donut([
          { label: 'बाकी', value: A.pend.length, color: '#f59e0b' },
          { label: 'स्वीकृत', value: A.appr.length, color: '#16a34a' },
          { label: 'अस्वीकृत', value: A.rej.length, color: '#dc2626' }])}</div>
        <div class="rpt-box"><h4>प्रकार-वार समीक्षा-बाकी</h4>${barRows(Object.entries(A.pend.reduce((m, q) => (m[q.kind] = (m[q.kind] || 0) + 1, m), {})).map(([k, v]) => ({ label: KIND_HI[k] || k, value: v })), '#b4531a')}</div>
        <div class="rpt-box"><h4>स्व-सत्यापन verdict वितरण</h4>${barRows(Object.entries(A.vc).map(([k, v]) => ({ label: k, value: v })), '#123f2a')}</div>
        <div class="rpt-box"><h4>निर्णय-प्रवृत्ति (14 दिन)</h4>${barRows(days, '#2563eb')}</div>
        <div class="rpt-box"><h4>निर्णय-कर्ता</h4>${donut(humAuto)}</div>
        <div class="rpt-box"><h4>डेटा-गुणवत्ता (मास्टर DB)</h4>
          <table class="rpt-tbl">
            <tr><td>नायक</td><td><b>${A.H.persons.length}</b> · 🎂 ${A.H.persons.filter(p => p.birth_date).length} · 🕊️ ${A.H.persons.filter(p => p.death_date).length} · 📷-रिक्त ${A.H.persons.filter(p => !p.photo).length} · ⚠ verify ${A.H.persons.filter(p => p.verify).length}</td></tr>
            <tr><td>स्थल</td><td><b>${A.P.places.length}</b> · ⚠ verify ${A.P.places.filter(p => p.verify).length}</td></tr>
            <tr><td>GPS-सटीकता</td><td>${Object.entries(A.gps).map(([k, v]) => esc(k) + ': ' + v).join(' · ')}</td></tr>
            <tr><td>पर्व</td><td><b>${A.X.festivals.length}</b> · ⚠ verify ${A.X.festivals.filter(f => f.verify).length}</td></tr>
            <tr><td>श्रेणियाँ</td><td>${Object.entries(A.cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => esc(k) + ': ' + v).join(' · ')}</td></tr>
          </table></div>
        <div class="rpt-box"><h4>संग्रहण-स्थिति</h4>${barRows(Object.entries(A.mstat).map(([k, v]) => ({ label: STATUS_HI[k] ? STATUS_HI[k].slice(2) : k, value: v })), '#9d174d')}
          <h4 style="margin-top:8px">License वितरण</h4>${barRows(Object.entries(A.lic).map(([k, v]) => ({ label: LICENSE_HI[k] || k, value: v })), '#9ca3af')}</div>
        <div class="rpt-box"><h4>🗺️ क्षेत्र-कोश कवरेज</h4>
          <table class="rpt-tbl">
            <tr><td>इकाइयाँ</td><td>${A.cov.states || 0} राज्य · ${A.cov.districts || 0} जिला · ${A.cov.tehsils || 0} तहसील · ${A.cov.posts || 0} पोस्ट · ${A.cov.panchayats || 0} पंचायत · ${A.cov.villages || 0} गाँव</td></tr>
            <tr><td>प्रविष्टियाँ</td><td><b>${A.cov.entities || 0}</b> (पर्व/मान्यता/महापुरुष/शहीद/क्रांतिकारी/स्थल) · 📜 लोक-कथाएँ: ${A.stories}</td></tr>
          </table>
          <h4 style="margin-top:8px">क्रॉल-चैकलिस्ट (कोई छूटे नहीं)</h4>${barRows([{ label: 'पूर्ण', value: A.jc.done || 0 }, { label: 'बाकी', value: A.jc.pending || 0 }, { label: 'blocked', value: A.jc.blocked || 0 }], '#0e7490')}
          <p class="muted small" style="margin:4px 0 0">कुल jobs: ${A.jobs || 0} · BFS: राज्य→जिला→तहसील (रात्रि 3:00 IST स्वचालित)</p></div>
        <div class="rpt-box" style="grid-column:1/-1"><h4>🔴 विरोध-सूची (हमारा बनाम स्वतंत्र स्रोत)</h4><div id="rpt-conflicts"><p class="muted small">लोड हो रही है…</p></div></div>
        <div class="rpt-box" style="grid-column:1/-1"><h4>✅ हाइब्रिड स्वतः-स्वीकृतियाँ (audit-log)</h4>${A.auto.length ? `<table class="rpt-tbl"><tr><th>प्रविष्टि</th><th>स्कोर</th><th>निर्णय-समय</th></tr>${A.auto.map(q => `<tr><td>${esc(q.title)}</td><td>${(EVID[q.id] || {}).score ?? '—'}</td><td>${esc((q.decided_at || '').slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}</table>` : '<p class="muted small">अभी कोई नहीं</p>'}</div>
        <div class="rpt-box" style="grid-column:1/-1"><h4>📌 आवश्यक कार्रवाई (प्राथमिकता-क्रम)</h4>${actionsList(A)}</div>
        <div class="rpt-box" style="grid-column:1/-1"><h4>📜 अंतिम 15 निर्णय</h4>${DECISIONS.slice(-15).reverse().map(d => `<div class="small" style="border-bottom:1px dashed var(--line);padding:3px 0">${d.decision === 'approved' ? '✅' : '❌'} <b>${esc(d.title)}</b> — ${esc(d.by)} · ${esc((d.at || '').slice(0, 16).replace('T', ' '))}</div>`).join('') || '<p class="muted small">कोई निर्णय नहीं</p>'}</div>
      </div>
      <p class="muted small" style="margin-top:10px">रिपोर्ट-इंजन v1.0 · प्रिंट में केवल रिपोर्ट छपेगी (print-CSS) · डेटा कभी fabricate नहीं — केवल मास्टर-फ़ाइलों से</p>`;
    $$('#adm-report [data-rp]').forEach(b => b.onclick = () => { rptPeriod = b.dataset.rp; drawReport(); });
    $('#rpt-print').onclick = () => window.print();
    $('#rpt-refresh').onclick = () => drawReport();
    $('#rpt-json').onclick = () => download('gondwana-report-' + todayStr() + '.json', JSON.stringify({ generated: new Date().toISOString(), period: rptPeriod, kpis: { pending: A.pend.length, decided: A.dec.length, auto_approved: A.auto.length, rejected: A.rej.length, avg_score: avg, llm_checked: A.llm.length }, verdicts: A.vc, categories: A.cats, gps: A.gps, licenses: A.lic, media: A.mstat, decisions: A.dec }, null, 1));
    $('#rpt-md').onclick = () => {
      const L = ['# गोंडवाना सत्यापन-रिपोर्ट', '', 'जनित: ' + new Date().toLocaleString('hi-IN') + ' · अवधि: ' + rptPeriod, '',
        '## KPI', `- समीक्षा-बाकी: ${A.pend.length}`, `- निर्णय (अवधि): ${A.dec.length}`, `- स्वतः-स्वीकृत: ${A.auto.length}`, `- अस्वीकृत: ${A.rej.length}`, `- औसत स्कोर: ${avg}`, `- LLM-जाँची: ${A.llm.length}`, '',
        '## Verdict वितरण', ...Object.entries(A.vc).map(([k, v]) => `- ${k}: ${v}`), '',
        '## विरोध', ...Object.values(CONF).filter(Boolean).flatMap(e => (e.conflicts || []).map(c => `- ${e.title || e.id}: ${c.field} हमारा=${c.ours} बनाम ${c.source}=${c.theirs}`)), '',
        '## आवश्यक कार्रवाई', ...actionsList(A).map(x => '- ' + x.replace(/<[^>]+>/g, '')), '',
        '## डेटा-गुणवत्ता', `- नायक ${A.H.persons.length} (जन्म-तिथि ${A.H.persons.filter(p => p.birth_date).length}, निधन ${A.H.persons.filter(p => p.death_date).length})`, `- स्थल ${A.P.places.length}, पर्व ${A.X.festivals.length}`, ''].join('\n');
      download('gondwana-report-' + todayStr() + '.md', L);
    };
    loadConflicts();
  }

  /* ============ 🗄️ संग्रहण — मीडिया लाइब्रेरी ============ */
  function manifestText() { return JSON.stringify({ meta: MAN_META, items: MEDIA }, null, 1); }
  function queueText() { return JSON.stringify({ meta: { title: 'गोंडवाना समीक्षा-कतार', updated: new Date().toISOString() }, queue: QUEUE }, null, 1); }
  function decText() { return JSON.stringify({ meta: { title: 'निर्णय-लॉग (audit trail)' }, decisions: DECISIONS }, null, 1); }
  async function ghCommit(files, msg) {
    const pat = $('#pub-pat').value.trim();
    if (!pat) return false;
    const H = { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const ref = await gh(H, `git/ref/heads/${BRANCH}`);
    const head = ref.object.sha;
    const base = await gh(H, `git/commits/${head}`);
    const treeItems = [];
    for (const [p, text] of Object.entries(files)) {
      const blob = await gh(H, 'git/blobs', { method: 'POST', body: { content: b64(text), encoding: 'base64' } });
      treeItems.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha } );
    }
    const tree = await gh(H, 'git/trees', { method: 'POST', body: { base_tree: base.tree.sha, tree: treeItems } });
    const commit = await gh(H, 'git/commits', { method: 'POST', body: { message: msg, tree: tree.sha, parents: [head] } });
    await gh(H, `git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: commit.sha } });
    return true;
  }
  async function persistDecisions(msg) {
    try {
      const ok = await ghCommit({ 'review/pending.json': queueText(), 'review/decisions.json': decText() }, msg || 'verify-panel: निर्णय दर्ज — कतार अद्यतन');
      if (ok) { localStorage.removeItem('gw-draft-dec'); logLine('☁️ निर्णय repo में commit हो गए — कतार अब हर जगह अद्यतन (दोबारा नहीं दिखेगी)।'); }
      else { localStorage.setItem('gw-draft-dec', JSON.stringify(DECISIONS.slice(-300))); toastLine('निर्णय लोकल-ड्राफ़्ट में सहेजे — PAT डालें तो तुरंत commit, वरना 📦 प्रकाशन पर'); }
    } catch (e) { localStorage.setItem('gw-draft-dec', JSON.stringify(DECISIONS.slice(-300))); logLine('⚠ commit विफल (' + e.message + ') — निर्णय लोकल-ड्राफ़्ट में सुरक्षित'); }
    drawStats(); drawQueue();
  }
  function applyDraft() {
    let d = []; try { d = JSON.parse(localStorage.getItem('gw-draft-dec') || '[]'); } catch (e) { d = []; }
    if (!d.length) return;
    const have = new Set(DECISIONS.map(x => x.id + '|' + x.at));
    for (const dec of d) {
      if (have.has(dec.id + '|' + dec.at)) continue;
      const q = QUEUE.find(x => x.id === dec.id);
      if (q && q.status === 'pending') { q.status = dec.decision; q.decided_by = dec.by; q.decided_at = dec.at; q.note = dec.note || ''; }
      DECISIONS.push(dec);
    }
  }
  function isPhotoSlot(q) { return q.kind === 'photo' && !(q.payload && q.payload.photo); }
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
          ${m.status === 'verified' && String(m.attach_to || '').startsWith('person:') ? `<button class="btn ghost sm" data-m="propose">📸 फ़ोटो प्रस्ताव</button>` : ''}
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
      if (q('propose')) q('propose').onclick = () => {
        const pid = String(m.attach_to).slice(7);
        let it = QUEUE.find(x => x.kind === 'photo' && x.record_id === pid);
        if (!it) {
          it = { id: 'photo:' + pid, kind: 'photo', subtype: 'photo-approval', title: 'फ़ोटो: ' + m.title, subtitle: 'संग्रहण-प्रस्ताव', reason: 'फ़ोटो जोड़ने से पहले लाइसेंस-स्रोत सत्यापित करें', source_file: 'mahapurush_database.json', record_id: pid, payload: { id: pid, photo: null }, status: 'pending', added: todayStr(), added_by: 'panel:' + SESSION.email, decision: null, decided_by: null, decided_at: null, note: '' };
          QUEUE.push(it);
        }
        it.payload.photo = mdSrc(m); it.payload.photo_source = m.source + ' · license: ' + m.license;
        it.payload.photo_license = m.license; it.status = 'pending'; it.proposed_from = m.id;
        toastLine('📸 फ़ोटो-प्रस्ताव कतार में — लाइसेंस जाँचकर ✓ करें');
        persistDecisions('verify-panel: फ़ोटो-प्रस्ताव — ' + m.title);
        drawStats(); drawQueue();
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
  window.__ADMIN = { buildOutputs, outputFiles, decide, QUEUE: () => QUEUE, MEDIA: () => MEDIA, EVID: () => EVID, manifestText };
})();
