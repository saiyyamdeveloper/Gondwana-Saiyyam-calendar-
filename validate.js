/* ============ Gondwana Calendar App — validate.js ============
   परत 1: रनटाइम सेल्फ-चेक (ऑफलाइन, बिना DOM)
   - डेटा-अखंडता जाँच (heroes, places, pins, cities, festivals)
   - इंजन anchor self-test (सत्यापित तिथियों से तुलना)
   रिपोर्ट: window.GWValidate.run() → { checks, passed, failed, warnings, errors }
   नीति: विफलता पर ऐप चलता रहेगा (fallback), पर यूज़र+कंसोल को सूचना। */
(function () {
  'use strict';
  const HERO_CATS = ['freedom', 'collective', 'military', 'governance', 'education', 'literature', 'art', 'language', 'sports'];
  const PLACE_CATS = ['dharmik', 'shahid', 'smarak', 'aitihasik'];
  const GPS_PRECS = ['exact', 'approximate', 'city-level', 'region-level', 'district-level'];
  const ZONES = ['north', 'west', 'south', 'east'];

  function yearOf(s) {
    if (!s) return null;
    const m = String(s).match(/\d{4}/);
    return m ? +m[0] : null;
  }
  function inIndia(lat, lon) {
    return typeof lat === 'number' && typeof lon === 'number' &&
      lat >= 6 && lat <= 38 && lon >= 67 && lon <= 99;
  }

  function run() {
    const errors = [], warnings = [];
    let checks = 0;
    const ok = (cond, code, msg) => { checks++; if (!cond) errors.push({ code, msg }); };
    const warn = (cond, code, msg) => { checks++; if (!cond) warnings.push({ code, msg }); };

    const D = window.GW_DATA, X = window.GW_EXTRA, H = window.GW_HEROES, PL = window.GW_PLACES,
      E = window.GWEngine;

    /* ---- 0. डेटा-उपस्थिति ---- */
    ok(!!D, 'DATA_MISSING', 'GW_DATA लोड नहीं हुआ');
    ok(!!X, 'EXTRA_MISSING', 'GW_EXTRA लोड नहीं हुआ');
    ok(!!H, 'HEROES_MISSING', 'GW_HEROES लोड नहीं हुआ');
    ok(!!PL, 'PLACES_MISSING', 'GW_PLACES लोड नहीं हुआ');
    ok(!!E, 'ENGINE_MISSING', 'GWEngine लोड नहीं हुआ');
    if (!D || !X || !H || !PL || !E) return finish();

    /* ---- 1. महापुरुष डेटाबेस ---- */
    const hids = new Set();
    H.persons.forEach(p => {
      ok(!hids.has(p.id), 'HERO_DUP_ID', 'दोहराव id: ' + p.id); hids.add(p.id);
      ok(!!p.name_hi, 'HERO_NO_NAME', p.id + ': name_hi खाली');
      ok(HERO_CATS.includes(p.category), 'HERO_BAD_CAT', p.id + ': अवैध category "' + p.category + '"');
      ok(Array.isArray(p.sources) && p.sources.length > 0, 'HERO_NO_SOURCE', p.id + ': स्रोत खाली (नीति-उल्लंघन)');
      const by = yearOf(p.birth), dy = yearOf(p.death);
      ok(!(by && dy && dy < by), 'HERO_DATES', p.id + ': निधन-वर्ष जन्म-वर्ष से पहले');
      ok(!p.photo || !!p.photo_source, 'HERO_PHOTO_LICENSE', p.id + ': फ़ोटो है पर photo_source/लाइसेंस नहीं');
      ok(p.verify === true || p.verify === false || p.verify == null, 'HERO_VERIFY_TYPE', p.id + ': verify फ़्लैग अमान्य');
      warn(!p.verify || !!p.verify_note, 'HERO_VERIFY_NOTE', p.id + ': verify:true पर verify_note खाली');
    });

    /* ---- 2. स्थल-कोश ---- */
    const pids = new Set();
    PL.places.forEach(p => {
      ok(!pids.has(p.id), 'PLACE_DUP_ID', 'दोहराव id: ' + p.id); pids.add(p.id);
      ok(!!p.name_hi, 'PLACE_NO_NAME', p.id + ': name_hi खाली');
      ok(PLACE_CATS.includes(p.category), 'PLACE_BAD_CAT', p.id + ': अवैध category "' + p.category + '"');
      ok(GPS_PRECS.includes(p.gps_precision), 'PLACE_BAD_GPSPREC', p.id + ': अवैध gps_precision');
      ok(inIndia(p.lat, p.lon), 'PLACE_GPS_RANGE', p.id + ': GPS भारत-सीमा से बाहर (' + p.lat + ',' + p.lon + ')');
      ok(Array.isArray(p.sources) && p.sources.length > 0, 'PLACE_NO_SOURCE', p.id + ': स्रोत खाली');
      if (p.map_pin_id) {
        ok(X.map_pins.some(mp => mp.id === p.map_pin_id), 'PLACE_BAD_PIN', p.id + ': map_pin_id "' + p.map_pin_id + '" map_pins में नहीं');
      }
    });

    /* ---- 3. नक्शा-पिन व शहर ---- */
    const mpids = new Set();
    X.map_pins.forEach(mp => {
      ok(!mpids.has(mp.id), 'PIN_DUP_ID', 'दोहराव pin id: ' + mp.id); mpids.add(mp.id);
      ok(inIndia(mp.lat, mp.lon), 'PIN_GPS_RANGE', mp.id + ': pin GPS सीमा से बाहर');
      ok(ZONES.includes(mp.zone), 'PIN_BAD_ZONE', mp.id + ': अज्ञात zone');
    });
    const cids = new Set();
    X.cities.forEach(c => {
      ok(!cids.has(c.id), 'CITY_DUP_ID', 'दोहराव city id: ' + c.id); cids.add(c.id);
      ok(inIndia(c.lat, c.lon), 'CITY_GPS_RANGE', c.id + ': शहर GPS सीमा से बाहर');
    });

    /* ---- 4. पर्व-डेटा संरचना ---- */
    const fids = new Set();
    X.festivals.forEach(f => {
      ok(!fids.has(f.id), 'FEST_DUP_ID', 'दोहराव festival id: ' + f.id); fids.add(f.id);
      ok(!!(f.deva || f.name), 'FEST_NO_NAME', f.id + ': नाम खाली');
      ok(!!f.tithi || !!f.type || !!f.fixed, 'FEST_NO_RULE', f.id + ': न tithi-नियम, न fixed, न type फ़्लैग');
      ok(!!f.source, 'FEST_NO_SRC', f.id + ': source टैग खाली (नीति-उल्लंघन)');
    });

    /* ---- 4b. होम/लिपि डेटा-पूल (v2.0 UI) ---- */
    ok(Array.isArray(D.weekdays) && D.weekdays.length === 7, 'WEEKDAYS_7', 'weekdays 7 नहीं');
    ok(D.numerals && Array.isArray(D.numerals.words_1_to_10) && D.numerals.words_1_to_10.length === 10, 'NUMERALS_10', 'numerals 1-10 अधूरे');
    ok(Array.isArray(X.nakshatras) && X.nakshatras.length === 27, 'NAK_27', 'नक्षत्र 27 नहीं');
    ok(Array.isArray(X.rashis) && X.rashis.length === 12, 'RASHI_12', 'राशि 12 नहीं');
    ok(X.gondi_month_map && Array.isArray(X.gondi_month_map.map) && X.gondi_month_map.map.length === 12, 'GONDI_MONTHS_12', 'गोंडी माह-मानचित्र 12 नहीं');
    ok(D.months_solar_gondi_variantA && D.months_solar_gondi_variantA.list.length === 12, 'SOLAR_GONDI_12', 'गोंडी सौर माह 12 नहीं');
    const cu = D.culture_layer;
    ok(!!(cu && cu.greeting && cu.greeting.call && cu.greeting.reply), 'CULT_GREET', 'अभिवादन डेटा अधूरा');
    ok(cu && Array.isArray(cu.deities) && cu.deities.length >= 1, 'CULT_DEITIES', 'देवी-देवता सूची खाली');
    ok(cu && cu.music_dance && cu.music_dance.dhemsa_16 && cu.music_dance.dhemsa_16.length === 16, 'CULT_DHEMSA16', 'ढेम्सा 16 मुद्राएँ अधूरी');
    ok(cu && cu.music_dance && cu.music_dance.vadya_18 && cu.music_dance.vadya_18.length === 18, 'CULT_VADYA18', 'वाद्य 18 सूची अधूरी');
    ok(cu && Array.isArray(cu.sample_sentences) && cu.sample_sentences.length >= 1, 'CULT_SENT', 'नमूना वाक्य खाली');
    ok(cu && cu.gotras && cu.gotras.count_claimed > 0, 'CULT_GOTRA', 'गोत्र-डेटा अधूरा');
    ok(Array.isArray(X.timeline) && X.timeline.every(t2 => t2.year && t2.event), 'TIMELINE_ROWS', 'टाइमलाइन पंक्ति में year/event खाली');
    ok(Object.keys(D.calendar_terms || {}).length >= 5, 'CAL_TERMS', 'कैलेंडर शब्दावली बहुत छोटी');
    ok(Array.isArray(D.astronomy_terms) && D.astronomy_terms.length >= 3, 'ASTRO_TERMS', 'खगोल शब्दावली बहुत छोटी');

    /* ---- 5. इंजन anchor self-test (Bhopal — सत्यापित तिथियाँ) ---- */
    const bhopal = X.cities.find(c => c.id === 'bhopal');
    if (bhopal) {
      let F26;
      try { F26 = E.festivalsForYear(2026, X.festivals, X.commemorative, bhopal); } catch (e) { ok(false, 'ENGINE_2026', 'festivalsForYear(2026) विफल: ' + e.message); }
      if (F26) {
        const anchors = [
          ['navaratra', '2026-10-20', 'दशहरा 2026'],
          ['diwali', '2026-11-09', 'दीपावली 2026'],
          ['punal-saal', '2026-03-19', 'पुनाल साल 2026'],
          ['holi', '2026-03-03', 'होली 2026'],
          ['pola', '2026-09-11', 'पोला 2026']
        ];
        anchors.forEach(([id, key, lbl]) => {
          const day = F26.byDate[key] || [];
          ok(day.some(f => f.id === id), 'ANCHOR_' + id.toUpperCase(), lbl + ' → ' + key + ' पर नहीं मिला');
        });
      }
      try {
        // प्रामाणिक: अधिक मास 2023 = 18 जुलाई–16 अगस्त (श्रावण अधिक — aajtak/abplive/sakalam)
        const di = E.dayInfo(2023, 7, 25, bhopal);
        ok(di.amanta && di.amanta.adhika === true, 'ANCHOR_ADHIKA', '2023-07-25 अधिक(धोंडा) माह नहीं मिला');
        const dj = E.dayInfo(2023, 6, 25, bhopal);
        ok(dj.amanta && dj.amanta.adhika === false && dj.amanta.name === 'Ashadha', 'ANCHOR_NIJA', '2023-06-25 निज आषाढ़ जाँच विफल');
        const da = E.dayInfo(2023, 8, 25, bhopal);
        ok(da.amanta && da.amanta.adhika === false, 'ANCHOR_POST_ADHIKA', '2023-08-25 (अधिक के बाद) निज माह होना चाहिए');
      } catch (e) { ok(false, 'ANCHOR_ADHIKA', 'adhika जाँच विफल: ' + e.message); }
      try {
        const dp = E.dayInfo(2026, 9, 11, bhopal);
        ok(dp.isAmavasya === true, 'ANCHOR_AMAVASYA', 'पोला-दिन 2026-09-11 अमावस नहीं');
      } catch (e) { ok(false, 'ANCHOR_AMAVASYA', 'dayInfo(2026-09-11) विफल: ' + e.message); }
    } else {
      ok(false, 'CITY_BHOPAL', 'anchor-टेस्ट हेतु bhopal शहर नहीं मिला');
    }

    return finish();
    function finish() {
      const failed = errors.length;
      return { checks, passed: checks - failed - warnings.length, failed, warnings, errors, ok: failed === 0 };
    }
  }

  window.GWValidate = { run, version: '1.0' };
})();
