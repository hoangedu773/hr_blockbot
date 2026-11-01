import { Router } from "express";
import { z } from "zod";
import { ActivationRequestSchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import { createLifecycle, reviewLifecycle, confirmLifecycle, resumeLifecycle, activateLifecycle, pageLifecycle, getLifecycle, lifecycleDto } from "../services/employee-lifecycle.service.js";
const router = Router();
router.use("/employee-lifecycle", authenticateToken, (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
router.get("/employee-lifecycle", endpoint(async (req, res) => { res.json(await pageLifecycle(req.user!, req.query)); }));
router.get("/employee-lifecycle/:id", endpoint(async (req, res) => { res.json(await getLifecycle(req.user!, req.params.id)); }));
router.post("/employee-lifecycle", endpoint(async (req, res) => { res.status(201).json(lifecycleDto(await createLifecycle(req.user!, req.body))); }));
router.post("/employee-lifecycle/:id/review", endpoint(async (req, res) => { res.json(lifecycleDto(await reviewLifecycle(req.user!, req.params.id, req.body, req.app.locals.onboardingOptions))); }));
router.post("/employee-lifecycle/:id/confirm-store", endpoint(async (req, res) => {
  const parsed = z.object({ storeId: z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase()), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần cửa hàng canonical, lý do và phiên bản.");
  res.json(lifecycleDto(await confirmLifecycle(req.user!, req.params.id, parsed.data.storeId, parsed.data.expectedVersion, parsed.data.reason)));
}));
router.post("/employee-lifecycle/:id/resume", endpoint(async (req, res) => { res.json(lifecycleDto(await resumeLifecycle(req.user!, req.params.id, req.app.locals.onboardingOptions))); }));
router.post("/auth/reactivate", endpoint(async (req, res) => {
  const parsed = ActivationRequestSchema.safeParse(req.body); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Lời mời/mật khẩu không hợp lệ.");
  await activateLifecycle(parsed.data.token, parsed.data.newPassword, req.app.locals.onboardingOptions); res.status(204).end();
}));
export default router;
