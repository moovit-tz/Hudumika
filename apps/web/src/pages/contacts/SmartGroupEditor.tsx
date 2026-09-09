import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { useContacts, type SmartGroup, type SmartGroupRule } from '../../shells/contacts-context.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Combobox } from '../../components/ui/combobox.js';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../../components/ui/select.js';
import { SMART_FIELDS, fieldSpec, opSpec } from './smartGroupFields.js';

interface Props {
  /** undefined => creating a new group */
  group?: SmartGroup | null;
  onDone: (savedId: string | null) => void;
}

type StaffOption = { value: string; label: string };

function defaultRule(): SmartGroupRule {
  return { field: 'company', op: 'eq', value: '' };
}

export function SmartGroupEditor({ group, onDone }: Props) {
  const { labels, saveSmartGroup, handleDeleteSmartGroup } = useContacts();

  const [name, setName] = useState(group?.name ?? '');
  const [matchType, setMatchType] = useState<'all' | 'any'>(group?.match_type ?? 'all');
  const [rules, setRules] = useState<SmartGroupRule[]>(
    group?.rules?.length ? group.rules.map(r => ({ ...r })) : [defaultRule()],
  );
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  // Staff list for the "Sales owner is …" value picker. One fetch; the
  // Combobox filters it client-side. Same /v1/hr/staff endpoint the contact
  // form's owner picker uses.
  useEffect(() => {
    let alive = true;
    apiFetch('/v1/hr/staff?search=')
      .then((rows: any[]) => { if (alive) setStaff((rows || []).map(u => ({ value: u.id, label: u.name }))); })
      .catch(() => { /* leave empty — the rule just can't be finished until it loads */ });
    return () => { alive = false; };
  }, []);

  const labelOptions = useMemo(
    () => labels.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [labels],
  );

  function patchRule(i: number, patch: Partial<SmartGroupRule>) {
    setRules(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function changeField(i: number, field: string) {
    const spec = fieldSpec(field);
    const nextOp = spec?.ops[0]?.op ?? 'eq';
    patchRule(i, { field, op: nextOp, value: opSpec(field, nextOp)?.value === 'none' ? null : '' });
  }

  function changeOp(i: number, op: string) {
    const kind = opSpec(rules[i].field, op)?.value ?? 'text';
    patchRule(i, { op, value: kind === 'none' ? null : (kind === 'days' ? (rules[i].value ?? 30) : (rules[i].value ?? '')) });
  }

  const canSave =
    name.trim().length > 0 &&
    rules.length > 0 &&
    rules.every(r => {
      const kind = opSpec(r.field, r.op)?.value;
      if (!kind || kind === 'none') return !!opSpec(r.field, r.op);
      if (kind === 'days') return Number.isFinite(Number(r.value)) && Number(r.value) >= 0;
      return String(r.value ?? '').trim().length > 0;
    });

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      match_type: matchType,
      rules: rules.map(r => {
        const kind = opSpec(r.field, r.op)?.value;
        if (kind === 'none') return { field: r.field, op: r.op };
        if (kind === 'days') return { field: r.field, op: r.op, value: Math.round(Number(r.value)) };
        return { field: r.field, op: r.op, value: String(r.value ?? '').trim() };
      }),
    };
    const saved = await saveSmartGroup(payload, group?.id);
    setSaving(false);
    if (saved) onDone(saved.id ?? group?.id ?? null);
  }

  return (
    <div className="cts-sg-editor">
      <PageHeader
        crumbs={['Contacts', 'Smart groups', group ? 'Edit' : 'New']}
        titlePlain={group ? 'Edit smart' : 'New smart'}
        titleEm="group"
        subtitle="A smart group has no fixed member list — it always shows whichever contacts match its rules right now."
      />

      <div className="cts-sg-form">
      <label className="cts-sg-field">
        <span>Name</span>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Nairobi clients"
          autoFocus
        />
      </label>

      <div className="cts-sg-match">
        <span>Match</span>
        <Select value={matchType} onValueChange={v => setMatchType(v as 'all' | 'any')}>
          <SelectTrigger className="w-[92px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="any">any</SelectItem>
          </SelectContent>
        </Select>
        <span>of the following rules</span>
      </div>

      <div className="cts-sg-rules">
        {rules.map((rule, i) => {
          const spec = fieldSpec(rule.field);
          const kind = opSpec(rule.field, rule.op)?.value ?? 'text';
          return (
            <div className="cts-sg-rule" key={i}>
              <Select value={rule.field} onValueChange={v => changeField(i, v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SMART_FIELDS.map(f => (
                    <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={rule.op} onValueChange={v => changeOp(i, v)}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(spec?.ops ?? []).map(o => (
                    <SelectItem key={o.op} value={o.op}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {kind === 'text' && (
                <Input
                  className="flex-1 min-w-[140px]"
                  value={String(rule.value ?? '')}
                  onChange={e => patchRule(i, { value: e.target.value })}
                  placeholder="value"
                />
              )}
              {kind === 'days' && (
                <Input
                  type="number"
                  min={0}
                  className="w-[110px]"
                  value={String(rule.value ?? '')}
                  onChange={e => patchRule(i, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="days"
                />
              )}
              {kind === 'label' && (
                <Select value={String(rule.value ?? '')} onValueChange={v => patchRule(i, { value: v })}>
                  <SelectTrigger className="flex-1 min-w-[160px]"><SelectValue placeholder="Pick a label" /></SelectTrigger>
                  <SelectContent>
                    {labelOptions.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {kind === 'user' && (
                <Combobox
                  className="flex-1 min-w-[180px]"
                  options={staff}
                  value={String(rule.value ?? '')}
                  onChange={v => patchRule(i, { value: v })}
                  placeholder={staff.length ? 'Pick a person' : 'Loading people…'}
                  searchPlaceholder="Search people…"
                />
              )}

              <button
                type="button"
                className="cts-sg-rule-del"
                onClick={() => setRules(prev => prev.filter((_, j) => j !== i))}
                disabled={rules.length === 1}
                title={rules.length === 1 ? 'A group needs at least one rule' : 'Remove rule'}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="cts-sg-add-rule"
          onClick={() => setRules(prev => [...prev, defaultRule()])}
        >
          <Icon name="plus" size={14} /> Add rule
        </button>
      </div>

      <div className="cts-sg-editor-actions">
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Saving…' : group ? 'Save changes' : 'Create smart group'}
        </Button>
        <Button variant="secondary" onClick={() => onDone(group?.id ?? null)} disabled={saving}>
          Cancel
        </Button>
        {group && (
          <Button
            variant="ghost"
            className="text-[var(--red)] ml-auto"
            disabled={saving}
            onClick={async () => { await handleDeleteSmartGroup(group.id); onDone(null); }}
          >
            <Icon name="trash" size={14} /> Delete group
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}
