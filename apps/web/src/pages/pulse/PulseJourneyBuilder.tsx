import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Switch } from '../../components/ui/switch.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { SOURCE_LABEL, type PulseSource } from './pulseFields.js';
import { apiError, fmtNum, fmtWhen, pct, type Segment } from './pulseShared.js';
import { JOURNEY_STATUS, type JourneyStatus } from './PulseJourneys.js';

type Step = { id: string; type: string; label?: string; [k: string]: any };
interface Journey {
  id: string; name: string; description: string | null; status: JourneyStatus; source: PulseSource;
  trigger: any; steps: Step[]; goal: { event_type: string } | null; reentry: 'never' | 'after_exit';
  quiet_hours: { start: string; end: string } | null; published_at: string | null; problems: string[];
  counts: Record<string, number>;
  step_stats: { id: string; done: number; skipped: number; failed: number; waiting: number; message: { campaign_id: string; sent: number; opened: number; clicked: number } | null }[];
}
interface Person { id: string; source: string; source_id: string; name: string | null; email: string | null; phone: string | null; status: string; step_index: number; next_run_at: string; exit_reason: string | null; entered_at: string }

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

const STEP_TYPES: { type: string; label: string; icon: any; leadsOnly?: boolean }[] = [
  { type: 'email', label: 'Send an email', icon: 'mail' },
  { type: 'sms', label: 'Send an SMS', icon: 'messageSquare' },
  { type: 'wait', label: 'Wait', icon: 'clock' },
  { type: 'branch', label: 'If / else', icon: 'gitBranch' },
  { type: 'task', label: 'Create a CRM task', icon: 'clipboard', leadsOnly: true },
  { type: 'update_lead', label: 'Move lead to a stage', icon: 'flag', leadsOnly: true },
  { type: 'notify', label: 'Notify a colleague', icon: 'bell' },
  { type: 'studio', label: 'Start a Studio workflow', icon: 'zap' },
  { type: 'exit', label: 'Leave the journey', icon: 'logOut' },
];
const typeInfo = (t: string) => STEP_TYPES.find((s) => s.type === t) ?? STEP_TYPES[0];

function newStep(type: string): Step {
  const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case 'email': return { id, type, subject: '', body_html: '<p>Hi {{first_name}},</p>\n<p></p>' };
    case 'sms': return { id, type, body_text: '' };
    case 'wait': return { id, type, days: 1, hours: 0 };
    case 'branch': return { id, type, condition: { kind: 'opened', step_id: '' }, yes: 'next', no: 'next' };
    case 'task': return { id, type, title: '', due_days: 1, assign: 'owner' };
    case 'update_lead': return { id, type, stage: '' };
    case 'notify': return { id, type, user_ids: [], message: '' };
    default: return { id, type };
  }
}

function summary(s: Step, steps: Step[]): string {
  const name = (id: string) => { const i = steps.findIndex((x) => x.id === id); return i >= 0 ? `step ${i + 1}` : '…'; };
  const target = (t: string) => (t === 'next' ? 'continue' : t === 'exit' ? 'leave' : `go to ${name(t)}`);
  switch (s.type) {
    case 'email': return s.subject ? `“${s.subject}”` : 'No subject yet';
    case 'sms': return s.body_text ? `“${s.body_text.slice(0, 80)}${s.body_text.length > 80 ? '…' : ''}”` : 'No message yet';
    case 'wait': return `${s.days ? `${s.days} ${s.days === 1 ? 'day' : 'days'}` : ''}${s.days && s.hours ? ' ' : ''}${s.hours ? `${s.hours} h` : ''}` || 'No time set';
    case 'branch': {
      const c = s.condition ?? {};
      const what = c.kind === 'in_segment' ? 'in an audience' : `${c.kind} ${name(c.step_id)}`;
      return `If ${what}: ${target(s.yes)}, otherwise ${target(s.no)}`;
    }
    case 'task': return s.title || 'No title yet';
    case 'update_lead': return s.stage ? `Stage → ${s.stage}` : 'No stage chosen';
    case 'notify': return `${(s.user_ids ?? []).length} ${(s.user_ids ?? []).length === 1 ? 'person' : 'people'}`;
    case 'studio': return 'Fires “Person reached a journey step” for Studio workflows';
    case 'exit': return 'The person leaves here';
    default: return '';
  }
}

function useLookups() {
  const [d, setD] = useState<{ users: { value: string; label: string }[]; stages: { value: string; label: string }[]; segments: Segment[]; events: { type: string; label: string; sources: PulseSource[] }[] }>({ users: [], stages: [], segments: [], events: [] });
  useEffect(() => {
    apiFetch('/v1/hr/staff?search=').then((r: any[]) => setD((x) => ({ ...x, users: (r || []).map((u) => ({ value: u.id, label: u.name })) }))).catch(() => {});
    apiFetch('/v1/crm/lead-stages').then((r: any[]) => setD((x) => ({ ...x, stages: (r || []).map((s) => ({ value: s.label, label: s.label })) }))).catch(() => {});
    apiFetch('/v1/pulse/segments').then((r: any) => setD((x) => ({ ...x, segments: r.data }))).catch(() => {});
    apiFetch('/v1/pulse/journeys/meta').then((r: any) => setD((x) => ({ ...x, events: r.data.events }))).catch(() => {});
  }, []);
  return d;
}

function StepEditor({ step, index, steps, source, lookups, onChange }: { step: Step; index: number; steps: Step[]; source: PulseSource; lookups: ReturnType<typeof useLookups>; onChange: (s: Step) => void }) {
  const fid = (k: string) => `st-${step.id}-${k}`;
  const set = (patch: Partial<Step>) => onChange({ ...step, ...patch });
  const later = steps.slice(index + 1);
  const earlierMessages = steps.slice(0, index).filter((s) => s.type === 'email' || s.type === 'sms');
  const targets = (
    <>
      <SelectItem value="next">Continue to the next step</SelectItem>
      {later.map((s) => <SelectItem key={s.id} value={s.id}>Go to step {steps.indexOf(s) + 1}: {s.label || typeInfo(s.type).label}</SelectItem>)}
      <SelectItem value="exit">Leave the journey</SelectItem>
    </>
  );
  return (
    <div className="pulse-form">
      <div className="pulse-field">
        <Label htmlFor={fid('label')}>Step name (optional)</Label>
        <Input id={fid('label')} value={step.label ?? ''} onChange={(e) => set({ label: e.target.value })} maxLength={120} />
      </div>
      {step.type === 'email' && <>
        <div className="pulse-field"><Label htmlFor={fid('subject')}>Subject</Label><Input id={fid('subject')} value={step.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} maxLength={200} /></div>
        <div className="pulse-field"><Label htmlFor={fid('pre')}>Preview text (optional)</Label><Input id={fid('pre')} value={step.preheader ?? ''} onChange={(e) => set({ preheader: e.target.value })} maxLength={200} /></div>
        <div className="pulse-field"><Label htmlFor={fid('html')}>Email (HTML)</Label><Textarea id={fid('html')} className="pulse-code" rows={8} spellCheck={false} value={step.body_html ?? ''} onChange={(e) => set({ body_html: e.target.value })} /></div>
      </>}
      {step.type === 'sms' && (
        <div className="pulse-field"><Label htmlFor={fid('sms')}>Text message</Label><Textarea id={fid('sms')} rows={4} value={step.body_text ?? ''} onChange={(e) => set({ body_text: e.target.value })} maxLength={1600} />
          <span className="pulse-muted">{(step.body_text ?? '').length} characters</span></div>
      )}
      {step.type === 'wait' && (
        <div className="pulse-ab-grid">
          <div className="pulse-field"><Label htmlFor={fid('days')}>Days</Label><Input id={fid('days')} type="number" min={0} max={365} value={step.days ?? 0} onChange={(e) => set({ days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} /></div>
          <div className="pulse-field"><Label htmlFor={fid('hours')}>Hours</Label><Input id={fid('hours')} type="number" min={0} max={23} value={step.hours ?? 0} onChange={(e) => set({ hours: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} /></div>
        </div>
      )}
      {step.type === 'branch' && <>
        <div className="pulse-field">
          <Label htmlFor={fid('kind')}>Check whether the person</Label>
          <Select value={step.condition?.kind ?? 'opened'} onValueChange={(k) => set({ condition: k === 'in_segment' ? { kind: k, segment_id: '' } : { kind: k, step_id: '' } })}>
            <SelectTrigger id={fid('kind')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="opened">opened an email</SelectItem><SelectItem value="clicked">clicked a message</SelectItem><SelectItem value="in_segment">is in an audience</SelectItem></SelectContent>
          </Select>
        </div>
        {step.condition?.kind === 'in_segment' ? (
          <div className="pulse-field">
            <Label htmlFor={fid('seg')}>Audience</Label>
            <Select value={step.condition.segment_id || ''} onValueChange={(v) => set({ condition: { kind: 'in_segment', segment_id: v } })}>
              <SelectTrigger id={fid('seg')}><SelectValue placeholder="Choose an audience" /></SelectTrigger>
              <SelectContent>{lookups.segments.filter((s) => s.source === source).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div className="pulse-field">
            <Label htmlFor={fid('msg')}>Message</Label>
            <Select value={step.condition?.step_id || ''} onValueChange={(v) => set({ condition: { ...step.condition, step_id: v } })}>
              <SelectTrigger id={fid('msg')}><SelectValue placeholder={earlierMessages.length ? 'Choose an earlier message' : 'Add a message before this step'} /></SelectTrigger>
              <SelectContent>{earlierMessages.filter((s) => step.condition?.kind !== 'opened' || s.type === 'email').map((s) => <SelectItem key={s.id} value={s.id}>Step {steps.indexOf(s) + 1}: {s.label || summary(s, steps)}</SelectItem>)}</SelectContent>
            </Select>
            <span className="pulse-muted">Put a wait before this step so people have time to open or click.</span>
          </div>
        )}
        <div className="pulse-ab-grid">
          <div className="pulse-field"><Label htmlFor={fid('yes')}>If yes</Label>
            <Select value={step.yes} onValueChange={(v) => set({ yes: v })}><SelectTrigger id={fid('yes')}><SelectValue /></SelectTrigger><SelectContent>{targets}</SelectContent></Select></div>
          <div className="pulse-field"><Label htmlFor={fid('no')}>If no</Label>
            <Select value={step.no} onValueChange={(v) => set({ no: v })}><SelectTrigger id={fid('no')}><SelectValue /></SelectTrigger><SelectContent>{targets}</SelectContent></Select></div>
        </div>
      </>}
      {step.type === 'task' && <>
        <div className="pulse-field"><Label htmlFor={fid('title')}>Task</Label><Input id={fid('title')} value={step.title ?? ''} onChange={(e) => set({ title: e.target.value })} maxLength={200} /></div>
        <div className="pulse-ab-grid">
          <div className="pulse-field"><Label htmlFor={fid('due')}>Due in (days)</Label><Input id={fid('due')} type="number" min={0} max={365} value={step.due_days ?? 1} onChange={(e) => set({ due_days: Math.max(0, Number(e.target.value) || 0) })} /></div>
          <div className="pulse-field"><Label htmlFor={fid('assign')}>Assign to</Label>
            <Select value={step.assign ?? 'owner'} onValueChange={(v) => set({ assign: v })}><SelectTrigger id={fid('assign')}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="owner">The lead’s owner</SelectItem><SelectItem value="user">A specific person</SelectItem></SelectContent></Select></div>
        </div>
        {step.assign === 'user' && <div className="pulse-field"><Label>Person</Label><Combobox aria-label="Person who gets the task" options={lookups.users} value={step.user_id ?? ''} onChange={(v) => set({ user_id: v })} placeholder="Choose a person" /></div>}
      </>}
      {step.type === 'update_lead' && (
        <div className="pulse-field"><Label>New stage</Label><Combobox aria-label="New lead stage" options={lookups.stages} value={step.stage ?? ''} onChange={(v) => set({ stage: v })} placeholder={lookups.stages.length ? 'Choose a stage' : 'No lead stages yet'} /></div>
      )}
      {step.type === 'notify' && <>
        <div className="pulse-field">
          <Label>Who to notify</Label>
          <Combobox aria-label="Add a person to notify" options={lookups.users.filter((u) => !(step.user_ids ?? []).includes(u.value))} value="" onChange={(v) => v && set({ user_ids: [...(step.user_ids ?? []), v] })} placeholder="Add a person" />
          <div className="pulse-chips">
            {(step.user_ids ?? []).map((uid: string) => {
              const u = lookups.users.find((x) => x.value === uid);
              return (
                <span key={uid} className="pulse-chip">
                  <PersonAvatar userId={uid} name={u?.label ?? 'Colleague'} size={20} />{u?.label ?? 'Colleague'}
                  <Button variant="ghost" size="icon" className="pulse-chip-x" aria-label={`Remove ${u?.label ?? 'person'}`} onClick={() => set({ user_ids: step.user_ids.filter((x: string) => x !== uid) })}><Icon name="x" size={12} /></Button>
                </span>
              );
            })}
          </div>
        </div>
        <div className="pulse-field"><Label htmlFor={fid('nmsg')}>Message</Label><Textarea id={fid('nmsg')} rows={2} value={step.message ?? ''} onChange={(e) => set({ message: e.target.value })} maxLength={500} /></div>
      </>}
      {step.type === 'studio' && <p className="pulse-note">In Studio, build a workflow that starts on <strong>Person reached a journey step</strong>. It receives the person's name, email, phone and this step.</p>}
    </div>
  );
}

export function PulseJourneyBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPublish = PUBLISH_ROLES.includes(user?.role ?? '');
  const [params, setParams] = useSearchParams();
  const [j, setJ] = useState<Journey | null>(null);
  const [draft, setDraft] = useState<Journey | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [saving, setSaving] = useState(false);
  const [addSeg, setAddSeg] = useState('');
  const lookups = useLookups();
  usePageSEO(j?.name ?? 'Journey', 'Build and watch a Pulse journey.');

  const load = useCallback(() => apiFetch(`/v1/pulse/journeys/${id}`).then((r: any) => { setJ(r.data); setDraft(r.data); })
    .catch((e) => showAlert(apiError(e), { variant: 'error' })), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch(`/v1/pulse/journeys/${id}/people?limit=100`).then((r: any) => setPeople(r.data)).catch(() => {}); }, [id, j]);

  const editing = !!j && (j.status === 'draft' || (j.status === 'paused' && params.get('edit') === '1'));
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(j), [draft, j]);
  const v = draft!;
  const set = (patch: Partial<Journey>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setSteps = (steps: Step[]) => set({ steps });

  async function save(): Promise<boolean> {
    if (!dirty || !draft) return true;
    setSaving(true);
    try {
      await apiFetch(`/v1/pulse/journeys/${id}`, { method: 'PATCH', body: JSON.stringify({
        name: draft.name, description: draft.description, source: draft.source, trigger: draft.trigger, steps: draft.steps,
        goal: draft.goal?.event_type ? draft.goal : null, reentry: draft.reentry, quiet_hours: draft.quiet_hours,
      }) });
      await load();
      return true;
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); return false; }
    finally { setSaving(false); }
  }

  async function act(action: 'publish' | 'pause' | 'archive') {
    if (action === 'publish' && !(await save())) return;
    const text = {
      publish: j?.published_at ? 'Resume this journey? People pick up where they left off.' : 'Start this journey? People who match the entry rule begin receiving its messages.',
      pause: 'Pause this journey? Nobody new enters and nobody moves on until you resume. You can edit it while paused.',
      archive: 'Archive this journey? Everyone still in it leaves, and it stops for good.',
    }[action];
    if (!(await showConfirm(text, { title: { publish: j?.published_at ? 'Resume' : 'Start journey', pause: 'Pause journey', archive: 'Archive journey' }[action], variant: action === 'archive' ? 'danger' : 'warning', confirmLabel: { publish: j?.published_at ? 'Resume' : 'Start', pause: 'Pause', archive: 'Archive' }[action] }))) return;
    try {
      await apiFetch(`/v1/pulse/journeys/${id}/${action}`, { method: 'POST' });
      if (action === 'archive') { navigate('/pulse/journeys'); return; }
      setParams({}, { replace: true });
      load();
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  async function addPeople() {
    try {
      const m: any = await apiFetch(`/v1/pulse/segments/${addSeg}/members?limit=200`);
      const ids = (m.data as { id: string }[]).map((x) => x.id);
      if (!ids.length) { showAlert('Nobody is in that audience right now.', { variant: 'warning' }); return; }
      const r: any = await apiFetch(`/v1/pulse/journeys/${id}/enroll`, { method: 'POST', body: JSON.stringify({ ids }) });
      showAlert(`${r.data.added} added. ${r.data.skipped ? `${r.data.skipped} were already in it or have been through it.` : ''}`, { variant: 'success' });
      load();
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  if (!j || !draft) return <SectionLoading />;
  const status = JOURNEY_STATUS[j.status];
  const t = v.trigger ?? {};
  const events = lookups.events.filter((e) => e.sources.includes(v.source));
  const stats = (sid: string) => j.step_stats.find((s) => s.id === sid);

  const personColumns: TableColumn<Person>[] = [
    { key: 'name', header: 'Person', render: (p) => (
      <div className="pulse-person"><PersonAvatar userId={p.source_id} kind={p.source === 'leads' ? 'leads' : p.source === 'customers' ? 'customers' : 'contacts'} name={p.name || p.email || 'Unknown'} size={28} />
        <div><div className="pulse-strong">{p.name || '—'}</div><div className="pulse-muted">{p.email || p.phone || ''}</div></div></div>
    ) },
    { key: 'where', header: 'Where they are', render: (p) => p.status === 'active'
      ? (p.step_index < j.steps.length ? `Before step ${p.step_index + 1}${new Date(p.next_run_at) > new Date() ? ` · until ${fmtWhen(p.next_run_at)}` : ''}` : 'Finishing')
      : <span className="pulse-muted">{p.exit_reason ?? p.status}</span> },
    { key: 'entered', header: 'Entered', hideAt: 'sm', render: (p) => fmtWhen(p.entered_at) },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', { label: 'Journeys', to: '/pulse/journeys' }, j.name]} title={j.name}
        subtitle={`${SOURCE_LABEL[j.source]} · ${fmtNum(j.counts.active ?? 0)} in it now · ${fmtNum((j.counts.completed ?? 0) + (j.counts.exited ?? 0))} finished`}
        actions={<>
          <Badge variant={status.variant}>{status.label}</Badge>
          {editing && <Button variant="outline" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Button>}
          {canPublish && j.status === 'paused' && !editing && <Button variant="outline" onClick={() => setParams({ edit: '1' })}><Icon name="edit" size={14} /> Edit</Button>}
          {canPublish && j.status === 'active' && <Button variant="outline" onClick={() => act('pause')}><Icon name="pause" size={14} /> Pause</Button>}
          {canPublish && j.status !== 'active' && <Button onClick={() => act('publish')}><Icon name="play" size={14} /> {j.published_at ? 'Resume' : 'Start'}</Button>}
          {canPublish && j.published_at && <Button variant="outline" onClick={() => act('archive')}><Icon name="archive" size={14} /> Archive</Button>}
        </>} />

      {editing && j.problems.length > 0 && !dirty && (
        <div className="pulse-note pulse-note-warn" role="status"><strong>Before this can start:</strong><ul>{j.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      {!canPublish && <p className="pulse-note">A manager or admin starts and pauses journeys.</p>}

      <div className="pulse-split">
        <div className="pulse-stack">
          <SectionCard title="Who enters" collapsible={false}>
            {editing ? (
              <div className="pulse-form">
                <div className="pulse-field"><Label htmlFor="j-name">Journey name</Label><Input id="j-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={160} /></div>
                <div className="pulse-ab-grid">
                  <div className="pulse-field"><Label htmlFor="j-source">People from</Label>
                    <Select value={v.source} disabled={!!j.published_at} onValueChange={(s) => set({ source: s as PulseSource, trigger: { type: 'manual' } })}>
                      <SelectTrigger id="j-source"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(SOURCE_LABEL) as PulseSource[]).map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="pulse-field"><Label htmlFor="j-trigger">They enter when</Label>
                    <Select value={t.type ?? 'manual'} onValueChange={(type) => set({ trigger: type === 'segment' ? { type, segment_id: '', include_existing: false } : type === 'event' ? { type, event_type: events[0]?.type ?? '' } : type === 'date' ? { type, date_field: 'birthday', offset_days: 0 } : { type } })}>
                      <SelectTrigger id="j-trigger"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="segment">they join an audience</SelectItem>
                        <SelectItem value="event">something happens</SelectItem>
                        {v.source === 'contacts' && <SelectItem value="date">it’s their birthday</SelectItem>}
                        <SelectItem value="manual">you add them</SelectItem>
                      </SelectContent>
                    </Select></div>
                </div>
                {t.type === 'segment' && <>
                  <div className="pulse-field"><Label htmlFor="j-seg">Audience</Label>
                    <Select value={t.segment_id || ''} onValueChange={(sid) => set({ trigger: { ...t, segment_id: sid } })}>
                      <SelectTrigger id="j-seg"><SelectValue placeholder="Choose an audience" /></SelectTrigger>
                      <SelectContent>{lookups.segments.filter((s) => s.source === v.source).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {fmtNum(s.stats?.total)} people</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="pulse-ab-toggle"><Switch id="j-existing" checked={!!t.include_existing} disabled={!!j.published_at} onCheckedChange={(on) => set({ trigger: { ...t, include_existing: on } })} />
                    <Label htmlFor="j-existing">Also include people already in it</Label></div>
                </>}
                {t.type === 'event' && (
                  <div className="pulse-field"><Label htmlFor="j-event">Event</Label>
                    <Select value={t.event_type || ''} onValueChange={(ev) => set({ trigger: { ...t, event_type: ev } })}>
                      <SelectTrigger id="j-event"><SelectValue placeholder="Choose an event" /></SelectTrigger>
                      <SelectContent>{events.map((e) => <SelectItem key={e.type} value={e.type}>{e.label}</SelectItem>)}</SelectContent>
                    </Select></div>
                )}
                {t.type === 'date' && (
                  <div className="pulse-field"><Label htmlFor="j-offset">Days before the birthday (0 = on the day)</Label>
                    <Input id="j-offset" type="number" min={0} max={30} value={t.offset_days ?? 0} onChange={(e) => set({ trigger: { ...t, offset_days: Math.max(0, Math.min(30, Number(e.target.value) || 0)) } })} /></div>
                )}
              </div>
            ) : (
              <p className="pulse-muted">
                {t.type === 'segment' ? `When someone joins “${lookups.segments.find((s) => s.id === t.segment_id)?.name ?? 'an audience'}”${t.include_existing ? ', including people already in it' : ''}.`
                  : t.type === 'event' ? `When: ${lookups.events.find((e) => e.type === t.event_type)?.label ?? t.event_type}.`
                    : t.type === 'date' ? `On each contact’s birthday${t.offset_days ? ` (${t.offset_days} days early)` : ''}.` : 'When you add them.'}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Steps" collapsible={false}>
            <ol className="pulse-journey">
              {v.steps.map((s, i) => {
                const info = typeInfo(s.type);
                const st = stats(s.id);
                const isOpen = editing && open === s.id;
                return (
                  <li key={s.id} className="pulse-jstep" data-type={s.type}>
                    <div className="pulse-jstep-head">
                      <span className="pulse-jstep-n">{i + 1}</span>
                      <Icon name={info.icon} size={16} color="var(--ink3)" label={info.label} />
                      <div className="pulse-jstep-text">
                        <div className="pulse-strong">{s.label || info.label}</div>
                        <div className="pulse-muted">{summary(s, v.steps)}</div>
                      </div>
                      {editing ? (
                        <div className="pulse-jstep-tools">
                          <Button variant="ghost" size="icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => { const n = [...v.steps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSteps(n); }}><Icon name="arrowUp" size={14} /></Button>
                          <Button variant="ghost" size="icon" aria-label={`Move step ${i + 1} down`} disabled={i === v.steps.length - 1} onClick={() => { const n = [...v.steps]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSteps(n); }}><Icon name="arrowDown" size={14} /></Button>
                          <Button variant="ghost" size="icon" aria-label={`${isOpen ? 'Close' : 'Edit'} step ${i + 1}`} onClick={() => setOpen(isOpen ? null : s.id)}><Icon name={isOpen ? 'chevronUp' : 'edit'} size={14} /></Button>
                          <Button variant="ghost" size="icon" aria-label={`Delete step ${i + 1}`} onClick={() => setSteps(v.steps.filter((x) => x.id !== s.id))}><Icon name="trash" size={14} /></Button>
                        </div>
                      ) : st && (
                        <div className="pulse-jstep-stats">
                          {st.message ? <Link to={`/pulse/campaigns/${st.message.campaign_id}`}>{fmtNum(st.message.sent)} sent{s.type === 'email' ? ` · ${pct(st.message.opened, st.message.sent)} opened` : ''} · {pct(st.message.clicked, st.message.sent)} clicked</Link>
                            : <span>{fmtNum(st.done)} done{st.skipped ? ` · ${fmtNum(st.skipped)} skipped` : ''}{st.failed ? ` · ${fmtNum(st.failed)} failed` : ''}</span>}
                          {st.waiting > 0 && <Badge variant="info">{fmtNum(st.waiting)} waiting here</Badge>}
                        </div>
                      )}
                    </div>
                    {isOpen && <div className="pulse-jstep-body"><StepEditor step={s} index={i} steps={v.steps} source={v.source} lookups={lookups} onChange={(n) => setSteps(v.steps.map((x) => (x.id === s.id ? n : x)))} /></div>}
                  </li>
                );
              })}
            </ol>
            {v.steps.length === 0 && <p className="pulse-muted">No steps yet.</p>}
            {editing && (
              <div className="pulse-add-step">
                <Select value="" onValueChange={(type) => { const s = newStep(type); setSteps([...v.steps, s]); setOpen(s.id); }}>
                  <SelectTrigger aria-label="Add a step" className="pulse-filter"><SelectValue placeholder="+ Add a step" /></SelectTrigger>
                  <SelectContent>{STEP_TYPES.filter((x) => !x.leadsOnly || v.source === 'leads').map((x) => <SelectItem key={x.type} value={x.type}>{x.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="pulse-stack">
          <SectionCard title="Rules" collapsible={false}>
            {editing ? (
              <div className="pulse-form">
                <div className="pulse-field"><Label htmlFor="j-goal">Goal — leave the journey when</Label>
                  <Select value={v.goal?.event_type ?? 'none'} onValueChange={(ev) => set({ goal: ev === 'none' ? null : { event_type: ev } })}>
                    <SelectTrigger id="j-goal"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">No goal</SelectItem>{events.map((e) => <SelectItem key={e.type} value={e.type}>{e.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="pulse-field"><Label htmlFor="j-reentry">Can someone go through it twice?</Label>
                  <Select value={v.reentry} onValueChange={(r) => set({ reentry: r as 'never' | 'after_exit' })}>
                    <SelectTrigger id="j-reentry"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="never">No, once per person</SelectItem><SelectItem value="after_exit">Yes, after they finish</SelectItem></SelectContent>
                  </Select></div>
                <div className="pulse-ab-toggle"><Switch id="j-quiet" checked={!!v.quiet_hours} onCheckedChange={(on) => set({ quiet_hours: on ? { start: '21:00', end: '08:00' } : null })} />
                  <Label htmlFor="j-quiet">Don’t send at night</Label></div>
                {v.quiet_hours && (
                  <div className="pulse-ab-grid">
                    <div className="pulse-field"><Label htmlFor="j-qs">Quiet from</Label><Input id="j-qs" type="time" value={v.quiet_hours.start} onChange={(e) => set({ quiet_hours: { ...v.quiet_hours!, start: e.target.value } })} /></div>
                    <div className="pulse-field"><Label htmlFor="j-qe">Until</Label><Input id="j-qe" type="time" value={v.quiet_hours.end} onChange={(e) => set({ quiet_hours: { ...v.quiet_hours!, end: e.target.value } })} /></div>
                  </div>
                )}
              </div>
            ) : (
              <dl className="pulse-review">
                <div><dt>Goal</dt><dd>{v.goal?.event_type ? lookups.events.find((e) => e.type === v.goal!.event_type)?.label ?? v.goal.event_type : 'None'}</dd></div>
                <div><dt>Repeat</dt><dd>{v.reentry === 'never' ? 'Once per person' : 'Again after finishing'}</dd></div>
                <div><dt>Quiet hours</dt><dd>{v.quiet_hours ? `${v.quiet_hours.start}–${v.quiet_hours.end}` : 'Off'}</dd></div>
              </dl>
            )}
          </SectionCard>
          {canPublish && j.status === 'active' && t.type === 'manual' && (
            <SectionCard title="Add people" collapsible={false}>
              <div className="pulse-form">
                <div className="pulse-field"><Label htmlFor="j-add">Everyone in</Label>
                  <Select value={addSeg} onValueChange={setAddSeg}><SelectTrigger id="j-add"><SelectValue placeholder="Choose an audience" /></SelectTrigger>
                    <SelectContent>{lookups.segments.filter((s) => s.source === j.source).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <Button variant="outline" disabled={!addSeg} onClick={addPeople}><Icon name="userPlus" size={14} /> Add them</Button>
                <span className="pulse-muted">Up to 200 at a time. Anyone who has already been through it is skipped.</span>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {j.published_at && (
        <SectionCard title="People" padded={false} collapsible={false}>
          <DataTable columns={personColumns} rows={people} empty={!people.length} emptyIcon="users" emptyTitle="Nobody has entered yet"
            emptyMessage={t.type === 'segment' ? 'Newcomers to the audience are picked up within a minute.' : 'People enter when the trigger happens.'} />
        </SectionCard>
      )}
    </div>
  );
}
