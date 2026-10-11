import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { connectDB } from "./db.js";
import { initSocket } from "./socket.js";

// Routes
import healthRouter from "./routes/health.js";
import employeesRouter from "./routes/employees.js";
import storesRouter from "./routes/stores.js";
import schedulesRouter from "./routes/schedules.js";
import correctionsRouter from "./routes/corrections.js";
import cashRouter from "./routes/cash.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Middlewares
app.use(cors({ origin: "*" }));
app.use(express.json());

// Register API Routes
app.use("/api", healthRouter);
app.use("/api", employeesRouter);
app.use("/api", storesRouter);
app.use("/api", schedulesRouter);
app.use("/api", correctionsRouter);
app.use("/api", cashRouter);

// Initialize Socket.IO
initSocket(httpServer);

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`[HR BlockBot API] Server running at http://localhost:${PORT}`);
      console.log(`[HR BlockBot API] Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error("[HR BlockBot API] Fatal bootstrap error:", err);
    process.exit(1);
  }
}

bootstrap();
