import React from 'react';
import { Icon } from './Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

/**
 * Full-page create/edit form chrome.
 *
 * Quotations already worked this way — a `view` state whose 'create' branch
 * early-returns a whole page instead of layering a dialog over the list —
 * and every other finance page opened the same kind of form in a fixed
 * overlay. A record with a dozen fields and a line-item table does not fit
 * a modal: it scrolls inside a box inside a scrolling page, the list behind
 * it keeps its own scroll position, and on a phone the whole thing is a
 * viewport-height box with its own inner scrollbar.
 *
 * This is that chrome, extracted so the remaining pages adopt the pattern
 * without each re-deriving the header, spacing and back affordance.
 */
export interface FormPageProps {
  /** e.g. "New Invoice" or "Edit INV-2026-0031". */
  title: string;
  /** One line under the title saying what the form is for. */
  subtitle?: string;
  /** Back arrow and any Cancel control route here. */
  onCancel: () => void;
  /** Save / submit buttons, rendered right-aligned in the header. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function FormPage({ title, subtitle, onCancel, actions, children }: FormPageProps) {
  const isMobile = useIsMobile();
  return (
    <div style={{ padding: isMobile ? '16px' : '24px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          type="button"
          title="Back"
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink2)',
            display: 'flex', padding: 4, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box',
          }}
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{title}</h1>
          {subtitle && (
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {actions && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The two header buttons every one of these forms needs, so Cancel and Save
 *  are the same control on all ten pages rather than ten hand-rolled pairs. */
export function FormPageActions({ onCancel, onSave, saving, saveLabel = 'Save', extra }: {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <>
      {extra}
      <button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary">
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary">
        {saving ? 'Saving…' : saveLabel}
      </button>
    </>
  );
}
