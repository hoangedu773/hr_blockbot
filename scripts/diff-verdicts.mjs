#!/usr/bin/env node
/**
 * diff-verdicts.mjs — so khớp verdict của 2 bên (lớp 1 cơ học vs lớp 2 phán đoán).
 *
 * Usage:
 *   node scripts/diff-verdicts.mjs <verdicts.json> <omp-verdicts.json> [--out=diff.md]
 *
 * verdicts.json  : output của verify-claims.mjs  (results[].{id,severity,status})
 * omp-verdicts   : JSON array [{id, verdict, severity, reason}] — chấp nhận cả
 *                  output bị bọc ```json fence hoặc lẫn prose.
 *
 * Exit code: 0 đồng thuận hoàn toàn, 1 có bất đồng, 2 input lỗi.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outPath = outArg ? outArg.split('=')[1] : null;

if (argv.length < 2) {
  console.error('Usage: node scripts/diff-verdicts.mjs <verdicts.json> <omp-verdicts.json> [--out=diff.md]');
  process.exit(2);
}

function readJsonLoose(p) {
  let raw = readFileSync(p, 'utf8');
  raw = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error(`không parse được JSON trong ${p}`);
  }
}

let mine;
let theirs;
try {
  mine = readJsonLoose(argv[0]);
  theirs = readJsonLoose(argv[1]);
} catch (err) {
  console.error(`[diff] ${err.message}`);
  process.exit(2);
}

const mineList = Array.isArray(mine) ? mine : mine.results || [];
const theirList = Array.isArray(theirs) ? theirs : theirs.results || [];
const theirById = new Map(theirList.map((r) => [String(r.id).toUpperCase(), r]));

const rows = [];
for (const m of mineList) {
  const id = String(m.id).toUpperCase();
  const t = theirById.get(id);
  let state;
  if (!t) state = 'NO_VERDICT';
  else if (m.status === 'FAIL') state = 'MY_CLAIM_FAILED';
  else if (m.status === 'DRIFT') state = 'NEEDS_LINE_FIX';
  else if (String(t.verdict).toUpperCase() === 'REFUTED') state = 'DISPUTE_REFUTED';
  else if (String(t.verdict).toUpperCase() === 'UNSURE') state = 'INSUFFICIENT_EXCERPT';
  else if (String(t.severity).toUpperCase() !== String(m.severity).toUpperCase()) state = 'SEVERITY_DIFF';
  else state = 'AGREE';

  rows.push({
    id,
    myStatus: m.status,
    mySeverity: m.severity,
    theirVerdict: t ? t.verdict : null,
    theirSeverity: t ? t.severity : null,
    theirReason: t ? t.reason : null,
    state,
  });
}

const order = {
  DISPUTE_REFUTED: 0,
  MY_CLAIM_FAILED: 1,
  SEVERITY_DIFF: 2,
  INSUFFICIENT_EXCERPT: 3,
  NEEDS_LINE_FIX: 4,
  NO_VERDICT: 5,
  AGREE: 6,
};
rows.sort((a, b) => order[a.state] - order[b.state] || a.id.localeCompare(b.id));

const tally = rows.reduce((acc, r) => {
  acc[r.state] = (acc[r.state] || 0) + 1;
  return acc;
}, {});

const label = {
  AGREE: 'đồng thuận',
  DISPUTE_REFUTED: 'OMP BÁC BỎ',
  SEVERITY_DIFF: 'lệch mức',
  INSUFFICIENT_EXCERPT: 'excerpt thiếu',
  NEEDS_LINE_FIX: 'cần sửa số dòng',
  MY_CLAIM_FAILED: 'claim của tôi FAIL',
  NO_VERDICT: 'OMP không trả',
};

console.log(`\nCross-check · ${rows.length} claim\n`);
for (const r of rows) {
  console.log(
    `${label[r.state].padEnd(20)} ${r.id.padEnd(6)} tôi=${r.mySeverity}/${r.myStatus}` +
      (r.theirVerdict ? `  OMP=${r.theirSeverity}/${r.theirVerdict}` : '') +
      (r.theirReason ? `\n${' '.repeat(21)}↳ ${r.theirReason}` : '')
  );
}
console.log(
  `\nTổng: đồng thuận ${tally.AGREE || 0} · bất đồng ${tally.DISPUTE_REFUTED || 0} · ` +
    `lệch mức ${tally.SEVERITY_DIFF || 0} · excerpt thiếu ${tally.INSUFFICIENT_EXCERPT || 0} · ` +
    `không có verdict ${tally.NO_VERDICT || 0}\n`
);

if (outPath) {
  const md = [
    '# Cross-check diff',
    '',
    `Sinh lúc: ${new Date().toISOString()}`,
    '',
    '| Claim | Tôi | OMP | Trạng thái | Lý do OMP |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.mySeverity} / ${r.myStatus} | ${
          r.theirVerdict ? `${r.theirSeverity} / ${r.theirVerdict}` : '—'
        } | ${label[r.state]} | ${r.theirReason || '—'} |`
    ),
    '',
  ].join('\n');
  writeFileSync(resolve(outPath), md, 'utf8');
  console.log(`Diff: ${resolve(outPath)}\n`);
}

process.exit(tally.DISPUTE_REFUTED || tally.MY_CLAIM_FAILED ? 1 : 0);
