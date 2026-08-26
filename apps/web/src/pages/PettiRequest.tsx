import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; }
interface Withdrawal {
  id: string; wallet_id: string; amount: string | number; purpose: string; category?: string; status: string;
  requested_by: string; requested_at: string; approved_by: string | null; approved_at: string | null;
  disbursed_by: string | null; disbursed_at: string | null; payee_name?: string | null; ref: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  OFFICE_SUPPLIES: 'Office supplies',
  TRANSPORT: 'Transport',
  MEALS_ENTERTAINMENT: 'Meals & entertainment',
  UTILITIES: 'Utilities',
  STAFF_WELFARE: 'Staff welfare',
  REPAIRS_MAINTENANCE: 'Repairs & maintenance',
  POSTAGE_COURIER: 'Postage & courier',
  MISCELLANEOUS: 'Miscellaneous',
};

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error',
};

export function PettiRequest() {
  usePageSEO('Request Money', 'Submit petty cash voucher requests for department approval and disbursement.');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [requests, setRequests] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('OFFICE_SUPPLIES');
  const [purpose, setPurpose] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/withdrawals').then(r => r.data || []).catch(() => []),
    ]).then(([w, reqs]) => {
      setWallets(w); setRequests(reqs);
      if (w.length > 0 && !walletId) setWalletId(w[0].id);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!walletId || !amount || Number(amount) <= 0 || !purpose.trim()) {
      showAlert('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${walletId}/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          category,
          purpose: purpose.trim(),
          payee_name: payeeName.trim() || undefined,
        }),
      });
      showAlert('Petty cash voucher requested successfully.', { variant: 'success' });
      setAmount(''); setPurpose(''); setPayeeName('');
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to submit request.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activities', 'Request Money']}
        titlePlain="Request"
        titleEm="money"
        subtitle="Submit petty cash voucher requests for departmental approval & instant disbursement."
      />

      <div className="petti-grid-2col" style={{ marginBottom: 24 }}>
        
        {/* Request Form */}
        <SectionCard title="New Petty Cash Voucher" collapsible={false}>
          <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Select Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                value={walletId}
                onChange={setWalletId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Requested Amount *</label>
              <input
                type="number" required min="1" step="any"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 75000"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Expense Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Purpose / Justification *</label>
              <input
                type="text" required
                value={purpose} onChange={e => setPurpose(e.target.value)}
                placeholder="e.g. Emergency fuel for delivery van"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payee / Vendor Name (Optional)</label>
              <input
                type="text"
                value={payeeName} onChange={e => setPayeeName(e.target.value)}
                placeholder="e.g. Shell Station Mwenge"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <Button type="submit" disabled={saving} style={{ background: 'var(--green)', color: '#fff', padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="fileText" size={16} /> {saving ? 'Submitting…' : 'Submit Voucher Request'}
            </Button>
          </form>
        </SectionCard>

        {/* Workflow Info Box */}
        <div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={15} color="var(--teal)" />
              </div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>Approval Process</h4>
            </div>

            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <li style={{ marginBottom: 6 }}><strong>Submission:</strong> Request enters the Pending Queue.</li>
              <li style={{ marginBottom: 6 }}><strong>Department Approval:</strong> The wallet's assigned approver reviews it (skipped if the wallet's workflow doesn't require one).</li>
              <li><strong>Finance Release:</strong> Finance disburses the approved request — a manual step, not automatic — and it appears in FinOps Expenses as soon as it's disbursed.</li>
            </ol>
          </div>
        </div>

      </div>

      {/* Requests Queue Table */}
      <SectionCard title="Voucher Requests Queue" padded={false} collapsible={false}>
        {requests.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No cash requests submitted yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Ref', 'Date', 'Wallet', 'Purpose', 'Category', 'Amount', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {requests.map(r => {
                const w = wallets.find(wall => wall.id === r.wallet_id);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{r.ref || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(r.requested_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{w?.name || 'Wallet'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{r.purpose}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink2)' }}>{CATEGORY_LABELS[r.category || ''] || r.category || 'General'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--ink)' }}>
                      {Number(r.amount).toLocaleString()} {w?.currency || ''}
                    </td>
                    <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
