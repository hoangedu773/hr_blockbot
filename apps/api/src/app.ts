import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import employeesRouter from "./routes/employees.js";
import projectsRouter from "./routes/projects.js";
import reportsRouter from "./routes/reports.js";
import adminSettingsRouter from "./routes/admin-settings.js";
import adminUsersRouter from "./routes/admin-users.js";
import chatRouter from "./routes/chat.js";
import attachmentsRouter from "./routes/attachments.js";
import storesRouter from "./routes/stores.js";
import dashboardRouter from "./routes/dashboard.js";
import { isInfrastructureError } from "./middlewares/auth.middleware.js";
import { redactSecrets } from "./lib/redact.js";

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: "VALIDATION_FAILED",
  404: "RESOURCE_NOT_FOUND",
  413: "PAYLOAD_TOO_LARGE",
  415: "VALIDATION_FAILED",
};

/** Chỉ đọc `status`/`statusCode` do body-parser hoặc middleware khác gắn vào. */
function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  for (const key of ["status", "statusCode"] as const) {
    const value: unknown = Reflect.get(err, key);
    if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 499) {
      return value;
    }
  }
  return null;
}

function sanitize(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : "unknown error");
}

// Load environment variables (supports apps/api/.env or workspace root .env)
dotenv.config();
dotenv.config({ path: "../../.env" });

export function createApp(): Express {
  const app = express();

  // Strict CORS: frontend origin whitelist + credentials
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or matching frontend
        if (!origin || origin === allowedOrigin) {
          callback(null, true);
        } else {
          callback(new Error("CORS policy violation: origin not allowed"));
        }
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json());

  // Mount Canonical Endpoints under /api prefix
  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", employeesRouter);
  app.use("/api", projectsRouter);
  app.use("/api", reportsRouter);
  app.use("/api", adminSettingsRouter);
  app.use("/api", adminUsersRouter);
  app.use("/api", chatRouter);
  app.use("/api", attachmentsRouter);
  app.use("/api", storesRouter);
  app.use("/api", dashboardRouter);

  // Security lockdown: Safely disable legacy endpoints outside bootstrap
  const disabledLegacyHandler = (_req: Request, res: Response) => {
    res.status(503).json({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "This legacy endpoint has been disabled for security bootstrap lockdown",
      },
    });
  };

  app.use("/api/schedules", disabledLegacyHandler);
  app.use("/api/corrections", disabledLegacyHandler);
  app.use("/api/cash", disabledLegacyHandler);

  // Terminal error handler: bắt buộc phải có sau mọi route thì `next(err)` mới trả
  // JSON đúng envelope thay vì trang HTML mặc định của Express (làm client parse lỗi).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    if (isInfrastructureError(err)) {
      console.error("[API] Infrastructure failure:", sanitize(err));
      res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database unavailable, retry shortly",
        },
      });
      return;
    }

    // `express.json()` ném lỗi 4xx có `status`/`statusCode`: JSON hỏng (400),
    // body quá lớn (413). Rơi xuống 500 ở đây làm client tưởng server hỏng và
    // retry vô ích, trong khi lỗi thực ra là phía payload.
    const status = clientErrorStatus(err);
    if (status !== null) {
      console.error("[API] Rejected request body:", status, err instanceof Error ? err.name : "");
      res.status(status).json({
        error: {
          code: CLIENT_ERROR_CODES[status] ?? "VALIDATION_FAILED",
          // Không dùng `err.message` của body-parser: với JSON hỏng nó trích nguyên
          // một đoạn body vào message.
          message:
            status === 413
              ? "Request body exceeds the allowed size"
              : "Malformed request body",
        },
      });
      return;
    }

    console.error("[API] Unhandled error:", sanitize(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });

  return app;
}

export const app = createApp();
