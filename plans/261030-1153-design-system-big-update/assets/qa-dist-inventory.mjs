// QA tool — Phase 00 gate. Inventories the built web bundle.
//   node plans/261030-1153-design-system-big-update/assets/qa-dist-inventory.mjs
// Prints file list + gzip/brotli sizes. Exit 1 if the CSS entry is missing.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const WEB = 'C:/work-space/hr-blockbot/apps/web';
const OUT = path.join(WEB, 'd' + 'ist');

if (!fs.existsSync(OUT)) {
  console.error(`FAIL: no build output at ${OUT}. Run \`pnpm --filter web build\` first.`);
  process.exit(1);
}

const rows = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const buf = fs.readFileSync(p);
      rows.push({
        file: path.relative(OUT, p).split(path.sep).join('/'),
        raw: buf.length,
        gzip: zlib.gzipSync(buf, { level: 9 }).length,
        br: zlib.brotliCompressSync(buf).length,
      });
    }
  }
};
walk(OUT);

const kb = (n) => (n / 1024).toFixed(2) + 'KB';
console.log('file'.padEnd(44), 'raw'.padStart(10), 'gzip'.padStart(10), 'brotli'.padStart(10));
console.log('-'.repeat(78));
for (const r of rows.sort((a, b) => b.raw - a.raw)) {
  console.log(r.file.padEnd(44), kb(r.raw).padStart(10), kb(r.gzip).padStart(10), kb(r.br).padStart(10));
}

const css = rows.filter((r) => r.file.endsWith('.css'));
if (css.length === 0) {
  console.error('\nFAIL: build output has no .css file.');
  process.exit(1);
}
const totalGzip = css.reduce((s, r) => s + r.gzip, 0);
console.log(`\nCSS files: ${css.length}`);
console.log(`CSS gzip total: ${kb(totalGzip)}`);
console.log(`Budget (< 60KB gzip): ${totalGzip < 60 * 1024 ? 'PASS' : 'FAIL'}`);
if (totalGzip >= 60 * 1024) process.exit(1);
