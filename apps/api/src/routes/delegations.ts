import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as workflowEndpoint } from "../lib/endpoint.js";
import { createDelegation, delegationDto, delegationRecipients, pageDelegations, getDelegation, reviewDelegation, revokeDelegation } from "../services/delegation.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
const router = Router();
router.use("/delegations", authenticateToken, (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
router.get("/delegations", workflowEndpoint(async (req, res) => { res.json(await pageDelegations(req.user!, req.query)); }));
router.get("/delegations/recipients", workflowEndpoint(async (req, res) => {
  if (typeof req.query.storeId !== "string" || !/^[a-f0-9]{24}$/i.test(req.query.storeId)) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần storeId canonical.");
  res.json({ items: await delegationRecipients(req.user!, req.query.storeId.toLowerCase()) });
}));
router.post("/delegations", workflowEndpoint(async (req, res) => { res.status(201).json(delegationDto(await createDelegation(req.user!, req.body))); }));
router.get("/delegations/:id", workflowEndpoint(async (req, res) => { res.json(await getDelegation(req.user!, req.params.id)); }));
router.post("/delegations/:id/review", workflowEndpoint(async (req, res) => { res.json(delegationDto(await reviewDelegation(req.user!, req.params.id, req.body))); }));
router.post("/delegations/:id/revoke", workflowEndpoint(async (req, res) => {
  const body = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!body.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần lý do và phiên bản hợp lệ.");
  res.json(delegationDto(await revokeDelegation(req.user!, req.params.id, body.data.expectedVersion, body.data.reason)));
}));
export default router;
