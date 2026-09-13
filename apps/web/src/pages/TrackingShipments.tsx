import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { showAlert } from '../lib/alert.js';

interface Trip {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  customer_id: string | null;
  origin: string | null;
  destination: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
  cargo_desc: string | null;
  job_type: string;
  shipment_ref: string | null;
}
interface Customer { id: string; name: string }
interface TripExpense { id: string; category: string; description: string | null; amount: number; billable: boolean; invoice_id: string | null }
interface BorderCrossing {
  id: string; border_name: string; country_from: string; country_to: string;
  status: string; arrival_at: string | null; cleared_at: string | null; customs_ref: string | null;
}

const CROSSING_STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--ink3)', IN_PROGRESS: 'var(--gold)', CLEARED: 'var(--green)', DELAYED: 'var(--red)', REJECTED: 'var(--red)',
};

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  PLANNED:     { bg: 'hsl(var(--muted))', fg: 'hsl(var(--muted-foreground))', dot: 'hsl(var(--muted-foreground))' },
  IN_PROGRESS: { bg: 'var(--green-l)', fg: 'var(--green)', dot: 'var(--green)' },
  COMPLETED:   { bg: 'var(--blue-l)', fg: 'var(--blue)', dot: 'var(--blue)' },
  CANCELLED:   { bg: 'var(--red-l)', fg: 'var(--red)', dot: 'var(--red)' },
  DELAYED:     { bg: 'var(--gold-l)', fg: 'var(--gold)', dot: 'var(--gold)' },
};

export const TrackingShipments: React.FC = () => {
  const [shipments, setShipments] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [tripExpenses, setTripExpenses] = useState<Record<string, TripExpense[]>>({});
  const [billing, setBilling] = useState<string | null>(null);
  const [billError, setBillError] = useState<Record<string, string>>({});
  const [crossings, setCrossings] = useState<Record<string, BorderCrossing[]>>({});
  const [addingCrossing, setAddingCrossing] = useState<string | null>(null);
  const [crossingForm, setCrossingForm] = useState({ border_name: '', country_from: '', country_to: '' });

  useEffect(() => {
    if (!expandedTrip || tripExpenses[expandedTrip]) return;
    apiFetch(`/v1/tracking/trips/${expandedTrip}/expenses`)
      .then((rows: TripExpense[]) => setTripExpenses(p => ({ ...p, [expandedTrip]: rows })))
      .catch(() => setTripExpenses(p => ({ ...p, [expandedTrip]: [] })));
  }, [expandedTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expandedTrip || crossings[expandedTrip]) return;
    apiFetch(`/v1/tracking/trips/${expandedTrip}/border-crossings`)
      .then((rows: BorderCrossing[]) => setCrossings(p => ({ ...p, [expandedTrip]: rows })))
      .catch(() => setCrossings(p => ({ ...p, [expandedTrip]: [] })));
  }, [expandedTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recordCrossing(tripId: string) {
    if (!crossingForm.border_name.trim() || !crossingForm.country_from.trim() || !crossingForm.country_to.trim()) return;
    try {
      const created = await apiFetch(`/v1/tracking/trips/${tripId}/border-crossings`, {
        method: 'POST', body: JSON.stringify(crossingForm),
      });
      setCrossings(p => ({ ...p, [tripId]: [...(p[tripId] ?? []), created] }));
      setCrossingForm({ border_name: '', country_from: '', country_to: '' });
      setAddingCrossing(null);
    } catch (err: any) {
      showAlert(err.message || 'Could not record this border crossing.');
    }
  }

  async function clearCrossing(tripId: string, crossingId: string) {
    try {
      const updated = await apiFetch(`/v1/tracking/border-crossings/${crossingId}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'CLEARED' }),
      });
      setCrossings(p => ({ ...p, [tripId]: (p[tripId] ?? []).map(c => c.id === crossingId ? updated : c) }));
    } catch (err: any) {
      showAlert(err.message || 'Could not update this crossing.');
    }
  }

  async function billTripExpenses(tripId: string) {
    setBilling(tripId);
    setBillError(p => ({ ...p, [tripId]: '' }));
    try {
      await apiFetch(`/v1/tracking/trips/${tripId}/bill-expenses`, { method: 'POST' });
      const rows: TripExpense[] = await apiFetch(`/v1/tracking/trips/${tripId}/expenses`);
      setTripExpenses(p => ({ ...p, [tripId]: rows }));
    } catch (err: any) {
      setBillError(p => ({ ...p, [tripId]: err.message || 'Could not bill this trip.' }));
    } finally {
      setBilling(null);
    }
  }

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/trips')
      .then(setShipments)
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/customers')
      .then((d: any) => setCustomers(d?.data ?? d ?? []))
      .catch(() => setCustomers([]));
  }, [reload]);

  const customerName = (id: string | null) => customers.find(c => c.id === id)?.name ?? '—';

  async function updateStatus(id: string, status: string) {
    // Dispatching to IN_PROGRESS is validated server-side (vehicle out of
    // service, already on another active trip, driver's license expired,
    // etc.) — this used to have no try/catch at all, so a rejected dispatch
    // failed completely silently with the dropdown just reverting on the
    // next reload and no indication to the dispatcher of why.
    try {
      await apiFetch(`/v1/tracking/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this trip\'s status.');
    }
  }

  const filteredShipments = shipments.filter(s => {
    if (filter !== 'All') {
      if (filter === 'Shipped' && s.status !== 'PLANNED') return false;
      if (filter === 'In Transit' && s.status !== 'IN_PROGRESS') return false;
      if (filter === 'Delayed' && s.status !== 'DELAYED') return false;
      if (filter === 'Delivered' && s.status !== 'COMPLETED') return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!s.cargo_desc?.toLowerCase().includes(q) &&
          !s.shipment_ref?.toLowerCase().includes(q) &&
          !customerName(s.customer_id).toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div style={{ padding: '0 0 24px', background: 'var(--bg)', minHeight: '100%', fontFamily: 'var(--font)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <PageHeader
          crumbs={['Tracking', 'Trips']}
          titlePlain="Vehicle"
          titleEm="trips"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
            <input 
              placeholder="Search" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 16px 8px 34px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13, width: 220, outline: 'none' }}
            />
          </div>
          <Link to="/tracking/shipments/new" style={{ padding: '9px 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={14} /> New Trip
          </Link>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 'var(--r)', border: '1px solid var(--border)', boxShadow: 'var(--elev-sm)' }}>
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tabs value={filter} onValueChange={setFilter} variant="segmented">
              <TabsList>
                {['All', 'Shipped', 'In Transit', 'Delayed', 'Delivered'].map(f => (
                  <TabsTrigger key={f} value={f}>{f}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <button style={{ padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="filter" size={12} /> Filter
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="download" size={14} /> Import
            </button>
            <button style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Export <Icon name="upload" size={14} />
            </button>
          </div>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['DETAILS', 'STATUS', 'SHIPPER', 'PICKUP', 'ARRIVAL (PORT)', 'DELIVERY', 'ACTION'].map(h => (
                <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && filteredShipments.map(s => {
              const displayStatus = s.status === 'PLANNED' ? 'Shipped' : s.status === 'IN_PROGRESS' ? 'In Transit' : s.status === 'COMPLETED' ? 'Delivered' : s.status;
              const sc = STATUS_COLORS[s.status] || STATUS_COLORS['PLANNED'];
              
              return (
                <React.Fragment key={s.id}>
                  <tr 
                    onClick={() => setExpandedTrip(expandedTrip === s.id ? null : s.id)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: expandedTrip === s.id ? '#f8fafc' : 'transparent' }}
                  >
                    <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ color: 'var(--ink3)' }}><Icon name="package" size={20} strokeWidth={1.5} /></div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{s.cargo_desc || 'Standard Freight'}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{s.shipment_ref || 'Local route'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                      {displayStatus}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', color: 'var(--ink2)', fontWeight: 500 }}>
                    {s.customer_id ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={s.customer_id} kind="customers" name={customerName(s.customer_id)} size={22} />
                        {customerName(s.customer_id)}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.origin || '—'}</div>
                    <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2 }}>{s.scheduled_start ? new Date(s.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.destination || '—'}</div>
                    <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2 }}>{s.scheduled_end ? new Date(s.scheduled_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                  </td>
                  <td style={{ padding: '16px 20px', color: 'var(--ink2)' }}>
                    {s.status === 'COMPLETED' ? 'Yes' : 'No'}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div className="trk-dropdown-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
                      <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 6px', cursor: 'pointer', color: 'var(--ink2)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        <Icon name="moreVertical" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedTrip === s.id && (
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={7} style={{ padding: '20px' }}>
                      <div style={{ background: '#fff', padding: 20, borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
                        <div>
                          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>Trip Details</h3>
                          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 0', fontSize: 13 }}>
                            <div style={{ color: 'var(--ink3)' }}>Vehicle ID</div>
                            <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{s.vehicle_id || '—'}</div>
                            <div style={{ color: 'var(--ink3)' }}>Driver ID</div>
                            <div style={{ fontWeight: 500 }}>{s.driver_id || '—'}</div>
                            <div style={{ color: 'var(--ink3)' }}>Job Type</div>
                            <div style={{ fontWeight: 500 }}>{s.job_type}</div>
                          </div>
                        </div>
                        <div>
                          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>Update Status</h3>
                          <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 12 }}>
                            <Select value={s.status} onValueChange={(v) => updateStatus(s.id, v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PLANNED">Planned (Shipped)</SelectItem>
                                <SelectItem value="IN_PROGRESS">In Progress (In Transit)</SelectItem>
                                <SelectItem value="DELAYED">Delayed</SelectItem>
                                <SelectItem value="COMPLETED">Completed (Delivered)</SelectItem>
                                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>Expenses → Invoice</h3>
                          {(() => {
                            const rows = tripExpenses[s.id];
                            if (!rows) return <SectionLoading />;
                            const unbilled = rows.filter(r => r.billable && !r.invoice_id);
                            const alreadyBilled = rows.filter(r => r.invoice_id).length;
                            const total = unbilled.reduce((sum, r) => sum + r.amount, 0);
                            return (
                              <div style={{ fontSize: 13 }}>
                                <div style={{ color: 'var(--ink2)', marginBottom: 4 }}>
                                  {unbilled.length} billable expense{unbilled.length === 1 ? '' : 's'} pending — TZS {total.toLocaleString('en')}
                                </div>
                                {alreadyBilled > 0 && <div style={{ color: 'var(--ink3)', fontSize: 12, marginBottom: 8 }}>{alreadyBilled} already invoiced</div>}
                                {billError[s.id] && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{billError[s.id]}</div>}
                                <button
                                  disabled={unbilled.length === 0 || billing === s.id || (!s.customer_id && !s.shipment_ref)}
                                  onClick={() => billTripExpenses(s.id)}
                                  className="btn btn-primary"
                                  style={{ fontSize: 12.5, padding: '6px 14px', opacity: unbilled.length === 0 ? 0.5 : 1 }}
                                  title={!s.customer_id && !s.shipment_ref ? 'This trip has no customer to bill' : undefined}
                                >
                                  {billing === s.id ? 'Billing…' : 'Bill to customer'}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', marginTop: 16, padding: 20, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Border Crossings</h3>
                          <button type="button" onClick={() => setAddingCrossing(a => a === s.id ? null : s.id)}
                            style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <Icon name={addingCrossing === s.id ? 'x' : 'plus'} size={13} /> {addingCrossing === s.id ? 'Cancel' : 'Record crossing'}
                          </button>
                        </div>
                        {addingCrossing === s.id && (
                          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                            <input placeholder="Border name (e.g. Tunduma)" value={crossingForm.border_name}
                              onChange={e => setCrossingForm(f => ({ ...f, border_name: e.target.value }))}
                              style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'var(--font)', flex: 1, minWidth: 140 }} />
                            <input placeholder="From country (e.g. TZ)" value={crossingForm.country_from}
                              onChange={e => setCrossingForm(f => ({ ...f, country_from: e.target.value.toUpperCase() }))}
                              maxLength={3}
                              style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'var(--font)', width: 90 }} />
                            <input placeholder="To country (e.g. ZM)" value={crossingForm.country_to}
                              onChange={e => setCrossingForm(f => ({ ...f, country_to: e.target.value.toUpperCase() }))}
                              maxLength={3}
                              style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'var(--font)', width: 90 }} />
                            <button type="button" onClick={() => recordCrossing(s.id)}
                              style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                              Save
                            </button>
                          </div>
                        )}
                        {!crossings[s.id] ? (
                          <SectionLoading />
                        ) : crossings[s.id].length === 0 ? (
                          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No border crossings recorded for this trip yet — most local trips have none.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {crossings[s.id].map(c => (
                              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)'}}>
                                <span><strong>{c.border_name}</strong> · {c.country_from} → {c.country_to}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ color: CROSSING_STATUS_COLOR[c.status] ?? 'var(--ink3)', fontWeight: 700 }}>{c.status}</span>
                                  {c.status !== 'CLEARED' && (
                                    <button type="button" onClick={() => clearCrossing(s.id, c.id)}
                                      style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                      Mark cleared
                                    </button>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        
        {!loading && filteredShipments.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
            <Icon name="package" size={48} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.5 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink2)' }}>No trips found</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
          </div>
        )}
      </div>
    </div>
  );
};
