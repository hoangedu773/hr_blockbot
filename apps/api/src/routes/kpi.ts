import { Router } from "express";
import {
  KpiAnalyzeSchema, KpiManagerReviewSchema, KpiOpenPeriodSchema, KpiOverrideSchema,
  KpiPeriodSchema, KpiPublishSchema, KpiSelfReviewSchema,
} from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint } from "../lib/endpoint.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import {
  analyzeEvaluation, currentPeriod, kpiDashboard, listDepartment, listMine, openPeriod,
  overrideEvaluation, publishEvaluation, saveManagerReview, saveSelfReview,
} from "../services/kpi.service.js";

const router = Router();
const parse = <T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, value: unknown, message: string): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new WorkflowError(400, "VALIDATION_FAILED", message);
  return result.data as T;
};
const period = (value: unknown): string => parse(KpiPeriodSchema, value ?? currentPeriod(), "Kỳ KPI không hợp lệ (YYYY-MM).");

router.get("/kpi/me", authenticateToken, endpoint(async (req, res) => {
  const target = req.query.period === undefined ? undefined : period(req.query.period);
  res.json({ items: await listMine(req.user!, target) });
}));

router.get("/kpi/department", authenticateToken, endpoint(async (req, res) => {
  const target = period(req.query.period);
  res.json({ period: target, items: await listDepartment(req.user!, target) });
}));

router.get("/kpi/dashboard", authenticateToken, endpoint(async (req, res) => {
  res.json(await kpiDashboard(req.user!, period(req.query.period)));
}));

router.post("/kpi/periods/open", authenticateToken, endpoint(async (req, res) => {
  const input = parse(KpiOpenPeriodSchema, req.body, "Kỳ mở đánh giá không hợp lệ.");
  res.status(201).json(await openPeriod(req.user!, input.period));
}));

router.post("/kpi/:id/self-review", authenticateToken, endpoint(async (req, res) => {
  const input = parse(KpiSelfReviewSchema, req.body, "Nội dung tự nhận xét không hợp lệ.");
  res.json(await saveSelfReview(req.user!, req.params.id, input));
}));

router.post("/kpi/:id/manager-review", authenticateToken, endpoint(async (req, res) => {
  const input = parse(KpiManagerReviewSchema, req.body, "Nhận xét quản lý hoặc điểm quản lý không hợp lệ.");
  res.json(await saveManagerReview(req.user!, req.params.id, input));
}));

router.post("/kpi/:id/analyze", authenticateToken, endpoint(async (req, res) => {
  const input = parse(KpiAnalyzeSchema, req.body, "Yêu cầu phân tích không hợp lệ.");
  res.json(await analyzeEvaluation(req.user!, req.params.id, input.expectedVersion));
}));

router.post("/kpi/:id/publish", authenticateToken, endpoint(async (req, res) => {
  const input = parse(KpiPublishSchema, req.body, "Yêu cầu công bố không hợp lệ.");
  res.json(await publishEvaluation(req.user!, req.params.id, input));
}));

router.post("/kpi/:id/override", authenticateToken, endpoint(async (req, res) => {
  const input = parse(KpiOverrideSchema, req.body, "Yêu cầu hiệu chỉnh không hợp lệ.");
  res.json(await overrideEvaluation(req.user!, req.params.id, input));
}));

export default router;
