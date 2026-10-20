import {
  LLMProviderSchema,
  ProviderTestResultSchema,
  type LLMProvider,
  type LLMProviderInput,
  type ProviderTestResult,
} from "@hr-blockbot/contracts";
import {
  SettingsModel,
  SETTINGS_ID,
  type ILLMProviderRecord,
} from "../models/Settings.js";
import {
  buildKeyHint,
  decryptApiKey,
  encryptApiKey,
  redactSecret,
  SettingsEncryptionError,
} from "./crypto.service.js";

export { SettingsEncryptionError };

export class ProviderKeyRequiredError extends Error {
  readonly code = "VALIDATION_FAILED";
  constructor(providerId: string) {
    super(`Provider '${providerId}' has no stored API key; an apiKey is required for a new provider`);
    this.name = "ProviderKeyRequiredError";
  }
}

export class SettingsValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

export class ProviderNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor(providerId: string) {
    super(`LLM provider '${providerId}' not found`);
    this.name = "ProviderNotFoundError";
  }
}

export interface ProvidersResponse {
  providers: LLMProvider[];
  configVersion: number;
}

export interface ActiveProviderConfig {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  priority: number;
  apiKey: string;
}

/** Masked DTO: never includes keyCipher or the plaintext key (ADR-017 invariant 2). */
export function toMaskedProvider(provider: ILLMProviderRecord): LLMProvider {
  return LLMProviderSchema.parse({
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    model: provider.model,
    maxTokens: provider.maxTokens,
    timeoutMs: provider.timeoutMs,
    priority: provider.priority,
    enabled: provider.enabled,
    keyHint: provider.keyHint ?? undefined,
    lastTestAt: provider.lastTestAt ? new Date(provider.lastTestAt).toISOString() : null,
    lastTestOk: provider.lastTestOk ?? null,
    lastTestError: provider.lastTestError ?? null,
  });
}

export async function getProvidersResponse(): Promise<ProvidersResponse> {
  const doc = await SettingsModel.findById(SETTINGS_ID).lean();
  if (!doc) {
    return { providers: [], configVersion: 0 };
  }
  return {
    providers: (doc.providers || []).map((provider) => toMaskedProvider(provider as ILLMProviderRecord)),
    configVersion: doc.configVersion || 0,
  };
}

/**
 * Upsert the whole provider list.
 * - apiKey present -> encrypt and replace; apiKey absent -> keep the existing key for that provider id.
 * - New provider without apiKey -> validation error (fail-closed, never store a keyless provider).
 */
export async function updateProviders(
  inputs: LLMProviderInput[],
  actorId: string
): Promise<ProvidersResponse> {
  const existingDoc = await SettingsModel.findById(SETTINGS_ID).lean();
  const existingById = new Map<string, ILLMProviderRecord>();
  for (const provider of existingDoc?.providers || []) {
    existingById.set(provider.id, provider as ILLMProviderRecord);
  }

  const seenIds = new Set<string>();
  const nextProviders: ILLMProviderRecord[] = [];

  for (const input of inputs) {
    if (seenIds.has(input.id)) {
      throw new SettingsValidationError(`Duplicate provider id '${input.id}'`);
    }
    seenIds.add(input.id);

    const previous = existingById.get(input.id);
    let keyCipher: string | null = previous?.keyCipher ?? null;
    let keyHint: string | null = previous?.keyHint ?? null;

    if (input.apiKey) {
      keyCipher = encryptApiKey(input.apiKey);
      keyHint = buildKeyHint(input.apiKey);
    } else if (!keyCipher) {
      throw new ProviderKeyRequiredError(input.id);
    }

    nextProviders.push({
      id: input.id,
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl,
      model: input.model,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      priority: input.priority,
      enabled: input.enabled,
      keyCipher,
      keyHint,
      // Test metadata is server-owned: preserve it, never accept it from the client.
      lastTestAt: previous?.lastTestAt ?? null,
      lastTestOk: previous?.lastTestOk ?? null,
      lastTestError: previous?.lastTestError ?? null,
    });
  }

  const now = new Date();
  const doc = await SettingsModel.findByIdAndUpdate(
    SETTINGS_ID,
    {
      $set: {
        providers: nextProviders,
        updatedBy: actorId,
        updatedAt: now,
      },
      $inc: { configVersion: 1 },
      $push: {
        audit: {
          $each: [
            {
              actor: actorId,
              at: now,
              changedFields: ["providers", ...nextProviders.map((p) => `providers.${p.id}`)],
              configVersion: (existingDoc?.configVersion || 0) + 1,
            },
          ],
          $slice: -20,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    providers: (doc?.providers || []).map((provider) =>
      toMaskedProvider(provider as ILLMProviderRecord)
    ),
    configVersion: doc?.configVersion || 0,
  };
}

/**
 * Internal use only (apps/api -> apps/ai-service): decrypted providers sorted by priority.
 * Never expose this through HTTP.
 */
export async function getActiveProviderConfig(): Promise<ActiveProviderConfig[]> {
  const doc = await SettingsModel.findById(SETTINGS_ID).lean();
  if (!doc) return [];

  return (doc.providers || [])
    .filter((provider) => provider.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      model: provider.model,
      maxTokens: provider.maxTokens,
      timeoutMs: provider.timeoutMs,
      priority: provider.priority,
      apiKey: decryptApiKey(provider.keyCipher || ""),
    }));
}

interface CompletionProbe {
  ok: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}

async function probeProvider(
  provider: ILLMProviderRecord,
  apiKey: string
): Promise<CompletionProbe> {
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(provider.timeoutMs || 10000, 1000), 20000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const sanitize = (message: string): string => {
    const redacted = redactSecret(message, apiKey);
    return redacted.length > 200 ? `${redacted.slice(0, 200)}...` : redacted;
  };

  try {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown>;

    if (provider.type === "openai_compatible") {
      url = `${baseUrl}/chat/completions`;
      headers.Authorization = `Bearer ${apiKey}`;
      body = {
        model: provider.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      };
    } else if (provider.type === "anthropic") {
      url = `${baseUrl}/v1/messages`;
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = {
        model: provider.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      };
    } else {
      // gemini: key must travel as query param, so never build an error string from the URL.
      url = `${baseUrl}/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      body = {
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1 },
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        model: provider.model,
        error: sanitize(`Provider responded with HTTP ${response.status}`),
      };
    }

    // Drain the response body without ever echoing provider content back to the client.
    await response.json().catch(() => undefined);
    return { ok: true, latencyMs, model: provider.model };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Provider test timed out after ${timeoutMs}ms`
        : sanitize(err instanceof Error ? err.message : "Provider test failed");
    return { ok: false, latencyMs, model: provider.model, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function testProvider(providerId: string): Promise<ProviderTestResult> {
  const doc = await SettingsModel.findById(SETTINGS_ID).lean();
  const provider = (doc?.providers || []).find((item) => item.id === providerId) as
    | ILLMProviderRecord
    | undefined;

  if (!provider) {
    throw new ProviderNotFoundError(providerId);
  }

  const apiKey = decryptApiKey(provider.keyCipher || "");
  const probe = await probeProvider(provider, apiKey);
  const now = new Date();

  await SettingsModel.updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        "providers.$[p].lastTestAt": now,
        "providers.$[p].lastTestOk": probe.ok,
        "providers.$[p].lastTestError": probe.error ? redactSecret(probe.error, apiKey) : null,
      },
    },
    { arrayFilters: [{ "p.id": providerId }] }
  );

  return ProviderTestResultSchema.parse({
    ok: probe.ok,
    latencyMs: probe.latencyMs,
    model: probe.model,
    ...(probe.error ? { error: probe.error } : {}),
  });
}
