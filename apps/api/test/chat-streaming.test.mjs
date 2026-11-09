import './require-isolated-db.mjs';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { RefreshSessionModel } from '../dist/models/RefreshSession.js';
import { createLoginSession } from '../dist/services/auth.service.js';
import { UserModel } from '../dist/models/User.js';
import { ChatConversationModel as Conversation, ChatTurnModel as Turn } from '../dist/models/ChatConversation.js';
import { executeGatewayTool, beginAuthorizedChat } from '../dist/services/chat-authorization.service.js';
import { streamChatWithAiService } from '../dist/services/ai-client.service.js';
import { parseSseStream, sendSseEvent, MAX_SSE_EVENT_SIZE } from '../dist/lib/chat-sse.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { chatWithHistoryStream } from '../dist/services/chat-history.service.js';

let fixture;
let server;
let upstream;
let base = '';
let policyId;
let upstreamHandler = null;
let upstreamCalls = 0;

before(async () => {
  await connectDB();
  fixture = await authorizationV1Fixture();
  process.env.AI_SERVICE_API_KEY = 'isolated-streaming-service-key';
  process.env.AI_LLM_API_KEY = 'isolated-streaming-model-key';
  process.env.AI_LLM_BASE_URL = 'https://provider.invalid/v1';

  await UserModel.updateOne(
    { _id: fixture.actors.staff.user._id },
    { $push: { 'authorization.grants.1.capabilities': 'policies.read' } }
  );

  const policyInsert = await mongoose.connection.collection('policies').insertOne({
    title: 'Quy trình phục vụ chuẩn Guta',
    content: 'Tài liệu hướng dẫn pha chế và phục vụ khách hàng.',
    version: 'v1.0.0',
    acl: {
      reviewStatus: 'APPROVED',
      approvalRef: 'stream-fixture-evidence',
      tier: 'T2_OPERATIONAL',
      classification: 'operational',
      allowedProfiles: ['staff'],
      validFrom: new Date(Date.now() - 60000).toISOString(),
      validUntil: null,
      revokedAt: null,
      scopeKind: 'stores',
      storeIds: [String(fixture.stores[0]._id)],
    },
  });
  policyId = policyInsert.insertedId;

  upstream = createServer(async (req, res) => {
    upstreamCalls++;
    if (upstreamHandler) {
      await upstreamHandler(req, res);
      return;
    }
    // Default fallback handler
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reply: 'Default synthetic answer',
      citations: [],
      attachments: [],
      proposedAction: null,
      decisionSource: 'isolated-provider',
    }));
  });

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
  const upstreamAddress = upstream.address();
  const upstreamPort = typeof upstreamAddress === 'object' && upstreamAddress !== null ? upstreamAddress.port : 0;
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${upstreamPort}`;

  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const serverAddress = server.address();
  const serverPort = typeof serverAddress === 'object' && serverAddress !== null ? serverAddress.port : 0;
  base = `http://127.0.0.1:${serverPort}/api`;
});

after(async () => {
  for (const s of [server, upstream]) {
    s.closeAllConnections();
    await new Promise((resolve) => s.close(() => resolve()));
  }
  await disconnectDB();
});

beforeEach(() => {
  upstreamHandler = null;
  upstreamCalls = 0;
});

async function callPost(actor, path, body, signal) {
  return await fetch(base + path, {
    method: 'POST',
    headers: {
      Connection: 'close',
      ...(actor ? { Authorization: 'Bearer ' + fixture.actors[actor].token } : {}),
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream, application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function callGet(actor, path) {
  const r = await fetch(base + path, {
    method: 'GET',
    headers: {
      Connection: 'close',
      ...(actor ? { Authorization: 'Bearer ' + fixture.actors[actor].token } : {}),
    },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}

async function collectSseEvents(response) {
  const events = [];
  if (!response.body) return events;
  for await (const evt of parseSseStream(response.body)) {
    let parsed = null;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      parsed = evt.data;
    }
    events.push({
      event: evt.event,
      data: parsed,
      raw: evt.data,
    });
  }
  return events;
}

// ----------------------------------------------------------------------------
// 1. Partial chunk while upstream open
// ----------------------------------------------------------------------------
test('1. partial chunk while upstream open: stream emits accepted, chunks, and done', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('event: delta\ndata: {"delta":"Chào bạn, "}\n\n');
    await new Promise((r) => setTimeout(r, 60));
    res.write('event: delta\ndata: {"delta":"tôi có thể giúp gì?"}\n\n');
    await new Promise((r) => setTimeout(r, 60));
    res.write('event: done\ndata: {"result":{"reply":"Chào bạn, tôi có thể giúp gì?","citations":[],"attachments":[],"proposedAction":null,"abstain":false}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Xin chào',
    clientMessageId,
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

  const events = await collectSseEvents(res);
  assert.equal(events[0].event, 'accepted');
  assert.equal(events[0].data.clientMessageId, clientMessageId);
  assert.equal(events[0].data.messageId, clientMessageId);
  assert.ok(events[0].data.conversationId);

  const chunks = events.filter((e) => e.event === 'chunk');
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].data.seq, 0);
  assert.equal(chunks[0].data.kind, 'text');
  assert.equal(chunks[0].data.delta, 'Chào bạn, ');
  assert.equal(chunks[1].data.seq, 1);
  assert.equal(chunks[1].data.delta, 'tôi có thể giúp gì?');

  const done = events.find((e) => e.event === 'done');
  assert.ok(done);
  assert.equal(done.data.turn.status, 'COMPLETED');
  assert.equal(done.data.turn.reply, 'Chào bạn, tôi có thể giúp gì?');

  const turnInDb = await Turn.findOne({ clientMessageId }).lean();
  assert.ok(turnInDb);
  assert.equal(turnInDb.status, 'COMPLETED');
  assert.equal(turnInDb.reply, 'Chào bạn, tôi có thể giúp gì?');
});

// ----------------------------------------------------------------------------
// 2. Revoke/ACL/data version between chunks => no further chunk, error, no completed
// ----------------------------------------------------------------------------
test('2. revoke/ACL/data version between chunks: stops immediately, emits error, cancels provider, no completed', async () => {
  let providerCancelled = false;
  let resumeUpstreamResolve;
  const resumeUpstream = new Promise((r) => { resumeUpstreamResolve = r; });
  let upstreamRes = null;

  upstreamHandler = async (req, res) => {
    upstreamRes = res;
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);

    res.on('close', () => {
      if (!res.writableEnded) {
        providerCancelled = true;
      }
    });

    // Call query_policy tool so document is added to evidence receipts
    await executeGatewayTool(body.delegationToken, {
      requestId: body.requestId,
      tool: 'query_policy',
      args: { query: 'Quy trình' },
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('event: delta\ndata: {"delta":"Phần thứ nhất. "}\n\n');
    await resumeUpstream;

    // Upstream sends delta 2, then STAYS OPEN (does not send done or end)
    if (!res.writableEnded && !res.destroyed) {
      res.write('event: delta\ndata: {"delta":"Phần thứ hai bị chặn."}\n\n');
    }
  };

  const clientMessageId = randomUUID();
  try {
    const res = await callPost('staff', '/chat/stream', {
      message: 'Hỏi về quy trình phục vụ',
      clientMessageId,
    });

    const events = [];
    if (res.body) {
      for await (const evt of parseSseStream(res.body)) {
        let parsed = null;
        try { parsed = JSON.parse(evt.data); } catch { parsed = evt.data; }
        events.push({ event: evt.event, data: parsed, raw: evt.data });
        if (evt.event === 'chunk') {
          assert.equal(providerCancelled, false, 'Provider must not be cancelled before revocation');
          // Document revoke right after receiving first chunk
          await mongoose.connection.collection('policies').updateOne(
            { _id: policyId },
            { $set: { 'acl.revokedAt': new Date().toISOString() } }
          );
          if (resumeUpstreamResolve) resumeUpstreamResolve();
        }
      }
    }

    assert.equal(events[0].event, 'accepted');

    const chunks = events.filter((e) => e.event === 'chunk');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].data.delta, 'Phần thứ nhất. ');

    const errEvt = events.find((e) => e.event === 'error');
    assert.ok(errEvt);
    assert.equal(errEvt.data.code, 'RBAC_DENIED');
    assert.equal(errEvt.data.retryable, false);

    const doneEvt = events.find((e) => e.event === 'done');
    assert.equal(doneEvt, undefined);

    const turnInDb = await Turn.findOne({ clientMessageId }).lean();
    assert.ok(turnInDb);
    assert.notEqual(turnInDb.status, 'COMPLETED');
    assert.ok(providerCancelled, 'Provider must be cancelled on revalidation failure');
  } finally {
    if (resumeUpstreamResolve) resumeUpstreamResolve();
    if (upstreamRes && !upstreamRes.writableEnded && !upstreamRes.destroyed) {
      upstreamRes.destroy();
    }
    // Restore document ACL
    await mongoose.connection.collection('policies').updateOne(
      { _id: policyId },
      { $set: { 'acl.revokedAt': null } }
    );
  }
});

test('logout of one session stops later chunks without revoking another session', { timeout: 20000 }, async () => {
  const user = await UserModel.findById(fixture.actors.staff.user._id);
  const version = user.securityVersion;
  const sessionA = await createLoginSession(user, {});
  const sessionB = await createLoginSession(user, {});
  const clientMessageId = randomUUID();
  const abort = new AbortController();
  let resume, capture, upstreamResponse, cancelled = false;
  const resumeProvider = new Promise((resolve) => { resume = resolve; });
  const captured = new Promise((resolve) => { capture = resolve; });
  let closed;
  const providerClosed = new Promise((resolve) => { closed = resolve; });

  upstreamHandler = async (req, res) => {
    upstreamResponse = res;
    let body = '';
    for await (const chunk of req) body += chunk;
    const { requestId, delegationToken } = JSON.parse(body);
    res.once('close', () => { cancelled = !res.writableEnded; closed(); });
    capture({ requestId, delegationToken });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('event: delta\ndata: {"delta":"First chunk"}\n\n');
    await resumeProvider;
    if (!res.destroyed) res.write('event: delta\ndata: {"delta":"Must not arrive"}\n\n');
  };

  try {
    const response = await fetch(base + '/chat/stream', {
      method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionA.accessToken },
      body: JSON.stringify({ message: 'Session revocation test', clientMessageId }),
    });
    assert.equal(response.status, 200);
    const events = [];
    for await (const event of parseSseStream(response.body)) {
      const data = JSON.parse(event.data);
      events.push({ event: event.event, data });
      if (event.event === 'chunk') {
        assert.equal(events.filter((item) => item.event === 'chunk').length, 1);
        assert.equal(cancelled, false);
        const scoped = await captured;
        const logout = await fetch(base + '/auth/logout', {
          method: 'POST', headers: { Cookie: 'refreshToken=' + sessionA.rawRefreshToken },
        });
        assert.equal(logout.status, 204);
        assert.equal((await UserModel.findById(user._id).lean()).securityVersion, version);
        assert.equal((await fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + sessionA.accessToken } })).status, 401);
        assert.equal((await fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + sessionB.accessToken } })).status, 200);
        await assert.rejects(executeGatewayTool(scoped.delegationToken, {
          requestId: scoped.requestId, tool: 'validate_context', args: {},
        }), (error) => error.status === 401 && error.code === 'UNAUTHENTICATED');
        resume();
      }
    }
    assert.equal(events.filter((item) => item.event === 'chunk').length, 1);
    assert.equal(events.find((item) => item.event === 'error')?.data.code, 'UNAUTHENTICATED');
    assert.equal(events.some((item) => item.event === 'done'), false);
    await providerClosed;
    assert.equal(cancelled, true);
    const turn = await Turn.findOne({ clientMessageId }).lean();
    assert.ok(turn);
    assert.notEqual(turn.status, 'COMPLETED');
  } finally {
    resume();
    abort.abort();
    if (upstreamResponse && !upstreamResponse.destroyed) upstreamResponse.destroy();
    await RefreshSessionModel.deleteMany({ userId: user._id, familyId: { $in: [sessionA.familyId, sessionB.familyId] } });
  }
});

// ----------------------------------------------------------------------------
// 3. SAFETY after partial => error & no completed
// ----------------------------------------------------------------------------
test('3. SAFETY after partial: emits error, maps to AI_SERVICE_UNAVAILABLE, no completed', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('event: delta\ndata: {"delta":"Nội dung đầu tiên an toàn"}\n\n');
    await new Promise((r) => setTimeout(r, 60));
    res.write('event: error\ndata: {"code":"SAFETY_BLOCKED"}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Nội dung kiểm tra an toàn',
    clientMessageId,
  });

  const events = await collectSseEvents(res);
  assert.equal(events[0].event, 'accepted');
  const chunks = events.filter((e) => e.event === 'chunk');
  assert.equal(chunks.length, 1);

  const errEvt = events.find((e) => e.event === 'error');
  assert.ok(errEvt);
  assert.equal(errEvt.data.code, 'AI_SERVICE_UNAVAILABLE');
  assert.equal(errEvt.data.retryable, false);
  assert.doesNotMatch(errEvt.data.message, /SAFETY_BLOCKED/);

  const doneEvt = events.find((e) => e.event === 'done');
  assert.equal(doneEvt, undefined);

  const turnInDb = await Turn.findOne({ clientMessageId }).lean();
  assert.ok(turnInDb);
  assert.notEqual(turnInDb.status, 'COMPLETED');
});

// ----------------------------------------------------------------------------
// 4. Abrupt EOF
// ----------------------------------------------------------------------------
test('4. abrupt EOF: stream terminates without done/error triggers error and fails turn', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('event: delta\ndata: {"delta":"Đang phát dở..."}\n\n');
    await new Promise((r) => setTimeout(r, 20));
    res.destroy(); // Abrupt drop
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Kiểm tra ngắt kết nối',
    clientMessageId,
  });

  const events = await collectSseEvents(res);
  assert.equal(events[0].event, 'accepted');

  const errEvt = events.find((e) => e.event === 'error');
  assert.ok(errEvt);
  assert.equal(errEvt.data.code, 'AI_SERVICE_UNAVAILABLE');

  const doneEvt = events.find((e) => e.event === 'done');
  assert.equal(doneEvt, undefined);

  const turnInDb = await Turn.findOne({ clientMessageId }).lean();
  assert.ok(turnInDb);
  assert.notEqual(turnInDb.status, 'COMPLETED');
});

// ----------------------------------------------------------------------------
// 5. Disconnect releases fenced lease, new turn works
// ----------------------------------------------------------------------------
test('5. disconnect releases fenced lease immediately: new turn can execute without waiting 45s', async () => {
  let holdUpstreamResolve = null;
  const holdUpstreamPromise = new Promise((r) => {
    holdUpstreamResolve = r;
  });

  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);

    if (body.message.includes('hold-disconnect')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('event: delta\ndata: {"delta":"Đang xử lý..."}\n\n');
      await holdUpstreamPromise;
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('event: done\ndata: {"result":{"reply":"Lượt mới thành công","citations":[],"attachments":[],"proposedAction":null}}\n\n');
    res.end();
  };

  const convRes = await callPost('staff', '/chat/conversations', { clientRequestId: randomUUID() });
  const convJson = await convRes.json();
  const conversationId = convJson.id;

  const abortController = new AbortController();
  const clientMessageId1 = randomUUID();

  // Start turn 1 with abort signal
  const streamRes1 = await callPost(
    'staff',
    '/chat/stream',
    {
      conversationId,
      message: 'hold-disconnect',
      clientMessageId: clientMessageId1,
    },
    abortController.signal
  );

  // Consume accepted event
  if (streamRes1.body) {
    const reader = streamRes1.body.getReader();
    await reader.read();
  }

  // Client aborts
  abortController.abort();
  await new Promise((r) => setTimeout(r, 50));

  // Conversation lease must be cleared
  const convInDb = await Conversation.findById(conversationId).lean();
  assert.equal(convInDb?.pendingTurnId, null);
  assert.equal(convInDb?.leaseToken, null);

  // Turn 1 must be marked INTERRUPTED
  const turn1InDb = await Turn.findOne({ clientMessageId: clientMessageId1 }).lean();
  assert.equal(turn1InDb?.status, 'INTERRUPTED');

  // Immediately start Turn 2 with new messageId
  const clientMessageId2 = randomUUID();
  const streamRes2 = await callPost('staff', '/chat/stream', {
    conversationId,
    message: 'turn-two-immediate',
    clientMessageId: clientMessageId2,
  });

  assert.equal(streamRes2.status, 200);
  const events2 = await collectSseEvents(streamRes2);
  const done2 = events2.find((e) => e.event === 'done');
  assert.ok(done2);
  assert.equal(done2.data.turn.status, 'COMPLETED');
  assert.equal(done2.data.turn.reply, 'Lượt mới thành công');

  if (holdUpstreamResolve) holdUpstreamResolve();
});

// ----------------------------------------------------------------------------
// 5b. Abort during onAccepted after claim
// ----------------------------------------------------------------------------
test('5b. abort during onAccepted after claim: immediately releases lease, new turn succeeds, late callback cannot steal lease', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('event: done\ndata: {"result":{"reply":"Turn 2 thành công","citations":[],"attachments":[],"proposedAction":null}}\n\n');
    res.end();
  };
  const convRes = await callPost('staff', '/chat/conversations', { clientRequestId: randomUUID() });
  const convJson = await convRes.json();
  const conversationId = convJson.id;

  const staffPrincipal = await resolvePrincipal({
    sub: String(fixture.actors.staff.user._id),
    role: fixture.actors.staff.user.role,
    securityVersion: 0,
  });

  const abortController = new AbortController();
  const clientMessageId1 = randomUUID();

  // ponytail: direct chatWithHistoryStream invocation isolates onAccepted abort boundary; upgrade path: synthetic HTTP duplex interception.
  let caughtError = null;
  try {
    await chatWithHistoryStream(
      staffPrincipal,
      'abort-at-accepted',
      conversationId,
      clientMessageId1,
      {
        signal: abortController.signal,
        onAccepted: async () => {
          abortController.abort();
          throw new Error('aborted-during-accepted');
        },
        onChunk: async () => {},
      }
    );
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError);

  // Verify conversation lease is released immediately
  const convAfterAbort = await Conversation.findById(conversationId).lean();
  assert.equal(convAfterAbort?.pendingTurnId, null);
  assert.equal(convAfterAbort?.leaseToken, null);

  // Turn 1 is marked INTERRUPTED or FAILED
  const turn1 = await Turn.findOne({ clientMessageId: clientMessageId1 }).lean();
  assert.ok(['INTERRUPTED', 'FAILED'].includes(turn1?.status));

  // Turn 2 can immediately claim the lease and succeed
  const clientMessageId2 = randomUUID();
  const res2 = await callPost('staff', '/chat/stream', {
    conversationId,
    message: 'turn-two-immediate-after-accepted-abort',
    clientMessageId: clientMessageId2,
  });
  assert.equal(res2.status, 200);
  const events2 = await collectSseEvents(res2);
  const done2 = events2.find((e) => e.event === 'done');
  assert.ok(done2);

  // Simulate late callback from turn 1 trying to update turn 1 or clear conversation lease
  const lateUpdate = await Turn.updateOne(
    { clientMessageId: clientMessageId1, status: 'PENDING', leaseToken: 'stale-token' },
    { $set: { status: 'COMPLETED', reply: 'Stale late reply' } }
  );
  assert.equal(lateUpdate.modifiedCount, 0);

  // Conversation lease of turn 2 was not stolen
  const turn1Final = await Turn.findOne({ clientMessageId: clientMessageId1 }).lean();
  assert.notEqual(turn1Final?.status, 'COMPLETED');
});

// ----------------------------------------------------------------------------
// 6. POST body read finishes but client stream remains open
// ----------------------------------------------------------------------------
test('6. POST body read finishes but client stream remains open: does not prematurely abort', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    // Upstream takes 50ms before emitting first chunk (express.json() has long finished)
    await new Promise((r) => setTimeout(r, 50));
    res.write('event: delta\ndata: {"delta":"Nội dung sau khi body đã đọc xong"}\n\n');
    await new Promise((r) => setTimeout(r, 20));
    res.write('event: done\ndata: {"result":{"reply":"Nội dung sau khi body đã đọc xong","citations":[],"attachments":[],"proposedAction":null}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Kiểm tra request close không abort sớm',
    clientMessageId,
  });

  assert.equal(res.status, 200);
  const events = await collectSseEvents(res);
  const chunk = events.find((e) => e.event === 'chunk');
  assert.ok(chunk);
  assert.equal(chunk.data.delta, 'Nội dung sau khi body đã đọc xong');

  const done = events.find((e) => e.event === 'done');
  assert.ok(done);
  assert.equal(done.data.turn.status, 'COMPLETED');
});

// ----------------------------------------------------------------------------
// 7. Duplicate/pending/completed IDs
// ----------------------------------------------------------------------------
test('7. duplicate/pending/completed IDs: handles completed retry, pending conflict, and text conflict', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('event: done\ndata: {"result":{"reply":"Trả lời một lần","citations":[],"attachments":[],"proposedAction":null}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const initialRes = await callPost('staff', '/chat/stream', {
    message: 'Tin nhắn kiểm tra duplicate',
    clientMessageId,
  });
  const initialEvents = await collectSseEvents(initialRes);
  const doneEvt = initialEvents.find((e) => e.event === 'done');
  assert.ok(doneEvt);
  assert.equal(upstreamCalls, 1);

  // 7a. Retry same clientMessageId that was completed -> emits done without recalling upstream
  const retryCompletedRes = await callPost('staff', '/chat/stream', {
    message: 'Tin nhắn kiểm tra duplicate',
    clientMessageId,
  });
  assert.equal(retryCompletedRes.status, 200);
  const retryEvents = await collectSseEvents(retryCompletedRes);
  const retryDone = retryEvents.find((e) => e.event === 'done');
  assert.ok(retryDone);
  assert.equal(upstreamCalls, 1);

  // 7b. Conflicting message text with same ID -> 409 CHAT_MESSAGE_CONFLICT
  const conflictRes = await callPost('staff', '/chat/stream', {
    message: 'Nội dung khác hoàn toàn',
    clientMessageId,
  });
  assert.equal(conflictRes.status, 409);
  const conflictJson = await conflictRes.json();
  assert.equal(conflictJson.error.code, 'CHAT_MESSAGE_CONFLICT');
});

// ----------------------------------------------------------------------------
// 8. Malformed UTF-8 / frame split
// ----------------------------------------------------------------------------
test('8. malformed UTF-8 and frame split: reconstructs multi-byte sequences and split frames', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Frame split: 'event: de' then 'lta\ndata: {"delta":"Xin '
    res.write(Buffer.from('event: de'));
    await new Promise((r) => setTimeout(r, 10));
    res.write(Buffer.from('lta\r\ndata: {"delta":"Xin '));
    await new Promise((r) => setTimeout(r, 10));

    // Multi-byte split: 'chào' has 'à' (0xc3 0xa0). Send 0xc3 in one chunk and 0xa0 in next!
    const prefix = Buffer.from('ch');
    const firstByteOfA = Buffer.from([0xc3]);
    const secondByteOfA = Buffer.from([0xa0]);
    const rest = Buffer.from('o các bạn"}\r\n\r\n');

    res.write(Buffer.concat([prefix, firstByteOfA]));
    await new Promise((r) => setTimeout(r, 10));
    res.write(Buffer.concat([secondByteOfA, rest]));
    await new Promise((r) => setTimeout(r, 10));

    res.write(Buffer.from('event: done\r\ndata: {"result":{"reply":"Xin chào các bạn","citations":[],"attachments":[],"proposedAction":null}}\r\n\r\n'));
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Kiểm tra frame split UTF8',
    clientMessageId,
  });

  const events = await collectSseEvents(res);
  const chunkEvt = events.find((e) => e.event === 'chunk');
  assert.ok(chunkEvt);
  assert.equal(chunkEvt.data.delta, 'Xin chào các bạn');

  const doneEvt = events.find((e) => e.event === 'done');
  assert.ok(doneEvt);
  assert.equal(doneEvt.data.turn.reply, 'Xin chào các bạn');
});

// ----------------------------------------------------------------------------
// 9. Event/data/delimiter tách 3 chunks
// ----------------------------------------------------------------------------
test('9. event/data/delimiter split across 3 chunks: preserves event name and data', async () => {
  async function* source() {
    yield Buffer.from('event: delta\n');
    yield Buffer.from('data: {"delta":"nội dung tách 3"}\n');
    yield Buffer.from('\n');
  }

  const events = [];
  for await (const e of parseSseStream(source())) {
    events.push(e);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'delta');
  assert.equal(events[0].data, '{"delta":"nội dung tách 3"}');
});

// ----------------------------------------------------------------------------
// 10. EOF dở (unclosed frame at EOF)
// ----------------------------------------------------------------------------
test('10. unclosed frame at EOF fails closed without emitting incomplete event', async () => {
  async function* source() {
    yield Buffer.from('event: delta\n');
    yield Buffer.from('data: {"delta":"dở dang chưa có delimiter"}');
  }

  let errorThrown = false;
  try {
    const events = [];
    for await (const e of parseSseStream(source())) {
      events.push(e);
    }
  } catch (err) {
    errorThrown = true;
  }

  assert.equal(errorThrown, true);
});

// ----------------------------------------------------------------------------
// 11. Disconnect trong lúc chờ drain
// ----------------------------------------------------------------------------
test('11. disconnect during drain: sendSseEvent unblocks immediately on response close or abort', async () => {
  const listeners = {};
  const mockRes = {
    writableEnded: false,
    destroyed: false,
    write: () => false, // Always simulate full kernel buffer
    once: (event, handler) => {
      listeners[event] = handler;
    },
    off: (event, handler) => {
      delete listeners[event];
    },
  };

  const abortController = new AbortController();

  let unblocked = false;
  const sendPromise = sendSseEvent(mockRes, 'chunk', { delta: 'test' }, abortController.signal).then(() => {
    unblocked = true;
  });

  assert.equal(unblocked, false);

  // Client aborts or socket closes
  abortController.abort();
  await sendPromise;

  assert.equal(unblocked, true);
});

// ----------------------------------------------------------------------------
// 12. Malformed delta -> error không silent skip
// ----------------------------------------------------------------------------
test('12. malformed delta: invalid JSON payload fails closed with error, does not silent skip', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('event: delta\ndata: {this-is-not-valid-json}\n\n');
    res.write('event: done\ndata: {"result":{"reply":"Lẽ ra không tới đây","citations":[],"attachments":[],"proposedAction":null}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Kiểm tra malformed delta',
    clientMessageId,
  });

  const events = await collectSseEvents(res);
  const errEvt = events.find((e) => e.event === 'error');
  assert.ok(errEvt);
  assert.equal(errEvt.data.code, 'AI_SERVICE_UNAVAILABLE');

  const doneEvt = events.find((e) => e.event === 'done');
  assert.equal(doneEvt, undefined);

  const turnInDb = await Turn.findOne({ clientMessageId }).lean();
  assert.ok(turnInDb);
  assert.equal(turnInDb.status, 'FAILED');
});

// ----------------------------------------------------------------------------
// 13. Payload vượt giới hạn MAX_SSE_EVENT_SIZE fail closed
// ----------------------------------------------------------------------------
test('13. payload exceeding MAX_SSE_EVENT_SIZE fails closed and does not emit done', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send payload > 128KB
    const giantDelta = 'a'.repeat(MAX_SSE_EVENT_SIZE + 1024);
    res.write(`event: delta\ndata: {"delta":"${giantDelta}"}\n\n`);
    res.write('event: done\ndata: {"result":{"reply":"Lẽ ra không xong","citations":[],"attachments":[],"proposedAction":null}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Kiểm tra buffer overflow',
    clientMessageId,
  });

  const events = await collectSseEvents(res);
  const errEvt = events.find((e) => e.event === 'error');
  assert.ok(errEvt);
  assert.equal(errEvt.data.code, 'AI_SERVICE_UNAVAILABLE');

  const doneEvt = events.find((e) => e.event === 'done');
  assert.equal(doneEvt, undefined);

  const turnInDb = await Turn.findOne({ clientMessageId }).lean();
  assert.ok(turnInDb);
  assert.equal(turnInDb.status, 'FAILED');
});

// ----------------------------------------------------------------------------
// 14. Completed turn có revenue evidence -> thay đổi/revoke nguồn -> GET history không lộ reply cũ
// ----------------------------------------------------------------------------
test('14. completed turn with revenue evidence: source change/revocation hides reply in history', async () => {
  const prevRevenueKpiEnabled = process.env.REVENUE_KPI_ENABLED;
  process.env.REVENUE_KPI_ENABLED = 'true';

  await UserModel.updateOne(
    { _id: fixture.actors.sm.user._id },
    { $addToSet: { 'authorization.grants.0.capabilities': 'revenue_kpi.read_self' } }
  );
  // ponytail: in-line store KPI assignment fixture for test 14; upgrade path: shared revenueFixture helper if multi-file reuse needed.
  const periodId = new mongoose.Types.ObjectId();
  const periodDoc = {
    _id: periodId,
    period: '2026-11',
    status: 'OPEN',
    policy: {
      defaultGrowthPercent: 3,
      growthBase: 'PREVIOUS_MONTH',
      underperformingRateThresholdPercent: 30,
      acceptanceWindowWorkingDays: 3,
      allowDemoData: true,
      aiProposalEnabled: true,
    },
    openedBy: String(fixture.actors.hr.user._id),
    openedAt: new Date().toISOString(),
    closedBy: null,
    closedAt: null,
    version: 1,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await mongoose.connection.collection('revenue_kpi_periods').insertOne(periodDoc);

  const assignmentId = new mongoose.Types.ObjectId();
  const assignmentDoc = {
    _id: assignmentId,
    period: '2026-11',
    unitType: 'STORE',
    storeId: String(fixture.stores[0]._id),
    areaKey: null,
    assigneeEmployeeId: String(fixture.actors.sm.employee._id),
    assigneeRole: 'SM',
    assigneeName: 'Isolated V1 sm',
    targetMode: 'ABSOLUTE_VND',
    basePeriod: null,
    baseRevenueVnd: null,
    growthPercent: null,
    targetVnd: 50000000,
    stores: [
      {
        storeId: String(fixture.stores[0]._id),
        storeName: fixture.stores[0].store_name,
        baseRevenueVnd: null,
        growthPercent: null,
        targetVnd: 50000000,
      },
    ],
    responsibility: [
      {
        employeeId: String(fixture.actors.sm.employee._id),
        employeeName: 'Isolated V1 sm',
        role: 'PRIMARY',
        from: new Date('2026-11-01').toISOString(),
        to: null,
      },
    ],
    status: 'ACTIVE',
    acceptance: null,
    refusal: null,
    hrDecision: null,
    adjustment: null,
    aiProposal: null,
    deadlineAt: null,
    overdue: false,
    version: 1,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await mongoose.connection.collection('revenue_kpi_assignments').insertOne(assignmentDoc);

  let upstreamError = null;
  try {
    upstreamHandler = async (req, res) => {
      try {
        let text = '';
        for await (const chunk of req) text += chunk;
        const body = JSON.parse(text);

        // Record revenue read in receipt
        await executeGatewayTool(body.delegationToken, {
          requestId: body.requestId,
          tool: 'get_my_revenue_kpi',
          args: { period: '2026-11' },
        });

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('event: delta\ndata: {"delta":"KPI doanh thu của bạn là 50 triệu."}\n\n');
        res.write('event: done\ndata: {"result":{"reply":"KPI doanh thu của bạn là 50 triệu.","citations":[],"attachments":[],"proposedAction":null}}\n\n');
        res.end();
      } catch (err) {
        upstreamError = {
          name: err?.name,
          code: err?.code,
          status: err?.status,
        };
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: upstreamError }));
      }
    };

    const clientMessageId = randomUUID();
    const res = await callPost('sm', '/chat/stream', {
      message: 'Hỏi KPI doanh thu',
      clientMessageId,
    });

    const events = await collectSseEvents(res);
    const doneEvt = events.find((e) => e.event === 'done');
    const eventsSummary = events.map((e) => (e.data?.code ? `${e.event}:${e.data.code}` : e.event)).join(', ');
    assert.ok(
      doneEvt,
      `Expected done event, got events: [${eventsSummary}]. Upstream error: ${JSON.stringify(upstreamError)}`
    );
    const conversationId = doneEvt.data.conversationId;

    // Turn is saved with revenueReads in evidence
    const turnBefore = await Turn.findOne({ clientMessageId }).lean();
    assert.equal(turnBefore?.status, 'COMPLETED');
    assert.ok(turnBefore?.evidence?.revenueReads?.length);

    // Before source change: GET history shows reply
    const histBefore = await callGet('sm', `/chat/conversations/${conversationId}/messages`);
    assert.equal(histBefore.status, 200);
    assert.equal(histBefore.body.items[0].replyHidden, false);
    assert.equal(histBefore.body.items[0].reply, 'KPI doanh thu của bạn là 50 triệu.');

    // Real source change in database: cancel the assignment so fresh read digest no longer matches
    await mongoose.connection.collection('revenue_kpi_assignments').updateOne(
      { _id: assignmentId },
      { $set: { status: 'CANCELLED' } }
    );

    // After source change: GET history must HIDE reply
    const histAfter = await callGet('sm', `/chat/conversations/${conversationId}/messages`);
    assert.equal(histAfter.status, 200);
    assert.equal(histAfter.body.items[0].replyHidden, true);
    assert.equal(histAfter.body.items[0].reply, null);
    assert.doesNotMatch(JSON.stringify(histAfter.body), /50 triệu/);
  } finally {
    if (prevRevenueKpiEnabled === undefined) {
      delete process.env.REVENUE_KPI_ENABLED;
    } else {
      process.env.REVENUE_KPI_ENABLED = prevRevenueKpiEnabled;
    }
    await UserModel.updateOne(
      { _id: fixture.actors.sm.user._id },
      { $pull: { 'authorization.grants.0.capabilities': 'revenue_kpi.read_self' } }
    );
    await mongoose.connection.collection('revenue_kpi_periods').deleteOne({ _id: periodId });
    await mongoose.connection.collection('revenue_kpi_assignments').deleteOne({ _id: assignmentId });
  }
});

// ----------------------------------------------------------------------------
// 15. Actions remain server-owned
// ----------------------------------------------------------------------------
test('15. actions remain server-owned: provider injected citations and proposedAction are ignored', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('event: done\ndata: {"result":{"reply":"Câu trả lời","citations":[{"document":"Giả mạo","score":99}],"proposedAction":{"type":"unauthorized_grant","actionId":"fake-123"}}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Kiểm tra server owned action',
    clientMessageId,
  });

  const events = await collectSseEvents(res);
  const doneEvt = events.find((e) => e.event === 'done');
  assert.ok(doneEvt);

  // Citations and proposedAction must be server-verified only
  assert.equal(doneEvt.data.turn.citations.length, 0);
  assert.equal(doneEvt.data.turn.proposedAction, null);
});

// ----------------------------------------------------------------------------
// 16. Old /api/chat compatible
// ----------------------------------------------------------------------------
test('16. old /api/chat compatible: existing JSON endpoint returns 200 with conversationId and turn', async () => {
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reply: 'Phản hồi tương thích legacy JSON',
      citations: [],
      attachments: [],
      proposedAction: null,
      decisionSource: 'isolated-provider',
    }));
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat', {
    message: 'Kiểm tra tương thích ngược',
    clientMessageId,
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  const body = await res.json();
  assert.ok(body.conversationId);
  assert.equal(body.turn.status, 'COMPLETED');
  assert.equal(body.turn.reply, 'Phản hồi tương thích legacy JSON');
});

// ----------------------------------------------------------------------------
// 16b. Legacy JSON safety block is a terminal error
// ----------------------------------------------------------------------------
test('16b. legacy /chat safety block returns a safe error and persists a failed turn without a reply', async () => {
  upstreamHandler = async (req, res) => {
    for await (const _chunk of req) {}
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: { code: 'SAFETY_BLOCKED' } }));
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat', {
    message: 'Kiểm tra phản hồi bị chặn an toàn',
    clientMessageId,
  });

  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, 'AI_SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(body), /SAFETY_BLOCKED/);

  const turnInDb = await Turn.findOne({ clientMessageId }).lean();
  assert.ok(turnInDb);
  assert.equal(turnInDb.status, 'FAILED');
  assert.equal(turnInDb.reply, null);
});


// ----------------------------------------------------------------------------
// 17. Deterministic timeout path vs client abort
// ----------------------------------------------------------------------------
test('a missing AI stream endpoint falls back to the scoped JSON endpoint and saves the reply', async () => {
  const paths = [];
  let firstBody;
  upstreamHandler = async (req, res) => {
    paths.push(req.url);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.url.endsWith('/stream')) {
      firstBody = body;
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ detail: 'Not Found' }));
    }
    assert.deepEqual(body, firstBody);
    await executeGatewayTool(body.delegationToken, { requestId: body.requestId, tool: 'validate_context', args: {} });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'Xin chào từ dịch vụ tương thích.', abstain: false, proposedAction: { type: 'untrusted' } }));
  };
  const clientMessageId = randomUUID();
  const response = await callPost('staff', '/chat/stream', { message: 'hi', clientMessageId });
  assert.equal(response.status, 200);
  const events = await collectSseEvents(response);
  assert.equal(events.at(-1).event, 'done');
  assert.deepEqual(paths, ['/api/v1/authorized-chat/stream', '/api/v1/authorized-chat']);
  const saved = await Turn.findOne({ clientMessageId }).lean();
  assert.equal(saved.status, 'COMPLETED');
  assert.equal(saved.reply, 'Xin chào từ dịch vụ tương thích.');
  assert.equal(saved.proposedAction ?? null, null);
});

test('17. deterministic timeout path maps to AI_SERVICE_TIMEOUT, while caller abort does not', async () => {
  upstreamHandler = async (req, res) => {
    await new Promise((r) => setTimeout(r, 200));
    res.end();
  };

  const staffPrincipal = await resolvePrincipal({
    sub: String(fixture.actors.staff.user._id),
    role: fixture.actors.staff.user.role,
    securityVersion: 0,
  });
  const authz = await beginAuthorizedChat(staffPrincipal);

  // 17a. Timeout path: timer fires at 40ms before upstream replies
  let timeoutErr = null;
  try {
    await streamChatWithAiService('test timeout', {}, undefined, authz, { timeoutMs: 40 });
  } catch (err) {
    timeoutErr = err;
  }
  assert.ok(timeoutErr);
  assert.equal(timeoutErr.code, 'AI_SERVICE_TIMEOUT');
  assert.equal(timeoutErr.status, 504);

  // 17b. Caller abort path: client aborts at 20ms before 500ms timeout
  const abortCtrl = new AbortController();
  setTimeout(() => abortCtrl.abort(), 20);
  let abortErr = null;
  try {
    await streamChatWithAiService('test abort', {}, undefined, authz, { timeoutMs: 500, signal: abortCtrl.signal });
  } catch (err) {
    abortErr = err;
  }
  assert.ok(abortErr);
  assert.notEqual(abortErr?.code, 'AI_SERVICE_TIMEOUT');
});

// ----------------------------------------------------------------------------
// 18. Token deltas coalescing reduces revalidation query amplification
// ----------------------------------------------------------------------------
test('18. token deltas are coalesced into bounded client chunks reducing query amplification', async () => {
  const tokens = ['Xin ', 'chào, ', 'đây ', 'là ', 'hệ ', 'thống ', 'trợ ', 'lý ', 'Guta ', 'Workspace.'];
  upstreamHandler = async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    for (const token of tokens) {
      res.write(`event: delta\ndata: {"delta":${JSON.stringify(token)}}\n\n`);
      await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 10));
    res.write('event: done\ndata: {"result":{"reply":"Xin chào, đây là hệ thống trợ lý Guta Workspace.","citations":[],"attachments":[],"proposedAction":null,"abstain":false}}\n\n');
    res.end();
  };

  const clientMessageId = randomUUID();
  const res = await callPost('staff', '/chat/stream', {
    message: 'Chào chatbot',
    clientMessageId,
  });

  assert.equal(res.status, 200);
  const events = await collectSseEvents(res);
  assert.equal(events[0].event, 'accepted');

  const chunks = events.filter((e) => e.event === 'chunk');
  // 10 upstream tokens must be coalesced into strictly fewer SSE chunks within the bounded latency
  assert.ok(chunks.length > 0 && chunks.length <= 3, `Expected chunks to be coalesced (got ${chunks.length} chunks for 10 tokens)`);
  assert.ok(chunks.length < tokens.length, 'Coalescing must reduce chunk count compared to upstream token count');

  // Verify full message is delivered without lost tokens or corruption
  const reconstructed = chunks.map((c) => c.data.delta).join('');
  assert.equal(reconstructed, tokens.join(''));

  // Sequential ordering is preserved
  for (let i = 0; i < chunks.length; i++) {
    assert.equal(chunks[i].data.seq, i);
  }

  const doneEvt = events.find((e) => e.event === 'done');
  assert.ok(doneEvt);
  assert.equal(doneEvt.data.turn.status, 'COMPLETED');
  assert.equal(doneEvt.data.turn.reply, tokens.join(''));
});
