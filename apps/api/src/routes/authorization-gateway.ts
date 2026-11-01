import { Router } from "express";
import { workflowEndpoint as endpoint } from "./projects.js";
import { executeGatewayTool, serviceKeyValid } from "../services/chat-authorization.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import mongoose from "mongoose";
const router = Router();
router.get("/internal/authorization/ready", endpoint(async (req, res) => {
  if (!serviceKeyValid(String(req.headers["x-ai-service-key"] ?? ""))) throw new WorkflowError(401, "UNAUTHENTICATED", "Service authentication required");
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw new WorkflowError(503, "SERVICE_UNAVAILABLE", "Authorization database unavailable");
  await mongoose.connection.db.admin().ping();
  // Dependency check only: the service key never grants end-user tool access.
  res.json({ status: "ok", mode: "authorization-gateway-only" });
}));
router.post("/internal/authorization/tools", endpoint(async (req, res) => {
  if (!serviceKeyValid(String(req.headers["x-ai-service-key"] ?? ""))) throw new WorkflowError(401, "UNAUTHENTICATED", "Service authentication required");
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await executeGatewayTool(token, req.body));
}));
export default router;
