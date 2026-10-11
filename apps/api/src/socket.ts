import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken, TokenClaims } from "./services/auth.service.js";

let io: SocketIOServer | null = null;

interface AuthenticatedSocket extends Socket {
  claims?: TokenClaims;
}

export function initSocket(server: HttpServer): SocketIOServer {
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";

  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Security lockdown: Require JWT authentication on Socket.IO handshake
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const claims = await verifyAccessToken(token);
      socket.claims = claims;
      next();
    } catch (_err) {
      return next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.claims?.sub;
    if (userId) {
      // Room joined based solely on verified token claims
      socket.join(`user:${userId}`);
    }

    // Mock unauthenticated chat and room:join handlers have been disabled
    // to prevent REST authorization bypass and data leakage.
    socket.on("disconnect", () => {
      // Clean disconnect
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
