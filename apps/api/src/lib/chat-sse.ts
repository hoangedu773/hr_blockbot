import { Response } from "express";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import {
  ChatErrorPayloadSchema,
  ChatHistorySendSchema,
  type ChatErrorPayload,
  type ErrorCode,
  type ChatChunkPayload,
  type ChatAcceptedPayload,
} from "@hr-blockbot/contracts";
import { WorkflowError } from "../services/project-workflow.service.js";

export interface ChatHistorySend {
  conversationId: string;
  turn: unknown;
}
export type ChatChunkTextPayload = Extract<ChatChunkPayload, { kind: "text" }>;

export interface SseEvent {
  event: string;
  data: string;
}

export function startSseResponse(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-cache, no-transform, no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if ("flushHeaders" in res && typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

export async function sendSseEvent(
  res: Response,
  event: string,
  data: unknown,
  signal?: AbortSignal
): Promise<void> {
  if (res.writableEnded || res.destroyed || signal?.aborted) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const canContinue = res.write(payload);
  if (!canContinue) {
    if (res.writableEnded || res.destroyed || signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const onDrain = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); resolve(); };
      const onAbort = () => { cleanup(); resolve(); };

      const cleanup = () => {
        res.off("drain", onDrain);
        res.off("close", onClose);
        res.off("error", onError);
        signal?.removeEventListener("abort", onAbort);
      };

      res.once("drain", onDrain);
      res.once("close", onClose);
      res.once("error", onError);
      if (signal) {
        if (signal.aborted) {
          cleanup();
          resolve();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }
}

export const MAX_SSE_EVENT_SIZE = 128 * 1024;

export async function* parseSseStream(
  stream: AsyncIterable<Uint8Array | Buffer | string>
): AsyncGenerator<SseEvent, void, unknown> {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let currentEvent = "";
  const currentData: string[] = [];
  let currentDataSize = 0;

  for await (const chunk of stream) {
    const text = typeof chunk === "string" ? chunk : decoder.write(chunk);
    buffer += text;
    if (buffer.length > MAX_SSE_EVENT_SIZE) {
      throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "SSE frame exceeded maximum size limit");
    }

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line === "") {
        if (currentEvent !== "" || currentData.length > 0) {
          yield {
            event: currentEvent || "message",
            data: currentData.join("\n"),
          };
          currentEvent = "";
          currentData.length = 0;
          currentDataSize = 0;
        }
      } else if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const item = line.slice(5).trimStart();
        currentDataSize += item.length;
        if (currentDataSize > MAX_SSE_EVENT_SIZE) {
          throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "SSE frame exceeded maximum size limit");
        }
        currentData.push(item);
      }
    }
  }

  buffer += decoder.end();
  if (buffer.length > MAX_SSE_EVENT_SIZE) {
    throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "SSE frame exceeded maximum size limit");
  }

  if (buffer.length > 0) {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") {
        if (currentEvent !== "" || currentData.length > 0) {
          yield {
            event: currentEvent || "message",
            data: currentData.join("\n"),
          };
          currentEvent = "";
          currentData.length = 0;
          currentDataSize = 0;
        }
      } else if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const item = line.slice(5).trimStart();
        currentDataSize += item.length;
        if (currentDataSize > MAX_SSE_EVENT_SIZE) {
          throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "SSE frame exceeded maximum size limit");
        }
        currentData.push(item);
      }
    }
  }

  if (currentEvent !== "" || currentData.length > 0 || buffer.length > 0) {
    throw new WorkflowError(503, "AI_SERVICE_UNAVAILABLE", "SSE frame terminated abruptly without delimiter");
  }
}

export function mapToChatErrorPayload(error: unknown, clientMessageId?: string): ChatErrorPayload {
  let code: ErrorCode = "INTERNAL_ERROR";
  let message = "Đã xảy ra lỗi trong quá trình xử lý hội thoại.";
  let retryable = false;

  const errStr = String(error instanceof Error ? error.message : error);
  const rawCode = typeof error === "object" && error !== null && "code" in error && typeof (error as Record<string, unknown>).code === "string"
    ? ((error as Record<string, unknown>).code as string)
    : "";
  const rawStatus = typeof error === "object" && error !== null && (
    ("status" in error && typeof (error as Record<string, unknown>).status === "number")
      ? ((error as Record<string, unknown>).status as number)
      : ("statusCode" in error && typeof (error as Record<string, unknown>).statusCode === "number")
        ? ((error as Record<string, unknown>).statusCode as number)
        : undefined
  );
  const errCode = error instanceof WorkflowError ? error.code : rawCode;

  if (
    errCode === "UNAUTHENTICATED" ||
    rawStatus === 401 ||
    (error instanceof WorkflowError && error.status === 401) ||
    errStr.includes("UNAUTHENTICATED")
  ) {
    code = "UNAUTHENTICATED";
    message = "Phiên làm việc đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.";
    retryable = false;
  } else if (errCode === "SAFETY_BLOCKED" || errStr.includes("SAFETY_BLOCKED") || errStr.includes("SAFETY")) {
    code = "AI_SERVICE_UNAVAILABLE";
    message = "Nội dung yêu cầu bị hệ thống an toàn chặn hoặc không thể xử lý. Vui lòng đặt câu hỏi khác.";
    retryable = false;
  } else if (errCode === "TOOL_TIMEOUT" || errStr.includes("TOOL_TIMEOUT")) {
    code = "TOOL_TIMEOUT";
    message = "Thời gian thực thi công cụ vượt quá giới hạn. Vui lòng thử lại sau.";
    retryable = true;
  } else if (
    errCode === "LLM_TIMEOUT" ||
    errCode === "AI_SERVICE_TIMEOUT" ||
    errStr.includes("LLM_TIMEOUT") ||
    errStr.includes("AI_SERVICE_TIMEOUT")
  ) {
    code = "AI_SERVICE_TIMEOUT";
    message = "Yêu cầu xử lý quá thời gian quy định. Vui lòng thử lại sau.";
    retryable = true;
  } else if (errCode === "LLM_UNAVAILABLE" || errStr.includes("LLM_UNAVAILABLE")) {
    code = "LLM_UNAVAILABLE";
    message = "Dịch vụ mô hình AI hiện không khả dụng. Vui lòng thử lại sau.";
    retryable = false;
  } else if (
    errCode === "UNAVAILABLE" ||
    errCode === "SERVICE_UNAVAILABLE" ||
    errCode === "AI_SERVICE_UNAVAILABLE" ||
    errStr.includes("AI_SERVICE_UNAVAILABLE") ||
    errStr.includes("AI_SERVICE_STREAM_ABRUPT_EOF") ||
    errStr.includes("premature close") ||
    errStr.includes("fetch failed") ||
    errStr.includes("ECONNRESET") ||
    errStr.includes("socket hang up") ||
    errStr.includes("terminated abruptly")
  ) {
    code = "AI_SERVICE_UNAVAILABLE";
    message = "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.";
    retryable = false;
  } else if (
    errCode === "CHAT_AUTHORIZATION_CHANGED" ||
    errCode === "DOCUMENT_ACCESS_CHANGED" ||
    errCode === "CHAT_REQUEST_UNAVAILABLE" ||
    errCode === "RBAC_DENIED"
  ) {
    code = "RBAC_DENIED";
    message = "Quyền truy cập hoặc dữ liệu ủy quyền đã thay đổi trong khi tạo câu trả lời.";
    retryable = false;
  } else if (errCode === "CHAT_RESOURCE_CHANGED") {
    code = "PROJECT_VERSION_CONFLICT";
    message = "Dữ liệu liên quan đã thay đổi trong khi tạo câu trả lời. Vui lòng hỏi lại.";
    retryable = false;
  } else if (errCode === "DUPLICATE_REQUEST" || errCode === "CHAT_MESSAGE_CONFLICT") {
    code = "DUPLICATE_REQUEST";
    message = "Tin nhắn đang được xử lý hoặc đã gián đoạn. Vui lòng gửi bằng mã tin nhắn mới.";
    retryable = false;
  } else if (errCode === "VALIDATION_FAILED") {
    code = "VALIDATION_FAILED";
    message = "Tham số yêu cầu không hợp lệ.";
    retryable = false;
  }

  const payload: ChatErrorPayload = {
    clientMessageId,
    messageId: clientMessageId,
    code,
    message,
    retryable,
  };
  return ChatErrorPayloadSchema.parse(payload);
}
