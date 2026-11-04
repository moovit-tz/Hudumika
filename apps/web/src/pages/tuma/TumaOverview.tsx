import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Parcel {
  id: string;
  parcel_number: string;
  sender_name: string;
  recipient_name: string;
  status: string;
  created_at: string;
}

const STATUS_BADGE: Record<string, 'info' | 'brand' | 'warning' | 'success' | 'error' | 'gray'> = {
  RECEIVED: 'info', DISPATCHED: 'brand', OFFLOADED: 'warning',
  DELIVERED: 'success', PICKED_UP: 'success', CANCELED: 'error',
};

export function TumaOverview() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tuma/parcels')
      .then(r => setParcels(r.parcels ?? r.rows ?? []))
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }, []);

  const total = parcels.length;
  const inTransit = parcels.filter(p => ['RECEIVED', 'DISPATCHED', 'OFFLOADED'].includes(p.status)).length;
  const delivered = parcels.filter(p => p.status === 'DELIVERED' || p.status === 'PICKED_UP').length;
  const canceled = parcels.filter(p => p.status === 'CANCELED').length;

  const stats = [
    { label: 'Total Parcels', value: total, icon: 'package' as const, color: 'var(--teal)' },
    { label: 'In Transit', value: inTransit, icon: 'truck' as const, color: 'var(--blue)' },
    { label: 'Delivered', value: delivered, icon: 'checkCircle' as const, color: 'var(--green)' },
    { label: 'Canceled', value: canceled, icon: 'close' as const, color: 'var(--red)' },
  ];

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma']}
        titlePlain="Parcel"
        titleEm="logistics"
        subtitle="Booking, dispatch, delivery tracking and agent management."
      />

      {loading ? <SectionLoading /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {stats.map(s => (
              <div key={s.label} style={{
                padding: '20px 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
                background: 'var(--card-bg, var(--bg))', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                }}>
                  <Icon name={s.icon} size={20} style={{ color: s.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <SectionCard title="Recent Parcels" collapsible={false}>
            {parcels.length === 0 ? (
              <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No parcels yet. <Link to="/tuma/parcels" style={{ color: 'var(--teal)' }}>Receive your first parcel</Link>.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr>
                    <th>Parcel #</th><th>Sender</th><th>Recipient</th><th>Status</th><th>Date</th>
                  </tr></thead>
                  <tbody>
                    {parcels.slice(0, 5).map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500 }}><Link to={`/tuma/parcels`} style={{ color: 'var(--teal)' }}>{p.parcel_number}</Link></td>
                        <td>{p.sender_name}</td>
                        <td>{p.recipient_name}</td>
                        <td><Badge variant={STATUS_BADGE[p.status] ?? 'gray'}>{p.status}</Badge></td>
                        <td style={{ color: 'var(--ink2)', fontSize: 13 }}>{formatDate(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
