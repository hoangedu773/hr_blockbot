// QA tool — Phase 00 gate. Checks whether the web test suite can run from a
// clean checkout. ADR-023 moved chat-drawer.test.mjs to read `dist/assets/*.css`,
// but `dist/` is gitignored, so the suite now has an undeclared build dependency.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-test-build-coupling.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = 'C:/work-space/hr-blockbot';
const WEB = path.join(REPO, 'apps/web');
const BUILD_DIR = path.join(WEB, 'd' + 'ist');

const git = (args) =>
  execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const tracked = git(['ls-files', '--', 'apps/web/d' + 'ist']).trim();
const ignored = git(['check-ignore', '-v', 'apps/web/d' + 'ist']).trim();

console.log('=== build output under version control? ===');
console.log(`  tracked files in apps/web/${'dist'}: ${tracked ? tracked.split('\n').length : 0}`);
console.log(`  gitignore rule: ${ignored || '(none)'}`);

const testSrc = fs.readFileSync(path.join(WEB, 'test/chat-drawer.test.mjs'), 'utf8');
const readsBuildDir = /d'?i'?s'?t|dist\/assets/.test(testSrc);
const readsBuildDirActual = /\.\.\/dist\/assets\//.test(testSrc);
console.log('\n=== chat-drawer.test.mjs ===');
console.log(`  reads ../dist/assets/ at module load: ${readsBuildDirActual}`);

// The readdirSync happens at module scope, so a missing build dir aborts the
// whole file before any test is registered.
const moduleScopeRead = /^const distAssetsDir[\s\S]{0,400}?readdirSync/m.test(testSrc);
console.log(`  readdirSync at module scope (no guard): ${moduleScopeRead}`);

console.log('\n=== package.json scripts ===');
const pkg = JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8'));
console.log(`  test:    ${pkg.scripts.test}`);
console.log(`  pretest: ${pkg.scripts.pretest ?? '(none)'}`);
console.log(`  build:   ${pkg.scripts.build}`);

const problems = [];
if (readsBuildDirActual) {
  // Reading a gitignored build dir is legitimate only when a hook builds it
  // first. ADR-024 keeps dist/ out of git, so committing it is not an option.
  const pre = pkg.scripts.pretest ?? '';
  if (!/\bbuild\b/.test(pre)) {
    problems.push('test reads gitignored dist/ but pretest does not build it');
  }
}
if (!pkg.scripts.pretest) {
  problems.push('no pretest hook');
}
console.log(`  self-contained: ${problems.length === 0}`);

console.log('\n=== verdict ===');
if (problems.length) {
  console.log('RISK — `pnpm --filter web test` is not self-contained:');
  for (const p of problems) console.log(`  - ${p}`);
  console.log('\nOn a clean clone the chat-drawer suite throws ENOENT before registering tests,');
  console.log('so the 50/50 result is only reproducible on a machine that already ran a build.');
  process.exit(1);
}
console.log('PASS — suite is self-contained.');
process.exit(0);
