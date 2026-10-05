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
        <div className="max-w-2xl">
          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                <GripVertical size={24} />
              </FeaturedIcon>
              <p className="mt-4 text-sm">No stages yet — add one to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {stages.map(stage => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => handleDragStart(stage.id)}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDrop={() => handleDrop(stage.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 bg-card transition-colors cursor-grab ${
                    dragOver === stage.id ? 'border-(--teal)' : 'border-border'
                  } ${dragging === stage.id ? 'opacity-40' : ''}`}
                >
                  <GripVertical size={16} className="text-muted-foreground shrink-0" />
                  <span
                    className="h-3.5 w-3.5 rounded-full shrink-0"
                    style={{ background: stage.color ?? 'var(--teal)' }}
                  />
                  <span className="flex-1 text-sm font-medium text-foreground">{stage.label}</span>
                  {stage.is_won  && <Badge variant="success">Won</Badge>}
                  {stage.is_lost && <Badge variant="error">Lost</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(stage)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(stage)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {terminalCount === 0 && stages.length > 0 && (
            <p className="mt-4 text-sm text-(--gold)">
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
          <DialogBody className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Label</label>
              <Input
                value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Qualified"
                maxLength={100}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Colour</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={draft.color}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  className="h-9 w-10 cursor-pointer rounded-lg border border-border"
                />
                <Input
                  value={draft.color}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  placeholder="#6366f1"
                  className="flex-1 font-mono"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
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
