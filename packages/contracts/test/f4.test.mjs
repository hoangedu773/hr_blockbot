import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {F4InternalRequestSchema,F4InternalResponseSchema,F4_MODEL,F4_REVISION} from '../dist/index.js';
const id='7fbfeef8-0247-40ff-82a3-0634b99ac7c3';
test('Python worker and Node contract pin the same model revision',()=>{
  const python=readFileSync(new URL('../../../apps/ai-service/app/f4_encoder.py',import.meta.url),'utf8');
  assert.equal(python.match(/^MODEL = "([^"]+)"/m)[1],F4_MODEL);
  assert.equal(python.match(/^REVISION = "([^"]+)"/m)[1],F4_REVISION);
});
test('F4 closed projection rejects employee data, invalid scores and wrong model revision',()=>{
  const input={requestId:id,requiredSkills:['Kiểm kê'],description:'Synthetic',candidates:[{id:'c0',skills:['Kiểm kê']}]};
  assert.equal(F4InternalRequestSchema.safeParse(input).success,true);
  for(const extra of [{jwt:'secret'},{employee:{phone:'sensitive'}},{scope:{all:true}}]) assert.equal(F4InternalRequestSchema.safeParse({...input,...extra}).success,false);
  const output={requestId:id,model:F4_MODEL,revision:F4_REVISION,items:[{id:'c0',semanticScore:0.5,pairs:[{required:'Kiểm kê',matched:'Kiểm kê',cosine:0.5}]}]};
  assert.equal(F4InternalResponseSchema.safeParse(output).success,true);
  for(const score of [NaN,Infinity,-1,1.1]) assert.equal(F4InternalResponseSchema.safeParse({...output,items:[{...output.items[0],semanticScore:score}]}).success,false);
  assert.equal(F4InternalResponseSchema.safeParse({...output,revision:'main'}).success,false);
});
