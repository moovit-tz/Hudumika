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
import './Inventory.css';
import { PageHeader } from '../components/PageHeader.js';

interface Task {
  id: string; itemId: string | null; warehouseId: string | null; title: string;
  status: 'open' | 'in_progress' | 'complete' | 'blocked'; priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string | null; assigneeName?: string; dueDate: string | null; note: string | null;
  itemName?: string; warehouseName?: string;
}
interface Staff { id: string; name: string; }
interface Item { id: string; sku: string; name: string; }

const COLUMNS: { status: Task['status']; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'complete', label: 'Complete' },
];

const PRIORITY_VARIANT: Record<Task['priority'], 'gray' | 'info' | 'warning' | 'error'> = {
  low: 'gray', medium: 'info', high: 'warning', urgent: 'error',
};

export function InventoryTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState<Date | undefined>(undefined);
  const [newItemId, setNewItemId] = useState('');

  function reload() {
    setLoading(true);
    apiFetch('/v1/inventory/tasks').then(setTasks).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    apiFetch('/v1/hr/staff').then((res: any) => setStaff(Array.isArray(res) ? res : res.data || res.staff || []));
    apiFetch('/v1/inventory/items').then(setItems);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/inventory/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(), priority: newPriority, assignedTo: newAssignee || null,
          dueDate: newDue ? toDateOnlyString(newDue) : null, itemId: newItemId || null,
        }),
      });
      setNewTitle(''); setNewAssignee(''); setNewDue(undefined); setNewItemId(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this task.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(task: Task, status: Task['status']) {
    try {
      await apiFetch(`/v1/inventory/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update this task.');
    }
  }

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <PageHeader
            crumbs={['Inventory', 'Tasks']}
            titlePlain="Warehouse"
            titleEm="tasks"
            subtitle="Tasks assigned to real staff — surfaces in their personal Tasks app too, so nothing lives only inside Inventory Control."
          />
        </div>
        <Button type="button" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>New Task</span>
        </Button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="inv-card" style={{ marginBottom: 20 }}>
          <div className="inv-form-grid-2">
            <div className="inv-field-row" style={{ gridColumn: '1 / -1' }}>
              <label className="inv-field-label">Title</label>
              <Input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Restock 20L Cooking Oil Jerrycan" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Related Item (optional)</label>
              <Combobox
                options={items.map(i => ({ value: i.id, label: i.name, sublabel: i.sku }))}
                value={newItemId} onChange={setNewItemId}
                placeholder="None" searchPlaceholder="Search items…" emptyText="No matching items."
              />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Priority</label>
              <Select value={newPriority} onValueChange={v => setNewPriority(v as Task['priority'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Assign To</label>
              <Combobox
                options={staff.map(s => ({ value: s.id, label: s.name }))}
                value={newAssignee} onChange={setNewAssignee}
                placeholder="Unassigned" searchPlaceholder="Search staff…" emptyText="No matching staff."
              />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Due Date</label>
              <DatePicker date={newDue} onChange={setNewDue} />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newTitle.trim()}>{saving ? 'Creating…' : 'Create Task'}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="inv-empty">Loading…</div>
      ) : (
        <div className="inv-kanban">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.status);
            return (
              <div key={col.status} className="inv-card">
                <div className="inv-card-hdr">
                  <h2 className="inv-card-title" style={{ fontSize: 13 }}>{col.label}</h2>
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
                      {t.itemName && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{t.itemName}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--ink3)' }}>
                        <span>{t.assigneeName ?? 'Unassigned'}</span>
                        {t.dueDate && <span>{new Date(t.dueDate).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <Select value={t.status} onValueChange={v => handleMove(t, v as Task['status'])}>
                          <SelectTrigger style={{ height: 28, fontSize: 11.5 }}><SelectValue /></SelectTrigger>
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
