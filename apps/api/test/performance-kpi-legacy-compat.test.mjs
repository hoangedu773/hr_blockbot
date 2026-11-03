import './require-isolated-db.mjs';
import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL,fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB,disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EvaluationModel } from '../dist/models/Evaluation.js';
import { performanceFixture,cmd,ev } from './helpers/performance-kpi-fixture.mjs';
import { openPerformancePeriod } from '../dist/services/performance-kpi-evaluation.service.js';
const require=createRequire(import.meta.url),ts=require('typescript');
let f,legacy,e;
before(async()=>{
 await connectDB();f=await performanceFixture();for(const alias of ['sm','staff'])await UserModel.updateOne({_id:f.actors[alias].user._id},{$addToSet:{'authorization.grants.0.capabilities':'kpi.read_self','authorization.grants.1.capabilities':{$each:['kpi.manage','kpi.publish','kpi.override']}}});
 e=(await openPerformancePeriod(await f.principal('hr'),'2026-11',cmd(f.policies.STAFF.version,{policyId:f.policies.STAFF.id,employeeIds:[String(f.actors.staff.employee._id)],reason:'Mở KPI mới để kiểm thử code Main cũ.'}))).evaluations[0];
 const source=execFileSync('git',['show','9488b8a100c65c072ed5ea4a6e2fed0d227cf297:apps/api/src/services/kpi.service.ts'],{encoding:'utf8',cwd:fileURLToPath(new URL('../../../',import.meta.url))});
 let js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 js=js.replace(/from ["']([^"']+)["']/g,(_match,spec)=>{const file=spec.startsWith('.')?path.resolve(path.dirname(fileURLToPath(new URL('../dist/services/kpi.service.js',import.meta.url))),spec):require.resolve(spec);return 'from '+JSON.stringify(pathToFileURL(file).href);});
 legacy=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
});after(disconnectDB);
test('actual released Main F5 code rejects every v1 writer against ANALYZED/null-machine v2, byte-for-byte unchanged',async()=>{
 const before=await EvaluationModel.collection.findOne({_id:new mongoose.Types.ObjectId(e.id)}),staff=await f.principal('staff'),sm=await f.principal('sm');
 for(const operation of [()=>legacy.saveSelfReview(staff,e.id,{text:'Legacy self review must reject.',expectedVersion:e.version}),()=>legacy.saveManagerReview(sm,e.id,{text:'Legacy manager review must reject.',managerScore:100,expectedVersion:e.version}),()=>legacy.analyzeEvaluation(sm,e.id,e.version),()=>legacy.publishEvaluation(sm,e.id,{expectedVersion:e.version}),()=>legacy.overrideEvaluation(sm,e.id,{expectedVersion:e.version,finalScore:100,reason:'Legacy override must reject.'})])await assert.rejects(operation(),err=>err.status===409&&['KPI_LOCKED','KPI_NOT_READY'].includes(err.code));
 assert.deepEqual(await EvaluationModel.collection.findOne({_id:before._id}),before);
});
