import express, { Express, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import employeesRouter from "./routes/employees.js";
import projectsRouter from "./routes/projects.js";
import reportsRouter from "./routes/reports.js";
import adminSettingsRouter from "./routes/admin-settings.js";
import chatRouter from "./routes/chat.js";

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
  app.use("/api", chatRouter);

  // Security lockdown: Safely disable legacy endpoints outside bootstrap
  const disabledLegacyHandler = (_req: Request, res: Response) => {
    res.status(503).json({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "This legacy endpoint has been disabled for security bootstrap lockdown",
      },
    });
  };

  app.use("/api/stores", disabledLegacyHandler);
  app.use("/api/schedules", disabledLegacyHandler);
  app.use("/api/corrections", disabledLegacyHandler);
  app.use("/api/cash", disabledLegacyHandler);

  return app;
}

export const app = createApp();
