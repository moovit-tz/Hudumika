import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiError, fmtNum, fmtWhen, type Segment } from './pulseShared.js';

interface AdAccount { id: string; network: 'google' | 'meta'; name: string; currency: string | null; status: string; last_error: string | null; synced_at: string | null }
interface AdCampaign { id: string; name: string; status: string; daily_budget: number | null; objective: string | null; account_id: string; network: 'google' | 'meta'; currency: string | null; account_name: string; impressions: number; clicks: number; spend: number; conversions: number; pulse_leads: number; pulse_won: number; can_budget: boolean }
interface AdAudience { id: string; account_id: string; name: string; uploaded: number; status: string; last_error: string | null; synced_at: string | null; segment_name: string | null }
interface AdsData { available: { google: boolean; meta: boolean }; days: number; accounts: AdAccount[]; campaigns: AdCampaign[]; audiences: AdAudience[] }

const PUBLISH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
const PLATFORM = { google: 'Google Ads', meta: 'Meta (Facebook & Instagram)' };
const isLive = (s: string) => s === 'ENABLED' || s === 'ACTIVE';
const money = (n: number, cur?: string | null) => `${cur ? `${cur} ` : ''}${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

export function PulseAds() {
  usePageSEO('Ads', 'Google Ads and Meta ad campaigns: spend, results and matched audiences.');
  const { user } = useAuth();
  const canEdit = PUBLISH_ROLES.includes(user?.role ?? '');
  const [days, setDays] = useState('30');
  const [d, setD] = useState<AdsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [push, setPush] = useState({ account: '', segment: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await apiFetch(`/v1/pulse/ads?days=${days}`);
      setD(response.data);
    } catch (error) {
      setLoadError(apiError(error));
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch('/v1/pulse/segments').then((r: any) => setSegments(r.data)).catch(() => {}); }, []);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try { await fn(); if (done) showAlert(done, { variant: 'success' }); await load(); }
    catch (e) { showAlert(apiError(e), { variant: 'error' }); }
    finally { setBusy(null); }
  }
  async function connect(network: 'google' | 'meta') {
    try { const r: any = await apiFetch(`/v1/pulse/ads/connect/${network}`, { method: 'POST' }); window.location.assign(r.data.url); }
    catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }
  async function budget(c: AdCampaign) {
    const el = document.getElementById(`budget-${c.id}`) as HTMLInputElement | null;
    const amount = Number(el?.value);
    if (!(amount > 0)) { showAlert('Enter a daily budget above zero.', { variant: 'warning' }); return; }
    if (!(await showConfirm(`Set the daily budget of “${c.name}” to ${money(amount, c.currency)}? This changes spend on ${PLATFORM[c.network]} straight away.`, { title: 'Change budget', variant: 'warning', confirmLabel: 'Change budget' }))) return;
    run(c.id, () => apiFetch(`/v1/pulse/ads/campaigns/${c.id}`, { method: 'POST', body: JSON.stringify({ action: 'budget', amount }) }), 'Budget changed.');
  }

  if (loadError) return (
    <div className="pulse-inline">
      <p role="alert">{loadError}</p>
      <Button variant="outline" onClick={load}>Retry loading ads</Button>
    </div>
  );
  if (!d) return <SectionLoading />;
  const columns: TableColumn<AdCampaign>[] = [
    { key: 'name', header: 'Campaign', render: (c) => <div><div className="pulse-strong">{c.name}</div><div className="pulse-muted">{c.account_name} · {c.network === 'google' ? 'Google' : 'Meta'}</div></div> },
    { key: 'status', header: 'Status', render: (c) => <Badge variant={isLive(c.status) ? 'success' : 'gray'}>{isLive(c.status) ? 'Running' : c.status === 'PAUSED' ? 'Paused' : c.status.toLowerCase()}</Badge> },
    { key: 'spend', header: 'Spend', align: 'right', render: (c) => money(c.spend, c.currency) },
    { key: 'clicks', header: 'Clicks', align: 'right', hideAt: 'sm', render: (c) => fmtNum(c.clicks) },
    { key: 'cpc', header: 'Per click', align: 'right', hideAt: 'md', render: (c) => (c.clicks ? money(c.spend / c.clicks, c.currency) : '—') },
    { key: 'conv', header: 'Platform conversions', align: 'right', hideAt: 'md', render: (c) => fmtNum(Math.round(c.conversions)) },
    { key: 'pulse', header: 'Leads in Pulse', align: 'right', render: (c) => <span title="Leads whose last touch was a website form from a link tagged with this campaign's name">{fmtNum(c.pulse_leads)}{c.pulse_leads ? <span className="pulse-muted"> · {money(c.spend / c.pulse_leads, c.currency)} each</span> : null}</span> },
    ...(canEdit ? [{ key: 'actions', header: 'Daily budget', render: (c: AdCampaign) => (
      <div className="pulse-inline pulse-budget">
        {c.can_budget && <Input id={`budget-${c.id}`} aria-label={`Daily budget for ${c.name}`} type="number" min={1} defaultValue={c.daily_budget ?? ''} />}
        {c.can_budget && <Button variant="outline" size="sm" disabled={busy === c.id} onClick={() => budget(c)}>Set</Button>}
        <Button variant="ghost" size="icon" disabled={busy === c.id} aria-label={`${isLive(c.status) ? 'Pause' : 'Resume'} ${c.name}`} onClick={async () => {
          if (!(await showConfirm(`${isLive(c.status) ? 'Pause' : 'Resume'} “${c.name}” on ${PLATFORM[c.network]}?`, { title: isLive(c.status) ? 'Pause campaign' : 'Resume campaign', variant: 'warning', confirmLabel: isLive(c.status) ? 'Pause' : 'Resume' }))) return;
          run(c.id, () => apiFetch(`/v1/pulse/ads/campaigns/${c.id}`, { method: 'POST', body: JSON.stringify({ action: isLive(c.status) ? 'pause' : 'resume' }) }));
        }}><Icon name={isLive(c.status) ? 'pause' : 'play'} size={14} /></Button>
      </div>
    ) }] : []),
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Ads']} titlePlain="Ad" titleEm="campaigns"
        subtitle="Spend and results from Google Ads and Meta, next to the leads Pulse saw arrive from them. New ads are made in each platform's own tools."
        actions={<Select value={days} onValueChange={setDays}><SelectTrigger aria-label="Period" className="pulse-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem></SelectContent></Select>} />
      <p className="pulse-note">“Leads in Pulse” counts website forms sent from links whose <strong>utm_campaign</strong> equals the ad campaign’s name. Tag your ad links with the link builder so this works.</p>
      <SectionCard title="Campaigns" padded={false} collapsible={false}>
        <DataTable columns={columns} rows={d.campaigns} empty={!d.campaigns.length} emptyIcon="barChart"
          emptyTitle={d.accounts.length ? 'No campaigns in these accounts' : 'No ad accounts connected'}
          emptyMessage={d.accounts.length ? 'Campaigns appear here after the next sync.' : 'Connect Google Ads or Meta below.'} />
      </SectionCard>
      <div className="pulse-split">
        <SectionCard title="Matched audiences" collapsible={false}>
          <div className="pulse-form">
            <p className="pulse-muted">Show ads to people already in a Pulse audience. Only people who opted in to marketing are shared, and their email and phone are hashed (SHA-256) before leaving Hudumika.</p>
            {canEdit && d.accounts.length > 0 && (
              <div className="pulse-ab-grid">
                <div className="pulse-field"><Label htmlFor="aud-acc">Ad account</Label>
                  <Select value={push.account} onValueChange={(v) => setPush({ ...push, account: v })}><SelectTrigger id="aud-acc"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>{d.accounts.filter((a) => a.status === 'connected').map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="pulse-field"><Label htmlFor="aud-seg">Pulse audience</Label>
                  <Select value={push.segment} onValueChange={(v) => setPush({ ...push, segment: v })}><SelectTrigger id="aud-seg"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>{segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
            )}
            {canEdit && d.accounts.length > 0 && <div><Button variant="outline" disabled={!push.account || !push.segment || busy === 'push'} onClick={() => run('push', () => apiFetch('/v1/pulse/ads/audiences', { method: 'POST', body: JSON.stringify({ account_id: push.account, segment_id: push.segment }) }), 'Audience sent. Platforms take a few hours to match it.')}>Send audience</Button></div>}
            {d.audiences.length > 0 && (
              <ul className="pulse-links">{d.audiences.map((a) => (
                <li key={a.id}><span>{a.segment_name ?? a.name}<span className="pulse-muted"> · {d.accounts.find((x) => x.id === a.account_id)?.name}</span></span>
                  <span>{a.status === 'failed' ? <Badge variant="error">{a.last_error ?? 'Failed'}</Badge> : <span className="pulse-muted">{fmtNum(a.uploaded)} sent {a.synced_at ? fmtWhen(a.synced_at) : ''}</span>}</span></li>
              ))}</ul>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Ad accounts" collapsible={false}>
          <div className="pulse-form">
            {d.accounts.length > 0 && (
              <ul className="pulse-links">{d.accounts.map((a) => (
                <li key={a.id}>
                  <span><span className="pulse-strong">{a.name}</span><span className="pulse-muted"> · {a.network === 'google' ? 'Google Ads' : 'Meta'}{a.synced_at ? ` · updated ${fmtWhen(a.synced_at)}` : ''}</span>
                    {a.last_error && <span className="pulse-note pulse-note-warn">{a.last_error}</span>}</span>
                  <span className="pulse-inline">
                    <Button variant="ghost" size="icon" aria-label={`Refresh ${a.name}`} disabled={busy === a.id} onClick={() => run(a.id, () => apiFetch(`/v1/pulse/ads/accounts/${a.id}/sync`, { method: 'POST' }))}><Icon name="refresh" size={14} /></Button>
                    {canEdit && <Button variant="ghost" size="icon" aria-label={`Disconnect ${a.name}`} onClick={async () => {
                      if (await showConfirm(`Disconnect ${a.name}? Its numbers stay, but Pulse stops updating them.`, { title: 'Disconnect', variant: 'danger', confirmLabel: 'Disconnect' })) run(a.id, () => apiFetch(`/v1/pulse/ads/accounts/${a.id}`, { method: 'DELETE' }));
                    }}><Icon name="x" size={14} /></Button>}
                  </span>
                </li>
              ))}</ul>
            )}
            {(['google', 'meta'] as const).map((n) => (
              <div key={n} className="pulse-provider">
                <div><div className="pulse-strong">{PLATFORM[n]}</div>
                  <div className="pulse-muted">{d.available[n] ? 'Connect the ad accounts you manage.' : n === 'google' ? 'Not available yet — the Hudumika team needs a Google Ads developer token (Google reviews these, usually over several weeks).' : 'Not available yet — the Hudumika team needs Meta to approve its app for ads access.'}</div></div>
                {canEdit && <Button variant="outline" size="sm" disabled={!d.available[n]} onClick={() => connect(n)}>Connect</Button>}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function PulseAdsCallback() {
  const { network } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState('Finishing the connection…');
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const code = params.get('code'), state = params.get('state'), denied = params.get('error_description') || params.get('error');
    if (denied || !code || !state) { setMsg(denied ? `The connection wasn’t approved: ${denied}` : 'The connection came back incomplete.'); return; }
    apiFetch(`/v1/pulse/ads/callback/${network}`, { method: 'POST', body: JSON.stringify({ code, state }) })
      .then((r: any) => { showAlert(`Connected: ${r.data.connected.join(', ')}`, { variant: 'success' }); navigate('/pulse/ads', { replace: true }); })
      .catch((e) => setMsg(apiError(e)));
  }, [network, params, navigate]);
  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', { label: 'Ads', to: '/pulse/ads' }, 'Connect']} title="Connecting ad account" />
      <p className="pulse-note" role="status">{msg}</p>
      <div><Button variant="outline" onClick={() => navigate('/pulse/ads')}>Back to Ads</Button></div>
    </div>
  );
}
