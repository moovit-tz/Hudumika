import React, { useEffect, useState } from 'react';
import { RotateCcw, Wand2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { invalidateCrmTerms } from '../hooks/useCrmTerms.js';

interface TermEntry { singular: string; plural: string; overridden: boolean }
type TermMap = Record<string, TermEntry>;

interface Preset {
  key: string;
  label: string;
  preview: Record<string, string>;
}

const TERM_LABELS: Record<string, string> = {
  lead:     'Lead (singular)',
  leads:    'Lead (plural)',
  deal:     'Deal (singular)',
  deals:    'Deal (plural)',
  customer: 'Customer (singular)',
  customers:'Customer (plural)',
  contact:  'Contact (singular)',
  contacts: 'Contact (plural)',
  pipeline: 'Pipeline',
};

const GROUPED: [string, string[]][] = [
  ['Leads',     ['lead', 'leads']],
  ['Deals',     ['deal', 'deals']],
  ['Customers', ['customer', 'customers']],
  ['Contacts',  ['contact', 'contacts']],
  ['Other',     ['pipeline']],
];

export function CrmTerminology() {
  const [terms, setTerms] = useState<TermMap | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [edits, setEdits] = useState<Record<string, { singular: string; plural: string }>>({});
  const [saving, setSaving] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState('');

  const load = async () => {
    try {
      const [t, p] = await Promise.all([
        apiFetch('/v1/crm/terminology'),
        apiFetch('/v1/crm/terminology/presets'),
      ]);
      setTerms(t);
      setPresets(Array.isArray(p) ? p : []);
      setEdits({});
    } catch {
      showAlert('Failed to load CRM terminology settings.');
    }
  };

  useEffect(() => { load(); }, []);

  function setField(key: string, field: 'singular' | 'plural', value: string) {
    setEdits(prev => ({
      ...prev,
      [key]: { ...{ singular: terms?.[key]?.singular ?? '', plural: terms?.[key]?.plural ?? '' }, ...prev[key], [field]: value },
    }));
  }

  function getValue(key: string, field: 'singular' | 'plural'): string {
    return edits[key]?.[field] ?? terms?.[key]?.[field] ?? '';
  }

  const isDirty = Object.keys(edits).length > 0;

  async function save() {
    if (!isDirty) return;
    setSaving(true);
    try {
      await apiFetch('/v1/crm/terminology', { method: 'PUT', body: JSON.stringify(edits) });
      invalidateCrmTerms();
      await load();
    } catch {
      showAlert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function applyPreset(preset: Preset) {
    const ok = await showConfirm(`Apply the "${preset.label}" preset? This will overwrite your current custom labels.`);
    if (!ok) return;
    setApplyingPreset(preset.key);
    try {
      await apiFetch('/v1/crm/terminology/preset', { method: 'POST', body: JSON.stringify({ preset: preset.key }) });
      invalidateCrmTerms();
      await load();
    } catch {
      showAlert('Failed to apply preset.');
    } finally {
      setApplyingPreset('');
    }
  }

  async function resetAll() {
    const ok = await showConfirm('Reset all CRM labels to platform defaults?');
    if (!ok) return;
    try {
      await apiFetch('/v1/crm/terminology', { method: 'DELETE' });
      invalidateCrmTerms();
      await load();
    } catch {
      showAlert('Failed to reset labels.');
    }
  }

  async function resetOne(key: string) {
    try {
      await apiFetch(`/v1/crm/terminology/${key}`, { method: 'DELETE' });
      invalidateCrmTerms();
      await load();
    } catch {
      showAlert('Failed to reset label.');
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Terminology']}
        titlePlain="CRM"
        titleEm="terminology"
        subtitle="Rename CRM entities to match your industry or internal vocabulary."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={resetAll}>
              <RotateCcw size={14} className="mr-1" /> Reset all
            </Button>
            <Button size="sm" onClick={save} disabled={!isDirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      />

      {!terms ? <SectionLoading /> : (
        <div className="flex flex-col gap-8 max-w-215">

          {/* Industry presets */}
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Quick-start presets
            </h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {presets.map(preset => (
                <button
                  key={preset.key}
                  type="button"
                  disabled={!!applyingPreset}
                  onClick={() => applyPreset(preset)}
                  className="rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-(--teal) hover:ring-2 hover:ring-(--teal-l) disabled:opacity-60"
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <Wand2 size={14} className="text-(--teal)" />
                    <span className="text-sm font-bold text-foreground">
                      {applyingPreset === preset.key ? 'Applying…' : preset.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(preset.preview).slice(0, 4).map(([k, v]) => (
                      <Badge key={k} variant="brand" className="text-xs">{v}</Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Per-term overrides */}
          {GROUPED.map(([groupLabel, keys]) => (
            <div key={groupLabel}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {groupLabel}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {keys.map((key, i) => {
                  const term = terms[key];
                  const singular = getValue(key, 'singular');
                  const plural   = getValue(key, 'plural');
                  const changed = edits[key] !== undefined;
                  return (
                    <div
                      key={key}
                      className={`grid items-center gap-3 px-4 py-3 ${i < keys.length - 1 ? 'border-b border-border' : ''} ${changed ? 'bg-(--teal-l)' : ''}`}
                      style={{ gridTemplateColumns: '180px 1fr 1fr auto' }}
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{TERM_LABELS[key]}</div>
                        {term?.overridden && !changed && (
                          <Badge variant="brand" className="mt-0.5 text-xs">Custom</Badge>
                        )}
                      </div>
                      <Input
                        value={singular}
                        onChange={e => setField(key, 'singular', e.target.value)}
                        placeholder="Singular…"
                      />
                      <Input
                        value={plural}
                        onChange={e => setField(key, 'plural', e.target.value)}
                        placeholder="Plural…"
                      />
                      <button
                        type="button"
                        onClick={() => { if (changed) { setEdits(p => { const n = { ...p }; delete n[key]; return n; }); } else if (term?.overridden) { resetOne(key); } }}
                        disabled={!changed && !term?.overridden}
                        title={changed ? 'Discard this edit' : 'Reset to default'}
                        className={`rounded p-1.5 transition-colors ${changed || term?.overridden ? 'cursor-pointer text-(--red) hover:bg-(--red-l)' : 'cursor-default opacity-30 text-muted-foreground'}`}
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {isDirty && (
            <div className="flex justify-end gap-2 pb-10">
              <Button variant="outline" onClick={() => setEdits({})}>Discard changes</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
