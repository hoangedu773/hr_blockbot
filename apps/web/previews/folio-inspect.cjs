const fs = require('node:fs');
const source = fs.readFileSync('apps/web/src/components/FolioLandingView.tsx', 'utf8');
const html = JSON.parse(source.match(/const FOLIO_HTML = (".*");/)[1]);
fs.writeFileSync('apps/web/previews/folio-current.html', html.replace(/></g, '>\n<'));
console.log('Extracted existing markup for inspection.');
 console.log(fs.readFileSync('apps/web/public/assets/folio/folio.css','utf8').slice(-5000));
 console.log(fs.readFileSync('apps/web/public/assets/folio/folio.css','utf8').match(/@font-face[^}]+}/g)?.join('\n'));
 console.log(fs.readFileSync('apps/web/src/index.css','utf8').slice(-5500));
 console.log('playwright',require.resolve('playwright'));
