import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Escalations.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';

// -- Types ------------------------------------------------------
export interface Escalation {
  id: string;
  subjectType: 'CASE' | 'CHAT';
  caseId: string | null;
  caseRef: string | null;
  goodsDesc: string;
  channelId: string | null;
  channelName: string | null;
  messageSnippet: string;
  reason: string;
  note: string;
  escalatedBy: string;
  escalatedByName: string;
  escalatedAt: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  resolvedAt?: string;
}

/** Real backend (migration 406 / escalations.routes.ts) — this used to be
 *  entirely localStorage, so an escalation only ever existed in the browser
 *  that created it. A senior on a different machine had no way to see it.
 *  Migration 412 widened the table beyond CASE-only to also carry a Team
 *  Chat message escalated from Chat.tsx — subjectType picks which half of
 *  the row is populated. */
function mapEscalation(row: any): Escalation {
  return {
    id: row.id,
    subjectType: row.subject_type === 'CHAT' ? 'CHAT' : 'CASE',
    caseId: row.case_id,
    caseRef: row.case_ref,
    goodsDesc: row.goods_desc ?? '',
    channelId: row.channel_id,
    channelName: row.channel_name,
    messageSnippet: row.message_snippet ?? '',
    reason: row.reason,
    note: row.note ?? '',
    escalatedBy: row.escalated_by,
    escalatedByName: row.escalated_by_name,
    escalatedAt: row.escalated_at,
    status: row.status,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

// -- UI helpers -------------------------------------------------
const STATUS_CFG = {
  PENDING:     { label: 'Pending',     bg: 'var(--gold-l)', color: 'var(--gold)' },
  IN_PROGRESS: { label: 'In Progress', bg: 'var(--blue-l)', color: 'var(--blue)' },
  RESOLVED:    { label: 'Resolved',    bg: 'var(--green-l)', color: 'var(--green)' },
};

const REASONS = [
  'Complex customs query',
  'Requires manager approval',
  'Demurrage dispute',
  'Document discrepancy',
  'Client escalation request',
  'Technical hold',
  'Other',
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-TZ', { dateStyle: 'medium', timeStyle: 'short' });
}

// -- Escalation card --------------------------------------------
function EscCard({ esc, canResolve, onResolve }: {
  esc: Escalation;
  canResolve: boolean;
  onResolve: (id: string) => void;
}) {
  const cfg = STATUS_CFG[esc.status];
  const isChat = esc.subjectType === 'CHAT';
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {isChat && <Icon name="siren" size={13} color="var(--purple)" />}
        <span style={{ fontWeight: 700, fontSize: 14, color: isChat ? 'var(--purple)' : 'var(--teal)' }}>
          {isChat ? esc.channelName : esc.caseRef}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, borderRadius: 'var(--badge-radius)', padding: '2px 10px',
          background: cfg.bg, color: cfg.color,
        }}>{cfg.label}</span>
        <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }}>{fmt(esc.escalatedAt)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{isChat ? esc.messageSnippet : esc.goodsDesc}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '2px 8px', color: 'var(--ink)' }}>
          {esc.reason}
        </span>
        {isChat && esc.channelId && (
          <Link to={`/bliss/inbox?view=team&channel=${esc.channelId}`}
            style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            Open in Team Chat <Icon name="arrowUpRight" size={11} />
          </Link>
        )}
      </div>
      {esc.note && (
        <div style={{ fontSize: 12, color: 'var(--ink2)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '6px 10px', borderLeft: '3px solid var(--teal)' }}>
          {esc.note}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>By {esc.escalatedByName}</div>
      {canResolve && esc.status !== 'RESOLVED' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" title="Mark in progress"
            onClick={() => onResolve(esc.id)}
            style={{
              fontSize: 12, fontWeight: 600, padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 'var(--r)', cursor: 'pointer',
              background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {esc.status === 'PENDING' ? 'Accept & Work' : 'Mark Resolved'}
          </button>
        </div>
      )}
    </div>
  );
}

// -- Create escalation modal ------------------------------------
function EscalateModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (params: { caseId: string; caseRef: string; goodsDesc: string; reason: string; note: string }) => void;
}) {
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    apiFetch('/v1/shipments/grouped').then(res => {
      const all: any[] = [];
      (res.data || []).forEach((g: any) => all.push(...(g.shipments || [])));
      setCases(all.slice(0, 30));
      if (all.length > 0) setSelectedCase(all[0].id);
    }).catch(() => {});
  }, []);

  const chosen = cases.find(c => c.id === selectedCase);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    onSubmit({ caseId: chosen.id, caseRef: chosen.ref_number, goodsDesc: chosen.goods_desc, reason, note });
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--r)', padding: 28, width: 460, maxWidth: '92vw',
        boxShadow: 'var(--elev-lg)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 20 }}>
          Escalate Case to Senior
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Case</label>
            <Combobox
              options={cases.map(c => ({ value: c.id, label: `${c.ref_number} — ${c.goods_desc}` }))}
              value={selectedCase} onChange={setSelectedCase}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Reason</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Select reason" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Additional note</label>
            <textarea title="Add note" placeholder="Describe the issue…" value={note} onChange={e => setNote(e.target.value)} rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" title="Cancel" onClick={onClose}
              style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Cancel
            </button>
            <button type="submit" title="Submit escalation"
              style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Escalate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -- Main page --------------------------------------------------
export const Escalations: React.FC = () => {
  const { user } = useAuth();
  const isJunior = user?.role === 'JUNIOR' || user?.role === 'OFFICER';
  const isSenior = user?.role === 'SENIOR';
  // Mirrors escalations.routes.ts's own RESOLVE_ROLES exactly — this used
  // to omit SUPER_ADMIN, so a super admin could resolve any escalation via
  // the API (the backend correctly allowed it) but never saw the button to
  // do so from here.
  const canResolve = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR'].includes(user?.role || '');

  const [items, setItems] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [showModal, setShowModal] = useState(false);

  const reload = useCallback(() => {
    apiFetch('/v1/escalations')
      .then((rows: any) => setItems(Array.isArray(rows) ? rows.map(mapEscalation) : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleSubmit(params: { caseId: string; caseRef: string; goodsDesc: string; reason: string; note: string }) {
    try {
      await apiFetch('/v1/escalations', { method: 'POST', body: JSON.stringify(params) });
      reload();
    } catch (err: any) {
      showAlert(err?.message || 'Could not create this escalation — please try again.');
    }
  }

  async function handleResolve(id: string) {
    try {
      await apiFetch(`/v1/escalations/${id}/advance`, { method: 'PATCH', body: '{}' });
      reload();
    } catch (err: any) {
      showAlert(err?.message || 'Could not update this escalation — please try again.');
    }
  }

  // The backend already scopes the list to a JUNIOR/OFFICER's own
  // escalations — this only applies the status filter on top of that.
  const visible = items.filter(e => filter === 'ALL' || e.status === filter);

  const counts = {
    PENDING:     items.filter(e => e.status === 'PENDING').length,
    IN_PROGRESS: items.filter(e => e.status === 'IN_PROGRESS').length,
    RESOLVED:    items.filter(e => e.status === 'RESOLVED').length,
  };

  return (
    <div className="esc-page">
      {showModal && (
        <EscalateModal onClose={() => setShowModal(false)} onSubmit={handleSubmit} />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <PageHeader
          crumbs={['Bliss', 'Escalations']}
          titlePlain="Your"
          titleEm="escalations"
          subtitle={isSenior ? 'Cases and chat messages escalated to you.' : 'Cases and chat messages you\'ve escalated.'}
          actions={isJunior ? (
            <button type="button" title="Create new escalation" onClick={() => setShowModal(true)}
              style={{
                background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)',
                padding: 'var(--ds-btn-py) 18px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              + Escalate Case
            </button>
          ) : undefined}
        />
      </div>

      {/* Status stat cards */}
      <div className="esc-stats">
        {(Object.entries(STATUS_CFG) as [keyof typeof STATUS_CFG, typeof STATUS_CFG[keyof typeof STATUS_CFG]][]).map(([status, cfg]) => (
          <button key={status} type="button" title={cfg.label}
            onClick={() => setFilter(filter === status ? 'ALL' : status)}
            style={{
              background: filter === status ? cfg.bg : 'var(--white)',
              border: `1px solid ${filter === status ? cfg.color : 'var(--border)'}`,
              borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-lg) 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color }}>{counts[status]}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, marginTop: 2 }}>{cfg.label}</div>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
          padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 14,
        }}>
          Loading escalations…
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
          padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 14,
        }}>
          {items.length === 0
            ? isJunior
              ? 'No escalations yet. Use "Escalate Case" when you need senior support.'
              : 'No escalations in the system yet.'
            : 'No escalations match the current filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(esc => (
            <EscCard key={esc.id} esc={esc} canResolve={canResolve} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </div>
  );
};
