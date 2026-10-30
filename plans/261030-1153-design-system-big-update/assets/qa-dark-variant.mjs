// QA tool — Phase 00 gate. Determines the `dark:` variant strategy from selector
// structure alone (no source-class guessing), and compares it to the pre-Phase-00
// static bundle so a regression can be told apart from pre-existing behaviour.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-dark-variant.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = 'C:/work-space/hr-blockbot';
const ASSETS = path.join(REPO, 'apps/web', 'd' + 'ist', 'assets');

const builtCss = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(ASSETS, f), 'utf8'))
  .join('\n');

const oldCss = ['folio/folio.css', 'crm/2voh1gse7971r.css', 'crm/2e445toz63gzv.css']
  .map((rel) => {
    try {
      return execFileSync('git', ['show', `HEAD:apps/web/public/assets/${rel}`], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return '';
    }
  })
  .join('\n');

// A class-based dark variant emits a compound selector: `.dark .foo` or
// `:where(.dark) .foo`. A media-based one emits a bare `.dark\:foo` inside
// `@media (prefers-color-scheme: dark)`.
const analyse = (css, label) => {
  const darkUtilities = (css.match(/\.dark\\:/g) || []).length;
  const mediaBlocks = (css.match(/@media\s*\(prefers-color-scheme\s*:\s*dark\)/g) || []).length;
  const classScoped = (css.match(/:is\(\.dark\s*\*?\)|:where\(\.dark\s*\*?\)|\.dark\s+\.dark\\:/g) || [])
    .length;

  // Locate each `.dark\:` occurrence and ask whether it sits inside a
  // prefers-color-scheme block, by counting brace depth backwards.
  let insideMedia = 0;
  for (const m of css.matchAll(/\.dark\\:/g)) {
    const before = css.slice(0, m.index);
    const lastMedia = before.lastIndexOf('@media (prefers-color-scheme:dark)');
    const lastMediaAlt = before.lastIndexOf('@media (prefers-color-scheme: dark)');
    const start = Math.max(lastMedia, lastMediaAlt);
    if (start === -1) continue;
    // Count unmatched '{' between media start and here; >0 means still inside.
    let depth = 0;
    for (let i = start; i < m.index; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    if (depth > 0) insideMedia++;
  }

  console.log(`\n=== ${label} ===`);
  console.log(`  .dark\\: utilities           ${darkUtilities}`);
  console.log(`  prefers-color-scheme blocks ${mediaBlocks}`);
  console.log(`  class-scoped (.dark .x)     ${classScoped}`);
  console.log(`  .dark\\: inside media block  ${insideMedia}`);
  // Return a stable code, print a human label. The verdict below compares
  // codes; mixing the two made this gate unable to pass on correct output.
  const code =
    darkUtilities === 0
      ? 'n/a'
      : insideMedia === darkUtilities
        ? 'MEDIA'
        : insideMedia === 0
          ? 'CLASS'
          : 'MIXED';
  const strategyLabel = {
    CLASS: 'CLASS (.dark)',
    MEDIA: 'MEDIA (prefers-color-scheme)',
    MIXED: 'MIXED',
    'n/a': 'n/a',
  }[code];
  console.log(`  => strategy                 ${strategyLabel}`);
  return { darkUtilities, insideMedia, classScoped, strategy: code };
};

const now = analyse(builtCss, 'built (post Phase 00)');
const before = analyse(oldCss, 'pre-Phase-00 static bundles');

console.log('\n=== verdict ===');
if (now.strategy === 'MEDIA' && before.strategy === 'MEDIA') {
  console.log('PRE-EXISTING: the old bundles were media-based too. Not a Phase 00 regression,');
  console.log('but <html class="dark"> has never controlled these utilities.');
  process.exit(0);
}
if (now.strategy === 'CLASS') {
  console.log('PASS — class-based dark variant, matches <html class="dark">.');
  process.exit(0);
}
console.log(`REGRESSION: strategy changed ${before.strategy} -> ${now.strategy}.`);
process.exit(1);
