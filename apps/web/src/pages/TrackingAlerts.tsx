import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';

interface Vehicle { id: string; name: string }
interface Alert {
  id: string; vehicle_id: string | null; alert_type: string; severity: string;
  message: string; acknowledged: boolean; created_at: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  INFO: { bg: '#e0f2fe', fg: '#0284c7' },
  WARNING: { bg: '#fef9c3', fg: '#ca8a04' },
  CRITICAL: { bg: '#fee2e2', fg: '#dc2626' },
};

export const TrackingAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/tracking/alerts${showAcknowledged ? '' : '?acknowledged=false'}`)
      .then(setAlerts).catch(() => setAlerts([])).finally(() => setLoading(false));
  }, [showAcknowledged]);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, [reload]);

  const vehicleName = (id: string | null) => vehicles.find(v => v.id === id)?.name ?? 'Fleet-wide';

  async function acknowledge(id: string) {
    await apiFetch(`/v1/tracking/alerts/${id}/acknowledge`, { method: 'PATCH', body: JSON.stringify({}) });
    reload();
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Alerts</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>Speeding, geofence breach, maintenance &amp; document alerts</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAcknowledged} onChange={e => setShowAcknowledged(e.target.checked)} />
          Show acknowledged
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!loading && alerts.map(a => {
          const sc = SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.INFO;
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 18px', opacity: a.acknowledged ? 0.6 : 1 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="alertTriangle" size={16} color={sc.fg} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px', background: sc.bg, color: sc.fg }}>{a.alert_type.replace('_', ' ')}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{vehicleName(a.vehicle_id)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
              {!a.acknowledged && (
                <button type="button" onClick={() => acknowledge(a.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}>
                  Acknowledge
                </button>
              )}
            </div>
          );
        })}
        {!loading && alerts.length === 0 && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            No {showAcknowledged ? '' : 'unacknowledged '}alerts.
          </div>
        )}
      </div>
    </div>
  );
};
