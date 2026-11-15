import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Label } from '../../components/ui/label.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { FIELDS, SOURCE_LABEL, fieldOf, opOf, type PulseSource } from './pulseFields.js';
import { SegmentFromText } from './PulseHudu.js';
import { apiError, fmtNum, type Member, type Rule, type SegmentStats } from './pulseShared.js';

type Option = { value: string; label: string };

function blankRule(source: PulseSource): Rule {
  const f = FIELDS[source][0];
  return { field: f.field, op: f.ops[0].op, value: f.ops[0].value === 'none' ? null : '' };
}

/** Values a rule picker can offer, loaded once from the apps that own them. */
function useOptions() {
  const [opts, setOpts] = useState<{ users: Option[]; labels: Option[]; stages: Option[]; territories: Option[]; campaigns: Option[] }>({ users: [], labels: [], stages: [], territories: [], campaigns: [] });
  useEffect(() => {
    let alive = true;
    const load = (path: string, map: (rows: any[]) => Option[], key: keyof typeof opts) =>
      apiFetch(path).then((r: any) => { if (alive) setOpts((o) => ({ ...o, [key]: map(Array.isArray(r) ? r : r?.data ?? []) })); }).catch(() => {});
    load('/v1/hr/staff?search=', (rows) => rows.map((u) => ({ value: u.id, label: u.name })), 'users');
    load('/v1/contacts/labels', (rows) => rows.map((l) => ({ value: l.id, label: l.name })), 'labels');
    load('/v1/crm/lead-stages', (rows) => rows.map((s) => ({ value: s.label, label: s.label })), 'stages');
    load('/v1/crm/territories', (rows) => rows.map((t) => ({ value: t.id, label: t.name })), 'territories');
    load('/v1/pulse/campaigns', (rows) => rows.filter((c) => c.status !== 'draft').map((c) => ({ value: c.id, label: c.name })), 'campaigns');
    return () => { alive = false; };
  }, []);
  return opts;
}

function RuleRow({ source, rule, index, onChange, onRemove, canRemove, options }: {
  source: PulseSource; rule: Rule; index: number; onChange: (r: Rule) => void; onRemove: () => void; canRemove: boolean;
  options: ReturnType<typeof useOptions>;
}) {
  const field = fieldOf(source, rule.field);
  const op = opOf(source, rule.field, rule.op);
  const groups = useMemo(() => {
    const m = new Map<string, typeof FIELDS[PulseSource]>();
    FIELDS[source].forEach((f) => m.set(f.group, [...(m.get(f.group) ?? []), f]));
    return [...m.entries()];
  }, [source]);
  const n = index + 1;
  const pick = (list: Option[], label: string, empty: string) => (
    <Combobox
      options={list} value={(rule.value as string) || ''} onChange={(v) => onChange({ ...rule, value: v })}
      placeholder={list.length ? label : empty} aria-label={`Rule ${n} value`}
    />
  );

  let valueInput: React.ReactNode = null;
  switch (op?.value) {
    case 'text': valueInput = <Input aria-label={`Rule ${n} value`} value={(rule.value as string) ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder="Value" />; break;
    case 'days': valueInput = <Input aria-label={`Rule ${n} number of days`} type="number" min={0} max={3650} value={(rule.value as string) ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder="Days" />; break;
    case 'number': valueInput = <Input aria-label={`Rule ${n} amount`} type="number" value={(rule.value as string) ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder="Amount" />; break;
    case 'user': valueInput = pick(options.users, 'Choose a person', 'Loading people…'); break;
    case 'label': valueInput = pick(options.labels, 'Choose a label', 'No contact labels yet'); break;
    case 'stage': valueInput = pick(options.stages, 'Choose a stage', 'No lead stages yet'); break;
    case 'territory': valueInput = pick(options.territories, 'Choose a territory', 'No territories yet'); break;
    case 'campaign': valueInput = pick(options.campaigns, 'Choose a campaign', 'No sent campaigns yet'); break;
    case 'tier': valueInput = pick([{ value: '1', label: 'Tier 1' }, { value: '2', label: 'Tier 2' }, { value: '3', label: 'Tier 3' }], 'Choose a tier', ''); break;
  }

  return (
    <div className="pulse-rule-row">
      <Select value={rule.field} onValueChange={(f) => {
        const spec = fieldOf(source, f)!;
        onChange({ field: f, op: spec.ops[0].op, value: spec.ops[0].value === 'none' ? null : '' });
      }}>
        <SelectTrigger aria-label={`Rule ${n} field`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {groups.map(([g, fs]) => fs.map((f) => <SelectItem key={f.field} value={f.field}>{g === 'Engagement' ? `${f.label} (Pulse)` : f.label}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={rule.op} onValueChange={(o) => {
        const next = opOf(source, rule.field, o);
        onChange({ ...rule, op: o, value: next?.value === 'none' ? null : next?.value === op?.value ? rule.value : '' });
      }}>
        <SelectTrigger aria-label={`Rule ${n} condition`}><SelectValue /></SelectTrigger>
        <SelectContent>{field?.ops.map((o) => <SelectItem key={o.op} value={o.op}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <div className="pulse-rule-value">{valueInput}</div>
      <Button variant="ghost" size="icon" aria-label={`Remove rule ${n}`} disabled={!canRemove} onClick={onRemove}>
        <Icon name="trash" size={15} />
      </Button>
    </div>
  );
}

export function PulseSegmentEditor() {
  const { id } = useParams();
  const isNew = !id;
  usePageSEO(isNew ? 'New audience' : 'Edit audience', 'Build a Pulse audience from contacts, CRM leads or customers.');
  const navigate = useNavigate();
  const options = useOptions();

  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<PulseSource>('contacts');
  const [matchType, setMatchType] = useState<'all' | 'any'>('all');
  const [rules, setRules] = useState<Rule[]>([blankRule('contacts')]);
  const [preview, setPreview] = useState<{ stats: SegmentStats; sample: Member[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isNew) return;
    apiFetch(`/v1/pulse/segments/${id}`).then((r: any) => {
      const s = r.data;
      setName(s.name); setDescription(s.description ?? ''); setSource(s.source); setMatchType(s.match_type);
      setRules(Array.isArray(s.rules) && s.rules.length ? s.rules : [blankRule(s.source)]);
    }).catch((e) => showAlert(apiError(e), { variant: 'error' })).finally(() => setLoading(false));
  }, [id, isNew]);

  // Re-count a moment after the last change, so typing doesn't fire a query per key.
  useEffect(() => {
    if (loading) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPreviewing(true);
      apiFetch('/v1/pulse/segments/preview', { method: 'POST', body: JSON.stringify({ source, match_type: matchType, rules }) })
        .then((r: any) => { setPreview(r.data); setPreviewError(null); })
        .catch((e) => { setPreview(null); setPreviewError(apiError(e)); })
        .finally(() => setPreviewing(false));
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [source, matchType, rules, loading]);

  async function save() {
    if (!name.trim()) { showAlert('Give the audience a name.', { variant: 'warning' }); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim(), description: description.trim() || null, source, match_type: matchType, rules });
      const r: any = await apiFetch(isNew ? '/v1/pulse/segments' : `/v1/pulse/segments/${id}`, { method: isNew ? 'POST' : 'PATCH', body });
      navigate(`/pulse/audiences/${r.data.id}`);
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
    finally { setSaving(false); }
  }

  if (loading) return <SectionLoading />;

  return (
    <div className="pulse-page">
      <PageHeader
        variant="create" backTo={isNew ? '/pulse/audiences' : `/pulse/audiences/${id}`} backLabel="Audiences"
        crumbs={['Pulse', { label: 'Audiences', to: '/pulse/audiences' }, isNew ? 'New' : 'Edit']}
        title={isNew ? 'New audience' : 'Edit audience'}
        actions={<Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save audience'}</Button>}
      />
      <div className="pulse-split">
        <div className="pulse-stack">
          <SectionCard title="Details" collapsible={false}>
            <div className="pulse-form">
              <div className="pulse-field">
                <Label htmlFor="seg-name">Name</Label>
                <Input id="seg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dar es Salaam importers" maxLength={120} />
              </div>
              <div className="pulse-field">
                <Label htmlFor="seg-desc">Description (optional)</Label>
                <Textarea id="seg-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
              </div>
              <div className="pulse-field">
                <Label htmlFor="seg-source">People from</Label>
                <Select value={source} onValueChange={(v) => { const s = v as PulseSource; setSource(s); setRules([blankRule(s)]); }}>
                  <SelectTrigger id="seg-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABEL) as PulseSource[]).map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Who is in it" collapsible={false}>
            <SegmentFromText source={source} onRules={(r) => { setMatchType(r.match_type); setRules(r.rules); }} />
            <div className="pulse-match">
              <span>Include people who match</span>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as 'all' | 'any')}>
                <SelectTrigger aria-label="Match all or any rule" className="pulse-match-select"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">all rules</SelectItem><SelectItem value="any">any rule</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="pulse-rules">
              {rules.map((r, i) => (
                <RuleRow key={i} index={i} source={source} rule={r} options={options} canRemove={rules.length > 1}
                  onChange={(next) => setRules((rs) => rs.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setRules((rs) => rs.filter((_, j) => j !== i))} />
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={rules.length >= 25} onClick={() => setRules((rs) => [...rs, blankRule(source)])}>
              <Icon name="plus" size={14} /> Add rule
            </Button>
          </SectionCard>
        </div>

        <SectionCard title="Preview" collapsible={false}>
          <div aria-live="polite">
            {previewError ? <p className="pulse-note pulse-note-warn">{previewError}</p> : !preview ? <SectionLoading label="Counting…" /> : (
              <>
                <div className="pulse-preview-count">
                  <strong>{fmtNum(preview.stats.total)}</strong> {preview.stats.total === 1 ? 'person' : 'people'}
                  {previewing && <span className="pulse-muted"> · updating…</span>}
                </div>
                <dl className="pulse-reach">
                  <div><dt>Reachable by email</dt><dd>{fmtNum(Math.max(preview.stats.with_email - preview.stats.email_suppressed, 0))}</dd></div>
                  <div><dt>Opted out of email</dt><dd>{fmtNum(preview.stats.email_suppressed)}</dd></div>
                  <div><dt>Have a phone number</dt><dd>{fmtNum(preview.stats.with_phone)}</dd></div>
                </dl>
                {preview.sample.length > 0 && (
                  <ul className="pulse-people">
                    {preview.sample.map((m) => (
                      <li key={m.id}>
                        {m.kind === 'company'
                          ? <CompanyAvatar id={m.id} kind="customers" name={m.name} logoUrl={m.avatar_url} size={28} />
                          : <PersonAvatar userId={m.id} kind={source === 'leads' ? 'leads' : 'contacts'} name={m.name} src={m.avatar_url} size={28} />}
                        <div><div className="pulse-person-name">{m.name}</div><div className="pulse-muted">{m.email || m.phone || 'No email or phone'}</div></div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
