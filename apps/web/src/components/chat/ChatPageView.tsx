import { KpiActionDispatcher } from '../kpi-action-dispatcher';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from '../BrandMark';
import { ThemeToggle } from '../ThemeToggle';
import { apiFetch, API_BASE } from '../../services/auth';
import { newClientMessageId } from '../../services/api';
import { streamChat } from '../../services/chat-stream';
import { ChatConversationListSchema, ChatHistoryPageSchema, type ChatAction, type ChatConversationSummary, type ChatHistoryTurn } from '@hr-blockbot/contracts';
import type {
  Citation,
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
  performanceKpi?: ChatHistoryTurn['performanceKpi'];
  citations?: Citation[];
  attachments?: Attachment[];
  proposedAction?: ChatAction | null;
}

const TOPICS = [
  { title: 'Gợi ý điều động ca', prompt: 'Chi nhánh nào đang thiếu người ca trưa nay?' },
  { title: 'Quy định kỷ luật', prompt: 'Kiểm tra quy định đi trễ quá 15 phút' },
  { title: 'Báo cáo két ca', prompt: 'Tổng hợp doanh thu két sáng toàn chuỗi' },
];

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

export function safeAttachmentUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
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



export const ChatPageView: React.FC<ChatPageViewProps> = ({ onSwitchTab, onLogout }) => {
  const { user } = useAuth();
  const profileLabel = user?.authorization?.profile || 'Chưa cấp profile';
  const quickReplies = ['Tóm tắt nhiệm vụ tôi được phép xem', 'Xem thông tin hồ sơ của tôi', 'Tra cứu tài liệu đã được duyệt'].map((label) => ({ label, prompt: label }));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
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
    clearTimeout(timer.current!);
    timer.current = null;
    pending.current?.abort();
    pending.current = null;
    setIsStreaming(false);
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
    setIsStreaming(false);
    setAnnouncement('');
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
        : 'Lượt trả lời bị gián đoạn hoặc chưa thành công. Câu hỏi đã được lưu; bạn có thể gửi lại.', citations: turn.citations, proposedAction: turn.replyHidden ? null : turn.proposedAction, performanceKpi: turn.replyHidden ? undefined : turn.performanceKpi });
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
    cancelPending();
    historySequence.current++;
    turns.current.clear();
    setMessages([]);
    setIsTyping(false);
    setIsStreaming(false);
    setServiceUnavailable(false);
    conversationId.current = id;
    setSelectedConversation(id);
    setSidebarOpen(false);
    setMessageCursor(null);
    setHistoryError('');
    setAnnouncement('');
    void loadMessages(id);
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

  const send = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || text.length > 2000 || pending.current || isTyping) return;
    historySequence.current++;
    const controller = new AbortController();
    const clientMessageId = newClientMessageId();
    pending.current = controller;
    setMessages((previous) => [...previous, { id: clientMessageId + ':user', sender: 'user', text }]);
    setIsTyping(true);
    setIsStreaming(false);
    setSidebarOpen(false);
    setAnnouncement('Đang gửi tin nhắn...');

    let accumulatedText = '';
    let streamFailed = false;
    let streamDone = false;
    const timeout = setTimeout(() => controller.abort(), 45000);
    timer.current = timeout;

    try {
      await streamChat({
        message: text,
        conversationId: conversationId.current,
        clientMessageId,
        signal: controller.signal,
        onAccepted: (payload) => {
          if (pending.current !== controller) return;
          if (payload.conversationId) {
            conversationId.current = payload.conversationId;
            setSelectedConversation(payload.conversationId);
          }
        },
        onChunk: (delta) => {
          if (pending.current !== controller) return;
          accumulatedText += delta;
          setIsStreaming(true);
          setMessages((previous) => {
            const assistantId = clientMessageId + ':assistant';
            const existingIndex = previous.findIndex((m) => m.id === assistantId);
            if (existingIndex >= 0) {
              const updated = [...previous];
              updated[existingIndex] = { ...updated[existingIndex], text: accumulatedText };
              return updated;
            }
            return [...previous, { id: assistantId, sender: 'assistant', text: accumulatedText }];
          });
        },
        onDone: (saved) => {
          if (pending.current !== controller) return;
          streamDone = true;
          setIsStreaming(false);
          conversationId.current = saved.conversationId;
          setSelectedConversation(saved.conversationId);
          mergeTurns([saved.turn]);
          setIsTyping(['QUEUED', 'PENDING'].includes(saved.turn.status));
          setServiceUnavailable(saved.turn.status === 'FAILED');
          setAnnouncement(`Guta AI: ${saved.turn.reply || 'Đã nhận phản hồi.'}`);
          void loadConversations();
        },
        onError: (errPayload) => {
          if (pending.current !== controller) return;
          streamFailed = true;
          setMessages((previous) => [
            ...previous.filter((m) => m.id !== clientMessageId + ':assistant'),
            { id: ++nextId.current, sender: 'assistant', text: errPayload.message || 'Lỗi kết nối máy chủ' },
          ]);
          setServiceUnavailable(errPayload.code === 'AI_SERVICE_UNAVAILABLE' || errPayload.code === 'LLM_UNAVAILABLE');
          setAnnouncement(`Lỗi: ${errPayload.message || 'Lỗi kết nối máy chủ'}`);
          setIsTyping(false);
          setIsStreaming(false);
        },
      });
    } catch (err: unknown) {
      if (pending.current !== controller) return;
      if (!streamFailed) {
        const message = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ';
        const unavailable = isServiceFault(err);
        setServiceUnavailable(unavailable);
        setMessages((previous) => [
          ...previous.filter((m) => m.id !== clientMessageId + ':assistant'),
          {
            id: ++nextId.current,
            sender: 'assistant',
            text: `Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận (${message}). Vui lòng kiểm tra đường truyền và thử lại.`,
          },
        ]);
        setAnnouncement(`Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận (${message}). Vui lòng kiểm tra đường truyền và thử lại.`);
        setIsTyping(false);
        setIsStreaming(false);
      }
    } finally {
      clearTimeout(timeout);
      if (timer.current === timeout) {
        timer.current = null;
      }
      if (pending.current === controller) {
        pending.current = null;
        if (!streamDone) {
          setIsTyping(false);
        }
        setIsStreaming(false);
      }
    }
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
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
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
            <div className="guta-chat-body" role="log" aria-label="Hội thoại">
              <div className="guta-chat-width">
                {messages.map((message) => (
                  <article className="guta-chat-message" data-sender={message.sender} key={message.id}>
                    <strong>{message.sender === 'user' ? 'Bạn' : 'Guta AI'}</strong>
                    <p>{message.text}</p>
                    {message.performanceKpi&&<section className="guta-chat-card" aria-label="Giải thích KPI hiệu suất"><strong>{['FINAL','CORRECTED'].includes(message.performanceKpi.status)?'Điểm chính thức':'Điểm tạm tính'} · {message.performanceKpi.period}</strong><p>{message.performanceKpi.score==null?'Chưa đủ dữ liệu':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(message.performanceKpi.score)+' / 100'}</p><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{[['detail','Xem chi tiết'],...(message.performanceKpi.canReconsider?[['reconsideration','Kiến nghị']]:[]),...(message.performanceKpi.canAppeal?[['appeal','Khiếu nại']]:[])].map(([kind,label])=><button type="button" className="btn" key={kind} onClick={()=>{sessionStorage.setItem('performance-kpi-navigation',JSON.stringify({id:message.performanceKpi!.evaluationId,period:message.performanceKpi!.period,kind}));onSwitchTab('crm');}}>{label}</button>)}</div><small>Mở đúng hồ sơ để xem hoặc điền yêu cầu; bạn xác nhận trước khi gửi.</small></section>}
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
                          const safeHref = safeAttachmentUrl(att.url);
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
                                  {safeHref && (
                                    <a
                                      href={safeHref}
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
                                  )}
                                </>
                              ) : (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>Ảnh tham chiếu</span>
                                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{att.title}</span>
                                  </div>
                                  {safeHref && (
                                    <a href={safeHref} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                      <img src={safeHref} alt={att.title} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', background: '#000', display: 'block' }} loading="lazy" />
                                    </a>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--chat-muted)' }}>
                                    <span>{att.fileName}</span>
                                    {safeHref && <a href={safeHref} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>Xem ảnh lớn ↗</a>}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </section>
                    )}
                    {message.proposedAction && (
                      <KpiActionDispatcher key={message.proposedAction.actionId} action={message.proposedAction} />
                    )}
                  </article>
                ))}
                {/* ponytail: CSS keyframes step carousel; add SSE streaming stage events when backend supports event-driven progress */}
                {isTyping && !isStreaming && (
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
