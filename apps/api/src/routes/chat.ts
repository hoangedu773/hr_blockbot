import { Router } from "express";
import { ChatRequestSchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
import { authorizedChat } from "../services/chat-authorization.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
const router = Router();
router.post("/chat", authenticateToken, endpoint(async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Message/conversation identifier is invalid");
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await authorizedChat(req.user!, parsed.data.message, parsed.data.conversationId));
}));
export default router;
