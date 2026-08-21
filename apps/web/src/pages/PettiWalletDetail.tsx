import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { showAlert } from '../lib/alert.js';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']);

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
const CATEGORIES = Object.keys(CATEGORY_LABELS);

interface Wallet { id: string; name: string; description: string | null; currency: string; status: 'active' | 'closed'; balance: number; }
interface Deposit { id: string; amount: string | number; method: string; reference: string | null; note: string | null; created_at: string; }
interface Withdrawal {
  id: string; amount: string | number; category: string; purpose: string; status: string;
  requested_by: string; requested_at: string; approved_at: string | null; disbursed_at: string | null; rejection_reason: string | null;
}

function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error',
};

export function PettiWalletDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canManage = !!user && ADMIN_ROLES.has(user.role);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeposit, setShowDeposit] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [depositForm, setDepositForm] = useState({ amount: '', method: 'manual' as 'manual' | 'gateway', reference: '', note: '' });
  const [requestForm, setRequestForm] = useState({ amount: '', category: 'MISCELLANEOUS', purpose: '' });

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/petti/wallets/${id}`)
      .then(res => { setWallet(res.wallet); setDeposits(res.deposits || []); setWithdrawals(res.withdrawals || []); })
      .catch(() => setWallet(null))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  async function saveDeposit() {
    const amount = parseFloat(depositForm.amount);
    if (!(amount > 0)) { setError('Enter a valid amount.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch(`/v1/petti/wallets/${id}/deposits`, {
        method: 'POST',
        body: JSON.stringify({
          amount, method: depositForm.method,
          reference: depositForm.reference.trim() || undefined, note: depositForm.note.trim() || undefined,
        }),
      });
      setDepositForm({ amount: '', method: 'manual', reference: '', note: '' });
      setShowDeposit(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to record deposit'); }
    finally { setSaving(false); }
  }

  async function saveRequest() {
    const amount = parseFloat(requestForm.amount);
    if (!(amount > 0)) { setError('Enter a valid amount.'); return; }
    if (!requestForm.purpose.trim()) { setError('A purpose is required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch(`/v1/petti/wallets/${id}/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({ amount, category: requestForm.category, purpose: requestForm.purpose.trim() }),
      });
      setRequestForm({ amount: '', category: 'MISCELLANEOUS', purpose: '' });
      setShowRequest(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to submit withdrawal request'); }
    finally { setSaving(false); }
  }

  async function approve(w: Withdrawal) {
    setBusyId(w.id);
    try { await apiFetch(`/v1/petti/withdrawals/${w.id}/approve`, { method: 'POST' }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed to approve request', { variant: 'error' }); }
    finally { setBusyId(null); }
  }

  async function reject(w: Withdrawal) {
    const reason = window.prompt('Reason for rejecting this request (optional):') || undefined;
    setBusyId(w.id);
    try { await apiFetch(`/v1/petti/withdrawals/${w.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed to reject request', { variant: 'error' }); }
    finally { setBusyId(null); }
  }

  async function disburse(w: Withdrawal) {
    if (!window.confirm(`Disburse ${Number(w.amount).toLocaleString()} ${wallet?.currency || ''} for "${w.purpose}"? This posts to the ledger and cannot be undone.`)) return;
    setBusyId(w.id);
    try { await apiFetch(`/v1/petti/withdrawals/${w.id}/disburse`, { method: 'POST' }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed to disburse', { variant: 'error' }); }
    finally { setBusyId(null); }
  }

  if (!loading && !wallet) {
    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PageHeader crumbs={['Petti', 'Wallets']} titlePlain="Wallet" titleEm="not found" />
        <Link to="/petti"><Button variant="outline"><Icon name="arrowLeft" size={13} /> Back to wallets</Button></Link>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Wallets', wallet?.name || '…']}
        titlePlain={wallet ? wallet.name.split(' ').slice(0, -1).join(' ') || 'Wallet' : 'Wallet'}
        titleEm={wallet ? wallet.name.split(' ').slice(-1)[0] : '…'}
        subtitle={wallet?.description || undefined}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canManage && wallet?.status === 'active' && <Button variant="outline" onClick={() => setShowDeposit(s => !s)}><Icon name="arrowDown" size={14} /> Deposit</Button>}
            {wallet?.status === 'active' && <Button onClick={() => setShowRequest(s => !s)}><Icon name="plus" size={14} /> Request withdrawal</Button>}
          </div>
        }
      />

      {wallet && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: wallet.balance < 0 ? 'var(--red)' : 'var(--ink)' }}>{wallet.balance.toLocaleString()} {wallet.currency}</div>
          </div>
          <Badge variant={wallet.status === 'active' ? 'success' : 'gray'}>{wallet.status}</Badge>
        </div>
      )}

      {showDeposit && (
        <SectionCard title="Record a deposit" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Amount *</label>
              <Input type="number" min="0" value={depositForm.amount} onChange={e => setDepositForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Method</label>
              <Select value={depositForm.method} onValueChange={v => setDepositForm(p => ({ ...p, method: v as 'manual' | 'gateway' }))}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (bank transfer / cash drop)</SelectItem>
                  <SelectItem value="gateway">Payment gateway</SelectItem>
                </SelectContent>
              </Select>
              {depositForm.method === 'gateway' && (
                <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4 }}>No live payment gateway is wired up yet — this will fail until one is. Use Manual once funds are confirmed.</div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Reference</label>
              <Input value={depositForm.reference} onChange={e => setDepositForm(p => ({ ...p, reference: e.target.value }))} placeholder="Bank slip / txn ref" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Note</label>
              <Input value={depositForm.note} onChange={e => setDepositForm(p => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={saveDeposit}>{saving ? 'Saving…' : 'Record deposit'}</Button>
            <Button variant="outline" onClick={() => { setShowDeposit(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      {showRequest && (
        <SectionCard title="Request a withdrawal" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Amount *</label>
              <Input type="number" min="0" value={requestForm.amount} onChange={e => setRequestForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Category</label>
              <Select value={requestForm.category} onValueChange={v => setRequestForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Purpose *</label>
              <Textarea value={requestForm.purpose} onChange={e => setRequestForm(p => ({ ...p, purpose: e.target.value }))} placeholder="What this cash is for" rows={2} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={saveRequest}>{saving ? 'Submitting…' : 'Submit request'}</Button>
            <Button variant="outline" onClick={() => { setShowRequest(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Withdrawal requests" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : withdrawals.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No withdrawal requests yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Purpose', 'Category', 'Amount', 'Requested', 'Status', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {withdrawals.map(w => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{w.purpose}{w.status === 'rejected' && w.rejection_reason ? <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 2 }}>Reason: {w.rejection_reason}</div> : null}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{CATEGORY_LABELS[w.category] || w.category}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{Number(w.amount).toLocaleString()} {wallet?.currency}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(w.requested_at)}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[w.status] || 'gray'}>{w.status}</Badge></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {canManage && w.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="outline" disabled={busyId === w.id} onClick={() => reject(w)}>Reject</Button>
                        <Button size="sm" disabled={busyId === w.id} onClick={() => approve(w)}>Approve</Button>
                      </div>
                    )}
                    {canManage && w.status === 'approved' && (
                      <Button size="sm" disabled={busyId === w.id} onClick={() => disburse(w)}>Disburse</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Deposits" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : deposits.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No deposits recorded yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Amount', 'Method', 'Reference', 'Note', 'Date'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>+{Number(d.amount).toLocaleString()} {wallet?.currency}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', textTransform: 'capitalize' }}>{d.method}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{d.reference || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{d.note || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
