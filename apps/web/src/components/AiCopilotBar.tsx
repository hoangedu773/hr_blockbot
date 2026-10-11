import React, { useState } from 'react';

interface AiCopilotBarProps {
  onSendMessage: (msg: string) => void;
  isLoading?: boolean;
}

export const AiCopilotBar: React.FC<AiCopilotBarProps> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0, 71, 186, 0.12), rgba(18, 23, 34, 0.9))',
      border: '1px solid rgba(0, 71, 186, 0.35)',
      borderRadius: '10px',
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
    }}>
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        background: 'var(--guta-blue)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0
      }}>
        <svg style={{ width: 14, height: 14, fill: 'currentColor' }} viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </div>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        disabled={isLoading}
        placeholder="Hỏi Trợ Lý AI Guta: 'Ai rảnh ca sáng mai?', 'Tra cứu quy chế thưởng Tết'..."
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: '13px',
          outline: 'none'
        }}
      />

      <button
        onClick={handleSend}
        disabled={isLoading}
        style={{
          background: 'var(--guta-yellow)',
          color: '#07090e',
          border: 'none',
          padding: '6px 14px',
          borderRadius: '5px',
          fontWeight: 700,
          fontSize: '11px',
          cursor: 'pointer'
        }}
      >
        {isLoading ? 'Đang gửi...' : 'Gửi ↵'}
      </button>

      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: '10px',
        background: 'rgba(255, 255, 255, 0.08)',
        padding: '3px 6px',
        borderRadius: '4px',
        color: 'var(--text-muted)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        ⌘K
      </span>
    </div>
  );
};
