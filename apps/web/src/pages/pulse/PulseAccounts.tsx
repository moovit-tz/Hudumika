import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiError, fmtNum, fmtWhen } from './pulseShared.js';

interface Detail { opens: number; clicks: number; forms: number; open_deals: number; people: number }
interface Account {
  id: string; customer_id: string; tier: number; owner_id: string | null; score: number; score_detail: Detail; scored_at: string | null; hot: boolean; notes: string | null;
  name: string; logo_url: string | null; city: string | null; country: string | null; owner_name: string | null; owner_avatar: string | null;
}

function ScoreCell({ a }: { a: Pick<Account, 'score' | 'hot'> }) {
  return (
    <span className="pulse-score">
      <span className="pulse-score-bar" aria-hidden="true"><span style={{ width: `${a.score}%` }} data-hot={a.hot || undefined} /></span>
      <strong>{a.score}</strong>{a.hot && <Badge variant="success">Hot</Badge>}
    </span>
  );
}
const why = (d: Detail | undefined) => d ? [d.opens && `${d.opens} opens`, d.clicks && `${d.clicks} clicks`, d.forms && `${d.forms} forms`, d.open_deals && `${d.open_deals} open deals`].filter(Boolean).join(' · ') || 'No activity in 30 days' : '—';

export function PulseAccounts() {
  usePageSEO('Target accounts', 'Companies marketing and sales are going after together, scored by real engagement.');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Account[] | null>(null);
  const [candidates, setCandidates] = useState<{ value: string; label: string }[]>([]);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [pick, setPick] = useState('');
  const [tier, setTier] = useState('2');
  const [owner, setOwner] = useState('');
  const load = useCallback(() => apiFetch('/v1/pulse/accounts').then((r: any) => setRows(r.data)).catch((e) => { showAlert(apiError(e), { variant: 'error' }); setRows([]); }), []);
  const loadCandidates = useCallback(() => apiFetch('/v1/pulse/accounts/candidates').then((r: any) => setCandidates(r.data.map((c: any) => ({ value: c.id, label: c.name })))).catch(() => {}), []);
  useEffect(() => { load(); loadCandidates(); apiFetch('/v1/hr/staff?search=').then((r: any[]) => setUsers((r || []).map((u) => ({ value: u.id, label: u.name })))).catch(() => {}); }, [load, loadCandidates]);

  async function add() {
    try {
      await apiFetch('/v1/pulse/accounts', { method: 'POST', body: JSON.stringify({ customer_ids: [pick], tier: Number(tier), owner_id: owner || null }) });
      setPick(''); load(); loadCandidates();
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  const columns: TableColumn<Account>[] = [
    { key: 'name', header: 'Company', sortable: true, sortValue: (a) => a.name, render: (a) => (
      <div className="pulse-person"><CompanyAvatar id={a.customer_id} kind="customers" name={a.name} logoUrl={a.logo_url} size={28} />
        <div><div className="pulse-strong">{a.name}</div><div className="pulse-muted">{[a.city, a.country].filter(Boolean).join(', ')}</div></div></div>
    ) },
    { key: 'tier', header: 'Tier', sortable: true, sortValue: (a) => a.tier, render: (a) => `Tier ${a.tier}` },
    { key: 'score', header: 'Engagement', sortable: true, sortValue: (a) => a.score, render: (a) => <div><ScoreCell a={a} /><div className="pulse-muted">{why(a.score_detail)}</div></div> },
    { key: 'owner', header: 'Owner', hideAt: 'sm', render: (a) => a.owner_name ? <span className="pulse-person"><PersonAvatar userId={a.owner_id} name={a.owner_name} src={a.owner_avatar} size={24} />{a.owner_name}</span> : '—' },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Target accounts']} titlePlain="Target" titleEm="accounts"
        subtitle="The companies you’re going after. Each is scored hourly from what its people did in the last 30 days, and the owner hears when one warms up."
        actions={<Button variant="outline" onClick={async () => { await apiFetch('/v1/pulse/accounts/rescore', { method: 'POST' }).catch(() => {}); load(); }}><Icon name="refresh" size={14} /> Rescore now</Button>} />
      <div className="pulse-split">
        <SectionCard title="Accounts" padded={false} collapsible={false}>
          <DataTable columns={columns} rows={rows ?? []} loading={!rows} empty={!!rows && rows.length === 0} emptyIcon="target" emptyTitle="No target accounts yet"
            emptyMessage="Add the companies you most want to win. Their contacts and leads are picked up automatically."
            onRowClick={(a) => navigate(`/pulse/accounts/${a.id}`)} defaultSortKey="score" defaultSortDir="desc" />
        </SectionCard>
        <SectionCard title="Add a company" collapsible={false}>
          <div className="pulse-form">
            <div className="pulse-field"><Label>Company</Label><Combobox aria-label="Company to target" options={candidates} value={pick} onChange={setPick} placeholder={candidates.length ? 'Choose a customer' : 'No more customers to add'} /></div>
            <div className="pulse-ab-grid">
              <div className="pulse-field"><Label htmlFor="acc-tier">Tier</Label>
                <Select value={tier} onValueChange={setTier}><SelectTrigger id="acc-tier"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Tier 1 — top priority</SelectItem><SelectItem value="2">Tier 2</SelectItem><SelectItem value="3">Tier 3</SelectItem></SelectContent></Select></div>
              <div className="pulse-field"><Label>Owner</Label><Combobox aria-label="Account owner" options={users} value={owner} onChange={setOwner} placeholder="You" /></div>
            </div>
            <Button disabled={!pick} onClick={add}><Icon name="plus" size={14} /> Add account</Button>
            <span className="pulse-muted">Tip: build an audience with “Company is a target account” to email or SMS the people at these companies.</span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function PulseAccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [a, setA] = useState<(Account & { contacts: any[]; leads: any[]; activity: any[]; deals: any[] }) | null>(null);
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  usePageSEO(a?.name ?? 'Account', 'One target account: its people, what they did, and its deals.');
  const load = useCallback(() => apiFetch(`/v1/pulse/accounts/${id}`).then((r: any) => { setA(r.data); setNotes(r.data.notes ?? ''); }).catch((e) => showAlert(apiError(e), { variant: 'error' })), [id]);
  useEffect(() => { load(); apiFetch('/v1/hr/staff?search=').then((r: any[]) => setUsers((r || []).map((u) => ({ value: u.id, label: u.name })))).catch(() => {}); }, [load]);
  const patch = (body: Record<string, unknown>) => apiFetch(`/v1/pulse/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(load).catch((e) => showAlert(apiError(e), { variant: 'error' }));

  if (!a) return <SectionLoading />;
  const people = [
    ...a.contacts.map((c) => ({ id: c.id, kind: 'contacts' as const, name: c.name, email: c.email, sub: c.job_title || 'Contact', avatar: c.avatar_url })),
    ...a.leads.map((l) => ({ id: l.id, kind: 'leads' as const, name: l.name || l.email || 'Lead', email: l.email, sub: `Lead · ${l.stage}`, avatar: null })),
  ];
  type P = typeof people[number];
  const peopleCols: TableColumn<P>[] = [
    { key: 'name', header: 'Person', render: (p) => <div className="pulse-person"><PersonAvatar userId={p.id} kind={p.kind} name={p.name} src={p.avatar} size={28} /><div><div className="pulse-strong">{p.name}</div><div className="pulse-muted">{p.sub}</div></div></div> },
    { key: 'email', header: 'Email', hideAt: 'sm', render: (p) => p.email || '—' },
  ];
  type Act = { id: string; recipient_name: string | null; address: string; sent_at: string; opened_at: string | null; clicked_at: string | null; campaign_id: string; campaign_name: string; journey_id: string | null };
  const actCols: TableColumn<Act>[] = [
    { key: 'who', header: 'Who', render: (x) => x.recipient_name || x.address },
    { key: 'what', header: 'Message', render: (x) => <Link to={`/pulse/campaigns/${x.campaign_id}`}>{x.campaign_name}</Link> },
    { key: 'did', header: 'Did', render: (x) => x.clicked_at ? <Badge variant="success">Clicked</Badge> : x.opened_at ? <Badge variant="info">Opened</Badge> : <span className="pulse-muted">Sent</span> },
    { key: 'when', header: 'Sent', hideAt: 'sm', render: (x) => fmtWhen(x.sent_at) },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', { label: 'Target accounts', to: '/pulse/accounts' }, a.name]} title={a.name}
        subtitle={`Engagement ${a.score}/100 · ${why(a.score_detail)}`}
        actions={<Button variant="outline" onClick={async () => {
          if (!(await showConfirm(`Stop targeting ${a.name}? Its people and history stay in Contacts and CRM.`, { title: 'Remove account', variant: 'danger', confirmLabel: 'Remove' }))) return;
          await apiFetch(`/v1/pulse/accounts/${id}`, { method: 'DELETE' }).then(() => navigate('/pulse/accounts')).catch((e) => showAlert(apiError(e), { variant: 'error' }));
        }}><Icon name="trash" size={14} /> Remove</Button>} />
      <div className="pulse-kpis">
        <div className="pulse-kpi"><span>Engagement</span><strong>{a.score}</strong><small>{a.hot ? 'Hot — reach out' : 'out of 100'}</small></div>
        <div className="pulse-kpi"><span>People</span><strong>{fmtNum(people.length)}</strong><small>contacts and leads</small></div>
        <div className="pulse-kpi"><span>Opens · clicks</span><strong>{fmtNum(a.score_detail?.opens)} · {fmtNum(a.score_detail?.clicks)}</strong><small>last 30 days</small></div>
        <div className="pulse-kpi"><span>Open deals</span><strong>{fmtNum(a.score_detail?.open_deals)}</strong><small>{a.scored_at ? `scored ${fmtWhen(a.scored_at)}` : ''}</small></div>
      </div>
      <div className="pulse-split">
        <div className="pulse-stack">
          <SectionCard title="People" padded={false} collapsible={false}>
            <DataTable columns={peopleCols} rows={people} empty={!people.length} emptyIcon="users" emptyTitle="Nobody linked yet"
              emptyMessage="Link contacts to this company in Contacts, or create leads with the same company name." />
          </SectionCard>
          <SectionCard title="Recent marketing" padded={false} collapsible={false}>
            <DataTable columns={actCols} rows={a.activity} empty={!a.activity.length} emptyIcon="send" emptyTitle="No Pulse messages to these people yet" />
          </SectionCard>
        </div>
        <div className="pulse-stack">
          <SectionCard title="Plan" collapsible={false}>
            <div className="pulse-form">
              <div className="pulse-field"><Label htmlFor="ad-tier">Tier</Label>
                <Select value={String(a.tier)} onValueChange={(v) => patch({ tier: Number(v) })}><SelectTrigger id="ad-tier"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Tier 1 — top priority</SelectItem><SelectItem value="2">Tier 2</SelectItem><SelectItem value="3">Tier 3</SelectItem></SelectContent></Select></div>
              <div className="pulse-field"><Label>Owner</Label><Combobox aria-label="Account owner" options={users} value={a.owner_id ?? ''} onChange={(v) => patch({ owner_id: v || null })} placeholder="No owner" /></div>
              <div className="pulse-field"><Label htmlFor="ad-notes">Notes</Label><Textarea id="ad-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (a.notes ?? '') && patch({ notes: notes || null })} maxLength={2000} /></div>
            </div>
          </SectionCard>
          <SectionCard title="Deals" collapsible={false}>
            {a.deals.length === 0 ? <p className="pulse-muted">No deals with this company yet.</p> : (
              <ul className="pulse-links">{a.deals.map((d) => <li key={d.id}><span>{d.name}<span className="pulse-muted"> · {d.stage}</span></span><strong>{Number(d.value || 0).toLocaleString()}</strong></li>)}</ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
