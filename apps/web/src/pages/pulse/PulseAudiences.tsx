import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { SOURCE_LABEL, fieldOf, opOf } from './pulseFields.js';
import { apiError, fmtNum, type Member, type Segment } from './pulseShared.js';

export function PulseAudiences() {
  usePageSEO('Audiences', 'Saved Pulse audiences built from contacts, CRM leads and customers.');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/pulse/segments').then((r: any) => { setRows(r.data); setError(undefined); })
      .catch((e) => setError(apiError(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const columns: TableColumn<Segment>[] = [
    { key: 'name', header: 'Audience', sortable: true, sortValue: (r) => r.name, render: (r) => (
      <div><div className="pulse-strong">{r.name}</div>{r.description && <div className="pulse-muted">{r.description}</div>}</div>
    ) },
    { key: 'source', header: 'From', render: (r) => <Badge variant="gray">{SOURCE_LABEL[r.source]}</Badge>, hideAt: 'sm' },
    { key: 'total', header: 'People', align: 'right', sortable: true, sortValue: (r) => r.stats?.total ?? -1, render: (r) => r.stats ? fmtNum(r.stats.total) : '—' },
    { key: 'email', header: 'Reachable by email', align: 'right', hideAt: 'md', render: (r) => r.stats ? fmtNum(Math.max(r.stats.with_email - r.stats.email_suppressed, 0)) : '—' },
    { key: 'phone', header: 'With phone', align: 'right', hideAt: 'md', render: (r) => r.stats ? fmtNum(r.stats.with_phone) : '—' },
  ];

  return (
    <div className="pulse-page">
      <PageHeader
        crumbs={['Pulse', 'Audiences']} titlePlain="Your" titleEm="audiences"
        subtitle="Live groups of people from Contacts, CRM leads or Customers. Membership is worked out fresh every time you send."
        actions={<Button onClick={() => navigate('/pulse/audiences/new')}><Icon name="plus" size={14} /> New audience</Button>}
      />
      <SectionCard title="Audiences" padded={false} collapsible={false}>
        <DataTable
          columns={columns} rows={rows} loading={loading} error={error} onRetry={load}
          empty={!loading && rows.length === 0} emptyIcon="users" emptyTitle="No audiences yet"
          emptyMessage="Build one from your contacts, leads or customers to send your first campaign."
          emptyAction={{ label: 'New audience', onClick: () => navigate('/pulse/audiences/new') }}
          onRowClick={(r) => navigate(`/pulse/audiences/${r.id}`)}
        />
      </SectionCard>
    </div>
  );
}

function ruleText(seg: Segment, r: { field: string; op: string; value?: unknown }) {
  const f = fieldOf(seg.source, r.field);
  const o = opOf(seg.source, r.field, r.op);
  if (!f || !o) return `${r.field} ${r.op}`;
  const v = o.value === 'none' ? '' : ['user', 'label', 'territory', 'campaign'].includes(o.value) ? ' (selected)' : ` ${String(r.value ?? '')}`;
  return `${f.label} ${o.label.replace('…', String(r.value ?? '…'))}${o.label.includes('…') ? '' : v}`;
}

export function PulseAudienceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [seg, setSeg] = useState<Segment | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  usePageSEO(seg?.name ?? 'Audience', 'Who is in this Pulse audience right now.');

  useEffect(() => {
    apiFetch(`/v1/pulse/segments/${id}`).then((r: any) => setSeg(r.data)).catch((e) => showAlert(apiError(e), { variant: 'error' }));
  }, [id]);
  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => {
      apiFetch(`/v1/pulse/segments/${id}/members?limit=50&offset=${page * 50}&q=${encodeURIComponent(q)}`)
        .then((r: any) => setMembers(r.data)).catch(() => setMembers([])).finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [id, q, page]);

  async function remove() {
    if (!seg) return;
    const ok = await showConfirm(`Delete the audience "${seg.name}"? Campaigns already sent keep their records.`, { title: 'Delete audience', variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    try { await apiFetch(`/v1/pulse/segments/${id}`, { method: 'DELETE' }); navigate('/pulse/audiences'); }
    catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  async function exportCsv() {
    try { await apiDownload(`/v1/pulse/segments/${id}/export.csv`, `${seg?.name ?? 'audience'}.csv`); }
    catch (e) { showAlert(apiError(e), { variant: 'error' }); }
  }

  if (!seg) return <SectionLoading />;
  const columns: TableColumn<Member>[] = [
    { key: 'name', header: 'Name', render: (m) => (
      <div className="pulse-person">
        {m.kind === 'company'
          ? <CompanyAvatar id={m.id} kind="customers" name={m.name} logoUrl={m.avatar_url} size={28} />
          : <PersonAvatar userId={m.id} kind={seg.source === 'leads' ? 'leads' : 'contacts'} name={m.name} src={m.avatar_url} size={28} />}
        <span className="pulse-strong">{m.name}</span>
      </div>
    ) },
    { key: 'email', header: 'Email', render: (m) => m.email || <span className="pulse-muted">—</span> },
    { key: 'phone', header: 'Phone', hideAt: 'sm', render: (m) => m.phone || <span className="pulse-muted">—</span> },
  ];
  const total = seg.stats?.total ?? 0;

  return (
    <div className="pulse-page">
      <PageHeader
        crumbs={['Pulse', { label: 'Audiences', to: '/pulse/audiences' }, seg.name]} title={seg.name}
        subtitle={`${SOURCE_LABEL[seg.source]} matching ${seg.match_type === 'all' ? 'all' : 'any'} of: ${seg.rules.map((r) => ruleText(seg, r)).join(' · ')}`}
        actions={<>
          <Button variant="outline" onClick={exportCsv}><Icon name="download" size={14} /> Export CSV</Button>
          <Button variant="outline" onClick={() => navigate(`/pulse/audiences/${id}/edit`)}><Icon name="edit" size={14} /> Edit</Button>
          <Button variant="outline" onClick={remove}><Icon name="trash" size={14} /> Delete</Button>
          <Button onClick={() => navigate(`/pulse/campaigns/new?segment=${id}`)}><Icon name="send" size={14} /> New campaign</Button>
        </>}
      />
      <div className="pulse-kpis">
        <div className="pulse-kpi"><span>People</span><strong>{fmtNum(total)}</strong></div>
        <div className="pulse-kpi"><span>Reachable by email</span><strong>{fmtNum(Math.max((seg.stats?.with_email ?? 0) - (seg.stats?.email_suppressed ?? 0), 0))}</strong></div>
        <div className="pulse-kpi"><span>Opted out of email</span><strong>{fmtNum(seg.stats?.email_suppressed)}</strong></div>
        <div className="pulse-kpi"><span>With phone</span><strong>{fmtNum(seg.stats?.with_phone)}</strong></div>
      </div>
      <SectionCard title="Members" padded={false} collapsible={false}
        action={<Input aria-label="Search members" className="pulse-search" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />}>
        <DataTable columns={columns} rows={members} loading={loading}
          empty={!loading && members.length === 0 && !q} emptyIcon="users" emptyTitle="Nobody matches yet"
          emptyMessage="Nobody currently answers these rules. Edit the audience or add people in the source app."
          filteredEmpty={!loading && members.length === 0 && !!q} />
        {(page > 0 || members.length === 50) && (
          <div className="pulse-pager">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="pulse-muted">Page {page + 1}</span>
            <Button variant="outline" size="sm" disabled={members.length < 50} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
