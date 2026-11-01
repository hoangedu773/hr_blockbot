import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { WorkflowError } from "../services/project-workflow.service.js";

export type RouteHandler = (req: Request, res: Response) => Promise<void>;

type CodedError = { status: number; code: string; message: string };

function isZodFailure(error: unknown): boolean {
  if (error instanceof z.ZodError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; issues?: unknown };
  return candidate.name === "ZodError" && Array.isArray(candidate.issues);
}

function isCodedError(error: unknown): error is CodedError {
  if (error instanceof WorkflowError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return typeof candidate.status === "number" && typeof candidate.code === "string";
}

/**
 * Shared async route adapter. Zod failures become 400 VALIDATION_FAILED; known
 * workflow failures keep their own status/code; everything else is forwarded to
 * the terminal handler in `app.ts` so infrastructure and body-parser errors keep
 * the envelope they already had.
 */
export const endpoint =
  (handler: RouteHandler) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error: unknown) {
      if (isZodFailure(error)) {
        res.status(400).json({
          error: { code: "VALIDATION_FAILED", message: "Tham số không hợp lệ; kiểm tra bộ lọc và phân trang." },
        });
      } else if (isCodedError(error)) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
      } else {
        next(error);
      }
    }
  };
