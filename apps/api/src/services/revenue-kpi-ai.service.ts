import { RevenueKpiAiProposalRequestSchema, RevenueKpiAiProposalSchema } from '@hr-blockbot/contracts';
import { z } from 'zod';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { computeStoreRevenue, priorMonth, periodRangeVN, round2 } from './revenue-kpi-calc.service.js';
import { revenueKpiAiContext, storeRevenueKpiProposal } from './revenue-kpi.service.js';
import { getActiveProviderConfig } from './settings.service.js';
import { getRotatedKeyPool, DEFAULT_GEMINI_PROVIDER } from './ai-client.service.js';
const answerSchema = z.object({ suggestedGrowthPercent: z.number().finite().min(-20).max(30), rationale: z.string().trim().min(1).max(2000), confidence: z.enum(['low', 'medium', 'high']), model: z.string().max(120).optional(), degraded: z.boolean().optional() }).strict();
const clamp = (n: number, min = -20, max = 30) => Math.min(max, Math.max(min, n));
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
    if (!response.ok) return fallback;
    const parsed = answerSchema.safeParse(await response.json()); if (!parsed.success) return fallback;
    return { ...parsed.data, suggestedGrowthPercent: round2(clamp(parsed.data.suggestedGrowthPercent, payload.allowedMinPercent, payload.allowedMaxPercent)), degraded: parsed.data.degraded ?? false, model: parsed.data.model ?? 'configured-llm' };
  } catch { return fallback; }
}
export async function proposeRevenueTarget(user: AuthenticatedUser, id: string, raw: unknown) {
  const input = RevenueKpiAiProposalRequestSchema.parse(raw), { a, p } = await revenueKpiAiContext(user, id);
  const months = [], kinds = new Set();
  for (const step of [3, 2, 1]) { const period = priorMonth(a.period, step); if (new Date() < periodRangeVN(period).end) continue; const r = await computeStoreRevenue(a.storeId!, period, p.policy); if (r.actualRevenueVnd !== null && r.actualRevenueVnd > 0 && !r.invalidOrderCount) { months.push({ period, revenueVnd: r.actualRevenueVnd, orderCount: r.orderCount }); kinds.add(r.dataKind); } }
  let proposal;
  if (months.length !== 3 || kinds.size !== 1) proposal = { suggestedGrowthPercent: null, rangeMinPercent: null, rangeMaxPercent: null, rationale: 'Chưa đủ ba tháng hoàn chỉnh cùng nguồn. HR có thể nhập mục tiêu trực tiếp.', confidence: null, model: null, degraded: true, insufficientData: true, dataMonths: months.length, generatedAt: new Date().toISOString() };
  else {
    const range = revenueProposalBaseline(months); let providers: any[] = [];
    try { providers = await getActiveProviderConfig(); } catch { /* environment fallback below */ }
    if (!providers.length) providers = getRotatedKeyPool().map((apiKey, i) => ({ ...DEFAULT_GEMINI_PROVIDER, id: 'revenue-slot-' + i, apiKey, priority: i + 1, timeoutMs: 15000, maxTokens: 600 }));
    const r = await fetchRevenueProposal({ unitType: 'STORE', months, ...range }, { providerConfig: providers.length ? { configVersion: 'revenue-target-v1', providers } : null });
    proposal = { ...r, rangeMinPercent: range.allowedMinPercent, rangeMaxPercent: range.allowedMaxPercent, insufficientData: false, dataMonths: 3, generatedAt: new Date().toISOString() };
  }
  return storeRevenueKpiProposal(user, id, input, RevenueKpiAiProposalSchema.parse(proposal));
}
