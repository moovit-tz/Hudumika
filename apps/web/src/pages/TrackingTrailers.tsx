import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Button } from '../components/ui/button.js';

interface Trailer {
  id: string; name: string; registration_number: string | null; vin: string | null;
  trailer_type: string; capacity_kg: number | null; axles: number | null;
  ownership: string; transporter_id: string | null; transporter_name: string | null;
  status: string; current_trip: { vehicle_id: string; destination: string | null } | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  ACTIVE: 'success', MAINTENANCE: 'warning', OUT_OF_SERVICE: 'error', DECOMMISSIONED: 'gray',
};

export const TrackingTrailers: React.FC = () => {
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    apiFetch('/v1/tracking/trailers')
      .then(res => setTrailers(Array.isArray(res) ? res : []))
      .catch(() => { setTrailers([]); setLoadError('Could not load trailers. Try refreshing.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const stats = useMemo(() => ({
    all: trailers.length,
    active: trailers.filter(t => t.status === 'ACTIVE').length,
    inUse: trailers.filter(t => t.current_trip).length,
    maintenance: trailers.filter(t => t.status === 'MAINTENANCE' || t.status === 'OUT_OF_SERVICE').length,
  }), [trailers]);

  const filtered = trailers.filter(t => {
    if (filter === 'In use' && !t.current_trip) return false;
    if (filter === 'Maintenance' && t.status !== 'MAINTENANCE' && t.status !== 'OUT_OF_SERVICE') return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.registration_number || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const columns: TableColumn<Trailer>[] = [
    { key: 'trailer', header: 'Trailer', accessor: 'name', sortable: true, render: trailer => <div><Link to={`/tracking/trailers/${trailer.id}`} className="font-semibold text-foreground hover:text-primary">{trailer.name}</Link><div className="mt-0.5 text-xs text-muted-foreground">{trailer.registration_number || 'No registration on file'}</div></div> },
    { key: 'type', header: 'Type', accessor: 'trailer_type', sortable: true, render: trailer => `${trailer.trailer_type.replace(/_/g, ' ')}${trailer.axles ? ` · ${trailer.axles} axles` : ''}` },
    { key: 'capacity', header: 'Capacity', accessor: 'capacity_kg', sortable: true, align: 'right', hideAt: 'sm', render: trailer => trailer.capacity_kg != null ? `${trailer.capacity_kg.toLocaleString()} kg` : '—' },
    { key: 'ownership', header: 'Ownership', accessor: 'ownership', sortable: true, hideAt: 'md', render: trailer => <div>{trailer.ownership}{trailer.transporter_name && <div className="text-xs text-muted-foreground">{trailer.transporter_name}</div>}</div> },
    { key: 'status', header: 'Status', accessor: 'status', sortable: true, render: trailer => <Badge variant={STATUS_VARIANT[trailer.status] ?? 'gray'}>{trailer.status.replace(/_/g, ' ')}</Badge> },
    { key: 'trip', header: 'Current trip', sortable: true, render: trailer => trailer.current_trip ? `→ ${trailer.current_trip.destination || 'En route'}` : <span className="text-muted-foreground">Not coupled</span> },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Trailers']}
        titlePlain="Fleet"
        titleEm="trailers"
        subtitle="Every trailer, its documents, and what it's currently coupled to."
        actions={
          <Button asChild><Link to="/tracking/trailers/new"><Icon name="plus" size={15} />Register trailer</Link></Button>
        }
      />

      <MetricsRow cards={[
        { title: 'Trailers', value: String(stats.all), comparisonLabel: 'Registered fleet', barHighlight: 'var(--teal)', loading },
        { title: 'Active', value: String(stats.active), comparisonLabel: 'Available or in operation', barHighlight: 'var(--green)', loading },
        { title: 'In use', value: String(stats.inUse), comparisonLabel: 'Currently coupled to a trip', barHighlight: 'var(--blue)', loading },
        { title: 'Unavailable', value: String(stats.maintenance), comparisonLabel: 'Maintenance or out of service', barHighlight: stats.maintenance > 0 ? 'var(--gold)' : 'var(--green)', loading },
      ]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="All">All ({stats.all})</TabsTrigger>
            <TabsTrigger value="In use">In use ({stats.inUse})</TabsTrigger>
            <TabsTrigger value="Maintenance">Maintenance ({stats.maintenance})</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchToolbar className="w-full lg:max-w-xl" search={search} onSearch={setSearch} placeholder="Search by name or registration…" />
      </div>

      <SectionCard padded={false}>
        <DataTable columns={columns} rows={filtered} loading={loading} error={loadError ?? undefined} onRetry={reload} filteredEmpty={(!!search || filter !== 'All') && filtered.length === 0} empty={!loading && trailers.length === 0} emptyIcon="truck" emptyTitle="No trailers registered" emptyMessage="Register a trailer to manage its documents, status, and trip coupling." defaultSortKey="trailer" defaultSortDir="asc" pageSize={15} />
      </SectionCard>
    </div>
  );
};

export default TrackingTrailers;
