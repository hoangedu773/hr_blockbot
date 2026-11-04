import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { revenueProposalBaseline, fetchRevenueProposal, revenueEnvironmentProviders } from '../dist/services/revenue-kpi-ai.service.js';
test('Google keys use Gemini adapter; compatible keys require explicit URL and preserve configured model', () => {
  const google = revenueEnvironmentProviders({}, ['AIzaSy-owned-test']); assert.equal(google[0].type, 'gemini'); assert.equal(google[0].baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
  assert.deepEqual(revenueEnvironmentProviders({ AI_LLM_API_KEY: 'owned-compatible-test' }, []), []);
  const compatible = revenueEnvironmentProviders({ AI_LLM_API_KEY: 'owned-compatible-test', AI_LLM_BASE_URL: 'https://example.invalid/v1', AI_LLM_MODEL: 'owned-model' }, []);
  assert.equal(compatible[0].type, 'openai_compatible'); assert.equal(compatible[0].model, 'owned-model'); assert.equal(compatible[0].baseUrl, 'https://example.invalid/v1');
});
test('baseline range and HTTP clamp/strict fallback/timeout keep aggregate-only model payload', async () => {
  const months = [100000, 104000, 108000].map((revenueVnd, i) => ({ period: '2026-0' + (7 + i), revenueVnd, orderCount: 100 }));
  const range = revenueProposalBaseline(months); assert.equal(range.baselinePercent, 3.92);
  const payload = { unitType: 'STORE', months, ...range }, requests = []; let mode = 'ok';
  const server = createServer(async (req, res) => { let body = ''; for await (const b of req) body += b; requests.push(JSON.parse(body)); res.setHeader('Content-Type', 'application/json'); if (mode === 'timeout') return;
    res.end(JSON.stringify(mode === 'bad' ? { targetVnd: 1000 } : { suggestedGrowthPercent: mode === 'outside' ? 25 : range.baselinePercent, rationale: 'Đề xuất từ doanh thu tổng hợp.', confidence: 'medium' })); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const transport = { origin: 'http://127.0.0.1:' + server.address().port, key: 'only-test', timeoutMs: 2000 };
  try {
    assert.equal((await fetchRevenueProposal(payload, transport)).degraded, false); mode = 'outside'; assert.equal((await fetchRevenueProposal(payload, transport)).suggestedGrowthPercent, range.allowedMaxPercent);
    mode = 'bad'; assert.equal((await fetchRevenueProposal(payload, transport)).degraded, true); mode = 'timeout'; assert.equal((await fetchRevenueProposal(payload, { ...transport, timeoutMs: 100 })).degraded, true);
    assert.doesNotMatch(JSON.stringify(requests), /salary|employee|name|phone|bank|cccd/i);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
