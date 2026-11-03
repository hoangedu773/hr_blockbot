import { KpiAnalysisSchema, type KpiAnalysis } from "@hr-blockbot/contracts";
import { getActiveProviderConfig, type ActiveProviderConfig } from "./settings.service.js";
import { getRotatedKeyPool, DEFAULT_GEMINI_PROVIDER } from "./ai-client.service.js";
import { WorkflowError } from "./project-workflow.service.js";

/**
 * F5 semantic review analysis. Only the two review texts cross the boundary;
 * employee identity, scores, salary and project data never leave the API.
 */
async function resolveProviders(): Promise<ActiveProviderConfig[]> {
  try {
    const active = await getActiveProviderConfig();
    if (active.length) return active;
  } catch { /* fall through to environment configuration */ }
  const pool = getRotatedKeyPool();
  if (pool.length) {
    const targetModel = process.env.AI_LLM_MODEL?.trim() || "gemini-3-flash-preview";
    return pool.map((key, index) => ({
      id: `google-gemini-slot-${index + 1}`, name: `Google Gemini Direct (Slot ${index + 1})`,
      type: "gemini", baseUrl: process.env.AI_LLM_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta",
      model: targetModel, apiKey: key, maxTokens: 1024, timeoutMs: 20000, priority: index + 1,
    }));
  }
  const envKey = process.env.AI_LLM_API_KEY?.trim();
  const baseUrl = process.env.AI_LLM_BASE_URL?.trim();
  if (envKey && baseUrl) return [{ ...DEFAULT_GEMINI_PROVIDER, baseUrl, apiKey: envKey }];
  return [];
}

export async function analyzeKpiReviews(input: { selfReview: string; managerReview: string }): Promise<KpiAnalysis> {
  const origin = (process.env.AI_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
  const key = process.env.AI_SERVICE_API_KEY;
  if (!key) throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "AI service key is not configured.");
  const providers = await resolveProviders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${origin}/api/v1/kpi/analyze-review`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-ai-service-key": key },
      body: JSON.stringify({
        reviews: [{ role: "self", text: input.selfReview }, { role: "manager", text: input.managerReview }],
        providerConfig: providers.length ? { configVersion: `1-${providers[0].model}`, providers } : null,
      }),
    });
    if (!response.ok) throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "Dịch vụ phân tích ngữ nghĩa chưa sẵn sàng; thử lại sau.");
    const parsed = KpiAnalysisSchema.safeParse(await response.json());
    if (!parsed.success) throw new WorkflowError(503, "AI_INVALID_RESPONSE", "Phân tích ngữ nghĩa không đúng hợp đồng; chưa ghi điểm.");
    return parsed.data;
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "Không kết nối được dịch vụ phân tích ngữ nghĩa; thử lại sau.");
  } finally { clearTimeout(timer); }
}
