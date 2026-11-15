import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Label } from '../../components/ui/label.js';
import { Switch } from '../../components/ui/switch.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DateTimePicker } from '../../components/ui/date-picker.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { SOURCE_LABEL } from './pulseFields.js';
import { SubjectIdeas, DraftWithHudu, SendTimeHint } from './PulseHudu.js';
import { apiError, fmtNum, type AbTest, type Campaign, type Segment, type SegmentStats } from './pulseShared.js';

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
const STEPS = ['Audience', 'Content', 'Settings', 'Review'] as const;
type Step = typeof STEPS[number];

const STARTER_HTML = `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937">
  <h1 style="font-size:24px;margin:0 0 16px">Hello {{first_name}},</h1>
  <p>Write your message here.</p>
  <p><a href="https://example.com" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px">Call to action</a></p>
  <p>Thanks,<br>{{company}}</p>
</div>`;

type Detail = Campaign & {
  segment: { id: string; name: string; source: Segment['source'] } | null;
  audience: SegmentStats | null; problems: string[]; links: string[]; sms_segments: number | null;
};

/** New campaign: name, channel and audience, then straight into the editor. */
export function PulseCampaignNew() {
  usePageSEO('New campaign', 'Start a Pulse campaign.');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [segmentId, setSegmentId] = useState(params.get('segment') ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiFetch('/v1/pulse/segments').then((r: any) => setSegments(r.data)).catch(() => {}); }, []);

  async function create() {
    setSaving(true);
    try {
      const r: any = await apiFetch('/v1/pulse/campaigns', { method: 'POST', body: JSON.stringify({
        name: name.trim(), channel, segment_id: segmentId || null,
        ...(channel === 'email' ? { body_html: STARTER_HTML } : {}),
      }) });
      navigate(`/pulse/campaigns/${r.data.id}/edit?step=Content`);
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
    finally { setSaving(false); }
  }

  return (
    <div className="pulse-page">
      <PageHeader variant="create" backTo="/pulse/campaigns" backLabel="Campaigns" crumbs={['Pulse', { label: 'Campaigns', to: '/pulse/campaigns' }, 'New']} title="New campaign" />
      <SectionCard title="Start" collapsible={false}>
        <div className="pulse-form pulse-narrow">
          <div className="pulse-field">
            <Label htmlFor="c-name">Campaign name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. March rate update" maxLength={160} />
            <span className="pulse-muted">Only your team sees this.</span>
          </div>
          <div className="pulse-field">
            <Label htmlFor="c-channel">Send by</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as 'email' | 'sms' | 'whatsapp')}>
              <SelectTrigger id="c-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            {channel === 'whatsapp' && <span className="pulse-muted">WhatsApp marketing uses templates Meta has approved. You pick one in the next step.</span>}
          </div>
          <div className="pulse-field">
            <Label htmlFor="c-seg">Audience</Label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger id="c-seg"><SelectValue placeholder={segments.length ? 'Choose an audience' : 'No audiences yet'} /></SelectTrigger>
              <SelectContent>{segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {fmtNum(s.stats?.total)} people</SelectItem>)}</SelectContent>
            </Select>
            {!segments.length && <Button variant="link" className="pulse-link-btn" onClick={() => navigate('/pulse/audiences/new')}>Build an audience first</Button>}
          </div>
          <Button onClick={create} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Continue'} <Icon name="chevronRight" size={14} /></Button>
        </div>
      </SectionCard>
    </div>
  );
}

export function PulseCampaignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canLaunch = PUBLISH_ROLES.includes(user?.role ?? '');
  const [params, setParams] = useSearchParams();
  const step = (STEPS.includes(params.get('step') as Step) ? params.get('step') : 'Audience') as Step;
  const [c, setC] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Partial<Campaign>>({});
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body_html: string | null; body: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [wa, setWa] = useState<{ connected: boolean; note?: string; templates: { name: string; language: string; category: string; body: string; params: number }[] } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [when, setWhen] = useState<Date | undefined>();
  const [schedule, setSchedule] = useState(false);
  usePageSEO(c?.name ?? 'Campaign', 'Edit a Pulse campaign.');

  const load = useCallback(() => apiFetch(`/v1/pulse/campaigns/${id}`).then((r: any) => {
    if (r.data.status !== 'draft') { navigate(`/pulse/campaigns/${id}`, { replace: true }); return; }
    setC(r.data); setDraft({});
  }).catch((e) => showAlert(apiError(e), { variant: 'error' })), [id, navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch('/v1/pulse/segments').then((r: any) => setSegments(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (c?.channel === 'whatsapp') apiFetch('/v1/pulse/whatsapp/templates').then((r: any) => setWa(r.data)).catch(() => setWa({ connected: false, templates: [], note: 'Could not reach WhatsApp.' })); }, [c?.channel]);
  useEffect(() => { apiFetch('/v1/email/quick-templates').then((r: any) => setTemplates(Array.isArray(r) ? r : [])).catch(() => {}); }, []);

  const v = useMemo(() => ({ ...c, ...draft }) as Detail, [c, draft]);
  const dirty = Object.keys(draft).length > 0;
  const set = (patch: Partial<Campaign>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...draft };
      if ('reply_to' in body && !body.reply_to) body.reply_to = '';
      await apiFetch(`/v1/pulse/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
      return true;
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); return false; }
    finally { setSaving(false); }
  }

  async function go(next: Step) { if (await save()) setParams({ step: next }, { replace: true }); }

  async function sendTest() {
    if (!(await save())) return;
    setTesting(true);
    try {
      const r: any = await apiFetch(`/v1/pulse/campaigns/${id}/test`, { method: 'POST', body: JSON.stringify({ to: testTo }) });
      showAlert(r.data.delivered ? `Test sent to ${testTo}.` : r.data.note, { variant: r.data.delivered ? 'success' : 'warning' });
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
    finally { setTesting(false); }
  }

  async function launch() {
    if (!(await save())) return;
    const people = c?.channel === 'email'
      ? Math.max((c?.audience?.with_email ?? 0) - (c?.audience?.email_suppressed ?? 0), 0) : c?.audience?.with_phone ?? 0;
    const whenText = schedule && when ? `on ${when.toLocaleString()}` : 'now';
    const ok = await showConfirm(`Send "${c?.name}" to about ${fmtNum(people)} ${people === 1 ? 'person' : 'people'} ${whenText}? You can cancel until it starts sending.`,
      { title: schedule ? 'Schedule campaign' : 'Send campaign', confirmLabel: schedule ? 'Schedule' : 'Send now', variant: 'warning' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/pulse/campaigns/${id}/launch`, { method: 'POST', body: JSON.stringify({ scheduled_at: schedule && when ? when.toISOString() : null }) });
      navigate(`/pulse/campaigns/${id}`);
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  if (!c) return <SectionLoading />;
  const ab = (v.ab_test ?? null) as AbTest | null;
  const isEmail = c.channel === 'email';
  const segOfDraft = segments.find((s) => s.id === v.segment_id);

  return (
    <div className="pulse-page">
      <PageHeader variant="create" backTo="/pulse/campaigns" backLabel="Campaigns"
        crumbs={['Pulse', { label: 'Campaigns', to: '/pulse/campaigns' }, c.name]} title={c.name}
        actions={<Button variant="outline" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}</Button>} />

      <nav className="pulse-steps" aria-label="Campaign steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" className="pulse-step" aria-current={s === step ? 'step' : undefined} onClick={() => go(s)}>
            <span className="pulse-step-n">{i + 1}</span>{s}
          </button>
        ))}
      </nav>

      {step === 'Audience' && (
        <SectionCard title="Who gets it" collapsible={false}>
          <div className="pulse-form pulse-narrow">
            <div className="pulse-field">
              <Label htmlFor="e-name">Campaign name</Label>
              <Input id="e-name" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} maxLength={160} />
            </div>
            <div className="pulse-field">
              <Label htmlFor="e-seg">Audience</Label>
              <Select value={v.segment_id ?? ''} onValueChange={(s) => set({ segment_id: s })}>
                <SelectTrigger id="e-seg"><SelectValue placeholder="Choose an audience" /></SelectTrigger>
                <SelectContent>{segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {SOURCE_LABEL[s.source]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {segOfDraft?.stats && (
              <p className="pulse-note">
                {isEmail
                  ? <>{fmtNum(Math.max(segOfDraft.stats.with_email - segOfDraft.stats.email_suppressed, 0))} of {fmtNum(segOfDraft.stats.total)} people can get this by email. {fmtNum(segOfDraft.stats.email_suppressed)} opted out and will be skipped.</>
                  : <>{fmtNum(segOfDraft.stats.with_phone)} of {fmtNum(segOfDraft.stats.total)} people have a phone number. Anyone who replied STOP is skipped.</>}
              </p>
            )}
            <div className="pulse-actions"><Button onClick={() => go('Content')}>Next: content <Icon name="chevronRight" size={14} /></Button></div>
          </div>
        </SectionCard>
      )}

      {step === 'Content' && isEmail && (
        <div className="pulse-split pulse-split-wide">
          <SectionCard title="Message" collapsible={false}>
            <div className="pulse-form">
              <div className="pulse-ab-toggle">
                <Switch id="e-ab" checked={!!ab} onCheckedChange={(on) => set({ ab_test: on ? { variants: [{ key: 'A', subject: v.subject ?? '' }, { key: 'B', subject: '' }], sample_pct: 20, metric: 'open', decide_after_hours: 4 } : null })} />
                <Label htmlFor="e-ab">Test two subject lines first</Label>
              </div>
              {!ab ? (
                <div className="pulse-field">
                  <Label htmlFor="e-subject">Subject</Label>
                  <Input id="e-subject" value={v.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
                  <SubjectIdeas brief={v.body_html ?? ''} onPick={(s) => set({ subject: s })} />
                </div>
              ) : (
                <div className="pulse-ab">
                  {ab.variants.map((variant, i) => (
                    <div className="pulse-field" key={variant.key}>
                      <Label htmlFor={`e-sub-${variant.key}`}>Subject {variant.key}</Label>
                      <Input id={`e-sub-${variant.key}`} value={variant.subject} maxLength={200}
                        onChange={(e) => set({ ab_test: { ...ab, variants: ab.variants.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) } })} />
                    </div>
                  ))}
                  <div className="pulse-ab-grid">
                    <div className="pulse-field">
                      <Label htmlFor="e-ab-pct">Test on</Label>
                      <Select value={String(ab.sample_pct)} onValueChange={(p) => set({ ab_test: { ...ab, sample_pct: Number(p) } })}>
                        <SelectTrigger id="e-ab-pct"><SelectValue /></SelectTrigger>
                        <SelectContent>{[10, 20, 30, 50].map((p) => <SelectItem key={p} value={String(p)}>{p}% of the audience</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="pulse-field">
                      <Label htmlFor="e-ab-metric">Winner has the most</Label>
                      <Select value={ab.metric} onValueChange={(m) => set({ ab_test: { ...ab, metric: m as 'open' | 'click' } })}>
                        <SelectTrigger id="e-ab-metric"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="open">opens</SelectItem><SelectItem value="click">clicks</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="pulse-field">
                      <Label htmlFor="e-ab-hours">Pick the winner after</Label>
                      <Select value={String(ab.decide_after_hours)} onValueChange={(h) => set({ ab_test: { ...ab, decide_after_hours: Number(h) } })}>
                        <SelectTrigger id="e-ab-hours"><SelectValue /></SelectTrigger>
                        <SelectContent>{[1, 2, 4, 8, 24].map((h) => <SelectItem key={h} value={String(h)}>{h} {h === 1 ? 'hour' : 'hours'}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="pulse-muted">The rest of the audience gets the winning subject once the test window ends.</p>
                </div>
              )}
              <div className="pulse-field">
                <Label htmlFor="e-pre">Preview text (optional)</Label>
                <Input id="e-pre" value={v.preheader ?? ''} onChange={(e) => set({ preheader: e.target.value })} maxLength={200} placeholder="Shown next to the subject in most inboxes" />
              </div>
              {templates.length > 0 && (
                <div className="pulse-field">
                  <Label htmlFor="e-tpl">Start from one of your email templates</Label>
                  <Select value="" onValueChange={async (tid) => {
                    const t = templates.find((x) => x.id === tid);
                    if (!t) return;
                    if (v.body_html?.trim() && !(await showConfirm('Replace the current email with this template?', { confirmLabel: 'Replace' }))) return;
                    set({ body_html: t.body_html || `<p>${t.body.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`, ...(t.subject && !v.subject ? { subject: t.subject } : {}) });
                  }}>
                    <SelectTrigger id="e-tpl"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                    <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <DraftWithHudu kind="email" onDraft={(d) => set({ body_html: d.body_html, ...(d.subject && !ab ? { subject: d.subject } : {}), ...(d.preheader ? { preheader: d.preheader } : {}) })} />
              <div className="pulse-field">
                <Label htmlFor="e-html">Email (HTML)</Label>
                <Textarea id="e-html" className="pulse-code" rows={18} value={v.body_html ?? ''} onChange={(e) => set({ body_html: e.target.value })} spellCheck={false} />
                <span className="pulse-muted">Personalise with {'{{first_name}}'}, {'{{name}}'}, {'{{company}}'}. An unsubscribe line is added at the bottom unless you place {'{{unsubscribe_url}}'} yourself.</span>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Preview" collapsible={false}>
            <iframe className="pulse-preview-frame" title="Email preview" sandbox=""
              srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#ffffff">${(v.body_html ?? '').replace(/\{\{\s*first_name\s*\}\}/g, 'Amina').replace(/\{\{\s*name\s*\}\}/g, 'Amina Mollel').replace(/\{\{\s*company\s*\}\}/g, 'your company')}</body>`} />
            <p className="pulse-muted">{c.links.length} tracked {c.links.length === 1 ? 'link' : 'links'} in the saved version.</p>
          </SectionCard>
        </div>
      )}

      {step === 'Content' && c.channel === 'sms' && (
        <SectionCard title="Message" collapsible={false}>
          <div className="pulse-form pulse-narrow">
            <DraftWithHudu kind="sms" onDraft={(d) => set({ body_text: d.body_text })} />
            <div className="pulse-field">
              <Label htmlFor="e-sms">Text message</Label>
              <Textarea id="e-sms" rows={6} value={v.body_text ?? ''} onChange={(e) => set({ body_text: e.target.value })} maxLength={1600} />
              <span className="pulse-muted">
                {(v.body_text ?? '').length} characters · links are shortened and tracked · personalise with {'{{first_name}}'}
              </span>
            </div>
            <div className="pulse-actions"><Button onClick={() => go('Settings')}>Next: settings <Icon name="chevronRight" size={14} /></Button></div>
          </div>
        </SectionCard>
      )}
      {step === 'Content' && c.channel === 'whatsapp' && (() => {
        const t = v.whatsapp_template;
        const chosen = wa?.templates.find((x) => x.name === t?.name && x.language === t?.language);
        return (
          <SectionCard title="WhatsApp template" collapsible={false}>
            <div className="pulse-form pulse-narrow">
              {!wa ? <SectionLoading /> : wa.note && <p className="pulse-note pulse-note-warn">{wa.note}</p>}
              {wa && wa.templates.length > 0 && (
                <div className="pulse-field">
                  <Label htmlFor="e-wa">Approved template</Label>
                  <Select value={t ? `${t.name}|${t.language}` : ''} onValueChange={(key) => {
                    const [name, language] = key.split('|');
                    const tpl = wa.templates.find((x) => x.name === name && x.language === language);
                    set({ whatsapp_template: { name, language, params: Array.from({ length: tpl?.params ?? 0 }, (_, i) => t?.params?.[i] ?? (i === 0 ? '{{first_name}}' : '')) } });
                  }}>
                    <SelectTrigger id="e-wa"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                    <SelectContent>{wa.templates.map((x) => <SelectItem key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>{x.name} · {x.language}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {chosen && <p className="pulse-note">{chosen.body}</p>}
              {t?.params?.map((p, i) => (
                <div className="pulse-field" key={i}>
                  <Label htmlFor={`e-wa-${i}`}>{`Value for {{${i + 1}}}`}</Label>
                  <Input id={`e-wa-${i}`} value={p} maxLength={1024}
                    onChange={(e) => set({ whatsapp_template: { ...t, params: t.params.map((x, j) => (j === i ? e.target.value : x)) } })} />
                </div>
              ))}
              {t && <span className="pulse-muted">Values can use {'{{first_name}}'} and {'{{company}}'}. Links are shortened and tracked.</span>}
              <div className="pulse-actions"><Button onClick={() => go('Settings')}>Next: settings <Icon name="chevronRight" size={14} /></Button></div>
            </div>
          </SectionCard>
        );
      })()}
      {step === 'Content' && isEmail && <div className="pulse-actions"><Button onClick={() => go('Settings')}>Next: settings <Icon name="chevronRight" size={14} /></Button></div>}

      {step === 'Settings' && (
        <SectionCard title="Settings" collapsible={false}>
          <div className="pulse-form pulse-narrow">
            {isEmail && <>
              <div className="pulse-field">
                <Label htmlFor="e-from">From name (optional)</Label>
                <Input id="e-from" value={v.from_name ?? ''} onChange={(e) => set({ from_name: e.target.value })} maxLength={80} placeholder="Your workspace's sender name is used if blank" />
              </div>
              <div className="pulse-field">
                <Label htmlFor="e-reply">Replies go to (optional)</Label>
                <Input id="e-reply" type="email" value={v.reply_to ?? ''} onChange={(e) => set({ reply_to: e.target.value })} placeholder="e.g. sales@yourcompany.com" />
              </div>
            </>}
            <div className="pulse-field">
              <Label htmlFor="e-utm">Website tracking name (optional)</Label>
              <Input id="e-utm" value={v.utm_campaign ?? ''} onChange={(e) => set({ utm_campaign: e.target.value })} maxLength={80} placeholder="e.g. march-rates" />
              <span className="pulse-muted">Adds utm_campaign to every link so website analytics can credit this campaign.</span>
            </div>
            <div className="pulse-actions"><Button onClick={() => go('Review')}>Next: review <Icon name="chevronRight" size={14} /></Button></div>
          </div>
        </SectionCard>
      )}

      {step === 'Review' && (
        <div className="pulse-split">
          <SectionCard title="Ready to send?" collapsible={false}>
            {c.problems.length > 0 ? (
              <div className="pulse-note pulse-note-warn" role="status">
                <strong>Before this can go out:</strong>
                <ul>{c.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : (
              <dl className="pulse-review">
                <div><dt>Audience</dt><dd>{c.segment?.name}</dd></div>
                <div><dt>Will receive it</dt><dd>{fmtNum(isEmail ? Math.max((c.audience?.with_email ?? 0) - (c.audience?.email_suppressed ?? 0), 0) : c.audience?.with_phone)} people</dd></div>
                {isEmail && <div><dt>Subject</dt><dd>{ab ? ab.variants.map((x) => `${x.key}: ${x.subject}`).join(' · ') : c.subject}</dd></div>}
                {c.channel === 'sms' && <div><dt>Length</dt><dd>{c.sms_segments} SMS {c.sms_segments === 1 ? 'part' : 'parts'} per person</dd></div>}
                {c.channel === 'whatsapp' && <div><dt>Template</dt><dd>{c.whatsapp_template?.name}</dd></div>}
                <div><dt>Tracked links</dt><dd>{c.links.length}</dd></div>
              </dl>
            )}
            {canLaunch ? (
              <div className="pulse-form">
                <div className="pulse-ab-toggle">
                  <Switch id="e-sched" checked={schedule} onCheckedChange={setSchedule} />
                  <Label htmlFor="e-sched">Send later</Label>
                </div>
                {schedule && (
                  <div className="pulse-field">
                    <Label>Send on</Label>
                    <DateTimePicker date={when} onChange={setWhen} />
                    {isEmail && <SendTimeHint segmentId={c.segment_id} />}
                  </div>
                )}
                <Button onClick={launch} disabled={c.problems.length > 0 || (schedule && !when)}>
                  <Icon name="send" size={14} /> {schedule ? 'Schedule' : 'Send now'}
                </Button>
              </div>
            ) : <p className="pulse-note">A manager or admin sends campaigns. Your draft is saved — let them know it's ready.</p>}
          </SectionCard>
          <SectionCard title="Send a test" collapsible={false}>
            <div className="pulse-form">
              <div className="pulse-field">
                <Label htmlFor="e-test">{isEmail ? 'Email address' : 'Phone number'}</Label>
                <Input id="e-test" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={isEmail ? 'you@yourcompany.com' : '+255…'} />
              </div>
              <Button variant="outline" onClick={sendTest} disabled={testing || !testTo.trim()}>{testing ? 'Sending…' : 'Send test'}</Button>
              <span className="pulse-muted">Tests are marked [Test] and their links aren't tracked.</span>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
