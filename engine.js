/* ============================================================
   Gondwana Calendar App — engine.js
   दृक्-सन्निकट पंचांग इंजन (approximate Drik panchang engine)
   सूर्य/चंद्र देशांतर (Meeus/Duffett-Smith निम्न-परिशुद्धि), तिथि,
   नक्षत्र, अमांत/पूर्णिमांत माह, धोंडा(अधिक) पहचान, सूर्योदय-सूर्यास्त,
   पर्व-गणना (तिथि-नियम, क्षय-तिथि fallback सहित), ऋतु, गोंडी माह।
   सटीकता: तिथि/पर्व सामान्यतः ±0 दिन; सीमांत मामलों में ±1 (नोट देखें)।
   ============================================================ */
(function (g) {
  'use strict';
  const R = Math.PI / 180;
  const sind = d => Math.sin(d * R);
  const cosd = d => Math.cos(d * R);
  const norm360 = x => ((x % 360) + 360) % 360;

  /* ---------- Julian Day (IST decimal hours) ---------- */
  function jd(y, m, d, istHours) {
    return (Date.UTC(y, m - 1, d, 0, 0, 0) + (istHours - 5.5) * 3600000) / 86400000 + 2440587.5;
  }

  /* ---------- Sun (tropical longitude, ±0.01°) ---------- */
  function sunLon(JD) {
    const T = (JD - 2451545.0) / 36525;
    const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
      + (0.019993 - 0.000101 * T) * sind(2 * M)
      + 0.000289 * sind(3 * M);
    return norm360(L0 + C);
  }

  /* ---------- Moon (tropical longitude, ±~0.3°) ---------- */
  function moonLon(JD) {
    const T = (JD - 2451545.0) / 36525;
    const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
    const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
    const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
    const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    let lon = Lp
      + 6.288774 * sind(Mp)
      + 1.274027 * sind(2 * D - Mp)
      + 0.658314 * sind(2 * D)
      + 0.213618 * sind(2 * Mp)
      - 0.185116 * sind(M)
      - 0.114332 * sind(2 * F)
      + 0.058793 * sind(2 * D - 2 * Mp)
      + 0.057066 * sind(2 * D - M - Mp)
      + 0.053322 * sind(2 * D + Mp)
      + 0.045758 * sind(2 * D - M)
      - 0.040923 * sind(M - Mp)
      - 0.034720 * sind(D)
      - 0.030383 * sind(M + Mp)
      + 0.015327 * sind(2 * D - 2 * F)
      - 0.012528 * sind(F + Mp)
      + 0.010980 * sind(F - Mp)
      + 0.010675 * sind(4 * D - Mp)
      + 0.010034 * sind(3 * Mp)
      + 0.008548 * sind(2 * D + 2 * Mp)
      + 0.007882 * sind(D + Mp)
      + 0.007560 * sind(2 * D - M + Mp)
      - 0.005816 * sind(2 * D + 2 * Mp - M)
      - 0.004028 * sind(2 * D - M - 2 * Mp);
    return norm360(lon);
  }

  function ayanamsa(JD) { return 23.85 + ((JD - 2451545.0) / 365.25) * 0.013969; } // Lahiri approx
  function elongAt(JD) { return norm360(moonLon(JD) - sunLon(JD)); }

  /* ---------- Sunrise / Sunset (Wikipedia sunrise equation, IST) ---------- */
  function sunriseSet(y, m, d, lat, lon) {
    const JD0 = jd(y, m, d, 12);
    const n = Math.ceil(JD0 - 2451545.0 + 0.0008);
    const Jstar = n - lon / 360;
    const M = norm360(357.5291 + 0.98560028 * Jstar);
    const C = 1.9148 * sind(M) + 0.02 * sind(2 * M) + 0.0003 * sind(3 * M);
    const lam = norm360(M + C + 180 + 102.9372);
    const Jtransit = 2451545.0 + Jstar + 0.0053 * sind(M) - 0.0069 * sind(2 * lam);
    const sinDec = sind(lam) * sind(23.4397);
    const cosWo = (sind(-0.833) - sind(lat) * sinDec) / (cosd(lat) * Math.sqrt(1 - sinDec * sinDec));
    if (cosWo < -1 || cosWo > 1) return null;
    const Wo = Math.acos(cosWo) / R;
    const toIST = J => ((((J + 0.5) % 1) * 24 + 5.5) % 24);
    return { rise: toIST(Jtransit - Wo / 360), set: toIST(Jtransit + Wo / 360) };
  }

  /* ---------- constants ---------- */
  const LUNAR = ['Chaitra','Vaishakha','Jyeshtha','Ashadha','Shravana','Bhadrapada','Ashvina','Kartika','Margashirsha','Pausha','Magha','Phalguna'];
  const LUNAR_DEVA = ['चैत्र','वैशाख','ज्येष्ठ','आषाढ़','श्रवण','भाद्रपद','आश्विन','कार्तिक','मार्गशीर्ष','पौष','माघ','फाल्गुन'];
  const RASHI_DEVA = ['मेष','वृषभ','मिथुन','कर्क','सिंह','कन्या','तुला','वृश्चिक','धनु','मकर','कुंभ','मीन'];
  const TITHI_DEVA = ['प्रतिपदा','द्वितीया','तृतीया','चतुर्थी','पंचमी','षष्ठी','सप्तमी','अष्टमी','नवमी','दशमी','एकादशी','द्वादशी','त्रयोदशी','चतुर्दशी','पूर्णिमा'];
  const RITU = ['शिशिर','वसंत','ग्रीष्म','वर्षा','शरद','हेमंत'];
  const NAK = ['अश्विनी','भरणी','कृत्तिका','रोहिणी','मृगशिरा','आर्द्रा','पुनर्वसु','पुष्य','आश्लेषा','मघा','पूर्व फाल्गुनी','उत्तर फाल्गुनी','हस्त','चित्रा','स्वाती','विशाखा','अनुराधा','ज्येष्ठा','मूल','पूर्वाषाढ़ा','उत्तराषाढ़ा','श्रवण','धनिष्ठा','शतभिषा','पूर्व भाद्रपद','उत्तर भाद्रपद','रेवती'];
  const GONDI_M = {
    Ashadha:'अखाडी (Akadi)', Shravana:'पोरा (Pora)', Bhadrapada:'अकुर पोक (Akur Pok)',
    Ashvina:'दिवाडी (Divadi)', Kartika:'कारथी (Kaarthi)', Margashirsha:'सत्ती (Satti)',
    Pausha:'पूस (Poosh)', Magha:'माहो (Maho)', Phalguna:'धुराडी (Dhuradi)',
    Chaitra:'चैथ (Chaith)', Vaishakha:'भवई (Bhavai)', Jyeshtha:'बुड भवई (Bud Bhavai)'
  };
  const PHASE_NAMES = ['अमावस्या (New Moon)','शुक्ल प्रतिपदा-पंचमी (Waxing Crescent)','शुक्ल अष्टमी (First Quarter)','शुक्ल दशमी-चतुर्दशी (Waxing Gibbous)','पूर्णिमा (Full Moon)','कृष्ण प्रतिपदा-पंचमी (Waning Gibbous)','कृष्ण अष्टमी (Last Quarter)','कृष्ण दशमी-चतुर्दशी (Waning Crescent)'];
  function phaseName(ph) {
    if (ph < 0.02 || ph > 0.98) return PHASE_NAMES[0];
    if (ph < 0.23) return PHASE_NAMES[1];
    if (ph < 0.27) return PHASE_NAMES[2];
    if (ph < 0.48) return PHASE_NAMES[3];
    if (ph < 0.52) return PHASE_NAMES[4];
    if (ph < 0.73) return PHASE_NAMES[5];
    if (ph < 0.77) return PHASE_NAMES[6];
    return PHASE_NAMES[7];
  }
  function fmtHours(h) {
    if (h == null) return '—';
    let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh++; mm = 0; }
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  function dateKey(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function addDays(y, m, d, k) { const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + k); return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function jdToISTDate(J) {
    const dt = new Date((J - 2440587.5) * 86400000 + 5.5 * 3600000);
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  }

  /* ---------- new-moon moment search ---------- */
  function newMoonIn(jdA) { // window [jdA, jdA+1]; returns JD of wrap or null
    const e0 = elongAt(jdA), e1 = elongAt(jdA + 1);
    if (e1 >= e0) return null;
    let lo = jdA, hi = jdA + 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (elongAt(mid) > 180) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const _nmCache = {};
  function prevNewMoonsJD(JDstart, count) {
    const key = JDstart.toFixed(4) + '#' + count;
    if (_nmCache[key]) return _nmCache[key];
    const out = [];
    let probe = JDstart, guard = 0;
    while (out.length < count && guard < 80) {
      const dayStart = Math.floor(probe);
      const nm = newMoonIn(dayStart);
      if (nm && nm < JDstart && nm >= dayStart - 0.0001) out.push(nm);
      probe = dayStart - 1;
      guard++;
    }
    const uniq = [...new Set(out.map(x => x.toFixed(5)))].map(Number).sort((a, b) => b - a).slice(0, count);
    _nmCache[key] = uniq;
    return uniq;
  }

  /* ---------- amanta month at an arbitrary moment (consistent basis) ---------- */
  const _moCache = {};
  function monthInfoAtJD(JD) {
    const key = JD.toFixed(4);
    if (_moCache[key]) return _moCache[key];
    const nms = prevNewMoonsJD(JD, 1);
    if (!nms.length) return null;
    const t0 = nms[0];
    const r1 = Math.floor(norm360(sunLon(t0) - ayanamsa(t0)) / 30);
    const idx = (r1 + 1) % 12;
    // adhika (धोंडा) detection: जिस माह में कोई संक्रांति नहीं = अगली अमावस्या पर भी वही राशि
    // (FIX 2026-09-12: पहले पिछली अमावस्या से तुलना होती थी — अधिक-माह एक माह पीछे खिसक जाता था;
    //  self-check validator ने पकड़ा; प्रामाणिक: अधिक श्रावण 2023 = 18 जुलाई–16 अगस्त)
    let adhika = false, t2 = null;
    let probe = Math.floor(t0) + 1, guard = 0;
    while (!t2 && guard < 40) {
      const nm = newMoonIn(probe);
      if (nm && nm > t0 + 0.01) t2 = nm;
      probe += 1; guard++;
    }
    if (t2) {
      const r2 = Math.floor(norm360(sunLon(t2) - ayanamsa(t2)) / 30);
      adhika = (r1 === r2);
    }
    const res = { idx, name: LUNAR[idx], deva: LUNAR_DEVA[idx], adhika, amavasyaDay: dateKey(...jdToISTDate(t0)), gondi: GONDI_M[LUNAR[idx]] };
    _moCache[key] = res;
    return res;
  }
  function whenHours(y, m, d, city, when) {
    const ss = sunriseSet(y, m, d, city.lat, city.lon);
    if (when === 'aparahna') { const noon = ss ? (ss.rise + ss.set) / 2 : 12.4; return noon + 1.5; }
    if (when === 'midnight') return 23.999;
    if (when === 'noon') return 12.0;
    return ss ? ss.rise : 6.4;
  }
  function tithiAtWhen(y, m, d, city, when) {
    const h = whenHours(y, m, d, city, when);
    const JD = jd(y, m, d, h);
    const idx = Math.floor(elongAt(JD) / 12);
    return { idx, paksha: idx < 15 ? 'S' : 'K', tnum: (idx % 15) + 1, JD };
  }
  // month+tithi on a consistent time basis
  function panchangAt(y, m, d, city, when) {
    const tw = tithiAtWhen(y, m, d, city, when);
    const mo = monthInfoAtJD(tw.JD);
    return { tithi: tw, month: mo };
  }

  /* ---------- full day info (sunrise basis — traditional udaya tithi) ---------- */
  const _dayCache = {};
  function dayInfo(y, m, d, city) {
    const key = dateKey(y, m, d) + '@' + city.id;
    if (_dayCache[key]) return _dayCache[key];
    const ss = sunriseSet(y, m, d, city.lat, city.lon);
    const srH = ss ? ss.rise : 6.4;
    const J = jd(y, m, d, srH);
    const el = elongAt(J);
    const tidx = Math.floor(el / 12);
    const ay = ayanamsa(J);
    const sunSid = norm360(sunLon(J) - ay), moonSid = norm360(moonLon(J) - ay);
    const rashi = Math.floor(sunSid / 30);
    const nak = Math.min(26, Math.floor(moonSid * 27 / 360));
    const am = monthInfoAtJD(J);
    const paksha = tidx < 15 ? 'S' : 'K';
    const tnum = (tidx % 15) + 1;
    const ph = el / 360;
    let pIdx = am ? am.idx : 0;
    if (paksha === 'K') pIdx = (pIdx + 1) % 12;
    const gsIdx = (rashi - 9 + 12) % 12; // 0=January=Pado man
    const ritu = Math.floor(((rashi + 3) % 12) / 2);
    const info = {
      key: dateKey(y, m, d), y, m, d,
      tithiIdx: tidx, paksha, tnum,
      tithi: tnum === 15 ? (paksha === 'S' ? 'पूर्णिमा' : 'अमावस्या') : (paksha === 'S' ? 'शुक्ल ' + tnum : 'कृष्ण ' + tnum),
      tithiName: tnum === 15 ? (paksha === 'S' ? 'पूर्णिमा' : 'अमावस्या') : TITHI_DEVA[tnum - 1],
      gondiTithi: tnum === 15 ? (paksha === 'S' ? 'पूनम (पूर्णिमा)' : 'अमावस') : (paksha === 'S' ? 'उजिया ' + tnum : 'अधि ' + tnum),
      nak, nakName: NAK[nak],
      rashi, rashiName: RASHI_DEVA[rashi],
      amanta: am,
      purnimanta: { idx: pIdx, name: LUNAR[pIdx], deva: LUNAR_DEVA[pIdx] },
      phase: ph, phaseName: phaseName(ph),
      sunrise: ss ? fmtHours(ss.rise) : null,
      sunset: ss ? fmtHours(ss.set) : null,
      ritu, rituName: RITU[ritu],
      solarGondiIdx: gsIdx,
      isAmavasya: tidx === 29, isPurnima: tidx === 14
    };
    _dayCache[key] = info;
    return info;
  }

  /* ---------- festival computation ---------- */
  function festivalsForYear(year, festivals, commemorative, city) {
    const byDate = {}, list = [], seasons = [];
    const matched = new Set();
    const start = addDays(year, 1, 1, -12), end = addDays(year + 1, 1, 1, 12);
    const endK = dateKey(end[0], end[1], end[2]);
    // pass 1: rule's own basis (sunrise default / aparahna / midnight); pass 2-3: consistent-basis fallbacks
    for (const passWhen of [null, 'noon', 'midnight']) {
      let cur = start;
      while (true) {
        const [y, m, d] = cur;
        const k = dateKey(y, m, d);
        const di = dayInfo(y, m, d, city);
        for (const f of festivals) {
          if (f.type === 'season' || f.type === 'announce' || matched.has(f.id)) continue;
          if (f.fixed) {
            if (y === year && m === f.fixed[0] && d === f.fixed[1]) { push(f, di, y, m, d); matched.add(f.id); }
            continue;
          }
          if (!f.month) continue;
          const mi = LUNAR.indexOf(f.month);
          let paksha, tnum, moIdx, adh;
          if (passWhen === null && !f.when) { paksha = di.paksha; tnum = di.tnum; moIdx = di.amanta ? di.amanta.idx : -1; adh = di.amanta ? di.amanta.adhika : false; }
          else {
            const p = panchangAt(y, m, d, city, passWhen || f.when);
            paksha = p.tithi.paksha; tnum = p.tithi.tnum;
            moIdx = p.month ? p.month.idx : -1; adh = p.month ? p.month.adhika : false;
          }
          if (!adh && moIdx === mi && paksha === f.paksha && tnum === f.tithi) {
            if (y === year || (m === 1 && y === year + 1) || (m === 12 && y === year - 1)) { push(f, di, y, m, d); matched.add(f.id); }
          }
        }
        if (k === endK) break;
        cur = addDays(y, m, d, 1);
      }
    }
    function push(f, di, y, m, d) {
      const k = dateKey(y, m, d);
      if (list.some(x => x.fest.id === f.id)) return;
      if (!byDate[k]) byDate[k] = [];
      byDate[k].push(f);
      list.push({ fest: f, date: k, y, m, d });
    }
    for (const f of festivals) {
      if (f.type !== 'season') continue;
      const s = findRuleDate(year, f.season_start, city);
      let e = findRuleDate(year, f.season_end, city);
      if (e && s && e < s) e = findRuleDate(year + 1, f.season_end, city);
      seasons.push({ fest: f, start: s, end: e });
    }
    const comm = [];
    for (const c of commemorative) {
      if (!c.date) { comm.push({ ...c, key: null }); continue; }
      const k = dateKey(year, c.date[0], c.date[1]);
      comm.push({ ...c, key: k });
      if (!byDate[k]) byDate[k] = [];
      byDate[k].push({ id: 'comm-' + c.deva, deva: c.deva, comm: true, meaning: c.note, note: c.note });
    }
    list.sort((a, b) => a.date < b.date ? -1 : 1);
    return { byDate, list, seasons, comm };
  }

  function findRuleDate(year, rule, city) {
    if (!rule || !rule.month) return null;
    const mi = LUNAR.indexOf(rule.month);
    const start = addDays(year, 1, 1, -12), end = addDays(year, 12, 31, 12);
    const endK = dateKey(end[0], end[1], end[2]);
    for (const when of [null, 'noon', 'midnight']) {
      let cur = start;
      while (true) {
        const [y, m, d] = cur;
        const p = panchangAt(y, m, d, city, when);
        if (p.month && !p.month.adhika && p.month.idx === mi && p.tithi.paksha === rule.paksha && p.tithi.tnum === rule.tithi) return dateKey(y, m, d);
        if (dateKey(y, m, d) === endK) break;
        cur = addDays(y, m, d, 1);
      }
    }
    return null;
  }

  /* ---------- misc helpers ---------- */
  function gondiDigits(numStr) { return String(numStr).replace(/[0-9]/g, c => String.fromCodePoint(0x11D50 + (+c))); }
  function lunarEventsForYear(year, city) {
    const evs = [];
    for (let m = 1; m <= 12; m++) {
      const n = daysInMonth(year, m);
      for (let d = 1; d <= n; d++) {
        const di = dayInfo(year, m, d, city);
        if (di.isAmavasya) evs.push({ type: 'अमावस्या', key: dateKey(year, m, d), month: di.amanta });
        else if (di.isPurnima) evs.push({ type: 'पूर्णिमा', key: dateKey(year, m, d), month: di.amanta });
      }
    }
    return evs;
  }
  function haversine(a, b) {
    const toR = x => x * Math.PI / 180;
    const Rk = 6371, dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * Rk * Math.asin(Math.sqrt(h)));
  }
  function bearing(a, b) {
    const toR = x => x * Math.PI / 180;
    const y = Math.sin(toR(b.lon - a.lon)) * Math.cos(toR(b.lat));
    const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(toR(b.lon - a.lon));
    const br = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const dirs = ['उत्तर','उत्तर-पूर्व','पूर्व','दक्षिण-पूर्व','दक्षिण','दक्षिण-पश्चिम','पश्चिम','उत्तर-पश्चिम'];
    return dirs[Math.round(br / 45) % 8];
  }

  const E = {
    jd, sunLon, moonLon, sunriseSet, dayInfo, monthInfoAtJD, panchangAt, tithiAtWhen,
    festivalsForYear, findRuleDate, lunarEventsForYear, gondiDigits, haversine, bearing,
    fmtHours, dateKey, addDays, daysInMonth,
    LUNAR, LUNAR_DEVA, RASHI_DEVA, TITHI_DEVA, NAK, RITU, GONDI_M, phaseName
  };
  g.GWEngine = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
