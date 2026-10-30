// QA tool — độc lập với dev. Đọc CSS ĐÃ BUILD, không đọc bundle tĩnh cũ.
// Dùng cho Gate 1 của Phase 00 và Phase 05.
//
//   node plans/261030-1153-design-system-big-update/assets/audit-post-build.mjs
//
// Exit code 1 nếu còn class không có định nghĩa.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/work-space/hr-blockbot/apps/web';
const DIST_ASSETS = path.join(ROOT, 'dist/assets');

if (!fs.existsSync(DIST_ASSETS)) {
  console.error('FAIL: chưa có dist/assets. Chạy `pnpm --filter web build` trước.');
  process.exit(1);
}

const cssFiles = fs.readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.css'));
if (cssFiles.length === 0) {
  console.error('FAIL: dist/assets không có file .css nào.');
  process.exit(1);
}

const css = cssFiles.map((f) => fs.readFileSync(path.join(DIST_ASSETS, f), 'utf8')).join('\n');

const sources = [
  'src/components/CrmDashboardView.tsx',
  'src/components/FolioLandingView.tsx',
].map((rel) => ({ rel, text: fs.readFileSync(path.join(ROOT, rel), 'utf8') }));

const classes = new Map(); // class -> first source file seen

for (const { rel, text } of sources) {
  for (const m of text.matchAll(/class=\\?"([^"\\]+)\\?"/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (c && !c.includes('$') && !classes.has(c)) classes.set(c, rel);
    }
  }
}

// Escape ký tự đặc biệt của Tailwind (/, [, ], ., :, %, #, (, ), ,, !)
const esc = (c) => c.replace(/[.*+?^${}()|[\]\\/:%#,!]/g, (s) => '\\' + s);

const missing = [];
for (const [c, src] of classes) {
  const sel = '.' + esc(c);
  const hit =
    css.includes(sel + '{') ||
    css.includes(sel + ',') ||
    css.includes(sel + ':') ||
    css.includes(sel + ' ') ||
    css.includes(sel + '>') ||
    css.includes(sel + '[') ||
    css.includes(sel + '.') ||
    css.includes(sel + '~') ||
    css.includes(sel + '+');
  if (!hit) missing.push({ c, src });
}

console.log(`CSS bundles: ${cssFiles.join(', ')}`);
console.log(`Total classes in HTML strings: ${classes.size}`);
console.log(`Missing definitions: ${missing.length}`);

if (missing.length) {
  const bySrc = {};
  for (const { c, src } of missing) (bySrc[src] ??= []).push(c);
  for (const [src, list] of Object.entries(bySrc)) {
    console.log(`\n  ${src} (${list.length}):`);
    console.log('    ' + list.sort().join('\n    '));
  }
  process.exit(1);
}

console.log('\nOK — mọi class trong HTML string đều có định nghĩa CSS.');
