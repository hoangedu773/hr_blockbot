// QA tool — Phase 00 gate. Reports which source files contain a given class
// token, so emitted-but-unused utilities can be traced to their origin.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-find-class-origin.mjs bg-card ring-card

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/work-space/hr-blockbot/apps/web';
const SKIP = new Set(['node_modules', '.' + 'git']);
const tokens = process.argv.slice(2);
if (!tokens.length) {
  console.error('usage: qa-find-class-origin.mjs <token> [token...]');
  process.exit(2);
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const files = walk(ROOT).filter((f) => /\.(tsx|ts|html|css|js|mjs|md)$/.test(f));

for (const token of tokens) {
  const hits = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(token)) {
      const count = text.split(token).length - 1;
      hits.push({ f: path.relative(ROOT, f), count });
    }
  }
  console.log(`\n${token}: ${hits.length} file(s)`);
  for (const h of hits.sort((a, b) => b.count - a.count)) {
    console.log(`  ${String(h.count).padStart(4)}  ${h.f}`);
  }
}
