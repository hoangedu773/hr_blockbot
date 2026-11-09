// P0-P1 audit (apps/api/src/socket.ts:144-150): chat:send catch emits err.message
// verbatim to the client. These integration tests pin the security contract:
//   1. Simulated infrastructure failure carrying a sentinel must never reach the
//      client as chat:error.message.
//   2. A safe 4xx WorkflowError raised by the authorization workflow must keep
//      its own code + message (not a generic fallback).
//
// Expected RED against the current implementation (audit finding): the sentinel
// leaks verbatim and the WorkflowError code is overwritten by AI_SERVICE_UNAVAILABLE.
// Boundary simulation only: in-memory Mongo via with-memory-mongo, a loopback stub
// for the AI service. No external service, no Atlas, no production-code edits.
import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { initSocket } from '../dist/socket.js';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { revenueFixture } from './helpers/revenue-kpi-fixture.mjs';

// Unique marker proving an internal infrastructure message reached the wire.
const SENTINEL = 'SENTINEL-INFRA-LEAK-3f9a1c-mongo-pool-secret-internal-stack';
const receiptsName = 'chat_authorization_requests';
const receipt = () => mongoose.connection.collection(receiptsName);

let f, app, ai, io, base;
before(async () => {
  await connectDB();
  f = await revenueFixture();

  // Loopback stub standing in for the AI service (/api/v1/authorized-chat).
  // For the WorkflowError case it closes the authorization receipt mid-flight
  // (requestId read from the inbound body), which makes authorizedChat throw
  // WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request no longer valid").
  ai = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    if (process.env.STUB_CLOSE_RECEIPT === '1') {
      await receipt().updateOne({ _id: body.requestId }, { $set: { status: 'CLOSED' } });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reply: 'Phản hồi kiểm thử', intent: 'policy_query', intentId: 'policy_query',
      citations: [], proposedAction: null, abstain: false, degraded: false, attachments: [],
    }));
  });
  await new Promise((resolve) => ai.listen(0, '127.0.0.1', resolve));

  const saved = { ...process.env };
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + ai.address().port;
  process.env.AI_SERVICE_API_KEY = 'test-only-isolated-key';
  process.env.AI_LLM_API_KEY = 'test-only-not-a-credential';
  process.env.AI_LLM_BASE_URL = 'https://provider.test.invalid/v1';

  app = createServer(createApp());
  io = initSocket(app);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + app.address().port;
  globalThis.__socketRedactionEnv = saved;
});

after(async () => {
  if (globalThis.__socketRedactionEnv) process.env = globalThis.__socketRedactionEnv;
  if (io) await new Promise((resolve) => io.close(resolve));
  for (const server of [app, ai].filter((s) => s?.listening)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

const { io: connect } = createRequire(new URL('../../web/package.json', import.meta.url))('socket.io-client');

async function openSocket(signal) {
  const socket = connect(new URL(base).origin, {
    auth: { token: f.actors.hr.token },
    transports: ['websocket'], forceNew: true, reconnection: false,
  });
  await once(socket, 'connect', { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
  return socket;
}

// chat:accepted proves the handler entered the try block; the next chat:error is
// the one under test. Finite waits only — no fixed sleeps.
async function sendChat(signal, payload) {
  const socket = await openSocket(signal);
  const accepted = once(socket, 'chat:accepted', { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
  const errored = once(socket, 'chat:error', { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
  socket.emit('chat:send', payload);
  await accepted;
  let error;
  try { [error] = await errored; } catch { error = null; }
  socket.disconnect();
  return error;
}

test('infrastructure failure with a sentinel message is never forwarded to the client', async (t) => {
  // Simulated infra outage at the persistence boundary: beginAuthorizedChat runs
  // OUTSIDE the ai-client catch, so this Mongo error propagates raw into the
  // chat:send catch — exactly the surface socket.ts:144-150 forwards to clients.
  const coll = receipt();
  t.mock.method(coll, 'createIndex', async () => {
    throw new Error(SENTINEL);
  });
  const error = await sendChat(t.signal, { clientMessageId: 'redaction-sentinel', text: 'Xin chào', conversationId: 'conv-redaction' });
  assert.ok(error, 'client must receive a chat:error');
  const wire = JSON.stringify(error);
  assert.ok(!wire.includes(SENTINEL), `sentinel infrastructure message leaked to client: ${wire}`);
  assert.ok(!/stack|node:internal/i.test(wire), `stack-like infra text leaked: ${wire}`);
  assert.equal(typeof error.retryable, 'boolean');
  assert.ok(typeof error.message === 'string' && error.message.length > 0 && error.message.length < 200);
});

test('safe 4xx WorkflowError keeps its own code and message on chat:error', async (t) => {
  process.env.STUB_CLOSE_RECEIPT = '1';
  t.after(() => { process.env.STUB_CLOSE_RECEIPT = undefined; });
  const error = await sendChat(t.signal, { clientMessageId: 'redaction-workflow', text: 'Xin chào', conversationId: 'conv-redaction-2' });
  assert.ok(error, 'client must receive a chat:error');
  assert.equal(error.code, 'CHAT_REQUEST_UNAVAILABLE');
  assert.equal(error.message, 'Request no longer valid');
  assert.ok(!JSON.stringify(error).includes(SENTINEL), 'no sentinel on the safe workflow path');
});
