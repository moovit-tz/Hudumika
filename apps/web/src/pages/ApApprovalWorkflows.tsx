import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { SwitchRow } from '../components/ui/list-item-row.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Combobox } from '../components/ui/combobox.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Icon } from '../components/Icon.js';
import { useFinanceReadOnly } from '../components/FinanceCapabilityGate.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Badge } from '../components/ui/badge.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionLoading } from '../components/ui/spinner.js';

interface Staff { id: string; name: string; email: string; }
interface Workflow {
  id: string;
  name: string;
  min_amount: string | number;
  approver_user_id: string;
  approver_backup_user_id: string | null;
  active: boolean;
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

export function ApApprovalWorkflows() {
  const { fmt } = useCurrency();
  const readOnly = useFinanceReadOnly();
  const [required, setRequired] = useState(false);
  const [savingRequired, setSavingRequired] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [name, setName] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [approverId, setApproverId] = useState('');
  const [backupId, setBackupId] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [settingsRes, wf, staffList] = await Promise.all([
        apiFetch('/v1/settings'),
        apiFetch('/v1/ap-approval-workflows'),
        apiFetch('/v1/hr/staff').catch(() => []),
      ]);
      setRequired(settingsRes?.settings?.ap_approval_required === true);
      setWorkflows(Array.isArray(wf) ? wf : []);
      setStaff(Array.isArray(staffList) ? staffList : []);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not load approval workflows.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (readOnly) {
      setShowForm(false);
      setEditing(null);
    }
  }, [readOnly]);

  async function toggleRequired(next: boolean) {
    setSavingRequired(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ ap_approval_required: next }) });
      setRequired(next);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not update this setting.');
    } finally {
      setSavingRequired(false);
    }
  }

  function openNew() {
    setEditing(null); setName(''); setMinAmount(''); setApproverId(''); setBackupId(''); setActive(true);
    setShowForm(true);
  }

  function openEdit(w: Workflow) {
    setEditing(w); setName(w.name); setMinAmount(String(w.min_amount));
    setApproverId(w.approver_user_id); setBackupId(w.approver_backup_user_id ?? ''); setActive(w.active);
    setShowForm(true);
  }

  async function submit() {
    if (!name.trim()) return showAlert('A name is required.');
    const amount = Number(minAmount);
    if (!Number.isFinite(amount) || amount < 0) return showAlert('Enter a valid threshold amount.');
    if (!approverId) return showAlert('An approver is required.');
    if (backupId && backupId === approverId) return showAlert('The backup approver must be a different person than the approver.');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(), min_amount: amount,
        approver_user_id: approverId, approver_backup_user_id: backupId || null,
        active,
      };
      if (editing) await apiFetch(`/v1/ap-approval-workflows/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch('/v1/ap-approval-workflows', { method: 'POST', body: JSON.stringify(payload) });
      setShowForm(false);
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this workflow.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(w: Workflow) {
    try {
      await apiFetch(`/v1/ap-approval-workflows/${w.id}`, { method: 'PATCH', body: JSON.stringify({ active: !w.active }) });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not update this workflow.');
    }
  }

  async function remove(w: Workflow) {
    if (!(await showConfirm(`Delete the "${w.name}" workflow? Bills already pending approval under it will need a new workflow to resolve.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/ap-approval-workflows/${w.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not delete this workflow.');
    }
  }

  const staffOptions = staff.map(s => ({ value: s.id, label: s.name, sublabel: s.email }));
  const staffById = new Map(staff.map(s => [s.id, s]));

  if (loading) return <SectionLoading label="Loading approval workflows…" />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Approval"
        titleEm="workflows"
        subtitle="Require sign-off on supplier bills above a threshold before they post to the ledger."
      />

      <div className="card" style={{ padding: '4px 18px', marginBottom: 18 }}>
        <SwitchRow
          title="Require approval before posting bills"
          description="When on, a bill only posts straight to the ledger if no active workflow's threshold applies to its total — otherwise it waits for its named approver."
          checked={required}
          onCheckedChange={toggleRequired}
          disabled={readOnly || savingRequired}
        />
      </div>

      {!readOnly && <div style={{ padding: '0 0 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="button" size="sm" onClick={openNew}>
          <Icon name="plus" size={14} /> New workflow
        </Button>
      </div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Applies from</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Approver</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Backup</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>
                  No workflows defined yet{required ? ' — approval is required but no bill will ever qualify until one exists.' : '.'}
                </td></tr>
              ) : workflows.slice().sort((a, b) => Number(a.min_amount) - Number(b.min_amount)).map(w => {
                const approver = staffById.get(w.approver_user_id);
                const backup = w.approver_backup_user_id ? staffById.get(w.approver_backup_user_id) : null;
                return (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{w.name}</td>
                    <td style={{ padding: '9px 12px' }}>{fmt(Number(w.min_amount))} and above</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={w.approver_user_id} name={approver?.name ?? 'Unknown'} size={22} />
                        <span>{approver?.name ?? 'Unknown user'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', color: backup ? 'var(--ink)' : 'var(--ink3)' }}>
                      {backup ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar userId={w.approver_backup_user_id} name={backup.name} size={22} />
                          <span>{backup.name}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <Badge variant={w.active ? 'success' : 'gray'}>{w.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      {!readOnly && <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Tip label="Edit">
                          <Button type="button" variant="ghost" size="icon" iconOnly aria-label="Edit" onClick={() => openEdit(w)}>
                            <Icon name="edit" size={14} />
                          </Button>
                        </Tip>
                        <Tip label={w.active ? 'Deactivate' : 'Activate'}>
                          <Button type="button" variant="ghost" size="icon" iconOnly aria-label={w.active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(w)}>
                            <Icon name={w.active ? 'pause' : 'play'} size={14} />
                          </Button>
                        </Tip>
                        <Tip label="Delete">
                          <Button type="button" variant="ghost" size="icon" iconOnly aria-label="Delete" onClick={() => remove(w)}>
                            <Icon name="trash2" size={14} color="var(--red)" />
                          </Button>
                        </Tip>
                      </div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!readOnly && showForm} onOpenChange={o => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-100 gap-0">
          <DialogTitle style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>{editing ? 'Edit Workflow' : 'New Workflow'}</DialogTitle>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-value bills" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Applies to bills of at least</label>
            <Input type="number" min={0} step="any" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Approver</label>
            <Combobox options={staffOptions} value={approverId} onChange={setApproverId} placeholder="Select an approver…" searchPlaceholder="Search staff…" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Backup approver (optional)</label>
            <Combobox options={staffOptions.filter(o => o.value !== approverId)} value={backupId} onChange={setBackupId} placeholder="None" searchPlaceholder="Search staff…" />
          </div>

          {editing && (
            <div style={{ marginBottom: 16 }}>
              <SwitchRow title="Active" description="Only active workflows are matched against a bill's total." checked={active} onCheckedChange={setActive} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
