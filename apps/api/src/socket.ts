import { decideRevenueKpiOpenAction, RevenueKpiPlanChangedError } from './services/revenue-kpi.service.js';
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

    // One executor for chat:send(confirm) and chat:confirm so both client events
    // cannot drift into different behaviour.
    const decide = async (messageId: string, clientMessageId: string, actionId: string, approve: boolean,
      plan?: { expectedVersion?: number; planDigest?: string }) => {
      try {
        const principal = await resolvePrincipal(socket.claims!);
        const input = approve
          ? { approve: true, clientRequestId: clientMessageId, expectedVersion: plan?.expectedVersion, planDigest: plan?.planDigest }
          : { approve: false, clientRequestId: clientMessageId };
        const action = await decideRevenueKpiOpenAction(principal, actionId, input);
        socket.emit("chat:done", {
          clientMessageId, messageId, finishReason: "TOOL_RESULT",
          reply: action.result ? 'Đã xử lý kỳ KPI doanh thu. Xem kết quả từng mục.' : 'Đã hủy đề xuất mở kỳ KPI doanh thu.',
          citations: [], proposedAction: null, revenueKpiOpenAction: action,
        });
      } catch (error) {
        const known = error as { status?: number; code?: string; message?: string; name?: string };
        socket.emit("chat:error", {
          clientMessageId,
          code: known.status ? known.code : known.name === 'ZodError' ? 'VALIDATION_FAILED' : 'REVENUE_KPI_ACTION_FAILED',
          message: known.status && known.status < 500 ? known.message : 'Chưa xử lý được đề xuất KPI.',
          retryable: known.status === 409,
          ...(error instanceof RevenueKpiPlanChangedError ? { preview: error.preview } : {}),
        });
      }
    };

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
          await decide(messageId, payload.clientMessageId, payload.confirm.actionId, payload.confirm.approved,
            { expectedVersion: payload.confirm.expectedVersion, planDigest: payload.confirm.planDigest });
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

      await decide(messageId, payload.clientMessageId, payload.actionId, payload.approve,
        { expectedVersion: payload.expectedVersion, planDigest: payload.planDigest });
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
