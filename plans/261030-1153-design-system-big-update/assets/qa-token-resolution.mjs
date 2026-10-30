// QA tool — Phase 00 gate. Enumerates every custom property the built sheet
// declares on <html> and reports those that resolve to nothing (guaranteed
// invalid), for both registers. Catches reference cycles and dangling aliases
// that a hand-picked token list would miss.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-token-resolution.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = 'C:/work-space/hr-blockbot/apps/web';
const ASSETS = path.join(WEB, 'd' + 'ist', 'assets');

const css = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(ASSETS, f), 'utf8'))
  .join('\n');

const browser = await chromium.launch();
const results = {};

for (const register of ['product', 'brand']) {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.addStyleTag({ content: css });
  results[register] = await page.evaluate((r) => {
    document.documentElement.dataset.register = r;
    const cs = getComputedStyle(document.documentElement);
    const declared = [];
    for (let i = 0; i < cs.length; i++) {
      const name = cs[i];
      if (name.startsWith('--')) declared.push(name);
    }
    const empty = [];
    const values = {};
    for (const name of declared) {
      const v = cs.getPropertyValue(name).trim();
      values[name] = v;
      if (v === '') empty.push(name);
    }
    return { declared: declared.length, empty, values };
  }, register);
  await page.close();
}
await browser.close();

let failed = 0;
for (const register of ['product', 'brand']) {
  const r = results[register];
  console.log(`\n=== register=${register} — ${r.declared} custom properties declared ===`);
  if (!r.empty.length) {
    console.log('  all resolve to a value');
  } else {
    console.log(`  UNRESOLVED (${r.empty.length}):`);
    for (const name of r.empty) console.log(`    ${name}`);
    failed += r.empty.length;
  }
}

const p = results.product.values;
const b = results.brand.values;
console.log('\n=== register switch sanity ===');
for (const t of ['--surface-canvas', '--text-primary', '--border-subtle', '--radius-container']) {
  const distinct = p[t] !== b[t];
  console.log(`  ${t.padEnd(22)} product=${(p[t] || '∅').padEnd(22)} brand=${(b[t] || '∅').padEnd(22)} ${distinct ? 'DISTINCT' : 'SAME'}`);
}

console.log(`\nUnresolved token count: ${failed}`);
process.exit(failed ? 1 : 0);
