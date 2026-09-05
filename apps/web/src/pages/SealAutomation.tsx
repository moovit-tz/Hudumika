import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Rule {
  id: string; compartmentId: string | null; name: string;
  triggerType: 'lot_flagged' | 'storage_expiring' | 'examination_pending' | 'low_stock';
  thresholdValue: number | null; actionType: 'create_task' | 'create_ticket';
  actionAssignee: string | null; active: boolean;
}
interface Run {
  id: string; ruleId: string; ruleName?: string; subjectType: string; status: string;
  resultType: string | null; firedAt: string;
}
interface Staff { id: string; name: string; }
interface Compartment { id: string; code: string; name: string; }

const TRIGGER_LABELS: Record<Rule['triggerType'], string> = {
  lot_flagged: 'Lot flagged (seized/abandoned)',
  storage_expiring: 'Storage expiring within N days',
  examination_pending: 'Examination pending',
  low_stock: 'Lot quantity at or below N',
};

export function SealAutomation() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCompartmentId, setNewCompartmentId] = useState('');
  const [newTrigger, setNewTrigger] = useState<Rule['triggerType']>('storage_expiring');
  const [newThreshold, setNewThreshold] = useState('30');
  const [newAction, setNewAction] = useState<Rule['actionType']>('create_task');
  const [newAssignee, setNewAssignee] = useState('');

  function reload() {
    setLoading(true);
    Promise.all([apiFetch('/v1/seal/automation-rules'), apiFetch('/v1/seal/automation-runs')])
      .then(([r, ru]) => { setRules(r); setRuns(ru); })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    reload();
    apiFetch('/v1/hr/staff').then((res: any) => setStaff(Array.isArray(res) ? res : res.data || res.staff || []));
    apiFetch('/v1/seal/compartments').then(setCompartments);
  }, []);

  const needsThreshold = newTrigger === 'storage_expiring' || newTrigger === 'low_stock';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/automation-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(), compartmentId: newCompartmentId || null, triggerType: newTrigger,
          thresholdValue: needsThreshold && newThreshold ? Number(newThreshold) : null,
          actionType: newAction, actionAssignee: newAction === 'create_task' ? (newAssignee || null) : null,
        }),
      });
      setNewName(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this rule.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: Rule) {
    try {
      await apiFetch(`/v1/seal/automation-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ active: !rule.active }) });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update this rule.');
    }
  }

  async function handleDelete(rule: Rule) {
    try {
      await apiFetch(`/v1/seal/automation-rules/${rule.id}`, { method: 'DELETE' });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete this rule.');
    }
  }

  async function handleEvaluate() {
    setEvaluating(true);
    try {
      const res = await apiFetch('/v1/seal/automation-rules/evaluate', { method: 'POST' });
      showAlert(res.firedCount > 0 ? `${res.firedCount} automation action(s) fired.` : 'No rules matched any current lots or examinations.', { title: 'Automation Check Complete', variant: 'success' });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to run the automation check.');
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Automation Rules']}
        titlePlain="Automation"
        titleEm="rules"
        subtitle="On-demand trigger→action rules — press &quot;Run Automation Check&quot; to evaluate them against current lots and examinations. There is no background scheduler; this always runs when you ask it to."
      />
      <div className="seal-page-hdr">
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" variant="outline" onClick={handleEvaluate} disabled={evaluating}>
            <Icon name="refresh" size={14} /><span>{evaluating ? 'Running…' : 'Run Automation Check'}</span>
          </Button>
          <Button type="button" onClick={() => setShowNew(v => !v)}>
            <Icon name="plus" size={14} /><span>New Rule</span>
          </Button>
        </div>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div className="seal-form-grid-2">
            <div className="seal-field-row" style={{ gridColumn: '1 / -1' }}>
              <label className="seal-field-label">Rule Name</label>
              <Input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Escalate seized lots to Support" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Applies To</label>
              <Select value={newCompartmentId || '__all__'} onValueChange={v => setNewCompartmentId(v === '__all__' ? '' : v)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All warehouses</SelectItem>
                  {compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Trigger</label>
              <Select value={newTrigger} onValueChange={v => setNewTrigger(v as Rule['triggerType'])}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRIGGER_LABELS) as Rule['triggerType'][]).map(t => <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {needsThreshold && (
              <div className="seal-field-row">
                <label className="seal-field-label">{newTrigger === 'storage_expiring' ? 'Within N Days' : 'Quantity At Or Below'}</label>
                <Input type="number" min="0" step="any" value={newThreshold} onChange={e => setNewThreshold(e.target.value)} />
              </div>
            )}
            <div className="seal-field-row">
              <label className="seal-field-label">Action</label>
              <Select value={newAction} onValueChange={v => setNewAction(v as Rule['actionType'])}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_task">Create a warehouse task</SelectItem>
                  <SelectItem value="create_ticket">Raise a support ticket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newAction === 'create_task' && (
              <div className="seal-field-row">
                <label className="seal-field-label">Assign Task To</label>
                <Combobox
                  options={staff.map(s => ({ value: s.id, label: s.name }))}
                  value={newAssignee} onChange={setNewAssignee}
                  placeholder="Unassigned" searchPlaceholder="Search staff…" emptyText="No matching staff."
                />
              </div>
            )}
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newName.trim()}>{saving ? 'Creating…' : 'Create Rule'}</Button>
          </div>
        </form>
      )}

      <div className="seal-card" style={{ marginBottom: 20 }}>
        <div className="seal-card-hdr"><h2 className="seal-card-title">Rules</h2></div>
        <div className="seal-card-body">
          {loading ? (
            <SectionLoading />
          ) : rules.length === 0 ? (
            <div className="seal-empty">No automation rules defined yet.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Name</th><th>Trigger</th><th>Action</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                    <td>{TRIGGER_LABELS[r.triggerType]}{r.thresholdValue != null ? ` (${r.thresholdValue})` : ''}</td>
                    <td>{r.actionType === 'create_task' ? 'Create task' : 'Raise ticket'}</td>
                    <td><Badge variant={r.active ? 'success' : 'gray'}>{r.active ? 'Active' : 'Paused'}</Badge></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleToggle(r)}>{r.active ? 'Pause' : 'Activate'}</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleDelete(r)}><Icon name="trash" size={13} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-hdr"><h2 className="seal-card-title">Recent Firings</h2></div>
        <div className="seal-card-body">
          {runs.length === 0 ? (
            <div className="seal-empty">No rule has fired yet.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Rule</th><th>Subject</th><th>Result</th><th>Status</th><th>Fired</th></tr></thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id}>
                    <td>{run.ruleName ?? '—'}</td>
                    <td>{run.subjectType}</td>
                    <td>{run.resultType === 'task' ? 'Task created' : 'Ticket raised'}</td>
                    <td><Badge variant={run.status === 'open' ? 'warning' : 'success'}>{run.status}</Badge></td>
                    <td>{new Date(run.firedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
