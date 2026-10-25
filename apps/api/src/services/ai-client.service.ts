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
});

export type Citation = z.infer<typeof citationSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;
export interface ChatResult {
  reply: string;
  intent?: string;
  intentId?: string;
  citations: Citation[];
  proposedAction: ProposedAction | null;
  abstain: boolean;
  degraded?: boolean;
  conversationId?: string;
}

export async function chatWithAiService(
  message: string,
  userContext: UserContextPayload = {},
  conversationId?: string
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
        const apiKey = process.env.AI_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
        activeProviders = apiKey ? [{
          ...DEFAULT_GEMINI_PROVIDER,
          baseUrl: process.env.AI_LLM_BASE_URL?.trim() || DEFAULT_GEMINI_PROVIDER.baseUrl,
          model: process.env.AI_LLM_MODEL?.trim() || DEFAULT_GEMINI_PROVIDER.model,
          apiKey,
        }] : [];
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
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
          providerConfig: { configVersion: 1, providers: activeProviders },
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
    };
  } finally {
    clearTimeout(timer);
  }
}
