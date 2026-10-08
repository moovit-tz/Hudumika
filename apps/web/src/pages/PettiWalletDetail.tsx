import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { apiFetch, apiViewBlob } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

const FINANCE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE']);
const OVERRIDE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN']);

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
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const NONE = '__none__';

interface Wallet {
  id: string; name: string; description: string | null; currency: string; status: 'active' | 'closed'; balance: number;
  default_workflow_id: string | null;
  category_workflow_overrides: Record<string, string> | null;
  approver_user_id: string | null;
  approver_backup_user_id: string | null;
}
interface Deposit { id: string; amount: string | number; method: string; reference: string | null; note: string | null; created_at: string; ref: string | null; }
interface Transfer { id: string; from_wallet_id: string; to_wallet_id: string; amount: string | number; note: string | null; created_at: string; ref: string | null; }
interface Flag { id: string; subject_type: 'deposit' | 'withdrawal'; subject_id: string; reason: string; status: 'open' | 'resolved'; raised_by: string; resolved_by: string | null; resolution_note: string | null; created_at: string; }
interface WalletSummary { id: string; name: string; currency: string; status: 'active' | 'closed'; }
interface Withdrawal {
  id: string; amount: string | number; category: string; purpose: string; status: string;
  requested_by: string; requested_at: string; approved_at: string | null; disbursed_at: string | null; rejection_reason: string | null;
  workflow_id: string | null; payee_name: string | null; on_behalf_of_user_id: string | null; ref: string | null;
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
  const navigate = useNavigate();
  const canAdminister = !!user && FINANCE_ROLES.has(user.role);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [allWallets, setAllWallets] = useState<WalletSummary[]>([]);
  const [workflows, setWorkflows] = useState<PettiWorkflow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeposit, setShowDeposit] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [depositForm, setDepositForm] = useState({ amount: '', method: 'manual' as 'manual' | 'gateway', reference: '', note: '' });
  const [requestForm, setRequestForm] = useState({ amount: '', category: 'MISCELLANEOUS', purpose: '', payeeName: '', onBehalfOfUserId: '' });
  const [transferForm, setTransferForm] = useState({ toWalletId: '', amount: '', note: '' });
  const [overrideDraft, setOverrideDraft] = useState<{ category: string; workflowId: string }>({ category: '', workflowId: '' });

  usePageSEO(wallet?.name ? `${wallet.name} — Petty Cash Vault` : 'Petty Cash Vault Detail', 'Inspect live liquidity balance, review approval workflow, and authorize disbursements.');

  const transferTargetOptions: ComboboxOption[] = useMemo(
    () => allWallets.filter(w => w.id !== id && w.status === 'active' && w.currency === wallet?.currency).map(w => ({ value: w.id, label: w.name, sublabel: w.currency })),
    [allWallets, id, wallet?.currency]
  );

  const workflowsById = useMemo(() => Object.fromEntries(workflows.map(w => [w.id, w])), [workflows]);
  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const staffOptions: ComboboxOption[] = useMemo(() => staff.map(s => ({ value: s.id, label: s.name, sublabel: s.role })), [staff]);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/v1/petti/wallets/${id}`),
      apiFetch(`/v1/petti/transfers?wallet_id=${id}`).then(res => res.data || []).catch(() => []),
      apiFetch(`/v1/petti/flags?wallet_id=${id}`).then(res => res.data || []).catch(() => []),
    ])
      .then(([res, xfers, flgs]) => { setWallet(res.wallet); setDeposits(res.deposits || []); setWithdrawals(res.withdrawals || []); setTransfers(xfers); setFlags(flgs); })
      .catch(() => setWallet(null))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    apiFetch('/v1/petti/workflows').then(res => setWorkflows(res.data || [])).catch(() => setWorkflows([]));
    apiFetch('/v1/ondi/users').then(setStaff).catch(() => setStaff([]));
    apiFetch('/v1/petti/wallets').then(res => setAllWallets(res.data || [])).catch(() => setAllWallets([]));
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
        body: JSON.stringify({
          amount, category: requestForm.category, purpose: requestForm.purpose.trim(),
          payee_name: requestForm.payeeName.trim() || undefined,
          on_behalf_of_user_id: requestForm.onBehalfOfUserId || undefined,
        }),
      });
      setRequestForm({ amount: '', category: 'MISCELLANEOUS', purpose: '', payeeName: '', onBehalfOfUserId: '' });
      setShowRequest(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to submit withdrawal request'); }
    finally { setSaving(false); }
  }

  async function saveTransfer() {
    const amount = parseFloat(transferForm.amount);
    if (!(amount > 0)) { setError('Enter a valid amount.'); return; }
    if (!transferForm.toWalletId) { setError('Pick a destination wallet.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/petti/transfers', {
        method: 'POST',
        body: JSON.stringify({ from_wallet_id: id, to_wallet_id: transferForm.toWalletId, amount, note: transferForm.note.trim() || undefined }),
      });
      setTransferForm({ toWalletId: '', amount: '', note: '' });
      setShowTransfer(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to transfer funds'); }
    finally { setSaving(false); }
  }

  function openVoucher(requestId: string) {
    apiViewBlob(`/v1/petti/withdrawals/${requestId}/voucher.pdf`).catch(() => showAlert('Could not open the voucher.', { variant: 'error' }));
  }

  async function raiseFlag(subjectType: 'deposit' | 'withdrawal', subjectId: string) {
    const reason = window.prompt('What looks wrong with this transaction?');
    if (!reason || !reason.trim()) return;
    try {
      await apiFetch('/v1/petti/flags', { method: 'POST', body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, reason: reason.trim() }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to raise flag', { variant: 'error' }); }
  }

  async function resolveFlag(flagId: string) {
    const note = window.prompt('Resolution note (optional):') || undefined;
    try {
      await apiFetch(`/v1/petti/flags/${flagId}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolution_note: note }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to resolve flag', { variant: 'error' }); }
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
      <div className="petti-container">
        <PageHeader crumbs={['Petti', 'Wallets']} titlePlain="Wallet" titleEm="not found" />
        <Button variant="outline" onClick={() => navigate('/petti/wallets')}>
          <Icon name="arrowLeft" size={13} /> Back to Wallets
        </Button>
      </div>
    );
  }

  const overrideEntries = Object.entries(wallet?.category_workflow_overrides || {});
  const overridableCategories = CATEGORIES.filter(c => !overrideEntries.some(([cat]) => cat === c));

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Wallets', wallet?.name || '…']}
        titlePlain={wallet ? wallet.name.split(' ').slice(0, -1).join(' ') || 'Vault' : 'Vault'}
        titleEm={wallet ? wallet.name.split(' ').slice(-1)[0] : '…'}
        subtitle={wallet?.description || 'Corporate digital petty cash vault and expense disbursement station.'}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canAdminister && wallet?.status === 'active' && transferTargetOptions.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowTransfer(s => !s)}>
                <Icon name="arrowRight" size={14} /> Transfer
              </Button>
            )}
            {canAdminister && wallet?.status === 'active' && (
              <Button variant="outline" size="sm" onClick={() => setShowDeposit(s => !s)}>
                <Icon name="arrowDown" size={14} /> Deposit
              </Button>
            )}
            {wallet?.status === 'active' && (
              <Button size="sm" onClick={() => setShowRequest(s => !s)}>
                <Icon name="plus" size={14} /> Request Claim
              </Button>
            )}
          </div>
        }
      />

      {/* Vault Liquidity Status Card */}
      {wallet && (
        <div className="petti-stats-grid">
          <div className="petti-stat-card">
            <div className="petti-stat-card-header">
              <span className="petti-stat-label">Available Liquidity</span>
              <Badge variant={wallet.status === 'active' ? 'success' : 'gray'}>{wallet.status}</Badge>
            </div>
            <div className="petti-stat-value" style={{ color: wallet.balance < 0 ? 'var(--red)' : 'var(--ink)' }}>
              {Number(wallet.balance).toLocaleString()} <span style={{ fontSize: 14, color: 'var(--ink3)' }}>{wallet.currency}</span>
            </div>
            <div className="petti-stat-sub">
              <span>{deposits.length} deposits · {withdrawals.length} claims</span>
            </div>
          </div>

          <div className="petti-stat-card">
            <div className="petti-stat-card-header">
              <span className="petti-stat-label">Department Approver</span>
              <Icon name="user" size={16} color="var(--teal)" />
            </div>
            <div className="petti-stat-value" style={{ fontSize: 17 }}>
              {wallet.approver_user_id ? (staffById[wallet.approver_user_id]?.name || 'Assigned') : 'Default Dept Mgr'}
            </div>
            <div className="petti-stat-sub">
              <span>{wallet.approver_backup_user_id ? `Backup: ${staffById[wallet.approver_backup_user_id]?.name || '—'}` : 'No backup approver assigned'}</span>
            </div>
          </div>

          <div className="petti-stat-card">
            <div className="petti-stat-card-header">
              <span className="petti-stat-label">Audit Flags</span>
              <Badge variant={flags.some(f => f.status === 'open') ? 'warning' : 'success'}>
                {flags.filter(f => f.status === 'open').length} Open
              </Badge>
            </div>
            <div className="petti-stat-value">{flags.length}</div>
            <div className="petti-stat-sub">
              <span>Compliance audit records</span>
            </div>
          </div>
        </div>
      )}

      {showDeposit && (
        <SectionCard title="Record a deposit" collapsible={false}>
          <div className="petti-grid-form" style={{ marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Amount *</label>
              <Input type="number" min="0" value={depositForm.amount} onChange={e => setDepositForm(p => ({ ...p, amount: e.target.value }))} placeholder="Deposit amount" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Method</label>
              <Select value={depositForm.method} onValueChange={v => setDepositForm(p => ({ ...p, method: v as 'manual' | 'gateway' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (Bank wire / cash drop)</SelectItem>
                  <SelectItem value="gateway">Payment gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Reference</label>
              <Input value={depositForm.reference} onChange={e => setDepositForm(p => ({ ...p, reference: e.target.value }))} placeholder="Bank slip / txn ref" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Note</label>
              <Input value={depositForm.note} onChange={e => setDepositForm(p => ({ ...p, note: e.target.value }))} placeholder="Deposit reason" />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={saveDeposit}>{saving ? 'Saving…' : 'Record Deposit'}</Button>
            <Button variant="outline" onClick={() => { setShowDeposit(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      {showTransfer && (
        <SectionCard title="Transfer to another wallet" collapsible={false}>
          <div className="petti-grid-3col" style={{ marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Destination Vault *</label>
              <Combobox options={transferTargetOptions} value={transferForm.toWalletId} onChange={v => setTransferForm(p => ({ ...p, toWalletId: v }))} placeholder="Select destination…" searchPlaceholder="Search wallets…" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Amount *</label>
              <Input type="number" min="0" value={transferForm.amount} onChange={e => setTransferForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Note</label>
              <Input value={transferForm.note} onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))} placeholder="Reason for transfer" />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={saveTransfer}>{saving ? 'Transferring…' : 'Execute Transfer'}</Button>
            <Button variant="outline" onClick={() => { setShowTransfer(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      {showRequest && (
        <SectionCard title="Request a withdrawal voucher" collapsible={false}>
          <div className="petti-grid-3col" style={{ marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Amount *</label>
              <Input type="number" min="0" value={requestForm.amount} onChange={e => setRequestForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Category</label>
              <Select value={requestForm.category} onValueChange={v => setRequestForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Paid to (Payee)</label>
              <Input value={requestForm.payeeName} onChange={e => setRequestForm(p => ({ ...p, payeeName: e.target.value }))} placeholder="Vendor, driver, supplier…" />
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Purpose & Justification *</label>
              <Textarea value={requestForm.purpose} onChange={e => setRequestForm(p => ({ ...p, purpose: e.target.value }))} placeholder="What this petty cash is for" rows={2} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={saveRequest}>{saving ? 'Submitting…' : 'Submit Request'}</Button>
            <Button variant="outline" onClick={() => { setShowRequest(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      {(canAdminister || isApprover) && wallet && (
        <SectionCard title="Approval Workflow Governance" collapsible defaultOpen={showWorkflowSettings} action={
          <Button size="sm" variant="outline" onClick={() => setShowWorkflowSettings(s => !s)}>{showWorkflowSettings ? 'Hide' : 'Configure'}</Button>
        }>
          <div className="petti-grid-3col" style={{ marginBottom: overrideEntries.length || canAdminister ? 16 : 0 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Default Workflow</label>
              {canAdminister ? (
                <Select value={wallet.default_workflow_id || NONE} onValueChange={setDefaultWorkflow}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Platform default (Department approval + finance release)</SelectItem>
                    {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{wallet.default_workflow_id ? (workflowsById[wallet.default_workflow_id]?.name || '—') : 'Platform default'}</div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Department Approver</label>
              {canAdminister ? (
                <Combobox options={staffOptions} value={wallet.approver_user_id || ''} onChange={setApprover} placeholder="Not configured" searchPlaceholder="Search staff…" />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{wallet.approver_user_id ? (staffById[wallet.approver_user_id]?.name || '—') : 'Not configured'}</div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Backup Approver</label>
              {canEditBackup ? (
                <Combobox options={staffOptions} value={wallet.approver_backup_user_id || ''} onChange={setApproverBackup} placeholder="None" searchPlaceholder="Search staff…" disabled={!wallet.approver_user_id} />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{wallet.approver_backup_user_id ? (staffById[wallet.approver_backup_user_id]?.name || '—') : 'None'}</div>
              )}
            </div>
          </div>

          {canAdminister && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Category Overrides</div>
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
                    <SelectTrigger style={{ minWidth: 160 }}><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>{overridableCategories.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={overrideDraft.workflowId || NONE} onValueChange={v => setOverrideDraft(p => ({ ...p, workflowId: v === NONE ? '' : v }))}>
                    <SelectTrigger style={{ minWidth: 200 }}><SelectValue placeholder="Workflow" /></SelectTrigger>
                    <SelectContent>{workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!overrideDraft.category || !overrideDraft.workflowId} onClick={addCategoryOverride}>Add Override</Button>
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* Withdrawal Requests */}
      <SectionCard title="Withdrawal Claims" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : withdrawals.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No withdrawal requests recorded yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Purpose', 'Category', 'Amount', 'Requested', 'Step', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withdrawals.map(w => (
                  <tr key={w.id}>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{w.ref || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{w.purpose}</div>
                      {w.payee_name && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Paid to {w.payee_name}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink2)' }}>{CATEGORY_LABELS[w.category] || w.category}</td>
                    <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--ink)' }}>{Number(w.amount).toLocaleString()} {wallet?.currency}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(w.requested_at)}</td>
                    <td><Badge variant={STATUS_VARIANT[w.status] || 'gray'}>{stepLabel(w)}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {w.status === 'pending' && canActOnApproval(w) && (
                          <>
                            <Button size="sm" variant="outline" disabled={busyId === w.id} onClick={() => reject(w)}>Reject</Button>
                            <Button size="sm" disabled={busyId === w.id} onClick={() => approve(w)}>Approve</Button>
                          </>
                        )}
                        {w.status === 'approved' && canDisburse && (
                          <Button size="sm" disabled={busyId === w.id} onClick={() => disburse(w)}>Disburse</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openVoucher(w.id)} title="Print voucher">
                          <Icon name="printer" size={12} />
                        </Button>
                        <button type="button" onClick={() => raiseFlag('withdrawal', w.id)} title="Flag this transaction" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'var(--ink3)' }} data-ui-native-button="">
                          <Icon name="flag" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Deposits */}
      <SectionCard title="Deposits Ledger" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : deposits.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No deposits recorded yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Amount', 'Method', 'Reference', 'Note', 'Date', ''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deposits.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{d.ref || '—'}</td>
                    <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--green)' }}>+{Number(d.amount).toLocaleString()} {wallet?.currency}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink2)', textTransform: 'capitalize' }}>{d.method}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{d.reference || '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{d.note || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(d.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" onClick={() => raiseFlag('deposit', d.id)} title="Flag this transaction" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', color: 'var(--ink3)' }} data-ui-native-button="">
                        <Icon name="flag" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Transfers */}
      <SectionCard title="Transfers Ledger" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : transfers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No transfers yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Direction', 'Vault', 'Amount', 'Note', 'Date'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => {
                  const outgoing = t.from_wallet_id === id;
                  const otherWalletId = outgoing ? t.to_wallet_id : t.from_wallet_id;
                  const otherWalletName = allWallets.find(w => w.id === otherWalletId)?.name || '—';
                  return (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{t.ref || '—'}</td>
                      <td><Badge variant={outgoing ? 'gray' : 'success'}>{outgoing ? 'Sent' : 'Received'}</Badge></td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{outgoing ? `To ${otherWalletName}` : `From ${otherWalletName}`}</td>
                      <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: outgoing ? 'var(--red)' : 'var(--green)' }}>
                        {outgoing ? '−' : '+'}{Number(t.amount).toLocaleString()} {wallet?.currency}
                      </td>
                      <td style={{ color: 'var(--ink2)' }}>{t.note || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(t.created_at)}</td>
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
