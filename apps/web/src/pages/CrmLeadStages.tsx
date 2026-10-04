import React, { useEffect, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Dialog, DialogBody, DialogContent, DialogFooter,
  DialogHeader, DialogTitle,
} from '../components/ui/dialog.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Input } from '../components/ui/input.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SwitchRow } from '../components/ui/list-item-row.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';

interface LeadStage {
  id: string;
  label: string;
  color: string | null;
  position: number;
  is_won: boolean;
  is_lost: boolean;
}

interface StageDraft {
  label: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
}

function emptyDraft(): StageDraft {
  return { label: '', color: '#6366f1', is_won: false, is_lost: false };
}

export function CrmLeadStages() {
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeadStage | null>(null);
  const [draft, setDraft] = useState<StageDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/v1/crm/lead-stages');
      setStages(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }

  function openEdit(stage: LeadStage) {
    setEditing(stage);
    setDraft({ label: stage.label, color: stage.color ?? '#6366f1', is_won: stage.is_won, is_lost: stage.is_lost });
    setOpen(true);
  }

  async function save() {
    if (!draft.label.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/v1/crm/lead-stages/${editing.id}`, { method: 'PATCH', body: JSON.stringify(draft) });
      } else {
        const position = stages.length;
        await apiFetch('/v1/crm/lead-stages', { method: 'POST', body: JSON.stringify({ ...draft, position }) });
      }
      setOpen(false);
      await load();
    } catch {
      showAlert('Failed to save stage. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(stage: LeadStage) {
    const ok = await showConfirm(
      `Delete "${stage.label}"? Leads currently in this stage will stay in it until manually moved.`,
    );
    if (!ok) return;
    try {
      await apiFetch(`/v1/crm/lead-stages/${stage.id}`, { method: 'DELETE' });
      await load();
    } catch {
      showAlert('Failed to delete stage.');
    }
  }

  // Drag-to-reorder
  function handleDragStart(id: string) { setDragging(id); }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOver(id); }
  function handleDragEnd() { setDragging(null); setDragOver(null); }

  async function handleDrop(targetId: string) {
    if (!dragging || dragging === targetId) { handleDragEnd(); return; }
    const from = stages.findIndex(s => s.id === dragging);
    const to   = stages.findIndex(s => s.id === targetId);
    if (from === -1 || to === -1) { handleDragEnd(); return; }
    const reordered = [...stages];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((s, i) => ({ ...s, position: i }));
    setStages(updated);
    handleDragEnd();
    try {
      await apiFetch('/v1/crm/lead-stages/reorder', {
        method: 'PUT',
        body: JSON.stringify(updated.map(s => ({ id: s.id, position: s.position }))),
      });
    } catch {
      showAlert('Failed to save new order.');
      await load();
    }
  }

  const terminalCount = stages.filter(s => s.is_won || s.is_lost).length;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Lead stages']}
        titlePlain="Lead"
        titleEm="stages"
        subtitle="Configure the pipeline stages for your lead funnel. Drag rows to reorder."
        actions={<Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />Add stage</Button>}
      />

      {loading ? <SectionLoading /> : (
        <div style={{ maxWidth: 720 }}>
          {stages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink-3)' }}>
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                <GripVertical size={24} />
              </FeaturedIcon>
              <p style={{ marginTop: 16 }}>No stages yet — add one to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stages.map(stage => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => handleDragStart(stage.id)}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDrop={() => handleDrop(stage.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    background: 'var(--surface)',
                    border: `1px solid ${dragOver === stage.id ? 'var(--teal)' : 'var(--border)'}`,
                    borderRadius: 'var(--r)',
                    cursor: 'grab',
                    opacity: dragging === stage.id ? 0.4 : 1,
                    transition: 'border-color 0.15s',
                  }}
                >
                  <GripVertical size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                  <span
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: stage.color ?? 'var(--teal)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, fontWeight: 500 }}>{stage.label}</span>
                  {stage.is_won  && <Badge variant="success" className="text-xs">Won</Badge>}
                  {stage.is_lost && <Badge variant="error"   className="text-xs">Lost</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(stage)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(stage)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {terminalCount === 0 && stages.length > 0 && (
            <p style={{ marginTop: 16, color: 'var(--gold)', fontSize: 13 }}>
              Tip: mark at least one stage as Won and one as Lost so conversions are tracked.
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit stage' : 'New stage'}</DialogTitle>
          </DialogHeader>
          <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Label</label>
              <Input
                value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Qualified"
                maxLength={100}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Colour</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  value={draft.color}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                />
                <Input
                  value={draft.color}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  placeholder="#6366f1"
                  style={{ fontFamily: 'monospace', flex: 1 }}
                  maxLength={7}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <SwitchRow
                title="Won stage"
                description="Leads that reach this stage count as converted."
                checked={draft.is_won}
                onCheckedChange={v => setDraft(d => ({ ...d, is_won: v, is_lost: v ? false : d.is_lost }))}
              />
              <SwitchRow
                title="Lost / Disqualified stage"
                description="Leads that reach this stage count as lost."
                checked={draft.is_lost}
                onCheckedChange={v => setDraft(d => ({ ...d, is_lost: v, is_won: v ? false : d.is_won }))}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!draft.label.trim() || saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
