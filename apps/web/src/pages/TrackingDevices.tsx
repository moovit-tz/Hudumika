import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Vehicle {
  id: string; name: string; device_id: string | null; status: string;
  last_position: { recorded_at: string } | null;
}

interface GpswoxStatus {
  configured: boolean;
  last_sync: {
    ok: boolean; reason?: string; matched: number; unmatched: string[];
    offline_alerts_created: number; synced_at: string;
  } | null;
}

const STALE_MS = 2 * 60 * 60 * 1000;

export const TrackingDevices: React.FC = () => {
  const [status, setStatus] = useState<GpswoxStatus | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/tracking/gpswox/status').catch(() => null),
      apiFetch('/v1/tracking/vehicles').catch(() => []),
    ]).then(([s, v]) => { setStatus(s); setVehicles(v ?? []); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function syncNow() {
    setSyncing(true); setSyncError(null);
    try {
      const res = await apiFetch('/v1/tracking/gpswox/sync-now', { method: 'POST' });
      if (!res.ok) setSyncError(res.reason === 'login_failed' ? 'Login failed — check credentials.' : res.reason === 'not_configured' ? 'GPSWOX is not configured yet.' : 'Could not reach GPSWOX.');
      reload();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const mapped = vehicles.filter(v => v.device_id);
  const unmapped = vehicles.filter(v => !v.device_id);
  const configured = status?.configured ?? false;
  const lastSync = status?.last_sync;

  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Devices']}
            titlePlain="Tracking"
            titleEm="devices"
            subtitle="Live GPS device sync status and vehicle mapping"
          />
        </div>
        <button type="button" onClick={syncNow} disabled={syncing || !configured}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: configured ? 'pointer' : 'default', opacity: configured ? 1 : 0.5, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="refresh" size={15} /> {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
      <SectionCard title="Connection Status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: configured ? 12 : 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: configured ? '#059669' : '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{configured ? 'Connected' : 'Not connected'}</span>
          {!configured && !loading && (
            <Link to="/settings?s=int-gpswox" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginLeft: 4 }}>Configure in Settings →</Link>
          )}
        </div>

        {syncError && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{syncError}</div>
        )}

        {configured && lastSync && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Last sync</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>{new Date(lastSync.synced_at).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Outcome</div>
              <div style={{ fontSize: 13, color: lastSync.ok ? '#059669' : '#dc2626', marginTop: 2, fontWeight: 600 }}>
                {lastSync.ok ? 'Success' : (lastSync.reason ?? 'Failed')}
              </div>
            </div>
            {lastSync.ok && (
              <>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Matched devices</div>
                  <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>{lastSync.matched}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Unmatched devices</div>
                  <div style={{ fontSize: 13, color: lastSync.unmatched.length > 0 ? '#ca8a04' : 'var(--ink)', marginTop: 2 }}>{lastSync.unmatched.length}</div>
                </div>
              </>
            )}
          </div>
        )}

        {configured && lastSync?.unmatched && lastSync.unmatched.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink3)' }}>
            Unmatched GPSWOX device IDs (no vehicle has this Device ID): {lastSync.unmatched.join(', ')}
          </div>
        )}
      </SectionCard>
      </div>

      <SectionCard title="Vehicle ↔ Device Mapping">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Vehicle', 'Device ID', 'Last position', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && mapped.map(v => {
              const recordedAt = v.last_position?.recorded_at;
              const stale = !recordedAt || (Date.now() - new Date(recordedAt).getTime()) > STALE_MS;
              return (
                <tr key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{v.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{v.device_id}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{recordedAt ? new Date(recordedAt).toLocaleString() : 'Never'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: stale ? '#fef2f2' : '#ecfdf5', color: stale ? '#dc2626' : '#065f46' }}>
                      {stale ? 'Stale' : 'Live'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && mapped.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No vehicles have a Device ID set yet.</div>
        )}
      </SectionCard>

      {!loading && unmapped.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink3)' }}>
          {unmapped.length} vehicle{unmapped.length === 1 ? '' : 's'} without a Device ID ({unmapped.map(v => v.name).join(', ')}) — set one on the vehicle's edit form to include it in GPSWOX sync.
        </div>
      )}
    </div>
  );
};
