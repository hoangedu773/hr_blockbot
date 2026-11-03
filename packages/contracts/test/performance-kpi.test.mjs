import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceFrameworkContentSchema as F, PerformancePolicyRulesSchema as P, PerformanceScoreInputSchema as S } from '../dist/index.js';
test('separate role framework, exact weights, system revenue and strict policy',()=>{
 const v={role:'STAFF',frameworkVersion:2,criteria:[['service',40],['attendance',30],['safety',30]].map(([code,weightPercent])=>({code,name:code,weightPercent,dataSource:'MANUAL',requiresEvidence:true,description:''})),taskComponent:{enabled:false,weightPercent:0,aggregation:'WEIGHTED_TASK_SCORE'},effectiveFrom:'2026-10',effectiveTo:null};
 assert.ok(F.safeParse(v).success);assert.ok(!F.safeParse({...v,role:'PTCH',criteria:v.criteria.slice(1)}).success);assert.ok(!F.safeParse({...v,role:'SM'}).success);assert.ok(!P.safeParse({salary:1}).success);assert.ok(!S.safeParse({code:'x',score:0,notApplicable:true,comment:'Không có dữ liệu',evidenceRefs:[]}).success);
});
