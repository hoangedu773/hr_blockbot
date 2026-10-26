import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGeminiKeyPool,
  getHealthyKeyPool,
  getRotatedKeyPool,
  markKeyRateLimited,
  resetKeyCooldowns,
  keyCooldownMap,
  extractAndMarkRateLimitedKeys,
  GEMINI_DIRECT_TIER_MAP,
  chatWithAiService,
} from '../dist/services/ai-client.service.js';
import { SettingsModel } from '../dist/models/Settings.js';

test('getGeminiKeyPool parses keys from AI_LLM_API_KEYS env and deduplicates', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.MockKeyAlpha12345, AQ.MockKeyBeta67890, AQ.MockKeyAlpha12345';
    const pool = getGeminiKeyPool();
    assert.equal(pool.length, 2);
    assert.ok(pool.includes('AQ.MockKeyAlpha12345'));
    assert.ok(pool.includes('AQ.MockKeyBeta67890'));
  } finally {
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('getRotatedKeyPool rotates keys across calls', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.MockKey1, AQ.MockKey2, AQ.MockKey3';
    const p1 = getRotatedKeyPool();
    const p2 = getRotatedKeyPool();
    assert.equal(p1.length, 3);
    assert.equal(p2.length, 3);
    assert.equal(p1[0], p2[2]);
  } finally {
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('GEMINI_DIRECT_TIER_MAP defines correct purposeful model assignments', () => {
  assert.equal(GEMINI_DIRECT_TIER_MAP.low, 'gemini-3.1-flash-lite');
  assert.equal(GEMINI_DIRECT_TIER_MAP.medium, 'gemini-3.5-flash');
  assert.equal(GEMINI_DIRECT_TIER_MAP.high, 'gemini-3.8-flash');
});

test('chatWithAiService builds failover chain and high tier fallback for Gemini Direct', async (t) => {
  resetKeyCooldowns();
  t.mock.method(SettingsModel, 'findById', () => ({ lean: async () => null }));
  const original = process.env.AI_LLM_API_KEYS;
  process.env.AI_LLM_API_KEYS = 'AQ.MockKeySlot1, AQ.MockKeySlot2';
  delete process.env.AI_LLM_API_KEY;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return Response.json({
      reply: 'ok',
      intent: 'general_chat',
      citations: [],
      proposedAction: null,
      abstain: false,
    });
  });

  try {
    // 1. Medium tier call (default)
    await chatWithAiService('test query', {}, 'conv-1', { modelTier: 'medium' });
    assert.equal(calls.length, 1);
    const providers1 = calls[0].body.providerConfig.providers;
    assert.equal(providers1.length, 2, 'Must include 2 key slots in pool');
    assert.equal(providers1[0].type, 'gemini');
    assert.equal(providers1[0].model, 'gemini-3.5-flash');
    assert.equal(providers1[0].apiKey, 'AQ.MockKeySlot1');
    assert.equal(providers1[1].apiKey, 'AQ.MockKeySlot2');

    // 2. High tier call with fallback
    await chatWithAiService('complex query', {}, 'conv-2', { modelTier: 'high' });
    assert.equal(calls.length, 2);
    const providers2 = calls[1].body.providerConfig.providers;
    assert.equal(providers2[0].model, 'gemini-3.8-flash');
    // Last provider should be gemini-3.5-flash fallback
    const lastProvider = providers2[providers2.length - 1];
    assert.equal(lastProvider.model, 'gemini-3.5-flash');
    assert.equal(lastProvider.id, 'google-gemini-fallback-3.5');
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('markKeyRateLimited isolates rate-limited key from getHealthyKeyPool', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.KeyAlpha, AQ.KeyBeta, AQ.KeyGamma';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.KeyBeta', 60_000);
    const healthy = getHealthyKeyPool();

    assert.equal(healthy.length, 2);
    assert.ok(healthy.includes('AQ.KeyAlpha'));
    assert.ok(healthy.includes('AQ.KeyGamma'));
    assert.equal(healthy.includes('AQ.KeyBeta'), false);
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('getRotatedKeyPool rotates only healthy keys when one is in cooldown', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.Rot1, AQ.Rot2, AQ.Rot3';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.Rot1', 60_000);
    const r1 = getRotatedKeyPool();
    const r2 = getRotatedKeyPool();

    assert.equal(r1.length, 2);
    assert.equal(r2.length, 2);
    assert.equal(r1.includes('AQ.Rot1'), false);
    assert.equal(r2.includes('AQ.Rot1'), false);
    assert.notDeepEqual(r1, r2);
    assert.equal(r1[0], r2[1]);
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('getHealthyKeyPool safely falls back to full pool when all keys are in cooldown', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.Exhausted1, AQ.Exhausted2';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.Exhausted1', 60_000);
    markKeyRateLimited('AQ.Exhausted2', 60_000);

    const pool = getHealthyKeyPool();
    assert.equal(pool.length, 2);
    assert.ok(pool.includes('AQ.Exhausted1'));
    assert.ok(pool.includes('AQ.Exhausted2'));
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('resetKeyCooldowns clears all cooldowns immediately', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.Reset1, AQ.Reset2';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.Reset1', 60_000);
    assert.equal(getHealthyKeyPool().length, 1);

    resetKeyCooldowns();
    const restored = getHealthyKeyPool();
    assert.equal(restored.length, 2);
    assert.ok(restored.includes('AQ.Reset1'));
    assert.ok(restored.includes('AQ.Reset2'));
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('expired cooldown key is automatically reinstated', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.Expiring1, AQ.Expiring2';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.Expiring1', -100);

    const healthy = getHealthyKeyPool();
    assert.equal(healthy.length, 2);
    assert.ok(healthy.includes('AQ.Expiring1'));
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('chatWithAiService automatically marks key rate limited on upstream 429 / quota error', async (t) => {
  t.mock.method(SettingsModel, 'findById', () => ({ lean: async () => null }));
  const original = process.env.AI_LLM_API_KEYS;
  process.env.AI_LLM_API_KEYS = 'AQ.KeyUnderLimit1, AQ.KeyHealthy2';
  delete process.env.AI_LLM_API_KEY;
  resetKeyCooldowns();

  t.mock.method(globalThis, 'fetch', async () => {
    return new Response(JSON.stringify({
      error: {
        code: 'LLM_UNAVAILABLE',
        message: 'Rate limit reached',
        providers: [
          { providerId: 'google-gemini-slot-1', code: 'QUOTA_EXCEEDED' },
        ],
      },
      degraded: 'degraded-structured',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  try {
    const res = await chatWithAiService('trigger limit');
    assert.equal(res.degraded, true);

    const healthy = getHealthyKeyPool();
    assert.equal(healthy.length, 1);
    assert.equal(healthy[0], 'AQ.KeyHealthy2');
    assert.equal(healthy.includes('AQ.KeyUnderLimit1'), false);
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('corner case 1: markKeyRateLimited(key, 50) reinstates key after 60ms delay', async () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.TimedKey1, AQ.TimedKey2';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.TimedKey1', 50);
    const immediateHealthy = getHealthyKeyPool();
    assert.equal(immediateHealthy.length, 1);
    assert.equal(immediateHealthy.includes('AQ.TimedKey1'), false);

    await new Promise((resolve) => setTimeout(resolve, 65));

    const recoveredHealthy = getHealthyKeyPool();
    assert.equal(recoveredHealthy.length, 2);
    assert.ok(recoveredHealthy.includes('AQ.TimedKey1'));
    assert.ok(recoveredHealthy.includes('AQ.TimedKey2'));
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('corner case 1b: getRotatedKeyPool never contains cooldown key when other keys exist', () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.KeyStayHealthyA, AQ.KeyInCooldownB, AQ.KeyStayHealthyC';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.KeyInCooldownB', 60_000);

    for (let i = 0; i < 10; i++) {
      const rotated = getRotatedKeyPool();
      assert.equal(rotated.includes('AQ.KeyInCooldownB'), false, `Rotation cycle ${i} must never contain cooldown key`);
      assert.equal(rotated.length, 2);
    }
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});

test('corner case 3: extractAndMarkRateLimitedKeys isolates exact keys on QUOTA_EXCEEDED and 429', () => {
  resetKeyCooldowns();
  const mockProviders = [
    { id: 'prov-1', name: 'Provider 1', apiKey: 'AQ.ProvKey1' },
    { id: 'prov-2', name: 'Provider 2', apiKey: 'AQ.ProvKey2' },
    { id: 'prov-3', name: 'Provider 3', apiKey: 'AQ.ProvKey3' },
  ];

  // Case A: providers array with QUOTA_EXCEEDED on prov-2
  extractAndMarkRateLimitedKeys({
    error: {
      code: 'LLM_UNAVAILABLE',
      providers: [{ providerId: 'prov-2', code: 'QUOTA_EXCEEDED' }],
    },
  }, mockProviders);

  assert.ok(keyCooldownMap.has('AQ.ProvKey2'));
  assert.equal(keyCooldownMap.has('AQ.ProvKey1'), false);
  assert.equal(keyCooldownMap.has('AQ.ProvKey3'), false);

  // Case B: numeric 429 on prov-1
  extractAndMarkRateLimitedKeys({
    providers: [{ providerId: 'prov-1', code: 429 }],
  }, mockProviders);

  assert.ok(keyCooldownMap.has('AQ.ProvKey1'));
  assert.ok(keyCooldownMap.has('AQ.ProvKey2'));
  assert.equal(keyCooldownMap.has('AQ.ProvKey3'), false);

  resetKeyCooldowns();
});

test('corner case 4: keyCooldownMap automatically deletes expired keys (no memory leak)', async () => {
  const original = process.env.AI_LLM_API_KEYS;
  try {
    process.env.AI_LLM_API_KEYS = 'AQ.MemKey1, AQ.MemKey2';
    resetKeyCooldowns();

    markKeyRateLimited('AQ.MemKey1', 30);
    markKeyRateLimited('AQ.OrphanKeyNotInEnv', 30);
    assert.equal(keyCooldownMap.size, 2);

    await new Promise((resolve) => setTimeout(resolve, 45));

    // Invoking getHealthyKeyPool cleans up all expired entries from keyCooldownMap
    getHealthyKeyPool();

    assert.equal(keyCooldownMap.has('AQ.MemKey1'), false, 'Expired pool key must be deleted');
    assert.equal(keyCooldownMap.has('AQ.OrphanKeyNotInEnv'), false, 'Expired orphan key must be pruned');
    assert.equal(keyCooldownMap.size, 0, 'keyCooldownMap must be completely empty after cleanup');
  } finally {
    resetKeyCooldowns();
    process.env.AI_LLM_API_KEYS = original;
  }
});
