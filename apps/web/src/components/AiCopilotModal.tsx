import React from 'react';

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onActionComplete?: (message: string) => void;
}

export const AiCopilotModal: React.FC<AiCopilotModalProps> = ({
  isOpen,
  onClose,
  query,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#0d111a',
          border: '1px solid rgba(255, 209, 0, 0.35)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90dvh',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 25px rgba(255, 209, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(14, 20, 32, 0.9)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'var(--guta-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              🤖
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                GUTA AI COPILOT
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--accent-primary)',
                    background: 'rgba(37, 99, 235, 0.12)',
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  TÍNH NĂNG ĐANG CẬP NHẬT
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                Kết nối dịch vụ AI (apps/ai-service) trong giai đoạn tiếp theo
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700, fontFamily: 'var(--mono)', marginBottom: '4px' }}>
              Câu hỏi tra cứu:
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              "{query}"
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              color: '#cbd5e1',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#fbbf24', fontWeight: 700, fontFamily: 'var(--mono)' }}>
              <span>ℹ️ THÔNG BÁO TÍCH HỢP HỆ THỐNG:</span>
            </div>
            <p>
              Tính năng Chatbot thời gian thực (Real-time AI Copilot, RAG tra cứu quy chế, Function Calling điều động nhân sự) nằm trong phạm vi phát triển của <strong>Phase AI Service</strong>.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Theo quy chuẩn nghiệm thu Bootstrap Foundation, ứng dụng frontend không tạo kết quả giả định hoặc toast thành công giả lập. Giao diện này sẽ kết nối trực tiếp với WebSocket / HTTP server của dịch vụ AI khi sẵn sàng.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(14, 20, 32, 0.9)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            onClick={onClose}
            className="btn"
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
