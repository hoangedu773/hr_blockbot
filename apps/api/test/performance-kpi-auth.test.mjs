import './require-isolated-db.mjs';
import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB,disconnectDB } from '../dist/db.js';
import { performanceFixture,cmd,ev,manualScores } from './helpers/performance-kpi-fixture.mjs';
import * as E from '../dist/services/performance-kpi-evaluation.service.js';
let f,hr,sm,staff,e;
before(async()=>{await connectDB();f=await performanceFixture();[hr,sm,staff]=await Promise.all(['hr','sm','staff'].map(f.principal));e=(await E.openPerformancePeriod(hr,'2026-11',cmd(f.policies.STAFF.version,{policyId:f.policies.STAFF.id,employeeIds:[staff.employeeId],reason:'Mở kỳ nhân viên kiểm thử quyền.'}))).evaluations[0];});after(disconnectDB);
test('staff only self; AM cannot routine-score staff; self approval and technical admin denied; feature flag',async()=>{
 await assert.rejects(E.getPerformanceEvaluation(await f.principal('staffB'),e.id),x=>x.status===403);assert.equal((await E.listPerformanceEvaluations(await f.principal('staffB'),'2026-11')).length,0);await assert.rejects(E.mutatePerformanceEvaluation(await f.principal('am'),e.id,'manager-score',cmd(e.version,{criteriaScores:manualScores(),reason:'AM không chấm thay SM thường kỳ.',evidenceRefs:ev})),x=>x.status===403);await assert.rejects(E.performanceDashboard(await f.principal('system_admin'),'2026-11'),x=>x.status===403);process.env.PERFORMANCE_KPI_ENABLED='false';await assert.rejects(E.getPerformanceEvaluation(staff,e.id),x=>x.code==='PERFORMANCE_KPI_DISABLED'&&x.status===503);process.env.PERFORMANCE_KPI_ENABLED='true';
});
test('revoked direct management relation denies stale principal; never infer from job title',async()=>{
 await mongoose.connection.collection('management_relations').updateOne({managerEmployeeId:new mongoose.Types.ObjectId(sm.employeeId),employeeId:new mongoose.Types.ObjectId(staff.employeeId)},{$set:{revokedAt:new Date()}});await assert.rejects(E.mutatePerformanceEvaluation(sm,e.id,'manager-score',cmd(e.version,{criteriaScores:manualScores(),reason:'Phải kiểm tra quan hệ hiện tại lại.',evidenceRefs:ev})),x=>x.status===403);
});
