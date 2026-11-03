// Owner-authorized test-data operation. No HTTP route; no role/profile/HR graph changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { ShiftDefinitionInputSchema } from '@hr-blockbot/contracts';
import { OperationalShiftModel as Shift, OperationalWeekModel as Week } from '../dist/models/OperationalSchedule.js';
import { datePlus, assignmentTimes, verifySchedule, scheduleAuditEntry } from '../dist/services/scheduling.service.js';
import { digest } from '../dist/services/project-audit.service.js';
import { verifyAccessToken } from '../dist/services/auth.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { requireCapability } from '../dist/services/authorization-scope.service.js';
import { withAccountSecurityLock } from '../dist/services/account-security.service.js';

export const BATCH = 'OWNER_RANDOM_PUBLISHED_SCHEDULES_OCT_NOV_20261103';
export const FROM = '2026-10-01', TO = '2026-11-30';
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').trim().toUpperCase();
const objectId = (text) => new mongoose.Types.ObjectId(createHash('sha256').update(text).digest('hex').slice(0, 24));
const number = (text) => parseInt(createHash('sha256').update(BATCH + ':' + text).digest('hex').slice(0, 8), 16);
const uuid = (text) => { const b = createHash('sha256').update(BATCH + ':' + text).digest().subarray(0, 16); b[6] = (b[6] & 15) | 80; b[8] = (b[8] & 63) | 128; const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const monday = (day) => datePlus(day, -(new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7);
const codeOf = (e) => norm(e.employeeCode || e.employee_code);
const storeKey = (id) => String(id);
export const DEFINITIONS = [
  ['A', 'Ca A', 360, 840], ['A1', 'Ca A1', 360, 600], ['A2', 'Ca A2', 600, 840],
  ['B', 'Ca B', 840, 1320], ['B1', 'Ca B1', 840, 1080], ['B2', 'Ca B2', 1080, 1320],
  ['LĐ', 'Đứng trước quán vẫy/đón khách', 360, 600],
].map(([code, name, startMinute, endMinute]) => ShiftDefinitionInputSchema.parse({ code, name, active: true, intervals: [{ startMinute, endMinute }] }));
// Explicit source block/address concordance; never infer a historical location from current home alone.
const BLOCKS = { '1BNK': 'GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm', '749NK': 'GUTA CAFE - Hạnh Thông - 749 Nguyễn Kiệm' };
const key = (e, day) => String(e._id) + ':' + day;
const withinEmployment = (e, day) => {
  const hire = /^20\d{2}-\d{2}-\d{2}$/.test(e.hire_date ?? '') ? e.hire_date : e.hiredAt instanceof Date ? e.hiredAt.toISOString().slice(0, 10) : null;
  return !hire || day >= hire;
};
function sourceCode(raw) { const n = norm(raw); return n === 'LD' ? 'LĐ' : n; }

export function planPublishedDemo({ stores, employees, sourceRows, shifts, weeks }) {
  const outlets = stores.filter(s => s.kind === 'outlet' && s.status === 'ACTIVE' && !s.deleted_at).sort((a, b) => String(a._id).localeCompare(String(b._id)));
  if (new Set(outlets.map(s => String(s._id))).size !== outlets.length) throw new Error('Duplicate store identity');
  const names = new Map(); for (const s of outlets) { const n = norm(s.store_name); names.set(n, [...(names.get(n) || []), s]); }
  const people = new Map(), byCode = new Map(), stats = { stores: outlets.length, storesWithPeople: 0, matchedCanonical: 0, matchedExactName: 0,
    unavailableEmployees: 0, testSupportEmployees: 0, outsideStoreEmployees: 0, newShifts: 0, newWeeks: 0, filledEmptyWeeks: 0, preservedWeeks: 0, resumedWeeks: 0,
    generatedAssignments: 0, matchedLegacyAssignments: 0, unresolvedSourceRows: 0, conflictSkips: 0, existingConflictSkips: 0, datesReservedBySource: 0 };
  for (const e of employees) {
    if (codeOf(e)) byCode.set(codeOf(e), [...(byCode.get(codeOf(e)) || []), e]);
    if (e.status !== 'active' || e.lifecyclePendingRequestId) { stats.unavailableEmployees++; continue; }
    if (/^LOCAL-BATCH20-/.test(codeOf(e))) { stats.testSupportEmployees++; continue; }
    const current = outlets.find(s => String(s._id) === String(e.storeId));
    const exact = names.get(norm(e.store_raw)) || [];
    let s;
    if (current) { if (exact.length && !exact.some(s => String(s._id) === String(current._id))) throw new Error('Current store contradicts exact source location'); s = current; stats.matchedCanonical++; }
    else if (exact.length === 1) { s = exact[0]; stats.matchedExactName++; }
    else { stats.outsideStoreEmployees++; continue; }
    people.set(String(e._id), { employee: e, storeId: String(s._id), storeMatch: current ? 'CANONICAL_ID' : 'EXACT_SOURCE_NAME' });
  }
  const safeSource = new Map(), reserved = new Set(), sourceReview = [];
  for (const r of sourceRows.filter(r => r.work_date >= FROM && r.work_date <= TO)) {
    const matches = byCode.get(norm(r.employee_code)) || [];
    if (r.row_kind !== 'employee' || matches.length !== 1) { sourceReview.push({ sourceId: String(r._id), reason: 'NO_UNIQUE_EMPLOYEE' }); continue; }
    const e = matches[0], k = key(e, r.work_date); reserved.add(k);
    const matched = people.get(String(e._id)), storeMatches = names.get(norm(BLOCKS[r.block_code] ?? '')) || [];
    const shiftCode = sourceCode(r.shift_code);
    if (r.schedule_type !== 'actual' || !matched || storeMatches.length !== 1 || String(storeMatches[0]._id) !== matched.storeId
      || !DEFINITIONS.some(d => d.code === shiftCode) || !withinEmployment(e, r.work_date)) {
      sourceReview.push({ sourceId: String(r._id), reason: 'SOURCE_REQUIRES_REVIEW', block: r.block_code, shiftCode: r.shift_code, date: r.work_date }); continue;
    }
    safeSource.set(k, [...(safeSource.get(k) || []), { row: r, shiftCode }]);
  }
  stats.datesReservedBySource = reserved.size;
  const shiftChanges = [], weekChanges = [], storeReports = [], allAssignments = [];
  const existingByEmployee = new Map();
  for (const w of weeks) for (const a of [...(w.draft || []), ...(w.published || [])]) existingByEmployee.set(a.employeeId, [...(existingByEmployee.get(a.employeeId) || []), a]);
  const overlapExisting = (a) => (existingByEmployee.get(a.employeeId) || []).some(b => assignmentTimes(a).some(x => assignmentTimes(b).some(y => x.start < y.end && y.start < x.end)));
  for (const s of outlets) {
    const storeId = String(s._id), roster = [...people.values()].filter(p => p.storeId === storeId).map(p => p.employee).sort((a, b) => String(a._id).localeCompare(String(b._id)));
    if (roster.length) stats.storesWithPeople++;
    const definitions = [];
    for (const d of DEFINITIONS) {
      const prior = shifts.filter(x => String(x.storeId) === storeId && x.code === d.code);
      if (prior.length > 1) throw new Error('Duplicate shift code');
      const shift = prior[0] ?? { _id: objectId('shift-v1:' + storeId + ':' + d.code), storeId: s._id, ...d, version: 1 };
      ShiftDefinitionInputSchema.parse({ code: shift.code, name: shift.name, active: shift.active, intervals: shift.intervals });
      if (!prior.length) shiftChanges.push(shift);
      if (shift.active) definitions.push(shift);
    }
    const report = { storeId, name: s.store_name, activePeople: roster.length, canonicalScopeEnabled: !!s.scopeApprovalRef, assignments: 0, legacyMatched: 0, random: 0, preservedWeeks: [] };
    for (let start = monday(FROM); start <= TO; start = datePlus(start, 7)) {
      const id = objectId('schedule-v1:' + storeId + ':' + start), existing = weeks.find(w => String(w._id) === String(id));
      if (existing?.history?.some(h => h.batchId === BATCH)) { stats.resumedWeeks++; continue; }
      const untouched = !existing || existing.version === 1 && existing.draft.length === 0 && existing.published.length === 0 && !existing.publishedAt && existing.requests.length === 0 && existing.history.length === 1 && existing.history[0].action === 'WEEK_CREATED';
      if (!untouched) { stats.preservedWeeks++; report.preservedWeeks.push(start); continue; }
      const assignments = [];
      for (let day = start; day <= datePlus(start, 6); day = datePlus(day, 1)) {
        if (day < FROM || day > TO) continue;
        for (const e of roster) {
          if (!withinEmployment(e, day)) continue;
          const k = key(e, day), source = safeSource.get(k), sourceRows = source || [], singleSource = sourceRows.length === 1 ? sourceRows[0] : null;
          let definition, kind = 'DEMO_RANDOM';
          if (singleSource) { definition = definitions.find(d => d.code === singleSource.shiftCode); kind = 'LEGACY_MATCHED'; }
          else {
            if (reserved.has(k)) continue; // Unknown/registered source must not be silently replaced by generated truth.
            const off = number(String(e._id) + ':' + start + ':off') % 7;
            if ((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7 === off) continue;
            const title = norm(e.job_title), longShift = /^(SM|AM|AOM|OM|OD)$|PHU TRACH|BAO VE|BEP/.test(title);
            const pool = definitions.filter(d => (longShift ? ['A', 'B'] : ['A1', 'A2', 'B1', 'B2', ...(/^GUTA CAFE|^GUTA EXPRESS/.test(s.store_name) && /BAN HANG/.test(title) ? ['LĐ'] : [])]).includes(d.code));
            if (!pool.length) continue;
            definition = pool[number(String(e._id) + ':' + day + ':shift') % pool.length];
          }
          if (!definition) continue;
          const a = { id: uuid(storeId + ':' + k), employeeId: String(e._id), date: day, shiftId: String(definition._id),
            employeeName: e.fullName || e.full_name || '', employeeCode: e.employeeCode || e.employee_code || '', shiftCode: definition.code,
            shiftName: definition.name, shiftVersion: definition.version, intervals: structuredClone(definition.intervals),
            source: { kind, batchId: BATCH, ...(kind === 'LEGACY_MATCHED' ? { sourceId: String(singleSource.row._id) } : {}) } };
          if (overlapExisting(a)) { stats.existingConflictSkips++; continue; }
          assignments.push(a); allAssignments.push(a); report.assignments++;
          if (kind === 'LEGACY_MATCHED') { stats.matchedLegacyAssignments++; report.legacyMatched++; } else { stats.generatedAssignments++; report.random++; }
        }
      }
      if (assignments.length > 500) throw new Error('Weekly assignment bound exceeded');
      weekChanges.push({ _id: id, storeId: s._id, weekStart: start, before: existing || null, assignments });
      if (existing) stats.filledEmptyWeeks++; else stats.newWeeks++;
    }
    storeReports.push(report);
  }
  const seen = new Set(); for (const a of allAssignments) { const k = a.employeeId + ':' + a.date; if (seen.has(k)) throw new Error('Employee/day collision across stores'); seen.add(k); }
  stats.newShifts = shiftChanges.length; stats.unresolvedSourceRows = sourceReview.length;
  return { batchId: BATCH, from: FROM, to: TO, stats, stores: storeReports, shiftChanges, weekChanges, sourceReview };
}

export async function readInputs() {
  const collection = (name) => mongoose.connection.collection(name).find({}).sort({ _id: 1 }).toArray();
  const [stores, employees, sourceRows, shifts, weeks] = await Promise.all(['stores', 'employees', 'schedule_entries', 'operational_shift_definitions', 'operational_schedule_weeks'].map(collection));
  shifts.forEach(verifySchedule); weeks.forEach(verifySchedule);
  return { stores, employees, sourceRows, shifts, weeks };
}
export async function applyPublishedDemo(actor, inputs, plan, journal = async () => {}) {
  if (mongoose.connection.name !== 'hr_bot_test_363' && !(process.env.NODE_ENV === 'test' && mongoose.connection.name.startsWith('test_'))) throw new Error('Test database only');
  if (plan.batchId !== BATCH || plan.from !== FROM || plan.to !== TO) throw new Error('Owner scope mismatch');
  requireCapability(actor, 'accounts.manage'); requireCapability(actor, 'grants.configure');
  return withAccountSecurityLock(actor, async () => {
    if (digest(await readInputs()) !== digest(inputs)) throw new Error('Inputs changed since reviewed plan');
    if (digest(planPublishedDemo(inputs)) !== digest(plan)) throw new Error('Plan changed since deterministic validation');
    let changedStores = 0;
    for (const s of plan.stores) {
      const shifts = plan.shiftChanges.filter(d => String(d.storeId) === s.storeId), weeks = plan.weekChanges.filter(w => String(w.storeId) === s.storeId);
      if (!shifts.length && !weeks.length) continue;
      await mongoose.connection.transaction(async () => {
        if (shifts.length) await Shift.insertMany(shifts.map(d => ({ ...d, history: [scheduleAuditEntry(null, d, actor.userId, 'SHIFT_CREATED', 'Owner approved demo catalog; LĐ stands before this shop to greet/attract customers.')] })));
        for (const w of weeks) {
          const changes = { draft: w.assignments, published: w.assignments, publishedAt: new Date().toISOString(), version: (w.before?.version || 0) + 1 };
          const row = { ...(w.before || { _id: w._id, storeId: w.storeId, weekStart: w.weekStart, requests: [], deliveredNoticeIds: [] }), ...changes };
          const reason = `OWNER REQUEST ${BATCH}: direct publish demo ${FROM}..${TO}; seeded random shifts (${s.random}) and matched old codes (${s.legacyMatched}) at ${s.name}; ${s.activePeople} active people. Current personnel only; not attendance or verified historic employment. LĐ: đứng trước quán vẫy/đón khách, 06:00–10:00. No notifications in bulk demo import.`;
          const audit = scheduleAuditEntry(w.before, row, actor.userId, 'DEMO_SCHEDULE_PUBLISHED', reason);
          const { hash, ...payload } = audit; const event = { ...payload, batchId: BATCH }; const signed = { ...event, hash: digest(event) };
          if (w.before) {
            const saved = await Week.updateOne({ _id: w._id, version: w.before.version, draft: [], published: [], publishedAt: null, requests: [] }, { $set: changes, $push: { history: signed } });
            if (saved.modifiedCount !== 1) throw new Error('Existing week CAS failed');
          } else await Week.create({ ...row, history: [signed] });
        }
      });
      await journal({ storeId: s.storeId, weeks: weeks.length, shifts: shifts.length }); changedStores++;
    }
    return { changedStores, ...plan.stats };
  }, 'grants.configure');
}
async function main() {
  let raw = ''; for await (const part of process.stdin) raw += part; const c = JSON.parse(raw);
  if (c.dbName !== 'hr_bot_test_363' || c.approvalRef !== BATCH || c.apiOrigin !== 'https://hr-blockbot-363-test-api-starter.onrender.com') throw new Error('Pinned owner-authorized target required');
  process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = c.jwtSecret;
  mongoose.set('autoIndex', false).set('autoCreate', false).set('transactionAsyncLocalStorage', true);
  let cookie;
  try {
    const r = await fetch(c.apiOrigin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c.actorCredential) });
    if (r.status !== 200) throw new Error('Technical operator unavailable'); cookie = r.headers.get('set-cookie')?.split(';')[0];
    const claims = await verifyAccessToken((await r.json()).accessToken);
    await mongoose.connect(c.uri, { dbName: c.dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
    const actor = await resolvePrincipal(claims); requireCapability(actor, 'grants.configure'); requireCapability(actor, 'accounts.manage');
    const inputs = await readInputs(), plan = planPublishedDemo(inputs);
    await fs.mkdir(c.privateDirectory, { recursive: true });
    const planPath = path.join(c.privateDirectory, `${c.apply ? 'apply' : 'dry-run'}-${Date.now()}.private.json`);
    await fs.writeFile(planPath, JSON.stringify({ inputDigest: digest(inputs), plan }, null, 2), { flag: 'wx' });
    if (c.apply) {
      if (!c.expectedInputDigest || digest(inputs) !== c.expectedInputDigest) throw new Error('Reviewed input digest required');
      await fs.writeFile(path.join(c.privateDirectory, `before-${Date.now()}.private.ejson`), mongoose.mongo.BSON.EJSON.stringify(inputs, { relaxed: false }), { flag: 'wx' });
      const result = await applyPublishedDemo(actor, inputs, plan, async e => {
        await fs.appendFile(path.join(c.privateDirectory, 'journal.private.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n');
      });
      console.log(JSON.stringify({ status: 'PUBLISHED_DEMO_APPLIED', batchId: BATCH, result, stores: plan.stores, unresolvedSourceRows: plan.sourceReview }));
    } else console.log(JSON.stringify({ status: 'PUBLISHED_DEMO_DRY_RUN', inputDigest: digest(inputs), batchId: BATCH, stats: plan.stats, stores: plan.stores, unresolvedSourceRows: plan.sourceReview }));
  } finally {
    await mongoose.disconnect(); if (cookie) await fetch(c.apiOrigin + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } }).catch(() => {});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(JSON.stringify({ status: 'PUBLISHED_DEMO_STOPPED', errorClass: e.name, message: 'Private configuration omitted; inspect private operator state' })); process.exitCode = 1; });
