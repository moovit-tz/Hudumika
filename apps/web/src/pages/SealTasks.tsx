import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface Task {
  id: string; compartmentId: string | null; lotId: string | null; title: string;
  status: 'open' | 'in_progress' | 'complete' | 'blocked'; priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string | null; assigneeName?: string; dueDate: string | null; note: string | null;
  compartmentName?: string; lotDescription?: string;
}
interface Staff { id: string; name: string; }
interface Compartment { id: string; code: string; name: string; }

const COLUMNS: { status: Task['status']; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'complete', label: 'Complete' },
];

const PRIORITY_VARIANT: Record<Task['priority'], 'gray' | 'info' | 'warning' | 'error'> = {
  low: 'gray', medium: 'info', high: 'warning', urgent: 'error',
};

export function SealTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState<Date | undefined>(undefined);
  const [newCompartmentId, setNewCompartmentId] = useState('');
  const [compartments, setCompartments] = useState<Compartment[]>([]);

  function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/tasks?${params.toString()}`).then(setTasks).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [compartmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch('/v1/hr/staff').then((res: any) => setStaff(Array.isArray(res) ? res : res.data || res.staff || []));
    apiFetch('/v1/seal/compartments').then(setCompartments);
  }, []);
  useEffect(() => {
    if (compartmentId) setNewCompartmentId(compartmentId);
  }, [compartmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(), priority: newPriority, assignedTo: newAssignee || null,
          dueDate: newDue ? toDateOnlyString(newDue) : null, compartmentId: newCompartmentId || null,
        }),
      });
      setNewTitle(''); setNewAssignee(''); setNewDue(undefined); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this task.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(task: Task, status: Task['status']) {
    try {
      await apiFetch(`/v1/seal/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update this task.');
    }
  }

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Warehouse Activities</h1>
          <p className="seal-page-sub">Tasks assigned to real staff — surfaces in their personal Tasks app too, so nothing lives only inside SEAL.</p>
        </div>
        <Button type="button" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>New Task</span>
        </Button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div className="seal-form-grid-2">
            <div className="seal-field-row" style={{ gridColumn: '1 / -1' }}>
              <label className="seal-field-label">Title</label>
              <Input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Re-stack Rack B-04 after inspection" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Compartment</label>
              <Select value={newCompartmentId} onValueChange={setNewCompartmentId}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Any / not compartment-specific" /></SelectTrigger>
                <SelectContent>{compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Priority</label>
              <Select value={newPriority} onValueChange={v => setNewPriority(v as Task['priority'])}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Assign To</label>
              <Combobox
                options={staff.map(s => ({ value: s.id, label: s.name }))}
                value={newAssignee}
                onChange={setNewAssignee}
                placeholder="Unassigned"
                searchPlaceholder="Search staff…"
                emptyText="No matching staff."
              />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Due Date</label>
              <DatePicker date={newDue} onChange={setNewDue} />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newTitle.trim()}>{saving ? 'Creating…' : 'Create Task'}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="seal-empty">Loading…</div>
      ) : (
        <div className="seal-kanban">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.status);
            return (
              <div key={col.status} className="seal-card">
                <div className="seal-card-hdr">
                  <h2 className="seal-card-title" style={{ fontSize: 13 }}>{col.label}</h2>
                  <Badge variant="gray">{colTasks.length}</Badge>
                </div>
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 80 }}>
                  {colTasks.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '8px 4px' }}>Nothing here.</div>
                  ) : colTasks.map(t => (
                    <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{t.title}</div>
                        <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority}</Badge>
                      </div>
                      {(t.compartmentName || t.lotDescription) && (
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{[t.compartmentName, t.lotDescription].filter(Boolean).join(' · ')}</div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--ink3)' }}>
                        <span>{t.assigneeName ?? 'Unassigned'}</span>
                        {t.dueDate && <span>{new Date(t.dueDate).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <Select value={t.status} onValueChange={v => handleMove(t, v as Task['status'])}>
                          <SelectTrigger className="input-field" style={{ height: 28, fontSize: 11.5 }}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {COLUMNS.map(c => <SelectItem key={c.status} value={c.status}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
