import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { PaginationBar } from '../components/PaginationBar.js';

import { getFleetVehiclePhoto } from './TrackingVehicles.js';
import './TrackingShipments.css';

interface Trip {
  id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  customer_id: string | null;
  origin: string | null;
  destination: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  status: string;
  cargo_desc: string | null;
  cargo_type?: string | null;
  cargo_weight_kg?: number | null;
  cargo_temp_c?: number | null;
  load_capacity_pct?: number | null;
  distance_km?: number | null;
  notes?: string | null;
  job_type?: string;
  shipment_ref?: string | null;
  shipment_id?: string | null;
  created_at?: string;
}

interface Vehicle {
  id: string;
  name: string;
  plate_number?: string | null;
  make?: string | null;
  model?: string | null;
  type?: string | null;
  photo_url?: string | null;
}

interface Driver {
  id: string;
  name: string;
  phone?: string | null;
  custom_id?: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'brand' | 'info' | 'gray' | 'warning' | 'error' | 'brand' }> = {
  IN_PROGRESS: { label: 'In Transit', variant: 'brand' },
  PLANNED:     { label: 'Scheduled', variant: 'brand' },
  COMPLETED:   { label: 'Delivered', variant: 'brand' },
  DELAYED:     { label: 'Delayed', variant: 'warning' },
  CANCELLED:   { label: 'Cancelled', variant: 'error' },
};

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value);
  }
}

export const TrackingShipments: React.FC = () => {
  const [params] = useSearchParams();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter controls
  const [statusFilter, setStatusFilter] = useState<string>(params.get('status') || 'ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tripsRes, vehiclesRes, driversRes, customersRes] = await Promise.all([
        apiFetch('/v1/tracking/trips'),
        apiFetch('/v1/tracking/vehicles'),
        apiFetch('/v1/tracking/drivers'),
        apiFetch('/v1/customers'),
      ]);

      setTrips(Array.isArray(tripsRes) ? tripsRes : (tripsRes?.data ?? []));
      setVehicles(Array.isArray(vehiclesRes) ? vehiclesRes : (vehiclesRes?.data ?? []));
      setDrivers(Array.isArray(driversRes) ? driversRes : (driversRes?.data ?? []));
      setCustomers(Array.isArray(customersRes) ? customersRes : (customersRes?.data ?? []));
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Unable to load shipments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, customerFilter, viewMode]);

  // Resolvers
  const getVehicle = useCallback((vehicleId: string | null) => {
    if (!vehicleId) return null;
    return vehicles.find(v => v.id === vehicleId) || null;
  }, [vehicles]);

  const getDriver = useCallback((driverId: string | null) => {
    if (!driverId) return null;
    return drivers.find(d => d.id === driverId) || null;
  }, [drivers]);

  const getCustomer = useCallback((customerId: string | null) => {
    if (!customerId) return null;
    return customers.find(c => c.id === customerId) || null;
  }, [customers]);

  // KPI Calculations
  const stats = useMemo(() => {
    const total = trips.length;
    const inProgress = trips.filter(t => t.status === 'IN_PROGRESS').length;
    const planned = trips.filter(t => t.status === 'PLANNED').length;
    const completed = trips.filter(t => t.status === 'COMPLETED').length;
    const delayed = trips.filter(t => t.status === 'DELAYED').length;
    const cancelled = trips.filter(t => t.status === 'CANCELLED').length;
    const totalWeight = trips.reduce((sum, t) => sum + (t.cargo_weight_kg || 0), 0);
    return { total, inProgress, planned, completed, delayed, cancelled, totalWeight };
  }, [trips]);

  // Filtering
  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter(t => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (customerFilter !== 'ALL' && t.customer_id !== customerFilter) return false;

      if (!q) return true;

      const v = getVehicle(t.vehicle_id);
      const d = getDriver(t.driver_id);
      const c = getCustomer(t.customer_id);

      const searchStrings = [
        t.id,
        `TRIP-${t.id.slice(0, 8)}`,
        t.shipment_ref || '',
        t.cargo_desc || '',
        t.cargo_type || '',
        t.origin || '',
        t.destination || '',
        v?.name || '',
        v?.plate_number || '',
        d?.name || '',
        c?.name || '',
      ];

      return searchStrings.some(s => s.toLowerCase().includes(q));
    });
  }, [trips, statusFilter, customerFilter, search, getVehicle, getDriver, getCustomer]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedTrips = filteredTrips.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Table Columns Definition
  const tableColumns: TableColumn<Trip>[] = [
    {
      key: 'shipment',
      header: 'Shipment / Job',
      accessor: 'id',
      sortable: true,
      render: t => {
        return (
          <div style={{ minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link to={`/tracking/shipments/${t.id}`} className="font-bold text-foreground hover:text-primary">
                TRIP-{t.id.slice(0, 8).toUpperCase()}
              </Link>
              {t.shipment_ref && (
                <Badge variant="brand">ClearOS #{t.shipment_ref}</Badge>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {t.cargo_desc || 'General Freight'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: t => {
        const conf = STATUS_CONFIG[t.status] || { label: t.status, variant: 'gray' as const };
        return <Badge variant={conf.variant}>{conf.label}</Badge>;
      },
    },
    {
      key: 'route',
      header: 'Route',
      sortable: true,
      render: t => (
        <div style={{ minWidth: 150 }}>
          <div className="text-xs font-semibold text-foreground">
            {t.origin || 'Depot'} → {t.destination || 'Destination'}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {t.distance_km ? `${t.distance_km} km` : 'Direct Transit'}
          </div>
        </div>
      ),
    },
    {
      key: 'assignment',
      header: 'Vehicle & Driver',
      hideAt: 'sm',
      render: t => {
        const v = getVehicle(t.vehicle_id);
        const d = getDriver(t.driver_id);
        return (
          <div style={{ minWidth: 150 }}>
            <div className="text-xs font-medium text-foreground">
              {v ? (
                <Link to={`/tracking/vehicles/${v.id}`} className="hover:text-primary">
                  {v.name} {v.plate_number ? `(${v.plate_number})` : ''}
                </Link>
              ) : (
                <span className="text-muted-foreground">Unassigned asset</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <PersonAvatar userId={d?.id || null} kind="drivers" name={d?.name || 'Unassigned'} size={18} style={{ borderRadius: '50%' }} />
              <span>{d?.name || 'No driver assigned'}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'customer',
      header: 'Customer',
      hideAt: 'md',
      render: t => {
        const c = getCustomer(t.customer_id);
        return (
          <span className="text-xs text-foreground">
            {c ? c.name : <span className="text-muted-foreground">Direct account</span>}
          </span>
        );
      },
    },
    {
      key: 'schedule',
      header: 'Schedule',
      sortable: true,
      hideAt: 'md',
      render: t => (
        <div className="text-xs text-muted-foreground">
          <div>Start: {fmtDateTime(t.scheduled_start)}</div>
          {t.actual_start && <div className="text-teal font-medium">Departed: {fmtDateTime(t.actual_start)}</div>}
        </div>
      ),
    },
    {
      key: 'weight',
      header: 'Cargo Specs',
      align: 'right',
      render: t => (
        <div className="text-right">
          <div className="text-xs font-semibold text-foreground">
            {t.cargo_weight_kg != null ? `${t.cargo_weight_kg.toLocaleString()} kg` : '—'}
          </div>
          {t.cargo_temp_c != null && (
            <div className="text-[11px] text-cyan-600 font-medium">
              ❄ {t.cargo_temp_c}°C
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: t => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/tracking/shipments/${t.id}`} className="inline-flex items-center gap-1">
            <span>View</span>
            <Icon name="chevronRight" size={12} />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="trk-shipments-page">
      <PageHeader
        crumbs={['HuduFreight', 'Trips']}
        titlePlain="Road"
        titleEm="trips"
        subtitle="Plan departures, follow delivery status and manage assigned drivers, vehicles and cargo."
        actions={
          <div className="trk-shipments-header-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline">Actions <Icon name="chevronDown" size={14} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { void reload(); }} disabled={loading}><Icon name="refresh" size={15} /> Refresh trips</DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/tracking/cargo-loading"><Icon name="package" size={15} /> Cargo loading</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/tracking/map"><Icon name="mapPin" size={15} /> Fleet map</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild>
              <Link to="/tracking/shipments/new">
                <Icon name="plus" size={15} /> New trip
              </Link>
            </Button>
          </div>
        }
      />

      <MetricsRow cards={[
        {
          title: 'In transit',
          value: String(stats.inProgress),
          icon: 'truck',
          updatedLabel: 'Trips on the road',
          loading,
          emphasis: 'primary',
        },
        {
          title: 'Scheduled',
          value: String(stats.planned),
          icon: 'clock',
          updatedLabel: 'Planned departures',
          loading,
        },
        {
          title: 'Delivered',
          value: String(stats.completed),
          icon: 'checkCircle',
          updatedLabel: 'Completed trips',
          loading,
        },
        {
          title: 'Total trips',
          value: String(stats.total),
          icon: 'box2',
          updatedLabel: 'All registered trips',
          loading,
        },
      ]} />

      {error && (
        <Banner variant="error" style={{ marginBottom: 16 }}>
          {error}
        </Banner>
      )}

      <SearchToolbar
        className="trk-shipments-search"
        search={search}
        onSearch={setSearch}
        placeholder="Search trips, routes, drivers…"
        quickFilters={[
          { label: 'Status', value: statusFilter === 'ALL' ? null : statusFilter, onChange: value => setStatusFilter(value || 'ALL'), allLabel: 'All statuses', options: [
            ...Object.entries(STATUS_CONFIG).map(([value, config]) => ({ value, label: config.label })),
          ] },
          { label: 'Customer', value: customerFilter === 'ALL' ? null : customerFilter, onChange: value => setCustomerFilter(value || 'ALL'), searchable: true, allLabel: 'All customers', options: [
            ...customers.map(c => ({ value: c.id, label: c.name })),
          ] },
        ]}
        actions={
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'grid' | 'table')} variant="segmented">
            <TabsList aria-label="Trip display">
              <TabsTrigger value="grid" aria-label="Cards view"><Icon name="grid" size={14} /></TabsTrigger>
              <TabsTrigger value="table" aria-label="Table view"><Icon name="list" size={14} /></TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="trk-shipments-results" role="status">
        {loading ? 'Loading trips…' : `${filteredTrips.length} ${filteredTrips.length === 1 ? 'trip' : 'trips'}${filteredTrips.length !== trips.length ? ` of ${trips.length}` : ''}`}
        {(search || statusFilter !== 'ALL' || customerFilter !== 'ALL') && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('ALL'); setCustomerFilter('ALL'); }}>Clear filters</Button>
        )}
      </div>

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        <SectionCard padded={false}>
          <DataTable
            columns={tableColumns}
            rows={filteredTrips}
            loading={loading}
            error={error ?? undefined}
            onRetry={reload}
            filteredEmpty={filteredTrips.length === 0 && trips.length > 0}
            empty={!loading && trips.length === 0}
            emptyIcon="truck"
            emptyTitle="No shipments recorded"
            emptyMessage="Create your first road transport shipment to dispatch cargo, drivers, and fleet assets."
            defaultSortKey="shipment"
            defaultSortDir="asc"
            pageSize={pageSize}
          />
        </SectionCard>
      ) : (
        /* Cards / Board View */
        <div>
          {loading ? (
            <div className="trk-shipment-grid">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="trk-shipment-card" style={{ minHeight: 220, opacity: 0.6 }}>
                  <div style={{ height: 20, width: '40%', background: 'var(--card-sunken)', borderRadius: 4 }} />
                  <div style={{ height: 60, width: '100%', background: 'var(--card-sunken)', borderRadius: 6, margin: '10px 0' }} />
                  <div style={{ height: 16, width: '70%', background: 'var(--card-sunken)', borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : error && trips.length === 0 ? (
            <div className="trk-shipments-empty"><div className="trk-shipments-empty-title">Trips could not be loaded</div><Button variant="outline" onClick={() => { void reload(); }}>Try again</Button></div>
          ) : filteredTrips.length === 0 ? (
            <div className="trk-shipments-empty">
              <Icon name="package" size={40} color="var(--ink3)" />
              <div className="trk-shipments-empty-title">
                {trips.length === 0 ? 'No shipments registered yet' : 'No shipments match current filters'}
              </div>
              <div className="trk-shipments-empty-desc">
                {trips.length === 0
                  ? 'Book and track road movements, connect with ClearOS commercial customs clearance, and track real-time delivery performance.'
                  : 'Try clearing your search query or switching status filters to view all trips.'}
              </div>
              {trips.length === 0 ? (
                <Button asChild>
                  <Link to="/tracking/shipments/new">
                    <Icon name="plus" size={15} /> Create your first shipment
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="trk-shipment-grid">
              {pagedTrips.map(trip => {
                const conf = STATUS_CONFIG[trip.status] || { label: trip.status, variant: 'gray' as const };
                const vehicle = getVehicle(trip.vehicle_id);
                const driver = getDriver(trip.driver_id);
                const customer = getCustomer(trip.customer_id);
                const vehiclePhoto = vehicle ? getFleetVehiclePhoto(vehicle) : '/images/freight/volvo-fh16.jpg';

                return (
                  <Link to={`/tracking/shipments/${trip.id}`} key={trip.id} className="trk-shipment-card">
                    {/* Top Row: Reference, ClearOS tag & Status */}
                    <div className="trk-shipment-card-top">
                      <div className="trk-shipment-ref-group">
                        <span className="trk-shipment-id">TRIP-{trip.id.slice(0, 8).toUpperCase()}</span>
                        {trip.shipment_ref && (
                          <Badge variant="brand">ClearOS #{trip.shipment_ref}</Badge>
                        )}
                        {trip.job_type === 'TRANSPORT_ONLY' && (
                          <Badge variant="gray">Direct Freight</Badge>
                        )}
                      </div>
                      <div className="trk-shipment-badges">
                        <Badge variant={conf.variant}>{conf.label}</Badge>
                      </div>
                    </div>

                    {/* Route Visual Flow */}
                    <div className="trk-route-flow">
                      <div className="trk-route-node">
                        <span className="trk-route-label">Origin</span>
                        <span className="trk-route-city" title={trip.origin || 'Depot'}>
                          {trip.origin || 'Depot'}
                        </span>
                      </div>
                      <div className="trk-route-line-wrap">
                        <span className="trk-route-dist">
                          {trip.distance_km ? `${trip.distance_km} km` : 'Road transit'}
                        </span>
                        <div className="trk-route-line" />
                      </div>
                      <div className="trk-route-node" style={{ textAlign: 'right' }}>
                        <span className="trk-route-label">Destination</span>
                        <span className="trk-route-city" title={trip.destination || 'Delivery Point'}>
                          {trip.destination || 'Delivery Point'}
                        </span>
                      </div>
                    </div>

                    <div className="trk-shipment-timing">
                      <div><span>{trip.actual_start ? 'Departed' : 'Scheduled departure'}</span><strong>{fmtDateTime(trip.actual_start || trip.scheduled_start)}</strong></div>
                      <div><span>{trip.actual_end ? 'Arrived' : 'Scheduled arrival'}</span><strong>{fmtDateTime(trip.actual_end || trip.scheduled_end)}</strong></div>
                    </div>

                    {/* Cargo Specs */}
                    <div className="trk-shipment-cargo">
                      <div className="trk-cargo-desc">
                        {trip.cargo_desc || 'Cargo details not recorded'}
                      </div>
                      <div className="trk-shipment-specs">
                        {trip.cargo_weight_kg != null && (
                          <span className="trk-spec-chip">
                            ⚖ {trip.cargo_weight_kg.toLocaleString()} kg
                          </span>
                        )}
                        {trip.cargo_temp_c != null && (
                          <span className="trk-spec-chip temp">
                            ❄ {trip.cargo_temp_c}°C Reefer
                          </span>
                        )}
                        {trip.load_capacity_pct != null && (
                          <span className="trk-spec-chip">
                            📦 {trip.load_capacity_pct}% Capacity
                          </span>
                        )}
                        {trip.cargo_type && (
                          <span className="trk-spec-chip">
                            {trip.cargo_type.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Assignees: Vehicle & Driver */}
                    <div className="trk-shipment-assignees">
                      <div className="trk-shipment-vehicle">
                        <img
                          src={vehiclePhoto}
                          alt={vehicle?.name || 'Assigned vehicle'}
                          className="trk-shipment-vehicle-thumb"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/images/freight/volvo-fh16.jpg';
                          }}
                        />
                        <div className="trk-shipment-vehicle-info">
                          <span className="trk-shipment-vehicle-name">
                            {vehicle?.name || 'Unassigned vehicle'}
                          </span>
                          <span className="trk-shipment-vehicle-plate">
                            {vehicle?.plate_number || 'No plate'}
                          </span>
                        </div>
                      </div>

                      <div className="trk-shipment-driver">
                        <PersonAvatar
                          userId={driver?.id || null}
                          kind="drivers"
                          name={driver?.name || 'Unassigned'}
                          size={24}
                          style={{ borderRadius: '50%' }}
                        />
                        <div className="trk-shipment-driver-info">
                          <span className="trk-shipment-driver-name">
                            {driver?.name || 'Unassigned'}
                          </span>
                          <span className="trk-shipment-driver-role">Driver</span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Row */}
                    <div className="trk-shipment-footer">
                      <div className="trk-shipment-customer-tag">
                        <PersonAvatar userId={customer?.id || null} kind="customers" name={customer?.name || 'Unassigned'} size={22} />
                        <span>{customer?.name || 'Customer not assigned'}</span>
                      </div>
                      <div className="trk-shipment-action-link">
                        <span>View trip</span>
                        <Icon name="arrowRight" size={13} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && filteredTrips.length > pageSize && (
            <div style={{ marginTop: 20 }}>
              <PaginationBar
                page={currentPage}
                pageSize={pageSize}
                total={filteredTrips.length}
                onPageChange={setPage}
                onPageSizeChange={s => { setPageSize(s); setPage(1); }}
                itemLabel="trip"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
