import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ChatRequestSchema, ChatHistorySendSchema, ChatHistoryPageSchema } from '../dist/index.js';

const turn = () => ({ id: randomUUID(), userMessage: 'Synthetic question', createdAt: new Date().toISOString(), status: 'COMPLETED', reply: 'Saved answer', replyHidden: false, citations: [], attachments: [], proposedAction: null });
test('legacy chat clients remain valid; persisted clients supply a UUID for idempotence', () => {
  assert.equal(ChatRequestSchema.safeParse({ message: 'hello', conversationId: 'legacy-provider-id' }).success, true);
  assert.equal(ChatRequestSchema.safeParse({ message: 'hello', clientMessageId: randomUUID() }).success, true);
  assert.equal(ChatRequestSchema.safeParse({ message: 'hello', clientMessageId: 'invalid' }).success, false);
});
test('restored turns cannot carry executable actions or attachment access', () => {
  const data = { conversationId: randomUUID(), turn: turn() };
  assert.equal(ChatHistorySendSchema.safeParse(data).success, true);
  assert.equal(ChatHistorySendSchema.safeParse({ ...data, turn: { ...data.turn, proposedAction: { tool: 'write' } } }).success, false);
  assert.equal(ChatHistorySendSchema.safeParse({ ...data, turn: { ...data.turn, attachments: [{ url: 'https://invalid.test' }] } }).success, false);
});
test('hidden answer and pending states remain readable without leaking a required answer', () => {
  const conversation = { id: randomUUID(), title: 'Synthetic conversation', updatedAt: new Date().toISOString() };
  const items = [{ ...turn(), reply: null, replyHidden: true }, { ...turn(), status: 'PENDING', reply: null }];
  assert.equal(ChatHistoryPageSchema.safeParse({ conversation, items, nextCursor: null }).success, true);
  assert.equal(ChatHistoryPageSchema.safeParse({ conversation, items: Array.from({ length: 31 }, turn), nextCursor: null }).success, false);
});

const id = 'a'.repeat(24);
const month = '2026-10';
const time = '2026-10-01T00:00:00.000Z';
const digest64 = 'a'.repeat(64);

const actionFixtures = {
  'revenue_kpi.open_period': {
    actionId: randomUUID(),
    type: 'revenue_kpi.open_period',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    preview: {
      periodId: id,
      period: month,
      version: 1,
      status: 'DRAFT',
      planDigest: digest64,
      generatedAt: time,
      summary: { create: 0, skipped: 0, blocked: 0, total: 0 },
      items: [],
      executed: false,
    },
    result: null,
  },
  'revenue_kpi.mutate_assignment': {
    actionId: randomUUID(),
    type: 'revenue_kpi.mutate_assignment',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    args: { assignmentId: id, action: 'publish', expectedVersion: 1, planDigest: digest64 },
    preview: {
      assignmentId: id,
      period: month,
      unitType: 'STORE',
      storeId: id,
      areaKey: null,
      assigneeEmployeeId: id,
      assigneeRole: 'SM',
      currentStatus: 'DRAFT',
      expectedVersion: 1,
      planDigest: digest64,
      summary: 'Giao KPI doanh thu',
      impacts: [],
      warnings: [],
      executed: false,
    },
    result: null,
  },
  'revenue_kpi.result_action': {
    actionId: randomUUID(),
    type: 'revenue_kpi.result_action',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    args: { period: month, expectedVersion: 1, planDigest: digest64 },
    preview: {
      kind: 'compute',
      period: month,
      targetId: month,
      expectedVersion: 1,
      planDigest: digest64,
      summary: 'Tính kết quả KPI',
      requirements: [],
      expected: [],
      warnings: [],
      executed: false,
    },
    result: null,
  },
  'revenue_kpi.create_period': {
    actionId: randomUUID(),
    type: 'revenue_kpi.create_period',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    args: {
      period: month,
      policy: {
        defaultGrowthPercent: 3,
        growthBase: 'PREVIOUS_MONTH',
        underperformingRateThresholdPercent: 30,
        acceptanceWindowWorkingDays: 3,
        allowDemoData: false,
        aiProposalEnabled: true,
      },
      expectedVersion: 0,
      planDigest: digest64,
    },
    preview: {
      period: month,
      policy: {
        defaultGrowthPercent: 3,
        growthBase: 'PREVIOUS_MONTH',
        underperformingRateThresholdPercent: 30,
        acceptanceWindowWorkingDays: 3,
        allowDemoData: false,
        aiProposalEnabled: true,
      },
      planDigest: digest64,
      summary: 'Tạo kỳ KPI doanh thu',
      warnings: [],
      executed: false,
    },
    result: null,
  },
  'revenue_kpi.save_assignment': {
    actionId: randomUUID(),
    type: 'revenue_kpi.save_assignment',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    args: {
      period: month,
      unitType: 'STORE',
      assigneeEmployeeId: null,
      storeId: id,
      targetMode: 'ABSOLUTE_VND',
      targetVnd: 100000000,
      reason: 'Giao chỉ tiêu cửa hàng',
      expectedVersion: 0,
      planDigest: digest64,
      bulk: false,
    },
    preview: {
      period: month,
      unitType: 'STORE',
      bulk: false,
      planDigest: digest64,
      summary: 'Xem trước lưu chỉ tiêu',
      willCreate: [],
      willSkip: [],
      blocked: [],
      warnings: [],
      executed: false,
    },
    result: null,
  },
  'performance_kpi.task_action': {
    actionId: randomUUID(),
    type: 'performance_kpi.task_action',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    args: {
      expectedVersion: 0,
      clientRequestId: randomUUID(),
      kind: 'task.accept',
      taskId: id,
      planDigest: digest64,
    },
    preview: {
      kind: 'task.accept',
      period: month,
      policyId: id,
      expectedVersion: 0,
      planDigest: digest64,
      summary: 'Chấp nhận nhiệm vụ',
      willCreate: [],
      willSkip: [],
      blocked: [],
      warnings: [],
      executed: false,
    },
    result: null,
  },
  'performance_kpi.evaluation_action': {
    actionId: randomUUID(),
    type: 'performance_kpi.evaluation_action',
    status: 'PENDING',
    expiresAt: time,
    requiresConfirmation: true,
    executed: false,
    args: {
      expectedVersion: 1,
      clientRequestId: randomUUID(),
      kind: 'evaluation.score',
      evaluationId: id,
      planDigest: digest64,
    },
    preview: {
      kind: 'evaluation.score',
      evaluationId: id,
      period: month,
      currentStatus: 'OPEN',
      projectedStatus: 'MANAGER_REVIEW',
      expectedVersion: 1,
      planDigest: digest64,
      summary: 'Đánh giá KPI',
      disputedCriterionCodes: [],
      disputedTaskIds: [],
      deadlineAt: null,
      criteriaScores: [],
      taskGroupScore: null,
      projectedFinalScore: null,
      warnings: [],
      executed: false,
    },
    result: null,
  },
};

test('chat history turn accepts all 7 server-validated revenue and performance kpi action variants', () => {
  const conversation = { id: randomUUID(), title: 'Synthetic conversation', updatedAt: new Date().toISOString() };
  for (const [key, action] of Object.entries(actionFixtures)) {
    const sendPayload = { conversationId: randomUUID(), turn: { ...turn(), proposedAction: action } };
    assert.equal(ChatHistorySendSchema.safeParse(sendPayload).success, true, `ChatHistorySendSchema must accept ${key}`);

    const pagePayload = { conversation, items: [{ ...turn(), proposedAction: action }], nextCursor: null };
    assert.equal(ChatHistoryPageSchema.safeParse(pagePayload).success, true, `ChatHistoryPageSchema must accept ${key}`);
  }
});

test('chat history turns reject unknown action types, forged fields, and non-action objects', () => {
  const conversation = { id: randomUUID(), title: 'Synthetic conversation', updatedAt: new Date().toISOString() };

  // Unknown action type rejected
  const unknownType = { ...actionFixtures['revenue_kpi.open_period'], type: 'revenue_kpi.unknown_period' };
  assert.equal(ChatHistorySendSchema.safeParse({ conversationId: randomUUID(), turn: { ...turn(), proposedAction: unknownType } }).success, false);
  assert.equal(ChatHistoryPageSchema.safeParse({ conversation, items: [{ ...turn(), proposedAction: unknownType }], nextCursor: null }).success, false);

  // Forged extra fields rejected (strict schema enforcement)
  const forgedRevenue = { ...actionFixtures['revenue_kpi.create_period'], forgedField: 'hack' };
  assert.equal(ChatHistorySendSchema.safeParse({ conversationId: randomUUID(), turn: { ...turn(), proposedAction: forgedRevenue } }).success, false);
  assert.equal(ChatHistoryPageSchema.safeParse({ conversation, items: [{ ...turn(), proposedAction: forgedRevenue }], nextCursor: null }).success, false);

  const forgedPerformance = { ...actionFixtures['performance_kpi.task_action'], forgedPayload: 123 };
  assert.equal(ChatHistorySendSchema.safeParse({ conversationId: randomUUID(), turn: { ...turn(), proposedAction: forgedPerformance } }).success, false);
  assert.equal(ChatHistoryPageSchema.safeParse({ conversation, items: [{ ...turn(), proposedAction: forgedPerformance }], nextCursor: null }).success, false);

  // Preserves null proposedAction for standard conversation turns
  assert.equal(ChatHistorySendSchema.safeParse({ conversationId: randomUUID(), turn: turn() }).success, true);
  assert.equal(ChatHistoryPageSchema.safeParse({ conversation, items: [turn()], nextCursor: null }).success, true);
});
