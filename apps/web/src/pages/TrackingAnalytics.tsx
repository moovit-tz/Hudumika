import React, { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);

interface VehicleScore { vehicle_id: string; name: string; score: number }
interface Analytics {
  fleet_health_score: number;
  health_breakdown: Record<string, number>;
  vehicle_scores: VehicleScore[];
  cost_breakdown: { fuel: number; maintenance: number };
  fuel_by_month: { month: string; cost: number; liters: number }[];
  on_time_trip_pct: number | null;
  documents_expiring_30d: number;
  vehicle_status_breakdown: { active: number; out_of_service: number; rented: number };
  total_cost_by_month: { month: string; fuel: number; service: number; total: number }[];
  cost_per_km_by_month: { month: string; cost_per_km: number }[];
  latest_meter_readings: { vehicle_name: string; reading_km: number; recorded_at: string; source: string }[];
  on_time_service_compliance: { all_time_pct: number | null; last_30d_pct: number | null };
  overdue_service_count: number;
  work_orders: { scheduled: number; overdue: number };
  issues_summary: {
    total: number; by_status: Record<string, number>; by_severity: Record<string, number>;
    avg_resolution_hours: number | null; overdue: number;
  };
}

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 20 };
const BUCKET_COLORS: Record<string, string> = { Excellent: '#10b981', Good: '#84cc16', Fair: '#eab308', Poor: '#f97316', Critical: '#dc2626' };

function HealthGauge({ score }: { score: number }) {
  const radius = 70, stroke = 14;
  const circumference = Math.PI * radius; // half circle
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#84cc16' : score >= 40 ? '#eab308' : score >= 20 ? '#f97316' : '#dc2626';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : score >= 20 ? 'Poor' : 'Critical';
  return (
    <svg width={180} height={100} viewBox="0 0 180 100">
      <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="var(--bg)" strokeWidth={stroke} strokeLinecap="round" />
      <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)} />
      <text x="90" y="70" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--ink)">{score}</text>
      <text x="90" y="90" textAnchor="middle" fontSize="11" fill={color} fontWeight="700">{label}</text>
    </svg>
  );
}

function UpgradeEmptyState({ feature }: { feature: string }) {
  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ background: 'var(--white)', border: '1px dashed var(--border)', borderRadius: 9, padding: '60px 20px', textAlign: 'center' }}>
        <Icon name="lock" size={28} color="var(--ink3)" />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 12 }}>{feature} is an Enterprise feature</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 6 }}>Upgrade your plan to unlock this tool.</div>
        <a href="/subscription" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 9, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          View plans
        </a>
      </div>
    </div>
  );
}

export const TrackingAnalytics: React.FC = () => {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    apiFetch('/v1/tracking/analytics')
      .then(setData)
      .catch((e: any) => { if (e.message?.includes('plan')) setLocked(true); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Loading analytics…</div>;
  if (locked || !data) return <UpgradeEmptyState feature="Fleet Analytics" />;

  const breakdownData = {
    labels: Object.keys(data.health_breakdown),
    datasets: [{ data: Object.values(data.health_breakdown), backgroundColor: Object.keys(data.health_breakdown).map(k => BUCKET_COLORS[k]), borderWidth: 0 }],
  };

  const trendData = {
    labels: data.vehicle_scores.map(v => v.name),
    datasets: [{ label: 'Health score', data: data.vehicle_scores.map(v => v.score), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.25, pointRadius: 3 }],
  };

  const fuelTrendData = {
    labels: data.fuel_by_month.map(f => f.month),
    datasets: [{ label: 'Fuel cost', data: data.fuel_by_month.map(f => f.cost), backgroundColor: '#0891b2' }],
  };

  const costData = {
    labels: ['Fuel', 'Maintenance'],
    datasets: [{ data: [data.cost_breakdown.fuel, data.cost_breakdown.maintenance], backgroundColor: ['#0891b2', '#d97706'], borderWidth: 0 }],
  };

  const totalCostData = {
    labels: data.total_cost_by_month.map(c => c.month),
    datasets: [{ label: 'Total cost', data: data.total_cost_by_month.map(c => c.total), backgroundColor: '#7c3aed' }],
  };

  const serviceCostData = {
    labels: data.total_cost_by_month.map(c => c.month),
    datasets: [{ label: 'Service cost', data: data.total_cost_by_month.map(c => c.service), backgroundColor: '#d97706' }],
  };

  const costPerKmData = {
    labels: data.cost_per_km_by_month.map(c => c.month),
    datasets: [{ label: 'Cost / km', data: data.cost_per_km_by_month.map(c => c.cost_per_km), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.25, pointRadius: 3 }],
  };

  const vehicleStatusItems: { label: string; value: number; color: string }[] = [
    { label: 'Active', value: data.vehicle_status_breakdown.active, color: '#7c3aed' },
    { label: 'Out of Service', value: data.vehicle_status_breakdown.out_of_service, color: 'var(--gold)' },
    { label: 'Rented', value: data.vehicle_status_breakdown.rented, color: '#059669' },
  ];

  return (
    <div style={{ padding: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <PageHeader
          crumbs={['HuduFreight', 'Analytics']}
          titlePlain="Fleet"
          titleEm="analytics"
          subtitle="Fleet health, cost &amp; on-time performance"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        <SectionCard title="Fleet Health Score">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <HealthGauge score={data.fleet_health_score} />
          </div>
        </SectionCard>
        <SectionCard title="Health Score Breakdown">
          <div style={{ height: 150 }}>
            <Doughnut data={breakdownData} options={{ plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }, cutout: '60%' }} />
          </div>
        </SectionCard>
        <SectionCard>
          <div style={statBlock}>On-time trips</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{data.on_time_trip_pct != null ? `${data.on_time_trip_pct}%` : '—'}</div>
          <div style={{ ...statBlock, marginTop: 16 }}>Docs expiring (30d)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{data.documents_expiring_30d}</div>
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Health Score by Vehicle">
          <div style={{ height: 230 }}>
            <Line data={trendData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }} />
          </div>
        </SectionCard>
        <SectionCard title="Fuel Consumption Trend">
          <div style={{ height: 230 }}>
            <Bar data={fuelTrendData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </SectionCard>
      </div>

      <div style={{ maxWidth: 400, marginBottom: 20 }}>
      <SectionCard title="Cost Performance (90d)">
        <div style={{ height: 180 }}>
          <Doughnut data={costData} options={{ plugins: { legend: { position: 'bottom' } }, cutout: '55%' }} />
        </div>
      </SectionCard>
      </div>

      {/* ── Fleet operations widgets ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Fleet Operations</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>Costs, compliance &amp; work orders across the fleet</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Vehicle Status">
          {vehicleStatusItems.map(it => (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, display: 'inline-block' }} /> {it.label}
              </span>
              <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{it.value}</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="On-Time Service Compliance">
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#059669' }}>{data.on_time_service_compliance.all_time_pct != null ? `${data.on_time_service_compliance.all_time_pct}%` : '—'}</div>
              <div style={statBlock}>All Time</div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#059669' }}>{data.on_time_service_compliance.last_30d_pct != null ? `${data.on_time_service_compliance.last_30d_pct}%` : '—'}</div>
              <div style={statBlock}>Last 30 Days</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Active Work Orders">
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink2)' }}>Scheduled</span><span style={{ fontWeight: 800, color: 'var(--ink)' }}>{data.work_orders.scheduled}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink2)' }}>Overdue</span><span style={{ fontWeight: 800, color: data.work_orders.overdue > 0 ? '#dc2626' : 'var(--ink)' }}>{data.work_orders.overdue}</span>
          </div>
        </SectionCard>

        <SectionCard>
          <div style={statBlock}>Overdue Service Items</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: data.overdue_service_count > 0 ? '#dc2626' : 'var(--ink)' }}>{data.overdue_service_count}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6 }}>Vehicles past their next-due service date</div>
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Issues by Status">
          {Object.entries(data.issues_summary.by_status).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--ink2)' }}>{status.replace('_', ' ')}</span>
              <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{count}</span>
            </div>
          ))}
        </SectionCard>
        <SectionCard title="Issues by Priority">
          {Object.entries(data.issues_summary.by_severity).map(([sev, count]) => (
            <div key={sev} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--ink2)' }}>{sev.charAt(0) + sev.slice(1).toLowerCase()}</span>
              <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{count}</span>
            </div>
          ))}
        </SectionCard>
        <SectionCard title="Issue Resolution">
          <div style={statBlock}>Avg. resolution time</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 12 }}>{data.issues_summary.avg_resolution_hours != null ? `${data.issues_summary.avg_resolution_hours} hrs` : '—'}</div>
          <div style={statBlock}>Overdue issues</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: data.issues_summary.overdue > 0 ? '#dc2626' : 'var(--ink)' }}>{data.issues_summary.overdue}</div>
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Total Costs">
          <div style={{ height: 190 }}>
            {data.total_cost_by_month.length > 0
              ? <Bar data={totalCostData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              : <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>No cost data yet.</div>}
          </div>
        </SectionCard>
        <SectionCard title="Service Costs">
          <div style={{ height: 190 }}>
            {data.total_cost_by_month.length > 0
              ? <Bar data={serviceCostData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              : <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>No service cost data yet.</div>}
          </div>
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SectionCard title="Cost Per Km">
          <div style={{ height: 190 }}>
            {data.cost_per_km_by_month.length > 0
              ? <Line data={costPerKmData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              : <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>Not enough trip distance data yet.</div>}
          </div>
        </SectionCard>
        <SectionCard title="Latest Meter Readings">
          <div style={{ maxHeight: 190, overflowY: 'auto' }}>
          {data.latest_meter_readings.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 12 }}>No meter readings logged yet.</div>}
          {data.latest_meter_readings.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink2)' }}>{r.vehicle_name}</span>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.reading_km.toLocaleString()} km</span>
              <span style={{ color: 'var(--ink3)' }}>{new Date(r.recorded_at).toLocaleDateString()}</span>
            </div>
          ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

const statBlock: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' };
