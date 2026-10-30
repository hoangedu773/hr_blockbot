import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, API_BASE } from '../../services/auth';
import {
  type Citation,
  type ProposedAction,
  type Attachment,
  ROLE_CONFIG,
  ROLE_QUICK_REPLIES,
} from './ChatDrawer';

interface ChatPageViewProps {
  onSwitchTab: (tab: 'crm' | 'chat') => void;
  onLogout: () => void;
}

interface ChatComposerProps {
  isTyping: boolean;
  onSend: (text: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  isTyping,
  onSend,
  inputRef: externalRef,
}) => {
  const [input, setInput] = useState('');
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
  }, [input]);

  const handleSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="guta-chat-width" style={{ position: 'relative' }}>
      <form className="guta-chat-composer" onSubmit={handleSubmit}>
        <label htmlFor="copilot-message" className="sr-only">Tin nhắn cho Guta AI</label>
        <button type="button" className="chat-attach-btn" aria-label="Thao tác bổ sung" title="Nhập câu hỏi cho Guta AI" onClick={() => textareaRef.current?.focus()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14m-7-7h14" /></svg>
        </button>
        <textarea
          id="copilot-message"
          ref={textareaRef}
          rows={1}
          maxLength={4000}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Hỏi AI về ca trực, nhân sự, tiền két..."
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button className="chat-send" type="submit" aria-label="Gửi" disabled={isTyping || !input.trim()}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
        </button>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', padding: '0 4px', gap: '8px', flexWrap: 'wrap' }}>
        <p className="guta-chat-note" style={{ margin: 0, textAlign: 'left' }}>AI có thể nhầm lẫn. Kiểm tra nguồn trước khi quyết định.</p>
      </div>
    </div>
  );
};


interface Message {
  id: number;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  attachments?: Attachment[];
  proposedAction?: ProposedAction | null;
}

const TOPICS = [
  { title: 'Gợi ý điều động ca', prompt: 'Chi nhánh nào đang thiếu người ca trưa nay?' },
  { title: 'Quy định kỷ luật', prompt: 'Kiểm tra quy định đi trễ quá 15 phút' },
  { title: 'Báo cáo két ca', prompt: 'Tổng hợp doanh thu két sáng toàn chuỗi' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Server-provided URLs end up in href/src, so only plain web URLs and root-relative
 * paths are allowed. Anything else (javascript:, data:, vbscript:, file:, protocol
 * relative //host) returns null and the caller drops the attachment.
 */
function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * A reply the demo cannot render (network failure, timeout, 5xx or a payload that
 * breaks the contract) means the AI pipeline is unusable, not that the user did
 * something wrong. Only an explicit 4xx is treated as a request problem.
 */
function isServiceFault(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch() could not reach the server
  if (error instanceof Error && error.name === 'AbortError') return true; // 20s timeout
  const httpStatus = error instanceof Error ? /^Chat HTTP (\d{3})$/.exec(error.message) : null;
  if (httpStatus) return Number(httpStatus[1]) >= 500;
  return true; // invalid reply payload
}

function parseReply(value: unknown): Omit<Message, 'id' | 'sender'> & { conversationId?: string } {
  if (!isRecord(value) || typeof value.reply !== 'string' || !value.reply.trim()) {
    throw new Error('Invalid chat reply');
  }
  const citations: Citation[] = [];
  if (value.citations != null) {
    if (!Array.isArray(value.citations)) throw new Error('Invalid citations');
    for (const item of value.citations) {
      if (!isRecord(item) || typeof item.document !== 'string' || !item.document.trim()
        || (item.version !== undefined && typeof item.version !== 'string')
        || (item.article !== undefined && typeof item.article !== 'string')
        || (item.score !== undefined && (typeof item.score !== 'number' || !Number.isFinite(item.score)))) {
        throw new Error('Invalid citation');
      }
      citations.push({
        document: item.document,
        version: item.version as string | undefined,
        article: item.article as string | undefined,
        score: item.score as number | undefined,
      });
    }
  }
  const attachments: Attachment[] = [];
  if (value.attachments != null) {
    if (!Array.isArray(value.attachments)) throw new Error('Invalid attachments');
    for (const item of value.attachments) {
      if (!isRecord(item) || typeof item.title !== 'string' || typeof item.url !== 'string') {
        continue;
      }
      const url = safeUrl(item.url);
      if (!url) continue;
      attachments.push({
        title: item.title,
        type: item.type === 'image' ? 'image' : 'pdf',
        url,
        fileName: typeof item.fileName === 'string' && item.fileName ? item.fileName : url.split('/').pop() || 'document',
      });
    }
  }
  let proposedAction: ProposedAction | null = null;
  if (value.proposedAction != null) {
    const action = value.proposedAction;
    if (!isRecord(action) || typeof action.type !== 'string' || !action.type.trim()
      || (action.preview !== undefined && typeof action.preview !== 'string')
      || (action.actionId !== undefined && typeof action.actionId !== 'string')
      || (action.args !== undefined && !isRecord(action.args))) {
      throw new Error('Invalid proposed action');
    }
    proposedAction = {
      type: action.type,
      preview: action.preview as string | undefined,
      actionId: action.actionId as string | undefined,
      status: 'pending',
    };
  }
  if (value.conversationId != null && (typeof value.conversationId !== 'string' || !value.conversationId.trim())) {
    throw new Error('Invalid conversation ID');
  }
  return { text: value.reply, citations, attachments, proposedAction, conversationId: value.conversationId as string | undefined };
}



export const ChatPageView: React.FC<ChatPageViewProps> = ({ onSwitchTab, onLogout }) => {
  const { user } = useAuth();
  const currentRole: 'Admin' | 'Employee' = user?.role === 'Admin' ? 'Admin' : 'Employee';
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>();
  const nextId = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const cancelPending = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current?.abort();
    pending.current = null;
  };

  useEffect(() => {
    headingRef.current?.focus();
    return cancelPending;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (sidebarOpen) setSidebarOpen(false);
      else onSwitchTab('crm');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSwitchTab, sidebarOpen]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages, isTyping]);

  const newChat = () => {
    cancelPending();
    conversationId.current = undefined;
    setMessages([]);
    setIsTyping(false);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const send = (prompt: string) => {
    const text = prompt.trim();
    if (!text || text.length > 4000 || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setMessages((previous) => [...previous, { id: ++nextId.current, sender: 'user', text }]);
    setIsTyping(true);
    setSidebarOpen(false);
    // Preserve the delay and cancel it on reset/unmount before starting a request.
    timer.current = setTimeout(async () => {
      timer.current = null;
      const timeout = setTimeout(() => controller.abort(), 20000);
      let reply: ReturnType<typeof parseReply>;
      let unavailable = false;
      try {
        const response = await apiFetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationId: conversationId.current,
            role: currentRole,
            userContext: { role: currentRole },
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
        const data: unknown = await response.json();
        reply = parseReply(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ';
        unavailable = isServiceFault(err);
        reply = {
          text: `Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận (${message}). Vui lòng kiểm tra đường truyền và thử lại.`,
        };
      } finally {
        clearTimeout(timeout);
      }
      if (pending.current !== controller) return;
      pending.current = null;
      if (reply.conversationId) conversationId.current = reply.conversationId;
      setServiceUnavailable(unavailable);
      setMessages((previous) => [...previous, { ...reply, id: ++nextId.current, sender: 'assistant' }]);
      setIsTyping(false);
    }, 600);
  };

  const confirm = (id: number, approved: boolean) => {
    setMessages((previous) => previous.map((message) => message.id === id && message.proposedAction?.status === 'pending'
      ? { ...message, proposedAction: { ...message.proposedAction, status: approved ? 'confirmed' : 'cancelled' } }
      : message));
  };

  const composer = (
    <ChatComposer
      isTyping={isTyping}
      onSend={(text) => send(text)}
      inputRef={inputRef}
    />
  );

  return (
    <div className="guta-chat" data-testid="chat-page">
            <aside id="copilot-sidebar" className="guta-chat-sidebar" data-open={sidebarOpen} aria-label="Điều hướng Copilot">
        <div className="guta-chat-brand"><img className="guta-chat-logo" src="/assets/logos/guta-mark-pure.svg" alt="" />HR-BlockBot Workspace</div>
        <button className="chat-new" type="button" onClick={newChat}>+ New Chat</button>
        <nav aria-label="Gợi ý theo vai trò">
          <p>GỢI Ý · {ROLE_CONFIG[currentRole].badge.toUpperCase()}</p>
          {ROLE_QUICK_REPLIES[currentRole].map((item) => (
            <button
              type="button"
              key={item.label}
              disabled={isTyping}
              title={item.prompt}
              onClick={() => send(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <nav aria-label="Chủ đề mẫu">
          <p>CHỦ ĐỀ MẪU</p>
          {TOPICS.map((topic) => (
            <button type="button" key={topic.title} disabled={isTyping} onClick={() => send(topic.prompt)}>
              {topic.title}
            </button>
          ))}
        </nav>
        <footer>
          <button className="chat-back-crm" type="button" onClick={() => onSwitchTab('crm')}>Quay lại Vận Hành (CRM)</button>
          <button type="button" aria-label="Đăng Xuất Phiên" onClick={onLogout}>Đăng xuất</button>
        </footer>
      </aside>
      <main className="guta-chat-main" aria-label="HR-BlockBot AI Copilot">
        <header className="guta-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="chat-menu" type="button" aria-label="Menu Copilot" aria-expanded={sidebarOpen} aria-controls="copilot-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div className="guta-chat-header-title">
              <strong>HR-BlockBot AI Copilot</strong>
              <span>{ROLE_CONFIG[currentRole].label}</span>
            </div>
          </div>
          <div className="guta-chat-header-actions">
            <div className="guta-verified-badge">
              <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }} />
              <span style={{ fontWeight: 600, color: 'var(--chat-text)' }}>
                {user?.role === 'Admin' ? 'Quản trị viên (Admin)' : 'Nhân viên (Employee)'}
              </span>
            </div>
            <button type="button" aria-label="Quay lại CRM" onClick={() => onSwitchTab('crm')}>CRM</button>
          </div>
        </header>
        {serviceUnavailable && (
          <div className="guta-chat-banner" data-testid="chat-service-unavailable">
            <strong>Demo an toàn · Dịch vụ AI chưa khả dụng</strong>
            <p>Bạn vẫn xem được dữ liệu CRM; phần trả lời AI cần backend.</p>
          </div>
        )}
        {messages.length === 0 ? (
          <section className="guta-chat-empty" aria-label="Bắt đầu hội thoại">
            <div className="guta-chat-width">
              <div className="guta-chat-hero">
                <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" />
                <h1 ref={headingRef} tabIndex={-1}>Chào mừng HR-BlockBot AI Copilot</h1>
                <p>Cùng bạn điều phối ca trực, tra cứu nhân sự và đối soát tiền két.</p>
              </div>
              {composer}
              <div className="guta-chat-prompts" aria-label="Gợi ý hành động nhanh theo vai trò">
                <div style={{ width: '100%', textAlign: 'center', marginBottom: '8px', fontSize: '11px', color: 'var(--chat-muted)', letterSpacing: '0.04em' }}>
                  GỢI Ý NHANH CHO {ROLE_CONFIG[currentRole].label.toUpperCase()} ({ROLE_CONFIG[currentRole].badge}):
                </div>
                {ROLE_QUICK_REPLIES[currentRole].map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    title={item.prompt}
                    onClick={() => send(item.prompt)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="guta-chat-body" role="log" aria-label="Hội thoại" aria-live="polite" aria-relevant="additions text">
              <div className="guta-chat-width">
                {messages.map((message) => (
                  <article className="guta-chat-message" data-sender={message.sender} key={message.id}>
                    <strong>{message.sender === 'user' ? 'Bạn' : 'Guta AI'}</strong>
                    <p>{message.text}</p>
                    {!!message.citations?.length && <section className="guta-chat-card" aria-label="Trích dẫn">
                      <strong>Căn cứ quy định (Citations)</strong>
                      <ul>{message.citations.map((citation, index) => <li key={index}>{citation.document}{citation.version ? ` · ${citation.version}` : ''}{citation.article ? ` · ${citation.article}` : ''}</li>)}</ul>
                    </section>}
                    {!!message.attachments?.length && (
                      <section className="guta-chat-card" aria-label="Tài liệu đính kèm" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <strong>Tài liệu & Biểu mẫu đính kèm (Attachments)</strong>
                        {message.attachments.map((att, index) => {
                          const isPdf = att.type === 'pdf';
                          return (
                            <div
                              key={index}
                              style={{
                                display: 'flex',
                                flexDirection: isPdf ? 'row' : 'column',
                                alignItems: isPdf ? 'center' : 'stretch',
                                justifyContent: isPdf ? 'space-between' : 'flex-start',
                                gap: '10px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              {isPdf ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <span style={{ background: '#dc2626', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 6px', borderRadius: '4px', flexShrink: 0 }}>PDF</span>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.title}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--chat-muted)' }}>
                                        <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '1px 5px', borderRadius: '4px', marginRight: '6px' }}>Biểu mẫu GUTA</span>
                                        {att.fileName}
                                      </div>
                                    </div>
                                  </div>
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      background: '#10b981',
                                      color: '#fff',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      textDecoration: 'none',
                                      whiteSpace: 'nowrap',
                                      flexShrink: 0,
                                    }}
                                  >
                                    Xem / Tải PDF
                                  </a>
                                </>
                              ) : (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>Ảnh tham chiếu</span>
                                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{att.title}</span>
                                  </div>
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <img src={att.url} alt={att.title} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', background: '#000', display: 'block' }} loading="lazy" />
                                  </a>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--chat-muted)' }}>
                                    <span>{att.fileName}</span>
                                    <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>Xem ảnh lớn ↗</a>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </section>
                    )}
                    {message.proposedAction && <section className="guta-chat-card" aria-label="Đề xuất hành động">
                      <strong>Đề xuất hành động (Confirm-before-write)</strong>
                      <p>{message.proposedAction.preview || message.proposedAction.type}</p>
                      <p>Chỉ ghi nhận lựa chọn tại giao diện. Chưa gửi lệnh hoặc thay đổi dữ liệu.</p>
                      {message.proposedAction.status === 'pending' ? <div className="guta-chat-actions">
                        <button className="chat-primary" type="button" onClick={() => confirm(message.id, true)}>Xác Nhận (Confirm)</button>
                        <button type="button" onClick={() => confirm(message.id, false)}>Từ Chối</button>
                      </div> : <p role="status">{message.proposedAction.status === 'confirmed' ? 'Đã xác nhận đề xuất. Chưa thực thi.' : 'Đã từ chối hành động. Không có dữ liệu nào bị thay đổi.'}</p>}
                    </section>}
                  </article>
                ))}
                {/* ponytail: CSS keyframes step carousel; add SSE streaming stage events when backend supports event-driven progress */}
                {isTyping && (
                  <div className="guta-chat-status" role="status">
                    <div className="guta-thinking-avatar" aria-hidden="true">
                      <img src="/assets/logos/guta-mark-pure.svg" alt="" />
                    </div>
                    <div className="guta-thinking-content">
                      <div className="guta-thinking-header">
                        <span className="guta-thinking-label">Đang phân tích dữ liệu ca trực...</span>
                        <span className="guta-thinking-dots" aria-hidden="true">
                          <span className="guta-thinking-dot" />
                          <span className="guta-thinking-dot" />
                          <span className="guta-thinking-dot" />
                        </span>
                      </div>
                      <div className="guta-thinking-steps" aria-hidden="true">
                        <span className="guta-thinking-step guta-step-1">Tra cứu quy chế Guta</span>
                        <span className="guta-thinking-step guta-step-2">Kiểm tra điều khoản</span>
                        <span className="guta-thinking-step guta-step-3">Soạn phản hồi</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>
            <div className="guta-chat-bottom">{composer}</div>
          </>
        )}
      </main>
    </div>
  );
};

export default ChatPageView;
