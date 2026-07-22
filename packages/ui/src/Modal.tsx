import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  width?: number | string;
  maxHeight?: string;
  children: React.ReactNode;
  /** Prevents closing when clicking the backdrop */
  disableBackdropClose?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  width = 520,
  maxHeight = '90vh',
  children,
  disableBackdropClose = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Trap scroll behind overlay
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const resolvedWidth = typeof width === 'number'
    ? `min(${width}px, calc(100vw - 24px))`
    : width;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px',
      }}
      onClick={disableBackdropClose ? undefined : e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'var(--white)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-xl)',
          width: resolvedWidth,
          maxHeight,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
};
