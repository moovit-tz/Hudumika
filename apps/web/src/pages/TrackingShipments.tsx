import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PaginationBar } from '../components/PaginationBar.js';
import './FreightOperations.css';

interface Trip {
  id: string; vehicle_id: string; driver_id: string | null; customer_id: string | null;
  origin: string | null; destination: string | null; scheduled_start: string | null; scheduled_end: string | null;
  actual_start?: string | null; actual_end?: string | null;
  status: string; cargo_desc: string | null; cargo_weight_kg?: number | null;
  job_type: string; shipment_ref: string | null;
}
interface Named { id: string; name: string; plate_number?: string | null }
const statuses: Record<string, string> = { PLANNED: 'Planned', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DELAYED: 'Delayed' };
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not recorded';

export const TrackingShipments: React.FC = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Named[]>([]);
  const [drivers, setDrivers] = useState<Named[]>([]);
  const [customers, setCustomers] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [rows, assets, people, clients] = await Promise.all([apiFetch('/v1/tracking/trips'), apiFetch('/v1/tracking/vehicles'), apiFetch('/v1/tracking/drivers'), apiFetch('/v1/customers')]);
      setTrips(rows); setVehicles(assets); setDrivers(people); setCustomers(clients.data ?? clients);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load trips.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [search, filter]);
  const vehicle = (row: Trip) => { const asset = vehicles.find(item => item.id === row.vehicle_id); return asset ? `${asset.name}${asset.plate_number ? ' · '+asset.plate_number : ''}` : 'Unassigned'; };
  const driver = (row: Trip) => drivers.find(item => item.id === row.driver_id)?.name || 'Unassigned';
  const customer = (row: Trip) => customers.find(item => item.id === row.customer_id)?.name || 'Not linked';
  const filtered = trips.filter(row => (filter === 'ALL' || row.status === filter) && [row.id,row.shipment_ref,row.cargo_desc,row.origin,row.destination,vehicle(row),driver(row),customer(row)].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  return <div className="freight-workspace">
    <PageHeader crumbs={['HuduFreight', 'Trips']} titleEm="Trips" subtitle="Plan and review road movements, assignments, cargo and delivery schedules in one register." actions={<Button asChild><Link to="/tracking/shipments/new">New trip</Link></Button>} />
    <div className="freight-actions" style={{ marginBottom: 16 }}>
      <Input aria-label="Search trips" placeholder="Trip, customer, driver, vehicle or route" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
      <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Trip status" style={{ width: 180 }}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem>{Object.entries(statuses).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <Button variant="outline" onClick={() => void reload()} disabled={loading}>Refresh</Button>
    </div>
    {error && <Banner variant="error">{error}</Banner>}
    <SectionCard>
      {loading ? <SectionLoading label="Loading trips…" /> : error ? <p>Trip data could not be loaded. Retry using Refresh.</p> : <>
        <ResponsiveTable className="freight-trips-table"><thead><tr>{['Trip / cargo','Status','Customer','Vehicle / driver','Route','Schedule / actual','Weight'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => <tr key={row.id}>
            <td><Link to={`/tracking/shipments/${row.id}`}>TRIP-{row.id.slice(0,8).toUpperCase()}</Link><div>{row.cargo_desc || 'Cargo not recorded'}</div>{row.shipment_ref && <small>ClearOS: {row.shipment_ref}</small>}</td>
            <td><Badge variant={row.status === 'COMPLETED' ? 'success' : row.status === 'CANCELLED' ? 'error' : row.status === 'IN_PROGRESS' ? 'info' : 'gray'}>{statuses[row.status] || row.status}</Badge></td>
            <td>{customer(row)}</td><td>{vehicle(row)}<div>{driver(row)}</div></td>
            <td>{row.origin || 'Not recorded'} → {row.destination || 'Not recorded'}</td>
            <td><div>Planned start: {date(row.scheduled_start)}</div><div>Planned end: {date(row.scheduled_end)}</div>{row.actual_start && <div>Departed: {date(row.actual_start)}</div>}{row.actual_end && <div>Finished: {date(row.actual_end)}</div>}</td>
            <td>{row.cargo_weight_kg == null ? 'Not recorded' : `${Number(row.cargo_weight_kg).toLocaleString()} kg`}</td>
          </tr>)}
        </tbody></ResponsiveTable>
        {!filtered.length && <p>{trips.length ? 'No trips match these filters.' : 'No trips yet. Create a trip to book a road movement.'}</p>}
        {!!filtered.length && <PaginationBar page={currentPage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} itemLabel="trip" />}
      </>}
    </SectionCard>
  </div>;
};
