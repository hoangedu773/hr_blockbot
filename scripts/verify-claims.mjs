#!/usr/bin/env node
/**
 * verify-claims.mjs — kiểm chứng cơ học một claim set audit.
 *
 * Không gọi LLM. Không tin văn xuôi. Chỉ đối chiếu: file có tồn tại? dòng khai báo
 * có chứa anchor đặc trưng không?
 *
 * Dùng được bởi bất kỳ agent nào (WorkBuddy, OMP, CI) => đây là nền của cross-check.
 *
 * Usage:
 *   node scripts/verify-claims.mjs [spec.json] [--json] [--only=P0|P1|P2]
 *
 * Exit code: 0 = mọi claim VERIFIED, 1 = có FAIL, 2 = spec lỗi.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WINDOW = 3;

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].toUpperCase() : null;
const specPath =
  argv.find((a) => !a.startsWith('--')) ||
  resolve(ROOT, 'plans/reports/audit-261027/claims.json');

let spec;
try {
  spec = JSON.parse(readFileSync(specPath, 'utf8'));
} catch (err) {
  console.error(`[verify-claims] không đọc được spec: ${specPath}\n${err.message}`);
  process.exit(2);
}

const results = [];

for (const c of spec.claims) {
  if (only && !String(c.severity).toUpperCase().startsWith(only)) continue;

  let status = 'VERIFIED';
  const details = [];

  for (const f of c.files) {
    const abs = resolve(ROOT, f.file);

    if (!existsSync(abs)) {
      status = 'FAIL';
      details.push({ ...f, result: 'FILE_MISSING', actualLine: null });
      continue;
    }

    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    const idx = f.line - 1;

    let hit = -1;
    for (let i = Math.max(0, idx - WINDOW); i <= Math.min(lines.length - 1, idx + WINDOW); i++) {
      if (lines[i].includes(f.anchor)) {
        hit = i + 1;
        break;
      }
    }

    if (hit === f.line) {
      details.push({ ...f, result: 'OK', actualLine: hit });
      continue;
    }

    if (hit > 0) {
      if (status === 'VERIFIED') status = 'DRIFT';
      details.push({ ...f, result: 'DRIFT', actualLine: hit });
      continue;
    }

    const anywhere = [];
    lines.forEach((l, i) => {
      if (l.includes(f.anchor)) anywhere.push(i + 1);
    });
    if (anywhere.length) {
      const closest = anywhere.reduce((best, cur) =>
        Math.abs(cur - f.line) < Math.abs(best - f.line) ? cur : best
      );
      if (status === 'VERIFIED') status = 'DRIFT';
      details.push({ ...f, result: 'DRIFT', actualLine: closest, occurrences: anywhere });
    } else {
      status = 'FAIL';
      details.push({ ...f, result: 'ANCHOR_NOT_FOUND', actualLine: null, occurrences: [] });
    }
  }

  results.push({ id: c.id, severity: c.severity, kind: c.kind, status, claim: c.claim, details });
}

const tally = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});

const verdict = {
  spec: specPath,
  repo: spec.meta?.repo,
  head: spec.meta?.head,
  checkedAt: new Date().toISOString(),
  window: WINDOW,
  tally,
  results,
};

const outPath = resolve(dirname(specPath), 'verdicts.json');
writeFileSync(outPath, `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');

// --fix: ghi lại số dòng thật vào spec (chỉ sửa con số, không sửa claim/anchor).
// Dùng khi citation lệch dòng nhưng bản chất finding đúng.
if (argv.includes('--fix')) {
  let changed = 0;
  for (const r of results) {
    const c = spec.claims.find((x) => x.id === r.id);
    if (!c) continue;
    r.details.forEach((d, i) => {
      if (d.actualLine && c.files[i] && c.files[i].line !== d.actualLine) {
        c.files[i].line = d.actualLine;
        changed += 1;
      }
    });
  }
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(`[fix] cập nhật ${changed} số dòng trong ${specPath}`);
}

if (asJson) {
  console.log(JSON.stringify(verdict, null, 2));
} else {
  console.log(`\nverify-claims · HEAD ${spec.meta?.head ?? '?'} · window ±${WINDOW}\n`);
  for (const r of results) {
    const mark = r.status === 'VERIFIED' ? 'OK  ' : r.status === 'DRIFT' ? 'DRIFT' : 'FAIL';
    console.log(`${mark.padEnd(6)} ${r.id.padEnd(6)} ${r.severity}  ${r.claim}`);
    for (const d of r.details) {
      if (d.result !== 'OK') {
        console.log(
          `       └─ ${d.result}: ${d.file}:${d.line}` +
            (d.actualLine ? ` (anchor thực tế ở dòng ${d.actualLine})` : '') +
            `  anchor="${d.anchor}"`
        );
      }
    }
  }
  console.log(
    `\nTổng: ${results.length} claim · ` +
      `VERIFIED ${tally.VERIFIED || 0} · DRIFT ${tally.DRIFT || 0} · FAIL ${tally.FAIL || 0}`
  );
  console.log(`Verdicts: ${outPath}\n`);
}

process.exit(tally.FAIL ? 1 : 0);
