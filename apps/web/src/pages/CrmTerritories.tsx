import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Search, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '../components/ui/dialog.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Switch } from '../components/ui/switch.js';
import { Tip } from '../components/ui/tooltip.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

type ConditionField = 'source' | 'industry' | 'location' | 'priority' | 'company';
type ConditionOp    = 'eq' | 'contains' | 'starts_with';
interface Criterion { field: ConditionField; op: ConditionOp; value: string }
interface TerritoryMember { user_id: string; user_name: string | null }
interface Territory {
  id: string; name: string; description: string | null;
  active: boolean; criteria: Criterion[]; color: string | null;
  members: TerritoryMember[];
}
interface UserOption { id: string; name: string }

const FIELD_LABEL: Record<ConditionField, string> = {
  source: 'Source', industry: 'Industry', location: 'Location',
  priority: 'Priority', company: 'Company',
};
const OP_LABEL: Record<ConditionOp, string> = {
  eq: 'equals', contains: 'contains', starts_with: 'starts with',
};
const EMPTY_CRITERION: Criterion = { field: 'location', op: 'eq', value: '' };

interface TerritoryDraft {
  name: string; description: string; active: boolean;
  criteria: Criterion[]; color: string; member_ids: string[];
}

function emptyDraft(): TerritoryDraft {
  return { name: '', description: '', active: true, criteria: [], color: '', member_ids: [] };
}

export function CrmTerritories() {
  const [territories, setTerritories] = useState<Territory[] | null>(null);
  const [users, setUsers]             = useState<UserOption[]>([]);
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Territory | null>(null);
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [draft, setDraft]             = useState<TerritoryDraft>(emptyDraft);
  const [saving, setSaving]           = useState(false);
  const [togglingId, setTogglingId]   = useState<string | null>(null);

  const load = useCallback(() => {
    setTerritories(null);
    apiFetch('/v1/crm/territories').then(setTerritories).catch(() => setTerritories([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch('/v1/ondi/users')
      .then((r: any) => {
        const all: UserOption[] = Array.isArray(r) ? r : [];
        const SALES_ROLES = new Set(['SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'MANAGER', 'ADMIN', 'TENANT_ADMIN']);
        setUsers(all.filter((u: any) => SALES_ROLES.has(u.role) && u.active !== false));
      })
      .catch(() => setUsers([]));
  }, []);

  const filtered = (territories ?? []).filter(t => {
    const q = search.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
  });

  function openCreate() {
    setEditId(null);
    setDraft(emptyDraft());
    setDialogOpen(true);
  }

  function openEdit(t: Territory) {
    setEditId(t.id);
    setDraft({
      name: t.name, description: t.description ?? '',
      active: t.active, criteria: t.criteria.map(c => ({ ...c })),
      color: t.color ?? '',
      member_ids: t.members.map(m => m.user_id),
    });
    setDialogOpen(true);
  }

  function setCriterion(idx: number, patch: Partial<Criterion>) {
    setDraft(d => ({ ...d, criteria: d.criteria.map((c, i) => i === idx ? { ...c, ...patch } : c) }));
  }

  async function save() {
    if (!draft.name.trim()) return;
    if (draft.criteria.some(c => !c.value.trim())) { showAlert('All criteria must have a value.'); return; }
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        active: draft.active,
        criteria: draft.criteria,
        color: draft.color || null,
        member_ids: draft.member_ids,
      };
      if (editId) {
        await apiFetch(`/v1/crm/territories/${editId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/v1/crm/territories', { method: 'POST', body: JSON.stringify(body) });
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save territory');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(t: Territory) {
    setTogglingId(t.id);
    try {
      await apiFetch(`/v1/crm/territories/${t.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !t.active }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update territory');
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(t: Territory) {
    const ok = await showConfirm(`Delete territory "${t.name}"? Leads and deals in this territory will be untagged.`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/crm/territories/${t.id}`, { method: 'DELETE' });
      if (selected?.id === t.id) setSelected(null);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete territory');
    }
  }

  const memberIdsSet = new Set(draft.member_ids);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Territories']}
        titlePlain="Sales"
        titleEm="territories"
        subtitle="Group leads and deals into named regions or segments. Assign reps and define criteria for automatic tagging."
        actions={(
          <Button size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Territory
          </Button>
        )}
      />

      <Card>
        <CardHeader className="gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Territories</CardTitle>
              {territories && <Badge variant="gray">{territories.length}</Badge>}
            </div>
            <CardDescription className="mt-1">
              Click a territory to view its criteria and reps.
            </CardDescription>
          </div>
          <div className="relative w-full lg:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search territories…" className="pl-9" />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {territories === null ? (
            <div className="flex min-h-48 items-center justify-center"><SectionLoading /></div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                {search ? <Search className="h-6 w-6" /> : <MapPin className="h-6 w-6" />}
              </FeaturedIcon>
              <h2 className="mt-4 text-sm font-bold text-foreground">
                {search ? 'No matching territories' : 'No territories yet'}
              </h2>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {search ? 'Try a different name.' : 'Create your first territory to start routing leads by region or segment.'}
              </p>
              {!search && (
                <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Create territory
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(t => (
                <div
                  key={t.id}
                  className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/20 ${t.active ? '' : 'opacity-60'}`}
                  onClick={() => openEdit(t)}
                >
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: t.color ? `${t.color}22` : 'var(--teal-l)', color: t.color ?? 'var(--teal)' }}
                  >
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{t.name}</span>
                      {!t.active && <Badge variant="gray">Inactive</Badge>}
                      <Badge variant="gray">{t.members.length} rep{t.members.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                    )}
                    {t.members.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {t.members.slice(0, 5).map(m => (
                          <PersonAvatar key={m.user_id} userId={m.user_id} name={m.user_name ?? '?'} size={22} />
                        ))}
                        {t.members.length > 5 && (
                          <span className="text-xs text-muted-foreground">+{t.members.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Switch
                      checked={t.active}
                      onCheckedChange={() => toggle(t)}
                      disabled={togglingId === t.id}
                      aria-label={`${t.active ? 'Deactivate' : 'Activate'} ${t.name}`}
                    />
                    <Tip label={`Delete ${t.name}`}>
                      <Button
                        type="button" variant="ghost" size="icon"
                        onClick={() => remove(t)}
                        aria-label={`Delete ${t.name}`}
                        className="text-muted-foreground hover:bg-(--red-l) hover:text-(--red)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open && !saving) setDialogOpen(false); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit territory' : 'New territory'}</DialogTitle>
            <DialogDescription>Define a named territory, its matching criteria, and the reps who cover it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {/* Name + color */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Territory name</label>
                <Input
                  autoFocus value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. East Africa, Fintech Segment"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Color</label>
                <input
                  type="color"
                  value={draft.color || '#6366f1'}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-card p-1"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Brief description of this territory…"
              />
            </div>

            {/* Match criteria */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Auto-tag criteria <span className="font-normal text-muted-foreground">(optional)</span></label>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                  onClick={() => setDraft(d => ({ ...d, criteria: [...d.criteria, { ...EMPTY_CRITERION }] }))}>
                  <Plus className="h-3.5 w-3.5" /> Add criterion
                </Button>
              </div>
              {draft.criteria.length === 0 ? (
                <p className="text-xs text-muted-foreground">No criteria — leads must be tagged manually.</p>
              ) : (
                <div className="space-y-2">
                  {draft.criteria.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select value={c.field} onValueChange={v => setCriterion(idx, { field: v as ConditionField })}>
                        <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FIELD_LABEL) as ConditionField[]).map(f => (
                            <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={c.op} onValueChange={v => setCriterion(idx, { op: v as ConditionOp })}>
                        <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(OP_LABEL) as ConditionOp[]).map(op => (
                            <SelectItem key={op} value={op}>{OP_LABEL[op]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="flex-1" value={c.value}
                        onChange={e => setCriterion(idx, { value: e.target.value })}
                        placeholder="Value…"
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        onClick={() => setDraft(d => ({ ...d, criteria: d.criteria.filter((_, i) => i !== idx) }))}
                        className="shrink-0 text-muted-foreground hover:bg-(--red-l) hover:text-(--red)"
                        aria-label="Remove criterion"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reps */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-foreground">Assigned reps</label>
              {draft.member_ids.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {draft.member_ids.map(uid => {
                    const u = users.find(x => x.id === uid);
                    return (
                      <div key={uid} className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2 text-xs">
                        <PersonAvatar userId={uid} name={u?.name ?? '?'} size={20} />
                        <span className="font-medium text-foreground">{u?.name ?? uid.slice(0, 8)}</span>
                        <button
                          type="button"
                          onClick={() => setDraft(d => ({ ...d, member_ids: d.member_ids.filter(x => x !== uid) }))}
                          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-(--red-l) hover:text-(--red)"
                          aria-label={`Remove ${u?.name}`}
                         data-ui-native-button="">
                          <UserMinus className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Select
                value="__add__"
                onValueChange={uid => {
                  if (uid !== '__add__' && !memberIdsSet.has(uid))
                    setDraft(d => ({ ...d, member_ids: [...d.member_ids, uid] }));
                }}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserPlus className="h-4 w-4" />
                    <SelectValue placeholder="Add a rep…" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__add__" disabled>Add a rep…</SelectItem>
                  {users.filter(u => !memberIdsSet.has(u.id)).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3.5">
              <Switch
                checked={draft.active}
                onCheckedChange={v => setDraft(d => ({ ...d, active: v }))}
                id="territory-active"
              />
              <label htmlFor="territory-active" className="cursor-pointer text-xs">
                <span className="font-semibold text-foreground">Territory is active</span>
                <span className="ml-1.5 text-muted-foreground">— inactive territories are hidden from rep views.</span>
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || !draft.name.trim()} className="gap-2">
              <MapPin className="h-4 w-4" />
              {saving ? 'Saving…' : (editId ? 'Save changes' : 'Create territory')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
