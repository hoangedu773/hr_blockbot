import './require-isolated-db.mjs';
import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { connectDB,disconnectDB } from '../dist/db.js';
import { performanceFixture,cmd,ev } from './helpers/performance-kpi-fixture.mjs';
import * as S from '../dist/services/task-instance.service.js';
import { taskBreakdown } from '../dist/services/performance-kpi-scoring.service.js';
import { notificationDto } from '../dist/services/notification.service.js';
let f,sm,staff,ptch;
before(async()=>{await connectDB();f=await performanceFixture();sm=await f.principal('sm');staff=await f.principal('staff');ptch=await f.principal('ptch');});after(disconnectDB);
async function task(title='Kiểm kê cuối ca'){let t=await S.createTask(sm,cmd(0,{templateId:f.template.id,storeId:String(f.stores[0]._id),title,description:'Dữ liệu kiểm thử riêng.',dueAt:'2026-11-25T10:00:00.000Z',taskWeightPercent:30,isDemo:true}));return S.mutateTask(sm,t.id,'assign',cmd(t.version,{assigneeEmployeeId:staff.employeeId,reason:'Giao phần việc kiểm kê cụ thể.'}));}
test('ASSIGNED has no responsibility; accept/retry/CAS; progress is separate from rubric; first submission retained',async()=>{
 let t=await task();assert.equal(t.responsibilitySegments.length,0);assert.equal(taskBreakdown([t],staff.employeeId,'2026-11').rows[0].exclusionReason,'ASSIGNED_NOT_ACCEPTED');const accept=cmd(t.version);t=await S.mutateTask(staff,t.id,'accept',accept);assert.deepEqual(await S.mutateTask(staff,t.id,'accept',accept),t);await assert.rejects(S.mutateTask(staff,t.id,'accept',cmd(1)),e=>e.status===409);
 t=await S.mutateTask(staff,t.id,'progress',cmd(t.version,{completedStepCodes:['count','report'],evidenceRefs:ev}));assert.equal(t.progressPercent,100);assert.equal(t.evaluations.length,0);t=await S.mutateTask(staff,t.id,'submit',cmd(t.version,{reason:'Nộp đầy đủ kiểm kê và báo cáo.',evidenceRefs:ev}));const first=t.submittedAt;const scores=t.templateSnapshot.qualityCriteria.map(q=>({code:q.code,score:q.maxScore,comment:'Đã xác minh đúng bằng chứng.',evidenceRefs:ev}));
 t=await S.mutateTask(sm,t.id,'evaluate',cmd(t.version,{segmentId:t.responsibilitySegments[0].segmentId,criteriaScores:scores,workCompletedPercent:100,outcome:'REWORK',reason:'Cần đối chiếu thêm nhưng không quy lỗi tự động.',evidenceRefs:ev}));assert.equal(t.status,'REJECTED');assert.equal(t.evaluations[0].totalScore,100);assert.equal(t.evaluations[0].timeliness.onTime,true);
 t=await S.mutateTask(staff,t.id,'submit',cmd(t.version,{reason:'Nộp lại sau khi đã đối chiếu.',evidenceRefs:ev}));assert.equal(t.submittedAt,first);t=await S.mutateTask(sm,t.id,'evaluate',cmd(t.version,{segmentId:t.responsibilitySegments[0].segmentId,criteriaScores:scores,workCompletedPercent:100,outcome:'CONFIRM',reason:'Kết quả kiểm kê đầy đủ và hợp lệ.',evidenceRefs:ev}));assert.equal(t.status,'COMPLETED');assert.equal(t.evaluations.length,2);assert.equal(await mongoose.connection.collection('task_evaluations').countDocuments({taskId:t.id}),2);
});
test('refuse before acceptance cannot be zero; independent refusal appeal; external vs employee cancellation',async()=>{
 let t=await task('Nhiệm vụ có từ chối');t=await S.mutateTask(staff,t.id,'refuse',cmd(t.version,{reason:'Không có vật tư để làm đúng phạm vi.',evidenceRefs:ev}));t=await S.mutateTask(sm,t.id,'refusal-decision',cmd(t.version,{decision:'VALID',reason:'Xác minh thiếu vật tư là khách quan.',evidenceRefs:ev}));assert.equal(t.status,'CANCELLED');assert.equal(taskBreakdown([t],staff.employeeId,'2026-11').notApplicable,true);
 let pending=await task('Chưa nhận không thể quy lỗi');await assert.rejects(S.mutateTask(sm,pending.id,'cancel',cmd(pending.version,{cause:'EMPLOYEE_FAULT',reason:'Không được quy lỗi khi chưa nhận.',evidenceRefs:ev})),e=>e.code==='PERFORMANCE_KPI_TASK_NOT_ACCEPTED');
});
test('handover awaits consent; preserves scoped shares, never prorates days; extension moves the due period',async()=>{
 let t=await task('Bàn giao theo phần kiểm đếm');t=await S.mutateTask(staff,t.id,'accept',cmd(t.version));t=await S.mutateTask(sm,t.id,'handover',cmd(t.version,{replacementEmployeeId:ptch.employeeId,oldSharePercent:40,oldWorkScope:'Đã đếm bốn nhóm hàng hóa.',newWorkScope:'Đếm sáu nhóm và đối chiếu báo cáo.',releaseOld:false,reason:'Bàn giao theo mốc công việc đã xác minh.',evidenceRefs:ev}));assert.equal(t.responsibilitySegments[0].weightSharePercent,100);t=await S.mutateTask(ptch,t.id,'accept',cmd(t.version));assert.deepEqual(t.responsibilitySegments.map(s=>s.weightSharePercent),[40,60]);assert.ok(t.responsibilitySegments[0].to);assert.equal(t.responsibilitySegments[1].from,t.acceptedAt);
});
test('extension changes due-month with audit, and accepted cancellation retains or releases denominator by verified cause',async()=>{
 let t=await task('Nhiệm vụ được gia hạn');t=await S.mutateTask(staff,t.id,'accept',cmd(t.version));
 const {publishPerformancePolicy}=await import('../dist/services/performance-kpi-framework.service.js');const hr=await f.principal('hr');await publishPerformancePolicy(hr,'2026-12',cmd(0,{role:'STAFF',frameworkId:f.policies.STAFF.frameworkId,policy:{},reason:'Công bố trước kỳ tháng mười hai.'}));
 t=await S.mutateTask(sm,t.id,'extend',cmd(t.version,{dueAt:'2026-12-03T10:00:00.000Z',reason:'Gia hạn hợp lệ do thay đổi nguồn vật tư.',evidenceRefs:ev}));assert.equal(t.kpiPeriod,'2026-12');assert.equal(t.extensionHistory[0].from,'2026-11-25T10:00:00.000Z');assert.equal(taskBreakdown([t],staff.employeeId,'2026-11').notApplicable,true);assert.equal(taskBreakdown([t],staff.employeeId,'2026-12').notApplicable,false);
 let failed=await task('Hủy vì lỗi đã xác minh');failed=await S.mutateTask(staff,failed.id,'accept',cmd(failed.version));failed=await S.mutateTask(sm,failed.id,'cancel',cmd(failed.version,{cause:'EMPLOYEE_FAULT',reason:'Xác minh nhân viên tự ý bỏ phần việc đã nhận.',evidenceRefs:ev}));assert.equal(taskBreakdown([failed],staff.employeeId,'2026-11').notApplicable,false);assert.equal(taskBreakdown([failed],staff.employeeId,'2026-11').score,null);
 let released=await task('Hủy vì quản lý thay đổi');released=await S.mutateTask(staff,released.id,'accept',cmd(released.version));released=await S.mutateTask(sm,released.id,'cancel',cmd(released.version,{cause:'MANAGER_EXTERNAL',reason:'Quản lý dừng nhiệm vụ do đổi kế hoạch.',evidenceRefs:ev}));assert.equal(taskBreakdown([released],staff.employeeId,'2026-11').notApplicable,true);
});
test('late/missing task reminders dedupe and never auto accept responsibility',async()=>{
 const {runPerformanceReminders,flushPerformanceNotices}=await import('../dist/services/performance-kpi-notification.service.js');const t=await task('Nhiệm vụ chưa phản hồi');await runPerformanceReminders(new Date('2026-11-26T12:00:00Z'));const first=await mongoose.connection.collection('notifications').countDocuments({dedupeKey:'task_overdue:'+t.id+':'+t.dueAt});await runPerformanceReminders(new Date('2026-11-27T12:00:00Z'));assert.equal(await mongoose.connection.collection('notifications').countDocuments({dedupeKey:'task_overdue:'+t.id+':'+t.dueAt}),first);const current=await S.getTask(staff,t.id);assert.equal(current.assignmentStatus,'PENDING_ACCEPTANCE');assert.equal(current.responsibilitySegments.length,0);const n=await mongoose.connection.collection('notifications').findOne({dedupeKey:'task_overdue:'+t.id+':'+t.dueAt});assert.equal(n.type,'system');assert.equal(n.performanceType,'task_overdue');
 assert.equal(n.severity, 'URGENT');
 assert.equal(n.actionRef, t.id);
 assert.equal(n.title, 'Nhiệm vụ đã quá hạn');
 const legacy = notificationDto({ ...n, title: 'Cập nhật nhiệm vụ', body: 'Có nội dung cần xem hoặc phản hồi.', severity: 'INFO', actionRef: null });
 assert.equal(legacy.title, n.title);
 assert.equal(legacy.body, n.body);
 assert.equal(legacy.severity, 'URGENT');
 assert.equal(legacy.actionRef, t.id);
});

test('manager template proposals need independent scoped HR and cannot bypass published template rules', async () => {
 const T = await import('../dist/services/task-template.service.js');
 const hr = await f.principal('hr');
 const storeId = String(f.stores[0]._id), otherStore = String(f.stores[1]._id);
 const input = cmd(0, { storeId, content: f.template.content, reason: 'Đề xuất mẫu kiểm kê cho cửa hàng.' });
 await assert.rejects(T.proposeTaskTemplate(staff, input), e => e.status === 403);
 await assert.rejects(T.proposeTaskTemplate(sm, { ...input, storeId: otherStore }), e => e.status === 403);
 const draft = await T.proposeTaskTemplate(sm, input);
 assert.equal(draft.status, 'DRAFT');
 assert.equal(draft.proposalStoreId, storeId);
 assert.equal(draft.approvedBy, null);
 assert.notEqual(draft.content.code, f.template.content.code);
 assert.equal(draft.history[0].action, 'TEMPLATE_PROPOSED');
 assert.deepEqual(await T.proposeTaskTemplate(sm, input), draft);
 assert.ok((await T.listTaskTemplates(hr)).some(t => t.id === draft.id));
 assert.ok((await T.listTaskTemplates(sm)).some(t => t.id === draft.id));
 assert.ok(!(await T.listTaskTemplates(await f.principal('am'))).some(t => t.id === draft.id));
 const publish = cmd(draft.version, { reason: 'HR đã đối chiếu phạm vi và thang chấm.', evidenceRefs: ev });
 await assert.rejects(T.publishTaskTemplate(sm, draft.id, publish), e => e.status === 403);
 const create = cmd(0, { templateId: draft.id, storeId, title: 'Công việc kiểm kê theo mẫu mới', description: 'Đối chiếu thực tế.', dueAt: '2026-11-25T10:00:00.000Z', taskWeightPercent: 20 });
 await assert.rejects(S.createTask(sm, create), e => e.code === 'PERFORMANCE_KPI_FRAMEWORK_NOT_PUBLISHED');
 const published = await T.publishTaskTemplate(hr, draft.id, publish);
 assert.equal(published.status, 'PUBLISHED');
 assert.equal(published.approvedBy, hr.userId);
 assert.equal(published.history.length, 2);
 const work = await S.createTask(sm, create);
 assert.deepEqual(work.templateSnapshot, published.content);
 assert.equal(work.status, 'DRAFT');

 const rejectDraft = await T.proposeTaskTemplate(sm, cmd(0, { storeId, content: input.content, reason: input.reason }));
 const rejection = cmd(rejectDraft.version, { reason: 'Tiêu chí chưa phù hợp với công việc.', evidenceRefs: ev });
 const rejected = await T.rejectTaskTemplateProposal(hr, rejectDraft.id, rejection);
 assert.equal(rejected.status, 'ARCHIVED');
 assert.equal(rejected.approvedBy, null);
 assert.deepEqual(await T.rejectTaskTemplateProposal(hr, rejectDraft.id, rejection), rejected);
 await assert.rejects(T.publishTaskTemplate(hr, rejectDraft.id, publish), e => e.status === 409);
 assert.equal((await T.listTaskTemplates(sm)).find(t => t.id === rejectDraft.id).history.at(-1).reason, rejection.reason);
});

test('unified work pages contain both types, respect shared filters, and hide work outside scope', async () => {
 const { createApp } = await import('../dist/app.js');
 const server = createServer(createApp());
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = 'http://127.0.0.1:' + server.address().port;
 const headers = alias => ({ Authorization: 'Bearer ' + f.actors[alias].token, 'Content-Type': 'application/json' });
 async function list(alias, query) {
  const response = await fetch(origin + '/api/work-list?' + query, { headers: headers(alias) });
  assert.equal(response.status, 200);
  return response.json();
 }
 try {
  const title = 'Phiên đối chiếu chung';
  for (let index = 0; index < 3; index++) {
   const body = { title: title + ' thường ' + index, departmentId: String(f.departmentId), storeId: String(f.stores[0]._id), dueDate: '2026-11-25T10:00:00.000Z' };
   const result = await fetch(origin + '/api/projects', { method: 'POST', headers: headers('sm'), body: JSON.stringify(body) });
   assert.equal(result.status, 201);
  }
  await task(title + ' tính điểm 1');
  await task(title + ' tính điểm 2');
  const params = 'q=' + encodeURIComponent(title);
  const first = await list('sm', params + '&limit=2');
  assert.deepEqual(first.items.map(i => i.type), ['scored', 'regular']);
  assert.equal(first.paging.totalItems, 5);
  const second = await list('sm', params + '&limit=2&page=2');
  const third = await list('sm', params + '&limit=2&page=3');
  const ids = [...first.items, ...second.items, ...third.items].map(i => i.type === 'scored' ? i.task.id : i.project.id);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual((await list('sm', params + '&limit=3&page=2')).items.map(i => i.type), ['regular', 'regular']);
  const kpi = await list('sm', params + '&workType=scored&period=2026-11&status=ASSIGNED');
  assert.equal(kpi.items.length, 2);
  assert.ok(kpi.items.every(i => i.type === 'scored' && i.task.kpiPeriod === '2026-11' && !('history' in i.task)));
  assert.equal((await list('sm', params + '&workType=regular')).items.length, 3);
  assert.equal((await list('staff', params)).items.length, 2);
  assert.equal((await list('staffB', params)).items.length, 0);
 } finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
 }
});
