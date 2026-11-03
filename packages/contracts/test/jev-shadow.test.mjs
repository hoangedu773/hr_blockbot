import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecisionAnalysisSchema, ChatDonePayloadSchema } from '../dist/index.js';

const analysis = { mode: 'SHADOW', status: 'ok', execution: 'mock', source: 'jev_systemone', intent: 'policy_query',
  needsManagerApprovalProbability: 0, incidentUrgency: 1, intentConfidence: 0.8, intentProbabilities: { policy_query: 0.8 }, latencyMs: 10 };
test('optional shadow metadata preserves old payload and never represents live execution or authority', () => {
  const old = { clientMessageId: 'id', messageId: 'reply', finishReason: 'ANSWER' };
  assert.ok(ChatDonePayloadSchema.safeParse(old).success);
  assert.deepEqual(ChatDonePayloadSchema.parse({ ...old, decisionSource: 'authorization-v1', decisionAnalysis: analysis }).decisionAnalysis, analysis);
  for (const change of [{ mode: 'ADVISORY' }, { execution: 'live' }, { source: 'llm_fallback' }, { intent: 'grant_all' },
    { needsManagerApprovalProbability: -1 }, { intentConfidence: NaN }, { incidentUrgency: Infinity }, { intentProbabilities: { grant_all: 1 } }, { approved: true }]) {
    assert.equal(DecisionAnalysisSchema.safeParse({ ...analysis, ...change }).success, false);
  }
});
test('unavailable/skipped analysis cannot smuggle a decision, permission or provenance', () => {
  for (const status of ['unavailable', 'not_configured', 'skipped_data_policy']) {
    const row = { mode: 'SHADOW', status, execution: 'none', source: null };
    assert.ok(DecisionAnalysisSchema.safeParse(row).success);
    assert.equal(DecisionAnalysisSchema.safeParse({ ...row, approved: true }).success, false);
    assert.equal(DecisionAnalysisSchema.safeParse({ ...row, source: 'jev_systemone' }).success, false);
  }
});
test('live metadata distinguishes real execution, unavailability and synthetic shadow', () => {
  const live = { ...analysis, mode: 'LIVE', execution: 'live' };
  assert.ok(DecisionAnalysisSchema.safeParse(live).success);
  assert.equal(DecisionAnalysisSchema.safeParse({...live,execution:'mock'}).success,false);
  for(const status of ['unavailable','not_configured','external_text_disabled']) {
    const row={mode:'LIVE',status,execution:'none',source:null};
    assert.ok(DecisionAnalysisSchema.safeParse(row).success);
    assert.equal(DecisionAnalysisSchema.safeParse({...row,intent:'general_chat'}).success,false);
  }
});
