import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Switch } from '../../components/ui/switch.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { apiError, fmtNum, CHANNEL_LABEL } from './pulseShared.js';

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

interface FormRow { id: string; key: string; name: string; field_count: number; submissions: number; people: number; leads: number; enabled: boolean; create_lead: boolean; configured: boolean }
interface Field { key: string; label: string; type: string; options?: string[] }
interface Mapping { enabled: boolean; create_lead: boolean; email_field: string | null; name_field: string | null; phone_field: string | null; company_field: string | null; consent_field: string | null; consent_value: string | null; saved?: boolean }

export function PulseForms() {
  usePageSEO('Website forms', 'How website form submissions become Pulse contacts and leads.');
  const navigate = useNavigate();
  const [rows, setRows] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/pulse/forms?days=30').then((r: any) => { setRows(r.data); setError(undefined); }).catch((e) => setError(apiError(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const columns: TableColumn<FormRow>[] = [
    { key: 'name', header: 'Form', render: (r) => <div><div className="pulse-strong">{r.name}</div><div className="pulse-muted">{r.field_count} fields</div></div> },
    { key: 'does', header: 'Each submission', render: (r) => !r.enabled ? <Badge variant="gray">Ignored by Pulse</Badge>
      : <span>{r.create_lead ? 'Contact + CRM lead' : 'Contact'}{!r.configured && <span className="pulse-muted"> · fields detected automatically</span>}</span> },
    { key: 'submissions', header: 'Submissions (30 days)', align: 'right', render: (r) => fmtNum(r.submissions) },
    { key: 'leads', header: 'Leads', align: 'right', hideAt: 'sm', render: (r) => fmtNum(r.leads) },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Website forms']} titlePlain="Website" titleEm="forms"
        subtitle="Forms are built and placed on your pages in the CMS. Here you decide what a submission becomes in Pulse."
        actions={<Button variant="outline" onClick={() => navigate('/cms')}><Icon name="externalLink" size={14} /> Build forms in CMS</Button>} />
      <SectionCard title="Forms" padded={false} collapsible={false}>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={load}
          empty={!loading && rows.length === 0} emptyIcon="clipboard" emptyTitle="No website forms yet"
          emptyMessage="Create a form in the CMS and place it on a page. Its submissions will show up here."
          onRowClick={(r) => navigate(`/pulse/forms/${r.id}`)} />
      </SectionCard>
    </div>
  );
}

export function PulseFormDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = PUBLISH_ROLES.includes(user?.role ?? '');
  const [form, setForm] = useState<{ id: string; name: string; fields: Field[]; mapping: Mapping; sources: { campaign: string | null; source: string | null; n: number }[] } | null>(null);
  const [m, setM] = useState<Mapping | null>(null);
  const [saving, setSaving] = useState(false);
  usePageSEO(form?.name ?? 'Form', 'What a website form submission becomes in Pulse.');

  useEffect(() => {
    apiFetch(`/v1/pulse/forms/${id}`).then((r: any) => { setForm(r.data); setM(r.data.mapping); }).catch((e) => showAlert(apiError(e), { variant: 'error' }));
  }, [id]);

  const consentField = useMemo(() => form?.fields.find((f) => f.key === m?.consent_field), [form, m?.consent_field]);
  if (!form || !m) return <SectionLoading />;
  const pick = (label: string, key: keyof Mapping, idSuffix: string, filter?: (f: Field) => boolean) => (
    <div className="pulse-field">
      <Label htmlFor={`fm-${idSuffix}`}>{label}</Label>
      <Select value={(m[key] as string) ?? 'none'} disabled={!canEdit} onValueChange={(v) => setM({ ...m, [key]: v === 'none' ? null : v, ...(key === 'consent_field' ? { consent_value: null } : {}) })}>
        <SelectTrigger id={`fm-${idSuffix}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not on this form</SelectItem>
          {form.fields.filter(filter ?? (() => true)).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  async function save() {
    setSaving(true);
    try {
      const { saved: _s, ...body } = m!;
      await apiFetch(`/v1/pulse/forms/${id}/settings`, { method: 'PUT', body: JSON.stringify(body) });
      showAlert('Saved. New submissions follow these settings.', { variant: 'success' });
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
    finally { setSaving(false); }
  }

  return (
    <div className="pulse-page">
      <PageHeader variant="create" backTo="/pulse/forms" backLabel="Website forms" crumbs={['Pulse', { label: 'Website forms', to: '/pulse/forms' }, form.name]} title={form.name}
        actions={canEdit && <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>} />
      {!m.saved && <p className="pulse-note">Pulse guessed which field is which. Check it and save.</p>}
      <div className="pulse-split">
        <SectionCard title="What a submission becomes" collapsible={false}>
          <div className="pulse-form">
            <div className="pulse-ab-toggle"><Switch id="fm-on" checked={m.enabled} disabled={!canEdit} onCheckedChange={(on) => setM({ ...m, enabled: on })} /><Label htmlFor="fm-on">Add people who send this form to Contacts</Label></div>
            <div className="pulse-ab-toggle"><Switch id="fm-lead" checked={m.create_lead} disabled={!canEdit || !m.enabled} onCheckedChange={(on) => setM({ ...m, create_lead: on })} /><Label htmlFor="fm-lead">Also open a CRM lead for sales to follow up</Label></div>
            <div className="pulse-ab-grid">
              {pick('Email address', 'email_field', 'email')}
              {pick('Name', 'name_field', 'name')}
              {pick('Phone', 'phone_field', 'phone')}
              {pick('Company', 'company_field', 'company')}
            </div>
            <span className="pulse-muted">Someone already in Contacts with the same email or phone is matched, not duplicated.</span>
          </div>
        </SectionCard>
        <SectionCard title="Marketing consent" collapsible={false}>
          <div className="pulse-form">
            {pick('Question that asks permission', 'consent_field', 'consent', (f) => f.type === 'select')}
            {consentField && (
              <div className="pulse-field">
                <Label htmlFor="fm-yes">Answer that means “yes”</Label>
                <Select value={m.consent_value ?? ''} disabled={!canEdit} onValueChange={(v) => setM({ ...m, consent_value: v })}>
                  <SelectTrigger id="fm-yes"><SelectValue placeholder="Choose the yes answer" /></SelectTrigger>
                  <SelectContent>{(consentField.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <span className="pulse-muted">Consent is recorded only when someone picks that answer, with the question and their answer kept as evidence. Without a consent question, people are added but not marked as opted in.</span>
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Where submissions came from" collapsible={false}>
        {form.sources.length === 0 ? <p className="pulse-muted">No submissions with a tagged link yet. Use the link builder to tag the links you share.</p> : (
          <ul className="pulse-links">{form.sources.map((s, i) => (
            <li key={i}><span>{s.campaign ? `Campaign “${s.campaign}”` : 'Untagged'}{s.source ? ` · from ${s.source}` : ''}</span><strong>{fmtNum(s.n)}</strong></li>
          ))}</ul>
        )}
      </SectionCard>
    </div>
  );
}

interface AttrRow {
  id?: string;
  kind_of_touch: 'none' | 'campaign' | 'tagged' | 'form'; campaign_id: string | null; campaign_name: string | null; campaign_channel: string | null; journey_id: string | null;
  utm_campaign: string | null; utm_source: string | null; form_name: string | null; leads: number; deals: number; deal_value: number; payments: number; paid: number;
}

export function PulseAttribution() {
  usePageSEO('Attribution', 'Which campaigns and links brought in leads, won deals and payments.');
  const [days, setDays] = useState('90');
  const [model, setModel] = useState<'last' | 'first'>('last');
  const [rows, setRows] = useState<AttrRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    apiFetch(`/v1/pulse/attribution?days=${days}&model=${model}`).then((r: any) => setRows(r.data.map((x: AttrRow, i: number) => ({ ...x, id: String(i) })))).catch((e) => { showAlert(apiError(e), { variant: 'error' }); setRows([]); });
  }, [days, model]);

  const money = (n: number) => n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  const label = (r: AttrRow) => {
    if (r.kind_of_touch === 'none') return <span className="pulse-muted">No marketing touch found</span>;
    if (r.kind_of_touch === 'campaign') return <Link to={`/pulse/campaigns/${r.campaign_id}`}>{r.campaign_name}</Link>;
    return <span>{r.utm_campaign ? `“${r.utm_campaign}”` : r.form_name ?? 'Website form'}{r.utm_source ? <span className="pulse-muted"> · {r.utm_source}</span> : null}</span>;
  };
  const columns: TableColumn<AttrRow>[] = [
    { key: 'source', header: 'Credited to', render: (r) => <div><div className="pulse-strong">{label(r)}</div>
      <div className="pulse-muted">{r.kind_of_touch === 'campaign' ? `${CHANNEL_LABEL[r.campaign_channel as 'email'] ?? r.campaign_channel}${r.journey_id ? ' · journey message' : ''}` : r.kind_of_touch === 'none' ? '' : `Website form${r.form_name ? `: ${r.form_name}` : ''}`}</div></div> },
    { key: 'leads', header: 'Leads', align: 'right', render: (r) => fmtNum(r.leads) },
    { key: 'deals', header: 'Deals won', align: 'right', render: (r) => fmtNum(r.deals) },
    { key: 'deal_value', header: 'Won value', align: 'right', hideAt: 'sm', render: (r) => money(r.deal_value) },
    { key: 'paid', header: 'Payments', align: 'right', hideAt: 'sm', render: (r) => money(r.paid) },
  ];
  const credited = rows?.filter((r) => r.kind_of_touch !== 'none') ?? [];
  const none = rows?.find((r) => r.kind_of_touch === 'none');

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Attribution']} titlePlain="What brought them" titleEm="in"
        subtitle="Leads, won deals and payments, credited to the campaign or tagged link that reached the person in the 90 days before."
        actions={<>
          <Select value={model} onValueChange={(v) => setModel(v as 'last' | 'first')}>
            <SelectTrigger aria-label="Credit model" className="pulse-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="last">Credit the last touch</SelectItem><SelectItem value="first">Credit the first touch</SelectItem></SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger aria-label="Period" className="pulse-filter"><SelectValue /></SelectTrigger>
            <SelectContent>{['30', '90', '365'].map((d) => <SelectItem key={d} value={d}>Last {d === '365' ? 'year' : `${d} days`}</SelectItem>)}</SelectContent>
          </Select>
        </>} />
      <p className="pulse-note">People are matched by email or phone. Website browsing isn’t tracked, so a visit only counts when the person sends a form from a tagged link or clicks a Pulse message.</p>
      <SectionCard title="Credit" padded={false} collapsible={false}>
        <DataTable columns={columns} rows={credited} loading={!rows}
          empty={!!rows && credited.length === 0} emptyIcon="barChart" emptyTitle="Nothing credited yet"
          emptyMessage="Once leads, deals or payments follow a campaign click or a tagged form, they show up here." />
      </SectionCard>
      {none && (none.leads + none.deals + none.payments) > 0 && (
        <p className="pulse-muted pulse-footnote">
          Not linked to any marketing: {fmtNum(none.leads)} leads, {fmtNum(none.deals)} won deals, {fmtNum(none.payments)} payments.
        </p>
      )}
    </div>
  );
}

export function PulseLinkBuilder() {
  usePageSEO('Link builder', 'Tag links so Pulse can credit the campaign that brought someone in.');
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => {
    try {
      const u = new URL(url.trim());
      const set = (k: string, v: string) => { if (v.trim()) u.searchParams.set(k, v.trim().toLowerCase().replace(/\s+/g, '-')); };
      set('utm_source', source); set('utm_medium', medium); set('utm_campaign', campaign);
      return u.toString();
    } catch { return ''; }
  }, [url, source, medium, campaign]);

  async function copy() {
    try { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { showAlert('Copy didn’t work here — select the link and copy it by hand.', { variant: 'warning' }); }
  }

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Link builder']} titlePlain="Tagged" titleEm="links"
        subtitle="Add tags to a link you share on social media, in an ad or a newsletter. When someone arrives on it and sends a form on your site, Pulse credits that campaign." />
      <SectionCard title="Build a link" collapsible={false}>
        <div className="pulse-form pulse-narrow">
          <div className="pulse-field"><Label htmlFor="lb-url">Page on your website</Label><Input id="lb-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourcompany.co.tz/offer" /></div>
          <div className="pulse-ab-grid">
            <div className="pulse-field"><Label htmlFor="lb-src">Where it’s shared</Label><Input id="lb-src" value={source} onChange={(e) => setSource(e.target.value)} placeholder="facebook" /></div>
            <div className="pulse-field"><Label htmlFor="lb-med">Kind of link</Label><Input id="lb-med" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="social" /></div>
            <div className="pulse-field"><Label htmlFor="lb-cmp">Campaign name</Label><Input id="lb-cmp" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="march-rates" /></div>
          </div>
          {url && !result && <p className="pulse-note pulse-note-warn">Enter a full web address starting with https://</p>}
          {result && (
            <div className="pulse-field">
              <Label htmlFor="lb-out">Your link</Label>
              <Input id="lb-out" readOnly value={result} onFocus={(e) => e.currentTarget.select()} />
              <div><Button variant="outline" onClick={copy}><Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy link'}</Button></div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
