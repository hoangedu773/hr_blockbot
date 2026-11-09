import { getRevenueKpiOpenAction, getMyRevenueKpi, listMyPendingActions, getMyTasks, revenueKpiAssignmentResult, getRevenueKpiDetail } from './revenue-kpi.service.js';
import { getPerformanceEvaluation } from './performance-kpi-evaluation.service.js';
import { addWorkingDays } from './revenue-kpi-calc.service.js';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import {
  ChatHistorySendSchema,
  type ChatAcceptedPayload,
  type ChatHistoryTurn,
} from '@hr-blockbot/contracts';
import { ChatConversationModel as Conversation, ChatTurnModel as Turn } from '../models/ChatConversation.js';

export interface ChatHistorySend {
  conversationId: string;
  turn: unknown;
}

export interface ConversationDoc {
  _id: string;
  userId: mongoose.Types.ObjectId;
  clientRequestId: string;
  title: string;
  lastMessageAt: Date | null;
  pendingTurnId: string | null;
  leaseToken: string | null;
  leaseUntil: Date | null;
  deletedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TurnDoc {
  _id: string;
  conversationId: string;
  userId: mongoose.Types.ObjectId;
  clientMessageId: string;
  userMessage: string;
  status: 'QUEUED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
  reply: string | null;
  citations: unknown[];
  evidence: unknown;
  leaseToken: string | null;
  createdAt: Date;
  updatedAt?: Date;
}
import { resolvePrincipal } from './principal.service.js';
import { requireCapability } from './authorization-scope.service.js';
import { activeWindow } from './authorization-policy.service.js';
import { authorizedChat, authorizedChatStream, reloadServerProposedAction, readMyProfile, readDepartmentKpi, readDirectory, type ChatHistoryEvidence } from './chat-authorization.service.js';

interface ValidatedChatResponse {
  reply: string;
  citations: unknown[];
  attachments?: unknown[];
  proposedAction?: unknown;
}
import { documentAllowed, documentReceipt } from './document-authorization.service.js';
import { personalSchedule } from './scheduling.service.js';
import { visibleProject, WorkflowError, objectId } from './project-workflow.service.js';
import { digest } from './project-audit.service.js';
import { EvaluationModel } from '../models/Evaluation.js';
import { suggestSuitableCandidates } from './task-suitability.service.js';

const UUID = z.string().uuid();
const paging = z.object({ limit: z.coerce.number().int().min(1).max(30).default(15), before: z.string().max(300).optional() });
const missing = (): never => { throw new WorkflowError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hội thoại của bạn.'); };
const initialized = new WeakMap<object, Promise<void>>();
async function ensureHistoryStorage() {
  const db = mongoose.connection.db;
  if (!db) throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa thể lưu hội thoại.');
  let ready = initialized.get(db);
  if (!ready) {
    // Model.init() can be a no-op in deployments that disable automatic schema
    // writes. Explicitly provision only these two new collections; never enable
    // global autoCreate/autoIndex or synchronize/drop existing indexes.
    ready = (async () => {
      for (const model of [Conversation, Turn]) {
        await model.createCollection();
        await model.createIndexes();
      }
      const indexes = await Conversation.collection.indexes();
      const turnIndexes = await Turn.collection.indexes();
      if (!indexes.some((i: any) => i.unique && i.key.userId && i.key.clientRequestId)
        || !turnIndexes.some((i: any) => i.unique && i.key.conversationId && i.key.clientMessageId)) throw new Error('Required history indexes unavailable');
    })().catch(() => { initialized.delete(db); throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa thể lưu hội thoại.'); });
    initialized.set(db, ready);
  }
  await ready;
}
async function current(user: AuthenticatedUser) {
  const fresh = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion, sid: user.sid ?? undefined });
  requireCapability(fresh, 'chatbot.data_read', { userId: fresh.userId, employeeId: fresh.employeeId }); return fresh;
}
export function historyAuthorityHash(user: AuthenticatedUser) {
  return digest({ securityVersion: user.securityVersion, employeeId: user.employeeId, canonical: user.canonical,
    profile: user.authorization?.profile, grants: user.authorization?.grants.filter(g => activeWindow(g, new Date())),
    delegations: user.effectiveDelegations ?? [] });
}
async function owned(user: AuthenticatedUser, id: string) {
  UUID.parse(id); const row: any = await Conversation.findOne({ _id: id, userId: objectId(user.userId), deletedAt: null }).lean();
  if (!row) missing(); return row;
}
function cursor(row: any, dateField: string) { return Buffer.from(JSON.stringify({ at: new Date(row[dateField]).toISOString(), id: row._id })).toString('base64url'); }
function pageFilter(before: string | undefined, field: string) {
  if (!before) return {};
  let value; try { value = z.object({ at: z.string().datetime(), id: z.string().min(1).max(100) }).strict().parse(JSON.parse(Buffer.from(before, 'base64url').toString())); }
  catch { throw new WorkflowError(400, 'VALIDATION_FAILED', 'Mốc lịch sử không hợp lệ.'); }
  return { $or: [{ [field]: { $lt: new Date(value.at) } }, { [field]: new Date(value.at), _id: { $lt: value.id } }] };
}
const summary = (row: any) => ({ id: row._id, title: row.title, updatedAt: (row.lastMessageAt ?? row.createdAt).toISOString() });
export async function createConversation(user: AuthenticatedUser, input: unknown) {
  user = await current(user); const { clientRequestId } = z.object({ clientRequestId: UUID }).strict().parse(input);
  await ensureHistoryStorage();
  const index = await Conversation.collection.indexes();
  if (!index.some((i: any) => i.unique && i.key.userId && i.key.clientRequestId)) throw new WorkflowError(503, 'CHAT_HISTORY_INDEX_REQUIRED', 'Chưa thể lưu hội thoại.');
  const key = { userId: objectId(user.userId), clientRequestId };
  let row: any = await Conversation.findOne(key).lean();
  if (!row) {
    if (await Conversation.countDocuments({ userId: key.userId, deletedAt: null }) >= 1000) throw new WorkflowError(409, 'CHAT_HISTORY_LIMIT', 'Đạt giới hạn hội thoại; không tự xóa lịch sử.');
    try { row = (await Conversation.create({ _id: randomUUID(), ...key })).toObject(); }
    catch (e: any) { if (e.code !== 11000) throw e; row = await Conversation.findOne(key).lean(); }
  }
  if (row?.deletedAt) missing();
  return summary(row);
}
export async function deleteConversation(user: AuthenticatedUser, id: string) {
  user = await current(user); UUID.parse(id);
  const key = { _id: id, userId: objectId(user.userId) };
  const row = await Conversation.findOne(key).lean();
  if (!row) missing();
  // Retain only an owner-bound tombstone so delayed sends/retries cannot
  // recreate a deleted conversation. Purge its title and actual transcript.
  await Conversation.updateOne({ ...key, deletedAt: null }, { $set: { deletedAt: new Date(), title: 'Đã xóa hội thoại', lastMessageAt: null,
    pendingTurnId: null, leaseToken: null, leaseUntil: null } });
  await Turn.deleteMany({ userId: key.userId, conversationId: id });
}
export async function listConversations(user: AuthenticatedUser, input: unknown) {
  user = await current(user); const { limit, before } = paging.parse(input);
  const rows: any[] = await Conversation.find({ userId: objectId(user.userId), deletedAt: null, lastMessageAt: { $ne: null }, ...pageFilter(before, 'lastMessageAt') })
    .sort({ lastMessageAt: -1, _id: -1 }).limit(limit + 1).lean();
  const items = rows.slice(0, limit); return { items: items.map(summary), nextCursor: rows.length > limit ? cursor(items.at(-1), 'lastMessageAt') : null };
}
async function release(row: { _id: string; userId: unknown; pendingTurnId?: string | null; leaseToken?: string | null } | null | undefined) {
  if (!row?._id || !row?.leaseToken) return;
  await Conversation.updateOne({ _id: row._id, userId: row.userId, pendingTurnId: row.pendingTurnId, leaseToken: row.leaseToken },
    { $set: { pendingTurnId: null, leaseToken: null, leaseUntil: null } });
}
async function reconcile(row: any) {
  await Turn.updateMany({ userId: row.userId, conversationId: row._id, status: 'QUEUED', createdAt: { $lt: new Date(Date.now() - 45000) }, _id: { $ne: row.pendingTurnId } }, { $set: { status: 'INTERRUPTED' } });
  if (!row.pendingTurnId) return;
  const turn: any = await Turn.findById(row.pendingTurnId).lean();
  if (turn && ['COMPLETED', 'FAILED', 'INTERRUPTED'].includes(turn.status)) return release(row);
  if (!row.leaseUntil || new Date(row.leaseUntil) > new Date()) return;
  await Turn.updateOne({ _id: row.pendingTurnId, userId: row.userId, $or: [{ status: 'QUEUED' }, { status: 'PENDING', leaseToken: row.leaseToken }] }, { $set: { status: 'INTERRUPTED' } });
  await release(row);
}
async function evidenceAllowed(user: AuthenticatedUser, evidence: any) {
  if (!evidence || evidence.authorityHash !== historyAuthorityHash(user) || !Array.isArray(evidence.documents) || !Array.isArray(evidence.projects) || !Array.isArray(evidence.schedules)) return false;
  try {
    for (const r of evidence.documents) { const d = await mongoose.connection.collection('policies').findOne({ _id: objectId(r.documentId) }); if (!d || !documentAllowed(user, d) || documentReceipt(d).digest !== r.digest) return false; }
    for (const r of evidence.projects) { const p = await visibleProject(user, r.projectId); if ((p.version ?? 1) !== r.version) return false; }
    for (const r of evidence.schedules) { const d = await personalSchedule(user, r.from, r.to); if (digest(d.assignments.map(({ weekVersion, ...a }) => a)) !== r.digest) return false; }
    for (const r of evidence.performanceEvaluations ?? []) { const e = await getPerformanceEvaluation(user,r.id); if(e.version!==r.version)return false; }
    for (const r of evidence.revenueReads ?? []) {
      const args = {
        ...(r.period !== undefined && { period: r.period }),
        ...(r.assignmentId !== undefined && { assignmentId: r.assignmentId }),
        ...(r.limit !== undefined && { limit: r.limit }),
        ...(r.offset !== undefined && { offset: r.offset }),
      };
      const fresh = r.tool === 'get_my_revenue_kpi' ? await getMyRevenueKpi(user, r.period)
        : r.tool === 'list_my_pending_actions' ? await listMyPendingActions(user, args)
        : r.tool === 'get_my_tasks' ? await getMyTasks(user, r.period)
        : r.tool === 'get_revenue_kpi_result' && r.assignmentId ? await revenueKpiAssignmentResult(user, r.assignmentId)
        : r.assignmentId ? await getRevenueKpiDetail(user, r.assignmentId) : null;
      if (fresh === null || digest(fresh) !== r.digest) return false;
    }
    for (const r of evidence.legacyEvaluations ?? []) {
      requireCapability(user, 'kpi.read_self', { employeeId: user.employeeId });
      if (!user.employeeId || user.employeeId !== r.employeeId) return false;
      const freshRow = await EvaluationModel.findOne({
        employeeId: new mongoose.Types.ObjectId(user.employeeId),
        period: r.period,
      }).lean() as { status?: string; finalScore?: number; machineScore?: number; analysis?: { explanation?: string | null; themes?: string[]; riskSignals?: string[] }; overrideReason?: string | null; publishedAt?: string } | null;
      const freshResult = !freshRow ? { period: r.period, available: false, message: "Chưa có kỳ đánh giá KPI cho tháng này." }
        : freshRow.status === "PUBLISHED"
          ? { period: r.period, available: true, status: freshRow.status, finalScore: freshRow.finalScore, machineScore: freshRow.machineScore,
              explanation: freshRow.analysis?.explanation ?? null, themes: freshRow.analysis?.themes ?? [], riskSignals: freshRow.analysis?.riskSignals ?? [],
              overrideReason: freshRow.overrideReason ?? null, publishedAt: freshRow.publishedAt }
          : { period: r.period, available: false, status: freshRow.status, message: "Kỳ đánh giá chưa được công bố; chỉ xem chi tiết sau khi quản lý chốt." };
      if (digest(freshResult) !== r.digest) return false;
    }
    for (const r of evidence.candidateSuggestions ?? []) {
      if (!r.asOf) return false;
      const fresh = await suggestSuitableCandidates(user, r.taskRef, { asOf: r.asOf });
      if (digest(fresh) !== r.digest) return false;
    }
    for (const r of evidence.profileReads ?? []) {
      const fresh = await readMyProfile(user);
      if (digest(fresh) !== r.digest) return false;
    }
    for (const r of evidence.departmentKpiReads ?? []) {
      const fresh = await readDepartmentKpi(user, r.period);
      if (digest(fresh) !== r.digest) return false;
    }
    for (const r of evidence.directoryReads ?? []) {
      const fresh = await readDirectory(user);
      if (digest(fresh) !== r.digest) return false;
    }
    return true;
  } catch (e: any) { if ([401, 403, 404, 409].includes(e?.status)) return false; throw e; }
}
async function turnDto(user: AuthenticatedUser, row: any) {
  let visible = row.status === 'COMPLETED' && await evidenceAllowed(user, row.evidence);
  let proposedAction = null;
  if (visible && row.evidence && (
    row.evidence.revenueOpenActionId ||
    row.evidence.revenueAssignmentActionId ||
    row.evidence.revenueSaveAssignmentActionId ||
    row.evidence.revenueCreatePeriodActionId ||
    row.evidence.performanceKpiActionId
  )) {
    try {
      proposedAction = await reloadServerProposedAction(user, row.evidence);
    } catch (error: unknown) {
      const err = error as { status?: number } | null;
      if (![401, 403, 404, 409, 503].includes(err?.status ?? 0)) throw error;
      visible = false;
    }
  }
  let performanceKpi;
  if (visible && row.evidence?.performanceEvaluations?.length) {
    const e = await getPerformanceEvaluation(user, row.evidence.performanceEvaluations[0].id);
    const own = e.employeeId === user.employeeId;
    const now = new Date().toISOString();
    const reconsideration = e.reconsideration;
    const appealDeadline = e.appealDeadlineAt ?? (reconsideration
      ? addWorkingDays(new Date(reconsideration.responseDeadlineAt), e.policySnapshot.policy.appealWindowWorkingDays).toISOString()
      : null);
    performanceKpi = {
      evaluationId: e.id, period: e.period, status: e.evaluationStatus, score: e.finalScore,
      canReconsider: own && e.evaluationStatus === 'PROVISIONAL' && !e.reconsideration && !!e.reconsiderationDeadlineAt && now <= e.reconsiderationDeadlineAt,
      canAppeal: own && !!appealDeadline && now <= appealDeadline && (
        !e.appeal && (reconsideration?.status === 'RESPONDED' ||
          reconsideration?.status === 'REQUESTED' && now > reconsideration.responseDeadlineAt) ||
        e.appeal?.escalationLevel === 1 && ['UPHELD', 'ADJUSTED'].includes(e.appeal.status)
      ),
    };
  }
  return { ...(performanceKpi?{performanceKpi}:{}), id: row.clientMessageId, userMessage: row.userMessage, createdAt: row.createdAt.toISOString(), status: row.status,
    reply: visible ? row.reply : null, citations: visible ? row.citations : [],
    replyHidden: row.status === 'COMPLETED' && !visible, attachments: [], proposedAction };
}
async function ownedTurnDto(user: AuthenticatedUser, row: any) {
  if (!row) missing();
  const dto = await turnDto(user, row); await owned(user, row.conversationId); return dto;
}
export async function conversationMessages(user: AuthenticatedUser, id: string, input: unknown) {
  user = await current(user); const row = await owned(user, id); await reconcile(row); const { limit, before } = paging.parse(input);
  const rows: any[] = await Turn.find({ userId: row.userId, conversationId: id, ...pageFilter(before, 'createdAt') }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const items = rows.slice(0, limit), output = [];
  for (const r of items) output.push(await turnDto(user, r));
  // Final current-state fence before releasing any historical assistant text.
  const fresh = await current(user);
  if (historyAuthorityHash(fresh) !== historyAuthorityHash(user)) throw new WorkflowError(409, 'CHAT_AUTHORIZATION_CHANGED', 'Quyền đã đổi; tải lại lịch sử.');
  await owned(fresh, id);
  return { conversation: summary(row), items: output.reverse(), nextCursor: rows.length > limit ? cursor(items.at(-1), 'createdAt') : null };
}
export async function chatWithHistory(user: AuthenticatedUser, message: string, conversationId: string | undefined, clientMessageId: string): Promise<ChatHistorySend> {
  user = await current(user); UUID.parse(clientMessageId);
  if (!conversationId) conversationId = (await createConversation(user, { clientRequestId: clientMessageId })).id;
  if (!conversationId) throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa mở được hội thoại.');
  const conversation = await owned(user, conversationId); await reconcile(conversation); await ensureHistoryStorage();
  const key = { _id: conversationId + ':' + clientMessageId, userId: objectId(user.userId), conversationId };
  let turn = await Turn.findOne<TurnDoc>(key).lean();
  if (!turn) {
    try { turn = (await Turn.create({ ...key, clientMessageId, userMessage: message, status: 'QUEUED' })).toObject(); }
    catch (e: unknown) {
      const mongoError = e as { code?: number } | null;
      if (mongoError?.code !== 11000) throw e;
      turn = await Turn.findOne<TurnDoc>(key).lean();
    }
  }
  if (!turn) throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa khởi tạo được tin nhắn.');
  if (turn.userMessage !== message) throw new WorkflowError(409, 'CHAT_MESSAGE_CONFLICT', 'Mã tin nhắn đã được dùng cho nội dung khác.');
  if (turn.status !== 'QUEUED') return { conversationId, turn: await ownedTurnDto(user, turn) };
  const leaseToken = randomUUID();
  const claim = await Conversation.findOneAndUpdate<ConversationDoc>({ _id: conversationId, userId: key.userId, deletedAt: null, pendingTurnId: null },
    { $set: { pendingTurnId: key._id, leaseToken, leaseUntil: new Date(Date.now() + 45000), lastMessageAt: new Date() } }, { new: true }).lean();
  if (!claim) {
    const existing = await Conversation.findOne<ConversationDoc>({ _id: conversationId, userId: key.userId }).lean();
    if (!existing || existing.deletedAt) { await Turn.deleteOne(key); missing(); }
    const active = await owned(user, conversationId!);
    if (active.pendingTurnId !== key._id) await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'FAILED' } });
    const freshTurn = await Turn.findOne<TurnDoc>(key).lean();
    return { conversationId, turn: await ownedTurnDto(user, freshTurn) };
  }
  const started = await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'PENDING', leaseToken } });
  if (!started.modifiedCount) {
    await release({ _id: conversationId, userId: key.userId, pendingTurnId: key._id, leaseToken });
    const freshTurn = await Turn.findOne<TurnDoc>(key).lean();
    return { conversationId, turn: await ownedTurnDto(user, freshTurn) };
  }
  await Conversation.updateOne({ _id: conversationId, userId: key.userId, title: 'Hội thoại mới' }, { $set: { title: message.replace(/\s+/g, ' ').slice(0, 80) } });
  try {
    await owned(user, conversationId);
    await authorizedChat(user, message, conversationId, async (response: unknown, evidence: ChatHistoryEvidence) => {
      const fresh = await current(user);
      if (historyAuthorityHash(fresh) !== historyAuthorityHash(user)) throw new WorkflowError(409, 'CHAT_AUTHORIZATION_CHANGED', 'Quyền đã đổi trong lúc trả lời.');
      await owned(fresh, conversationId!);
      const validResponse = response as ValidatedChatResponse;
      const evidenceCount = evidence.documents.length + evidence.projects.length + evidence.schedules.length + (evidence.profileReads?.length ?? 0) + (evidence.departmentKpiReads?.length ?? 0) + (evidence.directoryReads?.length ?? 0);
      if (validResponse.reply.length > 64000 || evidenceCount > 500) throw new WorkflowError(503, 'CHAT_HISTORY_LIMIT', 'Phản hồi vượt giới hạn lưu trữ.');
      const saved = await Turn.updateOne({ ...key, status: 'PENDING', leaseToken }, { $set: { status: 'COMPLETED', reply: validResponse.reply, citations: validResponse.citations,
        evidence: { ...evidence, authorityHash: historyAuthorityHash(fresh) } } });
      if (!saved.modifiedCount) throw new WorkflowError(409, 'CHAT_HISTORY_FENCED', 'Lượt trả lời đã kết thúc hoặc gián đoạn.');
      const live = await Conversation.exists({ _id: conversationId, userId: key.userId, deletedAt: null });
      if (!live) { await Turn.deleteOne(key); missing(); }
    });
  } catch (error: unknown) {
    await Turn.updateOne({ ...key, status: 'PENDING', leaseToken }, { $set: { status: 'FAILED' } });
    if (error instanceof WorkflowError && error.code === 'SAFETY_BLOCKED') throw new WorkflowError(503, 'AI_SERVICE_UNAVAILABLE', 'Nội dung bị hệ thống an toàn chặn.');
  } finally { await release({ _id: conversationId, userId: key.userId, pendingTurnId: key._id, leaseToken }); }
  const fresh = await current(user);
  await owned(fresh, conversationId);
  const finalTurn = await Turn.findOne<TurnDoc>(key).lean();
  return { conversationId, turn: await ownedTurnDto(fresh, finalTurn) };
}

export interface ChatHistoryStreamCallbacks {
  onAccepted: (payload: ChatAcceptedPayload) => Promise<void>;
  onChunk: (delta: string) => Promise<void>;
  signal?: AbortSignal;
}

export async function chatWithHistoryStream(
  user: AuthenticatedUser,
  message: string,
  conversationId: string | undefined,
  clientMessageId: string,
  callbacks: ChatHistoryStreamCallbacks
): Promise<ChatHistorySend> {
  user = await current(user);
  UUID.parse(clientMessageId);
  if (!conversationId) conversationId = (await createConversation(user, { clientRequestId: clientMessageId })).id;
  if (!conversationId) throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa mở được hội thoại.');
  const conversation = await owned(user, conversationId);
  await reconcile(conversation);
  await ensureHistoryStorage();
  const key = { _id: conversationId + ':' + clientMessageId, userId: objectId(user.userId), conversationId };
  let turn = await Turn.findOne<TurnDoc>(key).lean();

  if (turn) {
    if (turn.userMessage !== message) {
      throw new WorkflowError(409, 'CHAT_MESSAGE_CONFLICT', 'Mã tin nhắn đã được dùng cho nội dung khác.');
    }
    if (turn.status === 'COMPLETED') {
      return { conversationId, turn: await ownedTurnDto(user, turn) };
    }
    throw new WorkflowError(409, 'DUPLICATE_REQUEST', 'Tin nhắn đang được xử lý hoặc đã gián đoạn. Vui lòng gửi lại bằng mã tin nhắn mới.');
  }

  try {
    turn = (await Turn.create({ ...key, clientMessageId, userMessage: message, status: 'QUEUED' })).toObject();
  } catch (e: unknown) {
    const mongoError = e as { code?: number } | null;
    if (mongoError?.code !== 11000) throw e;
    turn = await Turn.findOne<TurnDoc>(key).lean();
    if (!turn) throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa khởi tạo được tin nhắn.');
    if (turn.userMessage !== message) {
      throw new WorkflowError(409, 'CHAT_MESSAGE_CONFLICT', 'Mã tin nhắn đã được dùng cho nội dung khác.');
    }
    if (turn.status === 'COMPLETED') {
      return { conversationId, turn: await ownedTurnDto(user, turn) };
    }
    throw new WorkflowError(409, 'DUPLICATE_REQUEST', 'Tin nhắn đang được xử lý hoặc đã gián đoạn. Vui lòng gửi lại bằng mã tin nhắn mới.');
  }

  if (callbacks.signal?.aborted) {
    await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'INTERRUPTED' } });
    throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy trước khi nhận lease.');
  }

  const leaseToken = randomUUID();
  const claim = await Conversation.findOneAndUpdate<ConversationDoc>(
    { _id: conversationId, userId: key.userId, deletedAt: null, pendingTurnId: null },
    { $set: { pendingTurnId: key._id, leaseToken, leaseUntil: new Date(Date.now() + 45000), lastMessageAt: new Date() } },
    { new: true }
  ).lean();

  if (!claim) {
    const existing = await Conversation.findOne<ConversationDoc>({ _id: conversationId, userId: key.userId }).lean();
    if (!existing || existing.deletedAt) {
      await Turn.deleteOne(key);
      missing();
    }
    const active = await owned(user, conversationId!);
    if (active.pendingTurnId !== key._id) {
      await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'FAILED' } });
    }
    throw new WorkflowError(409, 'DUPLICATE_REQUEST', 'Hội thoại đang có yêu cầu khác đang xử lý.');
  }

  const started = await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'PENDING', leaseToken } });
  if (!started.modifiedCount) {
    await release({ _id: conversationId, userId: key.userId, pendingTurnId: key._id, leaseToken });
    throw new WorkflowError(409, 'CHAT_HISTORY_FENCED', 'Lượt trả lời đã kết thúc hoặc gián đoạn.');
  }
  try {
    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy.');
    }
    await Conversation.updateOne(
      { _id: conversationId, userId: key.userId, title: 'Hội thoại mới' },
      { $set: { title: message.replace(/\s+/g, ' ').slice(0, 80) } }
    );

    await callbacks.onAccepted({
      clientMessageId,
      messageId: clientMessageId,
      conversationId,
      acceptedAt: new Date().toISOString(),
    });

    await owned(user, conversationId);
    await authorizedChatStream(
      user,
      message,
      conversationId,
      {
        onChunk: callbacks.onChunk,
        signal: callbacks.signal,
      },
      async (response: unknown, evidence: ChatHistoryEvidence) => {
        if (callbacks.signal?.aborted) {
          throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy trước khi lưu kết quả.');
        }
        const fresh = await current(user);
        if (historyAuthorityHash(fresh) !== historyAuthorityHash(user)) {
          throw new WorkflowError(409, 'CHAT_AUTHORIZATION_CHANGED', 'Quyền đã đổi trong lúc trả lời.');
        }
        await owned(fresh, conversationId!);
        const validResponse = response as ValidatedChatResponse;
        const evidenceCount = evidence.documents.length + evidence.projects.length + evidence.schedules.length +
          evidence.performanceEvaluations.length + (evidence.revenueReads?.length ?? 0) +
          (evidence.legacyEvaluations?.length ?? 0) + (evidence.candidateSuggestions?.length ?? 0) +
          (evidence.profileReads?.length ?? 0) + (evidence.departmentKpiReads?.length ?? 0) +
          (evidence.directoryReads?.length ?? 0);
        if (validResponse.reply.length > 64000 || evidenceCount > 500) {
          throw new WorkflowError(503, 'CHAT_HISTORY_LIMIT', 'Phản hồi vượt giới hạn lưu trữ.');
        }
        if (callbacks.signal?.aborted) {
          throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy trước khi lưu kết quả.');
        }
        const saved = await Turn.updateOne(
          { ...key, status: 'PENDING', leaseToken },
          {
            $set: {
              status: 'COMPLETED',
              reply: validResponse.reply,
              citations: validResponse.citations,
              evidence: { ...evidence, authorityHash: historyAuthorityHash(fresh) },
            },
          }
        );
        if (!saved.modifiedCount) throw new WorkflowError(409, 'CHAT_HISTORY_FENCED', 'Lượt trả lời đã kết thúc hoặc gián đoạn.');
        const live = await Conversation.exists({ _id: conversationId, userId: key.userId, deletedAt: null });
        if (!live) {
          await Turn.deleteOne(key);
          missing();
        }
      }
    );
  } catch (error) {
    const status = callbacks.signal?.aborted ? 'INTERRUPTED' : 'FAILED';
    await Turn.updateOne({ ...key, status: 'PENDING', leaseToken }, { $set: { status } });
    throw error;
  } finally {
    await release({
      _id: conversationId,
      userId: key.userId,
      pendingTurnId: key._id,
      leaseToken,
    });
  }

  const fresh = await current(user);
  await owned(fresh, conversationId);
  const finalTurn = await Turn.findOne<TurnDoc>(key).lean();
  return { conversationId, turn: await ownedTurnDto(fresh, finalTurn) };
}
