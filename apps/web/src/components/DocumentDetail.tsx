import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import { SectionCard } from './SectionCard.js';
import { Button, type ButtonProps } from './ui/button.js';
import { Separator } from './ui/separator.js';
import { PersonAvatar } from './PersonAvatar.js';
import type { SubjectKind } from '../lib/identity.js';

/**
 * Shared shell for FinOps "document" detail views (Invoices, Credit Notes,
 * Quotations, Delivery Documents) — one back-link + two-column layout +
 * card set instead of each page reinventing its own. Extracted from
 * Quotations.tsx's QuoteDetailView, the best of the four before this pass,
 * and rebuilt on SectionCard/Badge/Button so every document reads as the
 * same platform surface. See docs/plans (redesign of FinOps document views)
 * for the audit that motivated this.
 */

const cardStyle: React.CSSProperties = {
  background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden',
};

// -- Shell -----------------------------------------------------------------

export function DocumentDetailShell({ backLabel, onBack, backTo, docNumber, isMobile = false, children }: {
  backLabel: string;
  onBack?: () => void;
  backTo?: string;
  docNumber?: React.ReactNode;
  isMobile?: boolean;
  children: React.ReactNode;
}) {
  const backStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0, textDecoration: 'none' };
  return (
    <div style={{ padding: '0 0 24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {backTo
          ? <Link to={backTo} style={backStyle}><Icon name="arrowLeft" size={14} /> {backLabel}</Link>
          : <button type="button" title={backLabel} onClick={onBack} style={backStyle}><Icon name="arrowLeft" size={14} /> {backLabel}</button>}
        {docNumber != null && <>
          <span style={{ color: 'var(--ink3)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{docNumber}</span>
        </>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 20, alignItems: 'start' }}>
        {children}
      </div>
    </div>
  );
}

export function DocumentDetailMain({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>{children}</div>;
}

export function DocumentDetailSidebar({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>;
}

// -- Header card -------------------------------------------------------------

export function DocumentHeaderCard({ eyebrow, number, title, subtitle, status, meta, banner }: {
  /** Small uppercase label above the number, e.g. "Credit note". */
  eyebrow?: React.ReactNode;
  number: React.ReactNode;
  /** The document's own title, when it has one (a quote's subject line). */
  title?: React.ReactNode;
  /** Customer/party summary line under the title/number. */
  subtitle?: React.ReactNode;
  /** Right-aligned slot — a status Badge, or (for a credit note) an amount block. */
  status?: React.ReactNode;
  /** Full-width content below the title row — a route strip, an info grid. */
  meta?: React.ReactNode;
  /** A warning/info strip below everything — rejection reason, void reason. */
  banner?: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: meta ? 16 : 0, flexWrap: 'wrap' }}>
          <div>
            {eyebrow && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{eyebrow}</div>}
            <div style={{ fontFamily: 'var(--mono)', fontSize: title ? 13 : 22, fontWeight: title ? 700 : 800, color: title ? 'var(--teal)' : 'var(--ink)', marginBottom: title ? 4 : 0 }}>{number}</div>
            {title && <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>{title}</h2>}
            {subtitle && <div style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{subtitle}</div>}
          </div>
          {status && <div style={{ flexShrink: 0 }}>{status}</div>}
        </div>
        {meta}
        {banner && <div style={{ marginTop: 14 }}>{banner}</div>}
      </div>
    </div>
  );
}

// -- Actions card --------------------------------------------------------

export interface DocumentAction {
  key: string;
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  /** Override background/color for a semantic status action (submit/approve/
   *  convert) — Button still owns height/padding/radius; only appearance
   *  changes, per CLAUDE.md's "an app may set appearance, not the box" rule. */
  style?: React.CSSProperties;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  hidden?: boolean;
}

export function DocumentActionsCard({ title = 'Actions', groups }: { title?: string; groups: DocumentAction[][] }) {
  const visibleGroups = groups.map(g => g.filter(a => !a.hidden)).filter(g => g.length > 0);
  if (visibleGroups.length === 0) return null;
  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleGroups.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <Separator style={{ margin: '4px 0' }} />}
            {group.map(a => (
              <Button key={a.key} type="button" variant={a.variant ?? 'outline'} disabled={a.disabled || a.loading}
                onClick={a.onClick} title={a.label} style={{ width: '100%', justifyContent: 'flex-start', ...a.style }}>
                {a.icon && <Icon name={a.icon as any} size={14} />}
                {a.loading ? (a.loadingLabel ?? `${a.label}…`) : a.label}
              </Button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </SectionCard>
  );
}

// -- Key/value meta card ---------------------------------------------------

export function DocumentMetaCard({ title = 'Details', rows }: { title?: string; rows: [string, React.ReactNode][] }) {
  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, gap: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>{label}</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// -- Party (Bill To / customer / consignee) card --------------------------

export function DocumentPartyCard({ title = 'Bill To', name, company, avatarKind = 'customers', avatarId, email, phone }: {
  title?: string;
  name: string;
  company?: string | null;
  avatarKind?: SubjectKind;
  avatarId?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: (email || phone) ? 12 : 0 }}>
        <PersonAvatar userId={avatarId ?? undefined} kind={avatarKind} name={name} size={38} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
          {company && <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{company}</div>}
        </div>
      </div>
      {email && <a href={`mailto:${email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--blue)', textDecoration: 'none', marginBottom: phone ? 6 : 0 }}><Icon name="mail" size={12} color="var(--blue)" />{email}</a>}
      {phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink2)' }}><Icon name="phone" size={12} />{phone}</div>}
    </SectionCard>
  );
}

// -- Line items table card -------------------------------------------------

export interface DocumentLineColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  width?: number | string;
  render: (row: T, index: number) => React.ReactNode;
}

export interface DocumentLineTotal {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
}

export function DocumentLineItemsCard<T>({ title = 'Line Items', columns, rows, emptyLabel = 'No line items', totals, footer }: {
  title?: string;
  columns: DocumentLineColumn<T>[];
  rows: T[];
  emptyLabel?: string;
  totals?: DocumentLineTotal[];
  footer?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} padded={false}>
      {rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>{emptyLabel}</div>
      ) : (
        <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {columns.map(c => (
                  <th key={c.key} style={{ padding: '9px 14px', textAlign: c.align ?? 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', width: c.width }}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding: '10px 14px', textAlign: c.align ?? 'left' }}>{c.render(row, i)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totals && totals.length > 0 && (
              <tfoot>
                {totals.map((t, i) => (
                  <tr key={i} style={{ background: t.emphasize ? 'var(--teal-l)' : 'var(--bg)' }}>
                    <td colSpan={Math.max(columns.length - 2, 0)} />
                    <td style={{ padding: t.emphasize ? '11px 14px' : '7px 14px', fontWeight: t.emphasize ? 800 : 600, fontSize: t.emphasize ? 13 : 12, color: t.emphasize ? 'var(--teal)' : 'var(--ink2)', whiteSpace: 'nowrap' }}>{t.label}</td>
                    <td style={{ padding: t.emphasize ? '11px 14px' : '7px 14px', textAlign: 'right', fontWeight: t.emphasize ? 800 : 700, fontSize: t.emphasize ? 16 : 13, color: t.emphasize ? 'var(--teal)' : 'var(--ink)' }}>{t.value}</td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      )}
      {footer}
    </SectionCard>
  );
}

// -- Activity feed card ------------------------------------------------------

export interface DocumentActivityEntry {
  id: string;
  action: React.ReactNode;
  note?: React.ReactNode;
  timestamp?: React.ReactNode;
}

export function DocumentActivityCard({ title = 'Activity', activities, emptyLabel = 'No activity recorded.' }: {
  title?: string;
  activities: DocumentActivityEntry[];
  emptyLabel?: string;
}) {
  return (
    <SectionCard title={title}>
      {activities.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '4px 0' }}>{emptyLabel}</div>
      ) : (
        <div>
          {activities.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="activity" size={12} color="var(--teal)" />
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{a.action}</div>
                {a.note && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{a.note}</div>}
                {a.timestamp && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{a.timestamp}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
