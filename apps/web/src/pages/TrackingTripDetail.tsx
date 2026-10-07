import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionLoading, PageLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
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

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'info' | 'error' | 'warning'> = {
  PLANNED: 'gray', IN_PROGRESS: 'success', COMPLETED: 'info',
  CANCELLED: 'error', DELAYED: 'warning',
};

const CROSSING_STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--ink3)', IN_PROGRESS: 'var(--gold)',
  CLEARED: 'var(--green)', DELAYED: 'var(--red)', REJECTED: 'var(--red)',
};

function fmtDate(v: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const TrackingTripDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

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
  const [statusSaving, setStatusSaving] = useState(false);

  const reloadTrip = useCallback(() => {
    if (!id) return;
    apiFetch<Trip>(`/v1/tracking/trips/${id}`)
      .then(setTrip)
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    reloadTrip();
    if (!id) return;
    apiFetch<TripExpense[]>(`/v1/tracking/trips/${id}/expenses`)
      .then(setExpenses).catch(() => setExpenses([]))
      .finally(() => setExpLoading(false));
    apiFetch<BorderCrossing[]>(`/v1/tracking/trips/${id}/border-crossings`)
      .then(setCrossings).catch(() => setCrossings([]))
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
    if (!id || !crossingForm.border_name.trim()) return;
    try {
      const created: BorderCrossing = await apiFetch(`/v1/tracking/trips/${id}/border-crossings`, {
        method: 'POST', body: JSON.stringify(crossingForm),
      });
      setCrossings(p => [...p, created]);
      setCrossingForm({ border_name: '', country_from: '', country_to: '' });
      setAddingCrossing(false);
    } catch (err: any) {
      showAlert(err.message || 'Could not record this border crossing.');
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
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)' }}>
      <Icon name="alertTriangle" size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink2)' }}>Trip not found</div>
      <div style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>This trip may have been deleted or doesn't exist.</div>
      <Button variant="outline" onClick={() => navigate('/tracking/shipments')}>Back to Trips</Button>
    </div>
  );

  const displayStatus = trip.status === 'IN_PROGRESS' ? 'In Progress' : trip.status === 'COMPLETED' ? 'Completed' :
    trip.status === 'PLANNED' ? 'Planned' : trip.status === 'DELAYED' ? 'Delayed' :
    trip.status === 'CANCELLED' ? 'Cancelled' : trip.status;

  const unbilledExpenses = expenses.filter(e => e.billable && !e.invoice_id);
  const billedCount = expenses.filter(e => e.invoice_id).length;
  const totalUnbilled = unbilledExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        crumbs={['Tracking', 'Trips']}
        titlePlain={trip.shipment_ref ?? `Trip`}
        titleEm={trip.shipment_ref ? 'detail' : trip.id.slice(0, 8).toUpperCase()}
        subtitle={[trip.origin, trip.destination].filter(Boolean).join(' → ') || 'No route specified'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/tracking/shipments')}>
              <Icon name="arrowLeft" size={14} /> All Trips
            </Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginTop: 24 }}>

        {/* ── Left column: main details ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Trip Overview */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5 }}>
                <Icon name="package" size={15} /> Trip Details
              </div>
              <Badge variant={STATUS_VARIANT[trip.status] ?? 'gray'}>{displayStatus}</Badge>
            </div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 32px', fontSize: 13 }}>
              <Kv label="Origin" value={trip.origin} />
              <Kv label="Destination" value={trip.destination} />
              <Kv label="Scheduled Start" value={fmtDate(trip.scheduled_start)} />
              <Kv label="Scheduled End" value={fmtDate(trip.scheduled_end)} />
              {trip.actual_start && <Kv label="Actual Start" value={fmtDate(trip.actual_start)} />}
              {trip.actual_end && <Kv label="Actual End" value={fmtDate(trip.actual_end)} />}
              <Kv label="Job Type" value={trip.job_type.replace(/_/g, ' ')} />
              {trip.shipment_ref && <Kv label="Shipment Ref" value={trip.shipment_ref} />}
              {trip.cargo_desc && <Kv label="Cargo Description" value={trip.cargo_desc} />}
              {trip.cargo_type && <Kv label="Cargo Type" value={trip.cargo_type} />}
              {trip.cargo_weight_kg != null && <Kv label="Cargo Weight" value={`${trip.cargo_weight_kg.toLocaleString()} kg`} />}
              {trip.distance_km != null && <Kv label="Distance" value={`${trip.distance_km.toLocaleString()} km`} />}
              {trip.load_capacity_pct != null && <Kv label="Load Capacity" value={`${trip.load_capacity_pct}%`} />}
              {trip.cargo_temp_c != null && <Kv label="Cargo Temp" value={`${trip.cargo_temp_c}°C`} />}
              {trip.notes && <div style={{ gridColumn: '1 / -1' }}><Kv label="Notes" value={trip.notes} /></div>}
            </div>
          </div>

          {/* Expenses */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5 }}>
                <Icon name="dollarSign" size={15} /> Expenses
              </div>
              <Link to="/tracking/expenses/new" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="plus" size={12} /> Add Expense
              </Link>
            </div>
            <div style={{ padding: 20 }}>
              {expLoading ? <SectionLoading /> : expenses.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '20px 0' }}>
                  No expenses recorded for this trip.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Category', 'Description', 'Amount', 'Billable', 'Status'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>{e.category}</td>
                        <td style={{ padding: '8px', color: 'var(--ink3)' }}>{e.description || '—'}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600 }}>
                          {e.amount.toLocaleString('en')}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {e.billable ? <Badge variant="brand">Billable</Badge> : <Badge variant="gray">Internal</Badge>}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {e.invoice_id
                            ? <Badge variant="success">Invoiced</Badge>
                            : <Badge variant="warning">Pending</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!expLoading && unbilledExpenses.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
                    <strong>{unbilledExpenses.length}</strong> unbilled expense{unbilledExpenses.length > 1 ? 's' : ''} — TZS {totalUnbilled.toLocaleString('en')}
                    {billedCount > 0 && <span style={{ color: 'var(--ink3)', marginLeft: 8 }}>{billedCount} already invoiced</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {billError && <div style={{ fontSize: 11.5, color: 'var(--red)' }}>{billError}</div>}
                    <Button
                      size="sm"
                      disabled={billing || (!trip.customer_id && !trip.shipment_ref)}
                      onClick={billExpenses}
                      title={!trip.customer_id && !trip.shipment_ref ? 'This trip has no customer to bill' : undefined}
                    >
                      {billing ? 'Billing…' : 'Bill to customer'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Border Crossings */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5 }}>
                <Icon name="mapPin" size={15} /> Border Crossings
              </div>
              <button
                type="button"
                onClick={() => setAddingCrossing(a => !a)}
                style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                data-ui-native-button=""
              >
                <Icon name={addingCrossing ? 'x' : 'plus'} size={12} />
                {addingCrossing ? 'Cancel' : 'Record crossing'}
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {addingCrossing && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <input
                    placeholder="Border name (e.g. Tunduma)"
                    value={crossingForm.border_name}
                    onChange={e => setCrossingForm(f => ({ ...f, border_name: e.target.value }))}
                    style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'var(--font)', flex: 1, minWidth: 140 }}
                  />
                  <input
                    placeholder="From (e.g. TZ)"
                    value={crossingForm.country_from}
                    onChange={e => setCrossingForm(f => ({ ...f, country_from: e.target.value.toUpperCase() }))}
                    maxLength={3}
                    style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'var(--font)', width: 90 }}
                  />
                  <input
                    placeholder="To (e.g. ZM)"
                    value={crossingForm.country_to}
                    onChange={e => setCrossingForm(f => ({ ...f, country_to: e.target.value.toUpperCase() }))}
                    maxLength={3}
                    style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'var(--font)', width: 90 }}
                  />
                  <button
                    type="button"
                    onClick={recordCrossing}
                    style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    data-ui-native-button=""
                  >
                    Save
                  </button>
                </div>
              )}
              {crossLoading ? <SectionLoading /> : crossings.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '20px 0' }}>
                  No border crossings recorded for this trip.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {crossings.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.border_name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{c.country_from} → {c.country_to}{c.customs_ref ? ` · Ref: ${c.customs_ref}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: CROSSING_STATUS_COLOR[c.status] ?? 'var(--ink3)', fontWeight: 700, fontSize: 12.5 }}>{c.status}</span>
                        {c.status !== 'CLEARED' && (
                          <button
                            type="button"
                            onClick={() => clearCrossing(c.id)}
                            style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
                            data-ui-native-button=""
                          >
                            Mark cleared
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column: driver, vehicle, status ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Status management */}
          <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="activity" size={15} /> Update Status
            </div>
            <div style={{ padding: 16 }}>
              <Select value={trip.status} onValueChange={updateStatus} disabled={statusSaving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNED">Planned</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="DELAYED">Delayed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {statusSaving && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6 }}>Saving…</div>}
            </div>
          </div>

          {/* Assigned Driver */}
          {(driver || trip.driver_id) && (
            <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="user" size={15} /> Driver
              </div>
              <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <PersonAvatar userId={trip.driver_id ?? undefined} name={driver?.name ?? 'Driver'} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {driver?.name ?? 'Loading…'}
                  </div>
                  {driver?.custom_id && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>ID: {driver.custom_id}</div>
                  )}
                </div>
                {trip.driver_id && (
                  <Link
                    to={`/tracking/drivers/${trip.driver_id}`}
                    style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    View profile
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Assigned Vehicle */}
          {(vehicle || trip.vehicle_id) && (
            <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="truck" size={15} /> Vehicle
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{vehicle?.name ?? 'Loading…'}</div>
                {vehicle?.plate_number && (
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{vehicle.plate_number}</div>
                )}
                {trip.vehicle_id && (
                  <Link
                    to={`/tracking/vehicles/${trip.vehicle_id}`}
                    style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    View vehicle →
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Customer */}
          {(customer || trip.customer_id) && (
            <div style={{ background: 'var(--card-bg, var(--white))', border: 'var(--card-border)', borderRadius: 'var(--card-radius, var(--r))', boxShadow: 'var(--card-shadow, var(--elev-sm))', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="briefcase" size={15} /> Customer
              </div>
              <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <PersonAvatar userId={trip.customer_id ?? undefined} kind="customers" name={customer?.name ?? 'Customer'} size={36} />
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{customer?.name ?? 'Loading…'}</div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

function Kv({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{value ?? '—'}</div>
    </div>
  );
}
