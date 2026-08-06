import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

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

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  PLANNED:     { bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8' },
  IN_PROGRESS: { bg: 'var(--green-l)', fg: '#059669', dot: '#10b981' },
  COMPLETED:   { bg: 'var(--blue-l)', fg: '#2563eb', dot: '#3b82f6' },
  CANCELLED:   { bg: 'var(--red-l)', fg: '#dc2626', dot: '#ef4444' },
  DELAYED:     { bg: 'var(--gold-l)', fg: '#d97706', dot: '#f59e0b' },
};

export const TrackingShipments: React.FC = () => {
  const [shipments, setShipments] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

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
    await apiFetch(`/v1/tracking/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    reload();
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
              style={{ padding: '8px 16px 8px 34px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 220, outline: 'none' }}
            />
          </div>
          <Link to="/tracking/shipments/new" style={{ padding: '9px 16px', background: 'var(--teal)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={14} /> New Trip
          </Link>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--elev-sm)' }}>
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['All', 'Shipped', 'In Transit', 'Delayed', 'Delivered'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${filter === f ? 'var(--teal)' : 'var(--border)'}`,
                  background: filter === f ? 'var(--teal)' : '#fff',
                  color: filter === f ? '#fff' : 'var(--ink2)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
              >
                {f}
              </button>
            ))}
            <button style={{ padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                      {displayStatus}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', color: 'var(--ink2)', fontWeight: 500 }}>
                    {customerName(s.customer_id)}
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
                      <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
