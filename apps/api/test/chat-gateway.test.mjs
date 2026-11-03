import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { SettingsModel } from '../dist/models/Settings.js';
import router from '../dist/routes/chat.js';
import { chatWithAiService as rawChatTransport, resetKeyCooldowns, getHealthyKeyPool } from '../dist/services/ai-client.service.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';

// These are transport stubs, not authorization proofs. Real signed receipt,
// current-user scope, ACL and response sanitation run in authorization-chat-v1.
const bound = { requestId: '11111111-1111-4111-8111-111111111111', delegationToken: 'isolated-unit-transport-token-not-a-real-receipt' };
const chatWithAiService = (message, context, conversationId) => rawChatTransport(message, context, conversationId, bound);
const context = { userId: 'user-test', role: 'Employee', employeeId: 'employee-test', departmentId: 'department-test' };
const answer = {
  reply: 'Phản hồi kiểm thử', intent: 'cash_audit', intentId: 'cash_audit',
  citations: [{ document: 'Tài liệu kiểm thử', article: 'Điều 1', version: '1', score: 1 }],
  proposedAction: { type: 'submit_cash_explanation', requiresConfirmation: true, args: { request: 'test' }, preview: 'Bản nháp kiểm thử' },
};

test('optional shadow metadata is validated separately and cannot break a valid answer or enable advisory', async (t) => {
  mockSettings(t);
  const analysis = { mode: 'SHADOW', status: 'ok', execution: 'mock', source: 'jev_systemone', intent: 'policy_query',
    needsManagerApprovalProbability: 0, incidentUrgency: 1, intentConfidence: 0.8, intentProbabilities: { policy_query: 0.8 }, latencyMs: 1 };
  let metadata = analysis;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...answer, decisionSource: 'authorization-v1', decisionAnalysis: metadata }));
  const result = await chatWithAiService('synthetic', context);
  assert.deepEqual(result.decisionAnalysis, analysis); assert.equal(result.decisionSource, 'authorization-v1');
  for (const change of [{ mode: 'ADVISORY' }, { approved: true }, { execution: 'live' }, { intentConfidence: 2 }]) {
    metadata = { ...analysis, ...change };
    const response = await chatWithAiService('synthetic', context);
    assert.equal(response.reply, answer.reply); assert.equal(response.decisionAnalysis, undefined);
  }
});
test('callback origin comes only from server configuration, never caller context', async (t) => {
  mockSettings(t);
  process.env.AUTHORIZATION_SELF_ORIGIN='https://trusted-api.invalid/';
  let body;
  t.mock.method(globalThis,'fetch',async (_url,init)=>{body=JSON.parse(init.body);return Response.json(answer);});
  await chatWithAiService('synthetic',{...context,authorizationOrigin:'https://attacker.invalid'});
  assert.equal(body.authorizationOrigin,'https://trusted-api.invalid');
  assert.equal(body.userContext,undefined);
});

// Only the external DB/provider boundaries are stubbed; no database connection or mutation.
function mockSettings(t) {
  t.mock.method(SettingsModel, 'findById', () => ({ lean: async () => null }));
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  process.env.AI_LLM_API_KEY = 'test-only-not-a-credential';
  process.env.AI_LLM_BASE_URL = 'https://provider.test.invalid/v1';
  process.env.AI_SERVICE_API_KEY = 'test-service-key';
  delete process.env.AI_LLM_API_KEYS;
  delete process.env.GEMINI_API_KEYS;
  delete process.env.OPENAI_API_KEY;
  resetKeyCooldowns();
  t.after(resetKeyCooldowns);
  delete process.env.AI_LLM_MODEL;
}

function mockBoundaries(t) {
  mockSettings(t);
  return t.mock.method(globalThis, 'fetch', async () => Response.json(answer));
}

async function nativeBoundary(t, respond = () => answer) {
  mockSettings(t);
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('error', () => { res.destroy(); });
    req.on('end', () => {
      try {
        const request = { path: req.url, headers: req.headers, body: JSON.parse(body) };
        requests.push(request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(respond(request.body)));
      } catch {
        res.destroy();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  }));
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
  return requests;
}

function handler() {
  return router.stack.find((layer) => layer.route?.path === '/chat').route.stack.at(-1).handle;
}
function response() {
  return { statusCode: 200, setHeader() { return this; }, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('chat requires authentication and rejects missing or invalid tokens before upstream', async (t) => {
  const fetchMock = mockBoundaries(t);
  const authenticate = router.stack.find((layer) => layer.route?.path === '/chat').route.stack[0].handle;
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

test('a forged legacy role context without current capability cannot call provider or create authority', async (t) => {
  const fetchMock = mockBoundaries(t), res = response();
  await handler()({ body: { message: ' câu hỏi ', conversationId: 'conversation-test', userContext: { role: 'Admin' } }, user: context }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'RBAC_DENIED');
  assert.equal(fetchMock.mock.calls.length, 0);
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

test('native transport sends only bound receipt, never legacy role/store/userContext', async (t) => {
  const requests = await nativeBoundary(t), before = Date.now();
  const result = await chatWithAiService('Hướng dẫn duyệt yêu cầu', { ...context, businessRole: 'admin', storeName: 'FORGED_SCOPE' }, 'native-conversation');
  assert.equal(result.reply, answer.reply);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.path, '/api/v1/authorized-chat');
  assert.equal(request.headers['x-ai-service-key'], 'test-service-key');
  assert.equal('userContext' in request.body, false);
  assert.equal('role' in request.body, false);
  assert.equal(request.body.requestId, bound.requestId);
  assert.equal(request.body.delegationToken, bound.delegationToken);
  assert.equal(request.body.conversationId, 'native-conversation');
  assert.ok(request.body.deadlineAtMs >= before + 15000 && request.body.deadlineAtMs <= Date.now() + 15000);
  assert.equal('deadlineAtMs' in result, false);
});

test('unbound transport fails closed before provider even if legacy context says global Admin', async (t) => {
  const fetchMock = mockBoundaries(t);
  const result = await rawChatTransport('all data', { role: 'Admin', businessRole: 'admin' });
  assert.equal(result.abstain, true); assert.equal(result.degraded, true);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('native wire deadline includes provider lookup and caps every provider timeout', async (t) => {
  const requests = await nativeBoundary(t);
  process.env.AI_LLM_API_KEYS = 'AQ.DeadlineKey1,AQ.DeadlineKey2';
  delete process.env.AI_LLM_API_KEY;
  const entry = 1_800_000_000_000;
  let now = entry;
  t.mock.method(Date, 'now', () => now);
  SettingsModel.findById.mock.mockImplementation(() => ({ lean: async () => { now += 4000; return null; } }));
  const result = await chatWithAiService('deadline query', context, undefined);
  assert.equal(result.reply, answer.reply);
  assert.equal(requests.length, 1);
  const payload = requests[0].body;
  assert.equal(payload.deadlineAtMs, entry + 15000);
  assert.ok(payload.providerConfig.providers.length >= 2);
  for (const provider of payload.providerConfig.providers) {
    assert.ok(provider.timeoutMs > 0 && provider.timeoutMs <= 11000);
  }
});

test('successful native fallback cools only the failed key without exposing provider errors', async (t) => {
  let failedKey;
  const requests = await nativeBoundary(t, (body) => {
    const failed = body.providerConfig.providers[0];
    failedKey ??= failed.apiKey;
    return { ...answer, providers: [{ providerId: failed.id, code: 'QUOTA_EXCEEDED' }] };
  });
  process.env.AI_LLM_API_KEYS = 'AQ.FallbackKey1,AQ.FallbackKey2';
  delete process.env.AI_LLM_API_KEY;
  const result = await chatWithAiService('fallback query');
  assert.equal(result.reply, answer.reply);
  assert.equal('providers' in result, false);
  assert.equal('error' in result, false);
  assert.equal(getHealthyKeyPool().includes(failedKey), false);
  assert.equal(getHealthyKeyPool().length, 1);
  await chatWithAiService('next query');
  assert.equal(requests.length, 2);
  assert.ok(requests[1].body.providerConfig.providers.every((provider) => provider.apiKey !== failedKey));
});

test('expired lookup budget never starts a sidecar request', async (t) => {
  const fetchMock = mockBoundaries(t);
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  SettingsModel.findById.mock.mockImplementation(() => ({ lean: async () => { now += 15000; return null; } }));
  const result = await chatWithAiService('expired query');
  assert.equal(result.degraded, true);
  assert.equal(result.abstain, true);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('native sidecar never receives all-cooled environment keys and resumes after expiry', async (t) => {
  const requests = await nativeBoundary(t, (body) => ({
    ...answer,
    providers: body.providerConfig.providers.map((provider) => ({ providerId: provider.id, code: 'QUOTA_EXCEEDED' })),
  }));
  process.env.AI_LLM_API_KEYS = 'AQ.CooledKey1,AQ.CooledKey2';
  delete process.env.AI_LLM_API_KEY;
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  assert.equal((await chatWithAiService('quota query')).reply, answer.reply);
  assert.deepEqual(getHealthyKeyPool(), []);
  const exhausted = await chatWithAiService('exhausted query');
  assert.equal(exhausted.degraded, true);
  assert.equal(exhausted.abstain, true);
  assert.equal(requests.length, 1);
  now += 60_000;
  assert.equal((await chatWithAiService('recovered query')).reply, answer.reply);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.providerConfig.providers.length, 2);
});

test('missing API provider credentials never delegate key selection to sidecar environment', async (t) => {
  const requests = await nativeBoundary(t);
  delete process.env.AI_LLM_API_KEY;
  const result = await chatWithAiService('no configured providers');
  assert.equal(result.degraded, true);
  assert.equal(result.abstain, true);
  assert.equal(requests.length, 0);
});
