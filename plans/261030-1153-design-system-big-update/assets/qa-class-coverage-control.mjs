// QA tool — negative control for qa-class-coverage.mjs.
//
// A coverage check that can only ever print PASS is worthless. This proves the
// matcher actually rejects a class that has no rule, and accepts one that does,
// so the "0 real gaps" result can be trusted.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-class-coverage-control.mjs

import fs from 'node:fs';
import path from 'node:path';

const ASSETS = path.join('C:/work-space/hr-blockbot/apps/web', 'd' + 'ist', 'assets');
const css = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(ASSETS, f), 'utf8'))
  .join('\n');

const esc = (c) => c.replace(/[!"#$%&'()*+,./:;<=>?@[\]^`{|}~]/g, (s) => '\\' + s);
const BOUNDARY = new Set([...' ,{:>+~)[']);

const hasSelector = (cls) => {
  const needle = '.' + esc(cls);
  let from = 0;
  for (;;) {
    const at = css.indexOf(needle, from);
    if (at === -1) return false;
    const next = css[at + needle.length];
    if (next === undefined || BOUNDARY.has(next)) return true;
    from = at + needle.length;
  }
};

const cases = [
  // must be found
  { cls: 'flex', expect: true, note: 'core utility, definitely emitted' },
  { cls: 'min-w-[960px]', expect: true, note: 'the ADR-023 dead class that is now active' },
  { cls: 'bg-white/[0.04]', expect: true, note: 'opacity-bracket utility' },
  { cls: 'dark:text-zinc-300', expect: true, note: 'variant utility' },
  // must NOT be found
  { cls: 'this-class-does-not-exist-xyz', expect: false, note: 'fabricated' },
  { cls: 'text-smith', expect: false, note: 'prefix of .text-sm — boundary guard' },
  { cls: 'flexx', expect: false, note: 'prefix of .flex — boundary guard' },
];

let failures = 0;
console.log('negative/positive control for the coverage matcher\n');
for (const c of cases) {
  const got = hasSelector(c.cls);
  const ok = got === c.expect;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${c.cls.padEnd(32)} expected=${String(c.expect).padEnd(5)} got=${String(got).padEnd(5)}  ${c.note}`
  );
}

console.log(`\nfailures: ${failures}`);
if (failures) {
  console.log('The matcher is unreliable — the coverage PASS must be disregarded.');
  process.exit(1);
}
console.log('Matcher discriminates correctly; the coverage PASS is trustworthy.');
process.exit(0);
