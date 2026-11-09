import {
  ChatAcceptedPayloadSchema,
  ChatChunkTextPayloadSchema,
  ChatHistorySendSchema,
  ChatErrorPayloadSchema,
  type ChatAcceptedPayload,
  type ChatChunkPayload,
  type ChatErrorPayload,
  type ErrorCode,
} from '@hr-blockbot/contracts';
import { apiFetch, API_BASE } from './auth';

export type ChatHistorySend = ReturnType<typeof ChatHistorySendSchema.parse>;
export type ChatChunkTextPayload = Extract<ChatChunkPayload, { kind: 'text' }>;
export interface ChatStreamOptions {
  message: string;
  conversationId?: string;
  clientMessageId: string;
  signal?: AbortSignal;
  onAccepted?: (payload: ChatAcceptedPayload) => void;
  onChunk?: (delta: string, payload: ChatChunkTextPayload) => void;
  onDone?: (payload: ChatHistorySend) => void;
  onError?: (payload: ChatErrorPayload) => void;
}

interface ParsedSSEEvent {
  event: string;
  data: string;
}

const MAX_BUFFER_SIZE = 64 * 1024; // 64 KB
const MAX_DELTA_LENGTH = 16 * 1024; // 16 KB

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  AI_SERVICE_UNAVAILABLE: 'Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.',
  LLM_UNAVAILABLE: 'Dịch vụ mô hình AI hiện không khả dụng. Vui lòng thử lại sau.',
  SAFETY_BLOCKED: 'Nội dung không thể hiển thị do vi phạm chính sách an toàn. Vui lòng thử lại với câu hỏi khác.',
  VALIDATION_FAILED: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại nội dung câu hỏi.',
  CONVERSATION_FULL: 'Hội thoại đã đạt giới hạn tối đa. Vui lòng mở hội thoại mới.',
  TOOL_TIMEOUT: 'Xử lý vượt quá thời gian cho phép. Vui lòng thử lại.',
};

const DEFAULT_SAFE_ERROR_MESSAGE =
  'Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận. Vui lòng kiểm tra đường truyền và thử lại.';

function resolveSafeErrorMessage(code: string | undefined): string {
  if (code && code in SAFE_ERROR_MESSAGES) {
    return SAFE_ERROR_MESSAGES[code];
  }
  return DEFAULT_SAFE_ERROR_MESSAGE;
}

function parseSSEBlock(block: string): ParsedSSEEvent | null {
  const lines = block.split(/\r?\n/);
  let eventType = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue; // SSE comment
    }
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      let content = line.slice(5);
      if (content.startsWith(' ')) {
        content = content.slice(1);
      }
      dataLines.push(content);
    }
  }

  if (dataLines.length === 0 && eventType === 'message') {
    return null;
  }

  return {
    event: eventType,
    data: dataLines.join('\n'),
  };
}

export async function streamChat(options: ChatStreamOptions): Promise<void> {
  const response = await apiFetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: options.message,
      conversationId: options.conversationId,
      clientMessageId: options.clientMessageId,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    let errorDetail = `Chat HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message && typeof errJson.error.message === 'string') {
        errorDetail = errJson.error.message;
      }
    } catch {
      // Non-JSON error body
    }
    throw new Error(errorDetail);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    throw new Error('Dịch vụ AI trả về phản hồi không đúng định dạng luồng sự kiện.');
  }

  if (!response.body) {
    throw new Error('Response body is missing');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let expectedSeq = 0;
  let terminalReceived = false;
  let currentConversationId = options.conversationId;
  let currentMessageId: string | undefined;

  const emitSafeError = (code: ErrorCode | 'SAFETY_BLOCKED', retryable: boolean, customMessage?: string) => {
    if (terminalReceived) return;
    terminalReceived = true;
    const finalCode: ErrorCode = code === 'SAFETY_BLOCKED' ? 'AI_SERVICE_UNAVAILABLE' : code;
    options.onError?.({
      clientMessageId: options.clientMessageId,
      messageId: options.clientMessageId,
      code: finalCode,
      message: customMessage || resolveSafeErrorMessage(code),
      retryable,
    });
  };

  const dispatchEvent = (parsed: ParsedSSEEvent): boolean => {
    if (terminalReceived) return false;

    if (parsed.event === 'accepted') {
      let raw: unknown;
      try {
        raw = JSON.parse(parsed.data);
      } catch {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Dữ liệu xác nhận từ máy chủ không hợp lệ.');
        return false;
      }

      const res = ChatAcceptedPayloadSchema.safeParse(raw);
      if (!res.success) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Dữ liệu xác nhận từ máy chủ không đúng cấu trúc.');
        return false;
      }
      if (res.data.clientMessageId !== options.clientMessageId) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Mã tin nhắn xác nhận không khớp.');
        return false;
      }
      currentConversationId = res.data.conversationId;
      currentMessageId = res.data.messageId;
      options.onAccepted?.(res.data);
      return true;
    }

    if (parsed.event === 'chunk') {
      let raw: unknown;
      try {
        raw = JSON.parse(parsed.data);
      } catch {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Gói tin văn bản từ máy chủ không hợp lệ.');
        return false;
      }

      const res = ChatChunkTextPayloadSchema.safeParse(raw);
      if (!res.success) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Gói tin văn bản không đúng cấu trúc.');
        return false;
      }
      if (res.data.clientMessageId !== options.clientMessageId) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Mã tin nhắn trong gói dữ liệu không khớp.');
        return false;
      }
      if (res.data.delta.length > MAX_DELTA_LENGTH) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Gói dữ liệu vượt quá kích thước cho phép.');
        return false;
      }
      if (res.data.seq !== expectedSeq) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Thứ tự gói dữ liệu bị gián đoạn hoặc trùng lặp.');
        return false;
      }
      expectedSeq++;
      options.onChunk?.(res.data.delta, res.data);
      return true;
    }

    if (parsed.event === 'done') {
      let raw: unknown;
      try {
        raw = JSON.parse(parsed.data);
      } catch {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Dữ liệu hoàn tất phản hồi không hợp lệ.');
        return false;
      }

      const res = ChatHistorySendSchema.safeParse(raw);
      if (!res.success) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', true, 'Dữ liệu hoàn tất phản hồi không đúng cấu trúc.');
        return false;
      }
      if (res.data.turn.id !== options.clientMessageId) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Mã tin nhắn của lượt hoàn tất không khớp.');
        return false;
      }
      if (currentConversationId && res.data.conversationId !== currentConversationId) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Mã hội thoại của lượt hoàn tất không khớp.');
        return false;
      }
      terminalReceived = true;
      options.onDone?.(res.data);
      return false; // Terminal reached, stop processing
    }

    if (parsed.event === 'error') {
      let raw: unknown;
      try {
        raw = JSON.parse(parsed.data);
      } catch {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Dữ liệu thông báo lỗi không hợp lệ.');
        return false;
      }

      const isSafetyBlocked =
        raw && typeof raw === 'object' && (raw as Record<string, unknown>).code === 'SAFETY_BLOCKED';
      const toParse = isSafetyBlocked
        ? { ...(raw as Record<string, unknown>), code: 'AI_SERVICE_UNAVAILABLE' }
        : raw;

      const res = ChatErrorPayloadSchema.safeParse(toParse);
      if (!res.success) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Dữ liệu thông báo lỗi không đúng cấu trúc.');
        return false;
      }

      if (res.data.clientMessageId && res.data.clientMessageId !== options.clientMessageId) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Mã tin nhắn trong thông báo lỗi không khớp.');
        return false;
      }
      if (
        res.data.messageId &&
        res.data.messageId !== options.clientMessageId &&
        (!currentMessageId || res.data.messageId !== currentMessageId)
      ) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Mã tin nhắn trong thông báo lỗi không khớp.');
        return false;
      }

      const codeKey = isSafetyBlocked ? 'SAFETY_BLOCKED' : res.data.code;
      const safeMsg = resolveSafeErrorMessage(codeKey);
      emitSafeError(codeKey as ErrorCode | 'SAFETY_BLOCKED', res.data.retryable, safeMsg);
      return false; // Terminal reached, stop processing
    }

    return true;
  };

  try {
    while (!terminalReceived) {
      const { done, value } = await reader.read();
      if (done) {
        decoder.decode(new Uint8Array(), { stream: false });
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      if (buffer.length > MAX_BUFFER_SIZE) {
        emitSafeError('AI_SERVICE_UNAVAILABLE', false, 'Phản hồi vượt quá giới hạn bộ đệm cho phép.');
        await reader.cancel().catch(() => {});
        break;
      }

      let match: RegExpMatchArray | null;
      while (!terminalReceived && (match = buffer.match(/\r?\n\r?\n/)) !== null) {
        const separatorIndex = match.index ?? -1;
        if (separatorIndex === -1) break;
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + match[0].length);

        if (block.trim()) {
          const parsed = parseSSEBlock(block);
          if (parsed) {
            const shouldContinue = dispatchEvent(parsed);
            if (!shouldContinue) {
              await reader.cancel().catch(() => {});
              break;
            }
          }
        }
      }
    }

    // Do NOT dispatch leftover buffer at EOF! Incomplete frames without trailing \n\n are invalid.
    if (!terminalReceived) {
      emitSafeError(
        'AI_SERVICE_UNAVAILABLE',
        true,
        'Kết nối máy chủ bị ngắt trước khi nhận phản hồi hoàn chỉnh. Vui lòng thử lại.'
      );
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader lock might already be released
    }
  }
}
