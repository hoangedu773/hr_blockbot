import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, API_BASE, getAuthUser } from '../../services/auth';
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

export interface Attachment {
  title: string;
  type: 'pdf' | 'image';
  url: string;
  fileName: string;
}


export type UserRole = 'Employee' | 'SM' | 'AOM' | 'Admin';

export const ROLE_CONFIG: Record<
  UserRole,
  { label: string; badge: string; desc: string; isManager: boolean }
> = {
  Employee: {
    label: 'Nhân viên',
    badge: 'Barista / NV',
    desc: 'Thao tác ca trực, biểu mẫu bàn giao & giải trình két',
    isManager: false,
  },
  SM: {
    label: 'Cửa hàng trưởng',
    badge: 'SM',
    desc: 'Quản lý cửa hàng, duyệt đổi ca & đối soát két',
    isManager: true,
  },
  AOM: {
    label: 'Quản lý khu vực',
    badge: 'AOM',
    desc: 'Điều phối cụm cửa hàng & xử lý chênh lệch quỹ',
    isManager: true,
  },
  Admin: {
    label: 'Ban điều hành',
    badge: 'Admin',
    desc: 'Toàn quyền quản trị quy chế & đối soát toàn chuỗi',
    isManager: true,
  },
};

export function getSafeUserRole(): UserRole {
  try {
    const authUser = typeof getAuthUser === 'function' ? getAuthUser() : null;
    return authUser?.role === 'Admin' ? 'Admin' : 'Employee';
  } catch {
    return 'Employee';
  }
}

export const ROLE_QUICK_REPLIES: Record<
  UserRole,
  Array<{ label: string; prompt: string; desc?: string }>
> = {
  Employee: [
    {
      label: 'Xem cách ghi mẫu bàn giao',
      prompt: 'Xem cách ghi mẫu biên bản bàn giao công việc và tài sản tại cửa hàng Guta',
      desc: 'Hướng dẫn ghi biểu mẫu bàn giao ca & tài sản',
    },
    {
      label: 'Hướng dẫn xin đổi ca',
      prompt: 'Hướng dẫn xin đổi ca trực: quy trình, điều kiện và thời hạn báo trước 4 tiếng',
      desc: 'Báo trước 4 tiếng, tìm người thay thế',
    },
    {
      label: 'Giải trình chênh lệch két',
      prompt: 'Quy trình xử lý chênh lệch két tiền và hướng dẫn viết bản giải trình trong 48 giờ',
      desc: 'Lập biên bản và giải trình trong 48h',
    },
    {
      label: 'Quy định tác phong & đi trễ',
      prompt: 'Quy định tác phong, đồng phục và mức chế tài khi đi trễ quá 15 phút tại Guta',
      desc: 'Đồng phục, nón, tạp dề và đi trễ >15p',
    },
  ],
  SM: [
    {
      label: 'Checklist xác nhận bàn giao',
      prompt: 'Checklist kiểm tra và xác nhận biên bản bàn giao ca, tài sản của Cửa hàng trưởng (SM)',
      desc: 'Checklist kiểm tra đối soát bàn giao cho SM',
    },
    {
      label: 'Biên bản kiểm quỹ & xử lý chênh lệch',
      prompt: 'Biên bản kiểm quỹ đột xuất và thẩm quyền xử lý chênh lệch quỹ két của Quản lý cửa hàng',
      desc: 'Thẩm quyền xử lý chênh lệch két trong hạn mức',
    },
    {
      label: 'Quy trình duyệt đổi ca & thiếu người',
      prompt: 'Quy trình phê duyệt đơn đổi ca của nhân viên và phương án điều động khi ca trực thiếu người',
      desc: 'Duyệt đổi ca & điều động khi thiếu Barista',
    },
    {
      label: 'Báo cáo doanh thu & chốt két',
      prompt: 'Quy trình đối soát doanh thu POS, chốt két ca và bàn giao tiền mặt cuối ngày',
      desc: 'Đối soát POS và bàn giao tiền mặt cuối ngày',
    },
  ],
  AOM: [
    {
      label: 'Checklist xác nhận bàn giao',
      prompt: 'Checklist kiểm tra và xác nhận biên bản bàn giao ca, tài sản của Quản lý khu vực (AOM)',
      desc: 'Đối soát bàn giao cụm cửa hàng',
    },
    {
      label: 'Biên bản kiểm quỹ & xử lý chênh lệch',
      prompt: 'Biên bản kiểm quỹ đột xuất và thẩm quyền xử lý chênh lệch quỹ két vượt hạn mức SM',
      desc: 'Xử lý chênh lệch quỹ két vượt hạn mức SM',
    },
    {
      label: 'Quy trình duyệt đổi ca & thiếu người',
      prompt: 'Quy trình phê duyệt đổi ca cụm chi nhánh và điều phối nhân sự khu vực',
      desc: 'Điều phối nhân sự liên chi nhánh',
    },
    {
      label: 'Báo cáo doanh thu & chốt két',
      prompt: 'Quy trình đối soát doanh thu chuỗi chi nhánh và chốt két ca khu vực',
      desc: 'Đối soát doanh thu cụm chi nhánh',
    },
  ],
  Admin: [
    {
      label: 'Checklist xác nhận bàn giao',
      prompt: 'Checklist kiểm tra và xác nhận biên bản bàn giao ca, tài sản toàn chuỗi Guta',
      desc: 'Quy chuẩn bàn giao tài sản toàn chuỗi',
    },
    {
      label: 'Biên bản kiểm quỹ & xử lý chênh lệch',
      prompt: 'Quy trình kiểm quỹ, đối soát tài chính và xử lý gian lận chênh lệch két',
      desc: 'Quy chuẩn kiểm quỹ và đối soát tài chính',
    },
    {
      label: 'Quy trình duyệt đổi ca & thiếu người',
      prompt: 'Chính sách điều động nhân sự chuỗi 45 chi nhánh và quy trình duyệt ca đặc biệt',
      desc: 'Chính sách điều động chuỗi 45 chi nhánh',
    },
    {
      label: 'Báo cáo doanh thu & chốt két',
      prompt: 'Tổng hợp đối soát doanh thu POS và chốt két toàn chuỗi 45 cửa hàng Guta',
      desc: 'Tổng hợp doanh thu chuỗi 45 cửa hàng',
    },
  ],
};

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citations?: Citation[];
  attachments?: Attachment[];
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
  const attachments: Attachment[] = [];
  for (const item of Array.isArray(value.attachments) ? value.attachments : []) {
    if (!isRecord(item) || typeof item.title !== 'string' || typeof item.url !== 'string') continue;
    const type = item.type === 'image' ? 'image' : 'pdf';
    attachments.push({
      title: item.title,
      type,
      url: item.url,
      fileName: typeof item.fileName === 'string' && item.fileName ? item.fileName : item.url.split('/').pop() || 'document',
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
    attachments,
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
    text: 'Xin chào! Tôi là trợ lý HR BlockBot — hỗ trợ điều hành ca trực và đối soát nhân sự chuỗi 45 chi nhánh. Bạn cần kiểm tra ca trực, nhân sự hay quỹ két nào hôm nay?',
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
  const authUser = typeof getAuthUser === 'function' ? getAuthUser() : null;
  const role: UserRole = authUser?.role === 'Admin' ? 'Admin' : 'Employee';
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
      let attachments: Attachment[] = [];
      let proposedAction: ProposedAction | null = null;
      let retryText: string | undefined;
      try {
        const res = await apiFetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: text,
            conversationId: conversationId.current,
            role,
            userContext: { role },
          }),
        });

        if (!res.ok) throw new Error('CHAT_UNAVAILABLE');
        const data = parseReply(await res.json());
        if (controller.signal.aborted) return;
        botResponse = data.reply;
        citations = data.citations;
        attachments = data.attachments;
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
        attachments,
        proposedAction,
        retryText,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 600);
  };

  // The panel stays mounted while closed: unmounting on close would skip the
  // 180ms exit entirely and leave the asymmetry as decoration. `visibility`
  // (not `display`) keeps it out of the a11y tree and out of layout overflow.
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="guta-chat-drawer-backdrop"
        data-state={isOpen ? 'open' : 'closed'}
      />

      {/* Slide-over Chat Panel */}
      <aside
        ref={dialogRef}
        className="guta-chat-drawer"
        data-state={isOpen ? 'open' : 'closed'}
        role="dialog"
        aria-modal="true"
        aria-label="Trợ lý HR BlockBot"
      >
        {/* Header */}
        <div className="guta-chat-drawer-header">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trợ lý"
            className="guta-chat-drawer-close"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div style={{ order: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              }}
            >
              <img src="/assets/logos/guta-mark-pure.svg" alt="Guta Logo" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--drawer-text)', letterSpacing: '-0.01em' }}>
                TRỢ LÝ HR BLOCKBOT
              </div>
              <div style={{ fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }}></span>
                <span>{ROLE_CONFIG[role].label}</span>
              </div>
            </div>
          </div>


        </div>

        {/* Verified Session Role Badge */}
        <div className="guta-chat-drawer-session">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--drawer-muted)' }}>
            <span>Phiên xác thực:</span>
          </div>
          <div className="guta-verified-badge">
            <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }} />
            <span style={{ fontWeight: 600, color: 'var(--drawer-text, #f5f5f5)' }}>
              {role === 'Admin' ? 'Quản trị viên (Admin)' : 'Nhân viên (Employee)'}
            </span>
          </div>
        </div>
        {/* Message Log */}
        <div className="guta-chat-log">
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
                  className={isUser ? 'guta-chat-bubble guta-chat-bubble--user' : 'guta-chat-bubble'}
                >
                  <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{isUser ? msg.text : renderMarkdown(msg.text)}</div>
                  {msg.retryText && <button type="button" disabled={isTyping} onClick={() => handleSend(msg.retryText)} style={{ marginTop: '8px', color: 'var(--drawer-text)', background: 'var(--drawer-raised)', border: '1px solid var(--drawer-border)', borderRadius: '8px', padding: '8px' }}>Thử lại</button>}

                  {/* Khối Trích Dẫn Citations (RAG) */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div
                      role="region"
                      aria-label="Trích dẫn"
                      className="guta-chat-citations"
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

                  {/* Khối Đính Kèm Tệp & Ảnh (Attachments) */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div
                      role="region"
                      aria-label="Tài liệu đính kèm"
                      style={{
                        marginTop: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {msg.attachments.map((att, idx) => {
                        const isPdf = att.type === 'pdf';
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              flexDirection: isPdf ? 'row' : 'column',
                              alignItems: isPdf ? 'center' : 'stretch',
                              justifyContent: isPdf ? 'space-between' : 'flex-start',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '10px',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                            }}
                          >
                            {isPdf ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                  <div
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '6px',
                                      backgroundColor: '#dc2626',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#fff',
                                      fontWeight: 700,
                                      fontSize: '11px',
                                      flexShrink: 0,
                                    }}
                                  >
                                    PDF
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#f4f4f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {att.title}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                                      <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '1px 5px', borderRadius: '4px', marginRight: '6px', fontSize: '10px' }}>
                                        Biểu mẫu GUTA
                                      </span>
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
                                    backgroundColor: '#10b981',
                                    color: '#fff',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    flexShrink: 0,
                                    minHeight: '44px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                                  <span>Tải PDF</span>
                                </a>
                              </>
                            ) : (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                                    Ảnh tham chiếu
                                  </span>
                                  <span style={{ fontWeight: 600, fontSize: '12px', color: '#f4f4f5' }}>{att.title}</span>
                                </div>
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                                >
                                  <img
                                    src={att.url}
                                    alt={att.title}
                                    style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', backgroundColor: '#000', display: 'block' }}
                                    loading="lazy"
                                  />
                                </a>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: '#a1a1aa' }}>
                                  <span>{att.fileName}</span>
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                  >
                                    Xem ảnh lớn ↗
                                  </a>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Khối Đề Xuất Hành Động (Confirm-Before-Write Action Card) */}
                  {msg.proposedAction && (
                    <div className="guta-chat-proposal">
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
                        <div style={{ color: 'var(--drawer-muted)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          <span>Đã từ chối hành động</span>
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
                              transition: 'background-color var(--t-press) var(--ease-out)',
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
                              transition: 'opacity var(--t-press) var(--ease-out)',
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
            <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--drawer-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Hành động đề xuất ({ROLE_CONFIG[role].label}):
                </div>
                <div style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
                  {ROLE_CONFIG[role].desc}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ROLE_QUICK_REPLIES[role].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={isTyping}
                    onClick={() => handleSend(item.prompt)}
                    className="guta-chat-prompt"
                    title={item.prompt}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--drawer-text)', whiteSpace: 'normal' }}>{item.label}</span>
                      {item.desc && <span style={{ fontSize: '11px', color: 'var(--drawer-muted)', whiteSpace: 'normal' }}>{item.desc}</span>}
                    </div>
                    <span style={{ color: 'var(--drawer-text)', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>→</span>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--drawer-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' }}>
                Gợi ý câu hỏi phổ biến:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {PROMPT_CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={isTyping}
                    onClick={() => handleSend(chip)}
                    className="guta-chat-prompt guta-chat-prompt--ghost"
                    title={chip}
                  >
                    <span style={{ whiteSpace: 'normal' }}>{chip}</span>
                    <span style={{ color: 'var(--drawer-text)', fontSize: '13px', fontWeight: 700 }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ponytail: CSS keyframes step carousel; add SSE streaming stage events when backend supports event-driven progress */}
          {isTyping && (
            <div role="status" className="guta-chat-status">
              <div className="guta-thinking-avatar" aria-hidden="true">
                <img src="/assets/logos/guta-mark-pure.svg" alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
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
          <div ref={messagesEndRef} />
        </div>

        {toast && <div role="status" style={{ margin: '8px 16px', padding: '16px', border: '1px solid var(--drawer-border)', borderRadius: '8px', background: 'var(--drawer-raised)', color: 'var(--drawer-success)', fontSize: '12px' }}>{toast}</div>}
        {/* Input Bar (ChatGPT-style) */}
        <div className="guta-chat-drawer-composer">
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
            className="guta-chat-drawer-input"
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
              transition: 'opacity var(--t-press) var(--ease-out)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
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
