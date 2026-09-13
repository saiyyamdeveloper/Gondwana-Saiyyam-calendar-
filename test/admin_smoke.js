/* admin-smoke: admin.js को node में स्टब-DOM/fetch के साथ चलाकर लोड-क्रैश पकड़ता है
   (यही बग लाइव ब्राउज़र में 'evi is not defined' बनकर छूटा था — अब CI रोकेगा) */
const fs = require('fs'), path = require('path');
const APP = path.join(__dirname, '..');

function el() {
  const e = {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, style: {}, children: [],
    addEventListener() {}, appendChild() {}, remove() {}, click() {},
    querySelector: () => el(), querySelectorAll: () => [],
    value: '', innerHTML: '', textContent: '', onclick: null, onchange: null, oninput: null
  };
  return e;
}
const FILES = {
  'admin-credentials.json': { algorithm: 'SHA-256+salt', salt: 'x'.repeat(32), accounts: [{ role: 'superadmin', email: 'a@b.c', hash: '0'.repeat(64), expires: '2099-01-01' }], rotation: {} },
  'review/pending.json': { meta: {}, queue: [{ id: 'person:x', kind: 'person', subtype: 'shahid', title: 'X', payload: { id: 'x', sources: ['https://e.example'] }, status: 'pending', added: '2026-01-01' }] },
  'review/decisions.json': { meta: {}, decisions: [] },
  'media/manifest.json': { meta: {}, items: [{ id: 'm1', type: 'image', title: 'T', status: 'candidate', license: 'own', added: '2026-01-01' }] },
  'review/evidence/index.json': { 'person:x': { score: 91, verdict: 'pass', checked_at: '2026-01-01T00:00:00Z', summary_hi: 'सारांश', n_sources: 3 } },
  'review/reports.json': { meta: {}, reports: [{ id: 'rpt-1', status: 'new', kind: 'person', item_title: 'X', ts: '2026-09-13T00:00:00Z', reporter: { email: 'a@b.c', verified: true, name: 'A' }, fields: [{ field: 'birth_date', current: '1900', proposed: '1901-01-01' }], new_entry: null, wrong_note: '', evidence: ['https://e.example'], admin_note: '', decided_by: null, decided_at: null }] },
  'review/region_crawl.json': { meta: {}, jobs: [{ unit: 'district:cg/bastar', task: 'mine', status: 'done' }] },
  'report_config.json': { google_client_id: '', report_endpoint: '' }
};
global.window = global;
global.document = {
  readyState: 'complete',
  querySelector: () => el(),
  querySelectorAll: () => [],
  addEventListener() {}, createElement: () => el(), body: el(), documentElement: el()
};
global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.fetch = (url) => {
  const u = String(url).replace(/^\.\//, '');
  const parts = u.split('/');
  const cands = [u, parts.slice(-2).join('/'), parts.slice(-1)[0]];
  const hit = cands.map(c => FILES[c]).find(v => v !== undefined);
  return Promise.resolve({ ok: hit !== undefined, json: () => Promise.resolve(hit !== undefined ? JSON.parse(JSON.stringify(hit)) : {}) });
};
global.crypto = require('crypto').webcrypto;
global.TextEncoder = TextEncoder;
global.location = { origin: 'https://x.test', pathname: '/admin.html', reload() {} };
global.navigator = {};

let fails = 0;
function check(cond, msg) { if (cond) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } }

try {
  require(path.join(APP, 'data.js'));
  require(path.join(APP, 'admin.js'));
  check(true, 'admin.js लोड हुआ (कोई ReferenceError नहीं)');
} catch (e) {
  check(false, 'admin.js लोड: ' + e.message);
  process.exit(1);
}
setTimeout(() => {
  const A = global.window.__ADMIN;
  check(!!A, '__ADMIN export मौजूद');
  check(A.QUEUE().length === 1, 'कतार लोड हुई (1 प्रविष्टि)');
  check(A.MEDIA().length === 1, 'manifest लोड हुआ (1 प्रविष्टि)');
  check(Object.keys(A.EVID()).length === 1 && A.EVID()['person:x'].score === 91, 'evidence index लोड हुआ (स्कोर 91)');
  const { files } = A.outputFiles();
  check(!!files['data.js'] && !!files['review/pending.json'], 'प्रकाशन-फ़ाइलें बनती हैं');
  console.log(fails ? `ADMIN SMOKE FAILED (${fails})` : 'ADMIN SMOKE PASSED');
  process.exit(fails ? 1 : 0);
}, 300);
