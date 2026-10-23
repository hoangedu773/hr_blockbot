import React, { useState, useEffect } from 'react';

export interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-0',
    sender: 'assistant',
    text: 'Xin chào! Tôi là Guta AI Copilot — trợ lý điều hành ca trực và đối soát nhân sự chuỗi. Bạn cần hỗ trợ kiểm tra chi nhánh hoặc thông tin quy định nào hôm nay?',
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      let botResponse = '';
      if (text.includes('thiếu người')) {
        botResponse = '🔍 Kiểm tra 45 chi nhánh: Hiện tại chi nhánh GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh đang dự báo tăng 35% order giờ trưa (11:30 - 13:00). Khuyến nghị điều chuyển thêm 1 Barista Part-time từ CH Tô Hiến Thành gần đó hỗ trợ đứng máy.';
      } else if (text.includes('quy định') || text.includes('đi trễ')) {
        botResponse = '📋 Theo Sổ tay Nhân viên Guta F&B (Mục 4.2): Nhân viên đi trễ từ 15-30 phút không báo trước sẽ bị trừ 50.000 ₫ phụ cấp ca trực và ghi nhận 01 điểm vi phạm kỷ luật. Đi trễ trên 30 phút mà không có sự đồng ý của SM sẽ bị hủy ca trực ngày hôm đó.';
      } else if (text.includes('doanh thu') || text.includes('két')) {
        botResponse = '💰 Tổng hợp doanh thu két sáng toàn hệ thống 45 cửa hàng: Đạt 184.250.000 ₫ (khớp 99.94% với máy POS bán hàng). Top 3 chi nhánh dẫn đầu: Tân Bình - 02 Đặng Văn Sâm (11.82M), Quận 1 - Huỳnh Thúc Kháng (11.20M), Quận 1 - Tôn Đức Thắng (10.89M).';
      } else {
        botResponse = `Tôi đã tiếp nhận yêu cầu: "${text}". Đang đồng bộ dữ liệu từ 45 máy chấm công vân tay ZKTeco và máy POS...`;
      }

      const botMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: botResponse,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
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
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 80,
          transition: 'opacity 250ms ease, visibility 250ms ease',
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* Slide-over Chat Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Guta AI Copilot Drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(460px, 92vw)',
          backgroundColor: '#0f172a',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.8)',
          zIndex: 90,
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
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(9, 13, 22, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '16px',
              }}
            >
              ✨
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                GUTA AI COPILOT
              </div>
              <div style={{ fontSize: '10px', color: '#34d399', fontFamily: 'var(--mono)' }}>
                ● Sẵn sàng kết nối 45 CH
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng Chat Copilot"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
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
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    backgroundColor: isUser ? '#2563eb' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${isUser ? '#1d4ed8' : 'rgba(255, 255, 255, 0.08)'}`,
                    color: '#f8fafc',
                    fontSize: '13px',
                    lineHeight: 1.55,
                  }}
                >
                  {msg.text}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#64748b',
                    fontFamily: 'var(--mono)',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.timestamp}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '8px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#93c5fd',
                fontSize: '12px',
                fontFamily: 'var(--mono)',
              }}
            >
              Đang phân tích dữ liệu ca trực...
            </div>
          )}
        </div>

        {/* Prompt Chips */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            backgroundColor: 'rgba(9, 13, 22, 0.4)',
          }}
        >
          {PROMPT_CHIPS.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(chip)}
              style={{
                whiteSpace: 'nowrap',
                padding: '4px 10px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                color: '#93c5fd',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.22)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.25)';
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(9, 13, 22, 0.8)',
            display: 'flex',
            gap: '8px',
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
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#2563eb',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Gửi
          </button>
        </div>
      </aside>
    </>
  );
};
