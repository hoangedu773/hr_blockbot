import { Router } from 'express';
import { z } from 'zod';
import { RevenueKpiMonthSchema } from '@hr-blockbot/contracts';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { endpoint } from '../lib/endpoint.js';
import { WorkflowError } from '../services/project-workflow.service.js';
import * as S from '../services/revenue-kpi.service.js';
import { proposeRevenueTarget } from '../services/revenue-kpi-ai.service.js';
const router = Router();
router.use('/revenue-kpi', authenticateToken);
router.get('/revenue-kpi/config', endpoint(async (_req, res) => { res.json({ enabled: S.revenueKpiEnabled() }); }));
router.use('/revenue-kpi', (_req, res, next) => { if (!S.revenueKpiEnabled()) { res.status(503).json({ error: { code: 'REVENUE_KPI_DISABLED', message: 'KPI doanh thu chưa được bật.' } }); return; } next(); });
router.get('/revenue-kpi/periods', endpoint(async (req, res) => { res.json(await S.listRevenueKpiPeriods(req.user!)); }));
router.post('/revenue-kpi/periods', endpoint(async (req, res) => { res.status(201).json(await S.createRevenueKpiPeriod(req.user!, req.body)); }));
router.get('/revenue-kpi/dashboard', endpoint(async (req, res) => { const { period } = z.object({ period: RevenueKpiMonthSchema }).strict().parse(req.query); res.json(await S.revenueKpiDashboard(req.user!, period)); }));
router.get('/revenue-kpi/periods/:period', endpoint(async (req, res) => { res.json(await S.revenueKpiDashboard(req.user!, String(req.params.period))); }));
router.get('/revenue-kpi/periods/:period/assignments', endpoint(async (req, res) => { res.json({ items: (await S.revenueKpiDashboard(req.user!, String(req.params.period))).assignments }); }));
for (const [action, fn] of [['compute', S.computeRevenueKpiPeriod], ['close', S.closeRevenueKpiPeriod]] as const)
  router.post('/revenue-kpi/periods/:period/' + action, endpoint(async (req, res) => { res.json(await fn(req.user!, String(req.params.period), req.body)); }));
// Bulk open must never write before HR has reviewed a preview. The legacy
// one-shot route stays only as an explicit, operator-enabled compatibility
// endpoint; first-party Web and chat use open-preview -> open-proposal -> decision.
router.post('/revenue-kpi/periods/:period/open', endpoint(async (req, res) => {
  if (process.env.REVENUE_KPI_LEGACY_OPEN !== 'true')
    throw new WorkflowError(410, 'REVENUE_KPI_CONFIRM_REQUIRED', 'Mở kỳ cần xem trước và xác nhận. Dùng bản xem trước mở kỳ.');
  res.json(await S.openRevenueKpiPeriod(req.user!, String(req.params.period), req.body));
}));
router.get('/revenue-kpi/periods/:period/open-preview', endpoint(async (req, res) => {
  res.set('Cache-Control', 'private, no-store').json(await S.planRevenueKpiPeriodOpen(req.user!, String(req.params.period)));
}));
router.post('/revenue-kpi/periods/:period/open-proposal', endpoint(async (req, res) => {
  z.object({}).strict().parse(req.body);
  res.set('Cache-Control', 'private, no-store').json(await S.proposeRevenueKpiPeriodOpen(req.user!, String(req.params.period)));
}));
router.post('/revenue-kpi/assignments', endpoint(async (req, res) => { res.json(await S.saveRevenueKpiAssignment(req.user!, req.body)); }));
for (const action of ['publish', 'accept', 'refuse', 'hr-decision', 'adjustment-request', 'adjustment-verify', 'adjustment-decision', 'responsibility'])
  router.post('/revenue-kpi/assignments/:id/' + action, endpoint(async (req, res) => { res.json(await S.mutateRevenueKpiAssignment(req.user!, String(req.params.id), action, req.body)); }));
router.post('/revenue-kpi/assignments/:id/ai-proposal', endpoint(async (req, res) => { res.json(await proposeRevenueTarget(req.user!, String(req.params.id), req.body)); }));
router.get('/revenue-kpi/assignments/:id/result', endpoint(async (req, res) => { res.json(await S.revenueKpiAssignmentResult(req.user!, String(req.params.id))); }));
for (const action of ['miss-reason', 'review-reason', 'confirm', 'correct'])
  router.post('/revenue-kpi/results/:id/' + action, endpoint(async (req, res) => { res.json(await S.mutateRevenueKpiResult(req.user!, String(req.params.id), action, req.body)); }));
export default router;
