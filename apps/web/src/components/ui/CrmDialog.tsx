import React, { useEffect, useRef } from 'react';

/** Native top-layer dialog: background inertness, focus trap and restoration. */
export function CrmDialog({ title, busy = false, onClose, children }: {
  title: string; busy?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, []);
  return <dialog ref={ref} data-register="product" className="crm-dialog" aria-label={title}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCloseRef.current(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCloseRef.current();
    }}>
    <header className="crm-dialog-header"><h3>{title}</h3><button type="button" className="btn" onClick={onClose} disabled={busy}>Đóng</button></header>
    {children}
  </dialog>;
}
