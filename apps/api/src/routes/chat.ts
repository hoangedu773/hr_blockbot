import { Router } from "express";
import { ChatRequestSchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
import { authorizedChat } from "../services/chat-authorization.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import { createConversation, listConversations, conversationMessages, chatWithHistory, deleteConversation } from '../services/chat-history.service.js';
const router = Router();
router.post('/chat/conversations', authenticateToken, endpoint(async (req, res) => { res.status(201).json(await createConversation(req.user!, req.body)); }));
router.get('/chat/conversations', authenticateToken, endpoint(async (req, res) => { res.json(await listConversations(req.user!, req.query)); }));
router.get('/chat/conversations/:id/messages', authenticateToken, endpoint(async (req, res) => { res.json(await conversationMessages(req.user!, req.params.id, req.query)); }));
router.delete('/chat/conversations/:id', authenticateToken, endpoint(async (req, res) => { await deleteConversation(req.user!, req.params.id); res.status(204).end(); }));
router.post("/chat", authenticateToken, endpoint(async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Message/conversation identifier is invalid");
  res.setHeader("Cache-Control", "private, no-store");
  res.json(parsed.data.clientMessageId ? await chatWithHistory(req.user!, parsed.data.message, parsed.data.conversationId, parsed.data.clientMessageId)
    : await authorizedChat(req.user!, parsed.data.message, parsed.data.conversationId));
}));
export default router;
