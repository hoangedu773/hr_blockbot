import mongoose from 'mongoose';
import { z } from 'zod';
import * as C from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { RevenueKpiPeriodModel as Period } from '../models/RevenueKpiPeriod.js';
import { RevenueKpiAssignmentModel as Assignment } from '../models/RevenueKpiAssignment.js';
import { RevenueKpiResultModel as Result } from '../models/RevenueKpiResult.js';
import { EmployeeModel } from '../models/Employee.js';
import { UserModel } from '../models/User.js';
import { SmAppointmentModel } from '../models/SmAppointment.js';
import { withCrmWriter } from './crm-writer.service.js';
import { resolvePrincipal } from './principal.service.js';
import { requireCapability, allowedStoreIds, hasCapability, resourceScope, effectiveGrantsFor } from './authorization-scope.service.js';
import { WorkflowError } from './project-workflow.service.js';
import { digest } from './project-audit.service.js';
import { ensureRevenueKpiStorage } from './revenue-kpi-storage.service.js';
import { flushRevenueKpiNotices } from './revenue-kpi-notification.service.js';
import { addWorkingDays, calculateRevenueKpi, computeStoreRevenue, periodRangeVN, priorMonth, targetFromGrowth } from './revenue-kpi-calc.service.js';

export const revenueKpiEnabled = () => process.env.REVENUE_KPI_ENABLED === 'true';
const fail = (code: string, message: string, status = 409): never => { throw new WorkflowError(status, code, message); };
const same = (a: unknown, b: unknown) => String(a) === String(b);
const oid = (s: string) => new mongoose.Types.ObjectId(s);
export const revenueId = (s: string) => digest(s).slice(0, 24);
const dto = (schema: any, row: any): any => { if (!row) return null; const { _id, ...fields } = row.toObject ? row.toObject() : row; return schema.parse({ ...fields, id: String(_id) }); };
const pDto = (r: any): C.RevenueKpiPeriod => dto(C.RevenueKpiPeriodSchema, r);
const aDto = (r: any): C.RevenueKpiAssignment => dto(C.RevenueKpiAssignmentSchema, r);
const rDto = (r: any): C.RevenueKpiResult => dto(C.RevenueKpiResultSchema, r);
const dbRow = (row: any) => { const { id, ...fields } = row; return { _id: id, ...fields }; };
async function fresh(user: AuthenticatedUser) {
  if (!revenueKpiEnabled()) fail('REVENUE_KPI_DISABLED', 'KPI doanh thu chưa được bật.', 503);
  const u = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
  if (!['hr', 'am', 'sm'].includes(u.authorization?.profile ?? '')) fail('RBAC_DENIED', 'Bạn chưa có quyền KPI doanh thu.', 403);
  await ensureRevenueKpiStorage(); return u;
}
function capStores(u: AuthenticatedUser, cap: C.AuthorizationCapability) {
  requireCapability(u, cap);
  return allowedStoreIds(u, cap).filter(id => { try { requireCapability(u, cap, resourceScope(u, { storeId: id, storeMappingRef: 'revenue-kpi' })); return true; } catch { return false; } });
}
// A closed/inactive or approval-withdrawn store drops out of the canonical catalog
// and `allowedStoreIds`. Without a fallback a running KPI that snapshots that store
// becomes invisible and the period can never be closed (403 forever). The static
// grant scope is still the authority for that store id, so read, reason review,
// confirm, compute/close and the HR cancel escape hatch keep working. Publishing and
// target changes still require a current canonical store.
function staticScopeCovers(u: AuthenticatedUser, cap: C.AuthorizationCapability, stores: { storeId: string }[]) {
  if (!stores.length || u.authorization?.profile === 'staff') return false;
  const granted = new Set<string>();
  for (const grant of effectiveGrantsFor(u, cap)) for (const id of grant.scope.storeIds) granted.add(String(id).toLowerCase());
  return stores.every(s => granted.has(String(s.storeId).toLowerCase()));
}
function forStores(u: AuthenticatedUser, cap: C.AuthorizationCapability, stores: { storeId: string }[], allowDeparted = false) {
  if (!stores.length) fail('REVENUE_KPI_STORE_NOT_IN_SCOPE', 'Cửa hàng không còn thuộc phạm vi được cấp.', 403);
  let ids: string[] | null = null;
  try { ids = capStores(u, cap); } catch (e) { if (!allowDeparted || !staticScopeCovers(u, cap, stores)) throw e; }
  if ((ids && stores.every(s => ids!.includes(s.storeId))) || (allowDeparted && staticScopeCovers(u, cap, stores))) return;
  fail('REVENUE_KPI_STORE_NOT_IN_SCOPE', 'Cửa hàng không còn thuộc phạm vi được cấp.', 403);
}
// Period-level authority for compute/close must survive a canonical catalog that no
// longer contains the covered stores (all closed mid-period). The static grant still
// proves the HR profile and capability; per-assignment scope is re-checked with the
// departed-store fallback in forStores.
function requirePeriodAuthority(u: AuthenticatedUser, cap: C.AuthorizationCapability) {
  try { capStores(u, cap); } catch (e) { if (!effectiveGrantsFor(u, cap).length) throw e; }
}
function independent(u: AuthenticatedUser, a: C.RevenueKpiAssignment) { if (a.assigneeEmployeeId === u.employeeId) fail('REVENUE_KPI_SELF_APPROVAL', 'Cần HR độc lập xử lý KPI này.', 403); }
function own(u: AuthenticatedUser, a: C.RevenueKpiAssignment, cap: C.AuthorizationCapability) {
  requireCapability(u, cap, { userId: u.userId, employeeId: a.assigneeEmployeeId });
  if (a.assigneeEmployeeId !== u.employeeId) fail('RBAC_DENIED', 'Chỉ người được giao KPI được phản hồi.', 403);
}
function canRead(u: AuthenticatedUser, a: C.RevenueKpiAssignment) {
  if (a.assigneeEmployeeId === u.employeeId && hasCapability(u, 'revenue_kpi.read_self')) return true;
  if (!hasCapability(u, 'revenue_kpi.read_scope') && !staticScopeCovers(u, 'revenue_kpi.read_scope', a.stores)) return false;
  try { forStores(u, 'revenue_kpi.read_scope', a.stores, true); return true; } catch { return false; }
}
async function periodGet(period: string) { C.RevenueKpiMonthSchema.parse(period); const r = await Period.findOne({ period }).lean(); if (!r) fail('REVENUE_KPI_NOT_FOUND', 'Chưa có kỳ KPI này.', 404); return pDto(r); }
async function assignmentGet(id: string) { if (!/^[a-f0-9]{24}$/.test(id)) fail('REVENUE_KPI_NOT_FOUND', 'Không tìm thấy KPI.', 404); const r = await Assignment.findById(id).lean(); if (!r) fail('REVENUE_KPI_NOT_FOUND', 'Không tìm thấy KPI.', 404); return aDto(r); }
async function latest(a: string) { return rDto(await Result.findOne({ assignmentId: a }).sort({ version: -1 }).lean()); }
function unlocked(p: C.RevenueKpiPeriod) { if (p.status !== 'OPEN') fail('REVENUE_KPI_PERIOD_LOCKED', 'Kỳ này chưa mở hoặc đã chốt.'); }
function replay(row: { history: any[] }, u: AuthenticatedUser, action: string, input: any) {
  const entry = row.history.find(h => h.requestId === input.clientRequestId);
  if (!entry) return false;
  if (entry.by !== u.userId || entry.action !== action || entry.payloadHash !== digest(input)) fail('REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng với nội dung khác.');
  return true;
}
function version(row: { version: number }, input: any) { if (row.version !== input.expectedVersion) fail('REVENUE_KPI_VERSION_CONFLICT', 'Dữ liệu đã thay đổi. Tải lại trước khi tiếp tục.'); }
function event(u: AuthenticatedUser, before: any, after: any, action: string, input: any) {
  return { at: new Date().toISOString(), by: u.userId, actorKind: 'USER' as const, action, fromStatus: before?.status ?? null, toStatus: after.status ?? null,
    fromTargetVnd: before?.targetVnd ?? null, toTargetVnd: after.targetVnd ?? null, reason: input.reason ?? input.text ?? input.note ?? input.waiveReason ?? null,
    requestId: input.clientRequestId, payloadHash: digest(input) };
}
async function update(model: any, schema: any, row: any, changes: any, u: AuthenticatedUser, action: string, input: any) {
  if (replay(row, u, action, input)) return row; version(row, input);
  const next = schema.parse({ ...row, ...changes, version: row.version + 1, updatedAt: new Date().toISOString(), history: [...row.history, event(u, row, { ...row, ...changes }, action, input)] });
  const value = await model.findOneAndUpdate({ _id: row.id, status: row.status, version: row.version }, { $set: dbRow(next) }, { new: true, runValidators: true });
  if (!value) fail('REVENUE_KPI_VERSION_CONFLICT', 'Dữ liệu đã thay đổi. Tải lại và thử lại.'); return dto(schema, value);
}
async function appendResult(a: C.RevenueKpiAssignment, prev: C.RevenueKpiResult | null, fields: any, u: AuthenticatedUser, action: string, input: any) {
  if (prev && replay(prev, u, action, input)) return prev;
  if (prev) version(prev, input); else if (input.expectedVersion !== 0) fail('REVENUE_KPI_VERSION_CONFLICT', 'Kết quả đã thay đổi.');
  const now = new Date().toISOString(), v = (prev?.version ?? 0) + 1;
  const next = C.RevenueKpiResultSchema.parse({ ...(prev ?? {}), assignmentId: a.id, period: a.period, unitType: a.unitType,
    storeId: a.storeId, areaKey: a.areaKey, assigneeEmployeeId: a.assigneeEmployeeId, targetVnd: a.targetVnd,
    missReason: null, confirmedBy: null, confirmedAt: null, computedBy: u.userId, computedAt: now, ...fields,
    id: revenueId(a.id + ':' + v), assignmentVersion: a.version, version: v, supersedesResultId: prev?.id ?? null, history: [...(prev?.history ?? []), event(u, prev, fields, action, input)], createdAt: now, updatedAt: now });
  try { return rDto(await Result.create(dbRow(next))); } catch (e: any) { if (e.code === 11000) fail('REVENUE_KPI_VERSION_CONFLICT', 'Kết quả đã được cập nhật đồng thời.'); throw e; }
}
// One shared writer serializes this module with grant/lifecycle/scheduling changes.
async function write<T>(user: AuthenticatedUser, action: (u: AuthenticatedUser) => Promise<T>) {
  const result = await withCrmWriter(async () => action(await fresh(user)));
  // Delivery failure does not roll back a persisted decision; history retries it.
  try { const r: any = result; await flushRevenueKpiNotices(r?.assignmentId ?? (r?.unitType ? r.id : undefined)); } catch { console.error('[RevenueKpi] notice delivery deferred'); }
  return result;
}

async function recipientsFor(role: 'sm' | 'am', u: AuthenticatedUser, storeIds: string[]) {
  const rows: any[] = await UserModel.find({ status: 'active', 'authorization.profile': role, employeeId: { $ne: null } }).select('_id employeeId role securityVersion').limit(1001).lean();
  if (rows.length > 1000) fail('REVENUE_KPI_DATA_PENDING', 'Danh mục người phụ trách vượt giới hạn kiểm tra.');
  const result: any[] = [];
  const inspect = async (row: any) => {
    try {
      const actor = await resolvePrincipal({ sub: String(row._id), role: row.role, securityVersion: row.securityVersion ?? 0 });
      if (!actor.employeeActive || !actor.employeeId || !hasCapability(actor, 'revenue_kpi.respond')) return;
      const employee: any = await EmployeeModel.findById(actor.employeeId).select('fullName full_name storeId status lifecyclePendingRequestId').lean();
      if (!employee || employee.lifecyclePendingRequestId) return;
      const fullScope = role === 'am' ? capStores(actor, 'revenue_kpi.read_scope') : [];
      // HR may not silently create a partial KPI for an AM with broader scope.
      const ids = role === 'sm' ? storeIds.filter(id => id === actor.canonical?.ownStoreId) : fullScope.every(id => storeIds.includes(id)) ? fullScope : [];
      if (ids.length) result.push({ employeeId: actor.employeeId, name: employee.fullName || employee.full_name || 'Chưa cập nhật tên', role: role.toUpperCase(), storeIds: ids });
    } catch { /* malformed/inactive/held principals are not eligible recipients */ }
  };
  // Bounded concurrent independent principal reads prevent N+1 network latency
  // from making HR's catalog/open operation exceed a normal browser deadline.
  for (let i = 0; i < rows.length; i += 8) await Promise.all(rows.slice(i, i + 8).map(inspect));
  return result.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}
async function catalog(u: AuthenticatedUser, period: string, cap: C.AuthorizationCapability = 'revenue_kpi.assign') {
  const ids = capStores(u, cap), candidates = [...await recipientsFor('sm', u, ids), ...await recipientsFor('am', u, ids)];
  const { start, end } = periodRangeVN(period);
  const appointments: any[] = await SmAppointmentModel.find({ storeId: { $in: ids.map(oid) }, status: 'APPROVED', kind: { $in: ['PRIMARY', 'ADDITIONAL'] }, validFrom: { $lt: end }, $or: [{ validUntil: null }, { validUntil: { $gt: start } }] }).lean();
  const stores = ids.map(id => { const ss = appointments.filter(a => same(a.storeId, id)); const known = [...new Set(ss.map(a => String(a.employeeId)))].filter(e => candidates.some(c => c.role === 'SM' && c.employeeId === e));
    const fallback = candidates.filter(c => c.role === 'SM' && c.storeIds.includes(id)).map(c => c.employeeId);
    return { id, name: u.canonical!.verifiedStores.find(s => s.id === id)!.name, smEmployeeIds: known.length ? known : fallback,
      smStatus: known.length === 1 ? 'IDENTIFIED' as const : (known.length || fallback.length) ? 'AMBIGUOUS' as const : 'MISSING' as const }; });
  return { candidates, stores };
}
export async function listRevenueKpiPeriods(user: AuthenticatedUser) {
  const u = await fresh(user); if (!hasCapability(u, 'revenue_kpi.read_scope')) requireCapability(u, 'revenue_kpi.read_self', { userId: u.userId, employeeId: u.employeeId });
  const rows: any[] = await Period.find({}).sort({ period: -1 }).limit(120).lean();
  const items = [];
  for (const row of rows) { const assignments = (await Assignment.find({ period: row.period }).limit(1001).lean()).map(aDto); if (hasCapability(u, 'revenue_kpi.assign') || assignments.some(a => canRead(u, a))) items.push(pDto(row)); }
  return { items };
}
export async function createRevenueKpiPeriod(user: AuthenticatedUser, raw: unknown) { const input = C.RevenueKpiCreatePeriodSchema.parse(raw); return write(user, async u => {
  capStores(u, 'revenue_kpi.assign'); if (input.expectedVersion !== 0) fail('REVENUE_KPI_VERSION_CONFLICT', 'Kỳ mới cần phiên bản ban đầu.');
  const exists = await Period.findOne({ period: input.period }).lean(); if (exists) { const p = pDto(exists); if (replay(p, u, 'CREATE_PERIOD', input)) return p; fail('REVENUE_KPI_VERSION_CONFLICT', 'Kỳ này đã tồn tại.'); }
  const now = new Date().toISOString(), row = C.RevenueKpiPeriodSchema.parse({ id: revenueId('revenue-period:' + input.period), period: input.period, status: 'DRAFT', policy: input.policy,
    openedBy: null, openedAt: null, closedBy: null, closedAt: null, version: 1, history: [event(u, null, { status: 'DRAFT' }, 'CREATE_PERIOD', input)], createdAt: now, updatedAt: now });
  return pDto(await Period.create(dbRow(row)));
}); }

async function buildDraft(u: AuthenticatedUser, p: C.RevenueKpiPeriod, input: z.infer<typeof C.RevenueKpiDraftAssignmentSchema>, options?: Awaited<ReturnType<typeof catalog>>) {
  const cat = options ?? await catalog(u, p.period), candidate = cat.candidates.find(c => c.employeeId === input.assigneeEmployeeId && c.role === (input.unitType === 'STORE' ? 'SM' : 'AM'));
  if (!candidate) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Người phụ trách chưa đủ điều kiện nhận KPI.');
  const ids = input.unitType === 'STORE' ? [input.storeId!] : candidate.storeIds;
  if (input.unitType === 'AREA' && input.storeIds && digest([...input.storeIds].sort()) !== digest([...ids].sort())) fail('REVENUE_KPI_TARGET_INVALID', 'KPI khu vực phải gồm toàn bộ cửa hàng trong phạm vi đã xác minh.');
  forStores(u, 'revenue_kpi.assign', ids.map((storeId: string) => ({ storeId })));
  if (input.unitType === 'STORE' && !candidate.storeIds.includes(ids[0])) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'SM chưa thuộc cửa hàng này.');
  const stores = [];
  for (const id of ids) {
    const store = cat.stores.find(s => s.id === id)!;
    if (!store.smEmployeeIds.length) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Cửa hàng chưa có SM; chưa thể giao KPI.');
    if (input.unitType === 'STORE' && !store.smEmployeeIds.includes(candidate.employeeId)) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'HR cần chọn SM hợp lệ trong sổ hoặc danh sách nhân sự cửa hàng.');
    if (input.unitType === 'AREA') {
      const parent: any = await Assignment.findOne({ period: p.period, unitType: 'STORE', storeId: id, status: { $ne: 'CANCELLED' } }).lean();
      if (!parent) fail('REVENUE_KPI_TARGET_INVALID', 'Cần giao mục tiêu hợp lệ cho từng cửa hàng trước khi tạo KPI khu vực.');
      stores.push(aDto(parent).stores[0]); continue;
    }
    const base = await computeStoreRevenue(id, priorMonth(p.period), p.policy);
    const growth = input.targetMode === 'GROWTH_PERCENT' ? input.growthPercent ?? p.policy.defaultGrowthPercent : null;
    const targetVnd = growth === null ? input.targetVnd : targetFromGrowth(base.actualRevenueVnd, growth);
    if (!Number.isSafeInteger(targetVnd) || !targetVnd || targetVnd <= 0) fail('REVENUE_KPI_TARGET_INVALID', 'Nhập mục tiêu VND nguyên lớn hơn 0.');
    stores.push({ storeId: id, storeName: store.name, baseRevenueVnd: base.actualRevenueVnd, growthPercent: growth, targetVnd: targetVnd! });
  }
  const previous = input.id ? await assignmentGet(input.id) : null, now = new Date().toISOString();
  const total = stores.reduce((n, s) => n + s.targetVnd, 0);
  const from = input.responsibilityFrom ?? now; if (new Date(from) > new Date()) fail('REVENUE_KPI_TARGET_INVALID', 'Thời điểm phụ trách không được nằm trong tương lai.');
  return C.RevenueKpiAssignmentSchema.parse({ id: previous?.id ?? revenueId('revenue-assignment:' + p.period + ':' + input.unitType + ':' + (input.storeId ?? candidate.employeeId)), period: p.period,
    unitType: input.unitType, storeId: input.unitType === 'STORE' ? ids[0] : null, areaKey: input.unitType === 'AREA' ? 'am:' + candidate.employeeId : null,
    assigneeEmployeeId: candidate.employeeId, assigneeRole: candidate.role, assigneeName: candidate.name, targetMode: input.unitType === 'AREA' ? 'ABSOLUTE_VND' : input.targetMode,
    basePeriod: priorMonth(p.period), baseRevenueVnd: stores.every(s => s.baseRevenueVnd !== null) ? stores.reduce((n, s) => n + s.baseRevenueVnd!, 0) : null,
    growthPercent: input.unitType === 'STORE' ? stores[0].growthPercent : null, targetVnd: total, stores,
    responsibility: [{ employeeId: candidate.employeeId, employeeName: candidate.name, role: 'PRIMARY', from, to: null }], status: 'DRAFT',
    acceptance: null, refusal: null, hrDecision: null, adjustment: null, aiProposal: previous?.aiProposal ?? null, deadlineAt: null, overdue: false,
    version: 1, history: [], createdAt: previous?.createdAt ?? now, updatedAt: now });
}
export async function saveRevenueKpiAssignment(user: AuthenticatedUser, raw: unknown) { const input = C.RevenueKpiDraftAssignmentSchema.parse(raw); return write(user, async u => {
  const p = await periodGet(input.period); unlocked(p); const prev = input.id ? await assignmentGet(input.id) : null;
  if (prev) { forStores(u, 'revenue_kpi.assign', prev.stores); independent(u, prev); if (replay(prev, u, 'SAVE_DRAFT', input)) return prev; if (prev.status !== 'DRAFT' || prev.period !== input.period || prev.unitType !== input.unitType || prev.unitType === 'STORE' && prev.storeId !== input.storeId) fail('REVENUE_KPI_INVALID_STATE', 'Chỉ sửa mục tiêu bản nháp cùng đơn vị.'); version(prev, input); }
  else if (input.expectedVersion !== 0) fail('REVENUE_KPI_VERSION_CONFLICT', 'Phiên bản không hợp lệ.');
  const draft = await buildDraft(u, p, input); independent(u, draft);
  if (prev) return update(Assignment, C.RevenueKpiAssignmentSchema, prev, { ...draft, id: prev.id }, u, 'SAVE_DRAFT', input);
  const exists: any = await Assignment.findById(draft.id).lean(); if (exists) { const a = aDto(exists); if (replay(a, u, 'SAVE_DRAFT', input)) return a; fail('REVENUE_KPI_VERSION_CONFLICT', 'Đơn vị đã có KPI tháng này.'); }
  const created = { ...draft, history: [event(u, null, draft, 'SAVE_DRAFT', input)] }; return aDto(await Assignment.create(dbRow(C.RevenueKpiAssignmentSchema.parse(created))));
}); }
export async function openRevenueKpiPeriod(user: AuthenticatedUser, period: string, raw: unknown) { const input = C.RevenueKpiCommandSchema.parse(raw); return write(user, async u => {
  capStores(u, 'revenue_kpi.assign'); const p = await periodGet(period); const resumed = replay(p, u, 'OPEN_PERIOD', input); if (!resumed) { version(p, input); if (p.status !== 'DRAFT') fail('REVENUE_KPI_INVALID_STATE', 'Chỉ mở kỳ nháp.'); }
  if (resumed && p.status !== 'OPEN') return p;
  // OPEN is committed before draft generation; retries can resume explicit draft saves.
  const opened = resumed ? p : await update(Period, C.RevenueKpiPeriodSchema, p, { status: 'OPEN', openedBy: u.userId, openedAt: new Date().toISOString() }, u, 'OPEN_PERIOD', input);
  const cat = await catalog(u, period);
  for (const s of cat.stores.filter(s => s.smStatus === 'IDENTIFIED')) {
    const draftInput: any = { expectedVersion: 0, clientRequestId: input.clientRequestId, period, unitType: 'STORE', storeId: s.id, assigneeEmployeeId: s.smEmployeeIds[0], targetMode: 'GROWTH_PERCENT', reason: 'Sinh nháp theo mức tăng mặc định của kỳ.' };
    if (await Assignment.exists({ period, unitType: 'STORE', storeId: s.id })) continue;
    try { const a = await buildDraft(u, opened, draftInput, cat); independent(u, a); a.history = [event(u, null, a, 'AUTO_DRAFT', draftInput)]; await Assignment.create(dbRow(a)); }
    catch (e: any) { if (!(e instanceof WorkflowError && ['REVENUE_KPI_TARGET_INVALID', 'REVENUE_KPI_STORE_WITHOUT_SM', 'REVENUE_KPI_SELF_APPROVAL'].includes(e.code))) throw e; }
  }
  for (const c of cat.candidates.filter(c => c.role === 'AM')) {
    if (await Assignment.exists({ period, unitType: 'AREA', areaKey: 'am:' + c.employeeId })) continue;
    const draftInput: any = { expectedVersion: 0, clientRequestId: input.clientRequestId, period, unitType: 'AREA', assigneeEmployeeId: c.employeeId, targetMode: 'ABSOLUTE_VND', reason: 'Tổng mục tiêu các cửa hàng đã có bản nháp.' };
    try { const a = await buildDraft(u, opened, draftInput, cat); independent(u, a); a.history = [event(u, null, a, 'AUTO_DRAFT', draftInput)]; await Assignment.create(dbRow(a)); }
    catch (e: any) { if (!(e instanceof WorkflowError && ['REVENUE_KPI_TARGET_INVALID', 'REVENUE_KPI_STORE_WITHOUT_SM', 'REVENUE_KPI_SELF_APPROVAL'].includes(e.code))) throw e; }
  }
  return opened;
}); }

function retarget(a: C.RevenueKpiAssignment, input: any) {
  if (input.newTargetVnd === undefined && input.newGrowthPercent === undefined) fail('REVENUE_KPI_TARGET_INVALID', 'HR cần nhập mục tiêu hoặc mức tăng mới.');
  if (a.unitType === 'AREA' && input.newGrowthPercent !== undefined) fail('REVENUE_KPI_TARGET_INVALID', 'Điều chỉnh khu vực bằng tổng mục tiêu VND.');
  const total = input.newTargetVnd ?? targetFromGrowth(a.baseRevenueVnd, input.newGrowthPercent);
  const stores = a.stores.map((s, i) => ({ ...s, growthPercent: a.unitType === 'STORE' ? input.newGrowthPercent ?? null : null,
    targetVnd: i === a.stores.length - 1 ? 0 : Math.round(total * s.targetVnd / a.targetVnd) }));
  stores[stores.length - 1].targetVnd = total - stores.slice(0, -1).reduce((n, s) => n + s.targetVnd, 0);
  if (stores.some(s => s.targetVnd <= 0)) fail('REVENUE_KPI_TARGET_INVALID', 'Mục tiêu từng cửa hàng phải lớn hơn 0.');
  return { targetVnd: total, stores, targetMode: input.newGrowthPercent === undefined ? 'ABSOLUTE_VND' as const : 'GROWTH_PERCENT' as const, growthPercent: input.newGrowthPercent ?? null };
}
// AM's area KPI is the sum of the SM store KPIs. An area snapshot may never drift
// from the underlying STORE assignments: adjust store targets first and recreate
// the area KPI, instead of silently redistributing only the area copy.
async function assertAreaTargetDerived(a: C.RevenueKpiAssignment, input: any) {
  if (a.unitType !== 'AREA') return;
  const rows: any[] = await Assignment.find({ period: a.period, unitType: 'STORE', storeId: { $in: a.stores.map(s => String(s.storeId)) }, status: { $ne: 'CANCELLED' } }).lean();
  const byStore = new Map(rows.map(r => [String(r.storeId), Number(r.targetVnd)]));
  if (!a.stores.every(s => Number.isSafeInteger(byStore.get(String(s.storeId))) && (byStore.get(String(s.storeId)) as number) > 0))
    fail('REVENUE_KPI_TARGET_INVALID', 'Thiếu mục tiêu cửa hàng hợp lệ; hãy lưu lại mục tiêu từng cửa hàng trước.');
  if (a.stores.some(s => byStore.get(String(s.storeId)) !== s.targetVnd))
    fail('REVENUE_KPI_TARGET_INVALID', 'Mục tiêu khu vực đang lệch mục tiêu cửa hàng; hãy huỷ và tạo lại KPI khu vực sau khi điều chỉnh cửa hàng.');
  const sum = a.stores.reduce((n, s) => n + s.targetVnd, 0);
  if (input.newTargetVnd !== undefined && input.newTargetVnd !== sum)
    fail('REVENUE_KPI_TARGET_INVALID', 'Mục tiêu khu vực là tổng mục tiêu cửa hàng; hãy điều chỉnh từng cửa hàng trước.');
}
export async function mutateRevenueKpiAssignment(user: AuthenticatedUser, id: string, action: string, raw: unknown) {
  const schemas: Record<string, any> = { publish: C.RevenueKpiPublishSchema, accept: C.RevenueKpiAcceptSchema, refuse: C.RevenueKpiRefuseSchema, 'hr-decision': C.RevenueKpiHrDecisionSchema,
    'adjustment-request': C.RevenueKpiAdjustmentRequestSchema, 'adjustment-verify': C.RevenueKpiAdjustmentVerifySchema, 'adjustment-decision': C.RevenueKpiAdjustmentDecisionSchema, responsibility: C.RevenueKpiResponsibilityChangeSchema };
  if (!schemas[action]) fail('REVENUE_KPI_INVALID_STATE', 'Thao tác không hợp lệ.', 400); const input = schemas[action].parse(raw);
  return write(user, async u => {
    const a = await assignmentGet(id), p = await periodGet(a.period);
    if (['accept', 'refuse', 'adjustment-request'].includes(action)) own(u, a, action === 'adjustment-request' ? 'revenue_kpi.request_adjustment' : 'revenue_kpi.respond');
    else { forStores(u, action === 'adjustment-verify' ? 'revenue_kpi.verify_adjustment' : action === 'publish' || action === 'responsibility' ? 'revenue_kpi.assign' : 'revenue_kpi.approve', a.stores, action === 'hr-decision' && input.action === 'CANCEL'); independent(u, a); }
    if (replay(a, u, action, input)) return a; unlocked(p); version(a, input); const now = new Date(), iso = now.toISOString(); let patch: any = {};
    const state = (...states: string[]) => { if (!states.includes(a.status)) fail('REVENUE_KPI_INVALID_STATE', 'Trạng thái KPI không cho phép thao tác này.'); };
    const reset = { acceptance: null, deadlineAt: addWorkingDays(now, p.policy.acceptanceWindowWorkingDays).toISOString(), overdue: false };
    if (action === 'publish') { state('DRAFT'); const cat = await catalog(u, a.period); if (!cat.candidates.some(c => c.employeeId === a.assigneeEmployeeId && c.role === a.assigneeRole && a.stores.every(s => c.storeIds.includes(s.storeId)))) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Người nhận không còn hợp lệ.');
      if (a.unitType === 'AREA') { for (const s of a.stores) { const store: any = await Assignment.findOne({ period: a.period, unitType: 'STORE', storeId: s.storeId, status: { $ne: 'CANCELLED' } }).lean(); if (!store || aDto(store).targetVnd !== s.targetVnd) fail('REVENUE_KPI_TARGET_INVALID', 'Mục tiêu cửa hàng đã thay đổi; HR cần lưu lại nháp khu vực.'); } }
      patch = { status: 'PENDING_ACCEPTANCE', ...reset }; }
    if (action === 'accept') { state('PENDING_ACCEPTANCE'); patch = { status: 'ACTIVE', acceptance: { at: iso, by: u.userId, version: a.version }, overdue: false }; }
    if (action === 'refuse') { state('PENDING_ACCEPTANCE'); patch = { status: 'HR_REVIEW', refusal: { reason: input.reason, at: iso, by: u.userId } }; }
    if (action === 'hr-decision') {
      if (input.action === 'CANCEL') { state('DRAFT', 'PENDING_ACCEPTANCE', 'ACTIVE', 'HR_REVIEW', 'REFUSED', 'ADJUSTMENT_REQUESTED'); patch = { status: 'CANCELLED' }; }
      else { state('HR_REVIEW', 'REFUSED', 'PENDING_ACCEPTANCE'); if (input.action === 'KEEP') { if (!input.force && (!a.deadlineAt || a.deadlineAt >= iso)) fail('REVENUE_KPI_INVALID_STATE', 'Chưa hết hạn xác nhận; HR cần ghi nhận giữ nguyên có chủ đích.'); patch = { status: 'ACTIVE', overdue: false }; }
        else { await assertAreaTargetDerived(a, input); patch = { ...retarget(a, input), status: 'PENDING_ACCEPTANCE', ...reset }; } }
      patch.hrDecision = { action: input.action, reason: input.reason, at: iso, by: u.userId };
    }
    if (action === 'adjustment-request') { state('ACTIVE'); patch = { status: 'ADJUSTMENT_REQUESTED', adjustment: { requestedBy: u.userId, reason: input.reason, evidenceRef: input.evidenceRef, at: iso, status: 'PENDING', amNote: null, verifiedBy: null, verifiedAt: null, hrDecision: null } }; }
    if (action === 'adjustment-verify') { state('ADJUSTMENT_REQUESTED'); if (a.unitType !== 'STORE' || a.adjustment?.status !== 'PENDING' || a.adjustment.requestedBy === u.userId) fail('REVENUE_KPI_SELF_APPROVAL', 'Cần AM độc lập xác minh yêu cầu cửa hàng.'); patch = { adjustment: { ...a.adjustment, status: 'VERIFIED', amNote: input.reason, verifiedBy: u.userId, verifiedAt: iso } }; }
    if (action === 'adjustment-decision') { state('ADJUSTMENT_REQUESTED'); if (!a.adjustment || a.adjustment.requestedBy === u.userId) fail('REVENUE_KPI_SELF_APPROVAL', 'Cần HR độc lập quyết định.');
      if (input.action === 'APPROVE' && a.unitType === 'STORE' && a.adjustment!.status !== 'VERIFIED') fail('REVENUE_KPI_INVALID_STATE', 'Chờ AM xác minh trước khi duyệt điều chỉnh.');
      if (input.action === 'APPROVE') await assertAreaTargetDerived(a, input);
      patch = input.action === 'APPROVE' ? { ...retarget(a, input), status: 'PENDING_ACCEPTANCE', ...reset } : { status: 'ACTIVE' };
      patch.adjustment = { ...a.adjustment, status: input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', hrDecision: { action: input.action, reason: input.reason, at: iso, by: u.userId } };
    }
    if (action === 'responsibility') { state('ACTIVE', 'PENDING_ACCEPTANCE'); if (a.unitType !== 'STORE' || input.from > iso) fail('REVENUE_KPI_INVALID_STATE', 'Chỉ cập nhật người phụ trách cửa hàng từ thời điểm đã có căn cứ.');
      const cat = await catalog(u, a.period), c = cat.candidates.find(c => c.role === 'SM' && c.employeeId === input.assigneeEmployeeId && c.storeIds.includes(a.storeId!)); if (!c) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'SM mới chưa hợp lệ.');
      if (a.responsibility.some(r => r.to === null && r.from >= input.from)) fail('REVENUE_KPI_INVALID_STATE', 'Thời điểm mới phải sau thời điểm bắt đầu phụ trách.');
      patch = { assigneeEmployeeId: c.employeeId, assigneeName: c.name, responsibility: [...a.responsibility.map(r => r.to ? r : { ...r, to: input.from }), { employeeId: c.employeeId, employeeName: c.name, role: 'PRIMARY', from: input.from, to: null }], status: 'PENDING_ACCEPTANCE', ...reset };
    }
    return update(Assignment, C.RevenueKpiAssignmentSchema, a, patch, u, action, input);
  });
}

export async function computeRevenueKpiPeriod(user: AuthenticatedUser, period: string, raw: unknown) { const input = C.RevenueKpiComputeSchema.parse(raw); return write(user, async u => {
  const p = await periodGet(period); requirePeriodAuthority(u, 'revenue_kpi.close'); if (replay(p, u, 'COMPUTE_PERIOD', input)) return p; unlocked(p); version(p, input);
  const assignments = (await Assignment.find({ period, status: 'ACTIVE' }).lean()).map(aDto);
  for (const a of assignments) { forStores(u, 'revenue_kpi.close', a.stores, true); independent(u, a); }
  for (const a of assignments) {
    const prev = await latest(a.id); if (prev && (replay(prev, u, 'COMPUTE_RESULT', { ...input, expectedVersion: prev.version - 1 }) || prev.status === 'CONFIRMED')) continue;
    const calc = await calculateRevenueKpi(a, p.policy);
    const keepReason = prev && prev.actualRevenueVnd === calc.actualRevenueVnd && prev.targetVnd === a.targetVnd ? prev.missReason : null;
    await appendResult(a, prev, { ...calc, status: calc.pendingReasons.length ? 'PENDING_DATA' : calc.achieved === false && !keepReason ? 'AWAITING_REASON' : 'COMPUTED', missReason: keepReason }, u, 'COMPUTE_RESULT', { ...input, expectedVersion: prev?.version ?? 0 });
  }
  return update(Period, C.RevenueKpiPeriodSchema, p, {}, u, 'COMPUTE_PERIOD', input);
}); }
export async function mutateRevenueKpiResult(user: AuthenticatedUser, id: string, action: string, raw: unknown) {
  const schemas: Record<string, any> = { 'miss-reason': C.RevenueKpiMissReasonSchema, 'review-reason': C.RevenueKpiReviewReasonSchema, confirm: C.RevenueKpiConfirmSchema, correct: C.RevenueKpiCorrectSchema };
  if (!schemas[action]) fail('REVENUE_KPI_INVALID_STATE', 'Thao tác không hợp lệ.', 400); const input = schemas[action].parse(raw);
  return write(user, async u => {
    const requested = rDto(await Result.findById(id).lean()); if (!requested) fail('REVENUE_KPI_NOT_FOUND', 'Không tìm thấy kết quả.', 404);
    const a = await assignmentGet(requested.assignmentId), p = await periodGet(a.period), prev = (await latest(a.id))!;
    if (action === 'miss-reason') own(u, a, 'revenue_kpi.respond'); else { forStores(u, action === 'confirm' || action === 'correct' ? 'revenue_kpi.close' : 'revenue_kpi.approve', a.stores, true); independent(u, a); }
    if (replay(prev, u, action, input)) return prev;
    if (prev.id !== requested.id) fail('REVENUE_KPI_VERSION_CONFLICT', 'Kết quả đã có phiên bản mới.'); version(prev, input);
    if (action !== 'correct') { unlocked(p); if (prev.assignmentVersion !== a.version || a.status !== 'ACTIVE') fail('REVENUE_KPI_INVALID_STATE', 'Mục tiêu đã thay đổi; cần tính lại kết quả.'); }
    let patch: any = { ...prev }, iso = new Date().toISOString();
    if (action === 'miss-reason') { if (!['AWAITING_REASON', 'COMPUTED'].includes(prev.status) || prev.achieved !== false) fail('REVENUE_KPI_INVALID_STATE', 'Kết quả không cần giải trình.'); patch.status = 'COMPUTED'; patch.missReason = { text: input.text, by: u.userId, at: iso, reviewedBy: null, reviewedAt: null, reviewDecision: null, reviewNote: null }; }
    if (action === 'review-reason') { if (!prev.missReason || prev.status !== 'COMPUTED') fail('REVENUE_KPI_REASON_REQUIRED', 'Chưa có giải trình để xem xét.'); patch.missReason = { ...prev.missReason, reviewedBy: u.userId, reviewedAt: iso, reviewDecision: input.decision, reviewNote: input.note }; }
    if (action === 'confirm') {
      if (new Date() < periodRangeVN(a.period).end) fail('REVENUE_KPI_PERIOD_NOT_READY', 'Chưa hết tháng; kết quả hiện tại chỉ để theo dõi.');
      if (!['COMPUTED', 'AWAITING_REASON'].includes(prev.status) || prev.actualRevenueVnd === null) fail('REVENUE_KPI_DATA_PENDING', 'Cần kết quả đầy đủ trước khi xác nhận.');
      if (!prev.achieved && (!prev.missReason || prev.missReason.reviewDecision !== 'ACKNOWLEDGED') && !input.waiveReason) fail('REVENUE_KPI_REASON_REQUIRED', 'Cần giải trình đã được xem xét hoặc lý do HR miễn giải trình.');
      patch = { ...prev, status: 'CONFIRMED', confirmedBy: u.userId, confirmedAt: iso };
    }
    if (action === 'correct') {
      if (p.status !== 'CLOSED' || !['CONFIRMED', 'CORRECTED'].includes(prev.status)) fail('REVENUE_KPI_PERIOD_LOCKED', 'Chỉ tạo điều chỉnh sau chốt từ kết quả đã xác nhận.');
      const calc = await calculateRevenueKpi(a, p.policy); if (calc.pendingReasons.length) fail('REVENUE_KPI_DATA_PENDING', 'Dữ liệu điều chỉnh chưa đầy đủ.');
      patch = { ...prev, ...calc, status: 'CORRECTED', computedAt: iso, computedBy: u.userId, confirmedBy: u.userId, confirmedAt: iso };
    }
    return appendResult(a, prev, patch, u, action, input);
  });
}
export async function closeRevenueKpiPeriod(user: AuthenticatedUser, period: string, raw: unknown) { const input = C.RevenueKpiCommandSchema.parse(raw); return write(user, async u => {
  const p = await periodGet(period); requirePeriodAuthority(u, 'revenue_kpi.close'); if (replay(p, u, 'CLOSE_PERIOD', input)) return p; unlocked(p); version(p, input);
  if (new Date() < periodRangeVN(period).end) fail('REVENUE_KPI_PERIOD_NOT_READY', 'Chưa hết tháng để chốt kỳ.');
  const rows = (await Assignment.find({ period, status: { $ne: 'CANCELLED' } }).lean()).map(aDto); if (!rows.length) fail('REVENUE_KPI_PERIOD_NOT_READY', 'Kỳ chưa có KPI để chốt.');
  for (const a of rows) { forStores(u, 'revenue_kpi.close', a.stores, true); independent(u, a); const r = await latest(a.id);
    if (!['ACTIVE', 'CLOSED'].includes(a.status) || !r || r.status !== 'CONFIRMED' || a.status !== 'CLOSED' && r.assignmentVersion !== a.version) fail('REVENUE_KPI_PERIOD_NOT_READY', 'Còn KPI chưa xác nhận hoặc thiếu dữ liệu.'); }
  for (const a of rows.filter(a => a.status !== 'CLOSED')) await update(Assignment, C.RevenueKpiAssignmentSchema, a, { status: 'CLOSED' }, u, 'CLOSE_ASSIGNMENT', { ...input, expectedVersion: a.version });
  return update(Period, C.RevenueKpiPeriodSchema, p, { status: 'CLOSED', closedBy: u.userId, closedAt: new Date().toISOString() }, u, 'CLOSE_PERIOD', input);
}); }
export async function revenueKpiDashboard(user: AuthenticatedUser, period: string) {
  const u = await fresh(user), p = await periodGet(period);
  if (!hasCapability(u, 'revenue_kpi.read_scope')) requireCapability(u, 'revenue_kpi.read_self', { userId: u.userId, employeeId: u.employeeId });
  const all = (await Assignment.find({ period }).limit(1001).lean()).map(aDto); if (all.length > 1000) fail('REVENUE_KPI_DATA_PENDING', 'Quá nhiều KPI để tổng hợp.');
  const assignments = all.filter(a => canRead(u, a)), results = [];
  for (const a of assignments) { const r = await latest(a.id); if (r) results.push(r); }
  const cat = hasCapability(u, 'revenue_kpi.assign') ? await catalog(u, period) : { stores: [], candidates: [] };
  const flags = cat.stores.filter(s => s.smStatus !== 'IDENTIFIED').map(s => `${s.name}: ${s.smStatus === 'MISSING' ? 'Chưa có SM hợp lệ' : 'HR cần chọn SM phụ trách'}`);
  return C.RevenueKpiDashboardSchema.parse({ period: p, assignments, results, ...cat, flags, generatedAt: new Date().toISOString() });
}
export async function revenueKpiAssignmentResult(user: AuthenticatedUser, id: string) { const u = await fresh(user), a = await assignmentGet(id); if (!canRead(u, a)) fail('RBAC_DENIED', 'Không có quyền xem KPI này.', 403); return { assignment: a, result: await latest(id) }; }

// AI proposal stores metadata only. Long network I/O happens outside the writer;
// authority and version are revalidated before persisting a proposal.
export async function revenueKpiAiContext(user: AuthenticatedUser, id: string) { const u = await fresh(user), a = await assignmentGet(id), p = await periodGet(a.period); forStores(u, 'revenue_kpi.assign', a.stores); independent(u, a); unlocked(p); if (a.unitType !== 'STORE' || a.status !== 'DRAFT' || !p.policy.aiProposalEnabled) fail('REVENUE_KPI_INVALID_STATE', 'Chỉ đề xuất cho bản nháp cửa hàng được bật AI.'); return { a, p }; }
export async function storeRevenueKpiProposal(user: AuthenticatedUser, id: string, raw: unknown, proposal: unknown) { const input = C.RevenueKpiAiProposalRequestSchema.parse(raw); return write(user, async u => { const { a } = await revenueKpiAiContext(u, id); if (replay(a, u, 'AI_PROPOSAL', input)) return a; return update(Assignment, C.RevenueKpiAssignmentSchema, a, { aiProposal: C.RevenueKpiAiProposalSchema.parse(proposal) }, u, 'AI_PROPOSAL', input); }); }
