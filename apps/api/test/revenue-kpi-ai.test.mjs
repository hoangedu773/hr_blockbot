import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { revenueProposalBaseline, fetchRevenueProposal } from '../dist/services/revenue-kpi-ai.service.js';
test('baseline range and HTTP clamp/strict fallback/timeout keep aggregate-only model payload', async () => {
  const months = [100000, 104000, 108000].map((revenueVnd, i) => ({ period: '2026-0' + (7 + i), revenueVnd, orderCount: 100 }));
  const range = revenueProposalBaseline(months); assert.equal(range.baselinePercent, 3.92);
  const payload = { unitType: 'STORE', months, ...range }, requests = []; let mode = 'ok';
  const server = createServer(async (req, res) => { let body = ''; for await (const b of req) body += b; requests.push(JSON.parse(body)); res.setHeader('Content-Type', 'application/json'); if (mode === 'timeout') return;
    res.end(JSON.stringify(mode === 'bad' ? { targetVnd: 1000 } : { suggestedGrowthPercent: mode === 'outside' ? 25 : range.baselinePercent, rationale: 'Đề xuất từ doanh thu tổng hợp.', confidence: 'medium' })); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const transport = { origin: 'http://127.0.0.1:' + server.address().port, key: 'only-test', timeoutMs: 100 };
  try {
    assert.equal((await fetchRevenueProposal(payload, transport)).degraded, false); mode = 'outside'; assert.equal((await fetchRevenueProposal(payload, transport)).suggestedGrowthPercent, range.allowedMaxPercent);
    mode = 'bad'; assert.equal((await fetchRevenueProposal(payload, transport)).degraded, true); mode = 'timeout'; assert.equal((await fetchRevenueProposal(payload, transport)).degraded, true);
    assert.doesNotMatch(JSON.stringify(requests), /salary|employee|name|phone|bank|cccd/i);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
