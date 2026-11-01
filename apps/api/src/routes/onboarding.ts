import { Router, type Request } from "express";
import { z } from "zod";
import { OnboardingReviewSchema, ActivationRequestSchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
import { createOnboarding, reviewOnboarding, pageOnboarding, getOnboarding, resubmitOnboarding, resumeOnboarding, submitOnboarding, activateOnboarding, onboardingDto, type OnboardingOptions } from "../services/onboarding.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import { completePasswordRecovery } from "../services/password-recovery.service.js";
const router = Router();
const options = (request: Request): OnboardingOptions => request.app.locals.onboardingOptions ?? {};
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const value = schema.safeParse(input);
  if (!value.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Nội dung hoặc phiên bản yêu cầu không hợp lệ.");
  return value.data;
};
router.get("/onboarding", authenticateToken, endpoint(async (req, res) => { res.json(await pageOnboarding(req.user!, req.query)); }));
router.get("/onboarding/:id", authenticateToken, endpoint(async (req, res) => { res.json(await getOnboarding(req.user!, req.params.id)); }));
router.post("/onboarding/:id/resubmit", authenticateToken, endpoint(async (req, res) => { res.json(onboardingDto(await resubmitOnboarding(req.user!, req.params.id, req.body))); }));
router.post("/onboarding", authenticateToken, endpoint(async (req, res) => {
  const draft = req.user!.authorization?.profile === "hr";
  res.status(201).json(onboardingDto(await createOnboarding(req.user!, req.body, draft)));
}));
router.post("/onboarding/:id/submit", authenticateToken, endpoint(async (req, res) => {
  const body = parse(z.object({ expectedVersion: z.number().int().positive() }).strict(), req.body);
  res.json(onboardingDto(await submitOnboarding(req.user!, req.params.id, body.expectedVersion)));
}));
router.post("/onboarding/:id/review", authenticateToken, endpoint(async (req, res) => {
  res.json(onboardingDto(await reviewOnboarding(req.user!, req.params.id, parse(OnboardingReviewSchema, req.body), options(req))));
}));
router.post("/onboarding/:id/resume", authenticateToken, endpoint(async (req, res) => {
  res.json(onboardingDto(await resumeOnboarding(req.user!, req.params.id, options(req))));
}));
// Public token endpoint, not a second login system. Never returns a password or an access token.
router.post("/auth/activate", endpoint(async (req, res) => {
  const body = parse(ActivationRequestSchema, req.body);
  await activateOnboarding(body.token, body.newPassword, options(req));
  res.status(204).end();
}));
router.post("/auth/recover-password", endpoint(async (req, res) => {
  const body = parse(ActivationRequestSchema, req.body);
  await completePasswordRecovery(body.token, body.newPassword, req.app.locals.recoveryOptions);
  res.status(204).end();
}));
export default router;
