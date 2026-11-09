import { RevenueKpiAiProposalRequestSchema, RevenueKpiAiProposalSchema } from '@hr-blockbot/contracts';
import { z } from 'zod';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { computeStoreRevenue, priorMonth, periodRangeVN, round2 } from './revenue-kpi-calc.service.js';
import { revenueKpiAiContext, storeRevenueKpiProposal } from './revenue-kpi.service.js';
import { getActiveProviderConfig } from './settings.service.js';
import { getRotatedKeyPool, DEFAULT_GEMINI_PROVIDER } from './ai-client.service.js';
import { WorkflowError } from './project-workflow.service.js';
import { digest } from './project-audit.service.js';
const answerSchema = z.object({ suggestedGrowthPercent: z.number().finite().min(-20).max(30), rationale: z.string().trim().min(1).max(2000), confidence: z.enum(['low', 'medium', 'high']), model: z.string().max(120).optional(), degraded: z.boolean().optional() }).strict();
const clamp = (n: number, min = -20, max = 30) => Math.min(max, Math.max(min, n));
export function revenueEnvironmentProviders(env: Record<string, string | undefined>, pool: string[]) {
  const key = env.AI_LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  if (key && !key.startsWith('AQ.') && !key.startsWith('AIzaSy')) {
    if (!env.AI_LLM_BASE_URL?.trim()) return [];
    return [{ ...DEFAULT_GEMINI_PROVIDER, id: 'revenue-compatible', apiKey: key, type: 'openai_compatible', baseUrl: env.AI_LLM_BASE_URL.trim(), model: env.AI_LLM_MODEL?.trim() || DEFAULT_GEMINI_PROVIDER.model, timeoutMs: 15000, maxTokens: 600 }];
  }
  return pool.map((apiKey, i) => ({ id: 'revenue-slot-' + i, name: 'Revenue proposal', apiKey, type: 'gemini', baseUrl: env.AI_LLM_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta', model: env.AI_LLM_MODEL?.trim() || 'gemini-3-flash-preview', priority: i + 1, timeoutMs: 15000, maxTokens: 600 }));
}
export function revenueProposalBaseline(months: { period: string; revenueVnd: number; orderCount: number }[]) {
  const rates = months.slice(1).map((m, i) => (m.revenueVnd - months[i].revenueVnd) / months[i].revenueVnd * 100);
  const mean = rates.reduce((n, r) => n + r, 0) / rates.length;
  const volatility = Math.sqrt(rates.reduce((n, r) => n + (r - mean) ** 2, 0) / rates.length);
  return { baselinePercent: round2(clamp(mean)), allowedMinPercent: round2(clamp(mean - Math.max(2, volatility))), allowedMaxPercent: round2(clamp(mean + Math.max(2, volatility))) };
}
export async function fetchRevenueProposal(payload: any, transport: { origin?: string; key?: string; providerConfig?: unknown; timeoutMs?: number } = {}) {
  const baseline = payload.baselinePercent;
  const fallback = { suggestedGrowthPercent: baseline, rationale: 'Đề xuất dự phòng theo xu hướng doanh thu ba tháng; HR cần xem xét.', confidence: 'low' as const, degraded: true, model: 'deterministic-trend-v1' };
  const origin = transport.origin ?? process.env.AI_SERVICE_URL, key = transport.key ?? process.env.AI_SERVICE_API_KEY;
  if (!origin || !key) return fallback;
  try {
    const response = await fetch(origin.replace(/\/+$/, '') + '/api/v1/kpi/propose-target', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ai-service-key': key },
      body: JSON.stringify({ ...payload, providerConfig: transport.providerConfig ?? null }), signal: AbortSignal.timeout(transport.timeoutMs ?? 20000) });
    if (!response.ok) { console.warn(`[RevenueKpiAI] Request failed with status ${response.status}; using fallback`); return fallback; }
    const parsed = answerSchema.safeParse(await response.json());
    if (!parsed.success) { console.warn('[RevenueKpiAI] Invalid response schema; using fallback'); return fallback; }
    return { ...parsed.data, suggestedGrowthPercent: round2(clamp(parsed.data.suggestedGrowthPercent, payload.allowedMinPercent, payload.allowedMaxPercent)), degraded: parsed.data.degraded ?? false, model: parsed.data.model ?? 'configured-llm' };
  } catch (error) { console.warn(`[RevenueKpiAI] Request failed (${error instanceof Error ? error.name : typeof error}); using fallback`); return fallback; }
}
export async function proposeRevenueTarget(user: AuthenticatedUser, id: string, raw: unknown) {
  const input = RevenueKpiAiProposalRequestSchema.parse(raw), { a, p } = await revenueKpiAiContext(user, id);
  const replay = a.history.find(h => h.requestId === input.clientRequestId);
  if (replay) { if (replay.by !== user.userId || replay.action !== 'AI_PROPOSAL' || replay.payloadHash !== digest(input)) throw new WorkflowError(409, 'REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng với nội dung khác.'); return a; }
  if (input.expectedVersion !== a.version) throw new WorkflowError(409, 'REVENUE_KPI_VERSION_CONFLICT', 'Mục tiêu đã thay đổi; tải lại trước khi lấy đề xuất.');
  const allMonths = [], kinds = new Set();
  const effectivePolicy = p.policy.allowDemoData ? p.policy : { ...p.policy, allowDemoData: true };
  for (const step of [4, 3, 2, 1]) { const period = priorMonth(a.period, step); if (new Date() < periodRangeVN(period).end) continue; const r = await computeStoreRevenue(a.storeId!, period, effectivePolicy); if (r.actualRevenueVnd !== null && r.actualRevenueVnd > 0 && !r.invalidOrderCount) { allMonths.push({ period, revenueVnd: r.actualRevenueVnd, orderCount: r.orderCount }); kinds.add(r.dataKind); } }
  const months = allMonths.slice(-3);
  let proposal;
  if (months.length !== 3 || kinds.size !== 1) proposal = { suggestedGrowthPercent: null, rangeMinPercent: null, rangeMaxPercent: null, rationale: 'Chưa đủ ba tháng hoàn chỉnh cùng nguồn. HR có thể nhập mục tiêu trực tiếp.', confidence: null, model: null, degraded: true, insufficientData: true, dataMonths: months.length, generatedAt: new Date().toISOString() };
  else {
    const range = revenueProposalBaseline(months); let providers: any[] = [];
    try { providers = await getActiveProviderConfig(); } catch { console.warn('[RevenueKpiAI] Provider settings unavailable; using environment configuration'); }
    if (!providers.length) providers = revenueEnvironmentProviders(process.env, getRotatedKeyPool());
    const transportProviders = providers.map(({ name: _displayName, ...provider }) => provider);
    const r = await fetchRevenueProposal({ unitType: 'STORE', months, ...range }, { providerConfig: providers.length ? { configVersion: 'revenue-target-v1', providers: transportProviders } : null });
    proposal = { ...r, rangeMinPercent: range.allowedMinPercent, rangeMaxPercent: range.allowedMaxPercent, insufficientData: false, dataMonths: 3, generatedAt: new Date().toISOString() };
  }
  return storeRevenueKpiProposal(user, id, input, RevenueKpiAiProposalSchema.parse(proposal));
}
