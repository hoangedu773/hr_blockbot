import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsModel } from '../dist/models/Settings.js';
import router from '../dist/routes/chat.js';
import { authenticateToken } from '../dist/middlewares/auth.middleware.js';
import { chatWithAiService, DEFAULT_GEMINI_PROVIDER } from '../dist/services/ai-client.service.js';

const context = { userId: 'user-test', role: 'Employee', employeeId: 'employee-test', departmentId: 'department-test' };
const answer = {
  reply: 'Phản hồi kiểm thử', intent: 'cash_audit', intentId: 'cash_audit',
  citations: [{ document: 'Tài liệu kiểm thử', article: 'Điều 1', version: '1', score: 1 }],
  proposedAction: { type: 'submit_cash_explanation', requiresConfirmation: true, args: { request: 'test' }, preview: 'Bản nháp kiểm thử' },
};

// Only the external DB/provider boundaries are stubbed; no database connection or mutation.
function mockBoundaries(t) {
  t.mock.method(SettingsModel, 'findById', () => ({ lean: async () => null }));
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  process.env.AI_LLM_API_KEY = 'test-only-not-a-credential';
  delete process.env.AI_LLM_BASE_URL;
  delete process.env.AI_LLM_MODEL;
  return t.mock.method(globalThis, 'fetch', async () => Response.json(answer));
}

function handler() {
  return router.stack.find((layer) => layer.route?.path === '/chat').route.stack.at(-1).handle;
}
function response() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('chat requires authentication and rejects missing or invalid tokens before upstream', async (t) => {
  const fetchMock = mockBoundaries(t);
  const authenticate = router.stack.find((layer) => layer.route?.path === '/chat').route.stack[0].handle;
  assert.equal(authenticate, authenticateToken);
  for (const headers of [{}, { authorization: 'Bearer invalid-token' }]) {
    const res = response();
    let continued = false;
    await authenticate({ headers }, res, () => { continued = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.equal(continued, false);
  }
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('gateway forwards authenticated context, conversation and canonical action fields', async (t) => {
  const fetchMock = mockBoundaries(t);
  const res = response();
  await handler()({ body: { message: ' câu hỏi ', conversationId: 'conversation-test', userContext: { role: 'Admin' } }, user: context }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.proposedAction, answer.proposedAction);
  assert.deepEqual(res.body.citations, answer.citations);
  assert.equal(res.body.intent, 'cash_audit');
  assert.equal(res.body.intentId, 'cash_audit');
  assert.equal(res.body.conversationId, 'conversation-test');
  const request = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(request.message, 'câu hỏi');
  assert.deepEqual(request.userContext, context);
  assert.equal(request.conversationId, 'conversation-test');
  const provider = request.providerConfig.providers[0];
  assert.equal(provider.baseUrl, DEFAULT_GEMINI_PROVIDER.baseUrl);
  assert.equal(provider.model, 'ag/gemini-3.8-flash-low');
  assert.equal(provider.timeoutMs, 15000);
  assert.equal(DEFAULT_GEMINI_PROVIDER.apiKey, '');
});

test('gateway uses environment overrides and OPENAI_API_KEY fallback', async (t) => {
  const fetchMock = mockBoundaries(t);
  process.env.AI_LLM_BASE_URL = 'https://provider.invalid/v1';
  process.env.AI_LLM_MODEL = 'test-model';
  delete process.env.AI_LLM_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-fallback';
  await chatWithAiService('test');
  const provider = JSON.parse(fetchMock.mock.calls[0].arguments[1].body).providerConfig.providers[0];
  assert.equal(provider.baseUrl, 'https://provider.invalid/v1');
  assert.equal(provider.model, 'test-model');
  assert.equal(provider.apiKey, 'test-only-fallback');
});

test('route rejects malformed or oversized input without calling upstream', async (t) => {
  const fetchMock = mockBoundaries(t);
  for (const body of [null, [], {}, { message: [] }, { message: ' ' }, { message: 'x'.repeat(2001) }, { message: 'test', conversationId: {} }, { message: 'test', conversationId: ' ' }]) {
    const res = response();
    await handler()({ body, user: context }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  }
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('offline, HTTP failures and invalid upstream contracts return honest degraded results', async (t) => {
  const fetchMock = mockBoundaries(t);
  for (const value of [null, { reply: {} }, { reply: 'test', citations: [{ document: 'test', score: 2 }] }, { reply: 'test', proposedAction: { type: [] } }]) {
    fetchMock.mock.mockImplementation(async () => Response.json(value));
    const result = await chatWithAiService('test', context, 'conversation-test');
    assert.equal(result.degraded, true);
    assert.equal(result.abstain, true);
    assert.equal(result.proposedAction, null);
    assert.deepEqual(result.citations, []);
  }
  for (const implementation of [async () => new Response('', { status: 503 }), async () => { throw new Error('network'); }]) {
    fetchMock.mock.mockImplementation(implementation);
    assert.equal((await chatWithAiService('test')).degraded, true);
  }
});

test('15 second deadline aborts fetch and bounds stalled provider lookup', async (t) => {
  const fetchMock = mockBoundaries(t);
  let expire;
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
    if (ms === 15000) { expire = callback; return realSetTimeout(() => {}, 60000); }
    return realSetTimeout(callback, ms, ...args);
  });
  let signal;
  fetchMock.mock.mockImplementation(async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  const pending = chatWithAiService('test');
  for (let i = 0; i < 10 && !signal; i++) await Promise.resolve();
  assert.ok(signal);
  expire();
  assert.equal((await pending).degraded, true);
  assert.equal(signal.aborted, true);
  SettingsModel.findById.mock.mockImplementation(() => ({ lean: () => new Promise(() => {}) }));
  const stalled = chatWithAiService('test');
  expire();
  assert.equal((await stalled).degraded, true);
});
