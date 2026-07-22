import React, { useEffect } from 'react';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  width?: number | string;
  side?: 'right' | 'left';
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  width = 420,
  side = 'right',
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const resolvedWidth = typeof width === 'number'
    ? `min(${width}px, 100vw)`
    : width;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          [side]: 0,
          width: resolvedWidth,
          zIndex: 1200,
          background: 'var(--white)',
          boxShadow: side === 'right'
            ? '-4px 0 32px rgba(0,0,0,0.14)'
            : '4px 0 32px rgba(0,0,0,0.14)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
};
