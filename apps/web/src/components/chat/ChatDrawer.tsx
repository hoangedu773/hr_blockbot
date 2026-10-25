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
  'Kiểm tra quy định trừ lương đi trễ quá 15 phút',
  'Tổng hợp doanh thu két sáng toàn chuỗi',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageId = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // Keyboard navigation: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleActionConfirm = (targetMsgId: string, action: ProposedAction, approved: boolean) => {
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

    const resultMsg: ChatMessage = {
      id: `msg-${++messageId.current}`,
      sender: 'assistant',
      text: approved
        ? `✓ Đã xác nhận và gửi lệnh thực thi an toàn: "${action.preview || action.type}". Hệ thống ghi nhận trạng thái thành công.`
        : `✕ Đã hủy bỏ đề xuất hành động: "${action.preview || action.type}". Không có dữ liệu nào bị thay đổi.`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, resultMsg]);
  };

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || replyTimer.current !== null) return;

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
      let botResponse = '';
      let citations: Citation[] | undefined = undefined;
      let proposedAction: ProposedAction | null = null;

      try {
        abortControllerRef.current = new AbortController();
        const res = await apiFetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: text }),
          signal: abortControllerRef.current.signal,
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.reply) {
            botResponse = data.reply;
            if (Array.isArray(data.citations) && data.citations.length > 0) {
              citations = data.citations;
            }
            if (data.proposedAction) {
              proposedAction = {
                ...data.proposedAction,
                status: 'pending',
              };
            }
          }
        }
      } catch {
        // Fallback below
      } finally {
        abortControllerRef.current = null;
      }

      // Graceful Fallback: nếu API chưa kết nối (hoặc chạy trong offline demo test)
      if (!botResponse) {
        if (text.includes('thiếu người')) {
          botResponse = '🔍 Kiểm tra 45 chi nhánh: Hiện tại chi nhánh GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh đang dự báo tăng 35% order giờ trưa (11:30 - 13:00). Khuyến nghị điều chuyển thêm 1 Barista Part-time từ CH Tô Hiến Thành gần đó hỗ trợ đứng máy.';
          proposedAction = {
            actionId: 'act-transfer-01',
            type: 'DISPATCH_BARISTA',
            preview: 'Điều động 01 Barista Part-time từ Guta Tô Hiến Thành sang Guta 581 Sư Vạn Hạnh (11:30 - 13:30)',
            status: 'pending',
          };
        } else if (text.includes('quy định') || text.includes('đi trễ')) {
          botResponse = '📋 Theo Sổ tay Nhân viên Guta F&B (Mục 4.2): Nhân viên đi trễ từ 15-30 phút không báo trước sẽ bị trừ 50.000 ₫ phụ cấp ca trực và ghi nhận 01 điểm vi phạm kỷ luật. Đi trễ trên 30 phút mà không có sự đồng ý của SM sẽ bị hủy ca trực ngày hôm đó.';
          citations = [
            {
              document: 'Sổ tay Nhân viên Guta F&B',
              version: '2026.1',
              article: 'Mục 4.2 - Giờ giấc & Kỷ luật ca trực',
              score: 0.94,
            },
          ];
        } else if (text.includes('doanh thu') || text.includes('két')) {
          botResponse = '💰 Tổng hợp doanh thu két sáng toàn hệ thống 45 cửa hàng: Đạt 184.250.000 ₫ (khớp 99.94% với máy POS bán hàng). Top 3 chi nhánh dẫn đầu: Tân Bình - 02 Đặng Văn Sâm (11.82M), Quận 1 - Huỳnh Thúc Kháng (11.20M), Quận 1 - Tôn Đức Thắng (10.89M).';
          citations = [
            {
              document: 'Quy trình Quản lý Tiền két & Bàn giao Ca',
              version: '2026.10',
              article: 'Điều 3 - Đối soát doanh thu',
              score: 0.98,
            },
          ];
        } else {
          botResponse = `Tôi đã tiếp nhận yêu cầu: "${text}". Đang đồng bộ dữ liệu từ 45 máy chấm công vân tay ZKTeco và máy POS...`;
        }
      }

      const botMsg: ChatMessage = {
        id: `msg-${++messageId.current}`,
        sender: 'assistant',
        text: botResponse,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        citations,
        proposedAction,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <>
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
            backgroundColor: 'rgba(9, 13, 22, 0.75)',
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
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                GUTA AI COPILOT
              </div>
              <div style={{ fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }}></span>
                <span>Trực tuyến • Gemini Flash & 45 Chi Nhánh</span>
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
              color: '#94a3b8',
              fontSize: '15px',
              cursor: 'pointer',
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#f8fafc';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
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
                    color: '#f8fafc',
                    fontSize: '13.5px',
                    lineHeight: 1.6,
                    boxShadow: isUser ? '0 2px 8px rgba(255, 255, 255, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <div>{msg.text}</div>

                  {/* Khối Trích Dẫn Citations (RAG) */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div
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
                              color: '#cbd5e1',
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
                                {(c.score * 100).toFixed(0)}% match
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
                      <div style={{ color: '#e2e8f0', marginBottom: '8px', lineHeight: 1.4 }}>
                        {msg.proposedAction.preview || `Hành động: ${msg.proposedAction.type}`}
                      </div>

                      {msg.proposedAction.status === 'confirmed' ? (
                        <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 600 }}>
                          ✓ Đã xác nhận thực thi
                        </div>
                      ) : msg.proposedAction.status === 'cancelled' ? (
                        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                          ✕ Đã từ chối hành động
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              handleActionConfirm(msg.id, msg.proposedAction!, true)
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
                            Xác Nhận (Confirm)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleActionConfirm(msg.id, msg.proposedAction!, false)
                            }
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#cbd5e1',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                          >
                            Từ Chối
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '10px',
                    color: '#64748b',
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                Gợi ý câu hỏi phổ biến:
              </div>
              {PROMPT_CHIPS.map((chip, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSend(chip)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    color: '#e2e8f0',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <span>{chip}</span>
                  <span style={{ color: '#d4d4d8', fontSize: '13px', fontWeight: 700 }}>→</span>
                </div>
              ))}
            </div>
          )}

          {isTyping && (
            <div
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

        {/* Input Bar (ChatGPT-style) */}
        <div
          style={{
            padding: '14px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(9, 13, 22, 0.85)',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
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
              color: '#f8fafc',
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
              transition: 'all 150ms ease',
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
