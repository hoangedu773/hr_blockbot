import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  title?: string;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '380px',
      width: 'calc(100vw - 32px)',
      pointerEvents: 'none'
    }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const borderColor =
    toast.type === 'success' ? '#10b981' :
    toast.type === 'warning' ? '#f59e0b' :
    toast.type === 'error' ? '#ef4444' :
    '#ffd100';

  return (
    <div style={{
      pointerEvents: 'auto',
      background: '#0d111a',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '12px 14px',
      boxShadow: '0 12px 30px rgba(0,0,0,0.85), 0 0 15px rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      backdropFilter: 'blur(12px)',
      transition: 'all 200ms ease'
    }}>
      <div style={{ flex: 1 }}>
        {toast.title && (
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
            {toast.title}
          </div>
        )}
        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 }}>
          {toast.message}
        </div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          padding: '2px',
          fontSize: '14px',
          lineHeight: 1
        }}
      >
        ✕
      </button>
    </div>
  );
};
