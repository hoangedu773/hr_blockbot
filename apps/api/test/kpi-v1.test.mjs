import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EvaluationModel } from '../dist/models/Evaluation.js';
import { NotificationModel } from '../dist/models/Notification.js';
import { ProjectModel } from '../dist/models/Project.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { runDeadlineReminders, runKpiReviewDigest } from '../dist/services/scheduler.service.js';

let fixture, server, ai, origin;
const calls = [];
const period = '2026-10';
const DAY = 86400000;
async function call(actor, path, body) {
  const response = await fetch(origin + '/api' + path, { method: body ? 'POST' : 'GET',
    headers: { Connection: 'close', Authorization: 'Bearer ' + fixture.actors[actor].token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function addCap(actor, capability, grant = 1) {
  await UserModel.updateOne({ _id: fixture.actors[actor].user._id }, { $addToSet: { ['authorization.grants.' + grant + '.capabilities']: capability } });
}
before(async () => {
  process.env.AI_SERVICE_API_KEY = 'isolated-kpi-service-key';
  delete process.env.AI_LLM_API_KEY; delete process.env.AI_LLM_API_KEYS; delete process.env.GEMINI_API_KEYS;
  await connectDB(); fixture = await authorizationV1Fixture();
  await EvaluationModel.init(); await NotificationModel.init();
  for (const actor of ['staff', 'ptch', 'sm', 'hr']) await addCap(actor, 'kpi.read_self', 0);
  for (const actor of ['sm', 'hr']) for (const capability of ['kpi.manage', 'kpi.publish', 'kpi.override', 'kpi.read_department']) await addCap(actor, capability);
  ai = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk; calls.push({ path: req.url, raw, key: req.headers['x-ai-service-key'] });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ sentiment: 'positive', sentimentScore: 0.6, themes: ['Chất lượng công việc', 'Tiến độ'],
      riskSignals: ['đi muộn'], suggestedScoreComponent: 0.7, explanation: 'Tín hiệu tích cực, còn rủi ro giờ giấc.',
      model: 'isolated-test-model', degraded: false, analyzedAt: new Date().toISOString() }));
  });
  await new Promise((resolve) => ai.listen(0, '127.0.0.1', resolve));
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + ai.address().port;
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  for (const instance of [server, ai]) { instance.closeAllConnections(); await new Promise((resolve) => instance.close(resolve)); }
  await mongoose.connection.dropDatabase(); await disconnectDB();
});

test('F5 lifecycle: open, self review, manager review, AI signal, deterministic score, publish, override history', async () => {
  const staff = fixture.actors.staff.employee;
  await ProjectModel.create([
    { title: 'KPI project completed', status: 'COMPLETED', progress: 100, dueDate: new Date(Date.UTC(2026, 9, 10)), assigneeId: staff._id, responsibleEmployeeId: String(staff._id), departmentId: fixture.departmentId, storeId: fixture.stores[0]._id, createdBy: fixture.actors.sm.employee._id },
    { title: 'KPI project in progress', status: 'IN_PROGRESS', progress: 80, dueDate: new Date(Date.UTC(2026, 9, 20)), assigneeId: staff._id, responsibleEmployeeId: String(staff._id), departmentId: fixture.departmentId, storeId: fixture.stores[0]._id, createdBy: fixture.actors.sm.employee._id },
  ]);
  const opened = await call('sm', '/kpi/periods/open', { period });
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  assert.ok(opened.body.employees >= 5);
  const department = await call('sm', '/kpi/department?period=' + period);
  assert.equal(department.status, 200, JSON.stringify(department.body));
  const evaluation = department.body.items.find((item) => item.employeeId === String(staff._id));
  assert.ok(evaluation, 'staff evaluation created');
  assert.equal(evaluation.status, 'OPEN');

  assert.equal((await call('staff', '/kpi/' + evaluation.id + '/manager-review', { text: 'x', managerScore: 90, expectedVersion: 0 })).status, 403);
  const self = await call('staff', '/kpi/' + evaluation.id + '/self-review', { text: 'Em hoàn thành đúng hạn và chủ động hỗ trợ đồng đội.', expectedVersion: evaluation.version });
  assert.equal(self.status, 200, JSON.stringify(self.body));
  const manager = await call('sm', '/kpi/' + evaluation.id + '/manager-review', { text: 'Chất lượng công việc tốt, cần cải thiện giờ giấc.', managerScore: 80, expectedVersion: self.body.version });
  assert.equal(manager.status, 200, JSON.stringify(manager.body));
  const analyzed = await call('sm', '/kpi/' + evaluation.id + '/analyze', { expectedVersion: manager.body.version });
  assert.equal(analyzed.status, 200, JSON.stringify(analyzed.body));
  assert.equal(calls.at(-1).key, 'isolated-kpi-service-key');
  assert.doesNotMatch(calls.at(-1).raw, /staff|Isolated V1|employeeId|salary|bank/i);
  assert.equal(analyzed.body.objectiveCompletionScore, 0.85);
  assert.equal(analyzed.body.machineScore, 80.5);
  assert.equal(analyzed.body.breakdown.capped, false);

  const hidden = await call('staff', '/kpi/me?period=' + period);
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.items[0].status, 'ANALYZED');
  assert.equal(hidden.body.items[0].finalScore, null);

  const published = await call('sm', '/kpi/' + evaluation.id + '/publish', { expectedVersion: analyzed.body.version });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.finalScore, 80.5);
  const visible = await call('staff', '/kpi/me?period=' + period);
  assert.equal(visible.body.items[0].finalScore, 80.5);
  assert.equal(visible.body.items[0].analysis.sentiment, 'positive');

  assert.equal((await call('sm', '/kpi/' + evaluation.id + '/override', { expectedVersion: published.body.version, finalScore: 90 })).status, 400);
  const overridden = await call('sm', '/kpi/' + evaluation.id + '/override', { expectedVersion: published.body.version, finalScore: 90, reason: 'Bổ sung đóng góp dự án ngoài kỳ.' });
  assert.equal(overridden.status, 200, JSON.stringify(overridden.body));
  assert.equal(overridden.body.finalScore, 90);
  assert.equal(overridden.body.machineScore, 80.5);
  assert.equal(overridden.body.overrideReason, 'Bổ sung đóng góp dự án ngoài kỳ.');
  assert.deepEqual(overridden.body.history.at(-1).action, 'OVERRIDE');
  assert.equal((await call('sm', '/kpi/' + evaluation.id + '/analyze', { expectedVersion: overridden.body.version })).status, 409);
});

test('F5 scope: staff cannot read department aggregate; system_admin denied; manager sees own store only', async () => {
  assert.equal((await call('staff', '/kpi/department?period=' + period)).status, 403);
  assert.equal((await call('system_admin', '/kpi/department?period=' + period)).status, 403);
  const list = await call('sm', '/kpi/department?period=' + period);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.find((item) => item.storeId !== String(fixture.stores[0]._id)), undefined);
  const dashboard = await call('sm', '/kpi/dashboard?period=' + period);
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(dashboard.body.published, 1);
  assert.equal(dashboard.body.averageFinalScore, 90);
  assert.equal(dashboard.body.trend.length, 6);
});

test('F7 scheduler: deadline and KPI digest notifications are idempotent', async () => {
  const now = new Date('2026-10-15T08:00:00.000Z');
  const staff = fixture.actors.staff.employee;
  await ProjectModel.create({ title: 'Deadline soon', status: 'IN_PROGRESS', progress: 10, dueDate: new Date(now.getTime() + 2 * DAY),
    assigneeId: staff._id, responsibleEmployeeId: String(staff._id), departmentId: fixture.departmentId, storeId: fixture.stores[0]._id, createdBy: fixture.actors.sm.employee._id });
  const first = await runDeadlineReminders(now);
  const second = await runDeadlineReminders(now);
  assert.ok(first.sent >= 1); assert.equal(second.sent, 0);
  assert.equal(await NotificationModel.countDocuments({ type: 'deadline_3d' }), 1);

  await EvaluationModel.updateOne({ period }, { $set: { status: 'ANALYZED', updatedAt: new Date(now.getTime() - 2 * DAY) } });
  const digestOne = await runKpiReviewDigest(now);
  const digestCount = await NotificationModel.countDocuments({ type: 'kpi_review_digest' });
  const digestTwo = await runKpiReviewDigest(now);
  assert.ok(digestOne.sent >= 1); assert.equal(digestTwo.sent, 0);
  assert.equal(await NotificationModel.countDocuments({ type: 'kpi_review_digest' }), digestCount);

  const list = await call('sm', '/notifications');
  assert.equal(list.status, 200);
  assert.ok(list.body.unread >= 1);
  const notification = list.body.items[0];
  assert.equal((await call('sm', '/notifications/' + notification.id + '/read', {})).status, 200);
  assert.equal((await call('sm', '/notifications/' + notification.id + '/read', {})).status, 404);
});
