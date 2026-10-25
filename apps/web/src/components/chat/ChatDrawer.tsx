import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, API_BASE } from '../../services/auth';

export interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface Citation {
  document: string;
  version?: string;
  article?: string;
  score?: number;
}

export interface ProposedAction {
  actionId?: string;
  type: string;
  requiresConfirmation?: boolean;
  preview?: string;
  args?: Record<string, unknown>;
  status?: 'pending' | 'confirmed' | 'cancelled';
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citations?: Citation[];
  proposedAction?: ProposedAction | null;
  retryText?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseReply(value: unknown) {
  if (!isRecord(value) || typeof value.reply !== 'string' || !value.reply.trim()) {
    throw new Error('INVALID_CHAT_RESPONSE');
  }
  const citations: Citation[] = [];
  for (const item of Array.isArray(value.citations) ? value.citations : []) {
    if (!isRecord(item) || typeof item.document !== 'string' || !item.document.trim()) continue;
    citations.push({
      document: item.document,
      article: typeof item.article === 'string' ? item.article : undefined,
      version: typeof item.version === 'string' ? item.version : undefined,
      score: typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1 ? item.score : undefined,
    });
  }
  const action = value.proposedAction;
  const proposedAction: ProposedAction | null = isRecord(action) && typeof action.type === 'string' && action.type.trim()
    ? {
      type: action.type,
      actionId: typeof action.actionId === 'string' ? action.actionId : undefined,
      requiresConfirmation: action.requiresConfirmation !== false,
      preview: typeof action.preview === 'string' ? action.preview : undefined,
      args: isRecord(action.args) ? action.args : undefined,
      status: 'pending',
    } : null;
  return {
    reply: value.reply,
    citations,
    proposedAction,
    degraded: value.degraded === true,
    conversationId: typeof value.conversationId === 'string' && value.conversationId.trim() && value.conversationId.length <= 200 ? value.conversationId : undefined,
  };
}

// ponytail: safe Markdown subset (headings, lists, bold, inline code); add a parser when tables/links are required.
function renderMarkdown(text: string): React.ReactNode {
  return text.split('\n').map((line, index) => {
    const parts = line.replace(/^#{1,6}\s+/, '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part);
    return <div key={index} style={{ minHeight: '1.6em', fontWeight: /^#{1,6}\s/.test(line) ? 700 : undefined }}>{parts}</div>;
  });
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-0',
    sender: 'assistant',
    text: 'Xin chào! Tôi là Guta AI Copilot — trợ lý điều hành ca trực và đối soát nhân sự chuỗi 45 chi nhánh. Bạn cần kiểm tra ca trực, nhân sự hay quỹ két nào hôm nay?',
    timestamp: '08:00',
  },
];

const PROMPT_CHIPS = [
  'Chi nhánh nào đang thiếu người ca trưa nay?',
  'Đi trễ 20 phút tại Guta bị xử lý thế nào?',
  'Quỹ két ca sáng bị lệch 50k xử lý sao?',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toast, setToast] = useState('');
  const conversationId = useRef<string>();
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageId = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  // Clean up timers on unmount (critical for Playwright test regression safety)
  useEffect(() => () => {
    if (replyTimer.current !== null) {
      clearTimeout(replyTimer.current);
      replyTimer.current = null;
    }
    if (abortControllerRef.current !== null) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    if (replyTimer.current !== null) clearTimeout(replyTimer.current);
    replyTimer.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    busyRef.current = false;
    setIsTyping(false);
    setToast('');
  }, [isOpen]);

  // Keep keyboard focus inside the modal; restore the trigger on close.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const targets = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
        const first = targets?.[0];
        const last = targets?.[targets.length - 1];
        if (first && last && (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleActionConfirm = (targetMsgId: string, approved: boolean) => {
    const action = messages.find((msg) => msg.id === targetMsgId)?.proposedAction;
    if (!action || action.status !== 'pending') return;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === targetMsgId && msg.proposedAction) {
          return {
            ...msg,
            proposedAction: {
              ...msg.proposedAction,
              status: approved ? 'confirmed' : 'cancelled',
            },
          };
        }
        return msg;
      })
    );

    setToast(approved
      ? 'Đã xác nhận đề xuất trong phiên chat. Chưa thực thi hoặc ghi dữ liệu lên hệ thống.'
      : 'Đã hủy bỏ đề xuất. Không có dữ liệu nào bị thay đổi.');
  };

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || text.length > 2000 || busyRef.current) return;
    busyRef.current = true;

    const userMsg: ChatMessage = {
      id: `msg-${++messageId.current}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // Bắt buộc giữ delay 600ms chống hồi quy Playwright unmount test
    replyTimer.current = setTimeout(async () => {
      replyTimer.current = null;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
      let botResponse = 'Trợ lý AI hiện chưa kết nối hoặc phản hồi không hợp lệ. Vui lòng thử lại; chưa có hành động nào được thực hiện.';
      let citations: Citation[] = [];
      let proposedAction: ProposedAction | null = null;
      let retryText: string | undefined;
      try {
        const res = await apiFetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: text, conversationId: conversationId.current }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error('CHAT_UNAVAILABLE');
        const data = parseReply(await res.json());
        if (controller.signal.aborted) return;
        botResponse = data.reply;
        citations = data.citations;
        proposedAction = data.proposedAction;
        retryText = data.degraded ? text : undefined;
        conversationId.current = data.conversationId ?? conversationId.current;
      } catch {
        if (controller.signal.aborted && !timedOut) return;
        retryText = text;
      } finally {
        clearTimeout(timeout);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          busyRef.current = false;
          setIsTyping(false);
        }
      }

      const botMsg: ChatMessage = {
        id: `msg-${++messageId.current}`,
        sender: 'assistant',
        text: botResponse,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        citations,
        proposedAction,
        retryText,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .guta-chat-drawer { --drawer-text: #f4f4f5; --drawer-muted: #a1a1aa; --drawer-surface: #121214; --drawer-raised: #27272a; --drawer-border: #52525b; --drawer-on-primary: #fafafa; --drawer-primary: #52525b; --drawer-success: #6ee7b7; --drawer-shade: #09090b; font-family: var(--font-sans); }
        .guta-chat-drawer button, .guta-chat-drawer input { min-width: 44px; min-height: 44px; }
        .guta-chat-drawer button { font-family: inherit; white-space: nowrap; }
        .guta-chat-drawer button:focus-visible, .guta-chat-drawer input:focus-visible { outline: 2px solid var(--drawer-text); outline-offset: 2px; }
        .guta-chat-drawer button:disabled { opacity: .5; cursor: not-allowed; }
        .guta-chat-drawer button:active:not(:disabled) { transform: translateY(1px); }
        .guta-chat-drawer code { font-family: var(--mono); overflow-wrap: anywhere; }
        @media (hover: hover) and (pointer: fine) { .guta-chat-drawer button:hover:not(:disabled) { filter: brightness(1.2); } }
        @media (max-width: 768px) { aside.guta-chat-drawer { display: flex !important; } }
        @media (prefers-reduced-motion: reduce) { .guta-chat-drawer, .guta-chat-drawer * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } .guta-chat-drawer button:active { transform: none !important; } }
      `}</style>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          zIndex: 240,
          transition: 'opacity 250ms ease, visibility 250ms ease',
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* Slide-over Chat Panel (ChatGPT-Style Frosted Dark Slate) */}
      <aside
        ref={dialogRef}
        className="guta-chat-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Guta AI Copilot Drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(480px, 94vw)',
          backgroundColor: 'rgba(18, 18, 20, 0.94)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '-16px 0 48px rgba(0, 0, 0, 0.85)',
          zIndex: 250,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), visibility 250ms ease',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'var(--drawer-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              }}
            >
              <img src="/assets/logos/guta-mark-pure.svg" alt="Guta Logo" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--drawer-text)', letterSpacing: '-0.01em' }}>
                GUTA AI COPILOT
              </div>
              <div style={{ fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }}></span>
                <span>Gemini Flash · Trợ lý ca trực</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng Chat Copilot"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--drawer-muted)',
              fontSize: '15px',
              cursor: 'pointer',
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'opacity 140ms var(--motion-ease-standard)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--drawer-text)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--drawer-muted)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            ✕
          </button>
        </div>

        {/* Message Log */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '16px',
                    backgroundColor: isUser ? '#52525b' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${isUser ? '#3f3f46' : 'rgba(255, 255, 255, 0.07)'}`,
                    color: 'var(--drawer-text)',
                    fontSize: '13.5px',
                    lineHeight: 1.6,
                    boxShadow: isUser ? '0 2px 8px rgba(255, 255, 255, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{isUser ? msg.text : renderMarkdown(msg.text)}</div>
                  {msg.retryText && <button type="button" disabled={isTyping} onClick={() => handleSend(msg.retryText)} style={{ marginTop: '8px', color: 'var(--drawer-text)', background: 'var(--drawer-raised)', border: '1px solid var(--drawer-border)', borderRadius: '8px', padding: '8px' }}>Thử lại</button>}

                  {/* Khối Trích Dẫn Citations (RAG) */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div
                      role="region"
                      aria-label="Trích dẫn"
                      style={{
                        marginTop: '10px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '11px',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#e4e4e7',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
                        <span>Căn cứ quy định (Citations):</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {msg.citations.map((c, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              gap: '6px',
                              color: 'var(--drawer-text)',
                            }}
                          >
                            <span>
                              • <strong>{c.document}</strong>
                              {c.article ? ` (${c.article})` : ''}
                            </span>
                            {typeof c.score === 'number' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: '#d4d4d8',
                                  fontFamily: 'var(--mono)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Điểm {c.score.toFixed(2)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Khối Đề Xuất Hành Động (Confirm-Before-Write Action Card) */}
                  {msg.proposedAction && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '12px',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#d4d4d8',
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        <span>Đề xuất hành động (Confirm-before-write):</span>
                      </div>
                      <div style={{ color: 'var(--drawer-text)', marginBottom: '8px', lineHeight: 1.4 }}>
                        {msg.proposedAction.preview || `Hành động: ${msg.proposedAction.type}`}
                      </div>

                      {msg.proposedAction.args && (
                        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--mono)', fontSize: '11px', margin: '8px 0' }}>{JSON.stringify(msg.proposedAction.args, null, 2)}</pre>
                      )}
                      <p style={{ color: 'var(--drawer-muted)', margin: '8px 0', fontSize: '11px' }}>Bản nháp cần quản lý phê duyệt. Xác nhận chỉ lưu trạng thái trong phiên chat, chưa ghi dữ liệu.</p>
                      {msg.proposedAction.status === 'confirmed' ? (
                        <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 600 }}>
                          Đã xác nhận đề xuất. Chưa thực thi.
                        </div>
                      ) : msg.proposedAction.status === 'cancelled' ? (
                        <div style={{ color: 'var(--drawer-muted)', fontSize: '11px', fontWeight: 600 }}>
                          ✕ Đã từ chối hành động
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              handleActionConfirm(msg.id, true)
                            }
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              backgroundColor: '#52525b',
                              border: 'none',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'background-color 150ms ease',
                            }}
                          >
                            Xác nhận thực hiện
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleActionConfirm(msg.id, false)
                            }
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: 'var(--drawer-text)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'opacity 140ms var(--motion-ease-standard)',
                            }}
                          >
                            Hủy bỏ
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--drawer-muted)',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    padding: '0 4px',
                  }}
                >
                  {msg.timestamp}
                </div>
              </div>
            );
          })}

          {/* ChatGPT-Style Prompt Cards Grid on initial state */}
          {messages.length <= 1 && (
            <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--drawer-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                Gợi ý câu hỏi phổ biến:
              </div>
              {PROMPT_CHIPS.map((chip, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isTyping}
                  onClick={() => handleSend(chip)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    color: 'var(--drawer-text)',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'opacity 140ms var(--motion-ease-standard)',
                  }}
                  className="chat-prompt"
                  title={chip}
                >
                  <span style={{ whiteSpace: 'normal' }}>{chip}</span>
                  <span style={{ color: 'var(--drawer-text)', fontSize: '13px', fontWeight: 700 }}>→</span>
                </button>
              ))}
            </div>
          )}

          {isTyping && (
            <div
              role="status"
              style={{
                alignSelf: 'flex-start',
                padding: '10px 16px',
                borderRadius: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#e4e4e7',
                fontSize: '12px',
                fontFamily: 'var(--mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span className="size-2 rounded-full bg-zinc-400 animate-pulse"></span>
              <span>Đang phân tích dữ liệu ca trực...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {toast && <div role="status" style={{ margin: '8px 16px', padding: '16px', border: '1px solid var(--drawer-border)', borderRadius: '8px', background: 'var(--drawer-raised)', color: 'var(--drawer-success)', fontSize: '12px' }}>{toast}</div>}
        {/* Input Bar (ChatGPT-style) */}
        <div
          style={{
            padding: '14px 18px',
            borderTop: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-pill)',
            backgroundColor: 'var(--drawer-surface)',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            aria-label="Tin nhắn cho Guta AI"
            maxLength={2000}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Hỏi AI về ca trực, nhân sự, tiền két..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--drawer-text)',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#a1a1aa';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.12)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button
            type="button"
            disabled={isTyping || !inputText.trim()}
            onClick={() => handleSend()}
            style={{
              padding: '10px 18px',
              borderRadius: '12px',
              backgroundColor: isTyping || !inputText.trim() ? 'rgba(255, 255, 255, 0.12)' : '#52525b',
              border: 'none',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: isTyping || !inputText.trim() ? 'not-allowed' : 'pointer',
              opacity: isTyping || !inputText.trim() ? 0.6 : 1,
              transition: 'opacity 140ms var(--motion-ease-standard)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isTyping || !inputText.trim() ? 'none' : '0 2px 8px rgba(255, 255, 255, 0.08)',
            }}
            onMouseDown={(e) => {
              if (!isTyping && inputText.trim()) {
                e.currentTarget.style.transform = 'scale(0.96)';
              }
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {isTyping ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <svg className="animate-spin inline-block" width="13" height="13" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Đang gửi...</span>
              </span>
            ) : (
              'Gửi'
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
