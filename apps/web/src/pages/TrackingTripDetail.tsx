import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionLoading, PageLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Banner } from '../components/ui/alert.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import './TrackingTripDetail.css';
import { showAlert } from '../lib/alert.js';

interface Trip {
  id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  customer_id: string | null;
  origin: string | null;
  destination: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  cargo_desc: string | null;
  cargo_type: string | null;
  cargo_weight_kg: number | null;
  cargo_temp_c: number | null;
  load_capacity_pct: number | null;
  distance_km: number | null;
  notes: string | null;
  job_type: string;
  shipment_ref: string | null;
  shipment_id: string | null;
  created_at: string;
}

interface Vehicle { id: string; name: string; plate_number?: string }
interface Driver  { id: string; name: string; custom_id: string }
interface Customer { id: string; name: string }
interface TripExpense {
  id: string; category: string; description: string | null;
  amount: number; billable: boolean; invoice_id: string | null;
}
interface BorderCrossing {
  id: string; border_name: string; country_from: string; country_to: string;
  status: string; arrival_at: string | null; cleared_at: string | null; customs_ref: string | null;
}

const STATUS_VARIANT: Record<string, 'gray' | 'brand' | 'error' | 'warning'> = {
  PLANNED: 'brand', IN_PROGRESS: 'brand', COMPLETED: 'brand', CANCELLED: 'error', DELAYED: 'warning',
};
const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Scheduled', IN_PROGRESS: 'In transit', COMPLETED: 'Delivered', CANCELLED: 'Cancelled', DELAYED: 'Delayed',
};

function fmtDate(v: string | null) {
  if (!v || Number.isNaN(new Date(v).getTime())) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const TrackingTripDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [crossings, setCrossings] = useState<BorderCrossing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expLoading, setExpLoading] = useState(true);
  const [crossLoading, setCrossLoading] = useState(true);
  const [billing, setBilling] = useState(false);
  const [billError, setBillError] = useState('');
  const [addingCrossing, setAddingCrossing] = useState(false);
  const [crossingForm, setCrossingForm] = useState({ border_name: '', country_from: '', country_to: '' });
  const [loadError, setLoadError] = useState('');
  const [expenseError, setExpenseError] = useState('');
  const [crossingError, setCrossingError] = useState('');
  const [crossingSaving, setCrossingSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const reloadTrip = useCallback(() => {
    if (!id) return;
    setLoadError('');
    apiFetch<Trip>(`/v1/tracking/trips/${id}`)
      .then(setTrip)
      .catch((err: Error) => setLoadError(err.message || 'Unable to load this trip.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    reloadTrip();
    if (!id) return;
    apiFetch<TripExpense[]>(`/v1/tracking/trips/${id}/expenses`)
      .then(setExpenses).catch((err: Error) => setExpenseError(err.message || 'Unable to load expenses.'))
      .finally(() => setExpLoading(false));
    apiFetch<BorderCrossing[]>(`/v1/tracking/trips/${id}/border-crossings`)
      .then(setCrossings).catch((err: Error) => setCrossingError(err.message || 'Unable to load border crossings.'))
      .finally(() => setCrossLoading(false));
  }, [id, reloadTrip]);

  // Resolve vehicle / driver / customer names once the trip loads
  useEffect(() => {
    if (!trip) return;
    if (trip.vehicle_id) {
      apiFetch<Vehicle[]>('/v1/tracking/vehicles')
        .then(vs => setVehicle(vs.find(v => v.id === trip.vehicle_id) ?? null))
        .catch(() => {});
    }
    if (trip.driver_id) {
      apiFetch<Driver[]>('/v1/tracking/drivers')
        .then(ds => setDriver(ds.find(d => d.id === trip.driver_id) ?? null))
        .catch(() => {});
    }
    if (trip.customer_id) {
      apiFetch<{ data?: Customer[] } | Customer[]>('/v1/customers')
        .then((d: any) => {
          const list: Customer[] = d?.data ?? d ?? [];
          setCustomer(list.find(c => c.id === trip.customer_id) ?? null);
        })
        .catch(() => {});
    }
  }, [trip]);

  async function updateStatus(status: string) {
    if (!id) return;
    setStatusSaving(true);
    try {
      const updated = await apiFetch<Trip>(`/v1/tracking/trips/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setTrip(updated);
    } catch (err: any) {
      showAlert(err.message || 'Could not update status.');
    } finally {
      setStatusSaving(false);
    }
  }

  async function billExpenses() {
    if (!id) return;
    setBilling(true);
    setBillError('');
    try {
      await apiFetch(`/v1/tracking/trips/${id}/bill-expenses`, { method: 'POST' });
      const rows: TripExpense[] = await apiFetch(`/v1/tracking/trips/${id}/expenses`);
      setExpenses(rows);
    } catch (err: any) {
      setBillError(err.message || 'Could not bill this trip.');
    } finally {
      setBilling(false);
    }
  }

  async function recordCrossing() {
    if (!id || !crossingForm.border_name.trim() || crossingSaving) return;
    setCrossingSaving(true);
    try {
      const created: BorderCrossing = await apiFetch(`/v1/tracking/trips/${id}/border-crossings`, {
        method: 'POST', body: JSON.stringify(crossingForm),
      });
      setCrossings(p => [...p, created]);
      setCrossingForm({ border_name: '', country_from: '', country_to: '' });
      setAddingCrossing(false);
    } catch (err: any) {
      showAlert(err.message || 'Could not record this border crossing.');
    } finally {
      setCrossingSaving(false);
    }
  }

  async function clearCrossing(crossingId: string) {
    try {
      const updated: BorderCrossing = await apiFetch(`/v1/tracking/border-crossings/${crossingId}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'CLEARED' }),
      });
      setCrossings(p => p.map(c => c.id === crossingId ? updated : c));
    } catch (err: any) {
      showAlert(err.message || 'Could not update this crossing.');
    }
  }

  if (loading) return <PageLoading />;
  if (!trip) return (
    <div className="trip-detail-page">
      <PageHeader crumbs={['HuduFreight', 'Trips']} titlePlain="Trip" titleEm="unavailable" backTo="/tracking/shipments" backLabel="Trips" />
      <Banner variant="error">{loadError || 'This trip could not be found.'}</Banner>
      <Button variant="outline" onClick={reloadTrip}>Try again</Button>
    </div>
  );

  const reference = `TRIP-${trip.id.slice(0, 8).toUpperCase()}`;
  const unbilledExpenses = expenses.filter(e => e.billable && !e.invoice_id);
  const totalUnbilled = unbilledExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="trip-detail-page">
      <PageHeader
        crumbs={['HuduFreight', 'Trips', reference]}
        titlePlain="Trip"
        titleEm={trip.id.slice(0, 8).toUpperCase()}
        subtitle="Route, cargo, assignments and delivery records for this road trip."
        backTo="/tracking/shipments"
        backLabel="Trips"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline">Actions <Icon name="chevronDown" size={14} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={reloadTrip}><Icon name="refresh" size={15} /> Refresh trip</DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/tracking/map"><Icon name="mapPin" size={15} /> Fleet map</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/tracking/cargo-loading"><Icon name="package" size={15} /> Cargo loading</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {loadError && <Banner variant="error">{loadError}</Banner>}

      <SectionCard collapsible={false}>
        <div className="trip-route-summary">
          <div className="trip-route-location"><span className="trip-label">Origin</span><strong>{trip.origin || 'Not recorded'}</strong></div>
          <div className="trip-route-distance"><Icon name="arrowRight" size={20} /><span>{trip.distance_km != null ? `${trip.distance_km.toLocaleString()} km` : 'Road trip'}</span></div>
          <div className="trip-route-location"><span className="trip-label">Destination</span><strong>{trip.destination || 'Not recorded'}</strong></div>
          <Badge variant={STATUS_VARIANT[trip.status] || 'gray'}>{STATUS_LABEL[trip.status] || trip.status}</Badge>
        </div>
      </SectionCard>

      <div className="trip-detail-layout">
        <div className="trip-detail-main">
          <SectionCard title="Schedule & cargo" collapsible={false}>
            <dl className="trip-detail-fields">
              <Kv label="Scheduled departure" value={fmtDate(trip.scheduled_start)} />
              <Kv label="Scheduled arrival" value={fmtDate(trip.scheduled_end)} />
              <Kv label="Actual departure" value={fmtDate(trip.actual_start)} />
              <Kv label="Actual arrival" value={fmtDate(trip.actual_end)} />
              <Kv label="Job type" value={trip.job_type?.replace(/_/g, ' ')} />
              <Kv label="ClearOS reference" value={trip.shipment_ref} />
              <Kv label="Cargo description" value={trip.cargo_desc} />
              <Kv label="Cargo type" value={trip.cargo_type?.replace(/_/g, ' ')} />
              <Kv label="Cargo weight" value={trip.cargo_weight_kg != null ? `${trip.cargo_weight_kg.toLocaleString()} kg` : null} />
              <Kv label="Load capacity" value={trip.load_capacity_pct != null ? `${trip.load_capacity_pct}%` : null} />
              <Kv label="Cargo temperature" value={trip.cargo_temp_c != null ? `${trip.cargo_temp_c}°C` : null} />
              <Kv label="Created" value={fmtDate(trip.created_at)} />
              {trip.notes && <div className="trip-detail-wide"><Kv label="Notes" value={trip.notes} /></div>}
            </dl>
          </SectionCard>

          <SectionCard title="Expenses" collapsible={false} action={<Button variant="ghost" size="sm" asChild><Link to="/tracking/expenses/new"><Icon name="plus" size={14} /> Add expense</Link></Button>}>
            {expLoading ? <SectionLoading /> : expenseError ? <Banner variant="error">{expenseError}</Banner> : expenses.length === 0 ? (
              <p className="trip-empty">No expenses recorded for this trip.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>{['Category', 'Description', 'Amount', 'Type', 'Status'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{expenses.map(e => (
                  <TableRow key={e.id}>
                    <TableCell>{e.category.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{e.description || '—'}</TableCell>
                    <TableCell className="trip-expense-amount">{Number(e.amount).toLocaleString('en')}</TableCell>
                    <TableCell><Badge variant={e.billable ? 'brand' : 'gray'}>{e.billable ? 'Billable' : 'Internal'}</Badge></TableCell>
                    <TableCell><Badge variant={e.invoice_id ? 'brand' : 'warning'}>{e.invoice_id ? 'Invoiced' : 'Pending'}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
            {!expLoading && unbilledExpenses.length > 0 && (
              <div className="trip-billing-summary">
                <div><span className="trip-label">Unbilled expenses · {unbilledExpenses.length}</span><strong>TZS {totalUnbilled.toLocaleString('en')}</strong></div>
                <Button size="sm" disabled={billing || (!trip.customer_id && !trip.shipment_ref)} onClick={billExpenses}>{billing ? 'Billing…' : 'Bill to customer'}</Button>
                {!trip.customer_id && !trip.shipment_ref && <p className="trip-help">Assign a customer before billing expenses.</p>}
                {billError && <Banner variant="error">{billError}</Banner>}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Border crossings" collapsible={false} action={<Button variant="ghost" size="sm" onClick={() => setAddingCrossing(open => !open)} disabled={crossingSaving}><Icon name={addingCrossing ? 'x' : 'plus'} size={14} />{addingCrossing ? 'Cancel' : 'Record crossing'}</Button>}>
            {addingCrossing && (
              <form className="trip-crossing-form" onSubmit={event => { event.preventDefault(); void recordCrossing(); }}>
                <div className="trip-detail-wide"><Label htmlFor="trip-border-name">Border name</Label><Input id="trip-border-name" required placeholder="e.g. Tunduma" value={crossingForm.border_name} onChange={event => setCrossingForm(form => ({ ...form, border_name: event.target.value }))} /></div>
                <div><Label htmlFor="trip-country-from">From country</Label><Input id="trip-country-from" maxLength={3} placeholder="e.g. TZ" value={crossingForm.country_from} onChange={event => setCrossingForm(form => ({ ...form, country_from: event.target.value.toUpperCase() }))} /></div>
                <div><Label htmlFor="trip-country-to">To country</Label><Input id="trip-country-to" maxLength={3} placeholder="e.g. ZM" value={crossingForm.country_to} onChange={event => setCrossingForm(form => ({ ...form, country_to: event.target.value.toUpperCase() }))} /></div>
                <div className="trip-detail-wide"><Button type="submit" size="sm" disabled={crossingSaving || !crossingForm.border_name.trim()}>{crossingSaving ? 'Saving…' : 'Save crossing'}</Button></div>
              </form>
            )}
            {crossLoading ? <SectionLoading /> : crossingError ? <Banner variant="error">{crossingError}</Banner> : crossings.length === 0 ? (
              <p className="trip-empty">No border crossings recorded for this trip.</p>
            ) : (
              <div className="trip-crossing-list">{crossings.map(c => (
                <div key={c.id} className="trip-crossing-row">
                  <div><strong>{c.border_name}</strong><p className="trip-help">{c.country_from} → {c.country_to}{c.customs_ref ? ` · Ref: ${c.customs_ref}` : ''}</p></div>
                  <div className="trip-crossing-actions"><Badge variant={c.status === 'CLEARED' ? 'brand' : c.status === 'REJECTED' ? 'error' : 'warning'}>{c.status.replace(/_/g, ' ')}</Badge>{c.status !== 'CLEARED' && <Button variant="outline" size="sm" onClick={() => { void clearCrossing(c.id); }}>Mark cleared</Button>}</div>
                </div>
              ))}</div>
            )}
          </SectionCard>
        </div>

        <aside className="trip-detail-sidebar" aria-label="Trip status and assignments">
          <SectionCard title="Trip status" collapsible={false}>
            <Label htmlFor="trip-status">Update status</Label>
            <Select value={trip.status} onValueChange={updateStatus} disabled={statusSaving}>
              <SelectTrigger id="trip-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="trip-help" role="status">{statusSaving ? 'Saving status…' : 'Changes are saved immediately.'}</p>
          </SectionCard>

          <SectionCard title="Assignments" collapsible={false}>
            <div className="trip-assignment-list">
              <div className="trip-assignment">
                <PersonAvatar userId={trip.driver_id} kind="drivers" name={driver?.name || 'Unassigned'} size={36} />
                <div><span className="trip-label">Driver</span><strong>{driver?.name || (trip.driver_id ? 'Driver unavailable' : 'Not assigned')}</strong>{driver?.custom_id && <span className="trip-help">{driver.custom_id}</span>}{trip.driver_id && <Link to={`/tracking/drivers/${trip.driver_id}`}>View profile <Icon name="arrowRight" size={12} /></Link>}</div>
              </div>
              <div className="trip-assignment">
                <Icon name="truck" size={26} color="var(--teal)" />
                <div><span className="trip-label">Vehicle</span><strong>{vehicle?.name || (trip.vehicle_id ? 'Vehicle unavailable' : 'Not assigned')}</strong>{vehicle?.plate_number && <span className="trip-help">{vehicle.plate_number}</span>}{trip.vehicle_id && <Link to={`/tracking/vehicles/${trip.vehicle_id}`}>View vehicle <Icon name="arrowRight" size={12} /></Link>}</div>
              </div>
              <div className="trip-assignment">
                <PersonAvatar userId={trip.customer_id} kind="customers" name={customer?.name || 'Unassigned'} size={36} />
                <div><span className="trip-label">Customer</span><strong>{customer?.name || (trip.customer_id ? 'Customer unavailable' : 'Not assigned')}</strong></div>
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
};

function Kv({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="trip-detail-field"><dt>{label}</dt><dd>{value ?? '—'}</dd></div>;
}
