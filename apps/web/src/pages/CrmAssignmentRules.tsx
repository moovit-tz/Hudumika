import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Route, Search, Trash2, UserCheck, UserPlus } from 'lucide-react';
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
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

type ConditionField = 'source' | 'industry' | 'location' | 'priority' | 'company';
type ConditionOp    = 'eq' | 'contains' | 'starts_with';

interface Condition { field: ConditionField; op: ConditionOp; value: string }

interface AssignmentRule {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  subject_type: 'lead' | 'deal';
  match_type: 'all' | 'any';
  conditions: Condition[];
  assign_to: string | null;
  assignee_name: string | null;
}

interface UserOption { id: string; name: string }

const FIELD_LABEL: Record<ConditionField, string> = {
  source: 'Lead source', industry: 'Industry', location: 'Location',
  priority: 'Priority', company: 'Company name',
};
const OP_LABEL: Record<ConditionOp, string> = {
  eq: 'equals', contains: 'contains', starts_with: 'starts with',
};

const EMPTY_CONDITION: Condition = { field: 'source', op: 'eq', value: '' };

interface Draft {
  name: string; active: boolean; priority: number;
  subject_type: 'lead' | 'deal'; match_type: 'all' | 'any';
  conditions: Condition[]; assign_to: string;
}

function emptyDraft(): Draft {
  return {
    name: '', active: true, priority: 10,
    subject_type: 'lead', match_type: 'all',
    conditions: [{ ...EMPTY_CONDITION }],
    assign_to: '',
  };
}

export function CrmAssignmentRules() {
  const [rules, setRules]     = useState<AssignmentRule[] | null>(null);
  const [users, setUsers]     = useState<UserOption[]>([]);
  const [draft, setDraft]     = useState<Draft>(emptyDraft);
  const [editId, setEditId]   = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRules(null);
    apiFetch('/v1/crm/assignment-rules').then(setRules).catch(() => setRules([]));
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

  const filtered = useMemo(() => {
    if (!rules) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.assignee_name ?? '').toLowerCase().includes(q)
    );
  }, [rules, search]);

  function openCreate() {
    setEditId(null);
    setDraft(emptyDraft());
    setDialogOpen(true);
  }

  function openEdit(rule: AssignmentRule) {
    setEditId(rule.id);
    setDraft({
      name: rule.name, active: rule.active, priority: rule.priority,
      subject_type: rule.subject_type, match_type: rule.match_type,
      conditions: rule.conditions.length ? rule.conditions.map(c => ({ ...c })) : [{ ...EMPTY_CONDITION }],
      assign_to: rule.assign_to ?? '',
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    if (!saving) setDialogOpen(false);
  }

  function setCondition(idx: number, patch: Partial<Condition>) {
    setDraft(d => {
      const conditions = d.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
      return { ...d, conditions };
    });
  }

  function addCondition() {
    setDraft(d => ({ ...d, conditions: [...d.conditions, { ...EMPTY_CONDITION }] }));
  }

  function removeCondition(idx: number) {
    setDraft(d => ({ ...d, conditions: d.conditions.filter((_, i) => i !== idx) }));
  }

  async function save() {
    if (!draft.name.trim()) return;
    if (draft.conditions.some(c => !c.value.trim())) {
      showAlert('All conditions must have a value.'); return;
    }
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        active: draft.active,
        priority: Number(draft.priority) || 10,
        subject_type: draft.subject_type,
        match_type: draft.match_type,
        conditions: draft.conditions,
        assign_to: draft.assign_to || null,
      };
      if (editId) {
        await apiFetch(`/v1/crm/assignment-rules/${editId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/v1/crm/assignment-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: AssignmentRule) {
    setTogglingId(rule.id);
    try {
      await apiFetch(`/v1/crm/assignment-rules/${rule.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !rule.active }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update rule');
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(rule: AssignmentRule) {
    const ok = await showConfirm(`Delete the assignment rule "${rule.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/crm/assignment-rules/${rule.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete rule');
    }
  }

  const canSave = draft.name.trim().length > 0 && draft.conditions.length > 0;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Assignment Rules']}
        titlePlain="Assignment"
        titleEm="rules"
        subtitle="Automatically route incoming leads to the right rep based on source, industry, priority, and more."
        actions={(
          <Button size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        )}
      />

      <Card>
        <CardHeader className="gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Rules</CardTitle>
              {rules && <Badge variant="gray">{rules.length}</Badge>}
            </div>
            <CardDescription className="mt-1">
              Rules are evaluated in priority order (lower number = higher priority). The first matching rule wins.
            </CardDescription>
          </div>
          <div className="relative w-full lg:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rules…" className="pl-9" />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {rules === null ? (
            <div className="flex min-h-48 items-center justify-center"><SectionLoading /></div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                {search ? <Search className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
              </FeaturedIcon>
              <h2 className="mt-4 text-sm font-bold text-foreground">
                {search ? 'No matching rules' : 'No assignment rules yet'}
              </h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {search ? 'Clear the search or try a different name.' : 'Create the first rule to start auto-routing incoming leads.'}
              </p>
              {!search && (
                <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Create first rule
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(rule => (
                <div
                  key={rule.id}
                  className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/20 ${rule.active ? '' : 'opacity-60'}`}
                  onClick={() => openEdit(rule)}
                >
                  <FeaturedIcon variant={rule.active ? 'brand' : 'gray'} size="sm" shape="square">
                    <Route className="h-4 w-4" />
                  </FeaturedIcon>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{rule.name}</span>
                      <Badge variant="gray">Priority {rule.priority}</Badge>
                      {!rule.active && <Badge variant="gray">Inactive</Badge>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {rule.conditions.slice(0, 3).map((c, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="font-semibold uppercase text-muted-foreground">{rule.match_type}</span>}
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                            {FIELD_LABEL[c.field] ?? c.field} {OP_LABEL[c.op] ?? c.op} "{c.value}"
                          </span>
                        </React.Fragment>
                      ))}
                      {rule.conditions.length > 3 && (
                        <span className="text-muted-foreground">+{rule.conditions.length - 3} more</span>
                      )}
                      {rule.assign_to && (
                        <>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                          <span>assign to</span>
                          <PersonAvatar userId={rule.assign_to} name={rule.assignee_name ?? '?'} size={16} />
                          <span className="font-semibold text-foreground">{rule.assignee_name ?? 'Unknown rep'}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Switch
                      checked={rule.active}
                      onCheckedChange={() => toggle(rule)}
                      disabled={togglingId === rule.id}
                      aria-label={`${rule.active ? 'Disable' : 'Enable'} ${rule.name}`}
                    />
                    <Tip label={`Delete ${rule.name}`}>
                      <Button
                        type="button" variant="ghost" size="icon"
                        onClick={() => remove(rule)}
                        aria-label={`Delete ${rule.name}`}
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
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit assignment rule' : 'New assignment rule'}</DialogTitle>
            <DialogDescription>Define conditions and the rep to auto-assign to when a new lead matches.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {/* Name + priority */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Rule name</label>
                <Input
                  autoFocus
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Route inbound fintech leads"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Priority</label>
                <Input
                  type="number" min={0} max={999} className="w-24"
                  value={draft.priority}
                  onChange={e => setDraft(d => ({ ...d, priority: Number(e.target.value) }))}
                />
              </div>
            </div>

            {/* Match type */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Condition logic</label>
              <div className="flex gap-2">
                {(['all', 'any'] as const).map(mt => (
                  <button
                    key={mt} type="button"
                    onClick={() => setDraft(d => ({ ...d, match_type: mt }))}
                    className={`min-h-8 rounded-lg border px-4 text-xs font-semibold transition-colors ${
                      draft.match_type === mt
                        ? 'border-(--teal) bg-(--teal-l) text-(--teal)'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                   data-ui-native-button="">
                    Match {mt === 'all' ? 'ALL conditions' : 'ANY condition'}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditions */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-foreground">Conditions</label>
              <div className="space-y-2">
                {draft.conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={cond.field}
                      onValueChange={v => setCondition(idx, { field: v as ConditionField })}
                    >
                      <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_LABEL) as ConditionField[]).map(f => (
                          <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={cond.op}
                      onValueChange={v => setCondition(idx, { op: v as ConditionOp })}
                    >
                      <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(OP_LABEL) as ConditionOp[]).map(op => (
                          <SelectItem key={op} value={op}>{OP_LABEL[op]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={cond.value}
                      onChange={e => setCondition(idx, { value: e.target.value })}
                      placeholder="Value…"
                    />
                    {draft.conditions.length > 1 && (
                      <Button
                        type="button" variant="ghost" size="icon"
                        onClick={() => removeCondition(idx)}
                        aria-label="Remove condition"
                        className="shrink-0 text-muted-foreground hover:bg-(--red-l) hover:text-(--red)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button" variant="outline" size="sm" className="mt-2 gap-2"
                onClick={addCondition}
              >
                <Plus className="h-3.5 w-3.5" /> Add condition
              </Button>
            </div>

            {/* Assign to */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Assign to</label>
              <Select
                value={draft.assign_to || '__none__'}
                onValueChange={v => setDraft(d => ({ ...d, assign_to: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a rep…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No assignment —</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The lead will be assigned to this rep when the rule matches.
              </p>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3.5">
              <Switch
                checked={draft.active}
                onCheckedChange={v => setDraft(d => ({ ...d, active: v }))}
                id="rule-active"
              />
              <label htmlFor="rule-active" className="cursor-pointer text-xs">
                <span className="font-semibold text-foreground">Rule is active</span>
                <span className="ml-1.5 text-muted-foreground">— inactive rules are saved but never evaluated.</span>
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || !canSave} className="gap-2">
              <UserCheck className="h-4 w-4" />
              {saving ? 'Saving…' : (editId ? 'Save changes' : 'Create rule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
