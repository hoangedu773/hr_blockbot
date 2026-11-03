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
