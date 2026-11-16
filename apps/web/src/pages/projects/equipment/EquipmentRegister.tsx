import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader.js';
import { SectionCard } from '../../../components/SectionCard.js';
import { PersonAvatar } from '../../../components/PersonAvatar.js';
import { Icon } from '../../../components/Icon.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { Badge } from '../../../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../../components/ui/DataTable.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../../components/ui/date-picker.js';
import { apiFetch, apiDownload } from '../../../lib/api.js';
import { showAlert } from '../../../lib/alert.js';
import { usePageSEO } from '../../../hooks/usePageSEO.js';
import {
  type Asset, type Booking, type Powers, ASSET_TYPES, TYPE_LABEL, OWNERSHIP_LABEL, AvailabilityBadge, BookingBadge,
  fmtDate, fmtNum, errText, meterText, todayIso,
} from './equipmentShared.js';
import { BookingActions } from './BookingActions.js';

/**
 * Tenant-wide equipment register. One primary action (Add asset, equipment
 * managers only); import/export live in the overflow menu. The tab is kept in
 * the URL so Back returns to the same list.
 */

type Tab = 'register' | 'bookings' | 'due' | 'utilisation';
const ALL = '__all';

export function EquipmentRegister() {
  usePageSEO('Equipment register', 'Plant, vehicles and tools: availability, bookings, inspections and service.');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'register';
  const setTab = (t: Tab) => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  const [powers, setPowers] = useState<Powers>({ manage: false, seeCost: false });
  useEffect(() => { apiFetch('/v1/project-equipment/powers').then(setPowers).catch(() => undefined); }, []);

  async function exportCsv() {
    // The server decides the columns: cost rates only for those allowed to see them.
    try { await apiDownload(`/v1/project-equipment/assets/export?${params.toString()}`, `equipment-register-${todayIso()}.csv`); }
    catch (e) { showAlert(errText(e), { variant: 'error' }); }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={[{ label: 'Projects', to: '/projects' }, 'Equipment']} titlePlain="Equipment" titleEm="register"
        subtitle="Every asset once: where it is, who holds it, whether it can be booked, and what is due."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {powers.manage && <Button onClick={() => navigate('/projects/equipment/new')}><Icon name="plus" size={14} /> Add asset</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More register actions"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCsv}><Icon name="download" size={14} /> Export CSV</DropdownMenuItem>
                {powers.manage && <DropdownMenuItem onClick={() => navigate('/projects/equipment/import')}><Icon name="upload" size={14} /> Import CSV</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        } />
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="due">Due & overdue</TabsTrigger>
          <TabsTrigger value="utilisation">Utilisation</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'register' && <RegisterList powers={powers} />}
      {tab === 'bookings' && <BookingsList />}
      {tab === 'due' && <DueList />}
      {tab === 'utilisation' && <Utilisation />}
    </div>
  );
}

function RegisterList({ powers }: { powers: Powers }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const filter = (k: string) => params.get(k) ?? ALL;
  const setFilter = (k: string, v: string) => setParams(p => { const n = new URLSearchParams(p); if (!v || v === ALL) n.delete(k); else n.set(k, v); n.delete('page'); return n; }, { replace: true });
  const page = Number(params.get('page') ?? 1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<{ rows: Asset[]; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { if (search !== q) setFilter('q', search.trim()); }, 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    setError('');
    const qs = new URLSearchParams();
    for (const k of ['q', 'type', 'availability', 'ownership', 'site', 'sort', 'dir']) { const v = params.get(k); if (v) qs.set(k, v); }
    qs.set('page', String(page)); qs.set('pageSize', String(pageSize));
    apiFetch(`/v1/project-equipment/assets?${qs}`).then((r: any) => setData({ rows: r.data, total: r.total })).catch(e => { setError(errText(e)); setData({ rows: [], total: 0 }); });
  }, [params, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  const filtered = ['q', 'type', 'availability', 'ownership'].some(k => params.get(k));
  const columns: TableColumn<Asset>[] = useMemo(() => [
    { key: 'name', header: 'Asset', render: a => (
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 max-w-[22rem] font-medium" title={a.name}>{a.name}</span>
        <span className="text-xs" style={{ color: 'var(--ink3)' }}>{a.code}{a.make_model ? ` · ${a.make_model}` : ''}</span>
      </span>) },
    { key: 'type', header: 'Type', hideAt: 'sm', render: a => <span className="flex flex-col"><span>{TYPE_LABEL[a.resource_type] ?? a.resource_type}</span>{a.ownership !== 'OWNED' && <span className="text-xs" style={{ color: 'var(--ink3)' }}>{OWNERSHIP_LABEL[a.ownership]}{a.vendor_name ? ` from ${a.vendor_name}` : ''}</span>}</span> },
    { key: 'where', header: 'Location', hideAt: 'md', render: a => a.issued_to ? <span className="flex max-w-[14rem] flex-col"><span className="line-clamp-2" title={a.issued_to.project_name}>{a.issued_to.project_name}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>due back {fmtDate(a.issued_to.end_date)}</span></span> : (a.current_location ?? '—') },
    { key: 'custodian', header: 'Custodian', hideAt: 'md', render: a => a.custodian_id ? <span className="inline-flex items-center gap-2"><PersonAvatar userId={a.custodian_id} name={a.custodian_name ?? ''} src={a.custodian_avatar_url} size={22} /><span className="truncate">{a.custodian_name}</span></span> : <span style={{ color: 'var(--ink3)' }}>—</span> },
    { key: 'meter', header: 'Meter', align: 'right', hideAt: 'md', render: a => <span className="tabular-nums">{meterText(a)}</span> },
    { key: 'due', header: 'Next due', hideAt: 'sm', render: a => {
      const next = [a.next_inspection_due && { what: 'Inspection', d: a.next_inspection_due }, a.next_service_due && { what: 'Service', d: a.next_service_due }].filter(Boolean).sort((x: any, y: any) => x.d.localeCompare(y.d))[0] as { what: string; d: string } | undefined;
      if (!next) return <span style={{ color: 'var(--ink3)' }}>—</span>;
      return <span className="flex flex-col"><span style={{ color: next.d < todayIso() ? 'var(--red)' : undefined }}>{fmtDate(next.d)}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{next.what}</span></span>;
    } },
    { key: 'availability', header: 'Availability', render: a => (
      <span className="flex flex-col items-start gap-1"><AvailabilityBadge asset={a} />
        {a.eligibility && !a.eligibility.ok && !a.issued_to && <span className="line-clamp-2 max-w-[12rem] text-xs" title={a.eligibility.reasons.join("; ")} style={{ color: 'var(--ink3)' }}>{a.eligibility.reasons[0]}</span>}</span>) },
  ], []);

  return (
    <SectionCard title="Assets" padded={false} collapsible={false}
      action={<span className="text-sm tabular-nums" style={{ color: 'var(--ink3)' }}>{data ? `${data.total.toLocaleString()} ${data.total === 1 ? 'asset' : 'assets'}` : ''}</span>}>
      <div className="grid grid-cols-2 items-center gap-2 p-3 sm:flex sm:flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="col-span-2 min-w-0 sm:flex-1 sm:basis-56">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, code, serial or plate" aria-label="Search the register" className="w-full" />
        </div>
        <Select value={filter('type')} onValueChange={v => setFilter('type', v)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Asset type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All types</SelectItem>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filter('availability')} onValueChange={v => setFilter('availability', v)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Availability"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any availability</SelectItem><SelectItem value="available">Available now</SelectItem>
            <SelectItem value="issued">On site</SelectItem><SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter('ownership')} onValueChange={v => setFilter('ownership', v)}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Ownership"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Owned & hired</SelectItem>{Object.entries(OWNERSHIP_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={`${params.get('sort') ?? 'name'}:${params.get('dir') ?? 'asc'}`} onValueChange={v => { const [s, d] = v.split(':'); setParams(p => { const n = new URLSearchParams(p); n.set('sort', s); n.set('dir', d); return n; }, { replace: true }); }}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Sort by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name:asc">Name A–Z</SelectItem><SelectItem value="code:asc">Code</SelectItem>
            <SelectItem value="next_inspection_due:asc">Inspection due soonest</SelectItem><SelectItem value="next_service_due:asc">Service due soonest</SelectItem>
            <SelectItem value="updated_at:desc">Recently changed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} rows={data?.rows ?? []} loading={!data} error={error || undefined} onRetry={load}
        empty={!!data && !data.rows.length && !filtered} filteredEmpty={!!data && !data.rows.length && filtered}
        emptyIcon="tool" emptyTitle="No assets registered yet"
        emptyMessage={powers.manage ? 'Add plant, vehicles and tools one at a time, or import a CSV.' : 'An equipment manager adds assets here.'}
        emptyAction={powers.manage ? { label: 'Add asset', onClick: () => navigate('/projects/equipment/new') } : undefined}
        filteredEmptyMessage="No assets match these filters."
        onRowClick={a => navigate(`/projects/equipment/${a.id}`)}
        serverPagination={{ page, pageSize, total: data?.total ?? 0, onPageChange: p => setParams(x => { const n = new URLSearchParams(x); n.set('page', String(p)); return n; }, { replace: true }), onPageSizeChange: setPageSize }} />
    </SectionCard>
  );
}

const VIEW_LABEL = { requests: 'Requests', reserved: 'Reserved', issued: 'On site', overdue: 'Overdue', history: 'History' } as const;

export function BookingsList({ projectId, refreshKey }: { projectId?: string; refreshKey?: number }) {
  const navigate = useNavigate();
  const [view, setView] = useState<keyof typeof VIEW_LABEL | 'all'>(projectId ? 'all' : 'requests');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<{ rows: Booking[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    const qs = new URLSearchParams({ view, page: String(page), pageSize: String(pageSize) });
    if (projectId) qs.set('project_id', projectId);
    apiFetch(`/v1/project-equipment/allocations?${qs}`).then((r: any) => setData({ rows: r.data, total: r.total })).catch(e => { setError(errText(e)); setData({ rows: [], total: 0 }); });
  }, [view, page, pageSize, projectId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const columns: TableColumn<Booking>[] = [
    { key: 'asset', header: 'Asset', render: b => <span className="flex min-w-0 max-w-[16rem] flex-col"><span className="line-clamp-2 font-medium" title={b.resource_name ?? undefined}>{b.resource_name}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{b.resource_code}</span></span> },
    ...(projectId ? [] : [{ key: 'project', header: 'Project', hideAt: 'sm' as const, render: (b: Booking) => <span className="line-clamp-2 max-w-[18rem]" title={b.project_name ?? undefined}>{b.project_name}</span> }]),
    { key: 'dates', header: 'Dates', render: b => <span className="whitespace-nowrap tabular-nums">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</span> },
    { key: 'by', header: 'Requested by', hideAt: 'md', render: b => b.requested_by_name ?? '—' },
    { key: 'status', header: 'Status', render: b => <BookingBadge booking={b} /> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', render: b => <BookingActions booking={b} onDone={load} /> },
  ];
  return (
    <SectionCard title={projectId ? 'Equipment bookings' : 'Bookings'} padded={false} collapsible={false}>
      <div className="flex flex-wrap gap-2 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <Tabs value={view} onValueChange={v => { setView(v as any); setPage(1); }}>
          <TabsList>
            {projectId && <TabsTrigger value="all">All</TabsTrigger>}
            {Object.entries(VIEW_LABEL).map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
      <DataTable columns={columns} rows={data?.rows ?? []} loading={!data} error={error || undefined} onRetry={load}
        empty={!!data && !data.rows.length} emptyIcon="calendar" emptyTitle={view === 'requests' ? 'No requests waiting' : 'Nothing here'}
        onRowClick={b => navigate(`/projects/equipment/${b.resource_id}`)}
        serverPagination={{ page, pageSize, total: data?.total ?? 0, onPageChange: setPage, onPageSizeChange: setPageSize }} />
    </SectionCard>
  );
}

function DueList() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const load = useCallback(() => { apiFetch('/v1/project-equipment/due').then(setData).catch(e => showAlert(errText(e), { variant: 'error' })); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <SectionCard title="Due & overdue" collapsible={false}><DataTable columns={[]} rows={[]} loading /></SectionCard>;
  const row = (key: string, title: string, rows: any[], render: (r: any) => React.ReactNode) => (
    <SectionCard key={key} title={`${title} (${rows.length})`} padded={false} collapsible={false}>
      <DataTable columns={[
        { key: 'asset', header: 'Asset', render: (r: any) => <span className="flex flex-col"><span className="font-medium">{r.name ?? r.resource_name}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{r.code ?? r.resource_code}</span></span> },
        { key: 'what', header: 'What', render },
      ]} rows={rows.map((r, i) => ({ ...r, _k: `${r.id}-${i}` }))} idKey={'_k' as any} empty={!rows.length} emptyIcon="checkCircle" emptyTitle="Nothing due"
        onRowClick={(r: any) => navigate(`/projects/equipment/${r.resource_id ?? r.id}`)} compact />
    </SectionCard>
  );
  const when = (d: string, overdue: boolean) => <span style={{ color: overdue ? 'var(--red)' : undefined }}>{overdue ? 'Overdue since' : 'Due'} {fmtDate(d)}</span>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {row('ret', 'Overdue returns', data.overdue_returns, r => <span>{r.project_name}: due back {fmtDate(r.end_date)}</span>)}
      {row('req', 'Requests waiting', data.requests, r => <span>{r.project_name}: {fmtDate(r.start_date)} – {fmtDate(r.end_date)}</span>)}
      {row('ins', 'Inspections', data.inspections, r => when(r.due, r.overdue))}
      {row('svc', 'Service', data.services, r => r.due ? when(r.due, r.overdue) : <span style={{ color: 'var(--red)' }}>Meter past {fmtNum(r.next_service_meter)}</span>)}
      {row('crt', 'Certificates', data.certificates, r => <span>{r.certificate_type}: {when(r.expires_on, r.overdue)}</span>)}
    </div>
  );
}

function Utilisation() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(todayIso());
  const [data, setData] = useState<any>(null);
  useEffect(() => { setData(null); apiFetch(`/v1/project-equipment/reports/utilisation?from=${from}&to=${to}`).then(setData).catch(e => showAlert(errText(e), { variant: 'error' })); }, [from, to]);
  const cost = !!data?.powers?.seeCost;
  const columns: TableColumn<any>[] = [
    { key: 'name', header: 'Asset', render: r => <span className="flex flex-col"><span className="font-medium">{r.name}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{r.code}</span></span>, sortable: true, sortValue: r => r.name },
    { key: 'used', header: 'Days on site', align: 'right', render: r => <span className="tabular-nums">{r.used_days} / {data.days}</span>, sortable: true, sortValue: r => r.used_days },
    { key: 'pct', header: 'Utilisation', align: 'right', render: r => <span className="tabular-nums">{r.utilisation_pct}%</span>, sortable: true, sortValue: r => r.utilisation_pct },
    { key: 'down', header: 'Downtime (h)', align: 'right', hideAt: 'sm', render: r => <span className="tabular-nums">{fmtNum(r.downtime_hours)}</span> },
    ...(cost ? [
      { key: 'hire', header: 'Hire cost', align: 'right' as const, hideAt: 'md' as const, render: (r: any) => <span className="tabular-nums">{r.hire_cost == null ? '—' : `${r.currency} ${fmtNum(r.hire_cost)}`}</span> },
      { key: 'maint', header: 'Maintenance', align: 'right' as const, hideAt: 'md' as const, render: (r: any) => <span className="tabular-nums">{r.currency} {fmtNum(r.maintenance_cost)}</span> },
    ] : []),
  ];
  return (
    <SectionCard title="Utilisation" padded={false} collapsible={false}
      action={<Badge variant="gray">From issued and returned bookings</Badge>}>
      <div className="flex flex-wrap items-end gap-2 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <label className="flex flex-col gap-1 text-sm"><span style={{ color: 'var(--ink3)' }}>From</span><DatePicker date={parseDateOnly(from)} onChange={d => d && setFrom(toDateOnlyString(d))} /></label>
        <label className="flex flex-col gap-1 text-sm"><span style={{ color: 'var(--ink3)' }}>To</span><DatePicker date={parseDateOnly(to)} onChange={d => d && setTo(toDateOnlyString(d))} /></label>
      </div>
      <DataTable columns={columns} rows={data?.data ?? []} loading={!data} empty={!!data && !data.data.length} emptyIcon="barChart2" emptyTitle="No assets in the register" defaultSortKey="pct" defaultSortDir="desc" pageSize={25} />
      {cost && <p className="px-3 pb-3 text-xs" style={{ color: 'var(--ink3)' }}>Hire cost is shown only for day rates; hourly assets need logged hours.</p>}
    </SectionCard>
  );
}
