/* ============ Gondwana Calendar App — app.js ============ */
(function () {
  'use strict';
  function fmtDateHi(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (+m[3] + ' ' + HI_MONTHS[+m[2] - 1] + ' ' + m[1]) : (iso || '');
  }

  const D = window.GW_DATA, X = window.GW_EXTRA, E = window.GWEngine, G = window.Gondi, H = window.GW_HEROES, PL = window.GW_PLACES;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const HI_MONTHS = ['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];
  const HI_MONTHS_S = ['जन','फ़र','मार्च','अप्र','मई','जून','जुल','अग','सित','अक्टू','नव','दिस'];
  const HI_DAYS = ['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'];
  const EN_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const today = new Date();
  const state = {
    region: localStorage.getItem('gw-region') || 'balaghat',
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    sel: E.dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    tab: 'home', view: 'month', rgn: { state: '', district: '', tehsil: '', post: '', panchayat: '', village: '' }, storyFilter: '',
    festFilter: 'all',
    zones: new Set(['north', 'west', 'south', 'east']),
    convDir: 1
  };
  const cityOf = () => X.cities.find(c => c.id === state.region) || X.cities[0];

  let FEST = null, FEST_YEAR = null, FEST_CITY = null;
  function festivals(force) {
    const c = cityOf();
    if (!force && FEST && FEST_YEAR === state.year && FEST_CITY === c.id) return FEST;
    FEST = E.festivalsForYear(state.year, X.festivals, X.commemorative, c);
    FEST_YEAR = state.year; FEST_CITY = c.id;
    return FEST;
  }
  const festById = id => X.festivals.find(f => f.id === id);
  const isGond = f => /Vahia|AGPE|कैलेंडर|Sahapedia|लोक-परंपरा|समुदाय/.test(f.source || '') || ['punal-saal','madai','bastar-dussehra','keslapur-jatra','medaram-jatra','karma','hareli','holi','diwali'].includes(f.id);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtKey(key, short) {
    if (!key) return '—';
    const [y, m, d] = key.split('-').map(Number);
    return d + ' ' + (short ? HI_MONTHS_S[m - 1] : HI_MONTHS[m - 1]) + ' ' + y;
  }
  function diOf(key) { const [y, m, d] = key.split('-').map(Number); return E.dayInfo(y, m, d, cityOf()); }
  function weekdayOf(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCDay();
  }
  function gondiWeekday(y, m, d) {
    const wd = weekdayOf(y, m, d);
    const w = (D.weekdays || []).find(x => x.english === EN_DAYS[wd]) || (D.weekdays || [])[wd];
    return w || { gondi: '', deva: '', masram: '', hindi: HI_DAYS[wd] };
  }

  /* ---------- moon SVG ---------- */
  function moonSVG(phase, r) {
    r = r || 40;
    const k = Math.cos(2 * Math.PI * phase), rx = Math.max(0.4, Math.abs(k) * r);
    const wax = phase < 0.5;
    const outer = wax ? `M0,${-r} A${r},${r} 0 0 1 0,${r}` : `M0,${-r} A${r},${r} 0 0 0 0,${r}`;
    const inner = (wax === (k > 0)) ? `A${rx},${r} 0 0 0 0,${-r}` : `A${rx},${r} 0 0 1 0,${-r}`;
    return `<svg width="${r * 2 + 6}" height="${r * 2 + 6}" viewBox="${-r - 3} ${-r - 3} ${r * 2 + 6} ${r * 2 + 6}">
      <circle r="${r}" fill="#3b3226" stroke="#c9a86a" stroke-width="1.5"/>
      <path d="${outer} ${inner} Z" fill="#ffe9a8"/>
      <circle cx="${-r * 0.35}" cy="${-r * 0.25}" r="${r * 0.13}" fill="#00000012"/>
      <circle cx="${r * 0.3}" cy="${r * 0.35}" r="${r * 0.1}" fill="#00000010"/>
    </svg>`;
  }

  /* ---------- bottom nav ---------- */
  const NAV_ALL = [
    { id: 'home', lbl: 'होम', ico: '<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z"/>' },
    { id: 'calendar', lbl: 'कैलेंडर', ico: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
    { id: 'festivals', lbl: 'पर्व', ico: '<path d="M12 3c1 3-1 4.5-1 6.5a2.5 2.5 0 005 0C16 7 14 5.5 14 3c3 2.5 5 5 5 8a7 7 0 11-14 0c0-3 2-5.5 5-8z" transform="translate(2,2) scale(0.85)"/>' },
    { id: 'panchang', lbl: 'पंचांग', ico: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>' },
    { id: 'map', lbl: 'नक्शा', ico: '<path d="M12 21s-7-6.1-7-11a7 7 0 1114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>' },
    { id: 'heroes', lbl: 'महापुरुष', ico: '<circle cx="12" cy="7" r="3.4"/><path d="M5 21c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5"/>' },
    { id: 'places', lbl: 'स्थल', ico: '<path d="M12 21s-7-6.1-7-11a7 7 0 1114 0c0 4.9-7 11-7 11z"/><path d="M9.5 10.5l1.8 1.8 3.4-3.4"/>' },
    { id: 'regions', lbl: 'क्षेत्र-कोश', ico: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>' },
    { id: 'stories', lbl: 'लोक-कथाएँ', ico: '<path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z"/><path d="M4 17h15M8 7h8M8 11h8"/>' },
    { id: 'lipi', lbl: 'गोंडी लिपि', ico: '<path d="M4 20l4.5-1.2L19 8.3a2.1 2.1 0 00-3-3L5.5 15.8z"/>' },
    { id: 'learn', lbl: 'सीखें', ico: '<path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z"/><path d="M4 17h15"/>' },
    { id: 'settings', lbl: 'सेटिंग्स', ico: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>' }
  ];
  const NAV_M = ['home', 'calendar', 'festivals', 'map'].map(id => NAV_ALL.find(n => n.id === id))
    .concat([{ id: 'more', lbl: 'और', ico: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>' }]);
  function navBtn(n, active) {
    return `<button data-tab="${n.id}" class="${active === n.id ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${n.ico}</svg>${n.lbl}</button>`;
  }
  function buildNav() {
    const nav = document.createElement('nav');
    nav.className = 'bottom';
    nav.innerHTML = NAV_M.map(n => navBtn(n, state.tab)).join('');
    document.body.appendChild(nav);
    const side = document.createElement('aside');
    side.className = 'side';
    side.innerHTML = '<div class="side-logo">🌿 गोंडवाना<br><span>कैलेंडर</span></div>' + NAV_ALL.map(n => navBtn(n, state.tab)).join('');
    document.body.appendChild(side);
    const handler = e => { const b = e.target.closest('button[data-tab]'); if (!b) return; setTab(b.dataset.tab); };
    nav.addEventListener('click', handler);
    side.addEventListener('click', handler);
  }
  function setTab(id) {
    state.tab = id;
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + id));
    $$('nav.bottom button, aside.side button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    if (id === 'festivals') renderFestivals();
    if (id === 'panchang') renderPanchang();
    if (id === 'map') renderMap();
    if (id === 'heroes') renderHeroes();
    if (id === 'places') renderPlaces();
    if (id === 'regions') renderRegions();
    if (id === 'stories') renderStories();
    if (id === 'home') renderHome();
    if (id === 'lipi') renderLipi();
    if (id === 'settings') renderSettings();
    if (id === 'more') renderMore();
    window.scrollTo({ top: 0 });
  }

  /* ---------- header ---------- */
  function buildHeader() {
    $('#hero-masram').textContent = G.convert('गोंडवाना कैलेंडर');
    const sel = $('#sel-region');
    sel.innerHTML = X.cities.map(c => `<option value="${c.id}" ${c.id === state.region ? 'selected' : ''}>${c.name} (${c.state})</option>`).join('');
    sel.onchange = () => { state.region = sel.value; localStorage.setItem('gw-region', sel.value); festivals(true); renderAll(); toast('क्षेत्र: ' + cityOf().name + ' — सूर्योदय व पर्व स्थानीय गणना अनुसार'); };
  }

  /* ---------- calendar tab ---------- */
  function renderCalendar() {
    const yv = $('#cal-yearview'), mv = $('#cal-monthview');
    if (state.view === 'year') {
      if (yv) yv.style.display = ''; if (mv) mv.style.display = 'none';
      drawYearView(); return;
    }
    if (yv) yv.style.display = 'none'; if (mv) mv.style.display = '';
    const y = state.year, m = state.month, c = cityOf();
    $('#cal-ym').textContent = HI_MONTHS[m - 1] + ' ' + y;
    $('#cal-ym-gon').textContent = ' ' + E.gondiDigits(y);
    const mid = E.dayInfo(y, m, Math.min(15, E.daysInMonth(y, m)), c);
    $('#cal-ym-sub').textContent = 'गोंडी माह: ' + (mid.amanta ? mid.amanta.gondi : '—') + (mid.amanta && mid.amanta.adhika ? ' · धोंडा (अधिक मास)' : '');

    // month band: solar gondi + hindi pairing + lunar gondi
    const solar = D.months_solar_gondi_variantA.list[m - 1];
    const pairKey = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][m - 1];
    const pair = (D.hindi_lunar_months_pairing[pairKey] || []).join(' · ');
    $('#monthband').innerHTML = `
      <div class="mb-cell"><div class="mas">${solar.masram || ''}</div><div class="dev">${solar.deva} (सौर)</div><div class="pair">${solar.gondi}</div></div>
      <div class="mb-cell"><div class="dev">${mid.amanta ? mid.amanta.gondi : ''}</div><div class="pair">गोंडी चंद्र माह</div></div>
      <div class="mb-cell"><div class="dev">${mid.amanta ? mid.amanta.deva + ' (अमांत)' : ''}</div><div class="pair">पंचांग माह · ${esc(pair)}</div></div>`;

    // weekday heads
    $('#wk-head').innerHTML = EN_DAYS.map(en => {
      const w = (D.weekdays || []).find(x => x.english === en) || {};
      return `<div class="wk-head"><span class="gon">${w.masram || ''}</span>${w.deva || ''}</div>`;
    }).join('');

    const F = festivals();
    const first = weekdayOf(y, m, 1), n = E.daysInMonth(y, m);
    let html = '';
    for (let i = 0; i < first; i++) html += '<div class="day-cell empty"></div>';
    for (let d = 1; d <= n; d++) {
      const key = E.dateKey(y, m, d);
      const di = E.dayInfo(y, m, d, c);
      const fests = F.byDate[key] || [];
      const wd = weekdayOf(y, m, d);
      const dots = fests.slice(0, 3).map(f => `<span class="fdot ${f.comm ? 'comm' : (isGond(f) ? 'gond' : 'gen')}"></span>`).join('');
      const moon = di.isAmavasya ? '🌑' : (di.isPurnima ? '🌕' : '');
      html += `<div class="day-cell ${wd === 0 ? 'sun' : ''} ${key === E.dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()) ? 'today' : ''} ${key === state.sel ? 'sel' : ''}" data-k="${key}">
        <span class="dnum">${d}</span><span class="dgon">${E.gondiDigits(d)}</span>
        <span class="dtithi">${di.isAmavasya ? 'अमावस' : di.isPurnima ? 'पूनम' : (di.paksha === 'S' ? 'शु' : 'कृ') + di.tnum}</span>
        ${moon ? `<span class="moon-mark">${moon}</span>` : ''}
        <span class="fest-dots">${dots}</span></div>`;
    }
    $('#cal-grid').innerHTML = html;
    $$('#cal-grid .day-cell[data-k]').forEach(cell => cell.onclick = () => { state.sel = cell.dataset.k; openDay(cell.dataset.k); renderCalendar(); });

    // upcoming
    const todayKey = E.dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const up = F.list.filter(x => x.date >= todayKey && x.date.slice(0, 4) == state.year).slice(0, 6);
    $('#upcoming').innerHTML = up.length ? up.map(x => `
      <div class="fest-item" data-open="${x.date}">
        <div class="fest-date"><div class="dd">${x.d}</div><div class="mm">${HI_MONTHS_S[x.m - 1]}</div></div>
        <div class="fest-t"><b>${esc(x.fest.deva)}</b> ${x.fest.comm ? '<span class="badge comm">स्मृति</span>' : (isGond(x.fest) ? '<span class="badge gond">गोंड</span>' : '<span class="badge gen">पंचांग</span>')}
        <div class="rule">${esc(x.fest.meaning || '')}</div></div></div>`).join('') : '<p class="muted">इस वर्ष की सूची पूर्ण — वर्ष बदलकर देखें।</p>';
    $$('#upcoming .fest-item').forEach(elx => elx.onclick = () => openDay(elx.dataset.open));
  }

  /* ---------- day sheet ---------- */
  function openDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    const c = cityOf();
    const di = E.dayInfo(y, m, d, c);
    const w = gondiWeekday(y, m, d);
    const F = festivals();
    const fests = F.byDate[key] || [];
    const solar = D.months_solar_gondi_variantA.list[di.solarGondiIdx];
    // pada/chirdur din (day lengthening/shortening): winter solstice → summer solstice = longer
    const md = m * 100 + d;
    const pada = (md >= 1222 || md <= 621);
    const dayLen = (di.sunrise && di.sunset) ? (() => {
      const [rh, rm] = di.sunrise.split(':').map(Number), [sh, sm] = di.sunset.split(':').map(Number);
      const mins = (sh * 60 + sm) - (rh * 60 + rm); return Math.floor(mins / 60) + ' घं ' + (mins % 60) + ' मि';
    })() : '—';

    let html = `
      <div style="display:flex;align-items:center;gap:12px">
        ${moonSVG(di.phase, 30)}
        <div><div style="font-size:1.15rem;font-weight:800;color:#7c2d12">${d} ${HI_MONTHS[m - 1]} ${y}</div>
        <div class="small"><span class="gon">${w.masram || ''}</span> ${w.deva || w.gondi} · ${HI_DAYS[weekdayOf(y, m, d)]} · ${EN_DAYS[weekdayOf(y, m, d)]}</div></div>
        <div style="margin-left:auto;text-align:right"><div class="gon" style="font-size:1.2rem;color:var(--gold)">${E.gondiDigits(y)}</div>
        <div class="muted" style="font-size:.64rem">गोंडी अंक वर्ष</div></div>
      </div>
      <hr style="border:0;border-top:1px dashed var(--line);margin:10px 0">
      <dl class="kv">
        <dt>तिथि</dt><dd>${di.tithi} <span class="muted">(${di.tithiName})</span></dd>
        <dt>गोंडी तिथि</dt><dd><span class="gon" style="font-size:.95rem"></span>${di.gondiTithi}</dd>
        <dt>पक्ष</dt><dd>${di.paksha === 'S' ? 'शुक्ल (उजिया/उज्जि)' : 'कृष्ण (अधि/अंधियारा)'}</dd>
        <dt>गोंडी चंद्र माह</dt><dd>${di.amanta ? di.amanta.gondi : '—'} ${di.amanta && di.amanta.adhika ? '<span class="flag">धोंडा (अधिक मास)</span>' : ''}</dd>
        <dt>हिंदी माह</dt><dd>${di.amanta ? di.amanta.deva : ''} (अमांत) · ${di.purnimanta.deva} (पूर्णिमांत)</dd>
        <dt>गोंडी सौर माह</dt><dd><span class="gon">${solar ? solar.masram : ''}</span> ${solar ? solar.deva : ''} <span class="muted">(${solar ? solar.gondi : ''})</span></dd>
        <dt>नक्षत्र</dt><dd>${di.nakName}</dd>
        <dt>राशि (सूर्य)</dt><dd>${di.rashiName} ${(() => { const zz = X.rashis[di.rashi]; return zz && zz.gondi ? '· गोंडी: ' + zz.gondi : ''; })()}</dd>
        <dt>ऋतु</dt><dd>${di.rituName}</dd>
        <dt>चंद्र अवस्था</dt><dd>${di.phaseName}</dd>
        <dt>सूर्योदय / सूर्यास्त</dt><dd>${di.sunrise || '—'} / ${di.sunset || '—'} <span class="muted">(दिन: ${dayLen}) — ${c.name}</span></dd>
        <dt>दिन-मान</dt><dd>${pada ? 'पद दिन (दिन बढ़ते हैं)' : 'चिरदुर दिन (दिन घटते हैं)'}</dd>
      </dl>`;
    if (fests.length) {
      html += '<h3 style="color:var(--saffron);margin:14px 0 4px">आज के पर्व 🪔</h3>' + fests.map(f => festCardHTML(f, y)).join('');
    } else {
      html += '<p class="muted" style="margin-top:12px">इस दिन कोई सूचीबद्ध पर्व नहीं।</p>';
    }
    html += `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn" id="day-share">📋 विवरण कॉपी करें</button>
      <button class="btn ghost" id="day-panch">🌙 पंचांग में खोलें</button></div>`;
    openSheet(html);
    $('#day-share').onclick = () => {
      const txt = `${d} ${HI_MONTHS[m - 1]} ${y} | ${w.deva || ''} | ${di.tithi} | गोंडी माह: ${di.amanta ? di.amanta.gondi : ''} | नक्षत्र: ${di.nakName} | सूर्योदय ${di.sunrise}` + (fests.length ? ' | पर्व: ' + fests.map(f => f.deva).join(', ') : '');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('कॉपी हो गया')).catch(() => toast(txt));
    };
    $('#day-panch').onclick = () => { state.sel = key; closeSheet(); setTab('panchang'); };
  }

  function festCardHTML(f, year) {
    const ruleTxt = f.comm ? 'स्मृति दिवस' : f.fixed ? f.fixed[1] + ' ' + HI_MONTHS[f.fixed[0] - 1]
      : f.month ? ({ S: 'शुक्ल', K: 'कृष्ण' })[f.paksha] + ' ' + f.tithi + ' · ' + (E.LUNAR_DEVA[E.LUNAR.indexOf(f.month)]) : (f.greg_hint || '');
    const pin = (X.map_pins || []).find(p => f.id === 'maha-shivratri' && p.id === 'kachargarh' || f.id === 'keslapur-jatra' && p.id === 'keslapur' || f.id === 'medaram-jatra' && p.id === 'medaram' || f.id === 'bastar-dussehra' && p.id === 'jagdalpur' || f.id === 'garha' && p.id === 'garha-mandla');
    let h = `<div class="fest-card">
      <h4>${esc(f.deva)} ${f.comm ? '<span class="badge comm">स्मृति</span>' : (isGond(f) ? '<span class="badge gond">गोंड पर्व</span>' : '<span class="badge gen">पंचांग</span>')}</h4>
      <div class="muted small">${esc(f.meaning || f.note || '')}</div>
      <div class="small" style="margin-top:4px"><b>तिथि-नियम:</b> ${esc(ruleTxt)}${f.greg_hint ? ' · ' + esc(f.greg_hint) : ''}</div>`;
    if (f.story) h += `<div class="small" style="margin-top:4px"><b>कथा/विवरण:</b> ${esc(f.story)}</div>`;
    if (f.ritual) h += `<div class="small" style="margin-top:4px"><b>अनुष्ठान:</b> ${esc(f.ritual)}</div>`;
    if (f.region) h += `<div class="small" style="margin-top:4px"><b>क्षेत्र:</b> ${esc(f.region)}</div>`;
    if (f.variants && f.variants.length) h += f.variants.map(v => `<div class="small" style="margin-top:4px;color:#86198f"><b>क्षेत्रीय रूप:</b> ${esc(v.note)}${v.month ? ' (' + v.month + ' ' + (v.paksha === 'S' ? 'शुक्ल' : 'कृष्ण') + ' ' + v.tithi + ')' : ''}</div>`).join('');
    if (f.verify) h += `<div class="small" style="margin-top:4px"><span class="flag">फील्ड-सत्यापन</span> ${esc(f.verify_note || 'समुदाय से पुष्टि आवश्यक')}</div>`;
    if (f.source) h += `<div class="src">स्रोत: ${esc(f.source)}</div>`;
    if (pin) h += `<button class="btn ghost small" data-pin="${pin.id}" style="margin-top:8px">📍 नक्शे पर देखें — ${esc(pin.deva)}</button>`;
    h += '</div>';
    return h;
  }

  /* ---------- festivals tab ---------- */
  function renderFestivals() {
    const F = festivals();
    $('#fest-title').innerHTML = `पर्व एवं त्योहार — ${state.year} <button class="chip" id="fest-prev">◀</button><button class="chip" id="fest-next">▶</button>`;
    $('#fest-prev').onclick = () => { state.year--; syncYearSel(); renderAll(); };
    $('#fest-next').onclick = () => { state.year++; syncYearSel(); renderAll(); };

    const filters = [['all', 'सभी'], ['gond', 'गोंड पर्व'], ['gen', 'पंचांग'], ['comm', 'स्मृति दिवस']];
    $('#fest-filters').innerHTML = filters.map(([k, l]) => `<button class="chip ${state.festFilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('');
    $$('#fest-filters .chip').forEach(b => b.onclick = () => { state.festFilter = b.dataset.f; renderFestivals(); });

    // seasons
    $('#fest-seasons').innerHTML = '<h3>मौसमी पर्व-चक्र</h3>' + F.seasons.map(s => `
      <div class="fest-item" style="cursor:default">
        <div class="fest-date" style="background:#fae8ff"><div class="dd">🎪</div><div class="mm">मौसम</div></div>
        <div class="fest-t"><b>${esc(s.fest.deva)}</b> <span class="badge season">मौसमी</span>
        <div class="rule">${fmtKey(s.start)} → ${fmtKey(s.end)}</div>
        <div class="small" style="margin-top:3px">${esc(s.fest.story || '')}</div>
        ${s.fest.source ? `<div class="src">स्रोत: ${esc(s.fest.source)}</div>` : ''}</div></div>`).join('');

    // list
    const f = state.festFilter;
    const items = F.list.filter(x => f === 'all' ? true : f === 'comm' ? x.fest.comm : f === 'gond' ? (!x.fest.comm && isGond(x.fest)) : (!x.fest.comm && !isGond(x.fest)));
    let html = '', lastM = '';
    for (const it of items) {
      if (it.m !== lastM) { html += `<h3 style="color:#7c2d12;margin:10px 0 2px">${HI_MONTHS[it.m - 1]} ${it.y !== state.year ? it.y : ''}</h3>`; lastM = it.m; }
      html += `<div class="fest-item" data-i="${items.indexOf(it)}">
        <div class="fest-date"><div class="dd">${it.d}</div><div class="mm">${HI_MONTHS_S[it.m - 1]}</div></div>
        <div class="fest-t"><b>${esc(it.fest.deva)}</b> ${it.fest.comm ? '<span class="badge comm">स्मृति</span>' : (isGond(it.fest) ? '<span class="badge gond">गोंड</span>' : '<span class="badge gen">पंचांग</span>')}
          ${it.fest.verify ? '<span class="flag">सत्यापन</span>' : ''}
          <div class="rule">${esc(it.fest.meaning || '')}</div></div></div>
        <div class="fest-detail" id="fd-${items.indexOf(it)}">${festCardHTML(it.fest, it.y)}
          <button class="btn ghost small" data-cal="${it.date}">📅 कैलेंडर में देखें</button></div>`;
    }
    $('#fest-list').innerHTML = html || '<p class="muted">कोई पर्व नहीं।</p>';
    $$('#fest-list .fest-item').forEach(elx => elx.onclick = e => {
      if (e.target.closest('button')) return;
      const det = $('#fd-' + elx.dataset.i);
      det.classList.toggle('open');
    });
    $$('#fest-list [data-cal]').forEach(b => b.onclick = () => { state.sel = b.dataset.cal; const [yy, mm] = b.dataset.cal.split('-').map(Number); state.year = yy; state.month = mm; syncYearSel(); setTab('calendar'); openDay(b.dataset.cal); });
    $$('#fest-list [data-pin], #fest-seasons [data-pin]').forEach(b => b.onclick = () => { setTab('map'); setTimeout(() => openPin(b.dataset.pin), 60); });

    // announce
    const ann = X.festivals.filter(x => x.type === 'announce');
    $('#fest-announce').innerHTML = ann.map(a => `
      <div class="fest-item" style="cursor:default"><div class="fest-date" style="background:#e0f2fe"><div class="dd">📣</div><div class="mm">घोषित</div></div>
      <div class="fest-t"><b>${esc(a.deva)}</b> ${a.verify ? '<span class="flag">सत्यापन</span>' : ''}
      <div class="rule">${esc(a.greg_hint || '')}</div>
      <div class="small" style="margin-top:3px">${esc(a.story || '')}</div>
      <div class="src">स्रोत: ${esc(a.source || '')}</div></div></div>`).join('');
  }

  /* ---------- panchang tab ---------- */
  function renderPanchang() {
    const di = diOf(state.sel);
    const c = cityOf();
    $('#panch-date-lbl').textContent = '· ' + fmtKey(state.sel) + ' · ' + c.name;
    $('#moon-svg').innerHTML = moonSVG(di.phase, 44);
    $('#panch-tithi').textContent = di.tithi === di.tithiName ? di.tithi : di.tithi + ' (' + di.tithiName + ')';
    $('#panch-phase').textContent = di.phaseName;
    $('#panch-gondi-tithi').innerHTML = 'गोंडी: ' + di.gondiTithi + ' · ' + (di.amanta ? di.amanta.gondi : '');
    const solar = D.months_solar_gondi_variantA.list[di.solarGondiIdx];
    const cells = [
      ['गोंडी चंद्र माह', (di.amanta ? di.amanta.gondi : '—') + (di.amanta && di.amanta.adhika ? ' <span class="flag">धोंडा</span>' : '')],
      ['अमांत / पूर्णिमांत', (di.amanta ? di.amanta.deva : '') + ' / ' + di.purnimanta.deva],
      ['गोंडी सौर माह', `<span class="gon">${solar.masram}</span> ${solar.deva}`],
      ['नक्षत्र', di.nakName],
      ['सूर्य राशि', di.rashiName + (X.rashis[di.rashi].gondi ? ' · ' + X.rashis[di.rashi].gondi : '')],
      ['ऋतु', di.rituName],
      ['सूर्योदय', di.sunrise || '—'],
      ['सूर्यास्त', di.sunset || '—']
    ];
    $('#panch-grid').innerHTML = cells.map(([l, v]) => `<div class="panch-cell"><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join('');

    const evs = E.lunarEventsForYear(state.year, c);
    $('#lunar-events').innerHTML = '<table class="simple"><tr><th>तिथि</th><th>माह (अमांत)</th><th>गोंडी माह</th></tr>' +
      evs.map(e => { const [y, m, d] = e.key.split('-').map(Number); return `<tr><td>${d} ${HI_MONTHS_S[m - 1]} — ${e.type === 'अमावस्या' ? '🌑 अमावस' : '🌕 पूनम'}</td><td>${e.month ? e.month.deva : ''}</td><td>${e.month ? e.month.gondi : ''}</td></tr>`; }).join('') + '</table>';

    const ecl = X.eclipses;
    $('#eclipse-list').innerHTML = ecl.map(e => {
      const past = e.date < E.dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
      return `<div class="fest-item" style="cursor:default;${past ? 'opacity:.45' : ''}">
        <div class="fest-date" style="background:#e0e7ff"><div class="dd">${e.date.slice(8)}</div><div class="mm">${HI_MONTHS_S[+e.date.slice(5, 7) - 1]} ${e.date.slice(0, 4)}</div></div>
        <div class="fest-t"><b>${esc(e.type)}</b><div class="rule">${esc(e.visible)} · स्रोत: ${esc(e.source)}</div></div></div>`;
    }).join('');
  }

  /* ---------- map tab ---------- */
  const MAP = { x0: 74.5, y0: 26.5, s: 80, w: 880, h: 800 };
  const px = lon => (lon - MAP.x0) * MAP.s;
  const py = lat => (MAP.y0 - lat) * MAP.s;
  const ZONE_SHAPES = {
    north: [[79.2,23.7],[81.2,23.5],[81.4,22.2],[80.6,21.4],[79.4,21.5],[78.8,22.0],[78.6,22.9]],
    west: [[76.9,22.7],[78.7,22.9],[78.8,22.0],[79.4,21.5],[79.2,20.8],[77.8,21.0],[76.8,21.6]],
    south: [[78.0,20.9],[79.4,21.5],[80.6,21.4],[80.6,19.8],[80.2,18.4],[78.8,18.1],[77.9,19.3]],
    east: [[80.6,22.7],[82.8,22.9],[84.6,21.6],[84.9,19.4],[83.2,18.1],[81.0,17.8],[80.2,18.4],[80.6,19.8],[81.4,22.2]]
  };
  const RIVERS = {
    'नर्मदा': [[81.75,22.67],[81.0,22.9],[80.4,22.95],[79.9,23.16],[79.0,22.9],[78.2,22.7],[77.7,22.75],[76.8,22.3],[76.0,21.9]],
    'गोदावरी': [[77.9,19.7],[78.4,19.4],[78.7,19.0],[79.2,18.7],[80.0,18.5],[80.9,18.2],[81.8,17.8]],
    'वैनगंगा': [[80.4,21.0],[80.2,21.5],[80.18,21.81],[80.0,22.1],[79.9,22.4],[80.1,22.7],[80.35,23.0]]
  };
  const STATE_LABELS = [['मध्य प्रदेश',78.2,23.4],['छत्तीसगढ़',82.3,21.6],['महाराष्ट्र',78.2,20.4],['तेलंगाना',79.1,18.4],['ओडिशा',83.9,19.9]];
  function renderMap() {
    const c = cityOf();
    $('#zone-toggle').innerHTML = X.zones.map(z => `<button class="chip ${state.zones.has(z.id) ? 'active' : ''}" data-z="${z.id}"><span class="sw" style="background:${z.color}"></span>${z.deva}</button>`).join('');
    $$('#zone-toggle .chip').forEach(b => b.onclick = () => {
      const z = b.dataset.z;
      state.zones.has(z) ? state.zones.delete(z) : state.zones.add(z);
      renderMap();
    });

    let svg = `<svg viewBox="0 0 ${MAP.w} ${MAP.h}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${MAP.w}" height="${MAP.h}" fill="#fdf3d8"/>`;
    // zones
    for (const z of X.zones) {
      if (!state.zones.has(z.id)) continue;
      const pts = ZONE_SHAPES[z.id].map(([lo, la]) => px(lo) + ',' + py(la)).join(' ');
      svg += `<polygon points="${pts}" fill="${z.color}" opacity="0.10" stroke="${z.color}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="7 5"/>`;
    }
    // rivers
    for (const [nm, pts] of Object.entries(RIVERS)) {
      const d = pts.map(([lo, la], i) => (i ? 'L' : 'M') + px(lo).toFixed(1) + ' ' + py(la).toFixed(1)).join(' ');
      svg += `<path d="${d}" fill="none" stroke="#7db4d8" stroke-width="3.2" opacity="0.85" stroke-linecap="round"/>`;
    }
    // state labels
    for (const [nm, lo, la] of STATE_LABELS) svg += `<text x="${px(lo)}" y="${py(la)}" font-size="15" fill="#a08a5e" font-weight="600" text-anchor="middle" font-family="sans-serif">${nm}</text>`;
    // home city
    svg += `<g><circle cx="${px(c.lon)}" cy="${py(c.lat)}" r="7" fill="#166534" stroke="#fff" stroke-width="2"/><text x="${px(c.lon) + 11}" y="${py(c.lat) + 5}" font-size="14" font-weight="800" fill="#166534" font-family="sans-serif">${c.name} (आपका क्षेत्र)</text></g>`;
    // pins
    for (const p of X.map_pins) {
      if (!state.zones.has(p.zone)) continue;
      const z = X.zones.find(zz => zz.id === p.zone);
      const xx = px(p.lon), yy = py(p.lat);
      svg += `<g class="pin" data-pin="${p.id}">
        <path d="M${xx} ${yy + 2} c -9 -12 -13 -16 -13 -24 a 13 13 0 1 1 26 0 c 0 8 -4 12 -13 24z" fill="${z.color}" stroke="#fff" stroke-width="1.6"/>
        <circle class="pin-dot" cx="${xx}" cy="${yy - 21}" r="5" fill="#fff" opacity=".95"/>
        <text x="${xx}" y="${yy + 18}" font-size="12.5" text-anchor="middle" fill="#4a3a22" font-weight="700" font-family="sans-serif">${p.deva.split('(')[0]}</text>
        <circle class="hit" cx="${xx}" cy="${yy - 14}" r="20"/></g>`;
    }
    svg += '</svg>';
    $('#map-wrap').innerHTML = svg;
    $$('#map-wrap .pin').forEach(elx => elx.onclick = () => openPin(elx.dataset.pin));

    // zone info
    $('#zone-info').innerHTML = X.zones.filter(z => state.zones.has(z.id)).map(z => `
      <div class="card" style="border-left:6px solid ${z.color}">
        <h3 style="color:${z.color}">${z.deva} <span class="muted small">${z.name}</span></h3>
        <dl class="kv">
          <dt>राज्य/क्षेत्र</dt><dd>${esc(z.states)}</dd>
          <dt>प्रमुख जिले</dt><dd>${esc(z.districts)}</dd>
          <dt>बोली</dt><dd>${esc(z.dialects)}</dd>
          <dt>लिपि-क्षेत्र</dt><dd>${esc(z.script)}</dd>
          <dt>त्योहार</dt><dd>${esc(z.festivals)}</dd>
          <dt>पहनावा</dt><dd>${esc(z.attire)}</dd>
          <dt>देवता</dt><dd>${esc(z.deities)}</dd>
          <dt>संगीत/नृत्य</dt><dd>${esc(z.music)}</dd>
        </dl>
        ${z.note ? `<div class="src">${esc(z.note)}</div>` : ''}
      </div>`).join('');

    // pin list
    $('#pin-list').innerHTML = X.map_pins.map(p => {
      const dist = E.haversine(c, p), dir = E.bearing(c, p);
      return `<div class="fest-item" data-pin="${p.id}"><div class="fest-date" style="background:#e0f2fe"><div class="dd">📍</div><div class="mm">${dist} किमी</div></div>
        <div class="fest-t"><b>${esc(p.deva)}</b> <span class="badge" style="background:${X.zones.find(z => z.id === p.zone).color}22;color:${X.zones.find(z => z.id === p.zone).color}">${esc(p.zone === 'north' ? 'उत्तर' : p.zone === 'west' ? 'पश्चिम' : p.zone === 'south' ? 'दक्षिण' : 'पूर्व')}</span>
        <div class="rule">${esc(p.type)} · ${dir} दिशा में · ${esc(p.festivals)}</div></div></div>`;
    }).join('');
    $$('#pin-list .fest-item').forEach(elx => elx.onclick = () => openPin(elx.dataset.pin));
  }
  function openPin(id) {
    const p = X.map_pins.find(z => z.id === id); if (!p) return;
    const c = cityOf();
    const z = X.zones.find(zz => zz.id === p.zone);
    openSheet(`
      <h3 style="color:${z.color};margin:0">${esc(p.deva)}</h3>
      <div class="muted small">${esc(p.type)} · ${esc(z.deva)} ज़ोन · ${p.lat.toFixed(2)}°N, ${p.lon.toFixed(2)}°E (अनुमानित)</div>
      <div class="fest-card" style="margin-top:10px"><h4>इतिहास</h4><div class="small">${esc(p.history)}</div></div>
      <dl class="kv" style="margin-top:10px">
        <dt>पर्व/मेला</dt><dd>${esc(p.festivals)}</dd>
        <dt>देवता</dt><dd>${esc(p.deity)}</dd>
        <dt>${esc(c.name)} से</dt><dd>${E.haversine(c, p)} किमी · ${E.bearing(c, p)} दिशा</dd>
      </dl>
      <div class="src">स्रोत: ${esc(p.source)}</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}">🗺 Google Maps</a>
        <button class="btn ghost" id="pin-dir">🧭 मेरी लोकेशन से दिशा</button>
      </div><div id="pin-geo" class="small" style="margin-top:8px;color:var(--green)"></div>`);
    $('#pin-dir').onclick = () => {
      if (!navigator.geolocation) { $('#pin-geo').textContent = 'जियोलोकेशन उपलब्ध नहीं।'; return; }
      navigator.geolocation.getCurrentPosition(pos => {
        const me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        $('#pin-geo').innerHTML = `आपकी लोकेशन से: <b>${E.haversine(me, p)} किमी</b>, दिशा: <b>${E.bearing(me, p)}</b>`;
      }, () => { $('#pin-geo').textContent = 'लोकेशन अनुमति नहीं मिली।'; });
    };
  }

  /* ---------- learn tab ---------- */
  function renderLipi() {
    const CS = G.CHARSET;
    const cell = ([gn, dv]) => `<div class="chart-cell"><span class="g">${gn}</span><span class="d">${dv}</span></div>`;
    $('#ch-vowels').innerHTML = CS.vowels.map(cell).join('');
    $('#ch-cons').innerHTML = [].concat(CS.ka, CS.ca, CS.tta, CS.ta, CS.pa, CS.ya, CS.conj).map(cell).join('');
    $('#ch-matras').innerHTML = [].concat(CS.matra, CS.signs).map(cell).join('');
    $('#ch-digits').innerHTML = CS.digits.map(cell).join('');

    // converter
    const runConv = () => {
      const v = $('#conv-in').value;
      $('#conv-out').textContent = state.convDir === 1 ? G.convert(v) : G.convertReverse(v);
    };
    $('#conv-in').oninput = runConv; runConv();
    $('#conv-copy').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText($('#conv-out').textContent) : Promise.reject()).then(() => toast('कॉपी हो गया')).catch(() => toast('कॉपी विफल'));
    $('#conv-rev').onclick = () => { state.convDir = 3 - state.convDir; $('#conv-rev').textContent = state.convDir === 1 ? 'मसराम → देवनागरी' : 'देवनागरी → मसराम'; runConv(); };

    // numbers
    const runNum = () => { $('#num-out').textContent = E.gondiDigits($('#num-in').value || '0'); };
    $('#num-in').oninput = runNum; runNum();
    const nw = D.numerals.words_1_to_10, nd = D.numerals.words_deva;
    $('#num-rule').innerHTML = '1–10: ' + nw.map((w, i) => `${nd[i]} (${w})`).join(', ') + ' · <b>' + esc(D.numerals.compound_rule) + '</b>';

    // weekdays
    $('#learn-weekdays').innerHTML = '<table class="simple"><tr><th>गोंडी</th><th>मसराम</th><th>हिंदी</th><th>English</th></tr>' +
      D.weekdays.map(w => `<tr><td>${esc(w.gondi)}</td><td class="gon" style="font-size:1.05rem">${w.masram || ''}</td><td>${esc(w.hindi)}</td><td>${esc(w.english)}</td></tr>`).join('') + '</table>' +
      `<p class="muted small">${esc(D.weekday_note || '')}</p>`;

    // months
    $('#learn-months').innerHTML = '<table class="simple"><tr><th>#</th><th>गोंडी माह</th><th>हिंदी (अमांत)</th><th>≈ अंग्रेज़ी</th><th>मुख्य पर्व</th></tr>' +
      X.gondi_month_map.map.map((mm, i) => `<tr><td>${i + 1}</td><td><b>${esc(mm.gondi_deva)}</b> <span class="muted">${esc(mm.gondi)}</span></td><td>${esc(mm.deva)}</td><td>${esc(mm.greg)}</td><td class="small">${esc(mm.zone_festival)}</td></tr>`).join('') + '</table>' +
      `<p class="muted small">${esc(X.gondi_month_map.note)}</p>`;
    $('#learn-solar-months').innerHTML = '<table class="simple"><tr><th>अंग्रेज़ी</th><th>मसराम</th><th>गोंडी सौर माह</th></tr>' +
      D.months_solar_gondi_variantA.list.map(s => `<tr><td>${esc(s.greg)}</td><td class="gon" style="font-size:1.05rem">${s.masram || ''}</td><td>${esc(s.deva)} (${esc(s.gondi)})</td></tr>`).join('') + '</table>';

    // terms
    const t = D.calendar_terms;
    $('#learn-terms').innerHTML = '<table class="simple"><tr><th>अवधारणा</th><th>गोंडी</th><th>हिंदी/अर्थ</th></tr>' +
      Object.entries(t).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td><b>${esc(v.gondi || '')}</b> <span class="muted">${esc(v.deva || '')}</span></td><td class="small">${esc(v.meaning || v.hindi || v.date_rule || v.rule || '')}</td></tr>`).join('') + '</table>';

    $('#learn-astro').innerHTML = '<table class="simple"><tr><th>गोंडी शब्द</th><th>अर्थ</th></tr>' +
      D.astronomy_terms.map(a => `<tr><td><b>${esc(a.term)}</b></td><td>${esc(a.meaning)}</td></tr>`).join('') + '</table>';

  }

  /* ---------- सीखें (संस्कृति/इतिहास) ---------- */
  function renderLearn() {
    const cu = D.culture_layer;
    $('#learn-culture').innerHTML = `
      <p><b>अभिवादन:</b> पुकार — <b>${esc(cu.greeting.call)}</b> · उत्तर — <b>${esc(cu.greeting.reply)}</b></p>
      <p><b>देवी-देवता (${cu.deities.length}):</b> ${cu.deities.map(esc).join(' · ')}</p>
      <p><b>गोत्र:</b> परंपरागत दावा — ${cu.gotras.count_claimed} गोत्र; देवगढ़-मानचित्र: ${Object.entries(cu.gotras.devgarh_map).map(([k, v]) => k + '=' + v).join(', ')}</p>
      <p><b>गोत्र नाम (नमूना):</b> ${cu.gotras.sample_names.map(esc).join(', ')}…</p>
      <p><b>गोंडी राशि-नाम (आंशिक):</b> ${Object.entries(cu.zodiac_gondi_partial).map(([k, v]) => k + '=' + v).join(', ')} <span class="flag">शेष फील्ड-सत्यापन</span></p>
      <p><b>प्रतीक:</b> ${cu.symbols.map(esc).join(' · ')}</p>
      <p><b>ढेम्सा नृत्य (${cu.music_dance.dhemsa_16.length}):</b> ${cu.music_dance.dhemsa_16.map(esc).join(', ')}</p>
      <p><b>वाद्य (${cu.music_dance.vadya_18.length}):</b> ${cu.music_dance.vadya_18.map(esc).join(', ')}</p>`;

    $('#learn-timeline').innerHTML = X.timeline.map(t2 => `<div class="tl-item"><div class="yr">${esc(t2.year)}</div><div class="ev">${esc(t2.event)}</div></div>`).join('');

    $('#learn-sentences').innerHTML = cu.sample_sentences.map(s => `<p class="small" style="border-bottom:1px dashed var(--line);padding:5px 0;margin:0">${esc(s)}</p>`).join('');
  }

  /* ---------- महापुरुष (Heroes database) ---------- */
  const CAT_META = {
    freedom:    { hi: 'स्वतंत्रता संग्राम', c: '#b4531a' },
    collective: { hi: 'सामूहिक शहादत',     c: '#8a1f1f' },
    military:   { hi: 'सेना के वीर',        c: '#123f2a' },
    governance: { hi: 'शासन-प्रशासन',      c: '#1d3f6e' },
    education:  { hi: 'शिक्षा',             c: '#0f5132' },
    literature: { hi: 'साहित्य',            c: '#6d28d9' },
    art:        { hi: 'कला',                c: '#9d174d' },
    language:   { hi: 'भाषा-लिपि',          c: '#b45309' },
    sports:     { hi: 'खेल',                c: '#0e7490' }
  };
  const TAG_LBL = {
    shahid: 'शहीद', women: 'महिला', first_woman: 'प्रथम महिला', first: 'प्रथम', icon: 'आइकन',
    gond: 'गोंड', olympic_medal: 'ओलंपिक पदक', asian_gold: 'एशियाई स्वर्ण', cwg_gold: 'CWG स्वर्ण',
    pvc: 'परमवीर चक्र', padma_vibhushan: 'पद्म विभूषण', padma_bhushan: 'पद्म भूषण', padma_shri: 'पद्म श्री',
    script_creator: 'लिपि निर्माता', hockey: 'हॉकी', archery: 'तीरंदाजी', warli: 'वारली', bhil: 'भील',
    tragic: 'दुखद निधन', ips: 'IPS', publisher: 'प्रकाशक', poet: 'कवि', captain: 'कप्तान'
  };
  let heroFilter = 'all', heroQuery = '';
  function heroOfTheDay() {
    const now = new Date(), y = now.getFullYear();
    const doy = Math.floor((now - new Date(y, 0, 0)) / 864e5);
    return H.persons[doy % H.persons.length];
  }
  function heroYears(p) {
    const b = (p.birth || '').slice(0, 4) || '?', d = (p.death || '').slice(0, 4);
    return p.death ? (b + '–' + d) : (p.birth ? ('जन्म ' + b) : '');
  }
  function heroCard(p) {
    const cm = CAT_META[p.category] || { hi: p.category, c: '#57421a' };
    const tags = (p.tags || []).slice(0, 3).map(t => `<span class="htag">${esc(TAG_LBL[t] || t)}</span>`).join('');
    const ach = (p.first_achievement || '').length > 92 ? esc(p.first_achievement).slice(0, 92) + '…' : esc(p.first_achievement || '');
    return `<button class="hero-card" data-id="${p.id}">
      <span class="hero-init" style="background:${cm.c}18;color:${cm.c}">${esc((p.name_hi || '?').slice(0, 1))}</span>
      <span class="hero-body">
        <span class="hero-name">${esc(p.name_hi)}${p.verify ? ' <span class="warn-dot" title="सत्यापन शेष">⚠</span>' : ''}</span>
        <span class="hero-sub">${esc(p.name_en || '')} · ${heroYears(p)}</span>
        <span class="hero-tribe">${esc(p.tribe_hi || '')} — ${esc(p.state || '')}${p.district ? ', ' + esc(p.district) : ''}</span>
        <span class="hero-ach">${ach}</span>
        <span class="hero-tags"><span class="hero-cat" style="background:${cm.c}">${cm.hi}</span>${tags}</span>
      </span></button>`;
  }
  function renderHeroes() {
    const p = heroOfTheDay(), cm = CAT_META[p.category] || { hi: p.category, c: '#57421a' };
    $('#hero-of-day').innerHTML = `<p class="muted" style="letter-spacing:.1em;font-size:.72rem">✦ आज का नायक / नायिका</p>
      <h3 style="margin:2px 0 4px">${esc(p.name_hi)} <span class="muted" style="font-size:.8rem">${esc(p.name_en || '')}</span></h3>
      <p class="small" style="margin:0 0 6px"><b style="color:${cm.c}">${cm.hi}</b> · ${esc(p.tribe_hi || '')} · ${esc(p.state || '')}${p.district ? ' (' + esc(p.district) + ')' : ''}</p>
      <p style="margin:0 0 8px">${esc(p.first_achievement || '')}</p>
      <button class="btn" id="hod-more">पूरी कहानी पढ़ें</button>`;
    $('#hod-more').onclick = () => openHero(p);

    const counts = { all: H.persons.length };
    H.persons.forEach(q => counts[q.category] = (counts[q.category] || 0) + 1);
    let chips = `<button class="chip ${heroFilter === 'all' ? 'active' : ''}" data-f="all">सभी (${counts.all})</button>`;
    for (const k in CAT_META) if (counts[k]) chips += `<button class="chip ${heroFilter === k ? 'active' : ''}" data-f="${k}">${CAT_META[k].hi} (${counts[k]})</button>`;
    const fl = $('#hero-filters'); fl.innerHTML = chips;
    $$('#hero-filters .chip').forEach(b => b.onclick = () => { heroFilter = b.dataset.f; renderHeroes(); });

    const se = $('#hero-search');
    se.value = heroQuery;
    se.oninput = () => { heroQuery = se.value.trim().toLowerCase(); drawHeroGrid(); };
    drawHeroGrid();
  }
  function drawHeroGrid() {
    let list = H.persons.slice();
    if (heroFilter !== 'all') list = list.filter(p => p.category === heroFilter);
    if (heroQuery) list = list.filter(p => (
      [p.name_hi, p.name_en, p.tribe_hi, p.state, p.district, (p.tags || []).join(' '), p.first_achievement]
        .join(' ').toLowerCase().includes(heroQuery)
    ));
    $('#hero-count').textContent = `${list.length} / ${H.persons.length} व्यक्ति — स्टार्टर डेटाबेस, विस्तार जारी (लक्ष्य 1000+)`;
    $('#hero-grid').innerHTML = list.map(heroCard).join('');
    $$('#hero-grid .hero-card').forEach(el => el.onclick = () => {
      const p = H.persons.find(q => q.id === el.dataset.id); openHero(p);
    });
  }
  function openHero(p) {
    const cm = CAT_META[p.category] || { hi: p.category, c: '#57421a' };
    const rows = [
      ['श्रेणी', `<b style="color:${cm.c}">${cm.hi}</b>`],
      ['जनजाति', esc(p.tribe_hi || '') + (p.tribe ? ` (${esc(p.tribe)})` : '')],
      ['राज्य / जिला', esc(p.state || '') + (p.district ? ' — ' + esc(p.district) : '')],
      ['जन्म', p.birth_date ? '🎂 ' + esc(fmtDateHi(p.birth_date)) + (p.date_source ? ' · स्रोत: विकिडेटा' : '') : esc(p.birth || 'अज्ञात')],
      ['निधन', p.death_date ? '🕊️ ' + esc(fmtDateHi(p.death_date)) : (p.death ? esc(p.death) : '—')]
    ];
    let extra = '';
    if (p.medals) extra += `<p><b>पदक:</b> ${esc(p.medals)}</p>`;
    if (p.awards) extra += `<p><b>सम्मान:</b> ${esc(p.awards)}</p>`;
    if (p.memorial) extra += `<p><b>स्मारक:</b> ${esc(p.memorial)}</p>`;
    const tags = (p.tags || []).map(t => `<span class="htag">${esc(TAG_LBL[t] || t)}</span>`).join(' ');
    openSheet(`
      <p class="muted small" style="letter-spacing:.12em">${esc(p.name_en || '')}</p>
      <h3 style="margin:2px 0 6px">${esc(p.name_hi)}</h3>
      <div class="hero-tags" style="margin-bottom:8px">${tags}</div>
      <div class="kv">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</div>
      <p><b>उपलब्धि:</b> ${esc(p.first_achievement || '')}</p>
      <p>${esc(p.bio || '')}</p>${extra}
      ${p.photo ? `<img src="${esc(p.photo)}" style="width:100%;border-radius:10px" alt="${esc(p.name_hi)}">` : '<p class="muted small">📷 फ़ोटो नीति: केवल पब्लिक-डोमेन / CC-लाइसेंस छवि ही जोड़ी जाएगी — अभी संलग्न नहीं।</p>'}
      ${p.verify ? `<p class="warn small">⚠ ${esc(p.verify_note || 'कुछ तथ्यों का सत्यापन शेष')}</p>` : ''}
      <div class="src"><b>स्रोत:</b><br>${(p.sources || []).map(s => esc(s)).join('<br>')}</div>`);
  }

  /* ---------- स्थल-कोश (Places + GPS) ---------- */
  const PLACE_CAT = {
    dharmik:    { hi: 'धार्मिक/दर्शनीय', c: '#8a5a10' },
    shahid:     { hi: 'शहीदी स्थल',     c: '#8a1f1f' },
    smarak:     { hi: 'स्मारक',          c: '#1d3f6e' },
    aitihasik:  { hi: 'ऐतिहासिक',       c: '#123f2a' }
  };
  const GPS_PREC = { exact: 'सटीक', approximate: 'अनुमानित', 'city-level': 'शहर-स्तरीय', 'region-level': 'क्षेत्र-स्तरीय', 'district-level': 'जिला-स्तरीय' };
  let placeFilter = 'all', placeQuery = '';
  function placeDist(p) { const c = cityOf(); return (c && c.lat) ? E.haversine(c, p) : null; }
  function placeCard(p) {
    const cm = PLACE_CAT[p.category] || { hi: p.category, c: '#57421a' };
    const d = placeDist(p);
    const sig = esc(p.significance || '');
    return `<button class="hero-card" data-id="${p.id}">
      <span class="hero-init" style="background:${cm.c}18;color:${cm.c}">📍</span>
      <span class="hero-body">
        <span class="hero-name">${esc(p.name_hi)}${p.verify ? ' <span class="warn-dot" title="सत्यापन शेष">⚠</span>' : ''}</span>
        <span class="hero-sub">${esc(p.state || '')}${p.district ? ' · ' + esc(p.district) : ''}${p.year ? ' · ' + esc(String(p.year)) : ''}${d != null ? ' · 📏 ' + d + ' किमी' : ''}</span>
        <span class="hero-ach">${sig.length > 100 ? sig.slice(0, 100) + '…' : sig}</span>
        <span class="hero-tags"><span class="hero-cat" style="background:${cm.c}">${cm.hi}</span><span class="htag">📍 ${GPS_PREC[p.gps_precision] || p.gps_precision}</span>${p.tribes && p.tribes !== '—' ? '<span class="htag">' + esc(p.tribes) + '</span>' : ''}</span>
      </span></button>`;
  }
  function renderPlaces() {
    const counts = { all: PL.places.length };
    PL.places.forEach(q => counts[q.category] = (counts[q.category] || 0) + 1);
    let chips = `<button class="chip ${placeFilter === 'all' ? 'active' : ''}" data-f="all">सभी (${counts.all})</button>`;
    for (const k in PLACE_CAT) if (counts[k]) chips += `<button class="chip ${placeFilter === k ? 'active' : ''}" data-f="${k}">${PLACE_CAT[k].hi} (${counts[k]})</button>`;
    const fl = $('#place-filters'); fl.innerHTML = chips;
    $$('#place-filters .chip').forEach(b => b.onclick = () => { placeFilter = b.dataset.f; renderPlaces(); });
    const se = $('#place-search');
    se.value = placeQuery;
    se.oninput = () => { placeQuery = se.value.trim().toLowerCase(); drawPlaceGrid(); };
    drawPlaceGrid();
  }
  function drawPlaceGrid() {
    let list = PL.places.slice();
    if (placeFilter !== 'all') list = list.filter(p => p.category === placeFilter);
    if (placeQuery) list = list.filter(p => (
      [p.name_hi, p.name_en, p.state, p.district, p.tribes, p.significance].join(' ').toLowerCase().includes(placeQuery)
    ));
    list.sort((a, b) => (a.state || '').localeCompare(b.state || '', 'hi') || (a.name_hi || '').localeCompare(b.name_hi || '', 'hi'));
    $('#place-count').textContent = `${list.length} / ${PL.places.length} स्थल — चुने गए क्षेत्र (${cityOf().name}) से दूरी सहित`;
    $('#place-grid').innerHTML = list.map(placeCard).join('');
    $$('#place-grid .hero-card').forEach(el => el.onclick = () => {
      const p = PL.places.find(q => q.id === el.dataset.id); openPlace(p);
    });
  }
  function openPlace(p) {
    const cm = PLACE_CAT[p.category] || { hi: p.category, c: '#57421a' };
    const d = placeDist(p), dir = d != null ? E.bearing(cityOf(), p) : '';
    const rows = [
      ['श्रेणी', `<b style="color:${cm.c}">${cm.hi}</b>`],
      ['राज्य / जिला', esc(p.state || '') + (p.district ? ' — ' + esc(p.district) : '')],
      ['जनजाति-संबंध', esc(p.tribes || '—')],
      ['वर्ष/घटना', esc(p.year || '—')],
      ['GPS', `<span class="gps-mono">${p.lat}, ${p.lon}</span> (${GPS_PREC[p.gps_precision] || p.gps_precision})`],
      [cityOf().name + ' से', d != null ? (d + ' किमी · ' + dir + ' दिशा') : '—']
    ];
    openSheet(`
      <p class="muted small" style="letter-spacing:.12em">${esc(p.name_en || '')}</p>
      <h3 style="margin:2px 0 8px">${esc(p.name_hi)}</h3>
      <div class="kv">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</div>
      <p style="margin-top:8px">${esc(p.significance || '')}</p>
      <p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${p.lat},${p.lon}">🗺️ Google Maps पर खोलें</a>
        ${p.map_pin_id ? `<button class="btn ghost" data-pin="${p.map_pin_id}">ऐप-नक्शे पर पिन</button>` : ''}
      </p>
      ${p.verify ? `<p class="warn small">⚠ ${esc(p.verify_note || 'फ़ील्ड-सत्यापन शेष')}</p>` : ''}
      <div class="src"><b>स्रोत:</b><br>${(p.sources || []).map(x => esc(x)).join('<br>')}</div>`);
  }

  /* ---------- प्राथमिकताएँ (theme/font/notifications) ---------- */
  const prefs = Object.assign(
    { theme: 'system', fontSize: 16, notifyFest: true, notifyMoon: true },
    JSON.parse(localStorage.getItem('gw-prefs') || '{}'));
  function savePrefs() { localStorage.setItem('gw-prefs', JSON.stringify(prefs)); }
  function applyPrefs() {
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (document.body && document.body.classList) document.body.classList.toggle('dark', !!dark);
    if (document.documentElement && document.documentElement.style) document.documentElement.style.fontSize = prefs.fontSize + 'px';
  }

  /* ---------- आज का ज्ञान pool (केवल सत्यापित डेटासेट से) ---------- */
  function knowledgePool() {
    const cu = D.culture_layer, pool = [];
    pool.push({ t: `अभिवादन परंपरा — पुकार: "${cu.greeting.call}", उत्तर: "${cu.greeting.reply}"।`, s: 'संस्कृति-परत (रिसर्च-संकलन)' });
    pool.push({ t: `गोंड देवी-देवताओं में प्रमुख: ${cu.deities.slice(0, 8).join(', ')}।`, s: 'संस्कृति-परत (रिसर्च-संकलन)' });
    pool.push({ t: `परंपरागत दावा — गोंड समाज में ${cu.gotras.count_claimed} गोत्र; देवगढ़-मानचित्र अनुसार वितरण।`, s: 'देवगढ़-मानचित्र (रिसर्च)' });
    pool.push({ t: `गोंड प्रतीक-परंपरा: ${cu.symbols.join(', ')}।`, s: 'संस्कृति-परत (रिसर्च-संकलन)' });
    pool.push({ t: `ढेम्सा — 16 मुद्राओं वाला सामूहिक नृत्य: ${cu.music_dance.dhemsa_16.slice(0, 8).join(', ')}…`, s: 'संगीत-नृत्य संकलन (रिसर्च)' });
    pool.push({ t: `परंपरागत वाद्य (${cu.music_dance.vadya_18.length}): ${cu.music_dance.vadya_18.slice(0, 8).join(', ')}…`, s: 'संगीत-नृत्य संकलन (रिसर्च)' });
    X.timeline.forEach(tl => pool.push({ t: `इतिहास (${tl.year}): ${tl.event}`, s: 'टाइमलाइन (स्रोत-संकलन)' }));
    Object.entries(D.calendar_terms).forEach(([k, v]) => {
      if (v.meaning || v.hindi) pool.push({ t: `शब्दार्थ — ${v.gondi || k}: ${v.meaning || v.hindi}`, s: 'कैलेंडर शब्दावली (रिसर्च)' });
    });
    D.astronomy_terms.forEach(a => pool.push({ t: `गोंड खगोल — ${a.term}: ${a.meaning}`, s: 'खगोल-शब्दावली (Vahia & Halkare)' }));
    return pool;
  }

  /* ---------- होम ---------- */
  function renderHome() {
    const t = new Date(), y = t.getFullYear(), m = t.getMonth() + 1, d = t.getDate();
    const key = E.dateKey(y, m, d), di = diOf(key), w = gondiWeekday(y, m, d);
    const F = festivals(), fests = F.byDate[key] || [];
    const illum = Math.round((1 - Math.cos(2 * Math.PI * (di.phase || 0))) / 2 * 100);

    $('#home-today').innerHTML = `
      <p class="muted" style="letter-spacing:.14em;font-size:.72rem;margin:0">आज</p>
      <div class="ht-date">${d} ${HI_MONTHS[m - 1]} ${y}</div>
      <div class="ht-day">${w.hindi || ''} · <span class="gon">${w.masram || ''}</span> ${esc(w.gondi || '')}</div>
      <div class="ht-gondi">गोंडी चंद्र माह: <b>${di.amanta ? esc(di.amanta.gondi || '') : '—'}</b>${di.amanta && di.amanta.adhika ? ' <span class="flag">धोंडा (अधिक)</span>' : ''} · ऋतु: ${esc(di.rituName || '')}</div>
      <div class="ht-moon">${moonSVG(di.phase || 0, 28)}<div><b>${esc(di.phaseName || '')}</b><div class="muted small">तिथि: ${esc(di.tithiName || '')} · ${esc(di.gondiTithi || '')}</div></div></div>`;

    if (fests.length) {
      $('#home-fest').innerHTML = `<h3>🎉 आज का पर्व</h3>` + fests.map(f =>
        `<p style="margin:4px 0"><b>${esc(f.deva)}</b>${f.gondi ? ` <span class="muted">${esc(f.gondi)}</span>` : ''}<br><span class="small">${esc((f.meaning || f.story || '').slice(0, 140))}</span></p>`).join('') +
        `<button class="btn" id="hf-open">विवरण देखें →</button>`;
      $('#hf-open').onclick = () => openDay(key);
    } else {
      let next = '—';
      for (let i = 1; i < 45; i++) {
        const dt = new Date(t.getTime() + i * 864e5);
        const k2 = E.dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
        const fl = F.byDate[k2] || [];
        if (fl.length) { next = fl.map(f => esc(f.deva)).join(', ') + ' — ' + fmtKey(k2, true); break; }
      }
      $('#home-fest').innerHTML = `<h3>🎉 आज का पर्व</h3><p class="muted" style="margin:4px 0">आज कोई दर्ज प्रमुख पर्व नहीं है।</p><p class="small" style="margin:0">अगला पर्व: ${next}</p>`;
    }

    $('#home-panch').innerHTML = `<h3>🌙 आज का पंचांग (संक्षिप्त)</h3><div class="kv">
      <dt>सूर्योदय/सूर्यास्त</dt><dd>${esc(di.sunrise || '—')} / ${esc(di.sunset || '—')}</dd>
      <dt>तिथि</dt><dd>${esc(di.tithiName || '')} · ${esc(di.gondiTithi || '')}</dd>
      <dt>नक्षत्र</dt><dd>${esc(di.nakName || '—')}</dd>
      <dt>राशि</dt><dd>${esc(di.rashiName || '—')}</dd>
      <dt>चंद्र-कला</dt><dd>${esc(di.phaseName || '—')} · ${illum}% प्रकाश</dd></div>
      <button class="btn ghost" id="hp-open" style="margin-top:8px">पूरा पंचांग →</button>`;
    $('#hp-open').onclick = () => { state.sel = key; setTab('panchang'); };

    const pool = knowledgePool();
    const doy = Math.floor((t - new Date(y, 0, 0)) / 864e5);
    const kn = pool[doy % pool.length];
    $('#home-knowledge').innerHTML = `<h3>🌿 आज का ज्ञान</h3><p style="margin:4px 0">${esc(kn.t)}</p>
      <div class="src">स्रोत: ${esc(kn.s)} — सत्यापित डेटासेट से दैनिक घूर्णन</div>
      <button class="btn ghost" id="hk-open" style="margin-top:6px">📚 सीखें →</button>`;
    $('#hk-open').onclick = () => setTab('learn');

    const hp = heroOfTheDay(), cm = CAT_META[hp.category] || { hi: hp.category, c: '#57421a' };
    $('#home-hero').innerHTML = `<h3>🧑🏽‍🤝‍🧑🏽 आज का नायक / नायिका</h3>
      <p style="margin:4px 0"><b>${esc(hp.name_hi)}</b> <span class="muted small">${esc(hp.name_en || '')}</span><br>
      <span class="small">${esc((hp.first_achievement || '').slice(0, 120))}</span></p>
      <span class="hero-cat" style="background:${cm.c}">${cm.hi}</span>
      <button class="btn ghost" id="hh-open" style="margin-left:6px">पूरी कहानी →</button>`;
    $('#hh-open').onclick = () => { setTab('heroes'); setTimeout(() => openHero(hp), 80); };

    $('#home-quick').innerHTML = ['calendar', 'festivals', 'panchang', 'map', 'heroes', 'places', 'regions', 'stories'].map(id => navBtn(NAV_ALL.find(n => n.id === id), '')).join('');
    $$('#home-quick button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    renderDaily();
  }

  /* ---------- वर्ष दृश्य ---------- */
  function drawYearView() {
    const y = state.year, F = festivals(), c = cityOf();
    let html = `<div class="yv-head"><b>${y}</b> <span class="gon">${E.gondiDigits(y)}</span> <span class="muted small">· पर्व-गणना क्षेत्र: ${esc(c.name)}</span></div><div class="yv-grid">`;
    for (let m = 1; m <= 12; m++) {
      const dim = E.daysInMonth(y, m);
      let cnt = 0, moon = 0;
      for (let d = 1; d <= dim; d++) {
        const k = E.dateKey(y, m, d);
        cnt += (F.byDate[k] || []).length;
      }
      const di1 = E.dayInfo(y, m, 1, c), di15 = E.dayInfo(y, m, Math.min(15, dim), c);
      if (di1.isAmavasya || di1.isPurnima) moon++;
      if (di15.isAmavasya || di15.isPurnima) moon++;
      const solar = D.months_solar_gondi_variantA.list[m - 1];
      html += `<button class="yv-month" data-m="${m}">
        <span class="yv-mname">${HI_MONTHS_S[m - 1]}</span>
        <span class="yv-mgon muted small">${esc(solar.deva)}</span>
        <span class="yv-cnt">${cnt ? '🎉 ' + cnt : '·'}${moon ? ' 🌙' : ''}</span></button>`;
    }
    html += '</div><p class="muted small">माह पर tap → माह-दृश्य। 🎉 = पर्व-संख्या, 🌙 = अमावस/पूनम संकेत।</p>';
    $('#cal-yearview').innerHTML = html;
    $$('#cal-yearview .yv-month').forEach(b => b.onclick = () => {
      state.month = +b.dataset.m; state.view = 'month';
      const cv = $('#cal-view'); if (cv) cv.textContent = '🗓️ वर्ष दृश्य';
      renderCalendar();
    });
  }

  /* ---------- सेटिंग्स ---------- */
  /* ---------- क्षेत्र-कोश (state→district→tehsil→post→panchayat→village) ---------- */
  const RGN = () => (window.GW_REGIONS && window.GW_REGIONS.units) || [];
  const RGN_LEVELS = ['state', 'district', 'tehsil', 'post', 'panchayat', 'village'];
  const RGN_LBL = { state: 'राज्य', district: 'जिला', tehsil: 'तहसील', post: 'पोस्ट', panchayat: 'पंचायत', village: 'गाँव' };
  const ENT_LBL = { festival: '🎪 पर्व/मेला', belief: '🙏 मान्यता/रस्म', person: '👤 महापुरुष/विद्वान', martyr: '🕯️ अमर शहीद', revolutionary: '✊ वीर क्रांतिकारी', place: '🛕 धार्मिक/दर्शन स्थल', story: '📜 लोक-कथा' };
  function rgnChildren(parentId, level) { return RGN().filter(u => u.level === level && (parentId ? u.parent === parentId : !u.parent)); }
  function rgnUnit(id) { return RGN().find(u => u.id === id) || null; }
  function rgnPath(u) { const out = []; let x = u, g = 0; while (x && g++ < 8) { out.unshift(x.name_hi); x = rgnUnit(x.parent); } return out.join(' → '); }
  function rgnSelected() {
    let id = null;
    for (const lv of RGN_LEVELS) if (state.rgn[lv]) id = state.rgn[lv];
    return id ? rgnUnit(id) : null;
  }
  function entCard(e, u) {
    const src = (e.sources || []).map(x => /^https?:/.test(x) ? `<a href="${esc(x)}" target="_blank" rel="noopener">स्रोत↗</a>` : esc(x)).join(' · ');
    const deep = e.ref && e.ref.startsWith('mahapurush:') ? ` <button class="chip" data-hero="${esc(e.ref.slice(11))}">पूरी जीवनी</button>`
      : e.ref && e.ref.startsWith('place:') ? ` <button class="chip" data-place="${esc(e.ref.slice(6))}">स्थल-विवरण</button>` : '';
    return `<div class="card" style="padding:10px 12px;margin:8px 0">
      <p style="margin:0"><b>${esc(e.name_hi)}</b> <span class="muted small">${ENT_LBL[e.kind] || e.kind}</span>${e.verify ? ' <span class="flag">⚠ सत्यापन शेष</span>' : ''}</p>
      ${e.desc_hi ? `<p class="small" style="margin:4px 0">${esc(e.desc_hi)}</p>` : ''}
      ${e.told_by ? `<p class="small" style="margin:4px 0">👴 सुनाने वाले: <b>${esc(e.told_by)}</b></p>` : ''}
      <p class="muted small" style="margin:4px 0">📍 ${esc(rgnPath(u))}${src ? ' · स्रोत: ' + src : ''}${deep}</p></div>`;
  }
  function renderRegions() {
    const sel = $('#rgn-sel'); if (!sel) return;
    sel.innerHTML = RGN_LEVELS.map(lv => {
      const i = RGN_LEVELS.indexOf(lv);
      const parentId = i === 0 ? null : state.rgn[RGN_LEVELS[i - 1]];
      const opts = i === 0 ? rgnChildren(null, lv) : (parentId ? rgnChildren(parentId, lv) : []);
      const dis = i > 0 && !parentId ? 'disabled' : '';
      return `<select data-lv="${lv}" ${dis} style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)">
        <option value="">${RGN_LBL[lv]} चुनें${opts.length ? ' (' + opts.length + ')' : ''}</option>
        ${opts.map(o => `<option value="${esc(o.id)}" ${state.rgn[lv] === o.id ? 'selected' : ''}>${esc(o.name_hi)}</option>`).join('')}</select>`;
    }).join('');
    $$('#rgn-sel select').forEach(s2 => s2.onchange = () => {
      const lv = s2.dataset.lv; state.rgn[lv] = s2.value;
      const i = RGN_LEVELS.indexOf(lv);
      RGN_LEVELS.slice(i + 1).forEach(l => state.rgn[l] = '');
      renderRegions();
    });
    const u = rgnSelected();
    const body = $('#rgn-body');
    if (!u) {
      const R = window.GW_REGIONS || { meta: {} };
      const cov = R.meta.coverage || {};
      body.innerHTML = `<div class="card"><p>ऊपर से राज्य चुनें — फिर जिला, तहसील, पोस्ट, पंचायत, गाँव।<br>
        <span class="muted small">अभी सूचीबद्ध: ${cov.states || 0} राज्य · ${cov.districts || 0} जिला · ${cov.tehsils || 0} तहसील · ${cov.entities || 0} प्रविष्टियाँ (पर्व/मान्यता/महापुरुष/शहीद/क्रांतिकारी/स्थल/लोक-कथा)</span></p></div>`;
      $('#rgn-count').textContent = '';
      return;
    }
    const kids = RGN_LEVELS.map(lv => rgnChildren(u.id, lv)).flat();
    const ents = u.entities || [];
    const groups = {};
    ents.forEach(e => (groups[e.kind] = groups[e.kind] || []).push(e));
    $('#rgn-count').innerHTML = `<b>${esc(u.name_hi)}</b> (${RGN_LBL[u.level]}) · ${ents.length} प्रविष्टियाँ · ${kids.length} उप-इकाइयाँ`;
    body.innerHTML = `<div class="card"><p class="muted small" style="margin:0">📍 ${esc(rgnPath(u))}</p></div>` +
      Object.keys(ENT_LBL).filter(k => groups[k]).map(k =>
        `<h3 class="sec" style="font-size:1rem">${ENT_LBL[k]} (${groups[k].length})</h3>` +
        groups[k].map(e => entCard(e, u)).join('')).join('') +
      (kids.length ? `<h3 class="sec" style="font-size:1rem">उप-इकाइयाँ</h3><div class="card"><div style="display:flex;gap:6px;flex-wrap:wrap">` +
        kids.map(k => `<button class="chip" data-goto="${esc(k.id)}">${esc(k.name_hi)} <span class="muted">${(k.entities || []).length ? '·' + k.entities.length : ''}</span></button>`).join('') + '</div></div>' : '');
    $$('#rgn-body [data-goto]').forEach(b => b.onclick = () => {
      const k = rgnUnit(b.dataset.goto); if (!k) return;
      state.rgn[k.level] = k.id;
      const i = RGN_LEVELS.indexOf(k.level);
      let p = k.parent, j = i - 1;
      while (p && j >= 0) { const pu = rgnUnit(p); if (!pu) break; state.rgn[pu.level] = pu.id; p = pu.parent; j--; }
      RGN_LEVELS.slice(i + 1).forEach(l => state.rgn[l] = '');
      renderRegions();
      window.scrollTo({ top: 0 });
    });
    $$('#rgn-body [data-hero]').forEach(b => b.onclick = () => {
      const p = (window.GW_HEROES.persons || []).find(x => x.id === b.dataset.hero); if (p) openHero(p);
    });
    $$('#rgn-body [data-place]').forEach(b => b.onclick = () => {
      const p = (window.GW_PLACES.places || []).find(x => x.id === b.dataset.place); if (p) openPlace(p);
    });
  }

  /* ---------- लोक-कथाएँ (अलग पैनल) ---------- */
  function allStories() {
    const out = [];
    RGN().forEach(u => (u.entities || []).forEach(e => { if (e.kind === 'story') out.push({ u, e }); }));
    return out;
  }
  function renderStories() {
    const fl = $('#story-filters'); if (!fl) return;
    const states = rgnChildren(null, 'state').filter(s => RGN().some(u => (u.entities || []).some(e => e.kind === 'story') && (u.id === s.id || (u.parent || '').startsWith(s.id))));
    fl.innerHTML = `<button class="chip ${state.storyFilter === '' ? 'active' : ''}" data-sf="">सभी</button>` +
      states.map(s => `<button class="chip ${state.storyFilter === s.id ? 'active' : ''}" data-sf="${esc(s.id)}">${esc(s.name_hi)}</button>`).join('');
    $$('#story-filters [data-sf]').forEach(b => b.onclick = () => { state.storyFilter = b.dataset.sf; renderStories(); });
    let list = allStories();
    if (state.storyFilter) list = list.filter(x => x.u.id.startsWith(state.storyFilter));
    $('#story-count').textContent = list.length ? `${list.length} कथाएँ संकलित` : 'अभी कोई संकलित लोक-कथा नहीं — नीचे फ़ॉर्म से अपनी कथा भेजें (बुजुर्गों की ज़ुबानी)।';
    $('#story-list').innerHTML = list.map(x => entCard(x.e, x.u)).join('');
    const form = $('#story-form');
    const statesAll = rgnChildren(null, 'state');
    form.innerHTML = `
      <div style="display:grid;gap:6px">
        <select id="sf-state" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)">
          <option value="">राज्य चुनें</option>${statesAll.map(s => `<option value="${esc(s.id)}">${esc(s.name_hi)}</option>`).join('')}</select>
        <select id="sf-district" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)" disabled>
          <option value="">जिला चुनें</option></select>
        <input id="sf-village" placeholder="गाँव / तहसील / पोस्ट (जितना ज्ञात हो)" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)">
        <input id="sf-title" placeholder="कथा का शीर्षक" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)">
        <textarea id="sf-text" rows="5" placeholder="कथा (जैसी सुनी, वैसी लिखें)" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)"></textarea>
        <input id="sf-told" placeholder="सुनाने वाले बुजुर्ग का नाम + गाँव (अनिवार्य)" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)">
        <input id="sf-by" placeholder="आपका नाम (वैकल्पिक)" style="border:1.5px solid var(--line);border-radius:10px;padding:8px;font-family:var(--deva)">
        <button class="btn" id="sf-submit" style="justify-self:start">📤 कथा तैयार करें (सत्यापन-कतार हेतु)</button>
        <div id="sf-out"></div>
      </div>`;
    const ss = $('#sf-state'), sd = $('#sf-district');
    ss.onchange = () => {
      const kids = ss.value ? rgnChildren(ss.value, 'district') : [];
      sd.disabled = !kids.length;
      sd.innerHTML = '<option value="">जिला चुनें</option>' + kids.map(k => `<option value="${esc(k.id)}">${esc(k.name_hi)}</option>`).join('');
    };
    $('#sf-submit').onclick = () => {
      const title = $('#sf-title').value.trim(), text = $('#sf-text').value.trim(), told = $('#sf-told').value.trim();
      const dist = $('#sf-district').value, stt = $('#sf-state').value, vil = $('#sf-village').value.trim();
      if (!title || text.length < 20) { alert('शीर्षक व कथा (कम से कम 20 अक्षर) आवश्यक।'); return; }
      if (!told) { alert('स्रोत-नीति: सुनाने वाले बुजुर्ग का नाम + गाँव अनिवार्य।'); return; }
      const unitId = dist || stt || 'state:cg';
      const payload = {
        unit_id: unitId,
        entity: { kind: 'story', name_hi: title, desc_hi: text, told_by: told, village: vil || '',
          sources: ['मौखिक परंपरा — ' + told], submitted_by: $('#sf-by').value.trim() || 'अनाम',
          added: new Date().toISOString().slice(0, 10), verify: true }
      };
      const j = JSON.stringify(payload, null, 1);
      $('#sf-out').innerHTML = `<p class="small">✅ कथा-पैकेट तैयार। इसे (a) नीचे से कॉपी/डाउनलोड कर <b>gondwanaroots@gmail.com</b> पर भेजें, या (b) एडमिन-पैनल → नई शोध-प्रविष्टि → प्रकार <b>story</b> में चिपकाएँ। सत्यापन के बाद ही प्रकाशित होगी।</p>
        <textarea rows="6" readonly style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:8px;font-size:.8rem">${esc(j)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px"><button class="chip" id="sf-copy">📋 कॉपी</button><button class="chip" id="sf-dl">📥 डाउनलोड</button></div>`;
      $('#sf-copy').onclick = () => { try { navigator.clipboard.writeText(j); toast('कॉपी हो गया'); } catch (e) { toast('कॉपी विफल — textarea से चुनें'); } };
      $('#sf-dl').onclick = () => {
        const b = new Blob([j], { type: 'application/json' });
        const a2 = document.createElement('a'); a2.href = URL.createObjectURL(b);
        a2.download = 'lokkatha-' + Date.now().toString(36) + '.json'; a2.click();
      };
    };
  }

  /* ---------- आज का चयन (दैनिक-डाइजेस्ट) ---------- */
  function renderDaily() {
    const box = $('#home-daily');
    if (!box || typeof fetch !== 'function') return;
    fetch('daily_digest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d || !d.today) return;
      const t = d.today;
      box.style.display = '';
      box.innerHTML = `<p class="muted" style="letter-spacing:.14em;font-size:.72rem;margin:0">आज का चयन · ${esc(t.date_ist || '')}</p>
        <h3 style="margin:4px 0">${ENT_LBL[t.kind] || '📌'} ${esc(t.title_hi)}</h3>
        <p class="small" style="margin:2px 0">${esc(t.summary_hi || '')}</p>
        <p class="muted small" style="margin:2px 0">📍 ${esc(t.region || '')} · ${(t.sources || []).map(x => /^https?:/.test(x) ? `<a href="${esc(x)}" target="_blank" rel="noopener">स्रोत↗</a>` : esc(x)).join(' · ')}</p>`;
    }).catch(() => {});
  }

  function renderSettings() {
    $('#set-region').innerHTML = `<select class="hero-select" id="set-region-sel" style="max-width:300px;width:100%">${X.cities.map(c => `<option value="${c.id}" ${c.id === state.region ? 'selected' : ''}>${esc(c.name)} (${esc(c.state)})</option>`).join('')}</select>`;
    $('#set-region-sel').onchange = e => {
      state.region = e.target.value; localStorage.setItem('gw-region', state.region);
      festivals(true); renderAll();
      const sr = $('#sel-region'); if (sr) sr.value = state.region;
      toast('क्षेत्र: ' + cityOf().name);
    };
    $('#set-theme').innerHTML = [['light', '☀️ लाइट'], ['dark', '🌑 डार्क'], ['system', '⚙️ सिस्टम']]
      .map(([k, l]) => `<button class="chip ${prefs.theme === k ? 'active' : ''}" data-t="${k}">${l}</button>`).join('');
    $$('#set-theme .chip').forEach(b => b.onclick = () => { prefs.theme = b.dataset.t; savePrefs(); applyPrefs(); renderSettings(); });
    $('#set-font').innerHTML = [[14, 'छोटा'], [16, 'मध्यम'], [18, 'बड़ा']]
      .map(([sz, l]) => `<button class="chip ${prefs.fontSize === sz ? 'active' : ''}" data-s="${sz}">A · ${l}</button>`).join('');
    $$('#set-font .chip').forEach(b => b.onclick = () => { prefs.fontSize = +b.dataset.s; savePrefs(); applyPrefs(); renderSettings(); });
    $('#set-notify').innerHTML = `
      <button class="chip ${prefs.notifyFest ? 'active' : ''}" data-n="notifyFest">🎉 पर्व रिमाइंडर: ${prefs.notifyFest ? 'ON' : 'OFF'}</button>
      <button class="chip ${prefs.notifyMoon ? 'active' : ''}" data-n="notifyMoon">🌙 पूनम/अमावस: ${prefs.notifyMoon ? 'ON' : 'OFF'}</button>`;
    $$('#set-notify .chip').forEach(b => b.onclick = () => { prefs[b.dataset.n] = !prefs[b.dataset.n]; savePrefs(); renderSettings(); });
    $('#set-lang').innerHTML = '<p style="margin:0">अभी: <b>हिंदी</b> · मसराम गोंडी लिपि सर्वत्र उपलब्ध। English व गोंडी UI चरणबद्ध योजना में (FUTURE_PLAN)।</p>';
    $('#set-offline').innerHTML = '<div id="set-offline-in" class="muted small">जाँच हो रही है…</div>';
    if (window.caches) {
      caches.keys().then(ks => {
        const el = $('#set-offline-in');
        if (el) el.innerHTML = ks.length
          ? `<p style="margin:0">✅ ऑफ़लाइन कैश सक्रिय: <b>${ks.map(esc).join(', ')}</b><br>कैलेंडर · पर्व · पंचांग · महापुरुष · स्थल · लिपि — सारा डेटा डिवाइस पर।</p>`
          : '<p style="margin:0">पहली बार लोड होने पर कैश बन जाएगा (service worker)।</p>';
      });
    } else {
      const el = $('#set-offline-in');
      if (el) el.textContent = 'इस ब्राउज़र में Cache API उपलब्ध नहीं — पर सारा डेटा ऐप-फ़ाइलों में ही है (कोई सर्वर नहीं)।';
    }
    $('#set-about').innerHTML = `<p style="margin:2px 0"><b>गोंडवाना कैलेंडर v2.0</b> — UI blueprint संस्करण</p>
      <p class="small">🌐 <a target="_blank" rel="noopener" href="https://saiyyamdeveloper.github.io/Gondwana-Saiyyam-calendar-/">लाइव ऐप</a> · 📦 <a target="_blank" rel="noopener" href="https://github.com/saiyyamdeveloper/Gondwana-Saiyyam-calendar-">GitHub repo</a></p>
      <p class="small">🛡️ <a href="./admin.html" target="_blank" rel="noopener">एडमिन सत्यापन-पैनल</a> <span class="muted">(केवल अधिकृत एडमिन/सुपर-एडमिन हेतु)</span></p>
      <p class="small">🤖 स्वचालित निरीक्षण: ${window.GWValidate ? '1050+' : ''} जाँच हर लोड पर (validate.js) + GitHub Actions CI (हर push)।</p>
      <p class="small">डेटा-नीति: स्रोत अनिवार्य · verify ⚠ फ़्लैग · फ़ोटो केवल PD/CC · GPS-सटीकता लेबल।</p>
      <div class="src">स्रोत: arXiv:1306.2416 (Vahia &amp; Halkare) · Unicode L2/15-090R · AGPE रॉयल गोंडवाना रिसर्च जर्नल 2025 · गोंड समाज महासभा म.प्र. कैलेंडर 2026 · ST-2011 जनगणना · द्रिक पंचांग (verify-फ़्लैग सहित)</div>`;
  }

  /* ---------- अधिक (More) ---------- */
  function renderMore() {
    $('#more-grid').innerHTML = NAV_ALL.filter(n => n.id !== 'home').map(n =>
      `<button class="more-btn" data-tab="${n.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${n.ico}</svg><span>${n.lbl}</span></button>`).join('') +
      `<button class="more-btn" id="more-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span>खोज</span></button>`;
    $$('#more-grid [data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    const ms = $('#more-search'); if (ms) ms.onclick = openSearch;
  }

  /* ---------- ग्लोबल खोज ---------- */
  function openSearch() {
    openSheet(`<h3 style="margin:2px 0 8px">🔍 खोज — पूरा गोंडवाना</h3>
      <input id="gs-in" type="search" placeholder="पर्व, महापुरुष, स्थल, गोंडी शब्द…" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:9px 10px;font-family:var(--deva);font-size:.95rem">
      <div id="gs-res" class="muted small" style="margin-top:8px">कम-से-कम 2 अक्षर टाइप करें।</div>`);
    const inp = $('#gs-in');
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      const res = $('#gs-res');
      if (q.length < 2) { res.innerHTML = 'कम-से-कम 2 अक्षर टाइप करें।'; return; }
      const fe = X.festivals.filter(f => ((f.deva || '') + (f.gondi || '') + (f.meaning || '') + (f.story || '')).toLowerCase().includes(q)).slice(0, 6);
      const he = H.persons.filter(p => [p.name_hi, p.name_en, p.tribe_hi, p.state, p.first_achievement].join(' ').toLowerCase().includes(q)).slice(0, 6);
      const pl = PL.places.filter(p => [p.name_hi, p.name_en, p.state, p.district, p.tribes, p.significance].join(' ').toLowerCase().includes(q)).slice(0, 6);
      const pn = X.map_pins.filter(p => ((p.deva || '') + (p.name || '') + (p.history || '')).toLowerCase().includes(q)).slice(0, 4);
      const words = [];
      Object.values(D.calendar_terms).forEach(v => { if (((v.gondi || '') + (v.deva || '') + (v.meaning || '') + (v.hindi || '')).toLowerCase().includes(q)) words.push({ g: v.gondi || v.deva || '', m: v.meaning || v.hindi || '' }); });
      D.astronomy_terms.forEach(a => { if ((a.term + a.meaning).toLowerCase().includes(q)) words.push({ g: a.term, m: a.meaning }); });
      let html = '';
      if (fe.length) html += `<p class="gs-head">🎉 पर्व (${fe.length})</p>` + fe.map(f => `<button class="gs-item" data-t="fest" data-id="${f.id}"><b>${esc(f.deva)}</b>${f.gondi ? ` <span class="muted">${esc(f.gondi)}</span>` : ''}<br><span class="muted small">${esc((f.meaning || '').slice(0, 60))}</span></button>`).join('');
      if (he.length) html += `<p class="gs-head">🧑🏽‍🤝‍🧑🏽 महापुरुष (${he.length})</p>` + he.map(p => `<button class="gs-item" data-t="hero" data-id="${p.id}"><b>${esc(p.name_hi)}</b><br><span class="muted small">${esc(p.tribe_hi || '')} · ${esc(p.state || '')}</span></button>`).join('');
      if (pl.length) html += `<p class="gs-head">📍 स्थल (${pl.length})</p>` + pl.map(p => `<button class="gs-item" data-t="place" data-id="${p.id}"><b>${esc(p.name_hi)}</b><br><span class="muted small">${esc(p.state || '')}${p.district ? ' · ' + esc(p.district) : ''}</span></button>`).join('');
      if (pn.length) html += `<p class="gs-head">🗺️ नक्शा-पिन (${pn.length})</p>` + pn.map(p => `<button class="gs-item" data-t="pin" data-id="${p.id}"><b>${esc(p.deva || p.name)}</b></button>`).join('');
      if (words.length) html += `<p class="gs-head">𑴀 गोंडी शब्द (${words.length})</p>` + words.slice(0, 8).map(w => `<div class="gs-word"><b>${esc(w.g)}</b> <span class="gon">${G.convert(String(w.g))}</span><br><span class="muted small">${esc(w.m)}</span></div>`).join('');
      res.innerHTML = html || '<p>कोई परिणाम नहीं — वर्तनी जाँचें या दूसरा शब्द आज़माएँ।</p>';
      $$('#gs-res .gs-item').forEach(b => b.onclick = () => {
        const t = b.dataset.t, id = b.dataset.id;
        closeSheet();
        if (t === 'fest') {
          const F2 = festivals(), tk = state.sel;
          let found = null, foundNext = null;
          for (const k in F2.byDate) if (F2.byDate[k].some(f => f.id === id)) { found = found || k; if (k >= tk && !foundNext) foundNext = k; }
          setTab('calendar'); setTimeout(() => openDay(foundNext || found || state.sel), 80);
        } else if (t === 'hero') {
          const p = H.persons.find(x => x.id === id);
          setTab('heroes'); setTimeout(() => openHero(p), 80);
        } else if (t === 'place') {
          const p = PL.places.find(x => x.id === id);
          setTab('places'); setTimeout(() => openPlace(p), 80);
        } else if (t === 'pin') {
          setTab('map'); setTimeout(() => openPin(id), 80);
        }
      });
    };
  }

  /* ---------- sheet ---------- */
  function openSheet(html) { $('#sheet-body').innerHTML = html; $('#sheet-back').classList.add('open'); document.body.style.overflow = 'hidden'; bindSheetPins(); }
  function closeSheet() { $('#sheet-back').classList.remove('open'); document.body.style.overflow = ''; }
  function bindSheetPins() {
    $$('#sheet-body [data-pin]').forEach(b => b.onclick = () => { closeSheet(); setTab('map'); setTimeout(() => openPin(b.dataset.pin), 80); });
  }
  $('#sheet-back').addEventListener('click', e => { if (e.target === $('#sheet-back')) closeSheet(); });

  /* ---------- notifications ---------- */
  function setupNotify() {
    $('#btn-notify').onclick = async () => {
      if (!('Notification' in window)) { toast('इस ब्राउज़र में नोटिफिकेशन समर्थित नहीं'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('अनुमति नहीं मिली — सेटिंग्स में नोटिफिकेशन चालू करें'); return; }
      toast('🔔 रिमाइंडर चालू — ऐप खुला रहने पर पर्व-सूचनाएँ मिलेंगी');
      checkNotify(true);
      setInterval(checkNotify, 60000);
    };
  }
  let lastNotified = '';
  function checkNotify(force) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const tm = new Date(Date.now() + 86400000);
    const key = E.dateKey(tm.getFullYear(), tm.getMonth() + 1, tm.getDate());
    if (key === lastNotified && !force) return;
    const F = festivals();
    const fests = F.byDate[key] || [];
    const di = E.dayInfo(tm.getFullYear(), tm.getMonth() + 1, tm.getDate(), cityOf());
    const bits = [];
    if (fests.length && prefs.notifyFest) bits.push('कल: ' + fests.map(f => f.deva).join(', '));
    if (prefs.notifyMoon) {
      if (di.isPurnima) bits.push('कल पूनम (पूर्णिमा) है');
      if (di.isAmavasya) bits.push('कल अमावस है');
    }
    if (bits.length) { new Notification('गोंडवाना कैलेंडर 🪔', { body: bits.join(' · '), icon: 'icon-192.png' }); lastNotified = key; }
  }

  /* ---------- year select ---------- */
  function buildYearSel() {
    const ys = [];
    for (let y = today.getFullYear() - 2; y <= today.getFullYear() + 3; y++) ys.push(y);
    $('#cal-year').innerHTML = ys.map(y => `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y} (${E.gondiDigits(y)})</option>`).join('');
    $('#cal-year').onchange = () => { state.year = +$('#cal-year').value; renderAll(); };
    syncYearSel();
  }
  function syncYearSel() { const s = $('#cal-year'); if (s) s.value = state.year; }

  /* ---------- boot ---------- */
  function renderAll() {
    renderCalendar();
    if (state.tab === 'festivals') renderFestivals();
    if (state.tab === 'panchang') renderPanchang();
    if (state.tab === 'map') renderMap();
    if (state.tab === 'home') renderHome();
  }
  function boot() {
    buildNav(); buildHeader(); buildYearSel(); setupNotify();
    $('#cal-prev').onclick = () => { state.month--; if (state.month < 1) { state.month = 12; state.year--; } syncYearSel(); renderCalendar(); };
    $('#cal-next').onclick = () => { state.month++; if (state.month > 12) { state.month = 1; state.year++; } syncYearSel(); renderCalendar(); };
    $('#cal-today').onclick = () => { const t = new Date(); state.year = t.getFullYear(); state.month = t.getMonth() + 1; state.sel = E.dateKey(state.year, state.month, t.getDate()); syncYearSel(); state.view = 'month'; renderCalendar(); };
    const cvb = $('#cal-view');
    if (cvb) cvb.onclick = () => { state.view = state.view === 'month' ? 'year' : 'month'; cvb.textContent = state.view === 'month' ? '🗓️ वर्ष दृश्य' : '📅 माह दृश्य'; renderCalendar(); };
    const bs = $('#btn-search'); if (bs) bs.onclick = openSearch;
    applyPrefs();
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs.theme === 'system') applyPrefs(); }); } catch (e) {} }
    renderLipi(); renderLearn(); renderMore(); renderHome(); renderRegions(); renderStories();
    renderAll();
    // परत 1: सेल्फ-चेक (डेटा-अखंडता + इंजन anchor)
    let validateReport = null;
    if (window.GWValidate) {
      try {
        validateReport = window.GWValidate.run();
        if (validateReport.failed > 0) {
          console.warn('[सेल्फ-चेक] त्रुटियाँ:', validateReport.errors);
          toast('⚠ डेटा-जाँच: ' + validateReport.failed + ' त्रुटि — विवरण कंसोल में');
        } else if (validateReport.warnings.length) {
          console.info('[सेल्फ-चेक] ' + validateReport.checks + ' जाँच पास · ' + validateReport.warnings.length + ' चेतावनी', validateReport.warnings);
        } else {
          console.info('[सेल्फ-चेक] सभी ' + validateReport.checks + ' जाँच पास ✓');
        }
      } catch (e) { console.warn('[सेल्फ-चेक] विफल:', e); }
    }
    // debug/test handle
    window.__GW = { state, get validateReport() { return validateReport; }, renderFestivals, renderPanchang, renderMap, renderLearn, renderCalendar, renderHeroes, heroOfTheDay, openHero, renderPlaces, openPlace, renderHome, renderLipi, renderSettings, renderMore, openSearch, drawYearView, prefs, openDay, openPin, festivals, diOf, renderRegions, renderStories, renderDaily };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
