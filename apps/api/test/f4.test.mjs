// HTTP/mock-encoder integration, not proof of real PhoBERT inference.
import './require-isolated-db.mjs';
import {before,after,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import mongoose from 'mongoose';
import {createApp} from '../dist/app.js';
import {connectDB,disconnectDB} from '../dist/db.js';
import {performanceFixture,cmd} from './helpers/performance-kpi-fixture.mjs';
import {F4_MODEL,F4_REVISION} from '@hr-blockbot/contracts';
let fixture,server,worker,origin,analyze,calls=0;
const key='synthetic-only-f4-key-at-least-32-characters';
async function call(profile,path,body,method=body?'POST':'GET') {
  const response=await fetch(origin+'/api'+path,{method,headers:{Authorization:'Bearer '+fixture.actors[profile].token,'Content-Type':'application/json',Connection:'close'},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
async function project(requiredSkills=['Kiểm kê']) {
  const created=await call('sm','/projects',{title:'Synthetic F4 task',description:'Kiểm tra kho nguyên liệu',requiredSkills,storeId:String(fixture.stores[0]._id),departmentId:String(fixture.departmentId),dueDate:new Date(Date.now()+86400000*5).toISOString()});
  assert.equal(created.status,201,JSON.stringify(created.body)); return created.body;
}
const advice=(p,actor='sm')=>call(actor,`/projects/${p.id}/assignment/candidates`);
function valid(body) {return {requestId:body.requestId,model:F4_MODEL,revision:F4_REVISION,items:body.candidates.map(candidate=>{
  const pairs=body.requiredSkills.map(required=>({required,matched:candidate.skills[0]??null,cosine:candidate.skills.length?0.5:0}));
  return {id:candidate.id,semanticScore:pairs.reduce((sum,pair)=>sum+pair.cosine,0)/pairs.length,pairs};
})};}
function enable() {process.env.F4_MODE='PHOBERT';process.env.F4_SEMANTIC_WEIGHT='0.5';process.env.F4_SERVICE_KEY=key;}
before(async()=>{
  process.env.F4_MODE='OFF'; await connectDB();fixture=await performanceFixture();
  for(const name of ['staff','ptch']) await mongoose.connection.collection('employees').updateOne({_id:fixture.actors[name].employee._id},{$set:{skills:['Kiểm kê']}});
  worker=createServer(async(req,res)=>{try{calls++;assert.equal(req.headers['x-f4-service-key'],key);let text='';for await(const part of req)text+=part;const input=JSON.parse(text);
    assert.deepEqual(Object.keys(input).sort(),['candidates','description','requestId','requiredSkills']);
    assert.ok(!/NEVER_SEND_BANK|fixture-contact|Isolated V1|Bearer|employeeId|scope|authorization/.test(text));
    const result=await analyze(input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  }catch{res.statusCode=503;res.end('{}');}});
  await new Promise(resolve=>worker.listen(0,'127.0.0.1',resolve));process.env.F4_WORKER_ORIGIN='http://127.0.0.1:'+worker.address().port;
  server=createServer(createApp());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
});
afterEach(()=>{process.env.F4_MODE='OFF';delete process.env.F4_SEMANTIC_WEIGHT;analyze=valid;calls=0;});
after(async()=>{for(const item of [server,worker])if(item){item.closeAllConnections();await new Promise(resolve=>item.close(resolve));}await mongoose.connection.dropDatabase();await disconnectDB();});

test('baseline and full9-profile grants keep scope, no model or KPI access, no CRM writes',async()=>{
  const p=await project();let prior;
  await mongoose.connection.collection('evaluations').insertOne({employeeId:fixture.actors.staff.employee._id,status:'PUBLISHED',finalScore:-999,maxScore:100});
  const before=JSON.stringify(await mongoose.connection.collection('projects').find({}).sort({_id:1}).toArray());
  const evaluations=JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray());
  for(const name of ['system_admin','hr','om','aom','sam','am','sm','ptch','staff']){
    const result=await advice(p,name);assert.equal(result.status===200,['om','sam','am','sm'].includes(name),name);
    if(name==='sm')prior=result.body;
  }
  assert.equal((await advice(p,'staffB')).status,404);assert.equal(calls,0);
  assert.equal(prior.source,'BASELINE_EXACT');assert.ok(prior.items.every(row=>row.kpi===null&&row.semanticScore===null));
  assert.equal(JSON.stringify(await mongoose.connection.collection('projects').find({}).sort({_id:1}).toArray()),before);
  assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray()),evaluations);
});

test('inactive, UNKNOWN and lifecycle-fenced employees never enter candidate projection',async()=>{
  const p=await project(),collection=mongoose.connection.collection('employees'),id=fixture.actors.ptch.employee._id;
  try{for(const update of [{$set:{status:'inactive'}},{$unset:{status:''}},{$set:{status:'active',lifecyclePendingRequestId:new mongoose.Types.ObjectId()}}]){
    await collection.updateOne({_id:id},update);const result=await advice(p);assert.equal(result.status,200);assert.ok(!result.body.items.some(row=>row.employeeId===String(id)));
  }}finally{await collection.updateOne({_id:id},{$set:{status:'active'},$unset:{lifecyclePendingRequestId:''}});}
});

test('mock encoder HTTP path validates model metadata and minimizes data; viewing never assigns',async()=>{
  enable();analyze=valid;const p=await project(),result=await advice(p);
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.source,'PHOBERT');assert.equal(result.body.model,F4_MODEL);assert.equal(calls,1);
  const after=await call('sm','/projects/'+p.id);assert.equal(after.body.version,p.version);assert.equal(after.body.assigneeId,null);
});

test('foreign IDs, malformed scores/revision/evidence fail to clearly labelled non-KPI baseline',async()=>{
  enable();const p=await project();
  for(const fault of ['id','score','revision','skill','inconsistent']){
    analyze=input=>{const output=valid(input);if(fault==='id')output.items[0].id='c999';if(fault==='score')output.items[0].semanticScore=2;if(fault==='revision')output.revision='main';if(fault==='skill')output.items[0].pairs[0].matched='UNVERIFIED_SKILL';if(fault==='inconsistent')output.items[0].semanticScore=0.99;return output;};
    const result=await advice(p);assert.equal(result.status,200);assert.equal(result.body.status,'MODEL_UNAVAILABLE');assert.equal(result.body.source,'BASELINE_FALLBACK');assert.equal(result.body.model,null);
  }
});

test('revoked security version during inference never returns a stale recommendation',async()=>{
  enable();const p=await project(),id=fixture.actors.sm.user._id;
  try{analyze=async input=>{await mongoose.connection.collection('users').updateOne({_id:id},{$set:{securityVersion:1}});return valid(input);};
    assert.equal((await advice(p)).status,401);
  }finally{await mongoose.connection.collection('users').updateOne({_id:id},{$set:{securityVersion:0}});}
});

test('project edits and lifecycle changes during inference invalidate output',async()=>{
  enable();const p=await project();
  analyze=async input=>{assert.equal((await call('sm','/projects/'+p.id,{description:'Mô tả đã đổi',expectedVersion:p.version},'PATCH')).status,200);return valid(input);};
  assert.equal((await advice(p)).status,409);
  const q=await project(),id=fixture.actors.ptch.employee._id;
  try{analyze=async input=>{await mongoose.connection.collection('employees').updateOne({_id:id},{$set:{lifecyclePendingRequestId:new mongoose.Types.ObjectId()}});return valid(input);};
    assert.equal((await advice(q)).status,409);
  }finally{await mongoose.connection.collection('employees').updateOne({_id:id},{$unset:{lifecyclePendingRequestId:''}});}
});

test('grant revocation before model access prevents calls and revocation during inference blocks output',async()=>{
  enable();const p=await project(),id=fixture.actors.sm.user._id,users=mongoose.connection.collection('users');
  try{
    await users.updateOne({_id:id},{$set:{'authorization.grants.1.revokedAt':new Date().toISOString()}});
    assert.notEqual((await advice(p)).status,200);assert.equal(calls,0);
    await users.updateOne({_id:id},{$set:{'authorization.grants.1.revokedAt':null}});
    analyze=async input=>{await users.updateOne({_id:id},{$set:{'authorization.grants.1.revokedAt':new Date().toISOString()}});return valid(input);};
    assert.notEqual((await advice(p)).status,200);
  }finally{await users.updateOne({_id:id},{$set:{'authorization.grants.1.revokedAt':null}});}
});

test('worker timeout returns labelled baseline without receiving or executing a late decision',async()=>{
  enable();const p=await project();analyze=async input=>{await new Promise(resolve=>setTimeout(resolve,9000));return valid(input);};
  const start=Date.now(),result=await advice(p);assert.equal(result.status,200);assert.equal(result.body.source,'BASELINE_FALLBACK');assert.equal(result.body.status,'MODEL_UNAVAILABLE');assert.ok(Date.now()-start<11000);
});

test('missing requirements or unselected dev coefficient do not call the model; manual option remains',async()=>{
  enable();analyze=valid;const p=await project([]);const missing=await advice(p);assert.equal(missing.body.status,'INSUFFICIENT_DATA');assert.deepEqual(missing.body.items,[]);assert.equal(calls,0);
  delete process.env.F4_SEMANTIC_WEIGHT;const q=await project();const fallback=await advice(q);assert.equal(fallback.body.source,'BASELINE_FALLBACK');assert.equal(calls,0);
});

test('simultaneous manager requests use request-bound IDs without mixing eligible pools',async()=>{
  enable();analyze=async input=>{await new Promise(resolve=>setTimeout(resolve,25));return valid(input);};const p=await project();
  const [a,b]=await Promise.all([advice(p,'sm'),advice(p,'om')]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.source,'PHOBERT');assert.equal(b.body.source,'PHOBERT');assert.equal(calls,2);
  assert.ok(!a.body.items.some(row=>row.employeeId===String(fixture.actors.staffB.employee._id)));assert.ok(!b.body.items.some(row=>row.employeeId===String(fixture.actors.staffB.employee._id)));
});

test('scored work preview and saved advice use PhoBERT without writing or crossing scopes', async () => {
  enable(); analyze=valid;
  const storeId=String(fixture.stores[0]._id), otherStore=String(fixture.stores[1]._id);
  const input={storeId,description:'Đối chiếu số lượng hàng trong kho.',dueAt:'2026-11-25T10:00:00.000Z',requiredSkills:['Kiểm kê']};
  const draftPath='/tasks/suggest-candidates';
  assert.equal((await call('sm',draftPath,{...input,storeId:otherStore})).status,403);
  assert.equal((await call('staff',draftPath,input)).status,403);
  assert.equal((await call('sm',draftPath,{...input,assigneeEmployeeId:String(fixture.actors.staff.employee._id)})).status,400);
  assert.equal(calls,0);
  const tasks=mongoose.connection.collection('task_instances');
  const count=await tasks.countDocuments();
  const evals=await mongoose.connection.collection('evaluations').find().toArray();
  const preview=await call('sm',draftPath,input);
  assert.equal(preview.status,200,JSON.stringify(preview.body));
  assert.equal(preview.body.source,'PHOBERT');
  assert.deepEqual(new Set(preview.body.items.map(row=>row.employeeId)),new Set(['staff','ptch'].map(name=>String(fixture.actors[name].employee._id))));
  assert.ok(preview.body.items.every(row=>row.kpi===null));
  assert.equal(await tasks.countDocuments(),count);
  const noSkills=await call('sm',draftPath,{...input,requiredSkills:[]});
  assert.equal(noSkills.body.status,'INSUFFICIENT_DATA');
  assert.equal(calls,1);
  const create=extra=>call('sm','/tasks',cmd(0,{...input,templateId:fixture.template.id,title:'Kiểm kê theo rubric',taskWeightPercent:20,...extra}));
  const saved=await create({});
  assert.equal(saved.status,201,JSON.stringify(saved.body));
  assert.deepEqual(saved.body.requiredSkills,input.requiredSkills);
  const savedPath='/tasks/'+saved.body.id+'/suggest-candidates';
  const persisted=await tasks.findOne({_id:saved.body.id});
  const result=await call('sm',savedPath,{});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.source,'PHOBERT');
  assert.equal(result.body.projectVersion,saved.body.version);
  assert.equal((await call('staffB',savedPath,{})).status,403);
  assert.deepEqual(await tasks.findOne({_id:saved.body.id}),persisted);
  assert.equal(persisted.assigneeEmployeeId,null);

  const old=await create({requiredSkills:undefined});
  assert.equal(old.status,201,JSON.stringify(old.body));
  const oldPath='/tasks/'+old.body.id+'/suggest-candidates';
  assert.equal((await call('sm',oldPath,{})).body.status,'INSUFFICIENT_DATA');
  assert.equal((await call('sm',oldPath,{requiredSkills:['Kiểm kê']})).body.source,'PHOBERT');
  assert.equal((await tasks.findOne({_id:old.body.id})).requiredSkills,undefined);
  assert.deepEqual(await mongoose.connection.collection('evaluations').find().toArray(),evals);
  const fencedId=fixture.actors.ptch.employee._id;
  const employees=mongoose.connection.collection('employees');
  try {
    analyze=async body=>{
      await employees.updateOne({_id:fencedId},{$set:{lifecyclePendingRequestId:new mongoose.Types.ObjectId()}});
      return valid(body);
    };
    assert.equal((await call('sm',savedPath,{})).status,409);
  } finally {
    await employees.updateOne({_id:fencedId},{$unset:{lifecyclePendingRequestId:''}});
  }
});
