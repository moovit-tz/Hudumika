import React from 'react';
import { Modal } from './Modal.js';

export interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export const Confirm: React.FC<ConfirmProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
}) => (
  <Modal open={open} onClose={onClose} width={380}>
    <div style={{ padding: '24px 24px 20px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
        {message}
      </div>
    </div>
    <div style={{
      display: 'flex', justifyContent: 'flex-end', gap: 8,
      padding: '12px 24px 20px',
    }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onClose}
        disabled={loading}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={`btn btn-primary${danger ? ' btn-danger' : ''}`}
        style={danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : undefined}
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? 'Please wait…' : confirmLabel}
      </button>
    </div>
  </Modal>
);
