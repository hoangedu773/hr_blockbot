import mongoose from "mongoose";
import { Router } from "express";
import { decideRevenueKpiOpenAction, getRevenueKpiOpenAction, decideChatAction, getRevenueKpiAssignmentAction, getRevenueKpiResultAction, decideChatKpiResultAction, RevenueKpiPlanChangedError, RevenueKpiAssignmentPlanChangedError, RevenueKpiResultPlanChangedError } from '../services/revenue-kpi.service.js';
import { getChatRevenueCreatePeriodAction, getChatRevenueSaveAssignmentAction, decideChatRevenueCreatePeriod, decideChatRevenueSaveAssignment } from '../services/chat-authorization.service.js';
import { decideChatScheduleAction } from '../services/schedule-chat.service.js';
import { getChatPerformanceKpiAction, decideChatPerformanceKpiAction, previewPerformanceKpiTaskAction, previewPerformanceKpiEvaluationAction, PerformanceKpiTaskPlanChangedError, PerformanceKpiEvaluationPlanChangedError } from '../services/performance-kpi-action.service.js';
import { z } from "zod";
import { ChatRequestSchema, RevenueKpiOpenActionIdSchema, RevenueKpiCreatePeriodActionSchema, RevenueKpiSaveAssignmentActionSchema, PerformanceKpiChatActionSchema, ScheduleChatActionSchema } from "@hr-blockbot/contracts";
import type { RevenueKpiOpenAction, RevenueKpiAssignmentAction, RevenueKpiChatAction, RevenueKpiResultAction, RevenueKpiCreatePeriodAction, RevenueKpiSaveAssignmentAction, PerformanceKpiChatAction, ScheduleChatAction } from "@hr-blockbot/contracts";
import { RevenueKpiChatActionSchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
import { authorizedChat } from "../services/chat-authorization.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { createConversation, listConversations, conversationMessages, chatWithHistory, deleteConversation, chatWithHistoryStream } from '../services/chat-history.service.js';
import { startSseResponse, sendSseEvent, mapToChatErrorPayload } from '../lib/chat-sse.js';
const router = Router();

type ChatKpiDecisionResult = { kind: 'open_period'; action: RevenueKpiOpenAction } | { kind: 'mutate_assignment'; action: RevenueKpiAssignmentAction } | { kind: 'result_action'; action: RevenueKpiResultAction } | { kind: 'create_period'; action: RevenueKpiCreatePeriodAction } | { kind: 'save_assignment'; action: RevenueKpiSaveAssignmentAction } | { kind: 'performance'; action: PerformanceKpiChatAction } | { kind: 'schedule'; action: ScheduleChatAction };

// P5 loaders live in chat-authorization.service and share the 404 contract
// (REVENUE_KPI_ACTION_NOT_FOUND on missing row or wrong persisted type), so the
// same notFound() collapse below covers all six row types without leaking
// existence. Executors are selected by the row's persisted `type`, never the
// client payload.
const p5NotFound = (error: unknown) => error instanceof WorkflowError && error.code === 'REVENUE_KPI_ACTION_NOT_FOUND';
type ChatKpiActionDispatchRow = {
  _id: string;
  ownerId: string;
  type?: string;
};

// Server-owned dispatch: read the action row's persisted `type` directly from
// storage to select the executor/loader without triggering feature-flag checks
// (e.g. 503 REVENUE_KPI_DISABLED) across different action domains.
export async function getChatKpiAction(user: AuthenticatedUser, id: string): Promise<RevenueKpiChatAction | PerformanceKpiChatAction> {
  const parsedId = RevenueKpiOpenActionIdSchema.safeParse(id);
  if (!parsedId.success) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Message/conversation identifier is invalid');
  const actionId = parsedId.data;
  const row = await mongoose.connection.collection<ChatKpiActionDispatchRow>('revenue_kpi_open_actions').findOne(
    { _id: actionId, ownerId: user.userId },
    { projection: { type: 1 } }
  );
  if (!row) throw new WorkflowError(404, 'REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.');
  const actionType = row.type ?? 'revenue_kpi.open_period';
  if (actionType === 'performance_kpi.task_action' || actionType === 'performance_kpi.evaluation_action') {
    return getChatPerformanceKpiAction(user, actionId);
  }
  if (actionType === 'revenue_kpi.open_period') {
    return getRevenueKpiOpenAction(user, actionId);
  }
  if (actionType === 'revenue_kpi.mutate_assignment') {
    return getRevenueKpiAssignmentAction(user, actionId);
  }
  if (actionType === 'revenue_kpi.result_action') {
    return getRevenueKpiResultAction(user, actionId);
  }
  if (actionType === 'revenue_kpi.create_period') {
    return getChatRevenueCreatePeriodAction(user, actionId);
  }
  if (actionType === 'revenue_kpi.save_assignment') {
    return getChatRevenueSaveAssignmentAction(user, actionId);
  }
  throw new WorkflowError(404, 'REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.');
}

export async function decideChatKpiAction(user: AuthenticatedUser, actionId: string, raw: unknown): Promise<ChatKpiDecisionResult> {
  const parsedId = RevenueKpiOpenActionIdSchema.safeParse(actionId);
  if (!parsedId.success) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Message/conversation identifier is invalid');
  const id = parsedId.data;
  const row = await mongoose.connection.collection<ChatKpiActionDispatchRow>('revenue_kpi_open_actions').findOne(
    { _id: id, ownerId: user.userId },
    { projection: { type: 1 } }
  );
  if (!row) throw new WorkflowError(404, 'REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.');
  const actionType = row.type ?? 'revenue_kpi.open_period';
  if (actionType === 'performance_kpi.task_action' || actionType === 'performance_kpi.evaluation_action') {
    const decision = await decideChatPerformanceKpiAction(user, id, raw);
    return { kind: 'performance', action: PerformanceKpiChatActionSchema.parse(publicChatKpiAction(decision) as unknown) };
  }
  if (actionType === 'revenue_kpi.open_period') {
    return { kind: 'open_period', action: await decideRevenueKpiOpenAction(user, id, raw) };
  }
  if (actionType === 'revenue_kpi.mutate_assignment') {
    return { kind: 'mutate_assignment', action: await decideChatAction(user, id, raw) };
  }
  if (actionType === 'revenue_kpi.result_action') {
    return { kind: 'result_action', action: await decideChatKpiResultAction(user, id, raw) };
  }
  if (actionType === 'revenue_kpi.create_period') {
    const decision = await decideChatRevenueCreatePeriod(user, id, raw);
    return { kind: 'create_period', action: RevenueKpiCreatePeriodActionSchema.parse(publicChatKpiAction(decision) as unknown) };
  }
  if (actionType === 'revenue_kpi.save_assignment') {
    const decision = await decideChatRevenueSaveAssignment(user, id, raw);
    return { kind: 'save_assignment', action: RevenueKpiSaveAssignmentActionSchema.parse(publicChatKpiAction(decision) as unknown) };
  }
  if (actionType.startsWith('schedule.')) {
    const decision = await decideChatScheduleAction(user, id, raw);
    return { kind: 'schedule', action: ScheduleChatActionSchema.parse(decision) };
  }
  throw new WorkflowError(404, 'REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.');
}

function publicChatKpiAction(action: object): Record<string, unknown> {
  const payload = { ...action } as Record<string, unknown>;
  delete payload.kind;
  const args = payload.args;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const normalizedArgs = { ...args };
    if ('storeIds' in normalizedArgs && normalizedArgs.storeIds === null) delete normalizedArgs.storeIds;
    payload.args = normalizedArgs;
  }
  return payload;
}

router.get('/chat/actions/:id', authenticateToken, endpoint(async (req, res) => {
  const action = await getChatKpiAction(req.user!, String(req.params.id));
  const schema = action.type.startsWith('performance_kpi') ? PerformanceKpiChatActionSchema : RevenueKpiChatActionSchema;
  res.set('Cache-Control', 'private, no-store').json(schema.parse(publicChatKpiAction(action)));
}));
router.post('/chat/actions/performance/preview', authenticateToken, endpoint(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const parsed = z.object({
    domain: z.enum(['task', 'evaluation']),
    kind: z.string().min(3).max(40),
    target: z.record(z.unknown()).default({}),
    content: z.record(z.unknown()).default({}),
    reason: z.string().trim().min(5).max(2000).optional(),
  }).strict().parse(req.body);
  const content = {
    ...parsed.content,
    ...(parsed.reason && !parsed.content.reason ? { reason: parsed.reason } : {}),
  };
  if (parsed.domain === 'task') {
    const proposal = await previewPerformanceKpiTaskAction(
      req.user!,
      parsed.kind,
      parsed.target as { policyId?: string; taskId?: string },
      content
    );
    res.json({
      ...proposal,
      requiresConfirmation: true,
      executed: false,
    });
  } else {
    if (!parsed.target.evaluationId || typeof parsed.target.evaluationId !== 'string') {
      throw new WorkflowError(400, 'VALIDATION_FAILED', 'Target evaluationId is required');
    }
    const proposal = await previewPerformanceKpiEvaluationAction(
      req.user!,
      parsed.kind,
      { evaluationId: parsed.target.evaluationId },
      content
    );
    res.json({
      ...proposal,
      requiresConfirmation: true,
      executed: false,
    });
  }
}));
router.post('/chat/actions/:id/decision', authenticateToken, endpoint(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const { action } = await decideChatKpiAction(req.user!, String(req.params.id), req.body);
    const schema = action.type.startsWith('performance_kpi') ? PerformanceKpiChatActionSchema
      : action.type.startsWith('schedule.') ? ScheduleChatActionSchema : RevenueKpiChatActionSchema;
    res.json(schema.parse(publicChatKpiAction(action)));
  } catch (error) {
    if (error instanceof RevenueKpiResultPlanChangedError || error instanceof PerformanceKpiTaskPlanChangedError || error instanceof PerformanceKpiEvaluationPlanChangedError || (error instanceof WorkflowError && (error.code === 'PERFORMANCE_KPI_PLAN_CHANGED' || error.code === 'REVENUE_KPI_PLAN_CHANGED'))) {
      const preview = error && typeof error === 'object' && 'preview' in error ? (error as { preview: unknown }).preview : undefined;
      res.status(409).json({ error: { code: (error as { code: string }).code, message: (error as Error).message }, preview });
      return;
    }
    if (!(error instanceof RevenueKpiPlanChangedError || error instanceof RevenueKpiAssignmentPlanChangedError)) throw error;
    res.status(409).json({ error: { code: error.code, message: error.message }, preview: error.preview });
  }
}));
router.post('/chat/conversations', authenticateToken, endpoint(async (req, res) => { res.status(201).json(await createConversation(req.user!, req.body)); }));
router.get('/chat/conversations', authenticateToken, endpoint(async (req, res) => { res.json(await listConversations(req.user!, req.query)); }));
router.get('/chat/conversations/:id/messages', authenticateToken, endpoint(async (req, res) => { res.json(await conversationMessages(req.user!, req.params.id, req.query)); }));
router.delete('/chat/conversations/:id', authenticateToken, endpoint(async (req, res) => { await deleteConversation(req.user!, req.params.id); res.status(204).end(); }));
router.post("/chat", authenticateToken, endpoint(async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Message/conversation identifier is invalid");
  res.setHeader("Cache-Control", "private, no-store");
  res.json(parsed.data.clientMessageId ? await chatWithHistory(req.user!, parsed.data.message, parsed.data.conversationId, parsed.data.clientMessageId)
    : await authorizedChat(req.user!, parsed.data.message, parsed.data.conversationId));
}));
router.post("/chat/stream", authenticateToken, endpoint(async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.clientMessageId) {
    throw new WorkflowError(400, "VALIDATION_FAILED", "Message/conversation identifier is invalid");
  }
  const clientMessageId = parsed.data.clientMessageId;
  const message = parsed.data.message;
  const conversationId = parsed.data.conversationId;
  const user = req.user!;

  let sseStarted = false;
  let seq = 0;
  const controller = new AbortController();

  const onResponseClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  res.on("close", onResponseClose);
  if (res.destroyed || res.closed) {
    controller.abort();
  }
  const ensureSse = () => {
    if (!sseStarted) {
      startSseResponse(res);
      sseStarted = true;
    }
  };

  try {
    const result = await chatWithHistoryStream(
      user,
      message,
      conversationId,
      clientMessageId,
      {
        signal: controller.signal,
        onAccepted: async (payload) => {
          if (controller.signal.aborted || res.destroyed || res.closed) {
            throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Kết nối đã đóng');
          }
          ensureSse();
          await sendSseEvent(res, "accepted", payload, controller.signal);
          if (controller.signal.aborted || res.destroyed || res.closed) {
            throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Kết nối đã đóng');
          }
        },
        onChunk: async (delta) => {
          if (controller.signal.aborted || res.destroyed || res.closed) {
            throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Kết nối đã đóng');
          }
          ensureSse();
          await sendSseEvent(res, "chunk", {
            clientMessageId,
            messageId: clientMessageId,
            seq: seq++,
            kind: "text",
            delta,
          }, controller.signal);
          if (controller.signal.aborted || res.destroyed || res.closed) {
            throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Kết nối đã đóng');
          }
        },
      }
    );
    if (controller.signal.aborted || res.writableEnded) {
      return;
    }
    ensureSse();
    await sendSseEvent(res, "done", result, controller.signal);
    if (!res.writableEnded) {
      res.end();
    }
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    if (sseStarted) {
      const errorPayload = mapToChatErrorPayload(error, clientMessageId);
      await sendSseEvent(res, "error", errorPayload);
      if (!res.writableEnded) res.end();
    } else {
      throw error;
    }
  } finally {
    res.off("close", onResponseClose);
  }
}));
export default router;
