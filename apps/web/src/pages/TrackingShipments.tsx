import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
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

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'info' | 'error' | 'warning'> = {
  PLANNED: 'gray', IN_PROGRESS: 'success', COMPLETED: 'info',
  CANCELLED: 'error', DELAYED: 'warning',
};

export const TrackingShipments: React.FC = () => {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

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
    <div style={{ padding: '0 0 24px', background: 'transparent', minHeight: '100%', fontFamily: 'var(--font)' }}>
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

      <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', boxShadow: 'var(--elev-sm)' }}>
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                {['All', 'Shipped', 'In Transit', 'Delayed', 'Delivered'].map(f => (
                  <TabsTrigger key={f} value={f}>{f}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <button style={{ padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
              <Icon name="filter" size={12} /> Filter
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
              <Icon name="download" size={14} /> Import
            </button>
            <button style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
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
              const statusVariant = STATUS_VARIANT[s.status] ?? 'gray';
              
              return (
                <React.Fragment key={s.id}>
                  <tr
                    onClick={() => navigate(`/tracking/shipments/${s.id}`)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: 'transparent' }}
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
                    <Badge variant={statusVariant} className="inline-flex items-center gap-1.5">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                      {displayStatus}
                    </Badge>
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
                      <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 6px', cursor: 'pointer', color: 'var(--ink2)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                        <Icon name="moreVertical" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
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
