import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from '../BrandMark';
import { ThemeToggle } from '../ThemeToggle';
import { apiFetch, API_BASE } from '../../services/auth';
import { ChatConversationListSchema, ChatHistoryPageSchema, ChatHistorySendSchema, type ChatConversationSummary, type ChatHistoryTurn } from '@hr-blockbot/contracts';
import type {
  Citation,
  ProposedAction,
  Attachment,
} from '../../types/chat';

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
          maxLength={2000}
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
  id: number | string;
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

function messageId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  const profileLabel = user?.authorization?.profile || 'Chưa cấp profile';
  const quickReplies = ['Tóm tắt nhiệm vụ tôi được phép xem', 'Xem thông tin hồ sơ của tôi', 'Tra cứu tài liệu đã được duyệt'].map((label) => ({ label, prompt: label }));
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
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null), [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | undefined>();
  const [historyError, setHistoryError] = useState(''), [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatConversationSummary | null>(null), [deleting, setDeleting] = useState(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const historySequence = useRef(0), listSequence = useRef(0), turns = useRef(new Map<string, ChatHistoryTurn>());
  const owner = useRef(user?.id); owner.current = user?.id;

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
      if (deleteTarget) return;
      if (sidebarOpen) setSidebarOpen(false);
      else onSwitchTab('crm');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSwitchTab, sidebarOpen, deleteTarget]);
  useEffect(() => { if (!deleteTarget) return; const dialog = deleteDialog.current; dialog?.showModal(); return () => dialog?.close(); }, [deleteTarget]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages, isTyping]);

  const newChat = (focus = true) => {
    cancelPending();
    historySequence.current++;
    turns.current.clear(); setSelectedConversation(undefined); setMessageCursor(null); setHistoryError(''); setHistoryLoading(false);
    conversationId.current = undefined;
    setMessages([]);
    setIsTyping(false);
    setSidebarOpen(false);
    if (focus) inputRef.current?.focus();
  };

  const mergeTurns = (items: ChatHistoryTurn[]) => {
    for (const turn of items) turns.current.set(turn.id, turn);
    const rows: Message[] = [];
    for (const turn of [...turns.current.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
      rows.push({ id: turn.id + ':user', sender: 'user', text: turn.userMessage });
      if (['QUEUED', 'PENDING'].includes(turn.status)) continue;
      rows.push({ id: turn.id + ':assistant', sender: 'assistant', text: turn.replyHidden
        ? 'Phản hồi cũ được ẩn vì quyền truy cập hoặc dữ liệu nguồn đã thay đổi. Bạn có thể hỏi lại với quyền hiện tại.'
        : turn.status === 'COMPLETED' ? turn.reply || 'Chưa tải được phản hồi đã lưu.'
        : 'Lượt trả lời bị gián đoạn hoặc chưa thành công. Câu hỏi đã được lưu; bạn có thể gửi lại.', citations: turn.citations });
    }
    setMessages(rows);
  };
  const loadConversations = async (before?: string) => {
    const seq = ++listSequence.current, userId = user?.id;
    try {
      const response = await apiFetch(`${API_BASE}/chat/conversations?limit=15${before ? '&before=' + encodeURIComponent(before) : ''}`);
      if (!response.ok) throw new Error();
      const data = ChatConversationListSchema.parse(await response.json());
      if (seq !== listSequence.current || owner.current !== userId) return [];
      setConversations(old => (before ? [...data.items, ...old.filter(item => !data.items.some(row => row.id === item.id))] : data.items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)));
      setListCursor(data.nextCursor); return data.items;
    } catch { if (seq === listSequence.current && owner.current === userId) setHistoryError('Chưa tải được lịch sử. Các tin nhắn gửi thành công vẫn được lưu trên hệ thống.'); return []; }
  };
  const loadMessages = async (id: string, before?: string, silent = false) => {
    const seq = historySequence.current, userId = user?.id;
    if (!silent) setHistoryLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/chat/conversations/${encodeURIComponent(id)}/messages?limit=15${before ? '&before=' + encodeURIComponent(before) : ''}`);
      if (response.status === 404 && seq === historySequence.current && conversationId.current === id && owner.current === userId) {
        newChat(false); setConversations(old => old.filter(item => item.id !== id)); setHistoryError('Hội thoại đã được xóa hoặc không còn truy cập được.'); return;
      }
      if (!response.ok) throw new Error();
      const data = ChatHistoryPageSchema.parse(await response.json());
      if (seq !== historySequence.current || conversationId.current !== id || owner.current !== userId) return;
      mergeTurns(data.items); if (!silent || before) setMessageCursor(data.nextCursor);
      setHistoryError(''); setIsTyping(data.items.some(turn => ['QUEUED', 'PENDING'].includes(turn.status)));
    } catch { if (seq === historySequence.current && owner.current === userId) setHistoryError('Chưa mở được hội thoại. Hãy tải lại hoặc chọn hội thoại khác.'); }
    finally { if (seq === historySequence.current && owner.current === userId && !silent) setHistoryLoading(false); }
  };
  const openConversation = (id: string) => {
    cancelPending(); historySequence.current++; turns.current.clear(); setMessages([]); setIsTyping(false); setServiceUnavailable(false);
    conversationId.current = id; setSelectedConversation(id); setSidebarOpen(false); setMessageCursor(null); setHistoryError(''); void loadMessages(id);
  };
  const removeConversation = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget, userId = user?.id;
    setDeleting(true); listSequence.current++;
    if (conversationId.current === target.id) { cancelPending(); historySequence.current++; }
    try {
      const response = await apiFetch(`${API_BASE}/chat/conversations/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      if (response.status !== 204 && response.status !== 404) throw new Error();
      if (owner.current !== userId) return;
      listSequence.current++;
      if (conversationId.current === target.id) newChat(false);
      setConversations(old => old.filter(item => item.id !== target.id)); setDeleteTarget(null); setHistoryError('');
      void loadConversations();
    } catch {
      if (owner.current === userId) { setDeleteTarget(null); setHistoryError('Chưa xóa được hội thoại. Vui lòng thử lại.');
        if (conversationId.current === target.id) { setIsTyping(false); void loadMessages(target.id, undefined, true); } }
    } finally { if (owner.current === userId) setDeleting(false); }
  };
  useEffect(() => {
    newChat(false); setConversations([]); setListCursor(null); setDeleteTarget(null); setDeleting(false);
    const seq = historySequence.current;
    void loadConversations().then(items => { if (seq === historySequence.current && items[0]) openConversation(items[0].id); });
    return () => { historySequence.current++; listSequence.current++; cancelPending(); };
  }, [user?.id]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'hidden') return; void loadConversations(); if (conversationId.current && !pending.current) void loadMessages(conversationId.current, undefined, true); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (isTyping && !pending.current) refresh(); }, 2000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [selectedConversation, isTyping, user?.id]);

  const send = (prompt: string) => {
    const text = prompt.trim();
    if (!text || text.length > 2000 || pending.current) return;
    historySequence.current++;
    const controller = new AbortController();
    const clientMessageId = messageId();
    pending.current = controller;
    setMessages((previous) => [...previous, { id: clientMessageId + ':user', sender: 'user', text }]);
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
            clientMessageId,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
        const data: unknown = await response.json();
        const saved = ChatHistorySendSchema.safeParse(data);
        if (saved.success) {
          if (pending.current !== controller) return;
          pending.current = null; conversationId.current = saved.data.conversationId; setSelectedConversation(saved.data.conversationId);
          mergeTurns([saved.data.turn]); setIsTyping(['QUEUED', 'PENDING'].includes(saved.data.turn.status));
          setServiceUnavailable(saved.data.turn.status === 'FAILED'); void loadConversations(); return;
        }
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

  const confirm = (id: number | string, approved: boolean) => {
    setMessages((previous) => previous.map((message) => message.id === id && message.proposedAction?.status === 'pending'
      ? { ...message, proposedAction: { ...message.proposedAction, status: approved ? 'confirmed' : 'cancelled' } }
      : message));
  };

  const composer = (
    <ChatComposer
      isTyping={isTyping || historyLoading}
      onSend={(text) => send(text)}
      inputRef={inputRef}
    />
  );

  return (
    <div className="guta-chat" data-testid="chat-page">
            <aside id="copilot-sidebar" className="guta-chat-sidebar" data-open={sidebarOpen} aria-label="Điều hướng hội thoại">
        <div className="guta-chat-brand"><BrandMark className="guta-chat-logo" alt="" />Guta Workspace</div>
        <button className="chat-new" type="button" onClick={() => newChat()}>Hội thoại mới</button>
        <nav className="guta-chat-history" aria-label="Lịch sử hội thoại"><p className="guta-chat-sidebar-label">Hội thoại gần đây</p>
          {!conversations.length && <p className="guta-chat-note">Chưa có hội thoại đã lưu.</p>}
          {conversations.map(item => <div className="guta-chat-history-row" key={item.id}>
            <button type="button" aria-current={selectedConversation === item.id ? 'page' : undefined} onClick={() => openConversation(item.id)} title={item.title}>{item.title}</button>
            <button className="guta-chat-history-delete" type="button" aria-label={`Xóa hội thoại ${item.title}`} title="Xóa hội thoại" disabled={deleting} onClick={() => setDeleteTarget(item)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" /></svg>
            </button>
          </div>)}
          {listCursor && <button type="button" onClick={() => void loadConversations(listCursor)}>Hội thoại cũ hơn</button>}
          <button type="button" title="Lấy hội thoại mới nhất từ server, kể cả thay đổi trên thiết bị khác" disabled={isTyping || historyLoading} onClick={() => { void loadConversations(); if (conversationId.current) void loadMessages(conversationId.current); }}>Tải lại lịch sử</button>
        </nav>
        {/* One nav, not two. The role quick replies already render in the centre
            column where the user is looking; repeating them here made the
            sidebar a second, competing menu. */}
        <nav aria-label="Câu hỏi nhanh">
          <p className="guta-chat-sidebar-label">Hỏi nhanh</p>
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
      {deleteTarget && <dialog ref={deleteDialog} className="guta-chat-delete-dialog" aria-labelledby="chat-delete-title" aria-describedby="chat-delete-description" onCancel={event => { if (deleting) event.preventDefault(); else setDeleteTarget(null); }}>
        <h2 id="chat-delete-title">Xóa hội thoại?</h2>
        <p id="chat-delete-description">Hội thoại “{deleteTarget.title}” và các tin nhắn bên trong sẽ bị xóa khỏi lịch sử của bạn. Bạn không thể hoàn tác trên ứng dụng.</p>
        <div className="guta-chat-delete-actions">
          <button type="button" autoFocus disabled={deleting} onClick={() => setDeleteTarget(null)}>Hủy</button>
          <button type="button" disabled={deleting} onClick={() => void removeConversation()}>{deleting ? 'Đang xóa…' : 'Xóa hội thoại'}</button>
        </div>
      </dialog>}
      <main className="guta-chat-main" aria-label="Chat">
        <header className="guta-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="chat-menu" type="button" aria-label="Mở danh sách hội thoại" aria-expanded={sidebarOpen} aria-controls="copilot-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div className="guta-chat-header-title">
              <strong>Chat</strong>
              <span>{profileLabel}</span>
            </div>
          </div>
          <div className="guta-chat-header-actions">
            <div className="guta-verified-badge">
              <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }} />
              <span style={{ fontWeight: 600, color: 'var(--chat-text)' }}>
                {profileLabel}
              </span>
            </div>
            <ThemeToggle className="theme-toggle--chat" />
            <button type="button" aria-label="Quay lại CRM" onClick={() => onSwitchTab('crm')}>CRM</button>
          </div>
        </header>
        {historyError && <p className="guta-chat-banner" role="status">{historyError}</p>}
        {historyLoading && <p className="guta-chat-note" role="status">Đang tải hội thoại đã lưu…</p>}
        {messageCursor && selectedConversation && <button type="button" className="btn" disabled={historyLoading} onClick={() => void loadMessages(selectedConversation, messageCursor)}>Xem tin nhắn cũ hơn</button>}
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
                <BrandMark alt="Guta Workspace" width={48} height={48} />
                <h1 ref={headingRef} tabIndex={-1}>Chào mừng đến HR BlockBot</h1>
                <p>Cùng bạn điều phối ca trực, tra cứu nhân sự và đối soát tiền két.</p>
              </div>
              {composer}
              <div className="guta-chat-prompts" aria-label="Gợi ý hành động nhanh theo vai trò">
                <div style={{ width: '100%', textAlign: 'center', marginBottom: '8px', fontSize: '11px', color: 'var(--chat-muted)', letterSpacing: '0.04em' }}>
                  GỢI Ý TRONG PHẠM VI ĐƯỢC CẤP ({profileLabel}):
                </div>
                {quickReplies.map((item) => (
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
                    {!!message.citations?.length && <details className="guta-chat-card guta-chat-citation-details" aria-label="Trích dẫn">
                      <summary>
                        <strong>Căn cứ quy định (Citations)</strong>
                        <svg className="guta-chat-citation-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                      </summary>
                      <ul>{message.citations.map((citation, index) => <li key={index}>{citation.document}{citation.version ? ` · ${citation.version}` : ''}{citation.article ? ` · ${citation.article}` : ''}</li>)}</ul>
                    </details>}
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
                      <img src="/assets/logos/guta-mark-white.svg" alt="" />
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
