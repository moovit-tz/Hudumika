import React, { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
import { Input } from '../components/ui/input.js';
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
  TRANSPORT: 'Transport & Fuel',
  MEALS_ENTERTAINMENT: 'Meals & entertainment',
  UTILITIES: 'Utilities & Internet',
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

  const pendingCount = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);
  const approvedCount = useMemo(() => requests.filter(r => r.status === 'approved').length, [requests]);
  const disbursedTotal = useMemo(() => requests.filter(r => r.status === 'disbursed').reduce((s, r) => s + Number(r.amount || 0), 0), [requests]);

  const selectedWallet = useMemo(() => wallets.find(w => w.id === walletId), [wallets, walletId]);

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
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activities', 'Request Money']}
        titlePlain="Request"
        titleEm="voucher"
        subtitle="Submit petty cash voucher claims for departmental review and finance release."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Pending Approval</span>
            <Badge variant={pendingCount > 0 ? 'warning' : 'gray'}>{pendingCount} In Queue</Badge>
          </div>
          <div className="petti-stat-value">{pendingCount}</div>
          <div className="petti-stat-sub">
            <span>Awaiting department manager review</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Approved Â· Ready for Release</span>
            <Badge variant="info">{approvedCount}</Badge>
          </div>
          <div className="petti-stat-value">{approvedCount}</div>
          <div className="petti-stat-sub">
            <span>Finance ready to disburse funds</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Disbursed Volume</span>
            <Badge variant="success">PAID</Badge>
          </div>
          <div className="petti-stat-value" style={{ color: 'var(--green)' }}>
            {disbursedTotal.toLocaleString()}
          </div>
          <div className="petti-stat-sub">
            <span>Synchronized to FinOps Expenses</span>
          </div>
        </div>
      </div>

      <div className="petti-grid-2col">
        {/* Request Form */}
        <SectionCard title="New Petty Cash Voucher" collapsible={false}>
          <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Select Target Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${Number(w.balance).toLocaleString()} ${w.currency})` }))}
                value={walletId}
                onChange={setWalletId}
                placeholder="Select walletâ€¦"
              />
            </div>

            <div className="petti-grid-form">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Requested Amount *</label>
                <Input type="number" required min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 75000" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Expense Category *</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Purpose / Justification *</label>
              <Input required value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Emergency fuel for delivery van run to airport" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payee / Beneficiary Name (Optional)</label>
              <Input value={payeeName} onChange={e => setPayeeName(e.target.value)} placeholder="e.g. Shell Mwenge Station / Office Mart" />
            </div>

            <Button type="submit" disabled={saving} style={{ padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="fileText" size={16} /> {saving ? 'Submittingâ€¦' : `Submit Voucher Request ${amount ? `(${Number(amount).toLocaleString()} ${selectedWallet?.currency || ''})` : ''}`}
            </Button>
          </form>
        </SectionCard>

        {/* Workflow Info Box & Stage Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="petti-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={16} color="var(--teal)" />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Governance & Verification Stages</h4>
                <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: 'var(--ink3)' }}>Automated workflow for petty cash control</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 10, background: 'var(--bg)', borderRadius: 'var(--r)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>1</span>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <strong style={{ color: 'var(--ink)' }}>Voucher Submission:</strong>
                  <div style={{ color: 'var(--ink3)', marginTop: 2 }}>Staff requests an expense advance or reimbursement with target vault and justification.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 10, background: 'var(--bg)', borderRadius: 'var(--r)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>2</span>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <strong style={{ color: 'var(--ink)' }}>Department Verification:</strong>
                  <div style={{ color: 'var(--ink3)', marginTop: 2 }}>Assigned department approver reviews the voucher. Approver backups act automatically if on leave.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 10, background: 'var(--bg)', borderRadius: 'var(--r)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: 'var(--green)', color: 'hsl(var(--primary-foreground))' }}>3</span>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <strong style={{ color: 'var(--ink)' }}>Finance Release & Posting:</strong>
                  <div style={{ color: 'var(--ink3)', marginTop: 2 }}>Finance disburses cash. The transaction posts instantly into <strong>FinOps Expenses</strong> with auto-generated receipt vouchers.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Requests Queue Table */}
      <SectionCard title="Active Voucher Requests Queue" padded={false} collapsible={false}>
        {requests.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No cash requests submitted yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Date', 'Wallet', 'Purpose', 'Category', 'Amount', 'Status'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => {
                  const w = wallets.find(wall => wall.id === r.wallet_id);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{r.ref || 'â€”'}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(r.requested_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{w?.name || 'Wallet'}</td>
                      <td style={{ color: 'var(--ink)' }}>{r.purpose}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink2)' }}>{CATEGORY_LABELS[r.category || ''] || r.category || 'General'}</td>
                      <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--teal)' }}>
                        {Number(r.amount).toLocaleString()} {w?.currency || ''}
                      </td>
                      <td><Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
