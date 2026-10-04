import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';

interface Vehicle { id: string; name: string }
interface Alert {
  id: string; vehicle_id: string | null; alert_type: string; severity: string;
  message: string; acknowledged: boolean; created_at: string;
}

const SEVERITY_VARIANT: Record<string, 'info' | 'warning' | 'error'> = {
  INFO: 'info', WARNING: 'warning', CRITICAL: 'error',
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
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Alerts']}
            titlePlain="Fleet"
            titleEm="alerts"
            subtitle="Speeding, geofence breach, maintenance &amp; document alerts"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
          <Checkbox checked={showAcknowledged} onCheckedChange={c => setShowAcknowledged(c === true)} />
          Show acknowledged
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!loading && alerts.map(a => {
          const severityVariant = SEVERITY_VARIANT[a.severity] ?? 'info';
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 18px', opacity: a.acknowledged ? 0.6 : 1 }}>
              <FeaturedIcon variant={severityVariant} size="sm">
                <Icon name="alertTriangle" size={16} />
              </FeaturedIcon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <Badge variant={severityVariant}>{a.alert_type.replace('_', ' ')}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{vehicleName(a.vehicle_id)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
              {!a.acknowledged && (
                <Button type="button" variant="outline" size="sm" onClick={() => acknowledge(a.id)} style={{ flexShrink: 0 }}>
                  Acknowledge
                </Button>
              )}
            </div>
          );
        })}
        {!loading && alerts.length === 0 && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            No {showAcknowledged ? '' : 'unacknowledged '}alerts.
          </div>
        )}
      </div>
    </div>
  );
};
