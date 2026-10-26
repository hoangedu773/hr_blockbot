import { z } from "zod";
import { getActiveProviderConfig, ActiveProviderConfig } from "./settings.service.js";

export const DEFAULT_GEMINI_PROVIDER: ActiveProviderConfig = {
  id: "gemini-3.8-flash-tunnel",
  name: "Gemini 3.8 Flash Proxy",
  type: "openai_compatible",
  baseUrl: "https://rbnvqls.abc-tunnel.us/v1",
  model: "ag/gemini-3.8-flash-low",
  apiKey: "",
  maxTokens: 1024,
  timeoutMs: 15000,
  priority: 1,
};

export const MODEL_TIER_MAP = {
  low: "ag/gemini-3.8-flash-low",
  medium: "ag/gemini-3.8-flash-medium",
  high: "ag/gemini-3.8-flash-high",
} as const;

export const GEMINI_DIRECT_TIER_MAP = {
  low: "gemini-3.1-flash-lite",
  medium: "gemini-3.5-flash",
  high: "gemini-3.8-flash",
} as const;

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

let keyRotationCounter = 0;
export function getRotatedKeyPool(): string[] {
  const pool = getGeminiKeyPool();
  if (pool.length <= 1) return pool;
  const start = keyRotationCounter % pool.length;
  keyRotationCounter = (keyRotationCounter + 1) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

export type ModelTier = keyof typeof MODEL_TIER_MAP;

export interface ChatOptions {
  modelTier?: ModelTier;
}
export interface UserContextPayload {
  userId?: string | null;
  role?: "Admin" | "Employee";
  employeeId?: string | null;
  departmentId?: string | null;
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
  conversationId?: string;
  attachments: Attachment[];
}

export async function chatWithAiService(
  message: string,
  userContext: UserContextPayload = {},
  conversationId?: string,
  options: ChatOptions = {}
): Promise<ChatResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("AI_SERVICE_TIMEOUT"));
    }, 15000);
  });

  try {
    return await Promise.race([deadline, (async (): Promise<ChatResult> => {
      let activeProviders: ActiveProviderConfig[];
      try {
        activeProviders = await getActiveProviderConfig();
      } catch {
        console.warn("[AIClient] Provider settings unavailable; using environment configuration");
        activeProviders = [];
      }
      controller.signal.throwIfAborted();
      if (activeProviders.length === 0) {
        const envKey = process.env.AI_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
        const isMockTest = Boolean(envKey && !envKey.startsWith("AQ.") && !envKey.startsWith("AIzaSy"));

        if (isMockTest) {
          activeProviders = [{
            ...DEFAULT_GEMINI_PROVIDER,
            baseUrl: process.env.AI_LLM_BASE_URL?.trim() || DEFAULT_GEMINI_PROVIDER.baseUrl,
            model: process.env.AI_LLM_MODEL?.trim() || DEFAULT_GEMINI_PROVIDER.model,
            apiKey: envKey!,
          }];
        } else {
          // Google Gemini Direct: Multi-Key Pool & Multi-Model Failover
          const pool = getRotatedKeyPool();
          const targetModel = options.modelTier
            ? GEMINI_DIRECT_TIER_MAP[options.modelTier]
            : (process.env.AI_LLM_MODEL?.trim() || "gemini-3.5-flash");

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

          // Multi-model resilience: nếu yêu cầu High Tier (gemini-3.8-flash), thêm fallback gemini-3.5-flash
          if (targetModel === "gemini-3.8-flash" && pool.length > 0) {
            activeProviders.push({
              id: "google-gemini-fallback-3.5",
              name: "Google Gemini 3.5 Flash Fallback",
              type: "gemini",
              baseUrl: "https://generativelanguage.googleapis.com/v1beta",
              model: "gemini-3.5-flash",
              apiKey: pool[0],
              maxTokens: 2048,
              timeoutMs: 30000,
              priority: activeProviders.length + 1,
            });
          }
        }
      } else if (options.modelTier && activeProviders.length > 0) {
        activeProviders = activeProviders.map((provider) => {
          const tierMap = provider.type === "gemini" ? GEMINI_DIRECT_TIER_MAP : MODEL_TIER_MAP;
          return {
            ...provider,
            model: tierMap[options.modelTier!],
          };
        });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Connection": "keep-alive",
        "Keep-Alive": "timeout=15, max=1000",
      };
      if (process.env.AI_SERVICE_API_KEY) {
        headers["x-ai-service-key"] = process.env.AI_SERVICE_API_KEY;
      }
      const aiServiceUrl = (process.env.AI_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
      const response = await fetch(`${aiServiceUrl}/api/v1/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          conversationId,
          userContext: {
            userId: userContext.userId ?? undefined,
            role: userContext.role ?? "Employee",
            employeeId: userContext.employeeId ?? undefined,
            departmentId: userContext.departmentId ?? undefined,
          },
          providerConfig: {
            configVersion: activeProviders[0]?.model ? `1-${activeProviders[0].model}` : 1,
            providers: activeProviders,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("AI_SERVICE_HTTP_ERROR");
      }
      const data = chatResultSchema.parse(await response.json());
      return {
        reply: data.reply,
        intent: data.intent,
        intentId: data.intentId,
        citations: data.citations,
        proposedAction: data.proposedAction ?? data.proposed_action ?? null,
        abstain: data.abstain,
        degraded: data.degraded,
        conversationId: data.conversationId ?? conversationId,
        attachments: data.attachments ?? [],
      };
    })()]);
  } catch {
    // Upstream response bodies and error messages may contain credentials or PII.
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
