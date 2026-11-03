import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { validateConfiguration, warmWorker } from './start.mjs';
test('API startup requires a successful real-model warm-up, not just HTTP health', async () => {
  let fail = true, loaded = false, requests = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ loaded }));
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests++; assert.equal(req.headers['x-f4-service-key'], 'synthetic-key');
    assert.equal(JSON.parse(raw).candidates[0].id, 'c0');
    if (fail) { res.statusCode = 503; return res.end('{}'); }
    loaded = true; res.end(JSON.stringify({ model: 'vinai/phobert-base', revision: '01daacda68afe13d83023d16ec647239e344a1e6', items: [{ id: 'c0', semanticScore: 0.8 }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    await assert.rejects(warmWorker(origin, 'synthetic-key'), /warm-up failed/);
    fail = false; await warmWorker(origin, 'synthetic-key'); assert.equal(requests, 2);
    await assert.rejects(warmWorker(origin, 'synthetic-key', () => false), /exited/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('reject missing coefficient/key and non-loopback worker before launching', () => {
  const env = { F4_MODE: 'PHOBERT', F4_SEMANTIC_WEIGHT: '0.5', F4_SERVICE_KEY: 'x'.repeat(32), F4_WORKER_ORIGIN: 'http://127.0.0.1:8001' };
  validateConfiguration(env);
  for (const patch of [{ F4_SEMANTIC_WEIGHT: '' }, { F4_SERVICE_KEY: 'short' }, { F4_WORKER_ORIGIN: 'https://example.com' }]) assert.throws(() => validateConfiguration({ ...env, ...patch }));
});
