// Chat proposals cho luồng lịch: đọc đăng ký, preview đăng ký ca, preview đổi ca,
// preview quyết định đổi ca. Cùng pattern với revenue/performance: preview chỉ ghi
// metadata proposal vào `revenue_kpi_open_actions`, người dùng xác nhận rồi server mới
// gọi service thật.
//
// Ràng buộc: file này KHÔNG chứa luật nghiệp vụ lịch. Mọi validate/ghi đi qua
// `scheduling.service.ts` (vùng của Phi). Ở đây chỉ kiểm những điều kiện rẻ, đọc được
// từ dữ liệu đã có, để preview không hứa những gì decide chắc chắn từ chối.

import mongoose from 'mongoose';
import { z } from 'zod';
import * as C from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { OperationalWeekModel as Week } from '../models/OperationalSchedule.js';
import {
  actScheduleChange, createScheduleChange, createScheduleRegistration,
  listScheduleRegistrations, validateWeek,
} from './scheduling.service.js';
import { WorkflowError, objectId } from './project-workflow.service.js';
import { digest } from './project-audit.service.js';
import { resolvePrincipal } from './principal.service.js';

interface ScheduleActionRow {
  _id: string; ownerId: string; securityVersion: number; authorityHash: string;
  type: string; args: Record<string, unknown>; preview: Record<string, unknown>;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED';
  expiresAt: string; purgeAt: Date; createdAt: string; updatedAt: string; executedAt?: string;
}

interface PublishedAssignment {
  id: string; employeeId: string; date: string; shiftId: string;
  shiftCode?: string; employeeName?: string;
}
interface ChangeRequestRow {
  id: string; status: string;
  source?: { date: string; employeeName?: string };
  receiverName?: string | null;
}
interface WeekRow {
  version: number; publishedAt: string | null;
  published: PublishedAssignment[]; requests: ChangeRequestRow[];
}

const actionRows = () => mongoose.connection.collection<ScheduleActionRow>('revenue_kpi_open_actions');
const TTL_MS = 10 * 60 * 1000;
const DecisionBodySchema = z.object({ approve: z.boolean() }).strict();

function actionDto(row: ScheduleActionRow) {
  return { actionId: row._id, type: row.type, args: row.args, preview: row.preview, expiresAt: row.expiresAt, status: row.status };
}

async function storeAction(
  u: AuthenticatedUser, id: string, type: string, args: Record<string, unknown>, preview: Record<string, unknown>,
) {
  const now = new Date();
  const authorityHash = digest({ authorization: u.authorization, employeeId: u.employeeId, delegations: u.effectiveDelegations ?? [] });
  await actionRows().updateOne({ _id: id }, { $setOnInsert: {
    ownerId: u.userId, securityVersion: u.securityVersion ?? 0, authorityHash,
    type, args, preview, status: 'PENDING',
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    purgeAt: new Date(now.getTime() + 7 * 86400000),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  } }, { upsert: true });
  const row = await actionRows().findOne({ _id: id });
  if (!row || row.ownerId !== u.userId) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Đề xuất không thuộc tài khoản này.');
  if (new Date(row.expiresAt).getTime() < Date.now()) throw new WorkflowError(409, 'CHAT_REQUEST_EXPIRED', 'Đề xuất đã hết hạn.');
  return row;
}

/** Đọc bảng đăng ký của cửa hàng trong tuần; trả cả đăng ký của đồng nghiệp để né lịch. */
export async function listMyRegistrations(u: AuthenticatedUser, weekStart: string) {
  validateWeek(weekStart);
  const board = await listScheduleRegistrations(u, weekStart);
  return {
    weekStart, storeId: board.storeId, storeName: board.storeName, published: board.published,
    shifts: board.shifts.map((s) => ({ id: s.id, code: s.code, name: s.name, intervals: s.intervals, version: s.version })),
    items: board.items.map((i) => ({ id: i.id, status: i.status, employeeName: i.employeeName, isOwn: i.isOwn,
      canManage: i.canManage, slot: { date: i.slot.date, shiftCode: i.slot.shiftCode, shiftName: i.slot.shiftName, intervals: i.slot.intervals },
      placement: i.placement, reviewReason: i.reviewReason })),
  };
}

/** Preview đăng ký ca: kiểm tuần chưa publish, ca tồn tại/active, ngày trong tuần, chưa bắt đầu. */
export async function previewScheduleRegistration(
  u: AuthenticatedUser, args: { weekStart: string; slot: { date: string; shiftId: string; shiftVersion: number } }, requestId: string,
) {
  validateWeek(args.weekStart);
  const board = await listScheduleRegistrations(u, args.weekStart);
  if (board.published) throw new WorkflowError(409, 'SCHEDULE_WEEK_PUBLISHED', 'Tuần đã công bố. Hãy dùng luồng đổi ca thay vì đăng ký.');
  const shift = board.shifts.find((s) => s.id === args.slot.shiftId);
  if (!shift || shift.version !== args.slot.shiftVersion)
    throw new WorkflowError(409, 'SHIFT_DEFINITION_CHANGED', 'Ca đã đổi cấu hình hoặc ngừng dùng. Chọn lại ca.');
  const weekEnd = new Date(Date.parse(args.weekStart + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
  if (args.slot.date < args.weekStart || args.slot.date > weekEnd)
    throw new WorkflowError(400, 'INVALID_SCHEDULE_DATE', 'Chọn ngày trong tuần đang xem.');
  const id = uuidFromDigest(digest({ requestId, kind: 'registration', weekStart: args.weekStart, slot: args.slot }));
  const preview = { date: args.slot.date, shiftCode: shift.code, shiftName: shift.name,
    storeName: board.storeName, weekStart: args.weekStart, published: false };
  return actionDto(await storeAction(u, id, 'schedule.registration', { weekStart: args.weekStart, slot: args.slot }, preview));
}

/** Preview đổi ca: kiểm tuần đã publish, ca nguồn thuộc về người gọi, và người nhận có ca. */
export async function previewScheduleChange(u: AuthenticatedUser, args: {
  weekId: string; assignmentId: string; receiverEmployeeId?: string | null; arrangement: 'DIRECT' | 'MANAGER';
  targetAssignmentId?: string; kind: 'COVER' | 'SWAP'; reason: string;
}, requestId: string) {
  const week = await Week.findById(objectId(args.weekId)).lean<WeekRow>();
  if (!week) throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tuần lịch.');
  if (!week.publishedAt) throw new WorkflowError(409, 'SCHEDULE_WEEK_NOT_PUBLISHED', 'Tuần chưa công bố. Dùng luồng đăng ký ca.');
  const source = week.published.find((a) => a.id === args.assignmentId);
  if (!source || source.employeeId !== u.employeeId)
    throw new WorkflowError(403, 'RBAC_DENIED', 'Chỉ được yêu cầu đổi ca của chính mình.');
  const receiver = args.receiverEmployeeId ? week.published.find((a) => a.employeeId === args.receiverEmployeeId) : null;
  const id = uuidFromDigest(digest({ requestId, tag: 'change', ...args }));
  const preview = { weekId: args.weekId, sourceDate: source.date, sourceShift: source.shiftCode ?? source.shiftId,
    receiverName: receiver?.employeeName ?? null, kind: args.kind, arrangement: args.arrangement };
  return actionDto(await storeAction(u, id, 'schedule.change', { ...args }, preview));
}

/** Preview quyết định đổi ca: kiểm yêu cầu tồn tại và còn mở. */
export async function previewScheduleChangeDecision(u: AuthenticatedUser, args: {
  weekId: string; changeId: string; action: 'ACCEPT' | 'DECLINE' | 'CANCEL' | 'APPROVE' | 'REJECT' | 'SELECT';
}, requestId: string) {
  const week = await Week.findById(objectId(args.weekId)).lean<WeekRow>();
  if (!week) throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tuần lịch.');
  const change = week.requests.find((r) => r.id === args.changeId);
  if (!change) throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu đổi ca.');
  if (!['PENDING_MANAGER', 'PENDING_RECEIVER', 'PENDING_REQUESTER', 'READY_FOR_REVIEW'].includes(change.status))
    throw new WorkflowError(409, 'SCHEDULE_REQUEST_CLOSED', 'Yêu cầu đã kết thúc.');
  const id = uuidFromDigest(digest({ requestId, kind: 'change_decision', weekId: args.weekId, changeId: args.changeId, action: args.action }));
  const preview = { requesterName: change.source?.employeeName ?? '', receiverName: change.receiverName ?? null,
    status: change.status, sourceDate: change.source?.date ?? '' };
  return actionDto(await storeAction(u, id, 'schedule.change_decision', { ...args }, preview));
}

/** Đọc lại đề xuất lịch đã tạo cho chat turn hoặc GET /chat/actions/:id. */
export async function getChatScheduleAction(u: AuthenticatedUser, actionId: string) {
  const row = await actionRows().findOne({ _id: actionId, ownerId: u.userId });
  if (!row || !String(row.type ?? '').startsWith('schedule.')) {
    throw new WorkflowError(404, 'REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất lịch.');
  }
  const fresh = await resolvePrincipal({ sub: u.userId, role: u.role, securityVersion: u.securityVersion ?? 0 });
  const authorityHash = digest({ authorization: fresh.authorization, employeeId: fresh.employeeId, delegations: fresh.effectiveDelegations ?? [] });
  if (row.authorityHash !== authorityHash) {
    throw new WorkflowError(403, 'CHAT_AUTHORIZATION_CHANGED', 'Quyền đã thay đổi. Tải lại trước khi xác nhận.');
  }
  return actionDto(row);
}

/** Thực thi proposal đã xác nhận. Không tự quyết định gì — gọi service thật. */
export async function decideChatScheduleAction(u: AuthenticatedUser, actionId: string, raw: unknown) {
  const row = await actionRows().findOne({ _id: actionId, ownerId: u.userId });
  if (!row) throw new WorkflowError(404, 'CHAT_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất lịch.');
  if (row.status !== 'PENDING') throw new WorkflowError(409, 'CHAT_ACTION_CLOSED', 'Đề xuất đã được xử lý.');
  if (new Date(row.expiresAt).getTime() < Date.now()) throw new WorkflowError(409, 'CHAT_REQUEST_EXPIRED', 'Đề xuất đã hết hạn.');
  const fresh = await resolvePrincipal({ sub: u.userId, role: 'Employee', securityVersion: u.securityVersion ?? 0 });
  const authorityHash = digest({ authorization: fresh.authorization, employeeId: fresh.employeeId, delegations: fresh.effectiveDelegations ?? [] });
  if (row.authorityHash !== authorityHash)
    throw new WorkflowError(409, 'CHAT_AUTHORIZATION_CHANGED', 'Quyền đã thay đổi. Tải lại trước khi xác nhận.');
  const { approve } = DecisionBodySchema.parse(raw);
  const closedAt = new Date().toISOString();
  if (!approve) {
    await actionRows().updateOne({ _id: actionId }, { $set: { status: 'CANCELLED', updatedAt: closedAt } });
    return { ...actionDto({ ...row, status: 'CANCELLED' }), executed: false };
  }
  let executed: unknown;
  if (row.type === 'schedule.registration') {
    executed = await createScheduleRegistration(fresh, {
      weekStart: row.args.weekStart, clientRequestId: actionId, slot: row.args.slot,
    });
  } else if (row.type === 'schedule.change') {
    executed = await createScheduleChange(fresh, String(row.args.weekId), { ...row.args, clientRequestId: actionId });
  } else if (row.type === 'schedule.change_decision') {
    const week = await Week.findById(objectId(String(row.args.weekId))).lean<WeekRow>();
    executed = await actScheduleChange(fresh, String(row.args.weekId), String(row.args.changeId), {
      expectedVersion: week?.version ?? 1, action: row.args.action, reason: 'Xác nhận qua trợ lý chat',
    });
  } else {
    throw new WorkflowError(400, 'CHAT_ACTION_UNSUPPORTED', 'Loại đề xuất lịch không hỗ trợ.');
  }
  await actionRows().updateOne({ _id: actionId }, { $set: { status: 'EXECUTED', executedAt: closedAt } });
  return { ...actionDto({ ...row, status: 'EXECUTED' }), executed: true, result: executed };
}

/** UUID v4 ổn định từ digest: cùng args → cùng actionId, nên gọi lại không stack đề xuất. */
function uuidFromDigest(hex: string) {
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Kiểu args đã lưu là Record<string, unknown>; service thật parse lại bằng Zod nên
// đây chỉ là ranh giới chuyển tiếp, không phải nơi tin dữ liệu.
export type ScheduleActionArgs = C.ScheduleChatAction['args'];
