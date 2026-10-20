import { Router, Request, Response } from "express";
import mongoose from "mongoose";

const router = Router();

// GET /api/health - Minimal health check distinguishing liveness and readiness
router.get("/health", async (_req: Request, res: Response) => {
  const isConnected = mongoose.connection.readyState === 1;
  let dbPingOk = false;

  if (isConnected && mongoose.connection.db) {
    try {
      await mongoose.connection.db.admin().ping();
      dbPingOk = true;
    } catch {
      dbPingOk = false;
    }
  }

  const isHealthy = isConnected && dbPingOk;
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    liveness: "ok",
    readiness: isHealthy ? "ok" : "database_unavailable",
    timestamp: new Date().toISOString(),
  });
});

// GET /api/health/live - Pure liveness check
router.get("/health/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// GET /api/health/ready - Readiness check requiring database connectivity
router.get("/health/ready", async (_req: Request, res: Response) => {
  const isConnected = mongoose.connection.readyState === 1;
  let dbPingOk = false;

  if (isConnected && mongoose.connection.db) {
    try {
      await mongoose.connection.db.admin().ping();
      dbPingOk = true;
    } catch {
      dbPingOk = false;
    }
  }

  if (isConnected && dbPingOk) {
    res.status(200).json({ status: "ok" });
  } else {
    res.status(503).json({
      status: "degraded",
      readiness: "database_unavailable",
    });
  }
});

export default router;
