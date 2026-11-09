import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
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
async function fresh(user: AuthenticatedUser, provision = true) {
  if (!revenueKpiEnabled()) fail('REVENUE_KPI_DISABLED', 'KPI doanh thu chưa được bật.', 503);
  const u = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
  if (!['hr', 'am', 'sm'].includes(u.authorization?.profile ?? '')) fail('RBAC_DENIED', 'Bạn chưa có quyền KPI doanh thu.', 403);
  if (provision) await ensureRevenueKpiStorage();
  return u;
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
  try {
    const r: any = result;
    const aid = r?.assignmentId ?? (r?.unitType ? r.id : undefined);
    const period = !aid && typeof r?.period === 'string' ? r.period : undefined;
    await flushRevenueKpiNotices(aid, period);
  } catch { console.error('[RevenueKpi] notice delivery deferred'); }
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
export interface RevenueKpiAssignmentCandidate {
  employeeId: string;
  name: string;
  role: 'SM' | 'AM';
  storeIds: string[];
}

export async function resolveRevenueKpiAssignmentCandidate(user: AuthenticatedUser, period: string,
  unitType: 'STORE' | 'AREA', storeIds: string[], explicitAssignee?: string | null): Promise<RevenueKpiAssignmentCandidate> {
  const u = await fresh(user, false);
  const month = C.RevenueKpiMonthSchema.parse(period);
  const requestedStores = z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(500).parse(storeIds).map(id => id.toLowerCase()).sort();
  if (new Set(requestedStores).size !== requestedStores.length || (unitType === 'STORE' && requestedStores.length !== 1))
    fail('REVENUE_KPI_TARGET_INVALID', 'Phạm vi cửa hàng giao KPI không hợp lệ.', 400);
  const selectedId = explicitAssignee?.toLowerCase();
  const cat = await catalog(u, month);
  if (requestedStores.some(id => !cat.stores.some(store => store.id === id)))
    fail('REVENUE_KPI_STORE_NOT_IN_SCOPE', 'Cửa hàng không thuộc phạm vi được cấp.', 403);

  if (unitType === 'STORE') {
    const storeId = requestedStores[0];
    const store = cat.stores.find(item => item.id === storeId)!;
    if (!store.smEmployeeIds.length) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Cửa hàng chưa có SM đủ điều kiện.');
    const eligible = cat.candidates.filter(candidate => candidate.role === 'SM'
      && store.smEmployeeIds.includes(candidate.employeeId) && candidate.storeIds.includes(storeId));
    const ids = [...new Set(eligible.map(candidate => candidate.employeeId))];
    const selected = selectedId ? eligible.find(candidate => candidate.employeeId === selectedId)
      : ids.length === 1 ? eligible.find(candidate => candidate.employeeId === ids[0]) : undefined;
    if (!selected && !selectedId && ids.length > 1)
      fail('REVENUE_KPI_SM_AMBIGUOUS', 'Cần xác nhận SM phụ trách cửa hàng.');
    if (!selected) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'SM được chọn chưa hợp lệ trong danh mục kỳ này.');
    return selected;
  }

  const eligible = cat.candidates.filter(candidate => candidate.role === 'AM'
    && candidate.storeIds.length === requestedStores.length
    && candidate.storeIds.every((id: string) => requestedStores.includes(id)));
  const ids = [...new Set(eligible.map(candidate => candidate.employeeId))];
  const selected = selectedId ? eligible.find(candidate => candidate.employeeId === selectedId)
    : ids.length === 1 ? eligible.find(candidate => candidate.employeeId === ids[0]) : undefined;
  if (!selected) fail('REVENUE_KPI_TARGET_INVALID', 'KPI khu vực cần khớp toàn bộ phạm vi cửa hàng của AM đủ điều kiện.');
  return selected;
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

async function buildDraft(u: AuthenticatedUser, p: C.RevenueKpiPeriod, input: z.infer<typeof C.RevenueKpiDraftAssignmentSchema>, options?: Awaited<ReturnType<typeof catalog>>, plannedStores?: ReadonlyMap<string, C.RevenueKpiAssignment>) {
  const cat = options ?? await catalog(u, p.period), candidate = cat.candidates.find(c => c.employeeId === input.assigneeEmployeeId && c.role === (input.unitType === 'STORE' ? 'SM' : 'AM'));
  if (!candidate) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Người phụ trách chưa đủ điều kiện nhận KPI.');
  const ids = input.unitType === 'STORE' ? [input.storeId!] : [...candidate.storeIds].sort();
  if (input.unitType === 'AREA' && input.storeIds && digest([...input.storeIds].sort()) !== digest([...ids].sort())) fail('REVENUE_KPI_TARGET_INVALID', 'KPI khu vực phải gồm toàn bộ cửa hàng trong phạm vi đã xác minh.');
  forStores(u, 'revenue_kpi.assign', ids.map((storeId: string) => ({ storeId })));
  if (input.unitType === 'STORE' && !candidate.storeIds.includes(ids[0])) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'SM chưa thuộc cửa hàng này.');
  const previous = input.id ? await assignmentGet(input.id) : null, now = new Date().toISOString();
  const stores = [];
  for (const id of ids) {
    const store = cat.stores.find(s => s.id === id)!;
    if (!store.smEmployeeIds.length) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Cửa hàng chưa có SM; chưa thể giao KPI.');
    if (input.unitType === 'STORE' && !store.smEmployeeIds.includes(candidate.employeeId)) fail('REVENUE_KPI_STORE_WITHOUT_SM', 'HR cần chọn SM hợp lệ trong sổ hoặc danh sách nhân sự cửa hàng.');
    if (input.unitType === 'AREA') {
      const parent = plannedStores?.get(id) ?? aDto(await Assignment.findOne({ period: p.period, unitType: 'STORE', storeId: id, status: { $ne: 'CANCELLED' } }).lean());
      if (!parent || parent.stores.length !== 1 || parent.stores[0].storeId !== id || parent.stores[0].targetVnd !== parent.targetVnd)
        throw new WorkflowError(409, 'REVENUE_KPI_TARGET_INVALID', 'Cần giao mục tiêu hợp lệ cho từng cửa hàng trước khi tạo KPI khu vực.');
      stores.push(parent.stores[0]); continue;
    }
    const rawBase = await computeStoreRevenue(id, priorMonth(p.period), p.policy);
    const base = rawBase.actualRevenueVnd === null && previous && !p.policy.allowDemoData
      ? await computeStoreRevenue(id, priorMonth(p.period), { allowDemoData: true })
      : rawBase;
    const growth = input.targetMode === 'GROWTH_PERCENT' ? input.growthPercent ?? p.policy.defaultGrowthPercent : null;
    const effectiveBaseVnd = base.actualRevenueVnd ?? (previous ? previous.baseRevenueVnd ?? previous.targetVnd : null);
    const targetVnd = growth === null ? input.targetVnd : targetFromGrowth(effectiveBaseVnd, growth);
    if (!Number.isSafeInteger(targetVnd) || !targetVnd || targetVnd <= 0) fail('REVENUE_KPI_TARGET_INVALID', 'Nhập mục tiêu VND nguyên lớn hơn 0.');
    stores.push({ storeId: id, storeName: store.name, baseRevenueVnd: base.actualRevenueVnd ?? (growth !== null ? effectiveBaseVnd : null), growthPercent: growth, targetVnd: targetVnd! });
  }
  const total = stores.reduce((n, s) => n + s.targetVnd, 0);
  if (!Number.isSafeInteger(total)) fail('REVENUE_KPI_TARGET_INVALID', 'Tổng mục tiêu vượt giới hạn hợp lệ.');
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
export async function saveRevenueKpiAssignment(user: AuthenticatedUser, raw: unknown, expectedApprovedTargetVnd?: number | null) { const input = C.RevenueKpiDraftAssignmentSchema.parse(raw); return write(user, async u => {
  const p = await periodGet(input.period); unlocked(p); const prev = input.id ? await assignmentGet(input.id) : null;
  if (prev) {
    forStores(u, 'revenue_kpi.assign', prev.stores); independent(u, prev);
    if (replay(prev, u, 'SAVE_DRAFT', input)) {
      if (expectedApprovedTargetVnd !== undefined && expectedApprovedTargetVnd !== null && prev.targetVnd !== expectedApprovedTargetVnd) {
        fail('REVENUE_KPI_PLAN_CHANGED', 'Mục tiêu được duyệt không khớp với số liệu bản ghi trước đó. Hãy lập bản xem trước mới.', 409);
      }
      return prev;
    }
    if (prev.status !== 'DRAFT' || prev.period !== input.period || prev.unitType !== input.unitType || prev.unitType === 'STORE' && prev.storeId !== input.storeId) fail('REVENUE_KPI_INVALID_STATE', 'Chỉ sửa mục tiêu bản nháp cùng đơn vị.');
    version(prev, input);
  } else if (input.expectedVersion !== 0) fail('REVENUE_KPI_VERSION_CONFLICT', 'Phiên bản không hợp lệ.');
  const draft = await buildDraft(u, p, input); independent(u, draft);
  if (expectedApprovedTargetVnd !== undefined && expectedApprovedTargetVnd !== null && draft.targetVnd !== expectedApprovedTargetVnd) {
    fail('REVENUE_KPI_PLAN_CHANGED', 'Mục tiêu doanh thu tính toán không khớp với mục tiêu đã được duyệt. Hãy lập bản xem trước mới.', 409);
  }
  if (prev) return update(Assignment, C.RevenueKpiAssignmentSchema, prev, { ...draft, id: prev.id }, u, 'SAVE_DRAFT', input);
  // Imported KPI records can use a different ID for the same unit and month.
  const identity = assignmentIdentity(p.period, draft);
  let exists = await Assignment.findOne(identity).lean();
  if (!exists) {
    const created = { ...draft, history: [event(u, null, draft, 'SAVE_DRAFT', input)] };
    try {
      return aDto(await Assignment.create(dbRow(C.RevenueKpiAssignmentSchema.parse(created))));
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      exists = await Assignment.findOne(identity).lean();
      if (!exists) throw error;
    }
  }
  const a = aDto(exists);
  if (!replay(a, u, 'SAVE_DRAFT', input)) {
    fail('REVENUE_KPI_VERSION_CONFLICT', 'Đơn vị đã có KPI trong kỳ này. Hãy mở KPI hiện có để xử lý.');
  }
  if (expectedApprovedTargetVnd !== undefined && expectedApprovedTargetVnd !== null && a.targetVnd !== expectedApprovedTargetVnd) {
    fail('REVENUE_KPI_PLAN_CHANGED', 'Mục tiêu được duyệt không khớp với số liệu bản ghi trước đó. Hãy lập bản xem trước mới.', 409);
  }
  return a;
}); }
type PlannedOpenItem = { item: C.RevenueKpiOpenItem; draft?: C.RevenueKpiAssignment };
const knownOpenBlocks: Record<string, string> = {
  REVENUE_KPI_STORE_WITHOUT_SM: 'Kiểm tra bổ nhiệm SM, hoặc chọn người phụ trách trong bản nháp thủ công.',
  REVENUE_KPI_SM_AMBIGUOUS: 'Xác nhận một SM trong danh mục hoặc tạo bản nháp thủ công.',
  REVENUE_KPI_TARGET_INVALID: 'Kiểm tra doanh thu kỳ gốc và mục tiêu từng cửa hàng. Có thể nhập mục tiêu VND trực tiếp.',
  REVENUE_KPI_SELF_APPROVAL: 'Nhờ HR độc lập thực hiện.',
  REVENUE_KPI_STORE_NOT_IN_SCOPE: 'Kiểm tra quyền trên các cửa hàng trong kỳ.',
  REVENUE_KPI_ASSIGNMENT_CANCELLED: 'Kiểm tra KPI đã hủy của đơn vị trước khi tiếp tục.',
};
function assignmentIdentity(period: string, item: Pick<C.RevenueKpiOpenItem, 'unitType' | 'storeId' | 'areaKey'>) {
  return item.unitType === 'STORE'
    ? { period, unitType: 'STORE', storeId: item.storeId }
    : { period, unitType: 'AREA', areaKey: item.areaKey };
}
function draftBasis(a: C.RevenueKpiAssignment) {
  return {
    id: a.id, unitType: a.unitType, storeId: a.storeId, areaKey: a.areaKey,
    assigneeEmployeeId: a.assigneeEmployeeId, assigneeName: a.assigneeName,
    targetMode: a.targetMode, growthPercent: a.growthPercent, targetVnd: a.targetVnd, stores: a.stores,
  };
}
function blockedItem(item: C.RevenueKpiOpenItem, error: unknown): PlannedOpenItem {
  if (!(error instanceof WorkflowError) || !Object.hasOwn(knownOpenBlocks, error.code)) throw error;
  return { item: { ...item, status: 'BLOCKED', code: error.code, message: error.message,
    retryable: error.code !== 'REVENUE_KPI_ASSIGNMENT_CANCELLED', fixHint: knownOpenBlocks[error.code] } };
}
async function buildOpenPlan(u: AuthenticatedUser, p: C.RevenueKpiPeriod) {
  capStores(u, 'revenue_kpi.assign');
  if (p.status !== 'DRAFT' && p.status !== 'OPEN') fail('REVENUE_KPI_INVALID_STATE', 'Kỳ đã chốt hoặc lưu trữ.');
  const cat = await catalog(u, p.period);
  const rows: PlannedOpenItem[] = [];
  const availableStores = new Map<string, C.RevenueKpiAssignment>();
  const existingBasis: unknown[] = [];
  const stores = [...cat.stores].sort((a, b) => a.id.localeCompare(b.id));
  const units = [
    ...stores.map(store => ({ store, candidate: cat.candidates.find(c => c.role === 'SM' && store.smStatus === 'IDENTIFIED' && c.employeeId === store.smEmployeeIds[0]) })),
    ...cat.candidates.filter(c => c.role === 'AM').map(candidate => ({ store: undefined, candidate })),
  ];
  for (const { store, candidate } of units) {
    const item: C.RevenueKpiOpenItem = {
      unitType: store ? 'STORE' : 'AREA', storeId: store?.id ?? null,
      areaKey: store ? null : 'am:' + candidate.employeeId,
      storeIds: store ? [store.id] : [...candidate.storeIds].sort(),
      label: store?.name ?? 'Khu vực của ' + candidate.name,
      assigneeEmployeeId: candidate?.employeeId ?? null, assigneeName: candidate?.name ?? null,
      assigneeRole: store ? 'SM' : 'AM', assignmentId: null, targetMode: null,
      growthPercent: null, targetVnd: null, status: 'CREATE',
      code: null, message: null, retryable: false, fixHint: null,
    };
    try {
      const found = aDto(await Assignment.findOne(assignmentIdentity(p.period, item)).lean());
      if (found) {
        forStores(u, 'revenue_kpi.assign', found.stores);
        existingBasis.push({ basis: draftBasis(found), status: found.status, version: found.version });
        item.assignmentId = found.id;
        if (found.status === 'CANCELLED') fail('REVENUE_KPI_ASSIGNMENT_CANCELLED', 'Đơn vị đã có KPI bị hủy trong kỳ.');
        if (store) availableStores.set(store.id, found);
        rows.push({ item: { ...item, status: 'SKIP_ALREADY_EXISTS', assigneeEmployeeId: found.assigneeEmployeeId,
          assigneeName: found.assigneeName, targetMode: found.targetMode, growthPercent: found.growthPercent, targetVnd: found.targetVnd } });
        continue;
      }
      if (!candidate) {
        if (store?.smStatus === 'AMBIGUOUS') fail('REVENUE_KPI_SM_AMBIGUOUS', 'Cần xác nhận SM phụ trách cửa hàng.');
        fail('REVENUE_KPI_STORE_WITHOUT_SM', 'Chưa có SM đủ điều kiện.');
      }
      const draftInput = C.RevenueKpiDraftAssignmentSchema.parse({
        expectedVersion: 0, clientRequestId: randomUUID(), period: p.period,
        unitType: item.unitType, ...(store ? { storeId: store.id } : {}),
        assigneeEmployeeId: candidate.employeeId, targetMode: store ? 'GROWTH_PERCENT' : 'ABSOLUTE_VND',
        reason: 'Lập bản nháp khi mở kỳ KPI doanh thu.',
      });
      const draft = await buildDraft(u, p, draftInput, cat, availableStores);
      independent(u, draft);
      if (store) availableStores.set(store.id, draft);
      rows.push({ item: { ...item, assignmentId: draft.id, targetMode: draft.targetMode,
        growthPercent: draft.growthPercent, targetVnd: draft.targetVnd }, draft });
    } catch (error) {
      rows.push(blockedItem(item, error));
    }
  }
  const items = rows.map(row => row.item);
  const create = rows.filter(row => row.draft).length;
  const blocked = items.filter(item => item.status === 'BLOCKED').length;
  const planDigest = digest({
    id: p.id, version: p.version, status: p.status, policy: p.policy, items, existingBasis,
    catalog: { stores: stores.map(s => ({ ...s, smEmployeeIds: [...s.smEmployeeIds].sort() })),
      candidates: cat.candidates.map(c => ({ ...c, storeIds: [...c.storeIds].sort() })) },
    drafts: rows.flatMap(row => row.draft ? [draftBasis(row.draft)] : []),
  });
  const preview = C.RevenueKpiOpenPreviewSchema.parse({
    periodId: p.id, period: p.period, version: p.version, status: p.status,
    planDigest, generatedAt: new Date().toISOString(),
    summary: { create, skipped: items.length - create - blocked, blocked, total: items.length },
    items, executed: false,
  });
  return { preview, rows };
}

export async function planRevenueKpiPeriodOpen(user: AuthenticatedUser, period: string) {
  const u = await fresh(user, false);
  capStores(u, 'revenue_kpi.assign');
  return (await buildOpenPlan(u, await periodGet(period))).preview;
}

type OpenCommand = z.infer<typeof C.RevenueKpiCommandSchema>;
type OpenPlan = Awaited<ReturnType<typeof buildOpenPlan>>;
type Decision = z.infer<typeof C.RevenueKpiOpenDecisionSchema>;

// Recovery replays the approved plan instead of re-deriving it: targets are pinned
// to the preview so a drifted revenue source or catalog can never leak into the
// missing writes.
// The action id makes the recovery command deterministic: every retry of a
// crashed recovery produces the same payloadHash, so provenance checks accept
// writes from the original decision and from any number of prior recoveries.
function recoveryCommand(row: OpenActionRow, approve: Extract<Decision, { approve: true }>): Extract<Decision, { approve: true }> {
  return { approve: true, expectedVersion: approve.expectedVersion, clientRequestId: row._id, planDigest: approve.planDigest };
}

async function virtualDraft(u: AuthenticatedUser, p: C.RevenueKpiPeriod, item: C.RevenueKpiOpenItem,
  cat: Awaited<ReturnType<typeof catalog>>, plannedStores: ReadonlyMap<string, C.RevenueKpiAssignment>) {
  if (item.targetVnd === null || !item.assigneeEmployeeId || !item.targetMode) fail('REVENUE_KPI_PLAN_CHANGED', 'Bản xem trước không đủ dữ liệu để tái lập kế hoạch.');
  const input = C.RevenueKpiDraftAssignmentSchema.parse({
    expectedVersion: 0, clientRequestId: randomUUID(), period: p.period, unitType: item.unitType,
    ...(item.unitType === 'STORE' ? { storeId: item.storeId } : { storeIds: item.storeIds }),
    assigneeEmployeeId: item.assigneeEmployeeId, targetMode: item.targetMode,
    ...(item.unitType === 'STORE' && item.targetMode === 'GROWTH_PERCENT' ? { growthPercent: item.growthPercent } : { targetVnd: item.targetVnd }),
    reason: 'Lập bản nháp khi mở kỳ KPI doanh thu.',
  });
  const draft = await buildDraft(u, p, input, cat, plannedStores);
  if (item.unitType === 'STORE' && item.targetVnd !== null) {
    if (item.growthPercent !== null) draft.stores[0].growthPercent = item.growthPercent;
    draft.stores[0].targetVnd = item.targetVnd;
    draft.targetVnd = item.targetVnd;
    draft.growthPercent = item.growthPercent ?? draft.growthPercent;
  } else if (draft.targetVnd !== item.targetVnd)
    fail('REVENUE_KPI_TARGET_INVALID', 'Mục tiêu khu vực không khớp bản xem trước đã duyệt.');
  return draft;
}

async function replayOpenPlan(u: AuthenticatedUser, p: C.RevenueKpiPeriod, row: OpenActionRow,
  command: Extract<Decision, { approve: true }>): Promise<OpenPlan> {
  const preview = row.preview;
  const hashes = [row.decisionHash!, digest(recoveryCommand(row, command))];
  // A 409 must carry a fresh preview, not the stale approved one. Re-deriving is
  // safe here because nothing is written: infrastructure failures inside it still
  // propagate with their real cause.
  if (preview.status === 'DRAFT') {
    if (p.status === 'OPEN') {
      const opened = p.history.find(h => h.action === 'OPEN_PERIOD' && h.by === row.ownerId && hashes.includes(h.payloadHash));
      if (!opened || p.version !== preview.version + 1) throw new RevenueKpiPlanChangedError((await buildOpenPlan(u, p)).preview);
    } else if (p.status !== 'DRAFT' || p.version !== preview.version) throw new RevenueKpiPlanChangedError((await buildOpenPlan(u, p)).preview);
  } else if (p.status !== 'OPEN' || p.version !== preview.version) throw new RevenueKpiPlanChangedError((await buildOpenPlan(u, p)).preview);
  try {
    const cat = await catalog(u, p.period);
    const rows: PlannedOpenItem[] = [];
    const existingBasis: unknown[] = [];
    const availableStores = new Map<string, C.RevenueKpiAssignment>();
    for (const item of preview.items) {
      if (item.status === 'BLOCKED') { rows.push({ item }); continue; }
      const found = item.status === 'SKIP_ALREADY_EXISTS' && item.assignmentId
        ? aDto(await Assignment.findById(item.assignmentId).lean()) ?? aDto(await Assignment.findOne(assignmentIdentity(p.period, item)).lean())
        : aDto(await Assignment.findOne(assignmentIdentity(p.period, item)).lean());
      if (item.status === 'SKIP_ALREADY_EXISTS') {
        if (!found || found.status === 'CANCELLED') fail('REVENUE_KPI_ASSIGNMENT_CANCELLED', 'Đơn vị đã có KPI bị hủy trong kỳ.');
        forStores(u, 'revenue_kpi.assign', found.stores);
        existingBasis.push({ basis: draftBasis(found), status: found.status, version: found.version });
        if (item.storeId) availableStores.set(item.storeId, found);
        rows.push({ item });
        continue;
      }
      const draft = await virtualDraft(u, p, item, cat, availableStores);
      if (found) {
        const entry = found.history.find(h => h.action === 'AUTO_DRAFT' && h.by === row.ownerId && hashes.includes(h.payloadHash));
        if (!entry || found.status !== 'DRAFT' || digest(draftBasis(found)) !== digest(draftBasis(draft)))
          throw new RevenueKpiPlanChangedError((await buildOpenPlan(u, p)).preview);
      }
      if (item.storeId) availableStores.set(item.storeId, found ?? draft);
      rows.push({ item: found ? { ...item, assignmentId: found.id } : item, draft });
    }
    const planDigest = digest({
      id: p.id, version: preview.version, status: preview.status, policy: p.policy,
      items: rows.map(r => r.item), existingBasis,
      catalog: { stores: [...cat.stores].sort((a, b) => a.id.localeCompare(b.id)).map(s => ({ ...s, smEmployeeIds: [...s.smEmployeeIds].sort() })),
        candidates: cat.candidates.map(c => ({ ...c, storeIds: [...c.storeIds].sort() })) },
      drafts: rows.flatMap(r => r.draft ? [draftBasis(r.draft)] : []),
    });
    if (planDigest !== preview.planDigest) throw new RevenueKpiPlanChangedError((await buildOpenPlan(u, p)).preview);
    return { preview, rows };
  } catch (error) {
    if (error instanceof RevenueKpiPlanChangedError) throw error;
    // Only genuine drift (auth-scope or state mismatches surfaced as WorkflowError)
    // becomes a plan-changed conflict. Storage/schema failures keep their cause so
    // recovery never masks an infrastructure problem as stale-plan.
    if (error instanceof WorkflowError) throw new RevenueKpiPlanChangedError((await buildOpenPlan(u, p)).preview);
    throw error;
  }
}


async function executeOpenPlan(u: AuthenticatedUser, p: C.RevenueKpiPeriod, plan: OpenPlan, input: OpenCommand) {
  const period = p.status === 'DRAFT'
    ? await update(Period, C.RevenueKpiPeriodSchema, p, { status: 'OPEN', openedBy: u.userId, openedAt: new Date().toISOString() }, u, 'OPEN_PERIOD', input)
    : p;
  type Outcome = C.RevenueKpiOpenResult['created'][number];
  const created: Outcome[] = [], skipped: Outcome[] = [], blocked: Outcome[] = [], failed: Outcome[] = [];
  const unavailableStores = new Set<string>();
  for (const { item, draft } of plan.rows) {
    if (item.status === 'BLOCKED') { blocked.push({ ...item, status: 'BLOCKED' }); continue; }
    if (!draft) { skipped.push({ ...item, status: 'SKIPPED' }); continue; }
    try {
      if (item.unitType === 'AREA' && item.storeIds.some(id => unavailableStores.has(id)))
        fail('REVENUE_KPI_TARGET_INVALID', 'Chưa lưu được mục tiêu cửa hàng trong kế hoạch này.');
      await assertAreaTargetDerived(draft, {});
      const row = { ...draft, history: [event(u, null, draft, 'AUTO_DRAFT', input)] };
      await Assignment.create(dbRow(row));
      created.push({ ...item, status: 'CREATED' });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const current = aDto(await Assignment.findOne(assignmentIdentity(p.period, item)).lean());
        if (current?.status === 'DRAFT' && digest(draftBasis(current)) === digest(draftBasis(draft))) {
          skipped.push({ ...item, assignmentId: current.id, status: 'SKIPPED' });
          continue;
        }
        if (item.storeId) unavailableStores.add(item.storeId);
        failed.push({ ...item, status: 'FAILED', code: 'REVENUE_KPI_ASSIGNMENT_CONFLICT',
          message: 'Đơn vị đã có bản ghi khác với kế hoạch.', retryable: true, fixHint: 'Xem lại KPI hiện có và lập bản xem trước mới.' });
        continue;
      }
      if (item.storeId) unavailableStores.add(item.storeId);
      if (error instanceof WorkflowError && Object.hasOwn(knownOpenBlocks, error.code)) {
        blocked.push({ ...blockedItem(item, error).item, status: 'BLOCKED' });
        continue;
      }
      console.error('[RevenueKpi] open-period item failed', { period: p.period, assignmentId: draft.id, errorType: error instanceof Error ? error.name : 'unknown' });
      failed.push({ ...item, status: 'FAILED', code: 'REVENUE_KPI_DRAFT_WRITE_FAILED',
        message: 'Chưa lưu được bản nháp.', retryable: true, fixHint: 'Tải lại kế hoạch và thử lại.' });
    }
  }
  return C.RevenueKpiOpenResultSchema.parse({
    period, executed: true, outcome: blocked.length || failed.length ? (created.length || skipped.length ? 'PARTIAL' : 'NONE') : 'FULL',
    created, skipped, blocked, failed,
    summary: { created: created.length, skipped: skipped.length, blocked: blocked.length, failed: failed.length, total: plan.rows.length },
  });
}

// Compatibility for integrations that explicitly open a period with a versioned
// command. Both first-party interfaces use the proposal flow below.
export async function openRevenueKpiPeriod(user: AuthenticatedUser, period: string, raw: unknown) {
  const input = C.RevenueKpiCommandSchema.parse(raw);
  return write(user, async u => {
    capStores(u, 'revenue_kpi.assign');
    const p = await periodGet(period);
    const resumed = replay(p, u, 'OPEN_PERIOD', input);
    if (!resumed) { version(p, input); if (p.status !== 'DRAFT') fail('REVENUE_KPI_INVALID_STATE', 'Chỉ mở kỳ nháp.'); }
    // A replay only proves the period transition happened, not that every draft
    // was written. Rebuilding the plan skips existing rows and finishes the rest.
    return (await executeOpenPlan(u, p, await buildOpenPlan(u, p), input)).period;
  });
}

type OpenActionRow = {
  _id: string;
  ownerId: string;
  securityVersion: number;
  authorityHash: string;
  preview: C.RevenueKpiOpenPreview;
  status: C.RevenueKpiOpenAction['status'];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  decisionHash?: string;
  result?: C.RevenueKpiOpenResult;
  leaseUntil?: string;
  purgeAt?: Date;
  type?: 'revenue_kpi.open_period' | 'revenue_kpi.mutate_assignment';
};
const openActions = () => mongoose.connection.collection<OpenActionRow>('revenue_kpi_open_actions');
const assignmentActions = () => mongoose.connection.collection<AssignmentActionRow>('revenue_kpi_open_actions');
function openAuthority(u: AuthenticatedUser) {
  return digest({ authorization: u.authorization, employeeId: u.employeeId, delegations: u.effectiveDelegations ?? [],
    stores: capStores(u, 'revenue_kpi.assign').sort() });
}
// Assignment proposals are confirmed by assignees who hold only respond-scope
// capabilities, so the authority hash must not derive from `revenue_kpi.assign`.
function chatActionAuthority(u: AuthenticatedUser) {
  return digest({ authorization: u.authorization, employeeId: u.employeeId, delegations: u.effectiveDelegations ?? [] });
}
function actionDto(row: OpenActionRow) {
  const status = row.status === 'PENDING' && row.expiresAt <= new Date().toISOString() ? 'EXPIRED' : row.status;
  return C.RevenueKpiOpenActionSchema.parse({
    actionId: row._id, type: 'revenue_kpi.open_period', status, expiresAt: row.expiresAt,
    requiresConfirmation: status === 'PENDING', executed: !!row.result, preview: row.preview, result: row.result ?? null,
  });
}
async function loadOpenAction(u: AuthenticatedUser, id: string) {
  const row = await openActions().findOne({ _id: C.RevenueKpiOpenActionIdSchema.parse(id), ownerId: u.userId });
  // Legacy P0 open-period rows have no `type`; other persisted types use their own loaders.
  if (!row || (row.type !== undefined && row.type !== 'revenue_kpi.open_period'))
    fail('REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.', 404);
  const action = row!;
  if (action.securityVersion !== u.securityVersion || action.authorityHash !== openAuthority(u))
    fail('REVENUE_KPI_AUTHORITY_CHANGED', 'Quyền đã thay đổi. Hãy lập bản xem trước mới.', 403);
  return action;
}
export async function proposeRevenueKpiPeriodOpen(user: AuthenticatedUser, period: string, id: string = randomUUID()) {
  C.RevenueKpiOpenActionIdSchema.parse(id);
  const u = await fresh(user, false);
  const authorityHash = openAuthority(u);
  const preview = (await buildOpenPlan(u, await periodGet(period))).preview;
  const now = new Date();
  // This writes only proposal metadata. The planner never writes any collection.
  try {
    await openActions().updateOne({ _id: id }, { $setOnInsert: {
      ownerId: u.userId, securityVersion: u.securityVersion ?? 0, authorityHash, preview,
      status: 'PENDING', expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
      purgeAt: new Date(now.getTime() + 7 * 86400000),
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    } }, { upsert: true });
  } catch (error) {
    // Concurrent previews for the same chat request can race on upsert; the
    // loser must read the winner's row instead of surfacing E11000.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const row = await loadOpenAction(u, id);
  if (row.preview.period !== period) fail('REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng cho kỳ khác.');
  return actionDto(row);
}
export async function getRevenueKpiOpenAction(user: AuthenticatedUser, id: string) {
  return actionDto(await loadOpenAction(await fresh(user, false), id));
}
export class RevenueKpiPlanChangedError extends WorkflowError {
  constructor(readonly preview: C.RevenueKpiOpenPreview) {
    super(409, 'REVENUE_KPI_PLAN_CHANGED', 'Kế hoạch đã thay đổi. Kiểm tra bản xem trước mới trước khi xác nhận.');
  }
}
export async function decideRevenueKpiOpenAction(user: AuthenticatedUser, id: string, raw: unknown) {
  const input: Decision = C.RevenueKpiOpenDecisionSchema.parse(raw);
  const run = async (u: AuthenticatedUser, p: C.RevenueKpiPeriod, plan: OpenPlan, decision: Extract<Decision, { approve: true }>) => {
    try {
      await ensureRevenueKpiStorage();
      const result = await executeOpenPlan(u, p, plan, decision);
      await openActions().updateOne({ _id: id, status: 'CONFIRMED' },
        { $set: { status: 'EXECUTED', result, updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '', purgeAt: '' } });
      return actionDto({ ...(await loadOpenAction(u, id)), status: 'EXECUTED', result });
    } catch (error) {
      await openActions().updateOne({ _id: id, status: 'CONFIRMED' },
        { $set: { status: 'FAILED', updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '' } });
      throw error;
    }
  };
  return withCrmWriter(async () => {
    const u = await fresh(user, false);
    const row = await loadOpenAction(u, id);
    const now = new Date(), nowIso = now.toISOString();
    // Terminal outcomes are idempotent by action id: a reload or a retry with a
    // fresh clientRequestId must replay the stored decision instead of 409.
    if (row.status === 'EXECUTED' || row.status === 'CANCELLED') return actionDto(row);
    // TOCTOU-free expiry: the claim filter re-evaluates expiresAt against the
    // Mongo server clock ($$NOW) at write time, so an expiry landing between the
    // app check and the update can never claim the action.
    const unexpiredClaimFilter = {
      $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } };
    // A lost claim is an expiry only when the action is still PENDING and a clock
    // (app at claim time, or the Mongo server at update time) proves expiresAt
    // has passed; any other status means a concurrent decision won, which must
    // surface as ACTION_DECIDED, not expiry.
    const expirePending = async () => {
      const appNow = new Date().toISOString();
      const expired = await openActions().findOneAndUpdate(
        { _id: id, status: 'PENDING', $or: [
          { expiresAt: { $lte: appNow } },
          { $expr: { $lte: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } },
        ] },
        { $set: { status: 'EXPIRED', updatedAt: appNow } }, { returnDocument: 'after' });
      if (expired) fail('REVENUE_KPI_ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
      fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
    };
    if (row.status === 'PENDING') {
      if (row.expiresAt <= nowIso) await expirePending();
      if (!input.approve) {
        const cancelled = await openActions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
          { $set: { status: 'CANCELLED', decisionHash: digest(input), updatedAt: nowIso }, $unset: { purgeAt: '' } });
        if (!cancelled.modifiedCount) await expirePending();
        return actionDto({ ...row, status: 'CANCELLED' });
      }
      const p = await periodGet(row.preview.period);
      if (p.status !== 'DRAFT' && p.status !== 'OPEN') fail('REVENUE_KPI_INVALID_STATE', 'Kỳ đã chốt hoặc lưu trữ.');
      const plan = await buildOpenPlan(u, p);
      const approve = input as Extract<Decision, { approve: true }>;
      if (approve.expectedVersion !== row.preview.version || approve.planDigest !== row.preview.planDigest ||
        plan.preview.planDigest !== row.preview.planDigest) throw new RevenueKpiPlanChangedError(plan.preview);
      if (row.expiresAt <= new Date().toISOString()) await expirePending();
      const leaseUntil = new Date(Date.now() + 60000).toISOString();
      const claimed = await openActions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
        { $set: { status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, updatedAt: new Date().toISOString() }, $unset: { purgeAt: '' } });
      if (!claimed.modifiedCount) await expirePending();
      return run(u, p, plan, approve);
    }
    if (row.status === 'CONFIRMED' || row.status === 'FAILED') {
      // The worker crashed or was interrupted after claiming the action. Wait for
      // the lease, then finish only the missing rows; existing drafts written by
      // this action are reported as skipped, never duplicated or re-derived.
      if (row.status === 'CONFIRMED' && row.leaseUntil && row.leaseUntil > nowIso)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
      if (!input.approve || input.planDigest !== row.preview.planDigest || input.expectedVersion !== row.preview.version)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      const approve = input as Extract<Decision, { approve: true }>;
      const p = await periodGet(row.preview.period);
      if (p.status !== 'DRAFT' && p.status !== 'OPEN') fail('REVENUE_KPI_INVALID_STATE', 'Kỳ đã chốt hoặc lưu trữ.');
      // A real claim writes CONFIRMED and decisionHash atomically. A CONFIRMED
      // row without one is malformed (legacy/simulated state) and is never a
      // proof of partial writes: fail closed instead of re-deriving a plan.
      if (!row.decisionHash) fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất thiếu dữ liệu xác nhận. Hãy lập bản xem trước mới.');
      const plan = await replayOpenPlan(u, p, row, approve);
      const leaseUntil = new Date(Date.now() + 60000).toISOString();
      const claimed = await openActions().updateOne({ _id: id, status: row.status },
        { $set: { status: 'CONFIRMED', leaseUntil, updatedAt: new Date().toISOString() }, $unset: { purgeAt: '' } });
      if (!claimed.modifiedCount) fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
      // An approved action keeps recovering regardless of expiresAt: expiry only
      // gates the first claim, not the completion of an already-approved plan.
      return run(u, p, plan, recoveryCommand(row, approve));
    }
    throw new WorkflowError(409, 'REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã hết hiệu lực. Hãy lập bản xem trước mới.');
  }).then(async action => {
    for (const item of action.result?.created ?? []) {
      try { await flushRevenueKpiNotices(item.assignmentId ?? undefined); }
      catch { console.error('[RevenueKpi] notice delivery deferred'); }
    }
    return action;
  });
}

// ---------- P3: assignment actions via chat proposals.
// Same collection `revenue_kpi_open_actions`, distinguished by `type`:
// 'revenue_kpi.open_period' rows keep the P0 shape; 'revenue_kpi.mutate_assignment'
// rows use the P3 union member. No rename, no migration, old rows stay parseable.

type AssignmentActionRow = {
  _id: string;
  ownerId: string;
  securityVersion: number;
  authorityHash: string;
  preview: C.RevenueKpiAssignmentPreview;
  status: C.RevenueKpiAssignmentAction['status'];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  decisionHash?: string;
  result?: C.RevenueKpiAssignmentActionResult | null;
  leaseUntil?: string;
  freshClaim?: boolean;
  purgeAt?: Date;
  type?: 'revenue_kpi.open_period' | 'revenue_kpi.mutate_assignment';
  args: C.RevenueKpiAssignmentActionArgs;
  subAction?: string;
};

const ASSIGNMENT_ACTION_CAPABILITY: Record<string, C.AuthorizationCapability> = {
  publish: 'revenue_kpi.assign',
  accept: 'revenue_kpi.respond',
  refuse: 'revenue_kpi.respond',
  'hr-decision': 'revenue_kpi.approve',
  'adjustment-request': 'revenue_kpi.request_adjustment',
  'adjustment-verify': 'revenue_kpi.verify_adjustment',
  'adjustment-decision': 'revenue_kpi.approve',
  responsibility: 'revenue_kpi.assign',
};

function assignmentActionDto(row: AssignmentActionRow): C.RevenueKpiAssignmentAction {
  const status = row.status === 'PENDING' && row.expiresAt <= new Date().toISOString() ? 'EXPIRED' : row.status;
  return C.RevenueKpiAssignmentActionSchema.parse({
    actionId: row._id, type: 'revenue_kpi.mutate_assignment', status, expiresAt: row.expiresAt,
    requiresConfirmation: status === 'PENDING', executed: !!row.result,
    args: row.args, preview: row.preview,
    result: row.result ? { assignment: row.result.assignment } : null,
  });
}

// Digest of the assignment snapshot plus everything the action reads or writes:
// args, period state/policy and the live store targets the AREA invariant checks.
function assignmentPlanDigest(a: C.RevenueKpiAssignment, p: C.RevenueKpiPeriod,
  args: C.RevenueKpiAssignmentActionArgs, storeTargets: { storeId: string; targetVnd: number }[], subAction?: string) {
  // planDigest is excluded from its own input: the preview computes the digest
  // before it exists, so the executor's stored copy (with a real digest) must
  // not change the hash.
  const { planDigest: _omit, ...digestArgs } = args;
  return digest({ assignment: draftBasis(a), assignmentStatus: a.status,
    deadlineAt: a.deadlineAt, adjustment: a.adjustment, responsibility: a.responsibility,
    period: { id: p.id, version: p.version, status: p.status, policy: p.policy },
    action: args.action, subAction: subAction ?? null, args: digestArgs, storeTargets });
}

async function areaStoreTargets(a: C.RevenueKpiAssignment) {
  if (a.unitType !== 'AREA') return [];
  const rows = await Assignment.find({ period: a.period, unitType: 'STORE',
    storeId: { $in: a.stores.map(s => String(s.storeId)) }, status: { $ne: 'CANCELLED' } }).lean();
  return rows.map(r => ({ storeId: String(r.storeId), targetVnd: Number(r.targetVnd) }))
    .sort((x, y) => x.storeId.localeCompare(y.storeId));
}

function assignmentPreviewContext(u: AuthenticatedUser, a: C.RevenueKpiAssignment, action: string) {
  // Same gate ladder as mutateRevenueKpiAssignment: own() for assignee actions,
  // forStores + independent() for authority actions. No preview-only bypass.
  if (['accept', 'refuse', 'adjustment-request'].includes(action)) {
    own(u, a, action === 'adjustment-request' ? 'revenue_kpi.request_adjustment' : 'revenue_kpi.respond');
  } else {
    forStores(u, ASSIGNMENT_ACTION_CAPABILITY[action], a.stores, action === 'hr-decision');
    independent(u, a);
  }
}

function assignmentImpact(a: C.RevenueKpiAssignment, args: C.RevenueKpiAssignmentActionArgs): C.RevenueKpiAssignmentImpactItem[] {
  const statusTo: Record<string, string> = {
    publish: 'PENDING_ACCEPTANCE', accept: 'ACTIVE', refuse: 'HR_REVIEW',
    'hr-decision': 'PENDING_ACCEPTANCE', 'adjustment-request': 'ADJUSTMENT_REQUESTED',
    'adjustment-verify': a.status, 'adjustment-decision': 'PENDING_ACCEPTANCE', responsibility: 'PENDING_ACCEPTANCE',
  };
  const items: C.RevenueKpiAssignmentImpactItem[] = [
    { field: 'status', from: a.status, to: statusTo[args.action] ?? a.status },
    { field: 'targetVnd', from: String(a.targetVnd), to: args.newTargetVnd !== undefined || args.newGrowthPercent !== undefined
      ? String(args.newTargetVnd ?? targetFromGrowth(a.baseRevenueVnd, args.newGrowthPercent ?? 0)) : String(a.targetVnd) },
  ];
  if (args.action === 'adjustment-request') items.push({ field: 'adjustment.status', from: null, to: 'PENDING' });
  if (args.action === 'adjustment-verify') items.push({ field: 'adjustment.status', from: a.adjustment?.status ?? null, to: 'VERIFIED' });
  if (args.action === 'adjustment-decision') items.push({ field: 'adjustment.status', from: a.adjustment?.status ?? null, to: args.action === 'adjustment-decision' ? args.action : args.action });
  if (args.action === 'responsibility') items.push({ field: 'assigneeEmployeeId', from: a.assigneeEmployeeId, to: args.assigneeEmployeeId ?? a.assigneeEmployeeId });
  return items;
}

function chatSummary(a: C.RevenueKpiAssignment, args: C.RevenueKpiAssignmentActionArgs) {
  const unit = unitLabel(a);
  switch (args.action) {
    case 'publish': return `Phát hành KPI ${unit} → người nhận chờ xác nhận trong ${a.period}.`;
    case 'accept': return `Xác nhận nhận KPI ${unit} → KPI có hiệu lực.`;
    case 'refuse': return `Từ chối KPI ${unit} → chuyển HR xem xét.`;
    case 'hr-decision': return `HR quyết định KPI ${unit} → người nhận xác nhận lại theo kết quả.`;
    case 'adjustment-request': return `Yêu cầu điều chỉnh KPI ${unit} → AM xác minh, sau đó HR quyết định.`;
    case 'adjustment-verify': return `Xác minh yêu cầu điều chỉnh KPI ${unit} → chuyển HR quyết định.`;
    case 'adjustment-decision': return `HR quyết định yêu cầu điều chỉnh KPI ${unit}.`;
    case 'responsibility': return `Chuyển người phụ trách KPI ${unit} từ thời điểm đã căn cứ.`;
  }
}

export async function previewRevenueAssignmentAction(user: AuthenticatedUser, assignmentId: string,
  action: string, rawArgs: unknown = {}, proposedId: string = randomUUID()) {
  C.RevenueKpiOpenActionIdSchema.parse(proposedId);
  if (!ASSIGNMENT_ACTION_CAPABILITY[action]) fail('REVENUE_KPI_INVALID_STATE', 'Thao tác không hợp lệ.', 400);
  const u = await fresh(user, false);
  const a = await assignmentGet(assignmentId), p = await periodGet(a.period);
  assignmentPreviewContext(u, a, action);
  unlocked(p);
  const raw = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};
  // planDigest is an output of the preview, never an input; expectedVersion is
  // pinned to the live snapshot, not caller-supplied. The contract args schema
  // has no slot for the KEEP/ADJUST/CANCEL or APPROVE/REJECT choice of
  // hr-decision/adjustment-decision, so that choice is stored separately as
  // row.subAction and forwarded verbatim at execute time.
  const rawInput = { ...raw } as Record<string, unknown>;
  const subAction = typeof rawInput.action === 'string' && ['hr-decision', 'adjustment-decision'].includes(action)
    && ['KEEP', 'ADJUST', 'CANCEL', 'APPROVE', 'REJECT'].includes(rawInput.action)
    ? rawInput.action : undefined;
  delete rawInput.action;
  const input = C.RevenueKpiAssignmentActionArgsSchema.omit({ planDigest: true, expectedVersion: true }).parse({ ...rawInput, assignmentId: a.id, action });
  const args: C.RevenueKpiAssignmentActionArgs = { ...input, expectedVersion: a.version, planDigest: '' };
  const warnings: string[] = [];
  // Surface AREA drift before the user confirms, exactly like the executor does.
  if (action === 'publish' || (['hr-decision', 'adjustment-decision'].includes(action) && a.unitType === 'AREA')) {
    try { await assertAreaTargetDerived(a, args); } catch (e) {
      if (!(e instanceof WorkflowError)) throw e;
      warnings.push(e.message);
    }
  }
  const planDigest = assignmentPlanDigest(a, p, args, await areaStoreTargets(a), subAction);
  const parsedPreview = C.RevenueKpiAssignmentPreviewSchema.parse({
    assignmentId: a.id, period: a.period, unitType: a.unitType, storeId: a.storeId, areaKey: a.areaKey,
    assigneeEmployeeId: a.assigneeEmployeeId, assigneeRole: a.assigneeRole, currentStatus: a.status,
    expectedVersion: a.version, planDigest, summary: chatSummary(a, args),
    impacts: assignmentImpact(a, args), warnings, executed: false,
  });
  const preview: C.RevenueKpiAssignmentPreview = parsedPreview;
  const now = new Date();
  // Proposal metadata only — never touches assignments/periods/results.
  try {
    await assignmentActions().updateOne({ _id: proposedId }, { $setOnInsert: {
      ownerId: u.userId, securityVersion: u.securityVersion ?? 0, authorityHash: chatActionAuthority(u),
      preview, args: C.RevenueKpiAssignmentActionArgsSchema.parse({ ...args, planDigest }), subAction, status: 'PENDING',
      type: 'revenue_kpi.mutate_assignment',
      expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
      purgeAt: new Date(now.getTime() + 7 * 86400000),
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    } }, { upsert: true });
  } catch (error) {
    // Concurrent previews for the same chat request can race on upsert; the loser
    // must read the winner's row instead of surfacing E11000.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const row = await loadAssignmentAction(u, proposedId);
  if (row.args.action !== action) fail('REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng cho thao tác khác.');
  return { actionId: row._id, type: 'revenue_kpi.mutate_assignment' as const,
    preview: row.preview, requiresConfirmation: true as const, executed: false as const };
}

function loadAssignmentActionGuard(u: AuthenticatedUser, row: AssignmentActionRow) {
  if (row.type !== 'revenue_kpi.mutate_assignment') fail('REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.', 404);
  if (row.securityVersion !== u.securityVersion || row.authorityHash !== chatActionAuthority(u))
    fail('REVENUE_KPI_AUTHORITY_CHANGED', 'Quyền đã thay đổi. Hãy lập bản xem trước mới.', 403);
}

async function loadAssignmentAction(u: AuthenticatedUser, id: string): Promise<AssignmentActionRow> {
  const found = await assignmentActions().findOne({ _id: C.RevenueKpiOpenActionIdSchema.parse(id), ownerId: u.userId }) as AssignmentActionRow | null;
  if (found === null) return fail('REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.', 404);
  loadAssignmentActionGuard(u, found);
  return found;
}

export async function getRevenueKpiAssignmentAction(user: AuthenticatedUser, id: string) {
  return assignmentActionDto(await loadAssignmentAction(await fresh(user, false), id));
}

export class RevenueKpiAssignmentPlanChangedError extends WorkflowError {
  constructor(readonly preview: C.RevenueKpiAssignmentPreview) {
    super(409, 'REVENUE_KPI_PLAN_CHANGED', 'KPI đã thay đổi. Kiểm tra bản xem trước mới trước khi xác nhận.');
  }
}

export async function decideChatAction(user: AuthenticatedUser, id: string, raw: unknown): Promise<C.RevenueKpiAssignmentAction> {
  const input: z.infer<typeof C.RevenueKpiAssignmentDecisionSchema> = C.RevenueKpiAssignmentDecisionSchema.parse(raw);
  return withCrmWriter(async () => {
    const u = await fresh(user, false);
    let row = await loadAssignmentAction(u, id);
    const now = new Date(), nowIso = now.toISOString();
    // Terminal outcomes are idempotent by action id: reload or retry replays the
    // stored decision instead of 409.
    if (row.status === 'EXECUTED' || row.status === 'CANCELLED') return assignmentActionDto(row);
    const unexpiredClaimFilter = { $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } };
    const expirePending = async () => {
      const appNow = new Date().toISOString();
      const expired = await assignmentActions().findOneAndUpdate(
        { _id: id, status: 'PENDING', $or: [
          { expiresAt: { $lte: appNow } },
          { $expr: { $lte: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } },
        ] },
        { $set: { status: 'EXPIRED', updatedAt: appNow } }, { returnDocument: 'after' });
      if (expired) fail('REVENUE_KPI_ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
      fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
    };
    if (row.status === 'PENDING') {
      if (row.expiresAt <= nowIso) await expirePending();
      if (!input.approve) {
        const cancelled = await assignmentActions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
          { $set: { status: 'CANCELLED', decisionHash: digest(input), updatedAt: nowIso }, $unset: { purgeAt: '' } });
        if (!cancelled.modifiedCount) await expirePending();
        return assignmentActionDto({ ...row, status: 'CANCELLED' });
      }
      const approve: { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string } = input.approve ? input : fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      const leaseUntil = new Date(Date.now() + 60000).toISOString();
      const claimed = await assignmentActions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
        { $set: { status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, updatedAt: new Date().toISOString() }, $unset: { purgeAt: '' } });
      if (!claimed.modifiedCount) await expirePending();
      row = { ...row, status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, freshClaim: true };
    }
    if (row.status === 'CONFIRMED' || row.status === 'FAILED') {
      // A decision that claimed the action in this call proceeds directly; only a
      // claim left by an earlier crashed worker must wait out the lease.
      if (row.status === 'CONFIRMED' && !row.freshClaim && row.leaseUntil && row.leaseUntil > nowIso)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
      if (!input.approve || !row.decisionHash)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      // A real claim writes CONFIRMED + decisionHash atomically. Recovery must
      // replay the exact approved payload; anything else fails closed.
      const approved = input.approve ? { ...input } : null;
      if (approved === null || digest(approved) !== row.decisionHash) {
        fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      }
      const command = approved as { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string };
      if (!row.freshClaim) {
        const claimed = await assignmentActions().updateOne({ _id: id, status: row.status },
          { $set: { status: 'CONFIRMED', leaseUntil: new Date(Date.now() + 60000).toISOString(), updatedAt: new Date().toISOString() }, $unset: { purgeAt: '' } });
        if (!claimed.modifiedCount) fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
      }
      const markFailed = async () => { await assignmentActions().updateOne({ _id: id, status: 'CONFIRMED' },
        { $set: { status: 'FAILED', updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '' } }); };
      try {
        const args = row.args;
        // Stale version or changed plan fails closed and carries a fresh preview.
        if (command.expectedVersion !== args.expectedVersion || command.planDigest !== args.planDigest)
          throw new RevenueKpiAssignmentPlanChangedError(await freshAssignmentPreview(u, args));
        // Re-derive the digest from live data: a version bump or upstream drift
        // (store targets, period state) after the preview fails closed here,
        // before mutate can surface a bare version conflict.
        const live = await assignmentGet(args.assignmentId);
        const livePeriod = await periodGet(live.period);
        if (live.version !== args.expectedVersion ||
          assignmentPlanDigest(live, livePeriod, args, await areaStoreTargets(live), row.subAction ?? undefined) !== args.planDigest)
          throw new RevenueKpiAssignmentPlanChangedError(await freshAssignmentPreview(u, args));
        // Full re-check on live data: state, AREA invariant, capability, version
        // and replay all live inside mutateRevenueKpiAssignment — no domain bypass.
        const updated = await mutateRevenueKpiAssignment(u, args.assignmentId, args.action, {
          expectedVersion: command.expectedVersion, clientRequestId: command.clientRequestId,
          ...(args.reason !== undefined ? { reason: args.reason } : {}),
          ...(args.evidenceRef !== undefined ? { evidenceRef: args.evidenceRef } : {}),
          ...(args.newTargetVnd !== undefined ? { newTargetVnd: args.newTargetVnd } : {}),
          ...(args.newGrowthPercent !== undefined ? { newGrowthPercent: args.newGrowthPercent } : {}),
          ...(args.force !== undefined ? { force: args.force } : {}),
          ...(args.assigneeEmployeeId !== undefined ? { assigneeEmployeeId: args.assigneeEmployeeId } : {}),
          ...(args.from !== undefined ? { from: args.from } : {}),
          // KEEP/ADJUST/CANCEL or APPROVE/REJECT choice stored at preview time.
          ...(['hr-decision', 'adjustment-decision'].includes(args.action) && row.subAction ? { action: row.subAction } : {}),
        });
        await assignmentActions().updateOne({ _id: id, status: 'CONFIRMED' },
          { $set: { status: 'EXECUTED', result: { assignment: updated }, updatedAt: new Date().toISOString() } as { status: C.RevenueKpiAssignmentAction['status']; result: C.RevenueKpiAssignmentActionResult; updatedAt: string }, $unset: { leaseUntil: '', purgeAt: '' } });
        try { await flushRevenueKpiNotices(updated.id); } catch { console.error('[RevenueKpi] notice delivery deferred'); }
        const storedResult: C.RevenueKpiAssignmentActionResult = { assignment: updated };
        return assignmentActionDto({ ...row, status: 'EXECUTED', result: storedResult });
      } catch (error) {
        await markFailed();
        throw error;
      }
    }
    throw new WorkflowError(409, 'REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã hết hiệu lực. Hãy lập bản xem trước mới.');
  });
}

// Rebuilds the preview from live data for a 409 PLAN_CHANGED response.
async function freshAssignmentPreview(u: AuthenticatedUser, args: C.RevenueKpiAssignmentActionArgs): Promise<C.RevenueKpiAssignmentPreview> {
  const current = await assignmentGet(args.assignmentId), p = await periodGet(current.period);
  const freshArgs = { ...args, expectedVersion: current.version,
    planDigest: assignmentPlanDigest(current, p, { ...args, expectedVersion: current.version }, await areaStoreTargets(current)) };
  return C.RevenueKpiAssignmentPreviewSchema.parse({
    assignmentId: current.id, period: current.period, unitType: current.unitType, storeId: current.storeId, areaKey: current.areaKey,
    assigneeEmployeeId: current.assigneeEmployeeId, assigneeRole: current.assigneeRole, currentStatus: current.status,
    expectedVersion: current.version, planDigest: freshArgs.planDigest, summary: chatSummary(current, freshArgs),
    impacts: assignmentImpact(current, freshArgs), warnings: [], executed: false,
  });
}

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

// ---------- P4: result/period lifecycle actions via chat proposals.
// Same collection `revenue_kpi_open_actions`, distinguished by `type`
// 'revenue_kpi.result_action'. No rename, no migration.

type ResultActionRow = {
  _id: string;
  ownerId: string;
  securityVersion: number;
  authorityHash: string;
  preview: C.RevenueKpiResultActionPreview;
  status: C.RevenueKpiResultAction['status'];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  decisionHash?: string;
  result?: C.RevenueKpiResultActionResult | null;
  leaseUntil?: string;
  freshClaim?: boolean;
  purgeAt?: Date;
  type: 'revenue_kpi.result_action';
  args: C.RevenueKpiResultActionArgs;
};

const RESULT_ACTION_CAPABILITY: Record<C.RevenueKpiResultActionKind, C.AuthorizationCapability> = {
  compute: 'revenue_kpi.close',
  'miss-reason': 'revenue_kpi.respond',
  'review-reason': 'revenue_kpi.approve',
  confirm: 'revenue_kpi.close',
  correct: 'revenue_kpi.close',
  close: 'revenue_kpi.close',
};

function resultActionDto(row: ResultActionRow): C.RevenueKpiResultAction {
  const status = row.status === 'PENDING' && row.expiresAt <= new Date().toISOString() ? 'EXPIRED' : row.status;
  return C.RevenueKpiResultActionSchema.parse({
    actionId: row._id, type: 'revenue_kpi.result_action', status, expiresAt: row.expiresAt,
    requiresConfirmation: status === 'PENDING', executed: !!row.result,
    args: row.args, preview: row.preview,
    result: row.result ?? null,
  });
}

// Digest of the target snapshot (period or assignment+result) plus period
// state/policy: the executor re-derives this from live data before dispatching
// to the existing services, so any drift after preview fails closed.
async function resultActionPlanDigest(kind: C.RevenueKpiResultActionKind,
  target: { period: C.RevenueKpiPeriod; assignment?: C.RevenueKpiAssignment | null; result?: C.RevenueKpiResult | null },
  args: C.RevenueKpiResultActionArgs) {
  return digest({
    kind, args: { ...args, planDigest: undefined },
    period: { id: target.period.id, version: target.period.version, status: target.period.status, policy: target.period.policy },
    assignment: target.assignment ? draftBasis(target.assignment) : null,
    assignmentStatus: target.assignment?.status ?? null,
    result: target.result ? { id: target.result.id, version: target.result.version, status: target.result.status, assignmentVersion: target.result.assignmentVersion } : null,
  });
}

async function resultActionAuthorityTarget(u: AuthenticatedUser, kind: C.RevenueKpiResultActionKind,
  target: { period?: string; resultId?: string }) {
  const cap = RESULT_ACTION_CAPABILITY[kind];
  let assignment: C.RevenueKpiAssignment | null = null, result: C.RevenueKpiResult | null = null;
  let p: C.RevenueKpiPeriod;
  if (target.resultId) {
    const requested = rDto(await Result.findById(target.resultId).lean());
    if (!requested) fail('REVENUE_KPI_NOT_FOUND', 'Không tìm thấy kết quả.', 404);
    result = requested;
    assignment = await assignmentGet(requested.assignmentId);
    p = await periodGet(assignment.period);
    // appendResult creates a new document per version; the authoritative state
    // is the latest one, so a version bump behind the preview (including the
    // preview target being superseded) must surface here as drift, not as a
    // mid-dispatch VERSION_CONFLICT.
    const newest = rDto(await Result.findOne({ assignmentId: assignment.id }).sort({ version: -1 }).lean());
    if (newest && newest.id !== result.id) result = newest;
    if (kind === 'miss-reason') own(u, assignment, cap);
    else { forStores(u, cap, assignment.stores, true); independent(u, assignment); }
  } else {
    p = await periodGet(target.period!);
    if (kind === 'compute' || kind === 'close') requirePeriodAuthority(u, cap);
    else fail('REVENUE_KPI_INVALID_STATE', 'Thao tác này cần resultId.', 400);
  }
  return { p, assignment, result };
}

function resultActionSummary(kind: C.RevenueKpiResultActionKind, period: string): string {
  switch (kind) {
    case 'compute': return `Tính kết quả KPI cho mọi assignment ACTIVE trong kỳ ${period} (bản nháp, chưa ghi).`;
    case 'close': return `Chốt kỳ KPI ${period} sau khi mọi kết quả đã xác nhận.`;
    case 'miss-reason': return `Ghi giải trình doanh thu chưa đạt cho kết quả trong kỳ ${period}.`;
    case 'review-reason': return `HR xem xét giải trình kết quả trong kỳ ${period}.`;
    case 'confirm': return `Xác nhận kết quả KPI trong kỳ ${period}.`;
    case 'correct': return `Tạo bản điều chỉnh (CORRECTED) sau chốt cho kết quả trong kỳ ${period}.`;
  }
}

// READ-ONLY preview: calculateRevenueKpi runs on live POS data but nothing is
// persisted — no appendResult, no period/assignment write. Zero-write is
// asserted by document counts in the P4 test.
export async function previewRevenueKpiResultAction(user: AuthenticatedUser, kind: string,
  target: { period?: string; resultId?: string } = {},
  content: { text?: string; decision?: 'ACKNOWLEDGED' | 'REJECTED'; note?: string; waiveReason?: string; reason?: string } = {},
  proposedId: string = randomUUID()) {
  C.RevenueKpiOpenActionIdSchema.parse(proposedId);
  if (!RESULT_ACTION_CAPABILITY[kind as C.RevenueKpiResultActionKind]) fail('REVENUE_KPI_INVALID_STATE', 'Thao tác không hợp lệ.', 400);
  const actionKind = kind as C.RevenueKpiResultActionKind;
  C.RevenueKpiResultActionTargetSchema.parse(target);
  // Content is validated with the exact contract command schemas per kind, so
  // the executor can replay args verbatim — the proposal, not the client
  // decision payload, is the single source of business content.
  const contentSchemas: Record<C.RevenueKpiResultActionKind, z.ZodTypeAny | null> = {
    compute: null, close: null,
    'miss-reason': C.RevenueKpiMissReasonSchema.pick({ text: true }),
    'review-reason': C.RevenueKpiReviewReasonSchema.pick({ decision: true, note: true }),
    confirm: C.RevenueKpiConfirmSchema.pick({ waiveReason: true }),
    correct: C.RevenueKpiCorrectSchema.pick({ reason: true }),
  };
  const schema = contentSchemas[actionKind];
  const validated = schema ? (schema.parse(content ?? {}) as Record<string, unknown>) : {};
  const u = await fresh(user, false);
  const { p, assignment, result } = await resultActionAuthorityTarget(u, actionKind, target);
  const liveArgs: C.RevenueKpiResultActionArgs = {
    ...(target.period ? { period: target.period } : { resultId: target.resultId! }),
    ...validated,
    expectedVersion: target.period ? p.version : result!.version,
    planDigest: '',
  } as C.RevenueKpiResultActionArgs;
  const requirements: C.RevenueKpiResultActionRequirement[] = [];
  const expected: C.RevenueKpiResultActionExpectedItem[] = [];
  const warnings: string[] = [];
  const targetId = target.period ?? target.resultId!;
  if (actionKind === 'compute' || actionKind === 'close') {
    if (actionKind === 'close' && new Date() < periodRangeVN(p.period).end)
      requirements.push({ met: false, label: 'Kỳ đã hết tháng', detail: 'Chưa hết tháng; không thể chốt kỳ.' });
    const rows = (await Assignment.find({ period: p.period, status: actionKind === 'compute' ? 'ACTIVE' : { $ne: 'CANCELLED' } }).lean()).map(aDto);
    const latestMap = await latestResultByAssignment(rows.map(a => a.id));
    for (const a of rows) {
      const prev = latestMap.get(a.id) ?? null;
      if (actionKind === 'close') {
        const ok = ['ACTIVE', 'CLOSED'].includes(a.status) && !!prev && prev.status === 'CONFIRMED';
        requirements.push({ met: ok, label: `KPI ${unitLabel(a)} đã xác nhận`, detail: ok ? null
          : !prev ? 'Chưa có kết quả; cần compute trước.' : prev.status !== 'CONFIRMED' ? `Kết quả đang ở trạng thái ${prev.status}; cần CONFIRMED.` : 'KPI không ở trạng thái hợp lệ để chốt.' });
        expected.push({ assignmentId: a.id, resultId: prev?.id ?? null, storeId: a.storeId, areaKey: a.areaKey,
          currentStatus: a.status, resultStatus: prev?.status ?? null, projectedStatus: prev && prev.status === 'CONFIRMED' ? 'CONFIRMED' : null,
          targetVnd: a.targetVnd, projectedActualRevenueVnd: prev?.actualRevenueVnd ?? null, summary: unitLabel(a) });
        continue;
      }
      const calc = await calculateRevenueKpi(a, p.policy);
      const projectedStatus: C.RevenueKpiResult['status'] = calc.pendingReasons.length ? 'PENDING_DATA'
        : calc.achieved === false ? 'AWAITING_REASON' : 'COMPUTED';
      expected.push({ assignmentId: a.id, resultId: prev?.id ?? null, storeId: a.storeId, areaKey: a.areaKey,
        currentStatus: a.status, resultStatus: prev?.status ?? null, projectedStatus,
        targetVnd: a.targetVnd, projectedActualRevenueVnd: calc.actualRevenueVnd,
        summary: `${unitLabel(a)}: dự kiến ${projectedStatus}${calc.actualRevenueVnd !== null ? `, doanh thu ${calc.actualRevenueVnd} VND` : ', thiếu dữ liệu'}` });
      if (calc.pendingReasons.length) warnings.push(`${unitLabel(a)}: thiếu dữ liệu (${calc.pendingReasons.join(', ')}).`);
    }
    if (!rows.length) requirements.push({ met: false, label: 'Kỳ có KPI', detail: 'Kỳ chưa có assignment để xử lý.' });
  } else {
    const a = assignment!;
    if (actionKind === 'miss-reason') {
      requirements.push({ met: !!result && ['AWAITING_REASON', 'COMPUTED'].includes(result.status) && result.achieved === false,
        label: 'Kết quả cần giải trình', detail: !result || !['AWAITING_REASON', 'COMPUTED'].includes(result.status) || result.achieved !== false
          ? 'Kết quả không ở trạng thái cần giải trình (AWAITING_REASON/COMPUTED với achieved=false).' : null });
    }
    if (actionKind === 'review-reason') {
      requirements.push({ met: !!result?.missReason && result.status === 'COMPUTED', label: 'Đã có giải trình để xem xét',
        detail: !result?.missReason || result.status !== 'COMPUTED' ? 'Chưa có giải trình hoặc kết quả chưa COMPUTED.' : null });
    }
    if (actionKind === 'confirm') {
      const past = new Date() >= periodRangeVN(a.period).end;
      requirements.push({ met: past, label: 'Kỳ đã hết tháng', detail: past ? null : 'Chưa hết tháng; kết quả hiện tại chỉ để theo dõi.' });
      const hasActual = !!result && result.actualRevenueVnd !== null && ['COMPUTED', 'AWAITING_REASON'].includes(result.status);
      requirements.push({ met: hasActual, label: 'Kết quả đầy đủ', detail: hasActual ? null : 'Cần kết quả COMPUTED/AWAITING_REASON với doanh thu đầy đủ.' });
      const reasonOk = !result?.achieved || (result.missReason?.reviewDecision === 'ACKNOWLEDGED') || !!liveArgs.waiveReason;
      requirements.push({ met: reasonOk, label: 'Giải trình đã xem xét hoặc miễn', detail: reasonOk ? null : 'Cần giải trình đã được xem xét hoặc lý do HR miễn giải trình.' });
    }
    if (actionKind === 'correct') {
      const ok = p.status === 'CLOSED' && !!result && ['CONFIRMED', 'CORRECTED'].includes(result.status);
      requirements.push({ met: ok, label: 'Đã chốt và kết quả đã xác nhận',
        detail: ok ? null : 'Chỉ tạo điều chỉnh sau chốt (CLOSED) từ kết quả CONFIRMED/CORRECTED.' });
      if (ok) {
        const calc = await calculateRevenueKpi(a, p.policy);
        expected.push({ assignmentId: a.id, resultId: result!.id, storeId: a.storeId, areaKey: a.areaKey,
          currentStatus: a.status, resultStatus: result!.status, projectedStatus: 'CORRECTED',
          targetVnd: a.targetVnd, projectedActualRevenueVnd: calc.actualRevenueVnd,
          summary: `Số mới dự kiến: ${calc.actualRevenueVnd !== null ? calc.actualRevenueVnd + ' VND' : 'chưa đủ dữ liệu'}` });
        if (calc.pendingReasons.length) warnings.push(`Dữ liệu điều chỉnh chưa đầy đủ (${calc.pendingReasons.join(', ')}).`);
      }
    }
    expected.push({ assignmentId: a.id, resultId: result?.id ?? null, storeId: a.storeId, areaKey: a.areaKey,
      currentStatus: a.status, resultStatus: result?.status ?? null,
      projectedStatus: actionKind === 'correct' ? 'CORRECTED' : actionKind === 'miss-reason' ? 'COMPUTED' : result?.status ?? null,
      targetVnd: a.targetVnd, projectedActualRevenueVnd: result?.actualRevenueVnd ?? null, summary: unitLabel(a) });
  }
  const args: C.RevenueKpiResultActionArgs = { ...liveArgs, planDigest: await resultActionPlanDigest(actionKind, { period: p, assignment, result }, liveArgs) };
  const preview: C.RevenueKpiResultActionPreview = C.RevenueKpiResultActionPreviewSchema.parse({
    kind: actionKind, period: p.period, targetId, expectedVersion: args.expectedVersion, planDigest: args.planDigest,
    summary: resultActionSummary(actionKind, p.period), requirements, expected, warnings, executed: false,
  });
  const now = new Date();
  // Proposal metadata only — never touches periods/assignments/results.
  try {
    await resultActions().updateOne({ _id: proposedId }, { $setOnInsert: {
      ownerId: u.userId, securityVersion: u.securityVersion ?? 0, authorityHash: chatActionAuthority(u),
      preview, args, status: 'PENDING', type: 'revenue_kpi.result_action',
      expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
      purgeAt: new Date(now.getTime() + 7 * 86400000),
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    } }, { upsert: true });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code !== 11000) throw error;
  }
  const row = await loadResultAction(u, proposedId);
  if (row.preview.kind !== actionKind) fail('REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng cho thao tác khác.');
  return { actionId: row._id, type: 'revenue_kpi.result_action' as const,
    preview: row.preview, requiresConfirmation: true as const, executed: false as const };
}

const resultActions = () => mongoose.connection.collection<ResultActionRow>('revenue_kpi_open_actions');

function loadResultActionGuard(u: AuthenticatedUser, row: ResultActionRow) {
  if (row.type !== 'revenue_kpi.result_action') fail('REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.', 404);
  if (row.securityVersion !== u.securityVersion || row.authorityHash !== chatActionAuthority(u))
    fail('REVENUE_KPI_AUTHORITY_CHANGED', 'Quyền đã thay đổi. Hãy lập bản xem trước mới.', 403);
}

async function loadResultAction(u: AuthenticatedUser, id: string): Promise<ResultActionRow> {
  const found = await resultActions().findOne({ _id: C.RevenueKpiOpenActionIdSchema.parse(id), ownerId: u.userId }) as ResultActionRow | null;
  if (found === null) return fail('REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.', 404);
  loadResultActionGuard(u, found);
  return found;
}

export async function getRevenueKpiResultAction(user: AuthenticatedUser, id: string) {
  return resultActionDto(await loadResultAction(await fresh(user, false), id));
}

export class RevenueKpiResultPlanChangedError extends WorkflowError {
  constructor(readonly preview: C.RevenueKpiResultActionPreview) {
    super(409, 'REVENUE_KPI_PLAN_CHANGED', 'KPI đã thay đổi. Kiểm tra bản xem trước mới trước khi xác nhận.');
  }
}

export async function decideChatKpiResultAction(user: AuthenticatedUser, id: string, raw: unknown): Promise<C.RevenueKpiResultAction> {
  const input: z.infer<typeof C.RevenueKpiResultActionDecisionSchema> = C.RevenueKpiResultActionDecisionSchema.parse(raw);
  return withCrmWriter(async () => {
    const u = await fresh(user, false);
    let row = await loadResultAction(u, id);
    const nowIso = new Date().toISOString();
    if (row.status === 'EXECUTED' || row.status === 'CANCELLED') return resultActionDto(row);
    const unexpiredClaimFilter = { $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } };
    const expirePending = async () => {
      const appNow = new Date().toISOString();
      const expired = await resultActions().findOneAndUpdate(
        { _id: id, status: 'PENDING', expiresAt: { $lte: appNow } },
        { $set: { status: 'EXPIRED', updatedAt: appNow } }, { returnDocument: 'after' });
      if (expired) fail('REVENUE_KPI_ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
      fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
    };
    if (row.status === 'PENDING') {
      if (row.expiresAt <= nowIso) await expirePending();
      if (!input.approve) {
        const cancelled = await resultActions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
          { $set: { status: 'CANCELLED', decisionHash: digest(input), updatedAt: nowIso }, $unset: { purgeAt: '' } });
        if (!cancelled.modifiedCount) await expirePending();
        return resultActionDto({ ...row, status: 'CANCELLED' });
      }
      const approve = input.approve ? input : fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      const leaseUntil = new Date(Date.now() + 60000).toISOString();
      const claimed = await resultActions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
        { $set: { status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, updatedAt: new Date().toISOString() }, $unset: { purgeAt: '' } });
      if (!claimed.modifiedCount) await expirePending();
      row = { ...row, status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, freshClaim: true };
    }
    if (row.status === 'CONFIRMED' || row.status === 'FAILED') {
      if (row.status === 'CONFIRMED' && !row.freshClaim && row.leaseUntil && row.leaseUntil > nowIso)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
      if (!input.approve || !row.decisionHash)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      const approved = input.approve ? { ...input } : null;
      if (approved === null || digest(approved) !== row.decisionHash)
        fail('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      const command = approved as { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string };
      const claimed = await resultActions().updateOne({ _id: id, status: row.status },
        { $set: { leaseUntil: new Date(Date.now() + 60000).toISOString(), updatedAt: new Date().toISOString() }, $unset: { purgeAt: '' } });
      // A same-millisecond retry writes an identical leaseUntil: the update
      // matches but modifies nothing, so matchedCount (not modifiedCount) is
      // the liveness signal here.
      if (!claimed.matchedCount) fail('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
      const markFailed = async () => { await resultActions().updateOne({ _id: id, status: 'CONFIRMED' },
        { $set: { status: 'FAILED', updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '' } }); };
      try {
        const args = row.args, kind = row.preview.kind;
        const target = args.period ? { period: args.period } : { resultId: args.resultId };
        // Content travels only via the stored args — the rebuilt preview must
        // reproduce the approved plan from the proposal, never from the client.
        const content = {
          ...(args.text !== undefined ? { text: args.text } : {}),
          ...(args.decision !== undefined ? { decision: args.decision } : {}),
          ...(args.note !== undefined ? { note: args.note } : {}),
          ...(args.waiveReason !== undefined ? { waiveReason: args.waiveReason } : {}),
          ...(args.reason !== undefined ? { reason: args.reason } : {}),
        };
        if (command.expectedVersion !== args.expectedVersion || command.planDigest !== args.planDigest) {
          const rebuilt = await previewRevenueKpiResultAction(u, kind, target, content, randomUUID());
          throw new RevenueKpiResultPlanChangedError(rebuilt.preview);
        }
        // Re-derive the digest from live data before dispatching: any drift after
        // the preview fails closed here, before the domain service sees the call.
        const live = await resultActionAuthorityTarget(u, kind, target);
        const liveDigestTarget = { period: live.p, assignment: live.assignment, result: live.result };
        // appendResult supersedes by creating a new document: a proposal pinned
        // to a result id that is no longer the latest is stale by contract.
        if (!args.period && live.result && live.result.id !== args.resultId) {
          const rebuilt = await previewRevenueKpiResultAction(u, kind, target, content, randomUUID());
          throw new RevenueKpiResultPlanChangedError(rebuilt.preview);
        }
        if ((args.period ? live.p.version : live.result!.version) !== args.expectedVersion ||
          await resultActionPlanDigest(kind, liveDigestTarget, args) !== args.planDigest) {
          const rebuilt = await previewRevenueKpiResultAction(u, kind, target, content, randomUUID());
          throw new RevenueKpiResultPlanChangedError(rebuilt.preview);
        }
        // Dispatch to the existing domain services — full re-checks (guards,
        // PERIOD_NOT_READY, DATA_PENDING, REASON_REQUIRED, PERIOD_LOCKED, replay,
        // version) live inside them; no business logic is duplicated here.
        let outcome: C.RevenueKpiResult | C.RevenueKpiPeriod | null;
        const expectedVersion = command.expectedVersion;
        if (kind === 'compute') outcome = await computeRevenueKpiPeriod(u, args.period!, { expectedVersion, clientRequestId: command.clientRequestId });
        else if (kind === 'close') outcome = await closeRevenueKpiPeriod(u, args.period!, { expectedVersion, clientRequestId: command.clientRequestId });
        else {
          const pass: Record<string, unknown> = { expectedVersion, clientRequestId: command.clientRequestId };
          if (args.text !== undefined) pass.text = args.text;
          if (args.decision !== undefined) pass.decision = args.decision;
          if (args.note !== undefined) pass.note = args.note;
          if (args.waiveReason !== undefined) pass.waiveReason = args.waiveReason;
          if (kind === 'correct' && args.reason !== undefined) pass.reason = args.reason;
          outcome = await mutateRevenueKpiResult(u, args.resultId!, kind, pass);
        }
        // compute/close return the period row; the stored result carries the
        // projected result set from the preview so confirm-response stays typed.
        const resultPayload: C.RevenueKpiResultActionResult = { result: kind === 'compute' || kind === 'close' ? null : outcome as C.RevenueKpiResult };
        await resultActions().updateOne({ _id: id, status: 'CONFIRMED' },
          { $set: { status: 'EXECUTED', result: resultPayload, updatedAt: new Date().toISOString() } as { status: C.RevenueKpiResultAction['status']; result: C.RevenueKpiResultActionResult; updatedAt: string }, $unset: { leaseUntil: '', purgeAt: '' } });
        if (resultPayload.result) { try { await flushRevenueKpiNotices(resultPayload.result.assignmentId); } catch { console.error('[RevenueKpi] notice delivery deferred'); } }
        return resultActionDto({ ...row, status: 'EXECUTED', result: resultPayload });
      } catch (error) {
        await markFailed();
        throw error;
      }
    }
    throw new WorkflowError(409, 'REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã hết hiệu lực. Hãy lập bản xem trước mới.');
  });
}

// Read tool get_revenue_kpi_result: result + full versioned history of one
// assignment inside the caller's scope. Read-only, no provisioning writes.
export async function getRevenueKpiResult(user: AuthenticatedUser, assignmentId: string) {
  const u = await fresh(user, false);
  const a = await assignmentGet(assignmentId);
  if (!canRead(u, a)) fail('RBAC_DENIED', 'Không có quyền xem KPI này.', 403);
  const rows = await Result.find({ assignmentId }).sort({ version: 1 }).lean();
  const current = rows[rows.length - 1];
  return C.RevenueKpiResultDetailSchema.parse({
    result: rDto(current),
    assignment: a,
  });
}

export async function computeRevenueKpiPeriod(user: AuthenticatedUser, period: string, raw: unknown) { const input = C.RevenueKpiComputeSchema.parse(raw); return write(user, async u => {
  const p = await periodGet(period); requirePeriodAuthority(u, 'revenue_kpi.close'); if (replay(p, u, 'COMPUTE_PERIOD', input)) return p; unlocked(p); version(p, input);
  const assignments = (await Assignment.find({ period, status: 'ACTIVE' }).lean()).map(aDto);
  for (const a of assignments) { forStores(u, 'revenue_kpi.close', a.stores, true); independent(u, a); }
  const latestMap = await latestResultByAssignment(assignments.map(a => a.id));
  for (const a of assignments) {
    const prev = latestMap.get(a.id) ?? null; if (prev && (replay(prev, u, 'COMPUTE_RESULT', { ...input, expectedVersion: prev.version - 1 }) || prev.status === 'CONFIRMED')) continue;
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
  const latestMap = await latestResultByAssignment(rows.map(a => a.id));
  for (const a of rows) { forStores(u, 'revenue_kpi.close', a.stores, true); independent(u, a); const r = latestMap.get(a.id) ?? null;
    if (!['ACTIVE', 'CLOSED'].includes(a.status) || !r || r.status !== 'CONFIRMED' || a.status !== 'CLOSED' && r.assignmentVersion !== a.version) fail('REVENUE_KPI_PERIOD_NOT_READY', 'Còn KPI chưa xác nhận hoặc thiếu dữ liệu.'); }
  const toClose = rows.filter(a => a.status !== 'CLOSED');
  for (let i = 0; i < toClose.length; i += 10) {
    await Promise.all(toClose.slice(i, i + 10).map(a => update(Assignment, C.RevenueKpiAssignmentSchema, a, { status: 'CLOSED' }, u, 'CLOSE_ASSIGNMENT', { ...input, expectedVersion: a.version })));
  }
  return update(Period, C.RevenueKpiPeriodSchema, p, { status: 'CLOSED', closedBy: u.userId, closedAt: new Date().toISOString() }, u, 'CLOSE_PERIOD', input);
}); }
export async function revenueKpiDashboard(user: AuthenticatedUser, period: string) {
  const u = await fresh(user), p = await periodGet(period);
  if (!hasCapability(u, 'revenue_kpi.read_scope')) requireCapability(u, 'revenue_kpi.read_self', { userId: u.userId, employeeId: u.employeeId });
  const all = (await Assignment.find({ period }).limit(1001).lean()).map(aDto); if (all.length > 1000) fail('REVENUE_KPI_DATA_PENDING', 'Quá nhiều KPI để tổng hợp.');
  const assignments = all.filter(a => canRead(u, a));
  const latestMap = await latestResultByAssignment(assignments.map(a => a.id));
  const results = assignments.map(a => latestMap.get(a.id)).filter((r): r is C.RevenueKpiResult => !!r);
  const cat = hasCapability(u, 'revenue_kpi.assign') ? await catalog(u, period) : { stores: [], candidates: [] };
  const storesWithKpi = new Set(assignments.filter(a => a.unitType === 'STORE').map(a => a.storeId));
  const flags = p.status === 'CLOSED' ? [] : cat.stores
    .filter(s => s.smStatus !== 'IDENTIFIED' && !storesWithKpi.has(s.id))
    .map(s => `${s.name}: ${s.smStatus === 'MISSING' ? 'Chưa có SM hợp lệ' : 'HR cần chọn SM phụ trách'}`);
  return C.RevenueKpiDashboardSchema.parse({ period: p, assignments, results, ...cat, flags, generatedAt: new Date().toISOString() });
}
export async function revenueKpiAssignmentResult(user: AuthenticatedUser, id: string) { const u = await fresh(user), a = await assignmentGet(id); if (!canRead(u, a)) fail('RBAC_DENIED', 'Không có quyền xem KPI này.', 403); return { assignment: a, result: await latest(id) }; }

// AI proposal stores metadata only. Long network I/O happens outside the writer;
// authority and version are revalidated before persisting a proposal.
export async function revenueKpiAiContext(user: AuthenticatedUser, id: string) { const u = await fresh(user), a = await assignmentGet(id), p = await periodGet(a.period); forStores(u, 'revenue_kpi.assign', a.stores); independent(u, a); unlocked(p); if (a.unitType !== 'STORE' || a.status !== 'DRAFT' || !p.policy.aiProposalEnabled) fail('REVENUE_KPI_INVALID_STATE', 'Chỉ đề xuất cho bản nháp cửa hàng được bật AI.'); return { a, p }; }
export async function storeRevenueKpiProposal(user: AuthenticatedUser, id: string, raw: unknown, proposal: unknown) { const input = C.RevenueKpiAiProposalRequestSchema.parse(raw); return write(user, async u => { const { a } = await revenueKpiAiContext(u, id); if (replay(a, u, 'AI_PROPOSAL', input)) return a; return update(Assignment, C.RevenueKpiAssignmentSchema, a, { aiProposal: C.RevenueKpiAiProposalSchema.parse(proposal) }, u, 'AI_PROPOSAL', input); }); }

// ---------- P2: read + pending. Derived from entity state only; `readAt` is
// never consulted to decide whether a pending row exists. Read paths run with
// fresh(user, false): no Mongo provisioning, no writes, no notifications.

import { NotificationModel } from '../models/Notification.js';
import { TaskInstanceModel as Task } from '../models/TaskInstance.js';
import { canReadTask } from './task-instance.service.js';
const taskDto = (row: any): C.TaskInstance => { const { _id, ...fields } = row.toObject ? row.toObject() : row; return C.TaskInstanceSchema.parse({ ...fields, id: String(_id) }); };

const pendingArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
const SEVERITY_RANK: Record<C.RevenueKpiPendingSeverity, number> = { URGENT: 0, ACTION_REQUIRED: 1, INFO: 2 };
const PENDING_MAX = 500;

function pendingItem(kind: C.RevenueKpiPendingActionKind, severity: C.RevenueKpiPendingSeverity, entityKind: C.RevenueKpiPendingEntityKind,
  entityId: string, label: string, opts: { message?: string | null; deadlineAt?: string | null; period?: string; deeplink?: string | null } = {}): C.RevenueKpiPendingAction {
  return { kind, severity, entityKind, entityId, period: opts.period, label, message: opts.message ?? null, deadlineAt: opts.deadlineAt ?? null, proposedActionId: null, deeplink: opts.deeplink ?? null };
}

function unitLabel(a: C.RevenueKpiAssignment) {
  return a.unitType === 'STORE' ? a.stores[0]?.storeName ?? 'cửa hàng' : 'khu vực';
}

function assignmentDeeplink(a: C.RevenueKpiAssignment) { return '/revenue-kpi/assignments/' + a.id; }

async function latestResultByAssignment(assignmentIds: string[]) {
  const map = new Map<string, C.RevenueKpiResult>();
  if (!assignmentIds.length) return map;
  const rows = await Result.find({ assignmentId: { $in: assignmentIds } }).sort({ version: -1 }).limit(1000).lean();
  for (const row of rows) { const r = rDto(row); if (!map.has(r.assignmentId)) map.set(r.assignmentId, r); }
  return map;
}

export async function getMyRevenueKpi(user: AuthenticatedUser, period?: string) {
  const requested = period === undefined || period === null ? null : C.RevenueKpiMonthSchema.parse(period);
  const u = await fresh(user, false);
  requireCapability(u, 'revenue_kpi.read_self', { userId: u.userId, employeeId: u.employeeId });
  const resolved = requested
    ? (await Period.findOne({ period: requested }).lean())
    : (await Period.findOne({ status: 'OPEN' }).sort({ period: -1 }).limit(1).lean());
  if (!resolved || !u.employeeId) return C.RevenueKpiMyRevenueSchema.parse({ available: false, period: requested, items: [] });
  const p = pDto(resolved);
  const rows = (await Assignment.find({ period: p.period, assigneeEmployeeId: u.employeeId, status: { $ne: 'CANCELLED' } }).sort({ updatedAt: -1 }).limit(PENDING_MAX + 1).lean()).map(aDto);
  const latest = await latestResultByAssignment(rows.slice(0, PENDING_MAX).map(a => a.id));
  const items = rows.slice(0, PENDING_MAX).map(a => ({ assignment: a, result: latest.get(a.id) ?? null }));
  return C.RevenueKpiMyRevenueSchema.parse({ available: items.length > 0, period: p.period, items });
}

export async function getRevenueKpiDetail(user: AuthenticatedUser, id: string) {
  const u = await fresh(user, false), a = await assignmentGet(id);
  if (!canRead(u, a)) fail('RBAC_DENIED', 'Không có quyền xem KPI này.', 403);
  return C.RevenueKpiDetailSchema.parse({ assignment: a, result: await latest(a.id) });
}

export async function listMyPendingActions(user: AuthenticatedUser, raw: unknown = {}) {
  const { limit, offset } = pendingArgsSchema.parse(raw ?? {});
  const u = await fresh(user, false);
  const now = new Date(), iso = now.toISOString();
  const items: C.RevenueKpiPendingAction[] = [];
  const push = (item: C.RevenueKpiPendingAction) => { if (items.length < PENDING_MAX) items.push(item); };

  const openPeriods = (await Period.find({ status: 'OPEN' }).sort({ period: -1 }).limit(60).lean()).map(pDto);

  const mine = u.employeeId
    ? (await Assignment.find({ assigneeEmployeeId: u.employeeId, status: { $in: ['PENDING_ACCEPTANCE', 'ACTIVE', 'ADJUSTMENT_REQUESTED'] } }).sort({ updatedAt: -1 }).limit(PENDING_MAX + 1).lean()).map(aDto)
    : [];

  // 1+2. Acceptance for the assignee: overdue pushes severity to URGENT.
  for (const a of mine) {
    if (a.status !== 'PENDING_ACCEPTANCE' || !hasCapability(u, 'revenue_kpi.respond')) continue;
    const overdue = !!a.deadlineAt && a.deadlineAt < iso;
    push(pendingItem('acceptance', overdue ? 'URGENT' : 'ACTION_REQUIRED', 'assignment', a.id, `KPI ${unitLabel(a)} · Chờ xác nhận`,
      { message: overdue ? 'Đã quá hạn xác nhận KPI; cần xử lý ngay.' : null, deadlineAt: a.deadlineAt, period: a.period, deeplink: assignmentDeeplink(a) }));
  }

  // 3+4. Adjustment workflow: verify (AM, STORE) then decide (HR, VERIFIED or AREA).
  if (hasCapability(u, 'revenue_kpi.verify_adjustment') || hasCapability(u, 'revenue_kpi.approve')) {
    const rows = (await Assignment.find({ status: 'ADJUSTMENT_REQUESTED' }).sort({ updatedAt: -1 }).limit(PENDING_MAX + 1).lean()).map(aDto);
    for (const a of rows) {
      if (!a.adjustment || a.adjustment.requestedBy === u.userId) continue;
      if (a.unitType === 'STORE' && a.adjustment.status === 'PENDING' && hasCapability(u, 'revenue_kpi.verify_adjustment') && canRead(u, a))
        push(pendingItem('adjustment_verify', 'ACTION_REQUIRED', 'assignment', a.id, `KPI ${unitLabel(a)} · Chờ AM xác minh yêu cầu điều chỉnh`,
          { deadlineAt: a.deadlineAt, period: a.period, deeplink: assignmentDeeplink(a) }));
      else if ((a.adjustment.status === 'VERIFIED' || a.unitType === 'AREA') && hasCapability(u, 'revenue_kpi.approve') && canRead(u, a))
        push(pendingItem('adjustment_decision', 'ACTION_REQUIRED', 'assignment', a.id, `KPI ${unitLabel(a)} · Chờ HR quyết định điều chỉnh`,
          { deadlineAt: a.deadlineAt, period: a.period, deeplink: assignmentDeeplink(a) }));
    }
  }

  // 5. Miss reason belongs to the assignee of an ACTIVE assignment.
  const activeIds = mine.filter(a => a.status === 'ACTIVE').map(a => a.id);
  if (activeIds.length && hasCapability(u, 'revenue_kpi.respond')) {
    const latest = await latestResultByAssignment(activeIds);
    for (const a of mine) {
      if (a.status !== 'ACTIVE') continue;
      const r = latest.get(a.id);
      if (r && r.status === 'AWAITING_REASON' && r.achieved === false)
        push(pendingItem('miss_reason', 'ACTION_REQUIRED', 'result', r.id, `KPI ${unitLabel(a)} · Cần giải trình kết quả chưa đạt`,
          { deadlineAt: r.computedAt, period: r.period, deeplink: assignmentDeeplink(a) }));
    }
  }

  // 6+7. Reason review and result confirmation are HR decisions on open periods.
  if (hasCapability(u, 'revenue_kpi.approve') || hasCapability(u, 'revenue_kpi.close')) {
    const openByPeriod = new Map(openPeriods.map(p => [p.period, p]));
    // Append-only results keep every version. Only the latest version of an
    // assignment can still need HR action; an older row would resurrect work
    // that was already reviewed or superseded.
    const rows = (await Result.find({ status: { $in: ['COMPUTED', 'AWAITING_REASON'] } }).sort({ assignmentId: 1, version: -1 }).limit(PENDING_MAX * 4).lean()).map(rDto);
    const latestOnly: C.RevenueKpiResult[] = [], seenResultAssignments = new Set<string>();
    for (const r of rows) { if (seenResultAssignments.has(r.assignmentId)) continue; seenResultAssignments.add(r.assignmentId); latestOnly.push(r); }
    const scoped = latestOnly.filter(r => openByPeriod.has(r.period) && r.actualRevenueVnd !== null);
    const assignments = new Map((await Assignment.find({ _id: { $in: [...new Set(scoped.map(r => r.assignmentId))] } }).limit(PENDING_MAX + 1).lean()).map(row => {
      const a = aDto(row); return [a.id, a];
    }));
    for (const r of scoped.slice(0, PENDING_MAX)) {
      const a = assignments.get(r.assignmentId); if (!a) continue;
      if (r.status === 'COMPUTED' && r.missReason && r.missReason.reviewDecision === null && hasCapability(u, 'revenue_kpi.approve') && canRead(u, a))
        push(pendingItem('reason_review', 'ACTION_REQUIRED', 'result', r.id, `KPI ${unitLabel(a)} · Chờ HR xem xét giải trình`,
          { deadlineAt: r.missReason.at, period: r.period, deeplink: assignmentDeeplink(a) }));
      if (periodRangeVN(r.period).end < now && hasCapability(u, 'revenue_kpi.close') && canRead(u, a))
        push(pendingItem('result_confirm', 'ACTION_REQUIRED', 'result', r.id, `KPI ${unitLabel(a)} · Chờ HR xác nhận kết quả`,
          { deadlineAt: r.computedAt, period: r.period, deeplink: assignmentDeeplink(a) }));
    }
  }

  // 8. Overdue open period close is an HR decision.
  if (hasCapability(u, 'revenue_kpi.close')) {
    for (const p of openPeriods) {
      if (periodRangeVN(p.period).end >= now) continue;
      push(pendingItem('period_close', 'URGENT', 'period', p.id, `Kỳ ${p.period} đã hết tháng · Chờ HR chốt kỳ`, { period: p.period, deeplink: '/revenue-kpi/periods/' + p.period }));
    }
  }

  // INFO mirrors the user's own revenue notifications. readAt is deliberately
  // not filtered on: it may style a badge, it never removes or reorders a row.
  const notices = await NotificationModel.find({ userId: new mongoose.Types.ObjectId(u.userId), entityKind: 'revenue_kpi' }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  for (const n of notices) {
    const entityId = String(n.entityId ?? n._id);
    if (!/^[a-f0-9]{24}$/.test(entityId)) continue;
    push(pendingItem('info', 'INFO', 'notification', entityId, String(n.title), { message: String(n.body) }));
  }

  items.sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]
    || Date.parse(x.deadlineAt ?? '') - Date.parse(y.deadlineAt ?? '')
    || (Number.isNaN(Date.parse(x.deadlineAt ?? '')) ? 1 : 0) - (Number.isNaN(Date.parse(y.deadlineAt ?? '')) ? 1 : 0)
    || x.entityKind.localeCompare(y.entityKind) || x.entityId.localeCompare(y.entityId) || x.kind.localeCompare(y.kind));
  const page = items.slice(offset, offset + limit);
  return C.RevenueKpiPendingListSchema.parse({ items: page, nextOffset: offset + limit < items.length ? offset + limit : null });
}

// Cross-module read for every profile (staff/ptch included). Deliberately does
// not go through `pfresh`/`listTasks`: those provision performance storage on
// first touch, which a read-only chatbot tool must not do. Authorization still
// goes through the existing policy path (canReadTask → task.read_self).
export async function getMyTasks(user: AuthenticatedUser, period?: string) {
  const p = period === undefined || period === null
    ? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)
    : C.PerformanceMonth.parse(period);
  if (process.env.PERFORMANCE_KPI_ENABLED !== 'true') throw new WorkflowError(503, 'PERFORMANCE_KPI_DISABLED', 'KPI hiệu suất chưa được bật.');
  const u = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
  if (!['hr', 'am', 'sm', 'ptch', 'staff'].includes(u.authorization?.profile ?? '')) throw new WorkflowError(403, 'RBAC_DENIED', 'Bạn chưa có quyền sử dụng KPI hiệu suất.');
  if (!u.employeeId) return C.RevenueKpiMyTasksSchema.parse({ period: p, items: [] });
  const rows = await Task.find({ kpiPeriod: p, $or: [{ assigneeEmployeeId: u.employeeId }, { 'responsibilitySegments.employeeId': u.employeeId }] }).sort({ dueAt: 1, _id: 1 }).limit(PENDING_MAX + 1).lean();
  const items = [];
  for (const row of rows.slice(0, PENDING_MAX)) {
    const t = taskDto(row);
    await canReadTask(u, t);
    items.push({ taskId: t.id, period: t.kpiPeriod, title: t.title, status: t.status, dueAt: t.dueAt });
  }
  return C.RevenueKpiMyTasksSchema.parse({ period: p, items });
}
