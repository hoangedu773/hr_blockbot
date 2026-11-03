import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performanceAiTransport,safeTaskAiText,defaultTaskTemplateContent } from '../dist/services/performance-kpi-ai.service.js';
import { TaskStructureSuggestionSchema,PerformanceAiSummarySchema } from '@hr-blockbot/contracts';
test('AI strict output/privacy/timeout fallback never returns score decisions',async()=>{
 const content=defaultTaskTemplateContent(),fallback={content,rationale:'Cần HR duyệt trước khi dùng.',confidence:'low',model:'fallback',degraded:true};const original=globalThis.fetch;let payload;
 try{globalThis.fetch=async(_url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({finalScore:100,assign:true})};};const result=await performanceAiTransport('suggest-task-structure',{title:'Kiểm kê hàng hóa',description:'Đối chiếu báo cáo',role:'STAFF',template:content},TaskStructureSuggestionSchema,fallback,{origin:'http://owned.local',key:'fixture',providerConfig:null});assert.deepEqual(result,fallback);assert.doesNotMatch(JSON.stringify({...payload,providerConfig:undefined}),/salary|bank|cccd|phone|password|token/i);
 globalThis.fetch=async()=>{throw new Error('timeout')};assert.deepEqual(await performanceAiTransport('suggest-task-structure',{},TaskStructureSuggestionSchema,fallback,{origin:'http://owned.local',key:'fixture',providerConfig:null}),fallback);
 for(const text of ['phone 0901234567','salary 10tr','email@company.vn','bank account'])assert.throws(()=>safeTaskAiText(text));assert.equal(safeTaskAiText('Kiểm kê 50 mặt hàng'), 'Kiểm kê 50 mặt hàng');
 }finally{globalThis.fetch=original;}
});
