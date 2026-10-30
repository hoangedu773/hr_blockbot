import fs from 'node:fs';
import zlib from 'node:zlib';

const D = 'C:/work-space/hr-blockbot/apps/web/' + 'dist/assets';
const files = fs.readdirSync(D).filter((x) => x.endsWith('.css'));
for (const f of files) {
  const css = fs.readFileSync(D + '/' + f, 'utf8');
  const gz = zlib.gzipSync(css).length;
  const bang = (css.match(/!important/g) || []).length;
  console.log(`${f}: ${(css.length / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(2)} KB gzip, !important=${bang}`);
}

// Attribute the !important count: folio-layout.css is the imported legacy sheet.
const layout = fs.readFileSync('C:/work-space/hr-blockbot/apps/web/public/assets/folio/folio-layout.css', 'utf8');
console.log('\nfolio-layout.css !important (imported verbatim):', (layout.match(/!important/g) || []).length);
