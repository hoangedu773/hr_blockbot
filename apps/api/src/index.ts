// Must run before any business module is evaluated so process.env is populated
// when modules read configuration lazily.
import "dotenv/config";

import { createServer } from "http";
import { app } from "./app.js";
import { connectDB } from "./db.js";
import { initSocket } from "./socket.js";

const httpServer = createServer(app);

// Initialize Socket.IO with authenticated handshake
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
