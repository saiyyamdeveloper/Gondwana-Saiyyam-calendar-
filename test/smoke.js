/* DOM-stub smoke test: loads data/converter/engine/app and exercises all render paths */
'use strict';
const fs = require('fs'), path = require('path');
const APP = path.join(__dirname, '..');

// ---------- minimal DOM ----------
function mkClassList() {
  const s = new Set();
  return {
    add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
    toggle: (c, f) => { const on = f === undefined ? !s.has(c) : f; on ? s.add(c) : s.delete(c); return on; }
  };
}
function mkEl(id) {
  return {
    id, _html: '', textContent: '', value: '', dataset: {}, style: {},
    classList: mkClassList(),
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    onclick: null, oninput: null, onchange: null,
    addEventListener() {}, appendChild() {}, setAttribute() {},
    querySelectorAll() { return []; }
  };
}
const els = {};
function getEl(sel) {
  const id = sel.replace(/^#/, '').replace(/[^a-zA-Z0-9_-].*$/, '');
  if (!els[id]) els[id] = mkEl(id);
  return els[id];
}
global.window = global;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
global.navigator = { clipboard: { writeText: () => Promise.resolve() }, geolocation: null };
global.Notification = undefined;
global.document = {
  readyState: 'complete',
  querySelector: getEl,
  querySelectorAll: () => [],
  createElement: t => mkEl('created-' + t),
  body: { appendChild() {}, style: {}, classList: mkClassList() },
  documentElement: { style: {} },
  addEventListener() {}
};
global.scrollTo = () => {};
global.setInterval = () => 0;
global.clearTimeout = clearTimeout; global.setTimeout = setTimeout;

// ---------- load app scripts ----------
for (const f of ['data.js', 'converter.js', 'engine.js', 'validate.js', 'app.js']) {
  const src = fs.readFileSync(path.join(APP, f), 'utf-8');
  (0, eval)(src);
}

// ---------- exercise ----------
const GW = global.__GW;
if (!GW) throw new Error('app.js did not boot (no __GW handle)');
console.log('boot OK. today sel =', GW.state.sel);

// परत 1: सेल्फ-चेक validator
const vrep = global.GWValidate.run();
if (!vrep.ok) { console.error(vrep.errors); throw new Error('सेल्फ-चेक विफल: ' + vrep.failed); }
console.log('self-check OK; checks =', vrep.checks, '| warnings =', vrep.warnings.length);

GW.renderCalendar();
console.log('renderCalendar OK; cal-ym =', getEl('cal-ym').textContent, '| grid len =', getEl('cal-grid').innerHTML.length);

GW.state.year = 2026;
GW.renderFestivals();
console.log('renderFestivals OK; list len =', getEl('fest-list').innerHTML.length);

GW.state.sel = '2026-09-11';
GW.renderPanchang();
console.log('renderPanchang OK; tithi =', getEl('panch-tithi').textContent, '| gondi =', getEl('panch-gondi-tithi').innerHTML);

GW.renderMap();
console.log('renderMap OK; svg len =', getEl('map-wrap').innerHTML.length, '| pins =', (getEl('map-wrap').innerHTML.match(/class="pin"/g) || []).length);

GW.renderLearn();
console.log('renderLearn OK; vowels len =', getEl('ch-vowels').innerHTML.length, '| conv =', getEl('conv-out').textContent);

GW.renderHeroes();
const heroCards = (getEl('hero-grid').innerHTML.match(/class="hero-card"/g) || []).length;
if (heroCards !== global.GW_HEROES.persons.length) throw new Error('hero grid mismatch: ' + heroCards);
console.log('renderHeroes OK; cards =', heroCards, '| hero-of-day =', getEl('hero-of-day').innerHTML.slice(0, 60), '| count-txt =', getEl('hero-count').textContent);

GW.openHero(global.GW_HEROES.persons[0]);
if (!getEl('sheet-body').innerHTML.includes('स्रोत')) throw new Error('hero sheet missing sources');
console.log('openHero OK; sheet len =', getEl('sheet-body').innerHTML.length);

GW.renderPlaces();
const placeCards = (getEl('place-grid').innerHTML.match(/class="hero-card"/g) || []).length;
if (placeCards !== global.GW_PLACES.places.length) throw new Error('place grid mismatch: ' + placeCards);
console.log('renderPlaces OK; cards =', placeCards, '| count-txt =', getEl('place-count').textContent);

GW.openPlace(global.GW_PLACES.places[0]);
if (!getEl('sheet-body').innerHTML.includes('google.com/maps')) throw new Error('place sheet missing maps link');
console.log('openPlace OK; sheet len =', getEl('sheet-body').innerHTML.length);

// v2.0 blueprint screens
GW.renderHome();
if (!getEl('home-today').innerHTML.includes('ht-date')) throw new Error('home today card fail');
if (!getEl('home-panch').innerHTML.includes('सूर्योदय')) throw new Error('home panchang fail');
if (!getEl('home-quick').innerHTML.includes('data-tab')) throw new Error('home quick actions fail');
console.log('renderHome OK; fest-card len =', getEl('home-fest').innerHTML.length, '| knowledge len =', getEl('home-knowledge').innerHTML.length, '| hero len =', getEl('home-hero').innerHTML.length);

GW.renderLipi();
if (getEl('ch-vowels').innerHTML.length < 100) throw new Error('lipi vowels fail');
console.log('renderLipi OK; digits len =', getEl('ch-digits').innerHTML.length);

GW.state.year = 2026; GW.state.view = 'year';
GW.drawYearView();
const yvMonths = (getEl('cal-yearview').innerHTML.match(/class="yv-month"/g) || []).length;
if (yvMonths !== 12) throw new Error('year view months: ' + yvMonths);
console.log('drawYearView OK; months =', yvMonths);
GW.state.view = 'month';

GW.renderSettings();
if (!getEl('set-about').innerHTML.includes('v2.0')) throw new Error('settings about fail');
console.log('renderSettings OK; theme btns =', (getEl('set-theme').innerHTML.match(/class="chip/g) || []).length, '| notify =', JSON.stringify(GW.prefs.notifyFest) + '/' + JSON.stringify(GW.prefs.notifyMoon));

GW.renderMore();
GW.renderRegions();
console.log('renderRegions OK; sel len =', getEl('rgn-sel').innerHTML.length, '| body len =', getEl('rgn-body').innerHTML.length);
GW.renderStories();
console.log('renderStories OK; list len =', getEl('story-list').innerHTML.length, '| form len =', getEl('story-form').innerHTML.length);
const moreBtns = (getEl('more-grid').innerHTML.match(/class="more-btn"/g) || []).length;
if (moreBtns < 10) throw new Error('more grid: ' + moreBtns);
console.log('renderMore OK; buttons =', moreBtns);

GW.openSearch();
console.log('openSearch OK; sheet len =', getEl('sheet-body').innerHTML.length);

GW.openDay('2026-11-09');
console.log('openDay(Diwali) OK; sheet len =', getEl('sheet-body').innerHTML.length);

GW.openPin('kachargarh');
console.log('openPin OK; sheet len =', getEl('sheet-body').innerHTML.length);

// day across all 2026 (engine stress through UI path)
for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) GW.diOf(`2026-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
console.log('diOf stress OK');
console.log('ALL SMOKE TESTS PASSED');
