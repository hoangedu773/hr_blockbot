import { Router, Request, Response } from "express";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { chatWithAiService } from "../services/ai-client.service.js";

const router = Router();

// POST /api/chat - Giao tiếp với AI Copilot Agent Loop
router.post("/chat", authenticateToken, async (req: Request, res: Response) => {
  const { message, conversationId } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Message is required and must be a non-empty string",
      },
    });
    return;
  }

  try {
    const user = req.user;
    const userContext = {
      userId: user?.userId ?? null,
      role: user?.role ?? "Employee",
      employeeId: user?.employeeId ?? null,
      departmentId: user?.departmentId ?? null,
    };

    const result = await chatWithAiService(message.trim(), userContext, conversationId);

    res.status(200).json({
      reply: result.reply,
      intent: result.intent,
      intentId: result.intentId,
      citations: result.citations,
      proposedAction: result.proposedAction,
      abstain: result.abstain,
      degraded: result.degraded,
      conversationId: result.conversationId,
    });
  } catch (err: any) {
    console.error("[ChatRoute] Unexpected error:", err);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred while processing your chat request",
      },
    });
  }
});

export default router;
