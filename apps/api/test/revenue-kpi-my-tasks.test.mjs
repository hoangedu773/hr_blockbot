import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
const isZod = e => e && Array.isArray(e.issues);
import * as S from '../dist/services/revenue-kpi.service.js';
import * as T from '../dist/services/task-instance.service.js';
import { performanceFixture, cmd } from './helpers/performance-kpi-fixture.mjs';

let pf;
before(async () => {
  await connectDB();
  pf = await performanceFixture();
});
after(disconnectDB);

test('get_my_tasks: mọi role, chỉ task giao cho mình, qua canReadTask/task.read_self; staff đọc được', async () => {
  const staff = await pf.principal('staff'), staffB = await pf.principal('staffB'), sm = await pf.principal('sm');
  const due = new Date(Date.now() + 7 * 86400000).toISOString();
  let task = await T.createTask(sm, cmd(0, { templateId: pf.template.id, storeId: String(pf.stores[0]._id), title: 'Nhiệm vụ pending P2', description: 'Phần việc giả lập cho kiểm thử read-only.', dueAt: due, taskWeightPercent: 10, isDemo: true }));
  task = await T.mutateTask(sm, task.id, 'assign', cmd(task.version, { assigneeEmployeeId: staff.employeeId, reason: 'Giao nhiệm vụ cho nhân viên phụ trách.' }));

  const staffTasks = await S.getMyTasks(staff, task.kpiPeriod);
  assert.equal(staffTasks.period, task.kpiPeriod);
  assert.ok(staffTasks.items.some(i => i.taskId === task.id && i.title === 'Nhiệm vụ pending P2'));
  assert.ok(staffTasks.items.every(i => i.status !== 'CANCELLED'));

  const otherTasks = await S.getMyTasks(staffB, task.kpiPeriod);
  assert.ok(!otherTasks.items.some(i => i.taskId === task.id), 'task của người khác không xuất hiện');

  const smTasks = await S.getMyTasks(sm, task.kpiPeriod);
  assert.ok(!smTasks.items.some(i => i.taskId === task.id), 'SM không được giao task này');

  const collectionCount = (await mongoose.connection.db.listCollections().toArray()).length;
  const documentCount = await mongoose.connection.db.collection('task_instances').countDocuments();
  await S.getMyTasks(staff, task.kpiPeriod);
  assert.equal((await mongoose.connection.db.listCollections().toArray()).length, collectionCount, 'đường read không tạo collection');
  assert.equal(await mongoose.connection.db.collection('task_instances').countDocuments(), documentCount, 'đường read không ghi document');
  assert.ok(!(await mongoose.connection.db.collection('performance_kpi_events').find().toArray()).some(e => e.action === 'TASK_CREATED' && e.at > new Date(Date.now() - 60000)), 'không có write sự kiện mới từ đường read');

  await assert.rejects(S.getMyTasks(staff, '2026-13'), e => isZod(e) || e.name === 'ZodError');
});

test('P2 read task không provision Mongo: đọc trước khi tạo gì cũng không tạo collection mới', async () => {
  const before = (await mongoose.connection.db.listCollections().toArray()).map(c => c.name).sort();
  const tasks = await S.getMyTasks(await pf.principal('ptch'));
  assert.ok(Array.isArray(tasks.items));
  const afterCollections = (await mongoose.connection.db.listCollections().toArray()).map(c => c.name).sort();
  assert.deepEqual(afterCollections, before, 'đường read không tạo/provision collection mới');
});
