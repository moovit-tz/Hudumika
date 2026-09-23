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

interface Staff { id: string; name: string; email: string; }
interface Workflow {
  id: string;
  name: string;
  min_amount: string | number;
  approver_user_id: string;
  approver_backup_user_id: string | null;
  active: boolean;
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

export function ApApprovalWorkflows() {
  const { fmt } = useCurrency();
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

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading approval workflows…</div>;

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
          disabled={savingRequired}
        />
      </div>

      <div style={{ padding: '0 0 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button"
          onClick={openNew}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Workflow
        </button>
      </div>

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
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: w.active ? 'var(--green-l)' : 'var(--bg)', color: w.active ? 'var(--green)' : 'var(--ink3)' }}>
                        {w.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => openEdit(w)} style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                        <button type="button" onClick={() => toggleActive(w)} style={{ fontSize: 12, color: 'var(--ink2)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{w.active ? 'Deactivate' : 'Activate'}</button>
                        <button type="button" onClick={() => remove(w)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={o => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-100 gap-0">
          <DialogTitle style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>{editing ? 'Edit Workflow' : 'New Workflow'}</DialogTitle>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Name</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-value bills" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Applies to bills of at least</label>
            <input type="number" min={0} step="any" style={inp} value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0.00" />
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
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
