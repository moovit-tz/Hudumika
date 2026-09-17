import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Gauge, Plus, Search,
  SlidersHorizontal, Sparkles, Target, Trash2, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

type FieldSpec = { kind: 'text' | 'num' | 'date'; ops: string[] };
interface Rule { id: string; label: string; field: string; op: string; value: string | null; points: number; active: boolean }
type RuleFilter = 'all' | 'active' | 'inactive';

const OP_LABEL: Record<string, string> = {
  eq: 'is', neq: 'is not', contains: 'contains', gt: 'is greater than',
  gte: 'is at least', lt: 'is less than', lte: 'is at most',
};

const FIELD_LABEL: Record<string, string> = {
  stage: 'Lead stage', source: 'Lead source', priority: 'Priority', industry: 'Industry',
  value: 'Potential value', activity_count: 'Activity count', age_days: 'Lead age (days)',
};

const EMPTY_DRAFT = { label: '', field: 'stage', op: 'eq', value: '', points: 10 };

export function CrmLeadScoring() {
  const [fields, setFields] = useState<Record<string, FieldSpec>>({});
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RuleFilter>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/crm/lead-scoring/fields').then(setFields).catch(() => setFields({}));
  }, []);

  const load = useCallback(() => {
    setRules(null);
    apiFetch('/v1/crm/lead-scoring/rules').then(setRules).catch(() => setRules([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const fieldNames = Object.keys(fields);
  const draftOps = fields[draft.field]?.ops ?? [];

  const metrics = useMemo(() => {
    const all = rules ?? [];
    const active = all.filter((rule) => rule.active);
    return {
      total: all.length,
      active: active.length,
      positive: active.filter((rule) => rule.points > 0).length,
      negative: active.filter((rule) => rule.points < 0).length,
    };
  }, [rules]);

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    const query = search.trim().toLowerCase();
    return rules.filter((rule) => {
      if (filter === 'active' && !rule.active) return false;
      if (filter === 'inactive' && rule.active) return false;
      if (!query) return true;
      return rule.label.toLowerCase().includes(query)
        || (FIELD_LABEL[rule.field] ?? rule.field).toLowerCase().includes(query)
        || String(rule.value ?? '').toLowerCase().includes(query);
    });
  }, [filter, rules, search]);

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
  }

  async function add() {
    if (!draft.label.trim() || !draft.value.trim()) return;
    setAdding(true);
    try {
      await apiFetch('/v1/crm/lead-scoring/rules', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          label: draft.label.trim(),
          value: draft.value.trim() || null,
          points: Number(draft.points) || 0,
        }),
      });
      resetDraft();
      setDialogOpen(false);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add rule');
    } finally {
      setAdding(false);
    }
  }

  async function toggle(rule: Rule) {
    setTogglingId(rule.id);
    try {
      await apiFetch(`/v1/crm/lead-scoring/rules/${rule.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !rule.active }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update rule');
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(rule: Rule) {
    const confirmed = await showConfirm(`Delete the "${rule.label}" scoring rule?`, { confirmLabel: 'Delete Rule' });
    if (!confirmed) return;
    try {
      await apiFetch(`/v1/crm/lead-scoring/rules/${rule.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete rule');
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Lead Scoring']}
        titlePlain="Lead"
        titleEm="scoring"
        subtitle="Prioritize promising leads with transparent rules your sales team can understand."
        actions={(
          <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)} disabled={fieldNames.length === 0}>
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={SlidersHorizontal} label="Total rules" value={rules ? metrics.total : '—'} variant="brand" />
        <Metric icon={Zap} label="Active rules" value={rules ? metrics.active : '—'} variant="info" />
        <Metric icon={ArrowUp} label="Positive signals" value={rules ? metrics.positive : '—'} variant="success" />
        <Metric icon={ArrowDown} label="Negative signals" value={rules ? metrics.negative : '—'} variant="error" />
      </div>

      <Card>
        <CardHeader className="gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Scoring rules</CardTitle>
              {rules && <Badge variant="gray">{rules.length}</Badge>}
            </div>
            <CardDescription className="mt-1">Active matching rules are added together and the final score is capped between 0 and 100.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="flex rounded-lg border border-border bg-muted/30 p-1" role="tablist" aria-label="Rule status">
              {(['all', 'active', 'inactive'] as RuleFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={filter === item}
                  onClick={() => setFilter(item)}
                  className={`min-h-7 flex-1 rounded-md px-3 text-xs font-semibold capitalize transition-colors sm:flex-none ${
                    filter === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rules" aria-label="Search scoring rules" className="pl-9" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {rules === null ? (
            <div className="flex min-h-48 items-center justify-center"><SectionLoading /></div>
          ) : filteredRules.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                {search || filter !== 'all' ? <Search className="h-6 w-6" /> : <Target className="h-6 w-6" />}
              </FeaturedIcon>
              <h2 className="mt-4 text-sm font-bold text-foreground">
                {search || filter !== 'all' ? 'No matching rules' : 'No scoring rules yet'}
              </h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {search || filter !== 'all'
                  ? 'Adjust the search or status filter to find another rule.'
                  : 'Add the first rule to start ranking leads by fit, value, and engagement.'}
              </p>
              {!search && filter === 'all' && (
                <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Add first rule
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredRules.map((rule) => {
                const positive = rule.points >= 0;
                return (
                  <div key={rule.id} className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/20 ${rule.active ? '' : 'opacity-60'}`}>
                    <FeaturedIcon variant={positive ? 'success' : 'error'} size="sm" shape="square">
                      {positive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    </FeaturedIcon>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{rule.label}</span>
                        {!rule.active && <Badge variant="gray">Inactive</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{FIELD_LABEL[rule.field] ?? rule.field}</span>
                        <span className="font-semibold text-foreground">{OP_LABEL[rule.op] ?? rule.op}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{rule.value || '—'}</code>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={positive ? 'success' : 'error'} className="font-bold">
                        {positive && rule.points > 0 ? '+' : ''}{rule.points} pts
                      </Badge>
                      <Switch
                        checked={rule.active}
                        onCheckedChange={() => toggle(rule)}
                        disabled={togglingId === rule.id}
                        aria-label={`${rule.active ? 'Disable' : 'Enable'} ${rule.label}`}
                      />
                      <Button
                        type="button" variant="ghost" size="icon" onClick={() => remove(rule)}
                        title={`Delete ${rule.label}`} aria-label={`Delete ${rule.label}`}
                        className="text-muted-foreground hover:bg-[var(--red-l)] hover:text-[var(--red)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4">
        <FeaturedIcon variant="brand" size="sm" shape="circle"><Gauge className="h-4 w-4" /></FeaturedIcon>
        <div>
          <div className="text-xs font-bold text-foreground">Scores update automatically</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Each lead is evaluated against active rules when the lead list loads. Positive and negative signals combine into a score from 0 to 100.
          </p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open && !adding) resetDraft(); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Create scoring rule</DialogTitle>
            <DialogDescription>Define a condition and the score adjustment applied whenever a lead matches it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div>
              <label htmlFor="rule-name" className="mb-1.5 block text-xs font-semibold text-foreground">Rule name</label>
              <Input id="rule-name" autoFocus value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="e.g. High-value opportunity" />
              <p className="mt-1.5 text-[11px] text-muted-foreground">Choose a name that explains why the score changes.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">When a lead matches</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr]">
                <Select value={draft.field} onValueChange={(value) => setDraft({ ...draft, field: value, op: fields[value]?.ops[0] ?? 'eq', value: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{fieldNames.map((field) => <SelectItem key={field} value={field}>{FIELD_LABEL[field] ?? field}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={draft.op} onValueChange={(value) => setDraft({ ...draft, op: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{draftOps.map((op) => <SelectItem key={op} value={op}>{OP_LABEL[op] ?? op}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input
                className="mt-2"
                type={fields[draft.field]?.kind === 'num' ? 'number' : 'text'}
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                placeholder={fields[draft.field]?.kind === 'num' ? 'Enter a number' : 'Enter a matching value'}
              />
            </div>

            <div>
              <label htmlFor="rule-points" className="mb-1.5 block text-xs font-semibold text-foreground">Score adjustment</label>
              <div className="flex items-center gap-3">
                <div className="relative w-32">
                  <Input id="rule-points" type="number" min={-100} max={100} value={draft.points} onChange={(event) => setDraft({ ...draft, points: Number(event.target.value) })} className="pr-12" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">pts</span>
                </div>
                <Badge variant={draft.points >= 0 ? 'success' : 'error'}>
                  {draft.points >= 0 ? 'Positive signal' : 'Negative signal'}
                </Badge>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Use a negative number for signals that should lower lead priority.</p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-[var(--teal)]/25 bg-[var(--teal-l)] p-3.5">
              <FeaturedIcon variant="brand" size="sm" shape="square"><Sparkles className="h-4 w-4" /></FeaturedIcon>
              <div className="min-w-0 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Preview: </span>
                {FIELD_LABEL[draft.field] ?? draft.field} {OP_LABEL[draft.op] ?? draft.op} {draft.value || '…'}
                <ArrowRight className="mx-1.5 inline h-3.5 w-3.5" />
                <span className={draft.points >= 0 ? 'font-bold text-[var(--green)]' : 'font-bold text-[var(--red)]'}>
                  {draft.points > 0 ? '+' : ''}{draft.points} points
                </span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={adding}>Cancel</Button>
            <Button size="sm" onClick={add} disabled={adding || !draft.label.trim() || !draft.value.trim()} className="gap-2">
              <Plus className="h-4 w-4" /> {adding ? 'Creating…' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value, variant }: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  variant: 'brand' | 'info' | 'success' | 'error';
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <FeaturedIcon variant={variant} size="md" shape="square"><Icon className="h-5 w-5" /></FeaturedIcon>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-foreground">{value}</div>
        <div className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
