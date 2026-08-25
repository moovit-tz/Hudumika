import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Real Contracts (migration 316, 'projects' entitlement) — M2a of the
// standalone Projects app's enterprise-parity program. A hardcoded-sample
// version of this page existed once and was removed for having no real
// backend at all; this one is wired to apps/api/src/routes/contracts.routes.ts
// end to end (create/list/stats/charts/PDF/renew/trash).

interface ContractRow {
  id: string; ref: string | null; customer_id: string; customer_name: string | null;
  project_id: string | null; project_name: string | null; subject: string;
  value: string | null; currency: string; type: string | null;
  start_date: string | null; end_date: string | null; status: string; sign_envelope_id: string | null;
  envelope_status: string | null; signed_at: string | null;
  created_at: string;
}
interface Stats { active: number; expired: number; aboutToExpire: number; recentlyAdded: number; trash: number }
const SIGN_STATUS_META: Record<string, { label: string; variant: 'gray' | 'success' | 'error' | 'warning' }> = {
  draft: { label: 'Draft', variant: 'gray' },
  sent: { label: 'Awaiting Signature', variant: 'warning' },
  completed: { label: 'Signed', variant: 'success' },
  declined: { label: 'Declined', variant: 'error' },
  voided: { label: 'Voided', variant: 'error' },
  expired: { label: 'Expired', variant: 'error' },
};
interface ChartRow { type: string; count: number; value: number }

async function searchCustomers(q: string): Promise<PickerItem[]> {
  const res = await apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []);
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
}

export const Contracts: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContractRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [byType, setByType] = useState<ChartRow[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCustomer, setNewCustomer] = useState<PickerItem | null>(null);

  const load = useCallback((trash: boolean) => {
    apiFetch(`/v1/contracts${trash ? '?trash=true' : ''}`).then(res => {
      setRows(res.data || []);
      setStats(res.stats || null);
      setByType(res.charts?.byType || []);
    }).catch(() => { setRows([]); setStats(null); setByType([]); });
  }, []);
  useEffect(() => { load(showTrash); }, [load, showTrash]);

  async function createContract() {
    if (!newSubject.trim() || !newCustomer) return;
    const id = crypto.randomUUID();
    try {
      await apiFetch('/v1/contracts', { method: 'POST', body: JSON.stringify({ id, customerId: newCustomer.id, subject: newSubject.trim() }) });
      setNewSubject(''); setNewCustomer(null); setCreating(false);
      load(showTrash);
    } catch { /* apiFetch surfaces errors globally */ }
  }

  const filteredRows = (rows || []).filter(r => !search.trim() || r.subject.toLowerCase().includes(search.toLowerCase()) || (r.customer_name || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ padding: isMobile ? '16px 16px 0' : '24px 32px 0' }}>
        <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Contracts</h1>
        <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>Customer agreements — real e-signature and renewal history.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: isMobile ? '14px 16px 0' : '18px 32px 0' }}>
        {stats && ([
          ['active', 'Active', stats.active, 'brand'],
          ['expired', 'Expired', stats.expired, 'error'],
          ['aboutToExpire', 'About to Expire', stats.aboutToExpire, 'warning'],
          ['recentlyAdded', 'Recently Added', stats.recentlyAdded, 'success'],
          ['trash', 'Trash', stats.trash, 'gray'],
        ] as const).map(([key, label, count, variant]) => (
          <button key={key} type="button" onClick={() => setShowTrash(key === 'trash')}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${(key === 'trash') === showTrash ? 'var(--teal)' : 'var(--border)'}`, background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Badge variant={variant}>{count}</Badge>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)' }}>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ padding: isMobile ? 16 : 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <Button size="sm" onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={15} /> New Contract
          </Button>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject or customer…"
            style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, width: 240, background: 'var(--white)', color: 'var(--ink)' }} />
        </div>

        {creating && (
          <div style={{ marginBottom: 16, padding: 16, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <EntityPicker value={newCustomer} onChange={setNewCustomer} search={searchCustomers} placeholder="Customer…" />
            </div>
            <input
              autoFocus value={newSubject} onChange={e => setNewSubject(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createContract(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Subject…"
              style={{ flex: 2, minWidth: 220, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--white)', color: 'var(--ink)' }}
            />
            <Button size="sm" onClick={createContract} disabled={!newSubject.trim() || !newCustomer}>Create</Button>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        )}

        {!showTrash && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Contracts by Type</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="var(--teal)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Contract Value by Type</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="value" stroke="var(--green)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {rows === null ? (
          <div style={{ color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>
            {showTrash ? 'Trash is empty.' : 'No contracts yet.'}
          </div>
        ) : (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  {['#', 'Subject', 'Customer', 'Type', 'Value', 'Start', 'End', 'Signature'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.id} onClick={() => navigate(`/projects/contracts/${r.id}`)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{r.ref}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{r.subject}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{r.customer_name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{r.type || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{r.value ? `${r.currency} ${Number(r.value).toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{r.start_date || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{r.end_date || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {(() => {
                        const meta = r.sign_envelope_id ? (SIGN_STATUS_META[r.envelope_status || 'draft'] || SIGN_STATUS_META.draft) : { label: 'Not Sent', variant: 'gray' as const };
                        return <Badge variant={meta.variant}>{meta.label}</Badge>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
