import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import {
  ScheduleDateSchema, ScheduleDraftInputSchema, ScheduleChangeCreateSchema, ScheduleChangeActionSchema, ShiftDefinitionInputSchema,
  type AuthorizationCapability, type ScheduleAssignment, type ScheduleChange, type OperationalScheduleWeek as ScheduleWeek, type SchedulingAccess, type PersonalSchedule,
} from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { OperationalShiftModel as Shift, OperationalWeekModel as Week } from '../models/OperationalSchedule.js';
import { EmployeeModel } from '../models/Employee.js';
import { UserModel } from '../models/User.js';
import { requireCapability, resourceScope, managedEmployeeIds } from './authorization-scope.service.js';
import { resolvePrincipal, securityVersion } from './principal.service.js';
import { WorkflowError, objectId } from './project-workflow.service.js';
import { withCrmWriter } from './crm-writer.service.js';
import { digest } from './project-audit.service.js';
import { notifyUser } from './notification.service.js';

const pending = (r: ScheduleChange) => ['PENDING_MANAGER', 'PENDING_RECEIVER', 'PENDING_REQUESTER', 'READY_FOR_REVIEW'].includes(r.status);
const fail = (code: string, message: string, status = 409): never => { throw new WorkflowError(status, code, message); };
const idFor = (text: string) => objectId(createHash('sha256').update(text).digest('hex').slice(0, 24));
const parse = <T>(schema: { safeParse: (value: unknown) => any }, input: unknown): T => {
  const parsed = schema.safeParse(input); if (!parsed.success) fail('VALIDATION_FAILED', 'Nội dung, ngày hoặc phiên bản không hợp lệ.', 400);
  return parsed.data;
};
export function datePlus(date: string, days: number): string { return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
export function validateWeek(date: string) {
  parse(ScheduleDateSchema, date);
  if (new Date(date + 'T00:00:00Z').getUTCDay() !== 1) fail('INVALID_WEEK', 'Tuần lịch phải bắt đầu vào thứ Hai.', 400);
  return date;
}
export function assignmentTimes(a: Pick<ScheduleAssignment, 'date' | 'intervals'>) {
  const start = Date.parse(a.date + 'T00:00:00+07:00');
  return a.intervals.map((p) => ({ start: start + p.startMinute * 60000, end: start + p.endMinute * 60000 }));
}
const future = (a: ScheduleAssignment) => assignmentTimes(a).every((p) => p.start > Date.now());
export const isUrgentScheduleChange = (source: ScheduleAssignment, target: ScheduleAssignment | null, now = Date.now()) =>
  Math.min(...assignmentTimes(source).map(t => t.start), ...(target ? assignmentTimes(target).map(t => t.start) : [])) - now < 86400000;
const state = (row: any) => ({ storeId: String(row.storeId), weekStart: row.weekStart ?? null, version: row.version,
  ...(row.weekStart ? { draft: row.draft, published: row.published, requests: row.requests, publishedAt: row.publishedAt }
    : { code: row.code, name: row.name, intervals: row.intervals, active: row.active }) });
function entry(row: any, changes: any, actorId: string, action: string, reason: string, notices: any[] = []) {
  const payload = { id: randomUUID(), actorId, action, reason, at: new Date().toISOString(),
    previousHash: row?.history?.at(-1)?.hash ?? '0'.repeat(64),
    stateHash: digest(state({ ...row, ...changes })), version: changes.version, notices };
  return { ...payload, hash: digest(payload) };
}
// Used by the authenticated, pinned test-database operator; never an HTTP write bypass.
export { entry as scheduleAuditEntry };
export function verifySchedule(row: any) {
  let previous = '0'.repeat(64);
  for (const e of row.history ?? []) { const { hash, ...payload } = e; if (payload.previousHash !== previous || digest(payload) !== hash) fail('SCHEDULE_AUDIT_INVALID', 'Lịch sử lịch làm không khớp; cần đối chiếu.'); previous = hash; }
  if (!row.history?.length || row.history.at(-1).version !== row.version || row.history.at(-1).stateHash !== digest(state(row))) fail('SCHEDULE_AUDIT_INVALID', 'Trạng thái lịch không khớp lịch sử.');
}
async function record(model: any, row: any, changes: any, actor: AuthenticatedUser, action: string, reason: string, notices: any[] = []) {
  verifySchedule(row);
  const after = { ...row, ...changes, version: row.version + 1 };
  const e = entry(row, after, actor.userId, action, reason, notices);
  if (row.history.length >= 500 || mongoose.mongo.BSON.calculateObjectSize({ ...after, history: [...row.history, e] }) > 8 * 1024 * 1024)
    fail('SCHEDULE_STORAGE_LIMIT', 'Lịch đạt giới hạn lưu trữ. Cần lưu trữ lịch sử trước khi tiếp tục.');
  const saved = await model.findOneAndUpdate({ _id: row._id, version: row.version }, { $set: changes, $inc: { version: 1 }, $push: { history: e } }, { new: true, runValidators: true }).lean();
  if (!saved) fail('SCHEDULE_VERSION_CONFLICT', 'Lịch vừa thay đổi. Tải lại và đối chiếu bản đang sửa.');
  return saved;
}
function checkVersion(row: any, expected: number) { if (row.version !== expected) fail('SCHEDULE_VERSION_CONFLICT', 'Lịch vừa thay đổi. Tải lại và đối chiếu bản đang sửa.'); }
function authorizeStore(user: AuthenticatedUser, storeId: string, cap: AuthorizationCapability) {
  requireCapability(user, cap, resourceScope(user, { storeId, storeMappingRef: 'scheduling-canonical' }));
}
const storeAllowed = (user: AuthenticatedUser, storeId: string, cap: AuthorizationCapability) => {
  try { authorizeStore(user, storeId, cap); return true; } catch { return false; }
};
export function schedulingAccess(user: AuthenticatedUser): SchedulingAccess {
  const own = (cap: AuthorizationCapability) => { try { requireCapability(user, cap, { employeeId: user.employeeId }); return true; } catch { return false; } };
  return { employeeId: user.employeeId ?? null, canReadSelf: own('schedules.read_self'), canRequest: own('schedule_changes.request'), canRespond: own('schedule_changes.respond'),
    stores: (user.canonical?.verifiedStores ?? []).map((s) => ({ id: s.id, name: s.name,
      canRead: storeAllowed(user, s.id, 'schedules.read_store'), canManage: storeAllowed(user, s.id, 'schedules.manage'),
      canPublish: storeAllowed(user, s.id, 'schedules.publish'), canConfigure: storeAllowed(user, s.id, 'shifts.manage'), canReview: storeAllowed(user, s.id, 'schedule_changes.review'),
    })).filter((s) => s.canRead || s.canManage || s.canConfigure) };
}
const writer = <T>(user: AuthenticatedUser, work: (fresh: AuthenticatedUser) => Promise<T>) => withCrmWriter(async () => {
  const fresh = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
  return work(fresh);
});
async function weekRow(id: string) { const row: any = await Week.findById(objectId(id)).lean(); if (!row) fail('RESOURCE_NOT_FOUND', 'Không tìm thấy tuần lịch.', 404); verifySchedule(row); return row; }
const shiftDto = (r: any) => ({ id: String(r._id), storeId: String(r.storeId), code: r.code, name: r.name, intervals: r.intervals, active: r.active, version: r.version });
export function weekDto(row: any): ScheduleWeek {
  return { id: String(row._id), storeId: String(row.storeId), weekStart: row.weekStart, version: row.version,
    draft: row.draft, published: row.published, requests: row.requests, publishedAt: row.publishedAt,
    hasUnpublishedChanges: digest(row.draft) !== digest(row.published),
    pendingNotifications: row.history.flatMap((e: any) => e.notices ?? []).filter((n: any) => !row.deliveredNoticeIds.includes(n.id)).length,
    history: row.history.map(({ at, actorId, action, reason }: any) => ({ at, actorId, action, reason })) };
}
export async function listShifts(user: AuthenticatedUser, storeId: string) {
  if (!storeAllowed(user, storeId, 'schedules.read_store')) authorizeStore(user, storeId, 'shifts.manage');
  const rows: any[] = await Shift.find({ storeId: objectId(storeId) }).sort({ code: 1 }).limit(501).lean();
  if (rows.length > 500) fail('SCHEDULE_READ_LIMIT', 'Danh mục ca quá lớn, cần lưu trữ trước.');
  rows.forEach(verifySchedule); return { items: rows.map(shiftDto) };
}
export async function saveShift(user: AuthenticatedUser, storeId: string, input: unknown, expectedVersion: number) {
  const value = parse<any>(ShiftDefinitionInputSchema, input);
  return writer(user, async (actor) => {
    authorizeStore(actor, storeId, 'shifts.manage');
    const normalized = { ...value, code: value.code.normalize('NFC').toUpperCase(), intervals: [...value.intervals].sort((a: any, b: any) => a.startMinute - b.startMinute) };
    const id = idFor('shift-v1:' + storeId + ':' + normalized.code);
    const row: any = await Shift.findById(id).lean();
    if (row) { checkVersion(row, expectedVersion); return shiftDto(await record(Shift, row, normalized, actor, 'SHIFT_UPDATED', 'Cập nhật danh mục ca; giữ giờ đã lưu trong lịch cũ.')); }
    if (expectedVersion !== 0) fail('SCHEDULE_VERSION_CONFLICT', 'Mã ca không còn tồn tại.');
    if (await Shift.countDocuments({ storeId: objectId(storeId) }) >= 500) fail('SCHEDULE_STORAGE_LIMIT', 'Danh mục ca đạt giới hạn.');
    const initial = { _id: id, storeId: objectId(storeId), ...normalized, version: 1 };
    return shiftDto((await Shift.create({ ...initial, history: [entry(null, initial, actor.userId, 'SHIFT_CREATED', 'Quản lý cấu hình giờ ca.')] })).toObject());
  });
}
async function eligiblePerson(actor: AuthenticatedUser, storeId: string, employeeId: string) {
  const person: any = await EmployeeModel.collection.findOne({ _id: objectId(employeeId), status: 'active', lifecyclePendingRequestId: null, storeMappingRef: { $type: 'string', $ne: '' } });
  if (!person || String(person.storeId) !== storeId && !(person.smCoverRef && person.storeIds?.some((id: any) => String(id) === storeId)))
    fail('SCHEDULE_PERSON_UNAVAILABLE', 'Nhân viên không còn hoạt động hoặc chưa được xác minh tại cửa hàng.');
  if (actor.employeeId !== employeeId && !managedEmployeeIds(actor, storeId, 'schedules.manage').includes(employeeId))
    fail('RBAC_DENIED', 'Nhân viên ngoài quan hệ quản lý được cấp.', 403);
  return person;
}
export async function scheduleRoster(user: AuthenticatedUser, storeId: string) {
  authorizeStore(user, storeId, 'schedules.manage');
  const ids = [...new Set([...(managedEmployeeIds(user, storeId, 'schedules.manage')), ...(user.employeeId ? [user.employeeId] : [])])];
  const rows: any[] = await EmployeeModel.find({ _id: { $in: ids.map(objectId) }, status: 'active', lifecyclePendingRequestId: null,
    storeMappingRef: { $type: 'string', $ne: '' }, $or: [{ storeId: objectId(storeId) }, { storeIds: objectId(storeId), smCoverRef: { $type: 'string', $ne: '' } }] })
    .select('fullName full_name employeeCode employee_code job_title').sort({ fullName: 1, _id: 1 }).limit(1001).lean();
  if (rows.length > 1000) fail('SCHEDULE_READ_LIMIT', 'Danh sách nhân viên quá lớn.');
  return { items: rows.map((p) => ({ employeeId: String(p._id), fullName: p.fullName || p.full_name || '', employeeCode: p.employeeCode || p.employee_code || '', jobTitle: p.job_title ?? null })) };
}
export async function getStoreWeek(user: AuthenticatedUser, storeId: string, weekStart: string) {
  authorizeStore(user, storeId, 'schedules.read_store'); validateWeek(weekStart);
  const row: any = await Week.findById(idFor('schedule-v1:' + storeId + ':' + weekStart)).lean();
  if (!row) return { week: null }; verifySchedule(row); return { week: weekDto(row) };
}
export async function createWeek(user: AuthenticatedUser, storeId: string, weekStart: string) {
  validateWeek(weekStart);
  return writer(user, async (actor) => {
    authorizeStore(actor, storeId, 'schedules.manage');
    const id = idFor('schedule-v1:' + storeId + ':' + weekStart), existing: any = await Week.findById(id).lean();
    if (existing) { verifySchedule(existing); return weekDto(existing); }
    const initial = { _id: id, storeId: objectId(storeId), weekStart, version: 1, draft: [], published: [], requests: [], publishedAt: null, deliveredNoticeIds: [] };
    return weekDto((await Week.create({ ...initial, history: [entry(null, initial, actor.userId, 'WEEK_CREATED', 'Tạo bản nháp lịch tuần.')] })).toObject());
  });
}

async function checkOverlaps(row: any, assignments: ScheduleAssignment[]) {
  const others: any[] = await Week.find({ _id: { $ne: row._id }, weekStart: { $gte: datePlus(row.weekStart, -7), $lte: datePlus(row.weekStart, 7) },
    $or: [{ 'draft.employeeId': { $in: assignments.map((a) => a.employeeId) } }, { 'published.employeeId': { $in: assignments.map((a) => a.employeeId) } }] }).limit(1001).lean();
  if (others.length > 1000) fail('SCHEDULE_READ_LIMIT', 'Chưa kiểm tra hết lịch liên quan.');
  others.forEach(verifySchedule);
  const external = others.flatMap((w) => [...w.draft, ...w.published]);
  for (let index = 0; index < assignments.length; index++) {
    const a = assignments[index];
    for (const b of [...assignments.slice(index + 1), ...external]) {
      if (a.employeeId === b.employeeId && assignmentTimes(a).some((x) => assignmentTimes(b).some((y) => x.start < y.end && y.start < x.end)))
        fail('SCHEDULE_OVERLAP', 'Nhân viên có khoảng giờ trùng với ca khác. Kiểm tra cả ca qua đêm và cửa hàng khác.');
    }
  }
}
async function validatePublication(actor: AuthenticatedUser, row: any, assignments: ScheduleAssignment[], retainExistingHours = false) {
  for (const a of assignments) {
    const old = row.published.find((p: ScheduleAssignment) => p.id === a.id);
    if (!old || digest(old) !== digest(a) || future(a)) await eligiblePerson(actor, String(row.storeId), a.employeeId);
    if (!old || digest(old) !== digest(a)) {
      if (!future(a)) fail('SCHEDULE_ALREADY_STARTED', 'Không sửa hoặc công bố ca mới đã bắt đầu.');
      if (retainExistingHours && old && old.shiftId === a.shiftId && old.date === a.date && old.shiftVersion === a.shiftVersion && digest(old.intervals) === digest(a.intervals)) continue;
      const definition: any = await Shift.findById(objectId(a.shiftId)).lean();
      if (!definition || !definition.active || String(definition.storeId) !== String(row.storeId) || definition.version !== a.shiftVersion)
        fail('SHIFT_DEFINITION_CHANGED', 'Cấu hình ca đã thay đổi hoặc ngừng dùng. Chọn lại ca trước khi công bố.');
      verifySchedule(definition);
    }
  }
  for (const old of row.published) if (!assignments.some((a) => a.id === old.id && digest(a) === digest(old)) && !future(old))
    fail('SCHEDULE_ALREADY_STARTED', 'Không sửa hoặc xóa ca đã bắt đầu khỏi lịch đã công bố.');
  await checkOverlaps(row, assignments);
}
export async function saveDraft(user: AuthenticatedUser, weekId: string, input: unknown) {
  const body = parse<import('@hr-blockbot/contracts').ScheduleDraftInput>(ScheduleDraftInputSchema, input);
  return writer(user, async (actor) => {
    const row = await weekRow(weekId); authorizeStore(actor, String(row.storeId), 'schedules.manage'); checkVersion(row, body.expectedVersion);
    const assignments: ScheduleAssignment[] = [];
    for (const a of body.assignments) {
      if (a.date < row.weekStart || a.date > datePlus(row.weekStart, 6)) fail('INVALID_SCHEDULE_DATE', 'Ca phải nằm trong tuần được chọn.', 400);
      const person = await eligiblePerson(actor, String(row.storeId), a.employeeId);
      const old = row.draft.find((d: ScheduleAssignment) => d.id === a.id);
      if (old && old.employeeId === a.employeeId && old.shiftId === a.shiftId && old.date === a.date) { assignments.push(old); continue; }
      const shift: any = await Shift.findById(objectId(a.shiftId)).lean();
      if (!shift || !shift.active || String(shift.storeId) !== String(row.storeId)) fail('SHIFT_UNAVAILABLE', 'Mã ca chưa được cấu hình hoặc không thuộc cửa hàng.');
      verifySchedule(shift);
      assignments.push({ ...a, employeeName: person.fullName || person.full_name || '', employeeCode: person.employeeCode || person.employee_code || '',
        shiftCode: shift.code, shiftName: shift.name, shiftVersion: shift.version, intervals: shift.intervals });
    }
    await validatePublication(actor, row, assignments);
    return weekDto(await record(Week, row, { draft: assignments }, actor, 'DRAFT_SAVED', body.reason));
  });
}
async function noticeUsers(employeeIds: (string | null)[], message: string) {
  employeeIds = employeeIds.filter((id): id is string => !!id);
  const people: any[] = await EmployeeModel.find({ _id: { $in: employeeIds.map(id => objectId(id!)) } }).select('userId').lean();
  const rows: any[] = await UserModel.find({ _id: { $in: people.map((p) => p.userId).filter(Boolean) }, employeeId: { $in: employeeIds.map(id => objectId(id!)) }, status: 'active' }).select('_id employeeId').lean();
  return rows.filter((u) => people.some((p) => String(p._id) === String(u.employeeId) && String(p.userId) === String(u._id)))
    .map((u) => ({ id: randomUUID(), userId: String(u._id), employeeId: String(u.employeeId), message }));
}
async function reviewNotices(actor: AuthenticatedUser, row: any, conflicts: (string | null)[]) {
  const store = actor.canonical?.verifiedStores.find((s) => s.id === String(row.storeId));
  const candidates: any[] = await UserModel.find({ status: 'active', 'authorization.grants': { $elemMatch: {
    capabilities: 'schedule_changes.review', $or: [{ 'scope.storeIds': String(row.storeId) }, ...(store?.regionId ? [{ 'scope.regionIds': store.regionId }] : [])],
  } } }).select('_id role securityVersion employeeId').limit(101).lean();
  const notices: any[] = [];
  if (candidates.length > 100) fail('SCHEDULE_READ_LIMIT', 'Chưa xác định hết người nhận thông báo quản lý.');
  for (const u of candidates) {
    if (conflicts.includes(String(u._id))) continue;
    try { const current = await resolvePrincipal({ sub: String(u._id), role: u.role, securityVersion: securityVersion(u) });
      if (storeAllowed(current, String(row.storeId), 'schedule_changes.review')) notices.push({ id: randomUUID(), userId: String(u._id), employeeId: String(u.employeeId), message: 'Có yêu cầu đổi ca chờ quản lý xem xét.' });
    } catch { /* Unavailable/revoked actors are not notification recipients. */ }
  }
  return notices;
}
async function deliver(row: any) {
  verifySchedule(row);
  for (const n of row.history.flatMap((e: any) => e.notices ?? [])) {
    if (row.deliveredNoticeIds.includes(n.id)) continue;
    try {
      if (n.audience === 'SM_STATUS') {
        const u: any = await UserModel.findById(n.userId).lean();
        if (!u) continue;
        const current = await resolvePrincipal({ sub: String(u._id), role: u.role, securityVersion: securityVersion(u) });
        const managed = managedEmployeeIds(current, String(row.storeId), 'schedules.manage');
        if (current.authorization?.profile !== 'sm' || !storeAllowed(current, String(row.storeId), 'schedules.read_store')
          || !n.subjectEmployeeIds?.some((id: string) => id === current.employeeId || managed.includes(id))) continue;
      }
      await notifyUser({ userId: n.userId, employeeId: n.employeeId, type: 'system', title: 'Lịch làm & phân ca', body: n.message,
        dedupeKey: 'schedule:' + String(row._id) + ':' + n.id, entityKind: 'schedule', entityId: String(row._id) });
      await Week.updateOne({ _id: row._id }, { $addToSet: { deliveredNoticeIds: n.id } });
    } catch { /* The committed event remains pending; an authorized retry is idempotent. */ }
  }
  return weekDto(await weekRow(String(row._id)));
}
export async function retryScheduleNotices(user: AuthenticatedUser, weekId: string) {
  const row = await weekRow(weekId); authorizeStore(user, String(row.storeId), 'schedules.publish'); return deliver(row);
}
export async function publishWeek(user: AuthenticatedUser, weekId: string, expectedVersion: number, reason: string) {
  const saved = await writer(user, async (actor) => {
    const row = await weekRow(weekId); authorizeStore(actor, String(row.storeId), 'schedules.publish');
    // Publishing requires assignment authority for every person, not only a publish flag.
    authorizeStore(actor, String(row.storeId), 'schedules.manage'); checkVersion(row, expectedVersion);
    await validatePublication(actor, row, row.draft);
    if (row.publishedAt && digest(row.draft) === digest(row.published)) return row;
    const requests = row.requests.map((r: ScheduleChange) => pending(r) ? { ...r, status: 'CANCELLED', decisionReason: 'Lịch được công bố lại; gửi yêu cầu mới nếu còn cần đổi.' } : r);
    const affected = [...new Set([...row.published, ...row.draft].map((a: ScheduleAssignment) => a.employeeId))] as string[];
    return record(Week, row, { published: row.draft, publishedAt: new Date().toISOString(), requests }, actor, 'WEEK_PUBLISHED', reason,
      await noticeUsers(affected, 'Lịch làm tuần ' + row.weekStart + ' đã được công bố hoặc cập nhật. Mở Lịch của tôi để xem.'));
  });
  return deliver(saved);
}
export async function personalSchedule(user: AuthenticatedUser, from: string, to: string, includeLegacy = false): Promise<PersonalSchedule> {
  requireCapability(user, 'schedules.read_self', { employeeId: user.employeeId });
  parse(ScheduleDateSchema, from); parse(ScheduleDateSchema, to);
  if (to < from || Date.parse(to) - Date.parse(from) > 41 * 86400000) fail('INVALID_DATE_RANGE', 'Chọn tối đa 6 tuần lịch.', 400);
  const rows: any[] = await Week.find({ weekStart: { $gte: datePlus(from, -7), $lte: to }, $or: [
    { 'published.employeeId': user.employeeId }, { 'requests.requesterEmployeeId': user.employeeId }, { 'requests.receiverEmployeeId': user.employeeId },
  ] }).sort({ weekStart: 1 }).limit(201).lean();
  if (rows.length > 200) fail('SCHEDULE_READ_LIMIT', 'Có quá nhiều lịch liên quan.');
  const stores = await mongoose.connection.collection('stores').find({ _id: { $in: rows.map((w) => w.storeId) } }, { projection: { store_name: 1 } }).toArray();
  const names = new Map(stores.map((s) => [String(s._id), String(s.store_name)]));
  const assignments: PersonalSchedule['assignments'] = [], requests: PersonalSchedule['requests'] = [];
  const rangeStart = Date.parse(from + 'T00:00:00+07:00'), rangeEnd = Date.parse(datePlus(to, 1) + 'T00:00:00+07:00');
  const intersects = (a: ScheduleAssignment) => assignmentTimes(a).some((p) => p.start < rangeEnd && p.end > rangeStart);
  for (const row of rows) {
    verifySchedule(row);
    for (const a of row.published) if (a.employeeId === user.employeeId && intersects(a))
      assignments.push({ ...a, weekId: String(row._id), weekVersion: row.version, storeId: String(row.storeId), storeName: names.get(String(row.storeId)) ?? 'Cửa hàng' });
    for (const r of row.requests) if ((r.requesterEmployeeId === user.employeeId || r.receiverEmployeeId === user.employeeId) && (intersects(r.source) || r.target && intersects(r.target)))
      requests.push({ ...r, weekId: String(row._id), weekVersion: row.version, storeName: names.get(String(row.storeId)) ?? 'Cửa hàng' });
  }
  if (!includeLegacy) return { from, to, assignments, requests };
  const employee: any = await EmployeeModel.findById(user.employeeId).select('employeeCode employee_code').lean();
  const code = String(employee?.employeeCode || employee?.employee_code || '').trim();
  const source = code ? await mongoose.connection.collection('schedule_entries').find({ employee_code: { $regex: '^' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' },
    row_kind: 'employee', work_date: { $gte: from, $lte: to } }, { projection: { work_date: 1, shift_code: 1, schedule_type: 1 } }).sort({ work_date: 1, _id: 1 }).limit(501).toArray() : [];
  return { from, to, assignments, requests, legacyEntries: source.slice(0, 500).map((r) => ({ id: String(r._id), date: String(r.work_date), shiftCode: String(r.shift_code), sourceType: String(r.schedule_type) })), legacyTruncated: source.length > 500 };
}
export async function schedulePartners(user: AuthenticatedUser, weekId: string) {
  requireCapability(user, 'schedule_changes.request', { employeeId: user.employeeId });
  const row = await weekRow(weekId);
  if (!row.published.some((a: ScheduleAssignment) => a.employeeId === user.employeeId && future(a))) fail('RBAC_DENIED', 'Không có ca sắp tới của bạn trong tuần này.', 403);
  requireCapability(user, 'directory.read_store', resourceScope(user, { storeId: row.storeId, storeMappingRef: 'verified' }));
  const people: any[] = await EmployeeModel.find({ storeId: row.storeId, status: 'active', storeMappingRef: { $type: 'string', $ne: '' }, lifecyclePendingRequestId: null })
    .select('fullName full_name employeeCode employee_code userId').sort({ fullName: 1 }).limit(1001).lean();
  if (people.length > 1000) fail('SCHEDULE_READ_LIMIT', 'Danh sách quá lớn.');
  const users: any[] = await UserModel.find({ _id: { $in: people.map((p) => p.userId).filter(Boolean) }, status: 'active', 'authorization.grants.capabilities': 'schedule_changes.respond' }).select('_id employeeId').lean();
  return { items: people.filter((p) => String(p._id) !== user.employeeId && users.some((u) => String(u.employeeId) === String(p._id) && String(u._id) === String(p.userId)))
    .map((p) => ({ employeeId: String(p._id), fullName: p.fullName || p.full_name || '', employeeCode: p.employeeCode || p.employee_code || '',
      assignments: row.published.filter((a: ScheduleAssignment) => a.employeeId === String(p._id) && future(a)).map((a: ScheduleAssignment) => ({ id: a.id, date: a.date, shiftCode: a.shiftCode, intervals: a.intervals })) })) };
}

async function participant(employeeId: string, storeId: string, cap: 'schedule_changes.request' | 'schedule_changes.respond') {
  const person: any = await EmployeeModel.collection.findOne({ _id: objectId(employeeId), status: 'active', lifecyclePendingRequestId: null, storeMappingRef: { $type: 'string', $ne: '' } });
  if (!person || String(person.storeId) !== storeId && !(person.smCoverRef && person.storeIds?.some((id: any) => String(id) === storeId)))
    fail('SCHEDULE_PERSON_UNAVAILABLE', 'Người tham gia không còn làm việc tại cửa hàng.');
  const account: any = person.userId ? await UserModel.findById(person.userId).lean() : null;
  if (!account || String(account.employeeId) !== employeeId) fail('SCHEDULE_PERSON_UNAVAILABLE', 'Người tham gia chưa có tài khoản hợp lệ.');
  let current: AuthenticatedUser;
  try { current = await resolvePrincipal({ sub: String(account._id), role: account.role, securityVersion: securityVersion(account) }); }
  catch (error: any) { if (error?.status === 401) fail('SCHEDULE_PERSON_UNAVAILABLE', 'Tài khoản người tham gia không còn hợp lệ.'); throw error; }
  requireCapability(current, cap, { employeeId });
  return { person, userId: String(account._id) };
}
function occupied(row: any, assignmentId: string, exclude?: string) {
  return row.requests.some((r: ScheduleChange) => r.id !== exclude && pending(r) && (r.source.id === assignmentId || r.target?.id === assignmentId));
}
function assertChangeSnapshot(row: any, r: ScheduleChange) {
  if (!future(r.source) || !row.published.some((a: ScheduleAssignment) => digest(a) === digest(r.source))
    || r.kind === 'SWAP' && (!r.target || !future(r.target) || !row.published.some((a: ScheduleAssignment) => digest(a) === digest(r.target))))
    fail('SCHEDULE_REQUEST_STALE', 'Ca đã đổi hoặc đã bắt đầu; cần gửi đề nghị mới.');
}
async function consentAssignments(row: any, r: ScheduleChange) {
  assertChangeSnapshot(row, r);
  if (!r.receiverEmployeeId || !r.receiverUserId) fail('INVALID_RECEIVER', 'Chưa có người nhận ca.', 400);
  const requester = await participant(r.requesterEmployeeId, String(row.storeId), 'schedule_changes.request');
  const receiver = await participant(r.receiverEmployeeId!, String(row.storeId), 'schedule_changes.respond');
  if (requester.userId !== r.requesterUserId || receiver.userId !== r.receiverUserId) fail('SCHEDULE_PARTICIPANT_CHANGED', 'Liên kết tài khoản đã thay đổi.');
  if (r.target && digest(assignmentTimes(r.target)) === digest(assignmentTimes(r.source))) fail('SWAP_SAME_TIME', 'Hai ca cùng khoảng giờ không tạo thành đổi ca hai chiều.');
  const replace = (a: ScheduleAssignment, p: any) => ({ ...a, employeeId: String(p._id), employeeName: p.fullName || p.full_name || '', employeeCode: p.employeeCode || p.employee_code || '' });
  const assignments = row.published.map((a: ScheduleAssignment) => a.id === r.source.id ? replace(a, receiver.person)
    : r.target && a.id === r.target.id ? replace(a, requester.person) : a);
  // No employee gains a general publish grant: only these fixed consented IDs/persons can change.
  await checkOverlaps(row, assignments);
  return assignments;
}
function independentReviewer(actor: AuthenticatedUser, row: any, r: ScheduleChange) {
  requireCapability(actor, 'schedule_changes.review', { ...resourceScope(actor, { storeId: row.storeId, storeMappingRef: 'verified', employeeId: r.requesterEmployeeId }),
    requiresIndependentApproval: true, requesterUserId: r.requesterUserId, subjectEmployeeId: r.requesterEmployeeId,
    conflictUserIds: [r.requesterUserId, ...(r.receiverUserId ? [r.receiverUserId] : [])] });
  if ([r.requesterEmployeeId, r.receiverEmployeeId].includes(actor.employeeId ?? '')) fail('SELF_APPROVAL', 'Người tham gia không tự điều phối/duyệt ca của mình.', 403);
  authorizeStore(actor, String(row.storeId), 'schedules.manage');
}
async function storeSmNotices(row: any, r: ScheduleChange) {
  const users: any[] = await UserModel.find({ status: 'active', 'authorization.profile': 'sm' }).select('_id employeeId role securityVersion').limit(1001).lean();
  if (users.length > 1000) fail('SCHEDULE_READ_LIMIT', 'Chưa kiểm tra hết SM nhận thông báo.');
  const notices: any[] = [];
  for (const u of users) try {
    const current = await resolvePrincipal({ sub: String(u._id), role: u.role, securityVersion: securityVersion(u) });
    const managed = managedEmployeeIds(current, String(row.storeId), 'schedules.manage');
    if (!storeAllowed(current, String(row.storeId), 'schedules.read_store') || ![r.requesterEmployeeId, r.receiverEmployeeId].some(id => id === current.employeeId || id && managed.includes(id))) continue;
    notices.push({ id: randomUUID(), userId: current.userId, employeeId: current.employeeId, audience: 'SM_STATUS', subjectEmployeeIds: [r.requesterEmployeeId, r.receiverEmployeeId].filter(Boolean),
      message: `Đã ${r.kind === 'SWAP' ? 'đổi ca' : 'nhận ca thay'}: ${r.source.employeeName} → ${r.receiverName || 'người nhận'} · ${r.source.date} · ${r.source.shiftCode}; ${r.target ? `ca đổi lại ${r.target.date} · ${r.target.shiftCode}; ` : ''}lý do: ${r.reason}. Xem lịch cửa hàng và lịch sử để đối chiếu.` });
  } catch (error: any) { if (![401, 403].includes(error?.status)) throw error; }
  return notices;
}
async function actConsentChange(actor: AuthenticatedUser, row: any, r: ScheduleChange, body: any) {
  const requester = actor.userId === r.requesterUserId && actor.employeeId === r.requesterEmployeeId;
  const receiver = actor.userId === r.receiverUserId && actor.employeeId === r.receiverEmployeeId;
  if (['SELECT', 'APPROVE', 'REJECT'].includes(body.action)) {
    independentReviewer(actor, row, r); await eligiblePerson(actor, String(row.storeId), r.requesterEmployeeId);
    if (r.arrangement !== 'MANAGER') fail('INVALID_SCHEDULE_ACTION', 'Đổi ca trực tiếp không có bước duyệt/từ chối của quản lý.', 403);
  }
  else {
    if (!requester && !receiver) fail('RBAC_DENIED', 'Bạn không tham gia yêu cầu này.', 403);
    requireCapability(actor, receiver ? 'schedule_changes.respond' : 'schedule_changes.request', { employeeId: actor.employeeId });
  }
  checkVersion(row, body.expectedVersion);
  if (!pending(r)) fail('SCHEDULE_REQUEST_CLOSED', 'Yêu cầu đã kết thúc.');
  const next: ScheduleChange = { ...r, decisionReason: body.reason };
  let published = row.published, draft = row.draft;
  if (body.action === 'CANCEL' && requester) next.status = 'CANCELLED';
  else if (body.action === 'REJECT') next.status = 'REJECTED';
  else if (body.action === 'DECLINE' && receiver && r.status === 'PENDING_RECEIVER') {
    if (r.arrangement === 'MANAGER' && r.kind === 'COVER') { next.status = 'PENDING_MANAGER'; next.receiverEmployeeId = null; next.receiverUserId = null; next.receiverName = null; next.managerDecision = null; }
    else next.status = 'REJECTED';
  } else if (['SELECT', 'APPROVE'].includes(body.action) && r.arrangement === 'MANAGER' && r.status === 'PENDING_MANAGER') {
    if (r.kind === 'SWAP' && (body.action !== 'APPROVE' || body.receiverEmployeeId)) fail('INVALID_SCHEDULE_ACTION', 'Ca đổi hai chiều đã được người đề nghị chọn; không thay một phía.', 400);
    const id = body.receiverEmployeeId || r.receiverEmployeeId;
    if (!id || id === r.requesterEmployeeId || id === actor.employeeId) fail('INVALID_RECEIVER', 'Chọn người khác người đề nghị và người điều phối.', 400);
    const person = await participant(id, String(row.storeId), 'schedule_changes.respond');
    await eligiblePerson(actor, String(row.storeId), id);
    next.receiverEmployeeId = id; next.receiverUserId = person.userId;
    next.receiverName = person.person.fullName || person.person.full_name || '';
    next.managerDecision = { userId: actor.userId, employeeId: actor.employeeId!, securityVersion: actor.securityVersion ?? 0, at: new Date().toISOString(), reason: body.reason };
    if ((r.selectionHistory?.length ?? 0) >= 20) fail('SCHEDULE_STORAGE_LIMIT', 'Đạt giới hạn điều phối; giữ lịch sử, không ghi đè.');
    next.selectionHistory = [...(r.selectionHistory ?? []), { receiverEmployeeId: id, managerUserId: actor.userId, at: new Date().toISOString(), reason: body.reason }];
    await consentAssignments(row, next); next.status = 'PENDING_RECEIVER';
  } else if (body.action === 'ACCEPT' && receiver && r.status === 'PENDING_RECEIVER') {
    if (body.targetAssignmentId || body.receiverEmployeeId) fail('SCHEDULE_TERMS_CHANGED', 'Không đổi nội dung ca khi xác nhận; gửi đề nghị mới.', 400);
    if (r.arrangement === 'MANAGER') {
      if (!r.managerDecision) fail('SCHEDULE_MANAGER_REQUIRED', 'Chưa có quản lý điều phối.');
      const u: any = await UserModel.findById(r.managerDecision!.userId).lean();
      if (!u) fail('SCHEDULE_MANAGER_UNAVAILABLE', 'Người điều phối không còn hợp lệ.');
      if (securityVersion(u) !== r.managerDecision!.securityVersion) fail('SCHEDULE_MANAGER_UNAVAILABLE', 'Quyền người điều phối đã thay đổi; cần quản lý xem lại.');
      let current: AuthenticatedUser;
      try { current = await resolvePrincipal({ sub: String(u._id), role: u.role, securityVersion: r.managerDecision!.securityVersion }); }
      catch (error: any) { if (error?.status === 401) fail('SCHEDULE_MANAGER_UNAVAILABLE', 'Người điều phối không còn hoạt động.'); throw error; }
      independentReviewer(current, row, r); await eligiblePerson(current, String(row.storeId), r.requesterEmployeeId); await eligiblePerson(current, String(row.storeId), r.receiverEmployeeId!);
    }
    if (digest(row.draft) !== digest(row.published)) fail('SCHEDULE_DRAFT_PENDING', 'Quản lý đang có bản nháp chưa công bố; cần đối chiếu trước khi đổi ca.');
    published = await consentAssignments(row, r); draft = published; next.status = 'APPROVED'; next.completionMode = r.arrangement === 'DIRECT' ? 'CONSENT' : 'MANAGER';
  } else fail('INVALID_SCHEDULE_ACTION', 'Thao tác không phù hợp trạng thái hoặc người xử lý.', 403);
  const notices = await noticeUsers([r.requesterEmployeeId, r.receiverEmployeeId, next.receiverEmployeeId], 'Yêu cầu đổi ca có cập nhật. Mở Lịch của tôi để xem trạng thái và lịch mới nhất.');
  if (next.status === 'PENDING_MANAGER') notices.push(...await reviewNotices(actor, row, [r.requesterUserId, next.receiverUserId]));
  if (next.status === 'APPROVED') notices.push(...await storeSmNotices(row, next));
  return record(Week, row, { requests: row.requests.map((item: ScheduleChange) => item.id === r.id ? next : item), published, draft }, actor,
    next.status === 'APPROVED' ? 'CHANGE_' + next.completionMode + '_APPLIED' : 'CHANGE_' + body.action, body.reason, notices);
}
export async function createScheduleChange(user: AuthenticatedUser, weekId: string, input: unknown) {
  const body = parse<any>(ScheduleChangeCreateSchema, input);
  const row = await writer(user, async (actor) => {
    requireCapability(actor, 'schedule_changes.request', { employeeId: actor.employeeId });
    const row = await weekRow(weekId), id = String(idFor('schedule-change-v1:' + String(row._id) + ':' + actor.userId + ':' + body.clientRequestId));
    const existing = row.requests.find((r: ScheduleChange) => r.id === id);
    if (existing) {
      if (existing.requesterUserId !== actor.userId || existing.kind !== body.kind || existing.source.id !== body.assignmentId || existing.reason !== body.reason
        || (existing.policyVersion === 2
          ? (existing as any).originalReceiverEmployeeId !== (body.receiverEmployeeId ?? null) || (existing as any).originalArrangement !== body.arrangement || (existing.target?.id ?? null) !== (body.targetAssignmentId ?? null)
          : existing.receiverEmployeeId !== body.receiverEmployeeId))
        fail('SCHEDULE_REQUEST_CONFLICT', 'Yêu cầu đã được gửi với nội dung khác.');
      return row;
    }
    checkVersion(row, body.expectedVersion);
    const source = row.published.find((a: ScheduleAssignment) => a.id === body.assignmentId && a.employeeId === actor.employeeId);
    if (!source || !future(source)) fail('SCHEDULE_SOURCE_UNAVAILABLE', 'Chỉ đề nghị đổi ca sắp tới đã công bố của chính bạn.', 403);
    if (body.receiverEmployeeId === actor.employeeId) fail('INVALID_RECEIVER', 'Chọn đồng nghiệp khác để nhận ca.', 400);
    if (occupied(row, source.id)) fail('SCHEDULE_CHANGE_PENDING', 'Ca này đã có yêu cầu đang chờ.');
    if (row.requests.length >= 200) fail('SCHEDULE_STORAGE_LIMIT', 'Tuần lịch đạt giới hạn yêu cầu đổi ca.');
    const requester = await participant(actor.employeeId!, String(row.storeId), 'schedule_changes.request');
    if (body.receiverEmployeeId) requireCapability(actor, 'directory.read_store', resourceScope(actor, { storeId: row.storeId, storeMappingRef: 'verified' }));
    const receiver = body.receiverEmployeeId ? await participant(body.receiverEmployeeId, String(row.storeId), 'schedule_changes.respond') : null;
    const target = body.kind === 'SWAP' ? row.published.find((a: ScheduleAssignment) => a.id === body.targetAssignmentId && a.employeeId === body.receiverEmployeeId) : null;
    if (body.kind === 'SWAP' && (!target || !future(target) || occupied(row, target.id))) fail('SWAP_TARGET_UNAVAILABLE', 'Chọn ca sắp tới của người nhận, cùng tuần và chưa có yêu cầu khác.');
    const urgent = isUrgentScheduleChange(source, target);
    const arrangement = urgent ? 'MANAGER' : body.arrangement;
    const r: ScheduleChange = { id, policyVersion: 2, arrangement, urgent, kind: body.kind, status: arrangement === 'MANAGER' ? 'PENDING_MANAGER' : 'PENDING_RECEIVER', requesterEmployeeId: actor.employeeId!, receiverEmployeeId: body.receiverEmployeeId ?? null,
      requesterUserId: requester.userId, receiverUserId: receiver?.userId ?? null, source, target, reason: body.reason, decisionReason: null,
      managerDecision: null, selectionHistory: [], receiverName: receiver ? receiver.person.fullName || receiver.person.full_name || '' : null };
    Object.assign(r, { originalReceiverEmployeeId: body.receiverEmployeeId ?? null, originalArrangement: body.arrangement });
    if (receiver) await consentAssignments(row, r);
    const notices = arrangement === 'MANAGER' ? await reviewNotices(actor, row, [requester.userId, receiver?.userId ?? null])
      : await noticeUsers([body.receiverEmployeeId], 'Bạn có đề nghị nhận/đổi ca. Kiểm tra ca cụ thể trước khi đồng ý; lịch cập nhật sau xác nhận hợp lệ.');
    return record(Week, row, { requests: [...row.requests, r] }, actor, 'CHANGE_REQUESTED', body.reason,
      notices);
  });
  await deliver(row);
  const id = String(idFor('schedule-change-v1:' + String(row._id) + ':' + user.userId + ':' + body.clientRequestId));
  return { weekVersion: row.version, request: row.requests.find((r: ScheduleChange) => r.id === id) };
}
export async function actScheduleChange(user: AuthenticatedUser, weekId: string, changeId: string, input: unknown) {
  changeId = String(objectId(changeId));
  const body = parse<any>(ScheduleChangeActionSchema, input);
  const saved = await writer(user, async (actor) => {
    const row = await weekRow(weekId), r: ScheduleChange = row.requests.find((r: ScheduleChange) => r.id === changeId);
    if (!r) fail('RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu đổi ca.', 404);
    if (r.policyVersion === 2) return actConsentChange(actor, row, r, body);
    const isRequester = r.requesterUserId === actor.userId && r.requesterEmployeeId === actor.employeeId;
    const isReceiver = r.receiverUserId === actor.userId && r.receiverEmployeeId === actor.employeeId;
    if (['APPROVE', 'REJECT'].includes(body.action)) {
      requireCapability(actor, 'schedule_changes.review', { ...resourceScope(actor, { storeId: row.storeId, storeMappingRef: 'verified', employeeId: r.requesterEmployeeId }),
        requiresIndependentApproval: true, requesterUserId: r.requesterUserId, subjectEmployeeId: r.requesterEmployeeId, conflictUserIds: [r.requesterUserId, ...(r.receiverUserId ? [r.receiverUserId] : [])] });
      if (actor.employeeId === r.requesterEmployeeId || actor.employeeId === r.receiverEmployeeId) fail('SELF_APPROVAL', 'Người tham gia không tự duyệt đổi ca.', 403);
    } else {
      requireCapability(actor, isReceiver ? 'schedule_changes.respond' : 'schedule_changes.request', { employeeId: actor.employeeId });
      if (!isRequester && !isReceiver) fail('RBAC_DENIED', 'Bạn không tham gia yêu cầu này.', 403);
    }
    checkVersion(row, body.expectedVersion);
    if (!pending(r)) fail('SCHEDULE_REQUEST_CLOSED', 'Yêu cầu đã được xử lý.');
    let next: ScheduleChange = { ...r, decisionReason: body.reason }, published = row.published, draft = row.draft;
    if (body.action === 'CANCEL' && isRequester) next.status = 'CANCELLED';
    else if (body.action === 'DECLINE' && isReceiver || body.action === 'REJECT') next.status = 'REJECTED';
    else if (body.action === 'ACCEPT' && isReceiver && r.status === 'PENDING_RECEIVER') {
      await participant(r.receiverEmployeeId!, String(row.storeId), 'schedule_changes.respond');
      if (r.kind === 'SWAP') {
        const target = row.published.find((a: ScheduleAssignment) => a.id === body.targetAssignmentId && a.employeeId === actor.employeeId);
        if (!target || !future(target) || occupied(row, target.id, r.id)) fail('SWAP_TARGET_UNAVAILABLE', 'Chọn ca sắp tới của bạn chưa có yêu cầu khác trong cùng tuần.');
        next.target = target; next.status = 'PENDING_REQUESTER';
      } else next.status = 'READY_FOR_REVIEW';
    } else if (body.action === 'CONFIRM' && isRequester && r.kind === 'SWAP' && r.status === 'PENDING_REQUESTER') next.status = 'READY_FOR_REVIEW';
    else if (body.action === 'APPROVE' && r.status === 'READY_FOR_REVIEW') {
      authorizeStore(actor, String(row.storeId), 'schedules.manage');
      if (digest(row.draft) !== digest(row.published)) fail('SCHEDULE_DRAFT_PENDING', 'Tuần này có bản nháp chưa công bố. Đối chiếu bản nháp trước khi duyệt đổi ca.');
      if (!row.published.some((a: ScheduleAssignment) => digest(a) === digest(r.source)) || !future(r.source)
        || r.kind === 'SWAP' && (!r.target || !future(r.target) || !row.published.some((a: ScheduleAssignment) => digest(a) === digest(r.target))))
        fail('SCHEDULE_REQUEST_STALE', 'Ca đã thay đổi hoặc bắt đầu. Cần tạo đề nghị mới.');
      const requester = await participant(r.requesterEmployeeId, String(row.storeId), 'schedule_changes.request');
      const receiver = await participant(r.receiverEmployeeId!, String(row.storeId), 'schedule_changes.respond');
      if (requester.userId !== r.requesterUserId || receiver.userId !== r.receiverUserId) fail('SCHEDULE_PARTICIPANT_CHANGED', 'Tài khoản người tham gia đã thay đổi.');
      const replacePerson = (a: ScheduleAssignment, person: any) => ({ ...a, employeeId: String(person._id), employeeName: person.fullName || person.full_name || '', employeeCode: person.employeeCode || person.employee_code || '' });
      published = row.published.map((a: ScheduleAssignment) => a.id === r.source.id ? replacePerson(a, receiver.person)
        : r.target && a.id === r.target.id ? replacePerson(a, requester.person) : a);
      await validatePublication(actor, row, published, true); draft = published; next.status = 'APPROVED';
    } else fail('INVALID_SCHEDULE_ACTION', 'Thao tác không phù hợp với người tham gia hoặc trạng thái hiện tại.', 403);
    const notices = await noticeUsers([r.requesterEmployeeId, r.receiverEmployeeId], 'Yêu cầu đổi ca của bạn có cập nhật. Mở Lịch của tôi để xem trạng thái.');
    if (next.status === 'READY_FOR_REVIEW') notices.push(...await reviewNotices(actor, row, [r.requesterUserId, r.receiverUserId]));
    return record(Week, row, { requests: row.requests.map((item: ScheduleChange) => item.id === r.id ? next : item), published, draft }, actor,
      'CHANGE_' + body.action, body.reason, notices);
  });
  await deliver(saved);
  return { weekVersion: saved.version, request: saved.requests.find((r: ScheduleChange) => r.id === changeId) };
}

/** Called under the shared CRM writer before an exit/transfer changes canonical personnel. */
export async function assertNoFuturePublishedSchedules(employeeId: string) {
  const rows: any[] = await Week.find({ 'published.employeeId': employeeId }).limit(1001).lean();
  if (rows.length > 1000) fail('SCHEDULE_READ_LIMIT', 'Chưa đối chiếu hết lịch của nhân viên.');
  for (const row of rows) {
    verifySchedule(row);
    if (row.published.some((a: ScheduleAssignment) => a.employeeId === employeeId && assignmentTimes(a).some((p) => p.end > Date.now())))
      fail('SCHEDULE_COMMITMENTS_REMAIN', 'Nhân viên còn ca đã công bố chưa kết thúc. Cần bố trí lại lịch trước khi nghỉ việc hoặc điều chuyển.');
  }
}
