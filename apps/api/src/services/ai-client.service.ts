import { z } from "zod";
import { DecisionAnalysisSchema, ErrorCodeSchema, type DecisionAnalysis } from "@hr-blockbot/contracts";
import { getActiveProviderConfig, ActiveProviderConfig } from "./settings.service.js";
import { parseSseStream } from "../lib/chat-sse.js";
import { WorkflowError } from "./project-workflow.service.js";

export const DEFAULT_GEMINI_PROVIDER: ActiveProviderConfig = {
  id: "gemini-3.8-flash-tunnel",
  name: "Gemini 3.8 Flash Proxy",
  type: "openai_compatible",
  // J-5: no endpoint is baked into source. The old default pointed at a personal
  // Cloudflare tunnel, so a deployment without AI_LLM_BASE_URL silently called an
  // unreachable host and leaked private infra into a tracked file.
  baseUrl: "",
  model: "ag/gemini-3.8-flash-low",
  apiKey: "",
  maxTokens: 1024,
  timeoutMs: 15000,
  priority: 1,
};

/** Key Pool Google Gemini nạp an toàn qua biến môi trường AI_LLM_API_KEYS */
export function getGeminiKeyPool(): string[] {
  const envRaw = process.env.AI_LLM_API_KEYS || process.env.GEMINI_API_KEYS || process.env.AI_LLM_API_KEY;
  if (!envRaw) return [];
  return Array.from(new Set(
    envRaw
      .split(/[,\n;]/)
      .map((k) => k.trim())
      .filter((k) => k.startsWith("AQ.") || k.startsWith("AIzaSy"))
  ));
}

export const keyCooldownMap = new Map<string, number>();

let hasWarnedMissingServiceKey = false;

/**
 * ai-service rejects every request with 503 when AI_SERVICE_API_KEY is unset,
 * so surface the misconfiguration once instead of silently failing per call.
 */
function warnIfServiceKeyMissing(): void {
  if (process.env.AI_SERVICE_API_KEY || hasWarnedMissingServiceKey) return;
  hasWarnedMissingServiceKey = true;
  console.warn(
    "[AIClient] AI_SERVICE_API_KEY is not set; the ai-service will reject requests with 503 SERVICE_KEY_NOT_CONFIGURED"
  );
}

export function markKeyRateLimited(apiKey: string, durationMs: number = 60_000): void {
  if (!apiKey) return;
  keyCooldownMap.set(apiKey, Date.now() + durationMs);
}

export function resetKeyCooldowns(): void {
  keyCooldownMap.clear();
}

export function getHealthyKeyPool(): string[] {
  const fullPool = getGeminiKeyPool();
  if (fullPool.length === 0) return [];

  const now = Date.now();
  for (const [key, expiresAt] of keyCooldownMap.entries()) {
    if (expiresAt <= now) {
      keyCooldownMap.delete(key);
    }
  }

  return fullPool.filter((key) => !keyCooldownMap.has(key));
}

let keyRotationCounter = 0;
export function getRotatedKeyPool(): string[] {
  const pool = getHealthyKeyPool();
  if (pool.length <= 1) return pool;
  const start = keyRotationCounter % pool.length;
  keyRotationCounter = (keyRotationCounter + 1) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

export function extractAndMarkRateLimitedKeys(payload: unknown, providers: ActiveProviderConfig[]): void {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, any>;
  const provErrors = p.error?.providers || p.providers;
  if (Array.isArray(provErrors)) {
    for (const pErr of provErrors) {
      if (
        pErr?.code === "QUOTA_EXCEEDED" ||
        pErr?.code === "PROVIDER_RATE_LIMITED" ||
        pErr?.code === "429" ||
        pErr?.code === 429 ||
        pErr?.status === 429 ||
        pErr?.status === "429"
      ) {
        const matched = providers.find(
          (item) => item.id === pErr.providerId || item.name === pErr.providerId
        );
        if (matched?.apiKey) {
          markKeyRateLimited(matched.apiKey);
        }
      }
    }
  }
  if (
    p.error?.code === "QUOTA_EXCEEDED" ||
    p.error?.code === "PROVIDER_RATE_LIMITED" ||
    p.error?.code === "429" ||
    p.error?.code === 429 ||
    p.error?.status === 429 ||
    p.error?.status === "429" ||
    p.code === "QUOTA_EXCEEDED" ||
    p.code === "PROVIDER_RATE_LIMITED" ||
    p.code === "429" ||
    p.code === 429 ||
    p.status === 429 ||
    p.status === "429" ||
    p.statusCode === 429
  ) {
    const provId = p.providerId || p.error?.providerId;
    const matched = provId
      ? providers.find((item) => item.id === provId || item.name === provId)
      : providers[0];
    if (matched?.apiKey) {
      markKeyRateLimited(matched.apiKey);
    }
  }
}

export interface UserContextPayload {
  userId?: string | null;
  role?: "Admin" | "Employee";
  employeeId?: string | null;
  departmentId?: string | null;
  /** Manager tier derived from job_title (P1-7 follow-up): admin|aom|sm|am|ptch|staff */
  businessRole?: string | null;
  /** The caller's own store, so role guidance and tool scope match the person. */
  storeName?: string | null;
}

const citationSchema = z.object({
  document: z.string().trim().min(1),
  version: z.string().optional(),
  article: z.string().optional(),
  score: z.number().finite().min(0).max(1),
});
const proposedActionSchema = z.object({
  actionId: z.string().optional(),
  type: z.string().trim().min(1),
  requiresConfirmation: z.boolean().default(true),
  args: z.record(z.unknown()).optional(),
  preview: z.string().optional(),
});
const attachmentSchema = z.object({
  title: z.string().trim().min(1),
  type: z.enum(["pdf", "image"]),
  url: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
});
const chatResultSchema = z.object({
  reply: z.string().trim().min(1),
  intent: z.string().default("UNKNOWN"),
  intentId: z.string().default("unknown"),
  citations: z.array(citationSchema).default([]),
  proposedAction: proposedActionSchema.nullish(),
  proposed_action: proposedActionSchema.nullish(),
  abstain: z.boolean().default(false),
  degraded: z.boolean().default(false),
  // Provenance of the typed decision: jev_systemone | jev_usejevai | llm_fallback | rule.
  // Kept so a demo/report can tell whether Jev actually ran (docs/21 §6.1.3).
  decisionSource: z.string().optional(),
  decisionAnalysis: DecisionAnalysisSchema.optional().catch(undefined),
  conversationId: z.string().trim().min(1).max(200).optional(),
  attachments: z.array(attachmentSchema).default([]),
});

export type Citation = z.infer<typeof citationSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export interface ChatResult {
  reply: string;
  intent?: string;
  intentId?: string;
  citations: Citation[];
  proposedAction: ProposedAction | null;
  abstain: boolean;
  degraded?: boolean;
  decisionSource?: string;
  decisionAnalysis?: DecisionAnalysis;
  conversationId?: string;
  attachments: Attachment[];
}
async function resolveActiveProviders(authorization: { revenueOpenPeriod?: string }): Promise<ActiveProviderConfig[]> {
  let activeProviders: ActiveProviderConfig[];
  try {
    activeProviders = authorization.revenueOpenPeriod ? [] : await getActiveProviderConfig();
  } catch {
    console.warn("[AIClient] Provider settings unavailable; using environment configuration");
    activeProviders = [];
  }
  if (!authorization.revenueOpenPeriod && activeProviders.length === 0) {
    const envKey = process.env.AI_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    const isMockTest = Boolean(envKey && !envKey.startsWith("AQ.") && !envKey.startsWith("AIzaSy"));

    if (isMockTest) {
      const baseUrl = process.env.AI_LLM_BASE_URL?.trim() || DEFAULT_GEMINI_PROVIDER.baseUrl;
      if (!baseUrl) {
        throw new Error(
          "AI_LLM_BASE_URL is required for an OpenAI-compatible key (no endpoint is built into source)"
        );
      }
      activeProviders = [{
        ...DEFAULT_GEMINI_PROVIDER,
        baseUrl,
        model: process.env.AI_LLM_MODEL?.trim() || DEFAULT_GEMINI_PROVIDER.model,
        apiKey: envKey!,
      }];
    } else {
      const pool = getRotatedKeyPool();
      if (pool.length === 0) {
        throw new Error(getGeminiKeyPool().length > 0
          ? "AI_PROVIDER_KEYS_COOLING_DOWN"
          : "AI_PROVIDER_KEYS_NOT_CONFIGURED");
      }
      const targetModel = process.env.AI_LLM_MODEL?.trim() || "gemini-3-flash-preview";
      activeProviders = pool.map((key, idx) => ({
        id: `google-gemini-slot-${idx + 1}`,
        name: `Google Gemini Direct (Slot ${idx + 1})`,
        type: "gemini",
        baseUrl: process.env.AI_LLM_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta",
        model: targetModel,
        apiKey: key,
        maxTokens: 2048,
        timeoutMs: 30000,
        priority: idx + 1,
      }));
    }
  }
  return activeProviders;
}

export async function chatWithAiService(
  message: string,
  userContext: UserContextPayload = {},
  conversationId?: string,
  authorization?: { requestId: string; delegationToken: string; revenueOpenPeriod?: string }
): Promise<ChatResult> {
  const deadlineAtMs = Date.now() + 15000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("AI_SERVICE_TIMEOUT"));
    }, 15000);
  });

  try {
    if (!authorization) throw new Error("SCOPED_GATEWAY_REQUIRED");
    return await Promise.race([deadline, (async (): Promise<ChatResult> => {
      let activeProviders = await resolveActiveProviders(authorization);
      controller.signal.throwIfAborted();
      const remainingMs = deadlineAtMs - Date.now();
      if (remainingMs <= 0) throw new Error("AI_SERVICE_TIMEOUT");
      activeProviders = activeProviders.map((provider) => ({
        ...provider,
        timeoutMs: Math.min(provider.timeoutMs, remainingMs),
      }));
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      warnIfServiceKeyMissing();
      if (process.env.AI_SERVICE_API_KEY) {
        headers["x-ai-service-key"] = process.env.AI_SERVICE_API_KEY;
      }
      const aiServiceUrl = (process.env.AI_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
      const response = await fetch(`${aiServiceUrl}/api/v1/authorized-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          deadlineAtMs,
          conversationId,
          requestId: authorization.requestId,
          revenueOpenPeriod: authorization.revenueOpenPeriod,
          delegationToken: authorization.delegationToken,
          // Server-owned callback origin; never selected by browser/context input.
          authorizationOrigin: process.env.AUTHORIZATION_SELF_ORIGIN?.replace(/\/+$/, ""),
          providerConfig: {
            configVersion: activeProviders[0]?.model ? `1-${activeProviders[0].model}` : 1,
            providers: activeProviders,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429 && activeProviders[0]?.apiKey) {
          markKeyRateLimited(activeProviders[0].apiKey);
        }
        let safetyBlocked = false;
        try {
          const errBody = (await response.json()) as Record<string, unknown>;
          extractAndMarkRateLimitedKeys(errBody, activeProviders);
          const detail = errBody?.detail;
          const detailCode = detail && typeof detail === "object" ? (detail as Record<string, unknown>).code : undefined;
          safetyBlocked = errBody.code === "SAFETY_BLOCKED" || errBody.code === "SAFETY" || detailCode === "SAFETY_BLOCKED" || detailCode === "SAFETY";
        } catch {
          // Invalid error JSON uses the generic availability fallback.
        }
        if (safetyBlocked) throw new WorkflowError(503, "SAFETY_BLOCKED", "Nội dung bị hệ thống an toàn chặn.");
        throw new Error("AI_SERVICE_HTTP_ERROR");
      }
      const rawJson = await response.json();
      extractAndMarkRateLimitedKeys(rawJson, activeProviders);
      const data = chatResultSchema.parse(rawJson);
      return {
        reply: data.reply,
        intent: data.intent,
        intentId: data.intentId,
        citations: data.citations,
        proposedAction: data.proposedAction ?? data.proposed_action ?? null,
        abstain: data.abstain,
        degraded: data.degraded,
        decisionSource: data.decisionSource,
        ...(data.decisionAnalysis ? { decisionAnalysis: data.decisionAnalysis } : {}),
        conversationId: data.conversationId ?? conversationId,
        attachments: data.attachments ?? [],
      };
    })()]);
  } catch (error: unknown) {
    // Upstream response bodies and error messages may contain credentials or PII.
    if (error instanceof WorkflowError && error.code === "SAFETY_BLOCKED") throw error;
    console.warn(`[AIClient] Request unavailable (${controller.signal.aborted ? "timeout 15s" : "service or response failure"})`);
    return {
      reply: "Hệ thống AI Service hiện đang bận hoặc chưa kết nối. Vui lòng thử lại sau giây lát hoặc liên hệ Quản lý cửa hàng (SM/AOM). Chưa có hành động nào được thực hiện.",
      intent: "UNKNOWN",
      intentId: "unknown",
      citations: [],
      proposedAction: null,
      abstain: true,
      degraded: true,
      conversationId,
      attachments: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamChatOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => Promise<void> | void;
  timeoutMs?: number;
}

export async function streamChatWithAiService(
  message: string,
  userContext: UserContextPayload = {},
  conversationId?: string,
  authorization?: { requestId: string; delegationToken: string; revenueOpenPeriod?: string },
  options?: StreamChatOptions
): Promise<ChatResult> {
  if (!authorization) throw new Error("SCOPED_GATEWAY_REQUIRED");
  const timeoutMs = options?.timeoutMs ?? 15000;
  const deadlineAtMs = Date.now() + timeoutMs;

  let timedOut = false;
  let callerAborted = false;
  let onDeltaError: unknown = undefined;
  let hasDeltaError = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cleanupFns: (() => void)[] = [() => clearTimeout(timer)];

  if (options?.signal) {
    if (options.signal.aborted) {
      callerAborted = true;
      clearTimeout(timer);
      controller.abort();
    } else {
      const onAbort = () => {
        callerAborted = true;
        controller.abort();
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      cleanupFns.push(() => options.signal?.removeEventListener("abort", onAbort));
    }
  }
  try {
    let activeProviders = await resolveActiveProviders(authorization);
    controller.signal.throwIfAborted();
    const remainingMs = deadlineAtMs - Date.now();
    if (remainingMs <= 0) {
      timedOut = true;
      throw new WorkflowError(504, "AI_SERVICE_TIMEOUT", "AI service timeout after 15s");
    }
    activeProviders = activeProviders.map((provider) => ({
      ...provider,
      timeoutMs: Math.min(provider.timeoutMs, remainingMs),
    }));

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    };
    warnIfServiceKeyMissing();
    if (process.env.AI_SERVICE_API_KEY) {
      headers["x-ai-service-key"] = process.env.AI_SERVICE_API_KEY;
    }

    const aiServiceUrl = (process.env.AI_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
    const request = {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        deadlineAtMs,
        conversationId,
        requestId: authorization.requestId,
        revenueOpenPeriod: authorization.revenueOpenPeriod,
        delegationToken: authorization.delegationToken,
        authorizationOrigin: process.env.AUTHORIZATION_SELF_ORIGIN?.replace(/\/+$/, ""),
        providerConfig: {
          configVersion: activeProviders[0]?.model ? `1-${activeProviders[0].model}` : 1,
          providers: activeProviders,
        },
      }),
      signal: controller.signal,
    };
    let response = await fetch(`${aiServiceUrl}/api/v1/authorized-chat/stream`, request);
    const legacyEndpoint = response.status === 404;
    if (legacyEndpoint) {
      // Older AI deployments expose the same scoped chat as a single response.
      await response.body?.cancel();
      response = await fetch(`${aiServiceUrl}/api/v1/authorized-chat`, {
        ...request, headers: { ...headers, Accept: "application/json" },
      });
    }

    if (!response.ok) {
      if (response.status === 429 && activeProviders[0]?.apiKey) {
        markKeyRateLimited(activeProviders[0].apiKey);
      }
      let errCode = "AI_SERVICE_UNAVAILABLE";
      try {
        const errBody = (await response.json()) as Record<string, unknown>;
        extractAndMarkRateLimitedKeys(errBody, activeProviders);
        if (typeof errBody?.code === "string") {
          if (errBody.code === "SAFETY_BLOCKED" || errBody.code === "SAFETY") {
            errCode = "SAFETY_BLOCKED";
          } else if (ErrorCodeSchema.safeParse(errBody.code).success) {
            errCode = errBody.code;
          }
        }
        const detail = errBody.detail;
        if (detail && typeof detail === "object" && "code" in detail &&
          (detail.code === "SAFETY_BLOCKED" || detail.code === "SAFETY")) errCode = "SAFETY_BLOCKED";
      } catch {}
      throw new WorkflowError(response.status >= 500 ? 503 : response.status, errCode, "AI service error");
    }

    if (legacyEndpoint) {
      return parseStreamChatResult(await response.json(), activeProviders, conversationId);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "AI service response is not an event stream");
    }

    if (!response.body) {
      throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "AI service response body is missing");
    }

    let receivedDone = false;
    let finalResult: ChatResult | null = null;

    const streamDeltaSchema = z.object({ delta: z.string() });
    const streamErrorSchema = z.object({ code: z.string().default("AI_SERVICE_UNAVAILABLE") });

    for await (const sseEvent of parseSseStream(response.body as AsyncIterable<Uint8Array>)) {
      if (sseEvent.event === "delta") {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(sseEvent.data);
        } catch {
          throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "Malformed delta frame from AI service");
        }
        const deltaResult = streamDeltaSchema.safeParse(parsedJson);
        if (!deltaResult.success || deltaResult.data.delta.length === 0) {
          throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "Invalid delta payload from AI service");
        }
        if (options?.onDelta) {
          try {
            await options.onDelta(deltaResult.data.delta);
          } catch (err: unknown) {
            onDeltaError = err;
            hasDeltaError = true;
            throw err;
          }
        }
      } else if (sseEvent.event === "done") {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(sseEvent.data);
        } catch {
          throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "Invalid done payload from AI service");
        }
        const rawResult =
          parsedJson && typeof parsedJson === "object" && "result" in parsedJson
            ? (parsedJson as { result: unknown }).result
            : parsedJson;
        finalResult = parseStreamChatResult(rawResult, activeProviders, conversationId);
        receivedDone = true;
        break;
      } else if (sseEvent.event === "error") {
        let errCode = "AI_SERVICE_UNAVAILABLE";
        try {
          const parsedJson = JSON.parse(sseEvent.data);
          if (parsedJson && typeof parsedJson === "object" && "code" in parsedJson && typeof parsedJson.code === "string") {
            if (parsedJson.code === "SAFETY_BLOCKED" || parsedJson.code === "SAFETY") {
              errCode = "SAFETY_BLOCKED";
            } else if (ErrorCodeSchema.safeParse(parsedJson.code).success) {
              errCode = parsedJson.code;
            }
          }
        } catch {
          errCode = "AI_SERVICE_UNAVAILABLE";
        }
        throw new WorkflowError(503, errCode, "AI service error event");
      }
    }

    if (!receivedDone || !finalResult) {
      throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "AI_SERVICE_STREAM_ABRUPT_EOF");
    }

    return finalResult;
  } catch (error: unknown) {
    controller.abort();
    if (timedOut) {
      throw new WorkflowError(504, "AI_SERVICE_TIMEOUT", "AI service timeout after 15s");
    }
    if (hasDeltaError) {
      throw onDeltaError;
    }
    if (callerAborted || options?.signal?.aborted) {
      throw error;
    }
    if (error instanceof WorkflowError) {
      throw error;
    }
    throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "AI_SERVICE_STREAM_ABRUPT_EOF");
  } finally {
    for (const cleanup of cleanupFns) cleanup();
  }
}

function parseStreamChatResult(rawResult: unknown, providers: ActiveProviderConfig[], conversationId?: string): ChatResult {
  extractAndMarkRateLimitedKeys(rawResult, providers);
  const data = chatResultSchema.parse(rawResult && typeof rawResult === "object"
    ? { ...rawResult, citations: [], proposedAction: null, proposed_action: null, attachments: [] }
    : rawResult);
  return {
    reply: data.reply, intent: data.intent, intentId: data.intentId,
    abstain: data.abstain, degraded: data.degraded, decisionSource: data.decisionSource,
    ...(data.decisionAnalysis ? { decisionAnalysis: data.decisionAnalysis } : {}),
    conversationId: data.conversationId ?? conversationId,
    citations: [], proposedAction: null, attachments: [],
  };
}
