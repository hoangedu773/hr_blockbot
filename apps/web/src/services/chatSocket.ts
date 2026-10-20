import { io, type Socket } from 'socket.io-client';
import type { Citation } from '@hr-blockbot/contracts';
import { API_BASE } from './auth';

/**
 * Socket.IO origin. Defaults to the API origin with the `/api` suffix removed,
 * so a single `VITE_API_BASE` is enough for REST + WS in production.
 */
export function resolveSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;
  return API_BASE.replace(/\/api\/?$/, '');
}

/**
 * WebSocket payload types for the closed 10-event chat contract.
 *
 * Defined locally (not exported by `@hr-blockbot/contracts`) because Phase 1
 * keeps `docs/06-api-spec.md` §4.2 as the canonical source for socket events
 * and only ships Zod schemas for REST DTOs. Shapes below are verbatim from
 * that table; do not add fields here without amending the spec first.
 */
export type ChatChunkKind = 'text' | 'citation' | 'action_proposal';

export interface ChatSendPayload {
  clientMessageId: string;
  text: string;
  conversationId?: string;
}

export interface ChatAcceptedEvent {
  clientMessageId: string;
  messageId: string;
  conversationId: string;
  acceptedAt: string;
}

export interface ChatChunkEvent {
  clientMessageId: string;
  messageId: string;
  seq: number;
  kind: ChatChunkKind;
  /** Required when `kind === 'text'`; plain text only, never JSON-wrapped. */
  delta?: string;
  /** Required when `kind !== 'text'`; `Citation` or `ChatActionProposal` payload. */
  data?: unknown;
}

export type ChatFinishReason = 'ANSWER' | 'TOOL_RESULT' | 'ABSTAIN' | 'ERROR';

export interface ChatDoneEvent {
  clientMessageId: string;
  finishReason: ChatFinishReason;
  tool?: string;
  card?: unknown;
  citations?: Citation[];
  score?: number;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ChatErrorEvent {
  clientMessageId?: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface ChatConfirmPayload {
  clientMessageId: string;
  actionId: string;
  approve: boolean;
}

/** `chat:chunk` payload for `kind === 'action_proposal'` (FR-020). */
export interface ChatActionProposal {
  actionId: string;
  type: string;
  args?: Record<string, unknown>;
  preview?: string;
}

export interface ChatSocketHandlers {
  onConnect: () => void;
  onDisconnect: (reason: string) => void;
  onConnectError: (message: string) => void;
  onAccepted: (event: ChatAcceptedEvent) => void;
  onChunk: (event: ChatChunkEvent) => void;
  onDone: (event: ChatDoneEvent) => void;
  onError: (event: ChatErrorEvent) => void;
}

function createClientMessageId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/**
 * Thin Socket.IO wrapper for the `chat:*` contract.
 *
 * Reconnect behaviour required by the phase plan: keep the conversation id and
 * re-emit every `clientMessageId` that was never acknowledged. The server is
 * idempotent per `clientMessageId`, so a replay cannot duplicate a message.
 */
export class ChatSocketClient {
  private socket: Socket | null = null;
  private readonly pending = new Map<string, ChatSendPayload>();
  private conversationId: string | null = null;

  constructor(private readonly handlers: ChatSocketHandlers) {}

  get isConnected(): boolean {
    return this.socket?.connected === true;
  }

  get currentConversationId(): string | null {
    return this.conversationId;
  }

  /** Bind a conversation created over REST (`POST /api/conversations`). */
  setConversationId(conversationId: string): void {
    this.conversationId = conversationId;
  }

  connect(token: string): void {
    if (this.socket) return;

    const socket = io(resolveSocketUrl(), {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.handlers.onConnect();
      // Replay unacknowledged messages after a disconnect.
      for (const payload of this.pending.values()) {
        socket.emit('chat:send', {
          ...payload,
          ...(this.conversationId ? { conversationId: this.conversationId } : {}),
        });
      }
    });
    socket.on('disconnect', (reason: string) => this.handlers.onDisconnect(reason));
    socket.on('connect_error', (err: Error) => this.handlers.onConnectError(err.message));

    socket.on('chat:accepted', (event: ChatAcceptedEvent) => {
      if (event.conversationId) this.conversationId = event.conversationId;
      this.pending.delete(event.clientMessageId);
      this.handlers.onAccepted(event);
    });
    socket.on('chat:chunk', (event: ChatChunkEvent) => this.handlers.onChunk(event));
    socket.on('chat:done', (event: ChatDoneEvent) => {
      this.pending.delete(event.clientMessageId);
      this.handlers.onDone(event);
    });
    socket.on('chat:error', (event: ChatErrorEvent) => {
      if (event.clientMessageId) this.pending.delete(event.clientMessageId);
      this.handlers.onError(event);
    });
  }

  send(text: string): ChatSendPayload {
    const payload: ChatSendPayload = {
      clientMessageId: createClientMessageId(),
      text,
      ...(this.conversationId ? { conversationId: this.conversationId } : {}),
    };
    this.pending.set(payload.clientMessageId, payload);
    this.socket?.emit('chat:send', payload);
    return payload;
  }

  confirmAction(actionId: string, approve: boolean): ChatConfirmPayload {
    const payload: ChatConfirmPayload = {
      clientMessageId: createClientMessageId(),
      actionId,
      approve,
    };
    this.socket?.emit('chat:confirm', payload);
    return payload;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.pending.clear();
    this.conversationId = null;
  }
}
