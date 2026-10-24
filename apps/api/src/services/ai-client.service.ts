import { getActiveProviderConfig, ActiveProviderConfig } from "./settings.service.js";

export const DEFAULT_GEMINI_PROVIDER: ActiveProviderConfig = {
  id: "gemini-3.8-flash-tunnel",
  name: "Gemini 3.8 Flash Proxy",
  type: "openai_compatible",
  baseUrl: "https://rbnvqls.abc-tunnel.us/v1",
  model: "ag/gemini-3.8-flash",
  apiKey: "sk-6391717b21217848-40w3qp-d43413fb",
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

export interface Citation {
  document: string;
  version: string;
  article: string;
  score: number;
}

export interface ProposedAction {
  actionId?: string;
  type: string;
  args?: Record<string, unknown>;
  preview?: string;
  [key: string]: unknown;
}

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
  const aiServiceUrl = (process.env.AI_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
  const aiServiceApiKey = process.env.AI_SERVICE_API_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    let activeProviders = await getActiveProviderConfig().catch(() => []);
    if (!activeProviders || activeProviders.length === 0) {
      activeProviders = [DEFAULT_GEMINI_PROVIDER];
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (aiServiceApiKey) {
      headers["x-ai-service-key"] = aiServiceApiKey;
    }

    const body = {
      message,
      conversationId,
      userContext: {
        userId: userContext.userId ?? undefined,
        role: userContext.role ?? "Employee",
        employeeId: userContext.employeeId ?? undefined,
        departmentId: userContext.departmentId ?? undefined,
      },
      providerConfig: {
        configVersion: 1,
        providers: activeProviders,
      },
    };

    const response = await fetch(`${aiServiceUrl}/api/v1/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.warn(`[AIClient] Service responded with HTTP ${response.status}`, errorData);
      return {
        reply:
          "Hệ thống AI Service hiện chưa thể phản hồi lúc này. Vui lòng thử lại sau giây lát hoặc liên hệ Quản lý cửa hàng (SM/AOM).",
        intent: "UNKNOWN",
        intentId: "unknown",
        citations: [],
        proposedAction: null,
        abstain: true,
        degraded: true,
        conversationId,
      };
    }

    const data = (await response.json()) as any;
    return {
      reply: data.reply || "",
      intent: data.intent || "UNKNOWN",
      intentId: data.intentId || "unknown",
      citations: Array.isArray(data.citations) ? data.citations : [],
      proposedAction: data.proposedAction ?? data.proposed_action ?? null,
      abstain: Boolean(data.abstain),
      degraded: Boolean(data.degraded),
      conversationId: data.conversationId || conversationId,
    };
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    console.warn(`[AIClient] Request failed (${isTimeout ? "timeout 15s" : err?.message})`);
    return {
      reply:
        "Hệ thống AI Service hiện tại đang bận hoặc chưa khởi động. Vui lòng thử lại sau giây lát hoặc liên hệ Quản lý cửa hàng (SM/AOM).",
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
