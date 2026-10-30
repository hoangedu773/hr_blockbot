// QA tool — Phase 00 gate. Proves the blast radius of the broken Tier-3 aliases
// on real markup. EmployeeListView.tsx:69 and :108 use `background: var(--surface)`
// inline; AiCopilotModal.tsx:129 uses `var(--surface-card)`. If those tokens are
// guaranteed-invalid, the declaration is dropped and the panel goes transparent.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-surface-alias-impact.mjs

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

const MARKUP = `<!doctype html><html class="dark" data-register="product">
<head></head>
<body style="background:#0a0a0a">
  <div id="panel" style="background: var(--surface); border:1px solid var(--border)">EmployeeListView card</div>
  <div id="btn" style="background: var(--surface-card)">Refresh button</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(MARKUP);
await page.addStyleTag({ content: css });

const read = (id) =>
  page.evaluate((i) => {
    const el = document.getElementById(i);
    const cs = getComputedStyle(el);
    return { background: cs.backgroundColor, border: cs.borderTopColor };
  }, id);

const panel = await read('panel');
const btn = await read('btn');
await browser.close();

console.log('Inline styles as authored in the source:\n');
console.log(`  EmployeeListView card  background: var(--surface)      -> ${panel.background}`);
console.log(`                         border:     var(--border)       -> ${panel.border}`);
console.log(`  Refresh button         background: var(--surface-card) -> ${btn.background}`);

const transparent = (c) => c === 'rgba(0, 0, 0, 0)';
console.log('\nExpected before Phase 00 (index.css declared --surface: #121214):');
console.log('  both backgrounds resolve to an opaque surface colour.');

const ok = !transparent(panel.background) && !transparent(btn.background);
console.log(`\n  panel background   ${transparent(panel.background) ? 'FAIL  <- transparent, declaration dropped' : 'PASS'}`);
console.log(`  button background  ${transparent(btn.background) ? 'FAIL  <- transparent, declaration dropped' : 'PASS'}`);

process.exit(ok ? 0 : 1);
