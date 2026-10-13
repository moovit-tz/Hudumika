import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { KanbanBoard, type KanbanColumn, type KanbanCardData } from '../components/ui/kanban-board.js';

interface Task {
  id: string; compartmentId: string | null; lotId: string | null; title: string;
  status: 'open' | 'in_progress' | 'complete' | 'blocked'; priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string | null; assigneeName?: string; dueDate: string | null; note: string | null;
  compartmentName?: string; lotDescription?: string;
}
interface Staff { id: string; name: string; }
interface Compartment { id: string; code: string; name: string; }

const COLUMNS: KanbanColumn<Task['status']>[] = [
  { id: 'open', label: 'Open', color: 'var(--ink2)' },
  { id: 'in_progress', label: 'In Progress', color: 'var(--blue)' },
  { id: 'blocked', label: 'Blocked', color: 'var(--red)' },
  { id: 'complete', label: 'Complete', color: 'var(--green)' },
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
      <PageHeader
        crumbs={['SEAL', 'Warehouse Activities']}
        titlePlain="Warehouse"
        titleEm="activities"
        subtitle="Tasks assigned to real staff — surfaces in their personal Tasks app too, so nothing lives only inside SEAL."
      />
      <div className="seal-page-hdr">
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
        <SectionLoading />
      ) : (
        <KanbanBoard<KanbanCardData & { task: Task }, Task['status']>
          columns={COLUMNS}
          items={tasks.map(t => ({ id: t.id, columnId: t.status, task: t }))}
          emptyMessage="Nothing here"
          onDrop={(itemId, _from, toCol) => {
            const t = tasks.find(x => x.id === itemId);
            if (t) handleMove(t, toCol as Task['status']);
          }}
          renderCard={(item) => {
            const t = item.task;
            return (
              <div>
                <div className="kb-card-topline">
                  <span className="kb-card-title" style={{ marginBottom: 0, flex: 1 }}>{t.title}</span>
                  <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority}</Badge>
                </div>
                {(t.compartmentName || t.lotDescription) && (
                  <div className="kb-card-subtitle">{[t.compartmentName, t.lotDescription].filter(Boolean).join(' · ')}</div>
                )}
                <div className="kb-card-meta">
                  <span className="kb-meta-item">
                    {t.assigneeName && <PersonAvatar userId={t.assignedTo} name={t.assigneeName} size={16} />}
                    {t.assigneeName ?? 'Unassigned'}
                  </span>
                  {t.dueDate && (
                    <span className="kb-meta-item" style={{ marginLeft: 'auto' }}>
                      <Icon name="calendar" size={11} color="var(--ink3)" />
                      {new Date(t.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
