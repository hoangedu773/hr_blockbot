import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { ChatConversationModel as Conversation, ChatTurnModel as Turn } from '../models/ChatConversation.js';
import { resolvePrincipal } from './principal.service.js';
import { requireCapability } from './authorization-scope.service.js';
import { activeWindow } from './authorization-policy.service.js';
import { authorizedChat } from './chat-authorization.service.js';
import { documentAllowed, documentReceipt } from './document-authorization.service.js';
import { personalSchedule } from './scheduling.service.js';
import { visibleProject, WorkflowError, objectId } from './project-workflow.service.js';
import { digest } from './project-audit.service.js';

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
  const fresh = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
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
async function release(row: any) {
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
    return true;
  } catch (e: any) { if ([401, 403, 404, 409].includes(e?.status)) return false; throw e; }
}
async function turnDto(user: AuthenticatedUser, row: any) {
  const visible = row.status === 'COMPLETED' && await evidenceAllowed(user, row.evidence);
  return { id: row.clientMessageId, userMessage: row.userMessage, createdAt: row.createdAt.toISOString(), status: row.status,
    reply: visible ? row.reply : null, citations: visible ? row.citations : [],
    replyHidden: row.status === 'COMPLETED' && !visible, attachments: [], proposedAction: null };
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
export async function chatWithHistory(user: AuthenticatedUser, message: string, conversationId: string | undefined, clientMessageId: string) {
  user = await current(user); UUID.parse(clientMessageId);
  if (!conversationId) conversationId = (await createConversation(user, { clientRequestId: clientMessageId })).id;
  if (!conversationId) throw new WorkflowError(503, 'CHAT_HISTORY_UNAVAILABLE', 'Chưa mở được hội thoại.');
  const conversation = await owned(user, conversationId); await reconcile(conversation); await ensureHistoryStorage();
  const key = { _id: conversationId + ':' + clientMessageId, userId: objectId(user.userId), conversationId };
  let turn: any = await Turn.findOne(key).lean();
  if (!turn) {
    try { turn = (await Turn.create({ ...key, clientMessageId, userMessage: message, status: 'QUEUED' })).toObject(); }
    catch (e: any) { if (e.code !== 11000) throw e; turn = await Turn.findOne(key).lean(); }
  }
  if (turn.userMessage !== message) throw new WorkflowError(409, 'CHAT_MESSAGE_CONFLICT', 'Mã tin nhắn đã được dùng cho nội dung khác.');
  if (turn.status !== 'QUEUED') return { conversationId, turn: await ownedTurnDto(user, turn) };
  const leaseToken = randomUUID();
  const claim: any = await Conversation.findOneAndUpdate({ _id: conversationId, userId: key.userId, deletedAt: null, pendingTurnId: null },
    { $set: { pendingTurnId: key._id, leaseToken, leaseUntil: new Date(Date.now() + 45000), lastMessageAt: new Date() } }, { new: true }).lean();
  if (!claim) {
    const existing: any = await Conversation.findOne({ _id: conversationId, userId: key.userId }).lean();
    if (!existing || existing.deletedAt) { await Turn.deleteOne(key); missing(); }
    const active: any = await owned(user, conversationId!);
    if (active.pendingTurnId !== key._id) await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'FAILED' } });
    return { conversationId, turn: await ownedTurnDto(user, await Turn.findOne(key).lean()) };
  }
  const started = await Turn.updateOne({ ...key, status: 'QUEUED' }, { $set: { status: 'PENDING', leaseToken } });
  if (!started.modifiedCount) { await release(claim); return { conversationId, turn: await ownedTurnDto(user, await Turn.findOne(key).lean()) }; }
  await Conversation.updateOne({ _id: conversationId, userId: key.userId, title: 'Hội thoại mới' }, { $set: { title: message.replace(/\s+/g, ' ').slice(0, 80) } });
  try {
    await owned(user, conversationId);
    await authorizedChat(user, message, conversationId, async (response, evidence) => {
      const fresh = await current(user);
      if (historyAuthorityHash(fresh) !== historyAuthorityHash(user)) throw new WorkflowError(409, 'CHAT_AUTHORIZATION_CHANGED', 'Quyền đã đổi trong lúc trả lời.');
      await owned(fresh, conversationId!);
      if (response.reply.length > 64000 || evidence.documents.length + evidence.projects.length + evidence.schedules.length > 500) throw new WorkflowError(503, 'CHAT_HISTORY_LIMIT', 'Phản hồi vượt giới hạn lưu trữ.');
      const saved = await Turn.updateOne({ ...key, status: 'PENDING', leaseToken }, { $set: { status: 'COMPLETED', reply: response.reply, citations: response.citations,
        evidence: { ...evidence, authorityHash: historyAuthorityHash(fresh) } } });
      if (!saved.modifiedCount) throw new WorkflowError(409, 'CHAT_HISTORY_FENCED', 'Lượt trả lời đã kết thúc hoặc gián đoạn.');
      const live = await Conversation.exists({ _id: conversationId, userId: key.userId, deletedAt: null });
      if (!live) { await Turn.deleteOne(key); missing(); }
    });
  } catch {
    await Turn.updateOne({ ...key, status: 'PENDING', leaseToken }, { $set: { status: 'FAILED' } });
  } finally { await release(claim); }
  const fresh = await current(user);
  await owned(fresh, conversationId);
  return { conversationId, turn: await ownedTurnDto(fresh, await Turn.findOne(key).lean()) };
}
