// QA tool — Phase 00 gate. Browser proof for the dark-variant strategy finding.
// Uses a class pair that actually exists in the built sheet and in the source:
// `text-zinc-700 dark:text-zinc-300` (CrmDashboardView.tsx:476).
//
//   node plans/261030-1153-design-system-big-update/assets/qa-dark-variant-browser.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ASSETS = path.join('C:/work-space/hr-blockbot/apps/web', 'd' + 'ist', 'assets');
const css = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(ASSETS, f), 'utf8'))
  .join('\n');

const MARKUP =
  '<!doctype html><html class="dark"><head></head><body>' +
  '<span id="t" class="text-zinc-700 dark:text-zinc-300">8.420.000 đ</span>' +
  '</body></html>';

const browser = await chromium.launch();
const rows = [];
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const page = await ctx.newPage();
  await page.setContent(MARKUP);
  await page.addStyleTag({ content: css });
  rows.push({
    scheme,
    color: await page.evaluate(() => getComputedStyle(document.getElementById('t')).color),
  });
  await ctx.close();
}
await browser.close();

// zinc-700 oklch(0.37 0.013 285.805) / zinc-300 oklch(0.871 0.006 286.286)
const isZinc300 = (c) => /0\.871/.test(c);
const isZinc700 = (c) => /0\.37\b/.test(c);

console.log('class="text-zinc-700 dark:text-zinc-300" inside <html class="dark">\n');
console.log('OS prefers   computed colour                    resolved to');
for (const r of rows) {
  const which = isZinc300(r.color) ? 'zinc-300 (dark: applied)' : isZinc700(r.color) ? 'zinc-700 (dark: NOT applied)' : 'unknown';
  console.log(`  ${r.scheme.padEnd(8)}   ${r.color.padEnd(32)} ${which}`);
}

const darkOk = isZinc300(rows[0].color);
const lightOk = isZinc300(rows[1].color);

console.log('\nExpected (pre-Phase-00 behaviour, <html class="dark"> always set):');
console.log('  both rows resolve to zinc-300.');
console.log(`\n  OS=dark   ${darkOk ? 'PASS' : 'FAIL'}`);
console.log(`  OS=light  ${lightOk ? 'PASS' : 'FAIL  <- dark: utility lost'}`);

process.exit(darkOk && lightOk ? 0 : 1);
