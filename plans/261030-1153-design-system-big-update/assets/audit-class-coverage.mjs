import fs from 'node:fs';

const css = fs.readFileSync('C:/work-space/hr-blockbot/apps/web/public/assets/crm/2voh1gse7971r.css', 'utf8')
  + fs.readFileSync('C:/work-space/hr-blockbot/apps/web/public/assets/crm/2e445toz63gzv.css', 'utf8')
  + fs.readFileSync('C:/work-space/hr-blockbot/apps/web/public/assets/folio/folio.css', 'utf8');

const src = fs.readFileSync('C:/work-space/hr-blockbot/apps/web/src/components/CrmDashboardView.tsx', 'utf8');
const html = src.slice(src.indexOf('const CRM_HTML'), src.indexOf('`;', src.indexOf('const CRM_HTML')));

const classes = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
}

const esc = (c) => c.replace(/[.*+?^${}()|[\]\\/:%#(),[\]]/g, (s) => '\\' + s);
const missing = [];
for (const c of classes) {
  const sel = '.' + esc(c);
  if (!css.includes(sel + '{') && !css.includes(sel + ',') && !css.includes(sel + ':') && !css.includes(sel + ' ') && !css.includes(sel + '>')) {
    missing.push(c);
  }
}
console.log('total classes:', classes.size);
console.log('missing in css bundles:', missing.length);
console.log(missing.sort().join('\n'));
