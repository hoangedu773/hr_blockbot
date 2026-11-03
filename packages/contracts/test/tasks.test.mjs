import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskTemplateContentSchema as T, CreateTaskRequestSchema as C } from '../dist/index.js';
test('task rubric requires four mandatory dimensions independently of progress',()=>{
 const v={code:'INVENTORY',name:'Kiểm kê',steps:[{code:'count',name:'Kiểm đếm',progressWeightPercent:100,required:true}],qualityCriteria:['completeness','accuracy','timeliness','evidence'].map(code=>({code,name:code,maxScore:25,mandatory:true,description:'',evidenceRequired:true})),requiredEvidence:[],effectiveFrom:'2026-10',effectiveTo:null};
 assert.ok(T.safeParse(v).success);assert.ok(!T.safeParse({...v,qualityCriteria:v.qualityCriteria.slice(1)}).success);assert.ok(!T.safeParse({...v,steps:[{...v.steps[0],progressWeightPercent:99}]}).success);assert.ok(!T.safeParse({...v,qualityCriteria:[...v.qualityCriteria.slice(0,3),{...v.qualityCriteria[3],code:'accuracy'}]}).success);assert.ok(!C.safeParse({progress:100,score:100}).success);
});
