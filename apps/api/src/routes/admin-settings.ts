import { Router, Request, Response } from "express";
import { UpdateLLMProvidersRequestSchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import {
  getProvidersResponse,
  testProvider,
  updateProviders,
  ProviderKeyRequiredError,
  ProviderNotFoundError,
  SettingsValidationError,
  SettingsEncryptionError,
} from "../services/settings.service.js";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.user || req.user.role !== "Admin") {
    res.status(403).json({
      error: {
        code: "RBAC_DENIED",
        message: "Only Admin can manage LLM provider settings",
      },
    });
    return false;
  }
  return true;
}

function respondError(res: Response, err: unknown): void {
  if (err instanceof SettingsEncryptionError) {
    // Fail-closed without leaking key material, env value or blob fragments.
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Settings encryption is not available",
      },
    });
    return;
  }

  if (err instanceof ProviderKeyRequiredError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof SettingsValidationError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof ProviderNotFoundError) {
    res.status(404).json({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: err.message,
      },
    });
    return;
  }

  console.error(
    "[Settings] Internal error:",
    err instanceof Error ? err.message : "unknown error"
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Failed to process LLM provider settings",
    },
  });
}

// GET /api/admin/llm-providers - masked providers only (keyHint, never keyCipher)
router.get("/admin/llm-providers", authenticateToken, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await getProvidersResponse();
    res.status(200).json(result);
  } catch (err) {
    respondError(res, err);
  }
});

// PUT /api/admin/llm-providers - upsert providers, encrypt new keys, keep existing key if apiKey omitted
router.put("/admin/llm-providers", authenticateToken, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = UpdateLLMProvidersRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid LLM provider payload",
        details: parsed.error.format(),
      },
    });
    return;
  }

  const actorId = req.user!.employeeId || req.user!.userId;

  try {
    const result = await updateProviders(parsed.data.providers, actorId);
    res.status(200).json(result);
  } catch (err) {
    respondError(res, err);
  }
});

// POST /api/admin/llm-providers/:id/test - one max_tokens=1 completion probe with timeout
router.post(
  "/admin/llm-providers/:id/test",
  authenticateToken,
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    try {
      const result = await testProvider(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      respondError(res, err);
    }
  }
);

export default router;
