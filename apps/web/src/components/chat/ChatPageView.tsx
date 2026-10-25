import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, API_BASE } from '../../services/auth';
import type { Citation, ProposedAction } from './ChatDrawer';

interface ChatPageViewProps {
  onSwitchTab: (tab: 'crm' | 'chat') => void;
  onLogout: () => void;
}

interface Message {
  id: number;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  proposedAction?: ProposedAction | null;
  demo?: boolean;
}

const TOPICS = [
  { title: 'Gợi ý điều động ca', prompt: 'Chi nhánh nào đang thiếu người ca trưa nay?' },
  { title: 'Quy định kỷ luật', prompt: 'Kiểm tra quy định đi trễ quá 15 phút' },
  { title: 'Báo cáo két ca', prompt: 'Tổng hợp doanh thu két sáng toàn chuỗi' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  return { text: value.reply, citations, proposedAction, conversationId: value.conversationId as string | undefined };
}

function demoReply(text: string): Omit<Message, 'id' | 'sender'> {
  const query = text.toLocaleLowerCase('vi-VN');
  if (query.includes('thiếu người') || query.includes('điều động')) {
    return {
      text: 'Chưa có dữ liệu ca trực trực tiếp. Trong bản demo, bạn có thể xem trước đề xuất bổ sung Barista cho ca thiếu người. Cần kiểm tra lịch ca và sự đồng ý của quản lý trước khi điều động.',
      demo: true,
      proposedAction: { type: 'DISPATCH_BARISTA', preview: 'Minh họa đề xuất điều động Barista hỗ trợ ca thiếu người; chưa chọn nhân viên hoặc chi nhánh.', status: 'pending' },
    };
  }
  if (query.includes('quy định') || query.includes('đi trễ') || query.includes('kỷ luật')) {
    return {
      text: 'Chưa truy xuất được chính sách đã xác thực. Không thể kết luận mức phạt hoặc trừ lương. Hãy đối chiếu quy định hiện hành với bộ phận nhân sự; nguồn dưới đây chỉ minh họa cách hiển thị trích dẫn.',
      demo: true,
      citations: [{ document: 'Tài liệu minh họa — không phải chính sách có hiệu lực', article: 'Giờ giấc và kỷ luật ca trực' }],
    };
  }
  if (query.includes('doanh thu') || query.includes('két')) {
    return {
      text: 'Chưa kết nối được báo cáo két ca. Không có số doanh thu đã xác thực để tổng hợp. Hãy đối soát báo cáo POS và biên bản bàn giao ca trước khi chốt két.',
      demo: true,
      citations: [{ document: 'Tài liệu minh họa — không phải báo cáo thực tế', article: 'Đối soát doanh thu và bàn giao ca' }],
    };
  }
  return { text: 'Chưa kết nối được dịch vụ AI. Đây là chế độ demo, không truy xuất hoặc thay đổi dữ liệu thật. Bạn có thể thử lại hoặc chọn một chủ đề mẫu.', demo: true };
}

const styles = `
.guta-chat {
  animation: guta-view-enter 220ms cubic-bezier(0.23, 1, 0.32, 1) both;
  --chat-bg: #171717; --chat-sidebar: #111111; --chat-card: #1e1e1e;
  --chat-text: #f5f5f5; --chat-muted: #b4b4b4; --chat-border: rgba(255, 255, 255, 0.1);
  --chat-accent: #ffffff; --chat-focus: rgba(255, 255, 255, 0.3); --chat-hover: rgba(255, 255, 255, 0.08);
  --chat-font: var(--font-sans, 'Geist', system-ui, sans-serif);
  display: flex; height: 100dvh; overflow: hidden; background: var(--chat-bg);
  color: var(--chat-text); font: 16px/1.6 var(--chat-font); color-scheme: dark;
}
.guta-chat *, .guta-chat *::before, .guta-chat *::after { box-sizing: border-box; }
.guta-chat button, .guta-chat textarea { font: inherit; color: inherit; }
.guta-chat button { min-height: 44px; min-width: 44px; cursor: pointer; border: 1px solid transparent; border-radius: 12px; background: transparent; padding: 8px 16px; text-align: left; }
.guta-chat button:focus-visible, .guta-chat textarea:focus-visible { outline: 2px solid var(--chat-focus); outline-offset: 3px; }
.guta-chat button:active:not(:disabled) { background: var(--chat-hover); }
.guta-chat button:disabled { opacity: .5; cursor: not-allowed; }
.guta-chat .chat-primary { background: var(--chat-accent); color: #000000; }
.guta-chat .chat-primary:active:not(:disabled), .guta-chat .chat-send:active:not(:disabled) { background: #dedede; }
.guta-chat-sidebar { width: 256px; flex-shrink: 0; background: var(--chat-sidebar); border-right: 1px solid var(--chat-border); display: flex; flex-direction: column; gap: 24px; padding: 24px 16px; overflow-y: auto; }
.guta-chat-brand { display: flex; align-items: center; gap: 8px; padding: 0 8px; font-weight: 700; }
.guta-chat-logo { width: 32px; height: 32px; object-fit: contain; }
.guta-chat-sidebar .chat-new { border-color: var(--chat-border); }
.guta-chat-sidebar nav { display: flex; flex-direction: column; gap: 8px; }
.guta-chat-sidebar nav p { margin: 0 0 8px; padding: 0 16px; font-size: 12px; color: var(--chat-muted); }
.guta-chat-sidebar nav button { font-size: 14px; white-space: nowrap; }
.guta-chat-sidebar footer { margin-top: auto; display: grid; gap: 8px; }
.guta-chat-sidebar footer button { font-size: 14px; padding: 8px; white-space: nowrap; }
.guta-chat .chat-back-crm { border-color: var(--chat-border); background: var(--chat-hover); transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.guta-chat .chat-back-crm:active:not(:disabled) { transform: scale(0.98); }
.guta-chat-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.guta-chat-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 72px; padding: 16px 24px; }
.guta-chat-header strong { font-size: 16px; }
.guta-chat-header span { font-size: 12px; color: var(--chat-muted); }
.guta-chat-header .chat-menu { display: none; }
.guta-chat-body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; }
.guta-chat-width { width: 100%; max-width: 768px; margin: 0 auto; }
.guta-chat-empty { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; justify-content: center; padding: 24px; }
.guta-chat-hero { text-align: center; margin-bottom: 32px; }
.guta-chat-hero img { width: 48px; height: 48px; margin: 0 auto 24px; object-fit: contain; }
.guta-chat h1, .guta-chat h1:focus, .guta-chat h1:focus-visible { outline: none !important; border: none !important; box-shadow: none !important; }
.guta-chat h1 { font-size: clamp(24px, 3vw, 32px); line-height: 1.25; font-weight: 600; font-style: normal; letter-spacing: -.03em; margin: 0 0 16px; }
.guta-chat-hero p { color: var(--chat-muted); margin: 0; }
.guta-chat-prompts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 24px; }
.guta-chat-prompts button { border-color: var(--chat-border); font-size: 14px; white-space: nowrap; border-radius: 999px; }
.guta-chat-composer { display: flex; align-items: center; gap: 10px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9999px; padding: 6px 8px 6px 14px; }
.guta-chat-composer:focus-within { border-color: rgba(255, 255, 255, 0.28); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4); }
.guta-chat .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.guta-chat-composer textarea { display: block; flex: 1; min-width: 0; min-height: 44px; max-height: 192px; resize: none; background: transparent; border: none !important; outline: none !important; box-shadow: none !important; padding: 10px 0; font-size: 14px; line-height: 24px; overflow-y: auto; }
.guta-chat-composer textarea::placeholder { color: var(--chat-muted); opacity: 1; }
.guta-chat .chat-send, .guta-chat .chat-attach-btn { flex-shrink: 0; border-radius: 9999px; width: 44px; height: 44px; min-width: 44px; min-height: 44px; border: none; padding: 0; display: flex; align-items: center; justify-content: center; }
.guta-chat .chat-attach-btn { color: rgba(255, 255, 255, 0.6); background: transparent; }
.guta-chat .chat-send { background: var(--chat-accent); color: #000000; transition: none; }
.guta-chat .chat-send:disabled { opacity: 1; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.3); }
.guta-chat-note { text-align: center; font-size: 12px; color: var(--chat-muted); margin: 16px 0 0; }
.guta-chat-bottom { padding: 16px 24px max(16px, env(safe-area-inset-bottom)); }
.guta-chat-message { margin-bottom: 32px; overflow-wrap: anywhere; }
.guta-chat-message > p { white-space: pre-wrap; margin: 8px 0 0; }
.guta-chat-message[data-sender="user"] { margin-left: auto; padding: 16px 24px; border-radius: 24px; background: var(--chat-card); width: fit-content; max-width: 90%; }
.guta-chat-message strong { font-size: 14px; }
.guta-chat-demo { display: block; font-size: 12px; color: var(--chat-muted); margin-top: 8px; }
.guta-chat-card { border: 1px solid var(--chat-border); border-radius: 16px; padding: 16px; margin-top: 16px; background: var(--chat-card); }
.guta-chat-card p { margin: 8px 0; }
.guta-chat-card ul { margin: 8px 0 0; padding-left: 24px; font-size: 14px; color: var(--chat-muted); }
.guta-chat-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.guta-chat-actions button { font-size: 14px; border-color: var(--chat-border); white-space: nowrap; }
.guta-chat-status { color: var(--chat-muted); margin: 16px 0; }
.guta-chat-sidebar, .guta-chat-body, .guta-chat-empty, .guta-chat textarea { scrollbar-width: thin; scrollbar-color: var(--chat-border) transparent; }
@media (hover: hover) and (pointer: fine) {
  .guta-chat button:hover:not(:disabled) { background: var(--chat-hover); }
  .guta-chat .chat-attach-btn:hover { color: var(--chat-accent); }
  .guta-chat .chat-primary:hover:not(:disabled), .guta-chat .chat-send:hover:not(:disabled) { background: #dedede; }
}
@media (max-width: 767px) {
  .guta-chat-sidebar { display: none; position: absolute; top: 72px; bottom: 0; left: 0; z-index: 2; width: min(280px, 100%); box-shadow: 16px 0 32px rgba(0, 0, 0, 0.25); }
  .guta-chat-sidebar[data-open="true"] { display: flex; }
  .guta-chat-header { padding: 8px 16px; }
  .guta-chat-header .chat-menu { display: block; }
  .guta-chat-header span { display: none; }
  .guta-chat-body, .guta-chat-empty { padding: 16px; }
  .guta-chat-empty { justify-content: safe center; }
  .guta-chat-bottom { padding: 8px 16px max(16px, env(safe-area-inset-bottom)); }
  .guta-chat-hero { margin-bottom: 24px; }
}
`;

export const ChatPageView: React.FC<ChatPageViewProps> = ({ onSwitchTab, onLogout }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
  }, [input, messages.length === 0]);

  const newChat = () => {
    cancelPending();
    conversationId.current = undefined;
    setMessages([]);
    setInput('');
    setIsTyping(false);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const send = (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || text.length > 4000 || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setMessages((previous) => [...previous, { id: ++nextId.current, sender: 'user', text }]);
    setInput('');
    setIsTyping(true);
    setSidebarOpen(false);
    // Preserve the delay and cancel it on reset/unmount before starting a request.
    timer.current = setTimeout(async () => {
      timer.current = null;
      const timeout = setTimeout(() => controller.abort(), 20000);
      let reply: ReturnType<typeof parseReply>;
      try {
        const response = await apiFetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, conversationId: conversationId.current }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
        const data: unknown = await response.json();
        reply = parseReply(data);
      } catch {
        // Demo replies never impersonate live records, policies or executed writes.
        reply = demoReply(text);
      } finally {
        clearTimeout(timeout);
      }
      if (pending.current !== controller) return;
      pending.current = null;
      if (reply.conversationId) conversationId.current = reply.conversationId;
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
    <div className="guta-chat-width">
      <form className="guta-chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <label htmlFor="copilot-message" className="sr-only">Tin nhắn cho Guta AI</label>
        <button type="button" className="chat-attach-btn" aria-label="Thao tác bổ sung" title="Nhập câu hỏi cho Guta AI" onClick={() => inputRef.current?.focus()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14m-7-7h14" /></svg>
        </button>
        <textarea id="copilot-message" ref={inputRef} rows={1} maxLength={4000} value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Hỏi AI về ca trực, nhân sự, tiền két..."
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }} />
        <button className="chat-send" type="submit" aria-label="Gửi" disabled={isTyping || !input.trim()}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
        </button>
      </form>
      <p className="guta-chat-note">AI có thể nhầm lẫn. Kiểm tra nguồn trước khi quyết định.</p>
    </div>
  );

  return (
    <div className="guta-chat" data-testid="chat-page">
      <style>{styles}</style>
      <aside id="copilot-sidebar" className="guta-chat-sidebar" data-open={sidebarOpen} aria-label="Điều hướng Copilot">
        <div className="guta-chat-brand"><img className="guta-chat-logo" src="/assets/logos/guta-mark-pure.svg" alt="" />HR-BlockBot Workspace</div>
        <button className="chat-new" type="button" onClick={newChat}>+ New Chat</button>
        <nav aria-label="Chủ đề mẫu">
          <p>CHỦ ĐỀ MẪU</p>
          {TOPICS.map((topic) => <button type="button" key={topic.title} disabled={isTyping} onClick={() => send(topic.prompt)}>{topic.title}</button>)}
        </nav>
        <footer>
          <button className="chat-back-crm" type="button" onClick={() => onSwitchTab('crm')}>Quay lại Vận Hành (CRM)</button>
          <button type="button" aria-label="Đăng Xuất Phiên" onClick={onLogout}>Đăng xuất</button>
        </footer>
      </aside>
      <main className="guta-chat-main" aria-label="HR-BlockBot AI Copilot">
        <header className="guta-chat-header">
          <button className="chat-menu" type="button" aria-label="Menu Copilot" aria-expanded={sidebarOpen} aria-controls="copilot-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <strong>HR-BlockBot AI Copilot</strong><span>Trợ lý vận hành · Xác nhận trước khi ghi</span>
          <button type="button" aria-label="Quay lại CRM" onClick={() => onSwitchTab('crm')}>CRM</button>
        </header>
        {messages.length === 0 ? (
          <section className="guta-chat-empty" aria-label="Bắt đầu hội thoại">
            <div className="guta-chat-width">
              <div className="guta-chat-hero">
                <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" />
                <h1 ref={headingRef} tabIndex={-1}>Chào mừng HR-BlockBot AI Copilot</h1>
                <p>Cùng bạn điều phối ca trực, tra cứu nhân sự và đối soát tiền két.</p>
              </div>
              {composer}
              <div className="guta-chat-prompts" aria-label="Gợi ý câu hỏi">
                {TOPICS.map((topic) => <button type="button" key={topic.title} onClick={() => send(topic.prompt)}>{topic.title}</button>)}
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
                    {message.demo && <span className="guta-chat-demo">Demo an toàn · Dịch vụ AI chưa khả dụng</span>}
                    <p>{message.text}</p>
                    {!!message.citations?.length && <section className="guta-chat-card" aria-label="Trích dẫn">
                      <strong>Căn cứ quy định (Citations)</strong>
                      <ul>{message.citations.map((citation, index) => <li key={index}>{citation.document}{citation.version ? ` · ${citation.version}` : ''}{citation.article ? ` · ${citation.article}` : ''}</li>)}</ul>
                    </section>}
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
                {isTyping && <p className="guta-chat-status" role="status">Đang phân tích dữ liệu ca trực...</p>}
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
