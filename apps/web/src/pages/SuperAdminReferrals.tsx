import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

/**
 * AgencyHost M8 — every referral commission across every tenant, in one
 * queue. Cross-tenant by design (dbPlatform, SUPER_ADMIN-gated at the route
 * level), same shape as SuperAdminIssues.tsx.
 */

const STATUS_VARIANT: Record<string, 'gray' | 'error' | 'info' | 'success' | 'warning'> = {
  pending: 'gray', flagged: 'error', approved: 'info', paid: 'success', rejected: 'gray',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', flagged: 'Flagged', approved: 'Approved', paid: 'Paid', rejected: 'Rejected',
};

interface Commission {
  id: string; amount: string; currency: string; rate: string; status: string;
  flagged_reason: string | null; source_payment_ref: string | null;
  created_at: string; decided_at: string | null; paid_at: string | null;
  payout_method: string | null; payout_note: string | null;
  referring_tenant_name: string | null; referred_tenant_name: string | null;
}

export const SuperAdminReferrals: React.FC = () => {
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = status !== 'all' ? `?status=${status}` : '';
    apiFetch(`/v1/superadmin/referrals${qs}`)
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(load, [load]);

  const decide = async (id: string, newStatus: 'approved' | 'rejected') => {
    setActing(id);
    try {
      await apiFetch(`/v1/superadmin/referrals/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this commission.', { variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  const recordManualPayout = async (id: string) => {
    const method = window.prompt('How was this paid out? (e.g. Bank transfer, M-Pesa manual send)');
    if (!method?.trim()) return;
    const ok = await showConfirm(`Record this commission as paid via "${method.trim()}"? This cannot be undone.`, { variant: 'info', confirmLabel: 'Record payout' });
    if (!ok) return;
    setActing(id);
    try {
      await apiFetch(`/v1/superadmin/referrals/${id}/payout/manual`, { method: 'POST', body: JSON.stringify({ method: method.trim() }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not record the payout.', { variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  return (
    <div>
      <PageHeader
        crumbs={['Admin', 'Referrals']}
        titlePlain="Referral"
        titleEm="commissions"
        subtitle="Every commission earned across the platform — approve, reject, or record a manual payout. No automatic payout provider is connected yet."
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Any status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {Object.keys(STATUS_LABEL).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="card" style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <SectionLoading />
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
            <Icon name="link" size={32} style={{ marginBottom: 8 }} />
            <div>No referral commissions {status !== 'all' ? `with status "${status}"` : 'yet'}.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px' }}>Referring tenant</th>
                <th style={{ padding: '10px 14px' }}>Referred tenant</th>
                <th style={{ padding: '10px 14px' }}>Amount</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Earned</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.referring_tenant_name ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{r.referred_tenant_name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)' }}>{r.amount} {r.currency}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'} title={r.flagged_reason ?? undefined}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.status === 'flagged' && r.flagged_reason && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, maxWidth: 240 }}>{r.flagged_reason}</div>
                    )}
                    {r.status === 'paid' && r.payout_method && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>via {r.payout_method}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {(r.status === 'pending' || r.status === 'flagged') && (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" disabled={acting === r.id} onClick={() => decide(r.id, 'approved')}>Approve</button>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} disabled={acting === r.id} onClick={() => decide(r.id, 'rejected')}>Reject</button>
                      </div>
                    )}
                    {r.status === 'approved' && (
                      <button className="btn btn-sm btn-secondary" disabled={acting === r.id} onClick={() => recordManualPayout(r.id)}>Record payout</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
