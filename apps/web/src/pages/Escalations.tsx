import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import './Escalations.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';

// -- Types ------------------------------------------------------
export interface Escalation {
  id: string;
  caseId: string;
  caseRef: string;
  goodsDesc: string;
  reason: string;
  note: string;
  escalatedBy: string;
  escalatedByName: string;
  escalatedAt: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  resolvedAt?: string;
  resolvedNote?: string;
}

const STORE_KEY = 'cls_escalations';

function loadEscalations(): Escalation[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function saveEscalations(items: Escalation[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(items));
}

export function escalateCase(params: {
  caseId: string; caseRef: string; goodsDesc: string;
  reason: string; note: string; userId: string; userName: string;
}): void {
  const items = loadEscalations();
  items.unshift({
    id: crypto.randomUUID(),
    caseId: params.caseId,
    caseRef: params.caseRef,
    goodsDesc: params.goodsDesc,
    reason: params.reason,
    note: params.note,
    escalatedBy: params.userId,
    escalatedByName: params.userName,
    escalatedAt: new Date().toISOString(),
    status: 'PENDING',
  });
  saveEscalations(items);
}

// -- UI helpers -------------------------------------------------
const STATUS_CFG = {
  PENDING:     { label: 'Pending',     bg: '#fef3c7', color: '#92400e' },
  IN_PROGRESS: { label: 'In Progress', bg: '#dbeafe', color: '#1e40af' },
  RESOLVED:    { label: 'Resolved',    bg: '#ecfdf5', color: '#065f46' },
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
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--teal)' }}>{esc.caseRef}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px',
          background: cfg.bg, color: cfg.color,
        }}>{cfg.label}</span>
        <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }}>{fmt(esc.escalatedAt)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{esc.goodsDesc}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '2px 8px', color: 'var(--ink)' }}>
          {esc.reason}
        </span>
      </div>
      {esc.note && (
        <div style={{ fontSize: 12, color: 'var(--ink2)', background: 'var(--bg)', borderRadius: 9, padding: '6px 10px', borderLeft: '3px solid var(--teal)' }}>
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
              background: 'var(--teal)', color: '#fff', border: 'none', fontFamily: 'var(--font)',
            }}>
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
        background: 'var(--white)', borderRadius: 9, padding: 28, width: 460, maxWidth: '92vw',
        boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
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
              style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" title="Cancel" onClick={onClose}
              style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit" title="Submit escalation"
              style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
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
  const canResolve = isSenior || user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'TENANT_ADMIN';

  const [items, setItems] = useState<Escalation[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [showModal, setShowModal] = useState(false);

  const reload = useCallback(() => setItems(loadEscalations()), []);

  useEffect(() => { reload(); }, [reload]);

  function handleSubmit(params: { caseId: string; caseRef: string; goodsDesc: string; reason: string; note: string }) {
    escalateCase({ ...params, userId: user!.id, userName: user!.name });
    reload();
  }

  function handleResolve(id: string) {
    const updated = loadEscalations().map(e => {
      if (e.id !== id) return e;
      if (e.status === 'PENDING') return { ...e, status: 'IN_PROGRESS' as const };
      return { ...e, status: 'RESOLVED' as const, resolvedAt: new Date().toISOString() };
    });
    saveEscalations(updated);
    reload();
  }

  const visible = items.filter(e => {
    if (isJunior) return e.escalatedBy === user!.id;
    return true;
  }).filter(e => filter === 'ALL' || e.status === filter);

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Escalations</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>
            {isSenior ? 'Cases escalated to you by junior officers' : 'Your escalated cases'}
          </div>
        </div>
        {isJunior && (
          <button type="button" title="Create new escalation" onClick={() => setShowModal(true)}
            style={{
              background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)',
              padding: 'var(--ds-btn-py) 18px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            + Escalate Case
          </button>
        )}
      </div>

      {/* Status stat cards */}
      <div className="esc-stats">
        {(Object.entries(STATUS_CFG) as [keyof typeof STATUS_CFG, typeof STATUS_CFG[keyof typeof STATUS_CFG]][]).map(([status, cfg]) => (
          <button key={status} type="button" title={cfg.label}
            onClick={() => setFilter(filter === status ? 'ALL' : status)}
            style={{
              background: filter === status ? cfg.bg : 'var(--white)',
              border: `1px solid ${filter === status ? cfg.color : 'var(--border)'}`,
              borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-lg) 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
            }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color }}>{counts[status]}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, marginTop: 2 }}>{cfg.label}</div>
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
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
