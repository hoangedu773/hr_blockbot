import './require-isolated-db.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { initSocket } from '../dist/socket.js';
import { UserModel } from '../dist/models/User.js';
import { ProjectModel } from '../dist/models/Project.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
const webRequire = createRequire(new URL('../../web/package.json', import.meta.url));
const { io: socketClient } = webRequire('socket.io-client');
const aiDirectory = fileURLToPath(new URL('../../ai-service/', import.meta.url));
const pythonPath = process.env.AUTHORIZATION_TEST_PYTHON || fileURLToPath(new URL(process.platform === 'win32' ? '../../ai-service/.venv-authz-v1/Scripts/python.exe' : '../../ai-service/.venv-authz-v1/bin/python', import.meta.url));
const savedEnv = { ...process.env }, providerRequests = [], jevEvents = [], tools = [];
let api, provider, python, socketServer, fixture, apiOrigin, aiOrigin, pythonOutput = '', mutateAtJev, mutateAtProvider, slowAnswer = false;
const listen = async (server) => { await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
async function stopPython() { if (python && python.exitCode === null) { const stopped = new Promise((resolve) => python.once('close', resolve)); python.kill(); await stopped; } }
async function startPython(mode, proxy) {
  await stopPython();
  const pythonEnv = { ...process.env, JEV_V1_MODE: mode, SHADOW_FIXTURE_CALLBACK: apiOrigin, AUTHORIZATION_API_ORIGIN: apiOrigin,
    PYTHONDONTWRITEBYTECODE: '1', PYTHON_DOTENV_DISABLED: '1', HTTP_PROXY: proxy, HTTPS_PROXY: proxy, ALL_PROXY: proxy, NO_PROXY: '127.0.0.1,localhost' };
  for (const name of Object.keys(pythonEnv)) if (name.startsWith('JEV_') && name !== 'JEV_V1_MODE' || ['MONGODB_URI', 'TEST_MONGODB_URI', 'ATLAS_URI', 'MONGODB_DB_NAME'].includes(name)) delete pythonEnv[name];
  pythonOutput = '';
  python = spawn(pythonPath, ['-m', 'uvicorn', '--app-dir', 'tests', 'jev_shadow_server_fixture:app', '--host', '127.0.0.1', '--port', new URL(aiOrigin).port, '--log-level', 'warning'], { cwd: aiDirectory, env: pythonEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [python.stdout, python.stderr]) stream.on('data', (data) => { pythonOutput = (pythonOutput + data).slice(-3000); });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (python.exitCode !== null) throw new Error('Owned fixture startup failed: ' + pythonOutput);
    try { if ((await fetch(aiOrigin + '/health/ready', { signal: AbortSignal.timeout(1000) })).status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail('Owned Python fixture was not ready');
}
const send = async (actor, message = 'Synthetic policy Alpha', extra = {}) => {
  const response = await fetch(apiOrigin + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fixture.actors[actor].token }, body: JSON.stringify({ message, ...extra }) });
  return { status: response.status, body: await response.json() };
};
try {
  await connectDB(); fixture = await authorizationV1Fixture();
  process.env.AI_SERVICE_API_KEY = 'owned-shadow-service-key'; process.env.AI_LLM_API_KEY = 'owned-answer-provider-key';
  for (const name of ['AI_LLM_API_KEYS', 'GEMINI_API_KEYS', 'OPENAI_API_KEY']) delete process.env[name];
  const staff = fixture.actors.staff;
  await UserModel.updateOne({ _id: staff.user._id }, { $push: { 'authorization.grants.1.capabilities': 'policies.read' } });
  await ProjectModel.create([['staff', 0], ['staffB', 1]].map(([actor, index]) => ({ title: index ? 'NEVER_CROSS_STORE_B' : 'PRIVATE_ALLOWED_TASK', departmentId: fixture.departmentId, storeId: fixture.stores[index]._id,
    storeMappingRef: 'owned-shadow-mapping', createdBy: fixture.actors.sm.user._id, assigneeId: fixture.actors[actor].employee._id, status: 'ASSIGNED', version: 1 })));
  const acl = { reviewStatus: 'APPROVED', approvalRef: 'owned-shadow-acl', tier: 'T2_OPERATIONAL', classification: 'operational', allowedProfiles: ['staff'], validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: null, revokedAt: null, scopeKind: 'stores', storeIds: [String(fixture.stores[0]._id)] };
  const document = await mongoose.connection.collection('policies').insertOne({ title: 'Synthetic policy', content: 'PRIVATE_ALLOWED_DOCUMENT', version: 'owned-1', acl });
  await mongoose.connection.collection('policies').insertOne({ title: 'Synthetic policy', content: 'NEVER_UNCLASSIFIED_DOCUMENT' });
  await mongoose.connection.collection('evaluations').insertOne({ tag: 'shadow-no-writes', finalScore: 80 });
  provider = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text); providerRequests.push(body);
    if (mutateAtProvider) { const mutation = mutateAtProvider; mutateAtProvider = null; await mutation(); }
    if (slowAnswer) await new Promise((resolve) => setTimeout(resolve, 16000));
    if (response.destroyed) return;
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Unchanged authorized answer' }, finish_reason: 'stop' }] }));
  });
  const proxy = await listen(provider); process.env.AI_LLM_BASE_URL = 'http://provider.shadow.invalid/v1'; process.env.AI_LLM_MODEL = 'synthetic-model';
  const app = createApp();
  api = createServer(async (request, response) => {
    if (request.url === '/__owned_shadow_stage') {
      let body = ''; for await (const chunk of request) body += chunk;
      jevEvents.push(JSON.parse(body));
      if (mutateAtJev) { const mutation = mutateAtJev; mutateAtJev = null; await mutation(); }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}'); return;
    }
    if (request.url === '/api/internal/authorization/tools') { let body = ''; request.on('data', (chunk) => { body += chunk; }); request.on('end', () => { const parsed = JSON.parse(body); tools.push({ tool: parsed.tool, requestId: parsed.requestId }); }); }
    app(request, response);
  });
  socketServer = initSocket(api); apiOrigin = await listen(api);
  const reservation = createServer(); aiOrigin = await listen(reservation); await new Promise((resolve) => reservation.close(resolve)); process.env.AI_SERVICE_URL = aiOrigin;
  const originalTasks = JSON.stringify(await ProjectModel.find({}).lean()), originalKpi = JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray());
  await startPython('OFF', proxy);
  const off = await send('staff', undefined, { mode: 'SHADOW', userContext: { role: 'Admin' } }); assert.equal(off.status, 200); assert.equal(off.body.reply, 'Unchanged authorized answer'); assert.equal(off.body.decisionAnalysis, undefined);
  assert.equal(jevEvents.length, 0); const offPrompt = providerRequests.at(-1).messages; tools.length = 0;
  await startPython('SHADOW', proxy);
  const shadow = await send('staff'); assert.equal(shadow.status, 200, JSON.stringify(shadow)); const metadata = shadow.body.decisionAnalysis; delete shadow.body.decisionAnalysis;
  assert.deepEqual(shadow.body, off.body); assert.deepEqual(providerRequests.at(-1).messages, offPrompt);
  assert.equal(metadata.status, 'ok'); assert.equal(metadata.execution, 'mock'); assert.equal(metadata.needsManagerApprovalProbability, 0);
  assert.deepEqual(tools.slice(0, 5).map((row) => row.tool), ['validate_context', 'get_my_profile', 'list_projects', 'query_policy', 'validate_context']);
  assert.equal(new Set(tools.slice(0, 5).map((row) => row.requestId)).size, 1);
  assert.doesNotMatch(JSON.stringify(offPrompt.filter((message) => message.role === 'system')), /NEVER_|fixture-contact|delegationToken|owned-shadow-service-key/);
  console.log('PASS SHADOW through real Node/Python/scoped API with HTTP-mocked Jev, unchanged answer/prompt/tool order and mock provenance');

  const beforePrivate = jevEvents.length;
  assert.equal((await send('staff', 'Employee phone 0901234567 PRIVATE_BANK_DATA')).body.decisionAnalysis.status, 'skipped_data_policy');
  assert.equal(jevEvents.length, beforePrivate);
  assert.equal((await send('system_admin')).status, 403); assert.equal(jevEvents.length, beforePrivate);
  for (const profile of ['hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']) {
    const result = await send(profile); assert.equal(result.status, 200, profile); assert.equal(result.body.decisionAnalysis.status, 'ok', profile); assert.equal(result.body.proposedAction, null);
  }
  const concurrent = await Promise.all([send('staff', 'Synthetic policy Alpha'), send('staffB', 'Synthetic policy Beta')]);
  assert.deepEqual(concurrent.map((item) => item.body.decisionAnalysis.intent), ['policy_query', 'general_chat']);
  assert.ok(providerRequests.filter((body) => body.messages.some((message) => message.role === 'user' && message.content === 'Synthetic policy Beta')).every((body) => !body.messages[0].content.includes('PRIVATE_ALLOWED_TASK') && !body.messages[0].content.includes('PRIVATE_ALLOWED_DOCUMENT')));
  for (const suffix of ['Failure', 'Timeout']) { const result = await send('staff', 'Synthetic policy ' + suffix); assert.equal(result.status, 200); assert.equal(result.body.decisionAnalysis.status, 'unavailable'); assert.equal(result.body.reply, off.body.reply); }

  const socket = socketClient(apiOrigin, { auth: { token: staff.token }, transports: ['websocket'], reconnection: false });
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const received = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Owned socket timeout')), 5000); socket.once('chat:done', (body) => { clearTimeout(timer); resolve(body); }); });
    socket.emit('chat:send', { clientMessageId: 'shadow-socket', text: 'Synthetic policy Alpha' });
    const body = await received; assert.equal(body.decisionSource, 'authorization-v1'); assert.equal(body.decisionAnalysis.execution, 'mock'); assert.equal(body.proposedAction, null);
  } finally { socket.close(); }
  console.log('PASS nine profiles, cross-store/PII/forged identity DENY, concurrent users, unavailable Jev fail-soft, REST/Socket optional metadata');

  // A real bound token without the service credential cannot trigger preflight/Jev.
  const { resolvePrincipal } = await import('../dist/services/principal.service.js');
  const { beginAuthorizedChat } = await import('../dist/services/chat-authorization.service.js');
  const bound = await beginAuthorizedChat(await resolvePrincipal({ sub: String(staff.user._id), role: 'Employee', securityVersion: 0 }));
  await mongoose.connection.collection('chat_authorization_requests').updateOne({ _id: bound.requestId }, { $set: { status: 'CLOSED' } });
  const beforeDenied = jevEvents.length;
  const denied = await fetch(aiOrigin + '/api/v1/authorized-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ai-service-key': process.env.AI_SERVICE_API_KEY }, body: JSON.stringify({ message: 'Synthetic policy Alpha', ...bound }) });
  assert.equal(denied.status, 503); assert.equal(jevEvents.length, beforeDenied);

  mutateAtJev = () => UserModel.updateOne({ _id: staff.user._id }, { $inc: { securityVersion: 1 } });
  const beforeRevoke = providerRequests.length; assert.equal((await send('staff', 'Synthetic policy Revoke')).status, 401); assert.equal(providerRequests.length, beforeRevoke);
  const { signAccessToken } = await import('../dist/services/auth.service.js'); staff.token = await signAccessToken({ sub: String(staff.user._id), role: 'Employee', securityVersion: 1 });
  mutateAtJev = () => UserModel.updateOne({ _id: staff.user._id }, { $set: { 'authorization.grants.0.revokedAt': new Date().toISOString() } });
  assert.equal((await send('staff', 'Synthetic policy Revoke')).status, 403);
  await UserModel.updateOne({ _id: staff.user._id }, { $set: { 'authorization.grants.0.revokedAt': null } });
  mutateAtProvider = () => mongoose.connection.collection('policies').updateOne({ _id: document.insertedId }, { $set: { 'acl.revokedAt': new Date().toISOString() } });
  assert.equal((await send('staff', 'Synthetic policy ACL')).status, 403);
  await mongoose.connection.collection('policies').updateOne({ _id: document.insertedId }, { $set: { 'acl.revokedAt': null } });
  mutateAtProvider = () => UserModel.updateOne({ _id: staff.user._id }, { $inc: { securityVersion: 1 } });
  assert.equal((await send('staff')).status, 401);
  staff.token = await signAccessToken({ sub: String(staff.user._id), role: 'Employee', securityVersion: 2 });
  slowAnswer = true; const deadlineStarted = Date.now();
  const bounded = await send('staff'); const elapsed = Date.now() - deadlineStarted;
  assert.equal(bounded.status, 200); assert.equal(bounded.body.abstain, true); assert.equal(bounded.body.degraded, true);
  assert.ok(elapsed >= 14000 && elapsed < 18000, `Shared Node/Python deadline elapsed ${elapsed}ms`);
  assert.notEqual(bounded.body.reply, off.body.reply, 'A late provider result is not a valid completed answer');
  assert.equal(JSON.stringify(await ProjectModel.find({}).lean()), originalTasks); assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray()), originalKpi);
  assert.equal(await mongoose.connection.collection('chat_authorization_requests').countDocuments({ status: 'ACTIVE' }), 0);
  console.log('PASS closed-token preflight no Jev; grant/token revoke during mock Jev suppresses reads; final ACL/principal mutation suppresses output; CRM/KPI unchanged and receipts closed');
  console.log(`PASS shared end-to-end 15s budget: elapsed=${elapsed}ms including mock Jev and stalled answer provider; late reply is never returned`);
} finally {
  process.env = savedEnv; await stopPython();
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  for (const server of [api, provider]) if (server?.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await disconnectDB();
}
