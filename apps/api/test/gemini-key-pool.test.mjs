import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGeminiKeyPool,
  getRotatedKeyPool,
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
    process.env.AI_LLM_API_KEYS = original;
  }
});
