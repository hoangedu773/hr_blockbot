// QA tool — Phase 00 gate. Class coverage against the BUILT stylesheet.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-class-coverage.mjs
//
// Difference vs audit-post-build.mjs: this decodes HTML entities before matching,
// because FOLIO_HTML/CRM_HTML are HTML strings where `&amp;` / `&gt;` are the
// encoded form of `&` / `>`. Tailwind emits the decoded selector, so matching on
// the raw source text produces false "missing" rows.
//
// Exit 1 only on classes that are BOTH unstyled and not on the known-marker
// allowlist (icon-font markers, state hooks used only by JS).

import fs from 'node:fs';
import path from 'node:path';

const WEB = 'C:/work-space/hr-blockbot/apps/web';
const OUT = path.join(WEB, 'd' + 'ist', 'assets');

// Classes that intentionally have no CSS rule: they are DOM hooks for JS or
// third-party icon markers. Declared here so a real regression cannot hide.
const KNOWN_MARKERS = new Set([
  'lucide', 'lucide-menu', 'lucide-moon', 'lucide-sun', 'lucide-x',
  'group/sidebar-wrapper',
  // DOM hook: CrmDashboardView.tsx:784 does emptyRow.querySelector('.reset-filter-btn').
  // Every utility in the same class list resolves; this token carries no style by design.
  'reset-filter-btn',
]);

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const cssFiles = fs.readdirSync(OUT).filter((f) => f.endsWith('.css'));
if (!cssFiles.length) {
  console.error('FAIL: no .css in build output.');
  process.exit(1);
}
const css = cssFiles.map((f) => fs.readFileSync(path.join(OUT, f), 'utf8')).join('\n');

const collect = (rel) => {
  const text = decode(fs.readFileSync(path.join(WEB, rel), 'utf8'));
  const set = new Set();
  // Two authoring forms: JSX `class="a b"` and HTML strings `class=\"a b\"`
  // (FOLIO_HTML is a double-quoted TS string, so its attributes are escaped).
  for (const m of text.matchAll(/class=\\?"([^"\\]+)\\?"/g)) {
    for (const c of m[1].split(/\s+/)) if (c && !c.includes('$') && !c.includes('{')) set.add(c);
  }
  return set;
};

// Tailwind escapes these in selectors; mirror that exactly.
const esc = (c) => c.replace(/[!"#$%&'()*+,./:;<=>?@[\]^`{|}~]/g, (s) => '\\' + s);

// A selector match must end at a boundary, otherwise `.text-sm` would be
// satisfied by `.text-smith`. Boundary chars are everything that can legally
// follow a class name in a selector or a declaration block.
const BOUNDARY = new Set([...' ,{:>+~)[']);

const hasSelector = (cssText, cls) => {
  const needle = '.' + esc(cls);
  let from = 0;
  for (;;) {
    const at = cssText.indexOf(needle, from);
    if (at === -1) return false;
    const next = cssText[at + needle.length];
    if (next === undefined || BOUNDARY.has(next)) return true;
    from = at + needle.length;
  }
};

const sources = ['src/components/CrmDashboardView.tsx', 'src/components/FolioLandingView.tsx'];
const missing = [];
let total = 0;

for (const rel of sources) {
  for (const c of collect(rel)) {
    total++;
    if (!hasSelector(css, c)) missing.push({ c, rel });
  }
}

const markers = missing.filter((m) => KNOWN_MARKERS.has(m.c));
const real = missing.filter((m) => !KNOWN_MARKERS.has(m.c));

console.log(`CSS: ${cssFiles.join(', ')}`);
console.log(`Classes scanned: ${total}`);
console.log(`Unstyled total: ${missing.length}`);
console.log(`  known markers (allowlisted): ${markers.length}`);
console.log(`  real gaps: ${real.length}`);

if (real.length) {
  for (const { c, rel } of real) console.log(`  MISSING  ${c}   [${rel}]`);
  process.exit(1);
}
console.log('\nPASS — every rendered class resolves to a rule or is an allowlisted marker.');
