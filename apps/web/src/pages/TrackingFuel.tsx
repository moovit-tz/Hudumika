import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface FuelLog {
  id: string; vehicle_id: string; driver_id: string | null; liters: number;
  cost: number | null; odometer_km: number | null; station: string | null; logged_at: string;
  vehicle_name: string | null; vehicle_plate: string | null; driver_name: string | null;
}

export const TrackingFuel: React.FC = () => {
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/fuel').then(setLogs).catch(() => setLogs([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function remove(id: string) {
    if (!(await showConfirm('Delete this fuel entry?', { confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/tracking/fuel/${id}`, { method: 'DELETE' });
    reload();
  }

  const totalCost = logs.reduce((s, l) => s + (l.cost ?? 0), 0);
  const totalLiters = logs.reduce((s, l) => s + l.liters, 0);

  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Fuel']}
            titlePlain="Fuel"
            titleEm="log"
            subtitle={<>{totalLiters.toFixed(1)} L logged · {totalCost.toLocaleString()} total cost</>}
          />
        </div>
        <Link to="/tracking/fuel/new"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: '9px 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          <Icon name="plus" size={15} /> Log fuel entry
        </Link>
      </div>

      <SectionCard>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Vehicle', 'Driver', 'Liters', 'Cost', 'Odometer', 'Station', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && logs.map(l => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{l.vehicle_name ?? '—'}{l.vehicle_plate ? ` (${l.vehicle_plate})` : ''}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.driver_name ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.liters} L</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.cost != null ? l.cost.toLocaleString() : '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.odometer_km != null ? `${l.odometer_km} km` : '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.station || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)', fontSize: 12 }}>{new Date(l.logged_at).toLocaleDateString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button type="button" onClick={() => remove(l.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                    <Icon name="close" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && logs.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No fuel entries yet.</div>
        )}
      </SectionCard>
    </div>
  );
};
