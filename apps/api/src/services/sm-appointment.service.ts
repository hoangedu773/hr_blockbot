import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { PaginationQuerySchema, SmAppointmentSchema, SmAppointmentProposalSchema, SmAppointmentDecisionSchema } from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { EmployeeModel } from '../models/Employee.js';
import { StoreModel } from '../models/Store.js';
import { UserModel } from '../models/User.js';
import { SmAppointmentModel } from '../models/SmAppointment.js';
import { requireCapability, resourceScope, allowedStoreIds, effectiveGrantsFor } from './authorization-scope.service.js';
import { resolvePrincipal } from './principal.service.js';
import { withCrmWriter } from './crm-writer.service.js';
import { digest } from './project-audit.service.js';
import { WorkflowError, objectId } from './project-workflow.service.js';

const fail = (code: string, message: string): never => { throw new WorkflowError(409, code, message); };
async function fresh(actor: AuthenticatedUser) {
  // Re-resolve using the incoming version; a concurrent revoke/status change must fail.
  return resolvePrincipal({ sub: actor.userId, role: actor.role, securityVersion: actor.securityVersion });
}
async function employee(id: string) {
  const row: any = await EmployeeModel.findById(objectId(id)).lean();
  if (!row) throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhân sự.');
  return row;
}
function access(actor: AuthenticatedUser, person: any, cap: 'employees.update_other' | 'employees.review' | 'employees.read_operational' | 'employees.read_hr', storeId: unknown) {
  // Both home identity and assignment location must be authorized, even for historical records.
  requireCapability(actor, cap, resourceScope(actor, { ...person, employeeId: person._id }));
  requireCapability(actor, cap, resourceScope(actor, { storeId, storeMappingRef: 'verified', employeeId: person._id }));
}
function terms(row: any) {
  return digest(Object.fromEntries(['employeeId', 'storeId', 'kind', 'validFrom', 'validUntil', 'evidenceRef', 'basis', 'reason', 'replacesAppointmentId', 'requestedBy', 'requesterEmployeeId', 'clientRequestId', 'payloadHash'].map((k) => [k, row[k] ?? null])));
}
function state(row: any) { return digest({ terms: terms(row), status: row.status, version: row.version, approvedBy: row.approvedBy ?? null, approvedAt: row.approvedAt ?? null }); }
function event(before: any, after: any, actorId: string, type: string, reason: string, handoverRef: string | null = null) {
  const data = { id: randomUUID(), actorId, type, reason, at: new Date().toISOString(), before: before?.status ?? null, after: after.status,
    handoverRef, previousHash: before?.history?.at(-1)?.hash ?? '0'.repeat(64), stateHash: state(after) };
  return { ...data, hash: digest(data) };
}
export function verifySmAppointment(row: any) {
  let previous = '0'.repeat(64), status: string | null = null;
  for (const entry of row.history ?? []) {
    const { hash, ...value } = entry;
    if (hash !== digest(value) || value.previousHash !== previous || value.before !== status) fail('APPOINTMENT_AUDIT_INVALID', 'Lịch sử phân công không hợp lệ; không sửa âm thầm.');
    previous = hash; status = value.after;
  }
  if (!row.history?.length || row.history.length !== row.version || status !== row.status || row.history.at(-1).stateHash !== state(row)) fail('APPOINTMENT_AUDIT_INVALID', 'Phân công không khớp lịch sử.');
}
export function smAppointmentDto(row: any, detail = false, now = Date.now()) {
  let integrity: 'VALID_LOCAL_CHAIN' | 'INVALID' = 'VALID_LOCAL_CHAIN';
  if (detail) { try { verifySmAppointment(row); } catch { integrity = 'INVALID'; } }
  const effectiveState = row.status !== 'APPROVED' ? row.status : new Date(row.validFrom).getTime() > now ? 'SCHEDULED'
    : row.validUntil && new Date(row.validUntil).getTime() <= now ? 'EXPIRED' : 'EFFECTIVE';
  return SmAppointmentSchema.parse({ ...row, id: String(row._id), employeeId: String(row.employeeId), storeId: String(row.storeId),
    requestedBy: String(row.requestedBy), approvedBy: row.approvedBy ? String(row.approvedBy) : null, approvedAt: row.approvedAt?.toISOString() ?? null,
    replacesAppointmentId: row.replacesAppointmentId ? String(row.replacesAppointmentId) : null,
    validFrom: row.validFrom.toISOString(), validUntil: row.validUntil?.toISOString() ?? null,
    grade: 'UNKNOWN', grantsChanged: false, effectiveState, history: detail ? row.history : [], ...(detail ? { auditIntegrity: integrity } : {}) });
}
async function eligible(person: any, storeId: string) {
  const source = person.hrmProfileMappingV1;
  const title = typeof person.job_title === 'string' ? person.job_title.trim().normalize('NFC').toUpperCase() : '';
  if (person.status !== 'active' || !person.storeMappingRef || person.lifecyclePendingRequestId) fail('APPOINTMENT_EMPLOYEE_UNAVAILABLE', 'Cần hồ sơ active đã đối chiếu, không đang lifecycle.');
  if (person.provisioningRequestId && !await mongoose.connection.collection('onboarding_requests').findOne({ _id: person.provisioningRequestId, employeeId: person._id, status: 'ACTIVE' })) fail('APPOINTMENT_EMPLOYEE_UNAVAILABLE', 'Hồ sơ tiếp nhận chưa hoàn tất.');
  if (source?.identityMappingVerified !== true || source.sourceTitleVerified !== true || typeof source.sourceJobTitle !== 'string' || source.sourceJobTitle.trim().normalize('NFC').toUpperCase() !== title
    || !['SM', 'SM (CỬA HÀNG TRƯỞNG)', 'CỬA HÀNG TRƯỞNG'].includes(title)) fail('APPOINTMENT_TITLE_UNVERIFIED', 'Chỉ ghi phân công cho chức danh SM đã xác minh; không dùng sổ này để thăng chức.');
  const store: any = await StoreModel.findById(objectId(storeId)).lean();
  if (!store || store.kind !== 'outlet' || store.status !== 'ACTIVE' || !store.scopeApprovalRef || store.deleted_at) fail('APPOINTMENT_STORE_UNVERIFIED', 'Cần outlet canonical đang hoạt động.');
}
export async function listSmAppointments(actor: AuthenticatedUser, id: string, query: unknown) {
  const person = await employee(id), { page, limit } = PaginationQuerySchema.parse(query);
  if (!Number.isSafeInteger((page - 1) * limit)) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Trang vượt giới hạn.');
  const isSelf = actor.employeeId === id;
  if (isSelf) requireCapability(actor, 'profile.read_self', { employeeId: id });
  else requireCapability(actor, 'employees.read_operational', resourceScope(actor, { ...person, employeeId: person._id }));
  // Build location AND reporting filters before paging/counting; no cross-store history leak.
  const storeIds = (actor.canonical?.verifiedStores ?? []).filter((store) => { try {
    if (isSelf) return true;
    access(actor, person, 'employees.read_operational', store.id); return true;
  } catch { return false; } }).map((store) => objectId(store.id));
  const scope = { employeeId: person._id, ...(isSelf ? {} : { storeId: { $in: storeIds } }) };
  const [rows, totalItems] = await Promise.all([SmAppointmentModel.find(scope).select('-history').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), SmAppointmentModel.countDocuments(scope)]);
  return { items: rows.map((row: any) => smAppointmentDto(row)), paging: { page, limit, totalItems, hasNext: page * limit < totalItems, hasPrev: page > 1 } };
}
export async function getSmAppointment(actor: AuthenticatedUser, employeeId: string, id: string) {
  const person = await employee(employeeId);
  if (actor.employeeId === employeeId) requireCapability(actor, 'profile.read_self', { employeeId });
  else requireCapability(actor, 'employees.read_operational', resourceScope(actor, { ...person, employeeId: person._id }));
  const row: any = await SmAppointmentModel.findOne({ _id: objectId(id), employeeId: person._id }).lean();
  if (!row) throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy phân công.');
  if (actor.employeeId !== employeeId) access(actor, person, 'employees.read_operational', row.storeId);
  return smAppointmentDto(row, true);
}
export async function storeSmAppointments(actor: AuthenticatedUser, storeId: string, query: unknown) {
  storeId = String(objectId(storeId));
  const resource = resourceScope(actor, { storeId, storeMappingRef: 'verified' });
  requireCapability(actor, 'stores.read', resource);
  requireCapability(actor, 'employees.read_operational');
  if (!allowedStoreIds(actor, 'employees.read_operational').includes(storeId)) throw new WorkflowError(403, 'RBAC_DENIED', 'Chưa có quyền xem nhân sự tại outlet.');
  const store = actor.canonical!.verifiedStores.find(s => s.id === storeId)!;
  const grants = effectiveGrantsFor(actor, 'employees.read_operational').filter(g => g.scope.kind === 'organization' && (g.scope.storeIds.includes(storeId) || !!store.regionId && g.scope.regionIds.includes(store.regionId)));
  const unrestricted = grants.some(g => !g.scope.reportingEmployeeIds.length);
  const allowedEmployees = [...new Set(grants.flatMap(g => g.scope.reportingEmployeeIds))].map(objectId);
  const { page, limit } = PaginationQuerySchema.parse(query);
  if (!Number.isSafeInteger((page - 1) * limit)) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Trang vượt giới hạn.');
  const now = new Date(), scope = { storeId: objectId(storeId), status: 'APPROVED', validFrom: { $lte: now }, $or: [{ validUntil: null }, { validUntil: { $gt: now } }], ...(!unrestricted ? { employeeId: { $in: allowedEmployees } } : {}) };
  // Slice the tail for state-bound display; full chain is only on the individual detail endpoint.
  const [rows, totalItems]: any[] = await Promise.all([SmAppointmentModel.find(scope).select({ history: { $slice: -1 } }).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), SmAppointmentModel.countDocuments(scope)]);
  const people: any[] = await EmployeeModel.find({ _id: { $in: rows.map((r: any) => r.employeeId) } }).select('fullName full_name').lean();
  return { items: rows.map((row: any) => {
    const tail = row.history?.[0], { hash, ...value } = tail ?? {};
    if (!tail || hash !== digest(value) || tail.stateHash !== state(row)) fail('APPOINTMENT_AUDIT_INVALID', 'Dữ liệu phân công không khớp dấu vết.');
    requireCapability(actor, 'employees.read_operational', resourceScope(actor, { storeId, storeMappingRef: 'verified', employeeId: row.employeeId }));
    const person = people.find(p => String(p._id) === String(row.employeeId));
    return { id: String(row._id), employeeId: String(row.employeeId), fullName: person?.fullName || person?.full_name || 'Nhân sự không còn trong danh mục',
      kind: row.kind, validFrom: row.validFrom.toISOString(), validUntil: row.validUntil?.toISOString() ?? null,
      evidenceRef: row.evidenceRef, basis: row.basis, approvedBy: String(row.approvedBy), approvedAt: row.approvedAt?.toISOString(),
      replacesAppointmentId: row.replacesAppointmentId ? String(row.replacesAppointmentId) : null };
  }), paging: { page, limit, totalItems, hasNext: page * limit < totalItems } };
}
export async function proposeSmAppointment(actor: AuthenticatedUser, id: string, input: unknown) {
  return withCrmWriter(async () => {
    actor = await fresh(actor);
    const body = SmAppointmentProposalSchema.parse(input), person = await employee(id);
    access(actor, person, 'employees.update_other', body.storeId);
    await eligible(person, body.storeId);
    if (!actor.employeeId) throw new WorkflowError(403, 'RBAC_DENIED', 'Cần nhân sự HR đã đối chiếu.');
    if (body.kind === 'PRIMARY' && String(person.storeId) !== body.storeId) fail('APPOINTMENT_HOME_MISMATCH', 'SM chính cần đúng nơi công tác; dùng kiêm nhiệm cho outlet khác.');
    if (body.kind === 'ADDITIONAL' && String(person.storeId) === body.storeId) fail('APPOINTMENT_HOME_MISMATCH', 'Kiêm nhiệm dành cho outlet khác nơi công tác chính.');
    await SmAppointmentModel.init();
    const indexes = await SmAppointmentModel.collection.indexes();
    if (!indexes.some((i: any) => i.unique && i.key.requestedBy && i.key.clientRequestId)) throw new WorkflowError(503, 'APPOINTMENT_INDEX_REQUIRED', 'Thiếu index chống lặp.');
    const payloadHash = digest({ employeeId: id, ...body }), key = { requestedBy: objectId(actor.userId), clientRequestId: body.clientRequestId };
    const existing: any = await SmAppointmentModel.findOne(key).lean();
    if (existing) { verifySmAppointment(existing); if (existing.payloadHash !== payloadHash) fail('IDEMPOTENCY_CONFLICT', 'Mã gửi lại đã dùng cho nội dung khác.'); return smAppointmentDto(existing, true); }
    const values = { ...body, ...key, employeeId: person._id, storeId: objectId(body.storeId), requesterEmployeeId: objectId(actor.employeeId),
      replacesAppointmentId: body.replacesAppointmentId ? objectId(body.replacesAppointmentId) : null,
      validFrom: new Date(body.validFrom), validUntil: body.validUntil ? new Date(body.validUntil) : null,
      payloadHash, status: 'PENDING', version: 1, approvedBy: null, approvedAt: null };
    const row = await SmAppointmentModel.create({ ...values, history: [event(null, values, actor.userId, 'PROPOSED', body.reason)] });
    return smAppointmentDto(row.toObject(), true);
  });
}
async function conflicts(row: any) {
  const query: any = { _id: { $ne: row._id }, storeId: row.storeId, status: 'APPROVED',
    ...(row.validUntil ? { validFrom: { $lt: row.validUntil } } : {}), $or: [{ validUntil: null }, { validUntil: { $gt: row.validFrom } }] };
  if (['PRIMARY', 'ADDITIONAL'].includes(row.kind) && await SmAppointmentModel.exists({ ...query, kind: { $in: ['PRIMARY', 'ADDITIONAL'] } })) fail('APPOINTMENT_PRIMARY_CONFLICT', 'Outlet đã có phân công SM chính/kiêm nhiệm trùng thời gian.');
  if (row.kind === 'TEMPORARY') {
    const primary: any = await SmAppointmentModel.findOne({ _id: row.replacesAppointmentId, storeId: row.storeId, status: 'APPROVED', kind: { $in: ['PRIMARY', 'ADDITIONAL'] } }).lean();
    if (!primary) fail('APPOINTMENT_PRIMARY_REQUIRED', 'Chưa có phân công chính hợp lệ để thay tạm.');
    verifySmAppointment(primary);
    if (String(primary.employeeId) === String(row.employeeId) || primary.validFrom > row.validFrom || primary.validUntil && primary.validUntil < row.validUntil) fail('APPOINTMENT_REPLACEMENT_INVALID', 'Người thay hoặc thời hạn không phù hợp phân công chính.');
    if (await SmAppointmentModel.exists({ ...query, kind: 'TEMPORARY' })) fail('APPOINTMENT_TEMPORARY_CONFLICT', 'Đã có người thay tạm trong thời gian này.');
  }
}
export async function decideSmAppointment(actor: AuthenticatedUser, employeeId: string, id: string, input: unknown) {
  return withCrmWriter(async () => {
    actor = await fresh(actor);
    const body = SmAppointmentDecisionSchema.parse(input), person = await employee(employeeId);
    const row: any = await SmAppointmentModel.findOne({ _id: objectId(id), employeeId: person._id }).lean();
    if (!row) throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy phân công.');
    access(actor, person, 'employees.review', row.storeId);
    requireCapability(actor, 'employees.review', { ...resourceScope(actor, { storeId: row.storeId, storeMappingRef: 'verified', employeeId: person._id }),
      requiresIndependentApproval: true, requesterUserId: String(row.requestedBy), subjectEmployeeId: employeeId });
    if (actor.employeeId === String(row.requesterEmployeeId) || String(person.userId) === actor.userId) throw new WorkflowError(403, 'SELF_APPROVAL', 'Người xác nhận phải độc lập với người đề nghị và người nhận phân công.');
    verifySmAppointment(row);
    if (body.expectedVersion !== row.version) fail('APPOINTMENT_VERSION_CONFLICT', 'Phân công đã thay đổi; tải lại trước khi xử lý.');
    if (body.action === 'REVOKE' ? row.status !== 'APPROVED' : row.status !== 'PENDING') fail('APPOINTMENT_STATE_CONFLICT', 'Trạng thái không cho phép quyết định này.');
    if (body.action === 'APPROVE') {
      await eligible(person, String(row.storeId));
      if (row.validUntil && row.validUntil <= new Date()) fail('APPOINTMENT_EXPIRED', 'Không xác nhận phân công đã hết hạn.');
      if (row.kind === 'PRIMARY' && String(person.storeId) !== String(row.storeId)) fail('APPOINTMENT_HOME_MISMATCH', 'Nơi công tác đã thay đổi.');
      const requester: any = await UserModel.findById(row.requestedBy).lean();
      if (!requester) fail('APPOINTMENT_REQUESTER_UNAVAILABLE', 'Người đề nghị không còn hợp lệ.');
      const current = await resolvePrincipal({ sub: String(requester._id), role: requester.role, securityVersion: requester.securityVersion ?? 0 });
      access(current, person, 'employees.update_other', row.storeId);
      await conflicts(row);
    }
    if (body.action === 'REVOKE') {
      if (!body.handoverRef) throw new WorkflowError(400, 'HANDOVER_REFERENCE_REQUIRED', 'Cần căn cứ bàn giao/thu hồi; không tự chuyển công việc.');
      if (await SmAppointmentModel.exists({ replacesAppointmentId: row._id, status: 'APPROVED', $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }] })) fail('APPOINTMENT_REPLACEMENT_ACTIVE', 'Cần kết thúc phân công thay tạm trước.');
    }
    const changes = { status: body.action === 'APPROVE' ? 'APPROVED' : body.action === 'REJECT' ? 'REJECTED' : 'REVOKED',
      ...(body.action === 'APPROVE' ? { approvedBy: objectId(actor.userId), approvedAt: new Date() } : {}) };
    const next = { ...row, ...changes, version: row.version + 1 }, audit = event(row, next, actor.userId, body.action, body.reason, body.handoverRef ?? null);
    if (row.history.length >= 1000 || mongoose.mongo.BSON.calculateObjectSize({ ...next, history: [...row.history, audit] }) > 8 * 1024 * 1024) fail('APPOINTMENT_STORAGE_LIMIT', 'Không cắt lịch sử để tiếp tục.');
    const saved: any = await SmAppointmentModel.findOneAndUpdate({ _id: row._id, version: row.version, status: row.status }, { $set: changes, $inc: { version: 1 }, $push: { history: audit } }, { new: true, runValidators: true }).lean();
    if (!saved) fail('APPOINTMENT_VERSION_CONFLICT', 'Có người vừa xử lý phân công này.');
    return smAppointmentDto(saved, true);
  });
}
