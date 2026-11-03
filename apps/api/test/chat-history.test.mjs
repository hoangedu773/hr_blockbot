import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { UserModel } from '../dist/models/User.js';
import { ChatConversationModel as Conversation, ChatTurnModel as Turn } from '../dist/models/ChatConversation.js';
import { executeGatewayTool } from '../dist/services/chat-authorization.service.js';
let f, server, upstream, base, calls = 0, policyId, barrier = null;
before(async () => {
  await connectDB(); f = await authorizationV1Fixture();
  process.env.AI_SERVICE_API_KEY = 'owned-chat-history-key'; process.env.AI_LLM_API_KEY = 'owned-chat-history-answer-key'; process.env.AI_LLM_BASE_URL = 'https://provider.invalid/v1';
  await UserModel.updateOne({ _id: f.actors.staff.user._id }, { $push: { 'authorization.grants.1.capabilities': 'policies.read' } });
  policyId = (await mongoose.connection.collection('policies').insertOne({ title: 'Synthetic policy', content: 'synthetic guidance for isolated history', version: 'fixture-1',
    acl: { reviewStatus: 'APPROVED', approvalRef: 'owned-fixture-evidence', tier: 'T2_OPERATIONAL', classification: 'operational', allowedProfiles: ['staff'], validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: null, revokedAt: null, scopeKind: 'stores', storeIds: [String(f.stores[0]._id)] } })).insertedId;
  upstream = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk; const body = JSON.parse(text); calls++;
    if (body.message.includes('policy')) await executeGatewayTool(body.delegationToken, { requestId: body.requestId, tool: 'query_policy', args: { query: 'synthetic guidance' } });
    if (barrier && body.message.includes('hold')) { const held = barrier; held.enter(); await held.wait; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ reply: 'SYNTHETIC_SAVED_REPLY', citations: [], attachments: [], proposedAction: null, decisionSource: 'isolated-provider' }));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r)); process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + upstream.address().port;
  server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { for (const s of [server, upstream]) { s.closeAllConnections(); await new Promise(r => s.close(r)); } await disconnectDB(); });
async function call(actor, path, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Connection: 'close', ...(actor ? { Authorization: 'Bearer ' + f.actors[actor].token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}
const send = (extra = {}) => ({ message: 'Synthetic history question', clientMessageId: randomUUID(), ...extra });

test('server saves per-account questions/answers across requests; client retry creates one turn and never recalls the provider', async () => {
  const body = send(), r = await call('staff', '/chat', body); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.turn.status, 'COMPLETED'); assert.equal(r.body.turn.reply, 'SYNTHETIC_SAVED_REPLY');
  const before = calls, again = await call('staff', '/chat', body); assert.equal(again.body.conversationId, r.body.conversationId); assert.equal(calls, before);
  assert.equal(await Turn.countDocuments({ conversationId: r.body.conversationId }), 1);
  assert.equal((await call('staff', '/chat', { ...body, message: 'Different text same request' })).status, 409);
  const list = await call('staff', '/chat/conversations'); assert.equal(list.status, 200); assert.ok(list.body.items.some(c => c.id === r.body.conversationId));
  const history = await call('staff', `/chat/conversations/${r.body.conversationId}/messages`); assert.equal(history.body.items[0].userMessage, body.message); assert.equal(history.body.items[0].reply, 'SYNTHETIC_SAVED_REPLY');
  const raw = await Turn.findOne({ conversationId: r.body.conversationId }).lean(); assert.doesNotMatch(JSON.stringify(raw.evidence), /delegationToken|passwordHash|Bearer|apiKey/);
});
test('ownership is checked on list/read/send for all nine profiles; technical role and supplied owner cannot bypass', async () => {
  const r = await call('staff', '/chat', send()), id = r.body.conversationId;
  assert.equal((await call(null, '/chat/conversations')).status, 401);
  for (const actor of ['hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staffB']) {
    assert.equal((await call(actor, `/chat/conversations/${id}/messages`)).status, 404, actor);
    assert.equal((await call(actor, '/chat', send({ conversationId: id }))).status, 404, actor);
  }
  assert.equal((await call('system_admin', `/chat/conversations/${id}/messages`)).status, 403);
  assert.equal((await call('staffB', '/chat/conversations')).body.items.length, 0);
  assert.equal((await call('staff', '/chat/conversations', { clientRequestId: randomUUID(), userId: String(f.actors.staffB.user._id) })).status, 400);
});
test('ACL revocation or source change hides prior assistant text and citations while preserving the user question and database record', async () => {
  const r = await call('staff', '/chat', send({ message: 'synthetic policy guidance' })), id = r.body.conversationId;
  assert.equal(r.body.turn.reply, 'SYNTHETIC_SAVED_REPLY'); assert.ok(r.body.turn.citations.length);
  await mongoose.connection.collection('policies').updateOne({ _id: policyId }, { $set: { 'acl.revokedAt': new Date().toISOString() } });
  try { const h = await call('staff', `/chat/conversations/${id}/messages`); assert.equal(h.status, 200); assert.equal(h.body.items[0].replyHidden, true); assert.equal(h.body.items[0].reply, null); assert.deepEqual(h.body.items[0].citations, []); assert.doesNotMatch(JSON.stringify(h.body), /SYNTHETIC_SAVED_REPLY/); }
  finally { await mongoose.connection.collection('policies').updateOne({ _id: policyId }, { $set: { 'acl.revokedAt': null } }); }
  assert.equal((await Turn.findOne({ conversationId: id }).lean()).reply, 'SYNTHETIC_SAVED_REPLY');
});
test('grant/scope change hides old answers; revoked/stale sessions cannot read history', async () => {
  const r = await call('staff', '/chat', send()), id = r.body.conversationId, u = await UserModel.findById(f.actors.staff.user._id).lean();
  const authorization = structuredClone(u.authorization); authorization.grants[1].capabilities = [];
  await UserModel.collection.updateOne({ _id: u._id }, { $set: { authorization } });
  assert.equal((await call('staff', `/chat/conversations/${id}/messages`)).body.items[0].replyHidden, true);
  await UserModel.collection.updateOne({ _id: u._id }, { $set: { authorization: u.authorization }, $inc: { securityVersion: 1 } });
  assert.equal((await call('staff', '/chat/conversations')).status, 401);
  await UserModel.collection.updateOne({ _id: u._id }, { $set: { securityVersion: u.securityVersion } });
});
test('message and conversation pagination return older records with stable cursors and no duplicate message IDs', async () => {
  const first = await call('staff', '/chat', send()), id = first.body.conversationId;
  for (let i = 0; i < 3; i++) assert.equal((await call('staff', '/chat', send({ conversationId: id, message: 'Synthetic turn ' + i }))).body.turn.status, 'COMPLETED');
  const a = (await call('staff', `/chat/conversations/${id}/messages?limit=2`)).body;
  const b = (await call('staff', `/chat/conversations/${id}/messages?limit=2&before=${encodeURIComponent(a.nextCursor)}`)).body;
  assert.equal(new Set([...a.items, ...b.items].map(t => t.id)).size, 4); assert.equal(b.nextCursor, null);
  const list = (await call('staff', '/chat/conversations?limit=1')).body; assert.equal(list.items.length, 1); assert.ok(list.nextCursor);
  assert.equal((await call('staff', '/chat/conversations?before=malformed')).status, 400);
});
test('concurrent duplicate sends call AI once; expired request is fenced so late response cannot overwrite or execute anything', async () => {
  let enter, finish; const entered = new Promise(r => { enter = r; }), wait = new Promise(r => { finish = r; }); barrier = { enter, wait };
  const create = await call('staff', '/chat/conversations', { clientRequestId: randomUUID() }), id = create.body.id;
  const body = send({ conversationId: id, message: 'hold synthetic response' }), pending = call('staff', '/chat', body);
  await entered; const count = calls;
  const duplicate = await call('staff', '/chat', body); assert.equal(duplicate.body.turn.status, 'PENDING'); assert.equal(calls, count);
  await Conversation.collection.updateOne({ _id: id }, { $set: { leaseUntil: new Date(Date.now() - 1000) } });
  const interrupted = await call('staff', `/chat/conversations/${id}/messages`); assert.equal(interrupted.body.items[0].status, 'INTERRUPTED');
  finish(); barrier = null;
  const late = await pending; assert.equal(late.body.turn.status, 'INTERRUPTED'); assert.equal(late.body.turn.reply, null);
  assert.equal((await call('staff', '/chat', body)).body.turn.status, 'INTERRUPTED'); assert.equal(calls, count);
  const next = await call('staff', '/chat', send({ conversationId: id })); assert.equal(next.body.turn.status, 'COMPLETED');
  const rows = await Turn.find({ conversationId: id }).lean(); assert.equal(rows.length, 2); assert.equal(rows[0].proposedAction, undefined);
});
