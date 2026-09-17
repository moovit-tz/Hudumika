import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Braces, CalendarDays, CheckSquare, Hash, ListFilter, Plus,
  Search, SlidersHorizontal, TextCursorInput, Trash2, Users,
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
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

type EntityType = 'lead' | 'deal' | 'customer';
type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

interface FieldDef {
  id: string;
  entity_type: EntityType;
  field_key: string;
  label: string;
  type: FieldType;
  options: string[];
}

const TYPE_META: Record<FieldType, { label: string; description: string; icon: LucideIcon; variant: 'gray' | 'info' | 'warning' | 'brand' | 'success' }> = {
  text: { label: 'Text', description: 'Short names, notes, or reference values', icon: TextCursorInput, variant: 'gray' },
  number: { label: 'Number', description: 'Quantities, scores, or numeric values', icon: Hash, variant: 'info' },
  date: { label: 'Date', description: 'Deadlines, anniversaries, or key dates', icon: CalendarDays, variant: 'warning' },
  select: { label: 'Dropdown', description: 'Choose one value from a defined list', icon: ListFilter, variant: 'brand' },
  checkbox: { label: 'Yes / No', description: 'A simple true or false choice', icon: CheckSquare, variant: 'success' },
};

const ENTITY_META: Record<EntityType, { label: string; description: string }> = {
  lead: { label: 'Leads', description: 'Capture qualification details before conversion.' },
  deal: { label: 'Deals', description: 'Track information specific to sales opportunities.' },
  customer: { label: 'Customers', description: 'Store attributes unique to customer accounts.' },
};

const ENTITIES: EntityType[] = ['lead', 'deal', 'customer'];

export function CrmCustomFields() {
  const [entity, setEntity] = useState<EntityType>('lead');
  const [defs, setDefs] = useState<FieldDef[] | null>(null);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setDefs(null);
    apiFetch(`/v1/crm/custom-fields/defs?entity_type=${entity}`)
      .then((data: FieldDef[]) => setDefs(data))
      .catch(() => setDefs([]));
  }, [entity]);

  useEffect(() => { load(); }, [load]);

  const filteredDefs = useMemo(() => {
    if (!defs) return [];
    const query = search.trim().toLowerCase();
    if (!query) return defs;
    return defs.filter((field) =>
      field.label.toLowerCase().includes(query)
      || field.field_key.toLowerCase().includes(query)
      || TYPE_META[field.type].label.toLowerCase().includes(query),
    );
  }, [defs, search]);

  function resetForm() {
    setLabel('');
    setOptions('');
    setType('text');
  }

  async function add() {
    if (!label.trim()) return;
    const selectOptions = options.split(',').map((option) => option.trim()).filter(Boolean);
    if (type === 'select' && selectOptions.length < 2) {
      showAlert('Add at least two comma-separated options for a dropdown field.');
      return;
    }

    setAdding(true);
    try {
      await apiFetch('/v1/crm/custom-fields/defs', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: entity,
          label: label.trim(),
          type,
          options: type === 'select' ? selectOptions : undefined,
        }),
      });
      resetForm();
      setDialogOpen(false);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add field');
    } finally {
      setAdding(false);
    }
  }

  async function remove(field: FieldDef) {
    const confirmed = await showConfirm(
      `Delete the "${field.label}" field? Its values on every ${field.entity_type} are removed too.`,
      { confirmLabel: 'Delete Field' },
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/v1/crm/custom-fields/defs/${field.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete field');
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Custom Fields']}
        titlePlain="Custom"
        titleEm="fields"
        subtitle="Shape the information your team captures across leads, deals, and customer records."
        actions={(
          <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New Field
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="tablist" aria-label="Record type">
        {ENTITIES.map((item) => {
          const active = entity === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { setEntity(item); setSearch(''); }}
              className={`flex min-h-20 items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                active
                  ? 'border-[var(--teal)] bg-[var(--teal-l)] ring-1 ring-[var(--teal)]/20'
                  : 'border-border bg-card hover:border-[var(--teal)]/50 hover:bg-muted/20'
              }`}
            >
              <FeaturedIcon variant={active ? 'brand' : 'gray'} size="sm" shape="square">
                <Users className="h-4 w-4" />
              </FeaturedIcon>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">{ENTITY_META[item].label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{ENTITY_META[item].description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{ENTITY_META[entity].label} field registry</CardTitle>
              {defs && <Badge variant="gray">{defs.length}</Badge>}
            </div>
            <CardDescription className="mt-1">Fields appear on every {entity} record in this workspace.</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search fields"
              aria-label="Search custom fields"
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {defs === null ? (
            <div className="flex min-h-48 items-center justify-center"><SectionLoading /></div>
          ) : filteredDefs.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                {search ? <Search className="h-6 w-6" /> : <SlidersHorizontal className="h-6 w-6" />}
              </FeaturedIcon>
              <h2 className="mt-4 text-sm font-bold text-foreground">
                {search ? 'No matching fields' : `No custom fields for ${ENTITY_META[entity].label.toLowerCase()}`}
              </h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {search
                  ? 'Try another name, key, or field type.'
                  : `Add a field to capture information that is unique to how your team manages ${entity}s.`}
              </p>
              {!search && (
                <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Add first field
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredDefs.map((field) => {
                const meta = TYPE_META[field.type];
                const TypeIcon = meta.icon;
                return (
                  <div key={field.id} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/20">
                    <FeaturedIcon variant={meta.variant} size="sm" shape="square">
                      <TypeIcon className="h-4 w-4" />
                    </FeaturedIcon>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{field.label}</span>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{field.field_key}</code>
                        {field.type === 'select' && field.options.length > 0 && (
                          <span className="truncate">{field.options.join(' · ')}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(field)}
                      title={`Delete ${field.label}`}
                      aria-label={`Delete ${field.label}`}
                      className="shrink-0 text-muted-foreground hover:bg-[var(--red-l)] hover:text-[var(--red)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4">
        <FeaturedIcon variant="gray" size="sm" shape="circle"><Braces className="h-4 w-4" /></FeaturedIcon>
        <div>
          <div className="text-xs font-bold text-foreground">Field keys stay stable</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Keys are generated when a field is created and can be used by imports, exports, and connected workflows.
          </p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open && !adding) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add custom field</DialogTitle>
            <DialogDescription>
              Add a field to every {entity} record. The generated field key cannot be changed later.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div>
              <label htmlFor="custom-field-label" className="mb-1.5 block text-xs font-semibold text-foreground">Field label</label>
              <Input
                id="custom-field-label"
                autoFocus
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && type !== 'select') void add(); }}
                placeholder="e.g. Referral source"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">Use a short, recognizable label your team will understand.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Field type</label>
              <Select value={type} onValueChange={(value) => setType(value as FieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_META) as FieldType[]).map((fieldType) => (
                    <SelectItem key={fieldType} value={fieldType}>{TYPE_META[fieldType].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{TYPE_META[type].description}</p>
            </div>

            {type === 'select' && (
              <div>
                <label htmlFor="custom-field-options" className="mb-1.5 block text-xs font-semibold text-foreground">Dropdown options</label>
                <Input
                  id="custom-field-options"
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void add(); }}
                  placeholder="Inbound, Referral, Partner"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">Separate each option with a comma. Add at least two options.</p>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-lg border border-[var(--teal)]/25 bg-[var(--teal-l)] p-3.5">
              <FeaturedIcon variant="brand" size="sm" shape="square">
                <Users className="h-4 w-4" />
              </FeaturedIcon>
              <div>
                <div className="text-xs font-bold text-foreground">Applies to {ENTITY_META[entity].label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">This field will be available on all current and future {entity} records.</div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={adding}>Cancel</Button>
            <Button size="sm" onClick={add} disabled={adding || !label.trim()} className="gap-2">
              <Plus className="h-4 w-4" />
              {adding ? 'Adding…' : 'Add Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
