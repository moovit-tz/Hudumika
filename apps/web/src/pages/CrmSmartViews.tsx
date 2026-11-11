import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { MetricsRow } from '../components/MetricCard.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Input } from '../components/ui/input.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter
} from '../components/ui/dialog.js';

type EntityType = 'lead' | 'deal' | 'customer';
type FieldSpec = { kind: 'text' | 'uuid' | 'bool' | 'date' | 'num' | 'label'; col?: string; ops: string[] };
type Catalog = Record<EntityType, Record<string, FieldSpec>>;

interface Rule {
  field: string;
  op: string;
  value?: string | number | boolean | null;
}

interface SmartView {
  id: string;
  entity_type: EntityType;
  name: string;
  match_type: 'all' | 'any';
  rules: Rule[];
  count: number;
}

const OP_LABEL: Record<string, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  is_set: 'is set',
  is_empty: 'is empty',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  is_true: 'is true',
  is_false: 'is false',
  has: 'has label',
  not_has: "doesn't have label",
  within_days: 'in last … days',
  before_days: 'more than … days ago',
};

const NO_VALUE_OPS = new Set(['is_set', 'is_empty', 'is_true', 'is_false']);

function fmtRule(r: Rule, resolveLabel: (id?: string | number | boolean | null) => string): string {
  const opl = OP_LABEL[r.op] ?? r.op;
  if (NO_VALUE_OPS.has(r.op)) return `${r.field} ${opl}`;
  if (r.op === 'within_days' || r.op === 'before_days') return `${r.field} ${opl.replace('…', String(r.value ?? '?'))}`;
  if (r.field === 'label') return `${r.field} ${opl} "${resolveLabel(r.value)}"`;
  return `${r.field} ${opl} ${r.value ?? ''}`;
}

function RuleEditor({
  entity,
  catalog,
  rules,
  onChange,
  labels
}: {
  entity: EntityType;
  catalog: Catalog;
  rules: Rule[];
  onChange: (r: Rule[]) => void;
  labels: { id: string; name: string }[];
}) {
  const fields = Object.keys(catalog[entity] || {});

  function patch(i: number, p: Partial<Rule>) {
    onChange(rules.map((r, j) => j === i ? { ...r, ...p } : r));
  }

  function changeField(i: number, field: string) {
    const ops = catalog[entity][field]?.ops || [];
    patch(i, { field, op: ops[0] || 'eq', value: NO_VALUE_OPS.has(ops[0]) ? null : '' });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rules.map((r, i) => {
        const spec = catalog[entity][r.field];
        return (
          <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-border/70 bg-card p-2 sm:p-2.5 shadow-xs">
            <span className="hidden sm:inline-flex items-center justify-center size-6 rounded-full bg-muted/60 text-[11px] font-semibold text-muted-foreground shrink-0">
              {i + 1}
            </span>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select value={r.field} onValueChange={v => changeField(i, v)}>
                <SelectTrigger className="w-full text-xs font-medium">
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f} value={f} className="text-xs">
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={r.op}
                onValueChange={v => patch(i, { op: v, value: NO_VALUE_OPS.has(v) ? null : (r.value ?? '') })}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  {(spec?.ops || []).map(o => (
                    <SelectItem key={o} value={o} className="text-xs">
                      {OP_LABEL[o] ?? o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!NO_VALUE_OPS.has(r.op) && spec?.kind === 'label' ? (
                <Select value={String(r.value ?? '')} onValueChange={v => patch(i, { value: v })}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={labels.length ? 'Select label…' : 'No labels'} />
                  </SelectTrigger>
                  <SelectContent>
                    {labels.map(l => (
                      <SelectItem key={l.id} value={l.id} className="text-xs">
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : !NO_VALUE_OPS.has(r.op) ? (
                <Input
                  className="w-full text-xs h-9"
                  type={spec?.kind === 'num' || r.op === 'within_days' || r.op === 'before_days' ? 'number' : 'text'}
                  value={String(r.value ?? '')}
                  onChange={e => patch(i, { value: e.target.value })}
                  placeholder="Enter criteria…"
                />
              ) : (
                <div className="hidden sm:flex items-center text-xs text-muted-foreground italic px-2">
                  (No value needed)
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              iconOnly
              onClick={() => onChange(rules.filter((_, j) => j !== i))}
              disabled={rules.length === 1}
              aria-label="Remove rule"
              className="text-muted-foreground hover:text-destructive shrink-0 self-end sm:self-auto"
            >
              <Icon name="x" size={14} />
            </Button>
          </div>
        );
      })}

      <div className="pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rules, { field: Object.keys(catalog[entity])[0], op: 'eq', value: '' }])}
          className="gap-1.5 text-xs"
        >
          <Icon name="plus" size={13} /> Add condition
        </Button>
      </div>
    </div>
  );
}

export function CrmSmartViews() {
  const navigate = useNavigate();
  const [entity, setEntity] = useState<EntityType>('lead');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [views, setViews] = useState<SmartView[] | null>(null);
  const [selected, setSelected] = useState<SmartView | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; match_type: 'all' | 'any'; rules: Rule[] } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/crm/smart-views/catalog')
      .then(data => { setCatalog(data); setLoadErrors(e => e.filter(x => x !== 'filter catalog')); })
      .catch(() => setLoadErrors(e => e.includes('filter catalog') ? e : [...e, 'filter catalog']));
  }, []);

  useEffect(() => {
    apiFetch('/v1/crm/labels')
      .then(data => { setLabels(data); setLoadErrors(e => e.filter(x => x !== 'labels')); })
      .catch(() => { setLabels([]); setLoadErrors(e => e.includes('labels') ? e : [...e, 'labels']); });
  }, []);

  const labelName = useCallback((id?: string | number | boolean | null) => {
    return labels.find(l => l.id === id)?.name ?? String(id ?? '');
  }, [labels]);

  const load = useCallback(() => {
    apiFetch(`/v1/crm/smart-views?entity_type=${entity}`)
      .then(data => {
        setViews(data);
        setLoadErrors(e => e.filter(x => x !== 'saved views'));
      })
      .catch(() => {
        setViews([]);
        setLoadErrors(e => e.includes('saved views') ? e : [...e, 'saved views']);
      });
  }, [entity]);

  useEffect(() => {
    setSelected(null);
    setResults(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setResults(null);
      return;
    }
    apiFetch(`/v1/crm/smart-views/${selected.id}/results`)
      .then(data => {
        setResults(data);
        setLoadErrors(e => e.filter(x => x !== 'view results'));
      })
      .catch(() => {
        setResults([]);
        setLoadErrors(e => e.includes('view results') ? e : [...e, 'view results']);
      });
  }, [selected]);

  async function save() {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        await apiFetch(`/v1/crm/smart-views/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: editing.name.trim(), match_type: editing.match_type, rules: editing.rules })
        });
        showAlert('Saved view updated successfully', { variant: 'success' });
      } else {
        await apiFetch('/v1/crm/smart-views', {
          method: 'POST',
          body: JSON.stringify({ entity_type: entity, name: editing.name.trim(), match_type: editing.match_type, rules: editing.rules })
        });
        showAlert('Saved view created successfully', { variant: 'success' });
      }
      setIsDialogOpen(false);
      setEditing(null);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save view', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(v: SmartView) {
    if (!(await showConfirm(`Delete the "${v.name}" view? The ${v.entity_type}s matched by this filter will remain unchanged.`, { confirmLabel: 'Delete view' }))) return;
    try {
      await apiFetch(`/v1/crm/smart-views/${v.id}`, { method: 'DELETE' });
      if (selected?.id === v.id) setSelected(null);
      showAlert(`Deleted "${v.name}"`, { variant: 'info' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete view', { variant: 'error' });
    }
  }

  function openCreate() {
    if (!catalog) return;
    const defaultField = Object.keys(catalog[entity])[0] || 'stage';
    setEditing({
      name: '',
      match_type: 'all',
      rules: [{ field: defaultField, op: 'eq', value: '' }]
    });
    setIsDialogOpen(true);
  }

  function openEdit(v: SmartView, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditing({
      id: v.id,
      name: v.name,
      match_type: v.match_type,
      rules: v.rules
    });
    setIsDialogOpen(true);
  }

  const ENTITIES: EntityType[] = ['lead', 'deal', 'customer'];

  const filteredViews = useMemo(() => {
    if (!views) return null;
    if (!searchFilter.trim()) return views;
    const q = searchFilter.toLowerCase();
    return views.filter(v => v.name.toLowerCase().includes(q) || v.rules.some(r => r.field.toLowerCase().includes(q)));
  }, [views, searchFilter]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Saved Views']}
        titlePlain="Saved"
        titleEm="views"
        subtitle="Dynamic filters saved once and auto-evaluated in real time across CRM pipelines."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              iconOnly
              aria-label="Refresh saved views"
              onClick={load}
            >
              <Icon name="refresh" size={14} />
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={openCreate}
              className="gap-1.5"
            >
              <Icon name="plus" size={14} />
              <span>New view</span>
            </Button>
          </div>
        }
      />

      {loadErrors.length > 0 && (
        <Banner variant="error" title="Some saved view services are temporarily unavailable">
          Failed to load {loadErrors.join(', ')}. Try refreshing this page.
        </Banner>
      )}

      {/* Metrics Category Switcher */}
      <MetricsRow
        cards={ENTITIES.map(e => ({
          title: `${e.toUpperCase()}S`,
          value: e === entity && views !== null ? String(views.length) : '—',
          loading: e === entity && views === null,
          emphasis: e === entity ? 'primary' as const : 'default' as const,
          onClick: () => { setEntity(e); setSelected(null); },
          icon: e === 'lead' ? 'target' : e === 'deal' ? 'trendingUp' : 'users',
          sub1Label: 'Active Views',
          sub1Value: e === entity && views ? `${views.reduce((acc, v) => acc + (v.count || 0), 0)} matches` : 'Select',
        }))}
      />

      {/* Main Master-Detail Work Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
        {/* Left Column: Views List with Search & Actions */}
        <Card className="flex flex-col overflow-hidden shadow-xs">
          <CardHeader className="p-3.5 border-b border-border/80 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Icon name="filter" size={13} className="text-primary" />
                <span>{entity} views</span>
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {filteredViews?.length ?? 0} total
              </span>
            </div>
            <div className="mt-2.5 relative">
              <Input
                placeholder={`Search ${entity} views…`}
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="h-8 text-xs pl-8 pr-3 bg-background"
              />
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Icon name="search" size={13} />
              </div>
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-2 divide-y divide-border/40 max-h-[calc(100vh-320px)] min-h-[300px] overflow-y-auto">
            {filteredViews === null ? (
              <div className="py-12"><SectionLoading /></div>
            ) : filteredViews.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="mx-auto size-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                  <Icon name="filter" size={18} />
                </div>
                <p className="text-xs font-semibold text-foreground">No views found</p>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-[200px] mx-auto">
                  {searchFilter ? 'No saved views match your search criteria.' : `Create custom filtered views for ${entity}s to surface high-priority records instantly.`}
                </p>
                {!searchFilter && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openCreate}
                    className="mt-3 text-xs gap-1"
                  >
                    <Icon name="plus" size={12} /> Create view
                  </Button>
                )}
              </div>
            ) : (
              filteredViews.map(v => {
                const isSelected = selected?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelected(v)}
                    className={`group relative rounded-lg p-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--teal-l)] border border-[var(--teal)] shadow-xs'
                        : 'hover:bg-muted/30 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm font-semibold tracking-tight ${isSelected ? 'text-[var(--teal)]' : 'text-foreground'}`}>
                        {v.name}
                      </span>
                      <Badge variant={isSelected ? 'brand' : 'gray'} className="text-[10px] tabular-nums font-semibold shrink-0">
                        {v.count}
                      </Badge>
                    </div>

                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                      {v.rules.map(r => fmtRule(r, labelName)).join(v.match_type === 'any' ? ' · OR · ' : ' · AND · ')}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-border/30">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        Match {v.match_type.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          iconOnly
                          aria-label={`Edit ${v.name}`}
                          onClick={(e) => openEdit(v, e)}
                          className="size-7 hover:text-primary"
                        >
                          <Icon name="edit" size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          iconOnly
                          aria-label={`Delete ${v.name}`}
                          onClick={(e) => { e.stopPropagation(); remove(v); }}
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <Icon name="trash2" size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right Column: Matched Records Live Preview */}
        <div className="min-w-0">
          {!selected ? (
            <Card className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center border-dashed">
              <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                <Icon name="layers" size={20} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Select a saved view</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Choose a view from the list on the left to preview live results, or create a new automated segment.
              </p>
            </Card>
          ) : (
            <Card className="shadow-xs overflow-hidden">
              <CardHeader className="p-4 border-b border-border bg-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-bold text-foreground">
                        {selected.name}
                      </CardTitle>
                      <Badge variant="brand" className="text-xs font-semibold tabular-nums">
                        {results ? `${results.length} record${results.length === 1 ? '' : 's'}` : '…'}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs mt-1">
                      Matching <span className="font-semibold">{selected.match_type}</span> of {selected.rules.length} condition{selected.rules.length === 1 ? '' : 's'}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(selected)}
                      className="text-xs gap-1.5"
                    >
                      <Icon name="edit" size={13} />
                      <span>Edit view</span>
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => navigate(entity === 'lead' ? '/crm/leads' : entity === 'deal' ? '/crm/pipeline' : '/crm/customers')}
                      className="text-xs gap-1.5"
                    >
                      <span>Open {entity}s</span>
                      <Icon name="arrowRight" size={13} />
                    </Button>
                  </div>
                </div>

                {/* Conditions pills summary */}
                <div className="mt-3 flex flex-wrap gap-1.5 pt-2.5 border-t border-border/50">
                  {selected.rules.map((r, i) => (
                    <Badge key={i} variant="secondary" className="text-[11px] font-medium py-0.5 px-2">
                      {fmtRule(r, labelName)}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {results === null ? (
                  <div className="py-20"><SectionLoading label="Evaluating view rules…" /></div>
                ) : results.length === 0 ? (
                  <div className="py-16 text-center px-4">
                    <div className="mx-auto size-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-2">
                      <Icon name="search" size={16} />
                    </div>
                    <p className="text-xs font-semibold text-foreground">No matches found</p>
                    <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto">
                      Currently no {entity}s meet all criteria for this view. New records matching this filter will appear automatically.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[calc(100vh-360px)] overflow-y-auto">
                    {results.slice(0, 200).map((row: any) => {
                      const displayName = row.company || row.name || 'Unnamed Record';
                      const subtitle = row.email || row.phone || row.contact_person || (entity === 'deal' ? (row.value ? `TZS ${Number(row.value).toLocaleString()}` : '') : '');
                      const statusBadge = row.stage || row.account_status || row.status || '';

                      return (
                        <div
                          key={row.id}
                          onClick={() => navigate(
                            entity === 'lead'
                              ? `/crm/leads?lead=${row.id}`
                              : entity === 'deal'
                              ? `/crm/pipeline?deal=${row.id}`
                              : `/crm/customers?id=${row.id}`
                          )}
                          className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {displayName}
                              </span>
                              {row.priority && (
                                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5">
                                  {row.priority}
                                </Badge>
                              )}
                            </div>
                            {subtitle && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {subtitle}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {statusBadge && (
                              <Badge variant="gray" className="text-[11px] font-medium capitalize">
                                {statusBadge}
                              </Badge>
                            )}
                            <Icon name="chevronRight" size={14} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      );
                    })}
                    {results.length > 200 && (
                      <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20">
                        Showing first 200 of {results.length} matched records.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create / Edit View Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editing?.id ? 'Edit saved view' : `New ${entity} saved view`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure filtering conditions to group and monitor records matching specific criteria.
            </DialogDescription>
          </DialogHeader>

          {editing && catalog && (
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  View title
                </label>
                <Input
                  placeholder="e.g. High-value Dar es Salaam deals"
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  className="text-xs"
                  autoFocus
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 pb-1 text-xs text-muted-foreground">
                <span>Filter match logic:</span>
                <Select
                  value={editing.match_type}
                  onValueChange={v => setEditing({ ...editing, match_type: v as 'all' | 'any' })}
                >
                  <SelectTrigger className="h-8 w-28 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Match ALL (AND)</SelectItem>
                    <SelectItem value="any" className="text-xs">Match ANY (OR)</SelectItem>
                  </SelectContent>
                </Select>
                <span>rules below:</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Evaluation rules
                </label>
                <RuleEditor
                  entity={entity}
                  catalog={catalog}
                  rules={editing.rules}
                  onChange={r => setEditing({ ...editing, rules: r })}
                  labels={labels}
                />
              </div>
            </DialogBody>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setIsDialogOpen(false); setEditing(null); }}
              disabled={saving}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!editing?.name.trim() || saving}
              onClick={save}
              className="text-xs"
            >
              {saving ? 'Saving…' : editing?.id ? 'Save changes' : 'Create view'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
