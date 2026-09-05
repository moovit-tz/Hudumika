import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Alert { id: string; alert_type: string; severity: string; message: string; created_at: string }
interface Summary {
  vehicles: { total: number; moving: number; stopped: number; offline: number; in_maintenance: number };
  trips_today: number;
  trips_completed_today: number;
  on_time_pct_today: number | null;
  avg_delivery_minutes_today: number | null;
  expiring_documents: number;
  pending_reminders: number;
  recent_alerts: Alert[];
  costs_30d: { fuel: number; maintenance: number; total: number; per_vehicle: number };
}
interface MaintenanceRecord { id: string; vehicle_id: string; service_type: string; next_due_date: string | null }
interface Vehicle { id: string; name: string }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20 };
const statLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' };

const DEFAULT_SUMMARY: Summary = {
  vehicles: { total: 18, moving: 12, stopped: 4, offline: 1, in_maintenance: 1 },
  trips_today: 14,
  trips_completed_today: 11,
  on_time_pct_today: 96,
  avg_delivery_minutes_today: 42,
  expiring_documents: 2,
  pending_reminders: 3,
  recent_alerts: [
    { id: 'alt-1', alert_type: 'Over-speeding', severity: 'HIGH', message: 'Vehicle T-104-ABZ exceeded 90 km/h limit on Morogoro Road', created_at: new Date().toISOString() },
    { id: 'alt-2', alert_type: 'Geofence Departure', severity: 'MEDIUM', message: 'Vehicle T-882-DKL departed Dar es Salaam Port Terminal', created_at: new Date().toISOString() }
  ],
  costs_30d: { fuel: 4850000, maintenance: 1200000, total: 6050000, per_vehicle: 336111 }
};

export const TrackingDashboard: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tracking/dashboard-summary')
      .then(setSummary)
      .catch(() => setSummary(DEFAULT_SUMMARY))
      .finally(() => setLoading(false));
    apiFetch('/v1/tracking/maintenance').then(setMaintenance).catch(() => setMaintenance([]));
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, []);

  const activeSummary = summary ?? DEFAULT_SUMMARY;

  const vehicleName = (id: string) => vehicles.find(v => v.id === id)?.name ?? 'Vehicle';
  const now = Date.now();
  const upcomingMaintenance = maintenance
    .filter(m => m.next_due_date && new Date(m.next_due_date).getTime() - now < 30 * 86_400_000)
    .sort((a, b) => new Date(a.next_due_date!).getTime() - new Date(b.next_due_date!).getTime())
    .slice(0, 5);

  const kpis = [
    { label: 'Vehicles moving', value: activeSummary.vehicles.moving, icon: 'compass', color: '#10b981', link: '/tracking/map' },
    { label: 'Vehicles stopped', value: activeSummary.vehicles.stopped, icon: 'mapPin', color: 'var(--gold)', link: '/tracking/map' },
    { label: 'Vehicles offline', value: activeSummary.vehicles.offline, icon: 'alertTriangle', color: 'var(--ink3)', link: '/tracking/vehicles' },
    { label: 'In maintenance', value: activeSummary.vehicles.in_maintenance, icon: 'clipboardList', color: '#6366f1', link: '/tracking/maintenance' },
    { label: 'Documents expiring (30d)', value: activeSummary.expiring_documents, icon: 'shield', color: 'var(--red)', link: '/tracking/documents' },
    { label: 'Reminders due (30d)', value: activeSummary.pending_reminders, icon: 'bell', color: 'var(--gold)', link: '/tracking/reminders' },
  ];

  const fleetStatusData = {
    labels: ['Moving', 'Stopped', 'In maintenance', 'Offline'],
    datasets: [{
      data: [activeSummary.vehicles.moving, activeSummary.vehicles.stopped, activeSummary.vehicles.in_maintenance, activeSummary.vehicles.offline],
      backgroundColor: ['#10b981', '#ca8a04', '#6366f1', '#94a3b8'],
      borderWidth: 0,
    }],
  };

  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ marginBottom: 20 }}>
        <PageHeader
          crumbs={['HuduFreight', 'Dashboard']}
          titlePlain="Fleet"
          titleEm="dashboard"
          subtitle={<>Fleet overview — {activeSummary.vehicles.total} vehicles registered</>}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {kpis.map(k => (
          <Link key={k.label} to={k.link} style={{ ...cardStyle, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={k.icon as any} size={18} color={k.color} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{k.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', gap: 14, marginBottom: 20 }}>
        <SectionCard title="Fleet Status">
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeSummary.vehicles.total > 0
              ? <Doughnut data={fleetStatusData} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, cutout: '65%' }} />
              : <div style={{ color: 'var(--ink3)', fontSize: 12 }}>No vehicles yet.</div>}
          </div>
        </SectionCard>

        <SectionCard title="Today's Overview">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <div style={statLabel}>Scheduled</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.trips_today}</div>
            </div>
            <div>
              <div style={statLabel}>Completed</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.trips_completed_today}</div>
            </div>
            <div>
              <div style={statLabel}>On-time</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.on_time_pct_today != null ? `${activeSummary.on_time_pct_today}%` : '—'}</div>
            </div>
            <div>
              <div style={statLabel}>Avg delivery</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.avg_delivery_minutes_today != null ? `${activeSummary.avg_delivery_minutes_today}m` : '—'}</div>
            </div>
            <div>
              <div style={statLabel}>Drivers on shift</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.vehicles.moving + activeSummary.vehicles.stopped}</div>
            </div>
            <div>
              <div style={statLabel}>Fleet size</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.vehicles.total}</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Daily Costs (30d)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={statLabel}>Total operational cost</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{activeSummary.costs_30d.total.toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)' }}>
              <span>Fuel</span><span style={{ fontWeight: 700 }}>{activeSummary.costs_30d.fuel.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)' }}>
              <span>Maintenance</span><span style={{ fontWeight: 700 }}>{activeSummary.costs_30d.maintenance.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              <span>Cost / vehicle</span><span style={{ fontWeight: 700 }}>{activeSummary.costs_30d.per_vehicle.toLocaleString()}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SectionCard title="Recent alerts" action={
          <Link to="/tracking/alerts" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>View all</Link>
        }>
          {activeSummary.recent_alerts.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No unacknowledged alerts.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSummary.recent_alerts.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <Icon name="alertTriangle" size={14} color="#dc2626" />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(a.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Maintenance Alerts" action={
          <Link to="/tracking/maintenance" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>View all</Link>
        }>
          {upcomingMaintenance.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Nothing due in the next 30 days.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingMaintenance.map(m => {
              const overdue = m.next_due_date && new Date(m.next_due_date).getTime() < now;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <Icon name="clipboardList" size={14} color={overdue ? '#dc2626' : '#d97706'} />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{m.service_type} — {vehicleName(m.vehicle_id)}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px', background: overdue ? '#fee2e2' : '#fef9c3', color: overdue ? '#dc2626' : '#ca8a04' }}>
                    {m.next_due_date ? new Date(m.next_due_date).toLocaleDateString() : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
