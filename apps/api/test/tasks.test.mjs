import './require-isolated-db.mjs';
import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB,disconnectDB } from '../dist/db.js';
import { performanceFixture,cmd,ev } from './helpers/performance-kpi-fixture.mjs';
import * as S from '../dist/services/task-instance.service.js';
import { taskBreakdown } from '../dist/services/performance-kpi-scoring.service.js';
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
