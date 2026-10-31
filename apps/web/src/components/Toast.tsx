import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  title?: string;
  message: string;
}

/** Shared callback signature for views that must surface real API errors. */
export type NotifyFn = (message: string, type?: ToastMessage['type'], title?: string) => void;

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '24px',
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
    '#71717a';

  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-control)',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '12px 14px',
      boxShadow: 'var(--shadow-float)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      backdropFilter: 'blur(12px)',
      transition: 'transform 200ms ease, opacity 200ms ease'
    }}>
      <div style={{ flex: 1 }}>
        {toast.title && (
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {toast.title}
          </div>
        )}
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {toast.message}
        </div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
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
