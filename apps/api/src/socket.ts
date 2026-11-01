import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import {
  ChatSendPayloadSchema,
  ChatConfirmPayloadSchema,
} from "@hr-blockbot/contracts";
import { verifyAccessToken, TokenClaims } from "./services/auth.service.js";
import { authorizedChat } from "./services/chat-authorization.service.js";
import { requireCapability } from "./services/authorization-scope.service.js";
import { resolvePrincipal } from "./services/principal.service.js";

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
      const principal = await resolvePrincipal(claims);
      if (principal.mustChangePassword) return next(new Error("Password change required"));
      socket.claims = claims;
      // Re-check signature expiry AND current account on every packet, not just handshake.
      socket.use(async (_packet, packetNext) => {
        try {
          const current = await resolvePrincipal(await verifyAccessToken(token));
          if (current.mustChangePassword) throw new Error("Password change required");
          requireCapability(current, "chatbot.data_read", { userId: current.userId, employeeId: current.employeeId });
          socket.claims = { sub: current.userId, role: current.role, securityVersion: current.securityVersion };
          packetNext();
        } catch {
          socket.emit("chat:error", { code: "UNAUTHENTICATED", message: "Session no longer available", retryable: false });
          packetNext(new Error("Session no longer available"));
          socket.disconnect(true);
        }
      });
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

    // FR-054 Canonical Chatbot Events: chat:send
    socket.on("chat:send", async (data: unknown) => {
      const parsed = ChatSendPayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("chat:error", {
          code: "VALIDATION_FAILED",
          message: "Invalid chat:send payload",
          retryable: false,
        });
        return;
      }

      const payload = parsed.data;
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const convId = payload.conversationId || `conv-${Date.now()}`;

      // Emit chat:accepted
      socket.emit("chat:accepted", {
        clientMessageId: payload.clientMessageId,
        messageId,
        conversationId: convId,
        acceptedAt: new Date().toISOString(),
      });

      try {
        const principal = await resolvePrincipal(socket.claims!);

        if (payload.text) {
          const result = await authorizedChat(principal, payload.text, convId);
          socket.emit("chat:done", {
            clientMessageId: payload.clientMessageId,
            messageId,
            finishReason: result.abstain ? "ABSTAIN" : "ANSWER",
            reply: result.reply,
            citations: result.citations,
            proposedAction: result.proposedAction,
            degraded: result.degraded,
            decisionSource: result.decisionSource,
            ...(result.decisionAnalysis ? { decisionAnalysis: result.decisionAnalysis } : {}),
            card: result.proposedAction ? (result.proposedAction as Record<string, unknown>) : undefined,
          });
        } else if (payload.confirm) {
          socket.emit("chat:done", {
            clientMessageId: payload.clientMessageId,
            messageId,
            finishReason: "TOOL_RESULT",
            reply: payload.confirm.approved
              ? `Đã ghi nhận xác nhận của bạn cho hành động [${payload.confirm.actionId}]. Chưa có thay đổi dữ liệu nào được thực hiện.`
              : `Đã hủy bỏ thực hiện hành động [${payload.confirm.actionId}]. Không có dữ liệu nào bị thay đổi.`,
            citations: [],
            proposedAction: null,
          });
        }
      } catch (err: any) {
        socket.emit("chat:error", {
          clientMessageId: payload.clientMessageId,
          messageId,
          code: "AI_SERVICE_UNAVAILABLE",
          message: err?.message || "Không thể kết nối tới AI Service",
          retryable: true,
        });
      }
    });

    // FR-054 Canonical Chatbot Events: chat:confirm (Confirm-before-write)
    socket.on("chat:confirm", async (data: unknown) => {
      const parsed = ChatConfirmPayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("chat:error", {
          code: "VALIDATION_FAILED",
          message: "Invalid chat:confirm payload",
          retryable: false,
        });
        return;
      }

      const payload = parsed.data;
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      socket.emit("chat:accepted", {
        clientMessageId: payload.clientMessageId,
        messageId,
        conversationId: `conv-${Date.now()}`,
        acceptedAt: new Date().toISOString(),
      });

      // P1-6: nothing here executes the action yet — no service is called and no
      // document is written. The reply must say exactly that; claiming "đã thực thi"
      // is a false statement to the user (and to the thesis report).
      // TODO(hr): wire the real executor, then change this message.
      socket.emit("chat:done", {
        clientMessageId: payload.clientMessageId,
        messageId,
        finishReason: "TOOL_RESULT",
        reply: payload.approve
          ? `Đã ghi nhận xác nhận của bạn cho hành động [${payload.actionId}]. Chưa có thay đổi dữ liệu nào được thực hiện.`
          : `Đã hủy bỏ thực hiện hành động [${payload.actionId}]. Không có dữ liệu nào bị thay đổi.`,
        citations: [],
        proposedAction: null,
      });
    });

    socket.on("disconnect", () => {
      // Clean disconnect
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
