/* Node runner for validate.js — CI + local use. Exit 1 on any failure. */
'use strict';
const fs = require('fs'), path = require('path');
const APP = path.join(__dirname, '..');
global.window = global;
global.console = console;
for (const f of ['data.js', 'regions_data.js', 'converter.js', 'engine.js', 'validate.js']) {
  (0, eval)(fs.readFileSync(path.join(APP, f), 'utf-8'));
}
if (!global.GWValidate) { console.error('GWValidate लोड नहीं हुआ'); process.exit(1); }
const rep = global.GWValidate.run();
console.log(`[validate] checks=${rep.checks} passed=${rep.passed} failed=${rep.failed} warnings=${rep.warnings.length}`);
if (rep.errors.length) {
  console.error('ERRORS:');
  rep.errors.forEach(e => console.error(`  ✗ ${e.code}: ${e.msg}`));
}
if (rep.warnings.length) {
  console.warn('WARNINGS:');
  rep.warnings.forEach(w => console.warn(`  ⚠ ${w.code}: ${w.msg}`));
}
process.exit(rep.failed > 0 ? 1 : 0);
