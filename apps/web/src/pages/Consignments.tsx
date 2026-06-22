import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

interface Consignment {
  id: string;
  consignment_number: string;
  customer_name: string;
  goods_description: string;
  origin_location: string;
  destination_location: string;
  distance_km: number;
  status: string;
  dispatched_at: string | null;
  delivered_at: string | null;
  assigned_driver: string;
  vehicle_registration: string;
  transport_cost: number;
  cost_currency: string;
  created_at: string;
  trips?: any[];
  border_crossings?: any[];
}

type ViewMode = 'list' | 'detail';

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string; icon: IconName }> = {
  PENDING:    { bg: 'rgba(148,163,184,0.12)', color: 'var(--ink2)', label: 'Pending',    icon: 'clock'    },
  DISPATCHED: { bg: 'rgba(59,130,246,0.12)',  color: 'var(--blue)', label: 'Dispatched', icon: 'arrowUp'  },
  IN_TRANSIT: { bg: 'rgba(245,158,11,0.12)',  color: 'var(--gold)', label: 'In Transit', icon: 'truck'    },
  AT_BORDER:  { bg: 'rgba(168,85,247,0.12)',  color: 'var(--purple)', label: 'At Border',  icon: 'stamp'    },
  DELIVERED:  { bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)', label: 'Delivered',  icon: 'check'    },
  CANCELLED:  { bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)', label: 'Cancelled',  icon: 'close'    },
};

const BORDER_STATUS: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: 'rgba(148,163,184,0.12)', color: 'var(--ink2)' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.12)', color: 'var(--gold)' },
  CLEARED: { bg: 'rgba(16,185,129,0.12)', color: 'var(--green)' },
  DELAYED: { bg: 'rgba(239,68,68,0.12)', color: 'var(--red)' },
  REJECTED: { bg: 'rgba(239,68,68,0.2)', color: '#991b1b' },
};

export const Consignments: React.FC = () => {
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get('type'); // 'ROAD' when from Road Freight nav link
  const isMobile = useIsMobile();

  const [view, setView] = useState<ViewMode>('list');
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [selected, setSelected] = useState<Consignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set('status', filterStatus);
      if (typeFilter) qs.set('type', typeFilter);
      const params = qs.toString() ? `?${qs.toString()}` : '';
      const data = await apiFetch(`/v1/consignments${params}`);
      setConsignments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch consignments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: string) => {
    try {
      const data = await apiFetch(`/v1/consignments/${id}`);
      setSelected(data);
      setView('detail');
    } catch (err: any) {
      alert(err.message);
    }
  };

  useEffect(() => { fetchList(); }, [filterStatus]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiFetch(`/v1/consignments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await fetchList();
      if (selected?.id === id) await fetchDetail(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBorderStatusChange = async (borderId: string, status: string) => {
    try {
      const delayReason = status === 'DELAYED' ? prompt('Delay reason?') : undefined;
      await apiFetch(`/v1/consignments/borders/${borderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, delay_reason: delayReason }),
      });
      if (selected) await fetchDetail(selected.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'TZS') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  };

  const statusFilters = ['', 'PENDING', 'DISPATCHED', 'IN_TRANSIT', 'AT_BORDER', 'DELIVERED'];

  return (
    <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px 0' }}>
            🚛 Road Consignments
          </h1>
          <p style={{ color: 'var(--ink2)', fontSize: '14px', margin: 0 }}>
            Track road shipments, trips, and border crossings across East Africa.
          </p>
        </div>
        {view === 'detail' && (
          <button
            onClick={() => { setView('list'); setSelected(null); }}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--ink2)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '9px',
              cursor: 'pointer',
            }}
          >
            ← Back to List
          </button>
        )}
      </div>

      {/* List View */}
      {view === 'list' && (
        <>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {statusFilters.map(s => (
              <button
                key={s || 'ALL'}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '9px',
                  cursor: 'pointer',
                  background: filterStatus === s ? 'var(--ink)' : 'var(--bg)',
                  color: filterStatus === s ? '#fff' : 'var(--ink2)',
                  transition: 'all 0.12s ease',
                }}
              >
                {s ? <>{STATUS_CONFIG[s] && <Icon name={STATUS_CONFIG[s].icon} size={11} />} {s.replace('_', ' ')}</> : <>All</>}
              </button>
            ))}
          </div>

          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total',      count: consignments.length, color: 'var(--blue)', icon: 'package'  as IconName },
              { label: 'In Transit', count: consignments.filter(c => ['DISPATCHED', 'IN_TRANSIT'].includes(c.status)).length, color: 'var(--gold)', icon: 'truck'  as IconName },
              { label: 'At Border',  count: consignments.filter(c => c.status === 'AT_BORDER').length,  color: 'var(--purple)', icon: 'stamp'  as IconName },
              { label: 'Delivered',  count: consignments.filter(c => c.status === 'DELIVERED').length,  color: 'var(--green)', icon: 'check'  as IconName },
            ].map((kpi, i) => (
              <div key={i} style={{
                background: 'var(--white)',
                borderRadius: '9px',
                padding: '16px',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <div style={{ color: kpi.color, display: 'flex', alignItems: 'center' }}><Icon name={kpi.icon} size={26} strokeWidth={1.5} /></div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: kpi.color }}>{kpi.count}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600 }}>{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Consignment Table */}
          <div style={{
            background: 'var(--white)',
            borderRadius: '9px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {consignments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Icon name="truck" size={48} strokeWidth={1} /></div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>No road consignments found</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Create a consignment via the API to get started.</div>
              </div>
            ) : (
              <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Consignment #', 'Customer', 'Route', 'Driver', 'Vehicle', 'Cost', 'Status', 'Created'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {consignments.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => fetchDetail(c.id)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 600, fontFamily: 'monospace', color: 'var(--teal)' }}>
                          {c.consignment_number}
                        </td>
                        <td style={{ padding: '12px 14px' }}>{c.customer_name}</td>
                        <td style={{ padding: '12px 14px', fontSize: '12px' }}>
                          {c.origin_location} → {c.destination_location}
                          {c.distance_km && <span style={{ color: 'var(--ink3)' }}> ({c.distance_km} km)</span>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>{c.assigned_driver || '—'}</td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px' }}>{c.vehicle_registration || '—'}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                          {c.transport_cost ? formatCurrency(c.transport_cost, c.cost_currency) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '9px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: STATUS_CONFIG[c.status]?.bg || 'var(--bg)',
                            color: STATUS_CONFIG[c.status]?.color || 'var(--ink2)',
                          }}>
                            {STATUS_CONFIG[c.status] && <Icon name={STATUS_CONFIG[c.status].icon} size={11} />} {STATUS_CONFIG[c.status]?.label || c.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--ink3)' }}>
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail View */}
      {view === 'detail' && selected && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: '24px' }}>
          {/* Main Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
              background: 'var(--white)',
              borderRadius: '9px',
              border: '1px solid var(--border)',
              padding: '24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--teal)', fontWeight: 600 }}>
                    {selected.consignment_number}
                  </div>
                  <h2 style={{ margin: '4px 0', fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
                    {selected.goods_description || 'Road Consignment'}
                  </h2>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>
                    <Icon name="building" size={13} /> {selected.customer_name}
                  </div>
                </div>
                <span style={{
                  padding: '6px 14px',
                  borderRadius: '9px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: STATUS_CONFIG[selected.status]?.bg,
                  color: STATUS_CONFIG[selected.status]?.color,
                }}>
                  {STATUS_CONFIG[selected.status] && <Icon name={STATUS_CONFIG[selected.status].icon} size={13} />} {STATUS_CONFIG[selected.status]?.label}
                </span>
              </div>

              {/* Route Visual */}
              <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'linear-gradient(135deg, rgba(11,114,100,0.04), rgba(59,130,246,0.04))',
                borderRadius: '9px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="mapPin" size={11} /> ORIGIN</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{selected.origin_location}</div>
                </div>
                <div style={{
                  flex: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--ink3)',
                  fontSize: '12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}>
                  ———— <Icon name="truck" size={14} /> {selected.distance_km ? `${selected.distance_km} km` : ''} ————→
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}><Icon name="mapPin" size={11} /> DESTINATION</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{selected.destination_location}</div>
                </div>
              </div>
            </div>

            {/* Border Crossings */}
            <div style={{
              background: 'var(--white)',
              borderRadius: '9px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                  <Icon name="stamp" size={14} /> Border Crossings
                </h3>
              </div>
              {(!selected.border_crossings || selected.border_crossings.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink3)' }}>
                  <div style={{ marginBottom: '8px', color: 'var(--ink3)' }}><Icon name="stamp" size={36} strokeWidth={1} /></div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>No border crossings logged</div>
                </div>
              ) : (
                <div style={{ padding: '16px 20px' }}>
                  {selected.border_crossings.map((bc: any, i: number) => (
                    <div key={bc.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '14px',
                      borderRadius: '9px',
                      background: 'var(--bg)',
                      marginBottom: i < selected.border_crossings!.length - 1 ? '10px' : 0,
                    }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: BORDER_STATUS[bc.status]?.bg || 'var(--bg)',
                        color: BORDER_STATUS[bc.status]?.color || 'var(--ink2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '16px',
                        flexShrink: 0,
                      }}>
                        <Icon name="stamp" size={18} strokeWidth={1.5} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{bc.border_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink2)' }}>
                          {bc.country_from} → {bc.country_to}
                          {bc.customs_ref && <span style={{ marginLeft: '8px', fontFamily: 'monospace', color: 'var(--ink3)' }}>Ref: {bc.customs_ref}</span>}
                        </div>
                        {bc.delay_reason && (
                          <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '2px' }}>
                            <Icon name="warning" size={11} /> {bc.delay_reason}
                          </div>
                        )}
                      </div>
                      <div>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '9px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: BORDER_STATUS[bc.status]?.bg || 'var(--bg)',
                          color: BORDER_STATUS[bc.status]?.color || 'var(--ink2)',
                        }}>
                          {bc.status}
                        </span>
                      </div>
                      {bc.status !== 'CLEARED' && bc.status !== 'REJECTED' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => handleBorderStatusChange(bc.id, 'CLEARED')} style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, background: 'rgba(16,185,129,0.1)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '4px', cursor: 'pointer' }}>
                            ✓ Clear
                          </button>
                          <button onClick={() => handleBorderStatusChange(bc.id, 'DELAYED')} style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', cursor: 'pointer' }}>
                            <Icon name="warning" size={10} /> Delay
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trip Legs */}
            <div style={{
              background: 'var(--white)',
              borderRadius: '9px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                  <Icon name="map" size={14} /> Trip Legs
                </h3>
              </div>
              {(!selected.trips || selected.trips.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink3)' }}>
                  <div style={{ marginBottom: '8px', color: 'var(--ink3)' }}><Icon name="map" size={36} strokeWidth={1} /></div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>No trip legs added</div>
                </div>
              ) : (
                <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                  <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        {['#', 'From', 'To', 'Distance', 'Driver', 'Vehicle', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.trips.map((trip: any) => (
                        <tr key={trip.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{trip.trip_number}</td>
                          <td style={{ padding: '10px 14px' }}>{trip.from_location}</td>
                          <td style={{ padding: '10px 14px' }}>{trip.to_location}</td>
                          <td style={{ padding: '10px 14px' }}>{trip.distance_km ? `${trip.distance_km} km` : '—'}</td>
                          <td style={{ padding: '10px 14px' }}>{trip.driver_name || '—'}</td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px' }}>{trip.vehicle || '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: trip.status === 'COMPLETED' ? 'rgba(16,185,129,0.12)' : trip.status === 'IN_PROGRESS' ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.12)',
                              color: trip.status === 'COMPLETED' ? 'var(--green)' : trip.status === 'IN_PROGRESS' ? 'var(--gold)' : 'var(--ink2)',
                            }}>
                              {trip.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Actions Sidebar */}
          <div>
            <div style={{
              background: 'var(--white)',
              borderRadius: '9px',
              border: '1px solid var(--border)',
              padding: '20px',
              position: 'sticky',
              top: '24px',
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                <Icon name="zap" size={13} /> Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selected.status === 'PENDING' && (
                  <button onClick={() => handleStatusChange(selected.id, 'DISPATCHED')} style={{
                    padding: '10px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                    background: 'var(--blue)', color: '#fff',
                  }}>
                    <Icon name="arrowUp" size={13} /> Dispatch
                  </button>
                )}
                {selected.status === 'DISPATCHED' && (
                  <button onClick={() => handleStatusChange(selected.id, 'IN_TRANSIT')} style={{
                    padding: '10px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                    background: 'var(--gold)', color: '#fff',
                  }}>
                    <Icon name="truck" size={13} /> Mark In Transit
                  </button>
                )}
                {['DISPATCHED', 'IN_TRANSIT', 'AT_BORDER'].includes(selected.status) && (
                  <>
                    <button onClick={() => handleStatusChange(selected.id, 'AT_BORDER')} style={{
                      padding: '10px', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '9px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                      background: 'rgba(124,58,237,0.08)', color: 'var(--purple)',
                    }}>
                      <Icon name="stamp" size={13} /> At Border
                    </button>
                    <button onClick={() => handleStatusChange(selected.id, 'DELIVERED')} style={{
                      padding: '10px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                      background: 'var(--green)', color: '#fff',
                    }}>
                      <Icon name="check" size={13} /> Mark Delivered
                    </button>
                  </>
                )}
              </div>

              {/* Consignment Info */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '10px', fontWeight: 600 }}>DETAILS</div>
                {[
                  { label: 'Driver', value: selected.assigned_driver || '—' },
                  { label: 'Vehicle', value: selected.vehicle_registration || '—' },
                  { label: 'Distance', value: selected.distance_km ? `${selected.distance_km} km` : '—' },
                  { label: 'Cost', value: selected.transport_cost ? formatCurrency(selected.transport_cost, selected.cost_currency) : '—' },
                  { label: 'Dispatched', value: selected.dispatched_at ? new Date(selected.dispatched_at).toLocaleDateString() : '—' },
                  { label: 'Delivered', value: selected.delivered_at ? new Date(selected.delivered_at).toLocaleDateString() : '—' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink3)' }}>{item.label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
