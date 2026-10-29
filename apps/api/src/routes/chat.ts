import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { chatWithAiService } from "../services/ai-client.service.js";
import { resolveUserScope } from "../services/user-scope.service.js";

const router = Router();
const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(1).max(200).optional(),
  modelTier: z.enum(["low", "medium", "high"]).optional(),
});

// POST /api/chat - Giao tiếp với AI Copilot Agent Loop
router.post("/chat", authenticateToken, async (req: Request, res: Response) => {
  const parsed = chatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Message must contain 1-2000 characters; conversationId must be a non-empty string up to 200 characters",
      },
    });
    return;
  }

  try {
    const user = req.user!;
    const userContext = {
      userId: user.userId,
      role: user.role,
      employeeId: user.employeeId ?? null,
      departmentId: user.departmentId ?? null,
    };
    // Business scope (store + manager tier) comes from the employee record, not the
    // token: an SM logging in must get manager guidance, a barista must not.
    const scope = await resolveUserScope(user.userId, user.role);
    Object.assign(userContext, {
      employeeId: scope.employeeId ?? userContext.employeeId,
      departmentId: scope.departmentId ?? userContext.departmentId,
      businessRole: scope.businessRole,
      storeName: scope.storeName,
    });

    const { message, conversationId, modelTier } = parsed.data;
    const result = await chatWithAiService(message, userContext, conversationId, { modelTier });

    res.status(200).json({
      reply: result.reply,
      intent: result.intent,
      intentId: result.intentId,
      citations: result.citations,
      proposedAction: result.proposedAction,
      abstain: result.abstain,
      degraded: result.degraded,
      decisionSource: result.decisionSource,
      conversationId: result.conversationId,
      attachments: result.attachments,
    });
  } catch {
    console.error("[ChatRoute] Unexpected chat processing failure");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred while processing your chat request",
      },
    });
  }
});

export default router;
