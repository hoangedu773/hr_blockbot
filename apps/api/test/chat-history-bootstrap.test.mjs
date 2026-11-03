// Production-like startup disables automatic schema creation/indexing. History
// must explicitly initialize only its own new collections before its first write.
import './require-isolated-db.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
mongoose.set('autoCreate', false).set('autoIndex', false);
const { connectDB, disconnectDB } = await import('../dist/db.js');
const { createApp } = await import('../dist/app.js');
const { authorizationV1Fixture } = await import('./helpers/authorization-v1-fixture.mjs');

test('first persisted chat provisions only history collections/indexes with global autoCreate/autoIndex disabled', async () => {
  let server, upstream, calls = 0;
  try {
    await connectDB(); const f = await authorizationV1Fixture();
    const before = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
    assert.equal(before.some(c => c.name === 'chat_conversations' || c.name === 'chat_conversation_turns'), false);
    upstream = createServer(async (req, res) => {
      for await (const chunk of req) {} calls++;
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ reply: 'Synthetic production-startup reply', citations: [], attachments: [], proposedAction: null }));
    });
    await new Promise(r => upstream.listen(0, '127.0.0.1', r));
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + upstream.address().port;
    process.env.AI_SERVICE_API_KEY = 'owned-bootstrap-service-key'; process.env.AI_LLM_API_KEY = 'owned-bootstrap-provider-key'; process.env.AI_LLM_BASE_URL = 'https://provider.invalid/v1';
    server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const body = { message: 'Synthetic first saved question', clientMessageId: randomUUID() };
    const send = () => fetch('http://127.0.0.1:' + server.address().port + '/api/chat', { method: 'POST', headers: { Authorization: 'Bearer ' + f.actors.staff.token, 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(body) });
    const first = await send(); assert.equal(first.status, 200); const data = await first.json(); assert.equal(data.turn.status, 'COMPLETED');
    assert.equal((await send()).status, 200); assert.equal(calls, 1);
    const conversations = await mongoose.connection.collection('chat_conversations').indexes(), turns = await mongoose.connection.collection('chat_conversation_turns').indexes();
    assert.ok(conversations.some(i => i.unique && i.key.userId && i.key.clientRequestId));
    assert.ok(turns.some(i => i.unique && i.key.conversationId && i.key.clientMessageId));
    assert.equal(mongoose.get('autoCreate'), false); assert.equal(mongoose.get('autoIndex'), false);
  } finally { for (const s of [server, upstream]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); } await disconnectDB(); }
});
