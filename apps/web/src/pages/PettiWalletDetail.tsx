import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { showAlert } from '../lib/alert.js';

// Wallet administration ("finance manager acts as admin") — deposits, status,
// workflow/approver configuration. Deliberately excludes MANAGER: a
// department manager administers *their own approval step* (via the
// approver/backup fields below), not the wallet itself.
const FINANCE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE']);
// Admin safety valve on the approve/reject step, mirroring petti.service.ts's
// PETTI_OVERRIDE_ROLES — never a substitute for FINANCE_ROLES on disburse.
const OVERRIDE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN']);

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
const NONE = '__none__';

interface Wallet {
  id: string; name: string; description: string | null; currency: string; status: 'active' | 'closed'; balance: number;
  default_workflow_id: string | null;
  category_workflow_overrides: Record<string, string> | null;
  approver_user_id: string | null;
  approver_backup_user_id: string | null;
}
interface Deposit { id: string; amount: string | number; method: string; reference: string | null; note: string | null; created_at: string; }
interface Withdrawal {
  id: string; amount: string | number; category: string; purpose: string; status: string;
  requested_by: string; requested_at: string; approved_at: string | null; disbursed_at: string | null; rejection_reason: string | null;
  workflow_id: string | null;
}
interface PettiWorkflow { id: string; name: string; description: string | null; requires_department_approval: boolean; is_system: boolean; }
interface StaffMember { id: string; name: string; role: string; }

function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error',
};

export function PettiWalletDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canAdminister = !!user && FINANCE_ROLES.has(user.role);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [workflows, setWorkflows] = useState<PettiWorkflow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeposit, setShowDeposit] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [depositForm, setDepositForm] = useState({ amount: '', method: 'manual' as 'manual' | 'gateway', reference: '', note: '' });
  const [requestForm, setRequestForm] = useState({ amount: '', category: 'MISCELLANEOUS', purpose: '' });
  const [overrideDraft, setOverrideDraft] = useState<{ category: string; workflowId: string }>({ category: '', workflowId: '' });

  const workflowsById = useMemo(() => Object.fromEntries(workflows.map(w => [w.id, w])), [workflows]);
  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const staffOptions: ComboboxOption[] = useMemo(() => staff.map(s => ({ value: s.id, label: s.name, sublabel: s.role })), [staff]);
  const workflowOptions: ComboboxOption[] = useMemo(() => workflows.map(w => ({
    value: w.id, label: w.name, sublabel: w.requires_department_approval ? 'Department approval + finance release' : 'Finance only',
  })), [workflows]);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/petti/wallets/${id}`)
      .then(res => { setWallet(res.wallet); setDeposits(res.deposits || []); setWithdrawals(res.withdrawals || []); })
      .catch(() => setWallet(null))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    apiFetch('/v1/petti/workflows').then(res => setWorkflows(res.data || [])).catch(() => setWorkflows([]));
    apiFetch('/v1/oneid/users').then(setStaff).catch(() => setStaff([]));
  }, []);

  const isApprover = !!user && wallet?.approver_user_id === user.id;
  const canEditBackup = canAdminister || isApprover;

  function stepLabel(w: Withdrawal): string {
    if (w.status === 'rejected') return 'Rejected';
    if (w.status === 'disbursed') return 'Disbursed';
    const wf = w.workflow_id ? workflowsById[w.workflow_id] : null;
    const requiresDept = wf ? wf.requires_department_approval : true;
    if (w.status === 'pending') return requiresDept ? 'Awaiting department approval' : 'Awaiting finance approval';
    if (w.status === 'approved') return 'Awaiting finance release';
    return w.status;
  }

  function canActOnApproval(w: Withdrawal): boolean {
    if (!user || w.requested_by === user.id) return false;
    if (OVERRIDE_ROLES.has(user.role)) return true;
    const wf = w.workflow_id ? workflowsById[w.workflow_id] : null;
    const requiresDept = wf ? wf.requires_department_approval : true;
    if (requiresDept) {
      const designated = [wallet?.approver_user_id, wallet?.approver_backup_user_id].filter(Boolean) as string[];
      if (designated.length > 0) return designated.includes(user.id);
      return user.role === 'MANAGER' || FINANCE_ROLES.has(user.role);
    }
    return FINANCE_ROLES.has(user.role);
  }
  const canDisburse = !!user && FINANCE_ROLES.has(user.role);

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

  async function setDefaultWorkflow(workflowId: string) {
    try {
      await apiFetch(`/v1/petti/wallets/${id}/workflow`, { method: 'PATCH', body: JSON.stringify({ default_workflow_id: workflowId === NONE ? null : workflowId }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to update workflow', { variant: 'error' }); }
  }

  async function setApprover(approverUserId: string) {
    try {
      await apiFetch(`/v1/petti/wallets/${id}/approver`, { method: 'PATCH', body: JSON.stringify({ approver_user_id: approverUserId === NONE ? null : approverUserId }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to set approver', { variant: 'error' }); }
  }

  async function setApproverBackup(backupUserId: string) {
    try {
      await apiFetch(`/v1/petti/wallets/${id}/approver-backup`, { method: 'PATCH', body: JSON.stringify({ backup_user_id: backupUserId === NONE ? null : backupUserId }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to set backup approver', { variant: 'error' }); }
  }

  async function addCategoryOverride() {
    if (!overrideDraft.category || !overrideDraft.workflowId || !wallet) return;
    const next = { ...(wallet.category_workflow_overrides || {}), [overrideDraft.category]: overrideDraft.workflowId };
    try {
      await apiFetch(`/v1/petti/wallets/${id}/workflow`, { method: 'PATCH', body: JSON.stringify({ category_overrides: next }) });
      setOverrideDraft({ category: '', workflowId: '' });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to add override', { variant: 'error' }); }
  }

  async function removeCategoryOverride(category: string) {
    if (!wallet) return;
    const next = { ...(wallet.category_workflow_overrides || {}) };
    delete next[category];
    try {
      await apiFetch(`/v1/petti/wallets/${id}/workflow`, { method: 'PATCH', body: JSON.stringify({ category_overrides: next }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to remove override', { variant: 'error' }); }
  }

  if (!loading && !wallet) {
    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PageHeader crumbs={['Petti', 'Wallets']} titlePlain="Wallet" titleEm="not found" />
        <Link to="/petti"><Button variant="outline"><Icon name="arrowLeft" size={13} /> Back to wallets</Button></Link>
      </div>
    );
  }

  const overrideEntries = Object.entries(wallet?.category_workflow_overrides || {});
  const overridableCategories = CATEGORIES.filter(c => !overrideEntries.some(([cat]) => cat === c));

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Wallets', wallet?.name || '…']}
        titlePlain={wallet ? wallet.name.split(' ').slice(0, -1).join(' ') || 'Wallet' : 'Wallet'}
        titleEm={wallet ? wallet.name.split(' ').slice(-1)[0] : '…'}
        subtitle={wallet?.description || undefined}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canAdminister && wallet?.status === 'active' && <Button variant="outline" onClick={() => setShowDeposit(s => !s)}><Icon name="arrowDown" size={14} /> Deposit</Button>}
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
          {wallet.approver_user_id && (
            <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
              Department approver: <strong>{staffById[wallet.approver_user_id]?.name || '—'}</strong>
              {wallet.approver_backup_user_id && <span style={{ color: 'var(--ink3)' }}> · backup {staffById[wallet.approver_backup_user_id]?.name || '—'}</span>}
            </div>
          )}
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

      {(canAdminister || isApprover) && wallet && (
        <SectionCard title="Approval workflow" collapsible defaultOpen={showWorkflowSettings} action={
          <Button size="sm" variant="outline" onClick={() => setShowWorkflowSettings(s => !s)}>{showWorkflowSettings ? 'Hide' : 'Configure'}</Button>
        }>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: overrideEntries.length || canAdminister ? 16 : 0 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Default workflow</label>
              {canAdminister ? (
                <Select value={wallet.default_workflow_id || NONE} onValueChange={setDefaultWorkflow}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Platform default (department approval + finance release)</SelectItem>
                    {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{wallet.default_workflow_id ? (workflowsById[wallet.default_workflow_id]?.name || '—') : 'Platform default'}</div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Department approver</label>
              {canAdminister ? (
                <Combobox options={staffOptions} value={wallet.approver_user_id || ''} onChange={setApprover} placeholder="Not configured" searchPlaceholder="Search staff…" />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{wallet.approver_user_id ? (staffById[wallet.approver_user_id]?.name || '—') : 'Not configured'}</div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Backup approver</label>
              {canEditBackup ? (
                <Combobox options={staffOptions} value={wallet.approver_backup_user_id || ''} onChange={setApproverBackup} placeholder="None" searchPlaceholder="Search staff…" disabled={!wallet.approver_user_id} />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{wallet.approver_backup_user_id ? (staffById[wallet.approver_backup_user_id]?.name || '—') : 'None'}</div>
              )}
              {isApprover && !canAdminister && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>You're this wallet's approver — set a backup for when you're away.</div>}
            </div>
          </div>

          {canAdminister && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Category overrides</div>
              {overrideEntries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {overrideEntries.map(([cat, wfId]) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                      <span style={{ minWidth: 140, color: 'var(--ink)' }}>{CATEGORY_LABELS[cat] || cat}</span>
                      <Icon name="arrowRight" size={12} color="var(--ink3)" />
                      <span style={{ flex: 1, color: 'var(--ink2)' }}>{workflowsById[wfId]?.name || '—'}</span>
                      <Button size="sm" variant="outline" onClick={() => removeCategoryOverride(cat)}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}
              {overridableCategories.length > 0 && workflows.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Select value={overrideDraft.category || NONE} onValueChange={v => setOverrideDraft(p => ({ ...p, category: v === NONE ? '' : v }))}>
                    <SelectTrigger className="input-field" style={{ minWidth: 160 }}><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>{overridableCategories.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={overrideDraft.workflowId || NONE} onValueChange={v => setOverrideDraft(p => ({ ...p, workflowId: v === NONE ? '' : v }))}>
                    <SelectTrigger className="input-field" style={{ minWidth: 200 }}><SelectValue placeholder="Workflow" /></SelectTrigger>
                    <SelectContent>{workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!overrideDraft.category || !overrideDraft.workflowId} onClick={addCategoryOverride}>Add override</Button>
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}

      <div style={{ height: 16 }} />

      <SectionCard title="Withdrawal requests" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : withdrawals.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No withdrawal requests yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Purpose', 'Category', 'Amount', 'Requested', 'Step', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {withdrawals.map(w => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{w.purpose}{w.status === 'rejected' && w.rejection_reason ? <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 2 }}>Reason: {w.rejection_reason}</div> : null}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{CATEGORY_LABELS[w.category] || w.category}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{Number(w.amount).toLocaleString()} {wallet?.currency}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(w.requested_at)}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[w.status] || 'gray'}>{stepLabel(w)}</Badge></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {w.status === 'pending' && canActOnApproval(w) && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="outline" disabled={busyId === w.id} onClick={() => reject(w)}>Reject</Button>
                        <Button size="sm" disabled={busyId === w.id} onClick={() => approve(w)}>Approve</Button>
                      </div>
                    )}
                    {w.status === 'approved' && canDisburse && (
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
