import React, { useState, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { showAlert } from '../lib/alert.js';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend,
} from 'chart.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

interface Vehicle { id: string; name: string; plate_number: string | null }
interface FuelLog { vehicle_id: string; liters: number; cost: number | null; logged_at: string }
interface Trip { vehicle_id: string; status: string; origin: string | null; destination: string | null; scheduled_start: string | null }
interface Maintenance { vehicle_id: string; service_type: string; cost: number | null; service_date: string }
interface PreviewRow { id: string; primary: string; secondary: string }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20 };
const REPORT_TYPES = [
  { id: 'fleet-summary', label: 'Fleet Summary' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'trips', label: 'Trips' },
  { id: 'issues', label: 'Issues' },
];

function monthKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function generateReportPDF(type: string, from: string, to: string, data: any, vehicleName: (id: string) => string) {
  let rows = '';
  let title = '';

  if (type === 'fleet-summary') {
    title = 'Fleet Summary Report';
    rows = (data.vehicles ?? []).map((v: any) => `<tr><td>${v.name}</td><td>${v.plate_number ?? '—'}</td><td>${v.type}</td><td>${v.status}</td></tr>`).join('');
  } else if (type === 'maintenance') {
    title = 'Maintenance Report';
    rows = (data.records ?? []).map((r: any) => `<tr><td>${vehicleName(r.vehicle_id)}</td><td>${r.service_type}</td><td>${fmtDate(r.service_date)}</td><td>${r.cost ?? '—'}</td></tr>`).join('');
  } else if (type === 'fuel') {
    title = 'Fuel Report';
    rows = (data.logs ?? []).map((l: any) => `<tr><td>${vehicleName(l.vehicle_id)}</td><td>${l.liters} L</td><td>${l.cost ?? '—'}</td><td>${fmtDate(l.logged_at)}</td></tr>`).join('');
  } else if (type === 'trips') {
    title = 'Trips Report';
    rows = (data.trips ?? []).map((t: any) => `<tr><td>${vehicleName(t.vehicle_id)}</td><td>${t.origin ?? '—'} → ${t.destination ?? '—'}</td><td>${t.status}</td><td>${t.scheduled_start ? fmtDate(t.scheduled_start) : '—'}</td></tr>`).join('');
  } else if (type === 'issues') {
    title = 'Issues Report';
    rows = (data.issues ?? []).map((i: any) => `<tr><td>${i.vehicle_name}${i.vehicle_plate ? ` (${i.vehicle_plate})` : ''}</td><td>${i.title}</td><td>${i.severity}</td><td>${i.status}</td></tr>`).join('');
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #0891b2; padding-bottom: 14px; margin-bottom: 20px; }
  h1 { font-size: 20px; }
  .meta { font-size: 11px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; color: #64748b; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head>
<body>
  <div class="header"><h1>${title}</h1><div class="meta">${from} — ${to}<br/>Generated ${new Date().toLocaleString()}</div></div>
  <table><thead><tr>${type === 'fleet-summary' ? '<th>Name</th><th>Plate</th><th>Type</th><th>Status</th>'
    : type === 'maintenance' ? '<th>Vehicle</th><th>Service</th><th>Date</th><th>Cost</th>'
    : type === 'fuel' ? '<th>Vehicle</th><th>Liters</th><th>Cost</th><th>Date</th>'
    : type === 'issues' ? '<th>Vehicle</th><th>Title</th><th>Priority</th><th>Status</th>'
    : '<th>Vehicle</th><th>Route</th><th>Status</th><th>Scheduled</th>'}</tr></thead>
  <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">No data for this range.</td></tr>'}</tbody></table>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { showAlert('Allow popups to generate the report'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

export const TrackingReports: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuel, setFuel] = useState<FuelLog[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [locked, setLocked] = useState(false);

  const [reportType, setReportType] = useState('fleet-summary');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
    apiFetch('/v1/tracking/fuel').then(setFuel).catch(() => setFuel([]));
    apiFetch('/v1/tracking/trips').then(setTrips).catch(() => setTrips([]));
    apiFetch('/v1/tracking/maintenance').then(setMaintenance).catch(() => setMaintenance([]));
  }, []);

  const vehicleName = (id: string) => vehicles.find(v => v.id === id)?.name ?? id.slice(0, 6);

  const fuelByMonth = new Map<string, number>();
  for (const f of fuel) fuelByMonth.set(monthKey(f.logged_at), (fuelByMonth.get(monthKey(f.logged_at)) ?? 0) + (f.cost ?? 0));
  const months = [...fuelByMonth.keys()].sort();

  const tripsByVehicle = new Map<string, number>();
  for (const t of trips) tripsByVehicle.set(t.vehicle_id, (tripsByVehicle.get(t.vehicle_id) ?? 0) + 1);

  const totalFuelCost = fuel.reduce((s, f) => s + (f.cost ?? 0), 0);
  const totalMaintenanceCost = maintenance.reduce((s, m) => s + (m.cost ?? 0), 0);
  const completedTrips = trips.filter(t => t.status === 'COMPLETED').length;
  const previewRows: PreviewRow[] = (preview?.vehicles ?? preview?.records ?? preview?.logs ?? preview?.trips ?? preview?.issues ?? []).slice(0, 15).map((row: any, index: number) => ({
    id: row.id ?? `${reportType}-${index}`,
    primary: row.name || row.vehicle_name || vehicleName(row.vehicle_id),
    secondary: row.title || row.service_type || row.status || row.plate_number || '—',
  }));
  const previewColumns: TableColumn<PreviewRow>[] = [
    { key: 'record', header: 'Record', accessor: 'primary', sortable: true, render: row => <span className="font-semibold text-foreground">{row.primary}</span> },
    { key: 'detail', header: 'Detail', accessor: 'secondary', sortable: true },
  ];

  async function loadPreview() {
    setLoadingPreview(true); setLocked(false);
    try {
      const data = await apiFetch(`/v1/tracking/reports/${reportType}?from=${from}&to=${to}`);
      setPreview(data);
    } catch (e: any) {
      if (e.message?.includes('plan')) setLocked(true);
      setPreview(null);
    } finally { setLoadingPreview(false); }
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ marginBottom: 20 }}>
        <PageHeader
          crumbs={['HuduFreight', 'Reports']}
          titlePlain="Fleet"
          titleEm="reports"
          subtitle="Fleet utilization, fuel cost, trip history &amp; PDF report generation"
        />
      </div>

      <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Report</div>
          <Select value={reportType} onValueChange={v => { setReportType(v); setPreview(null); }}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>From</div>
          <DatePicker date={parseDateOnly(from)} onChange={d => setFrom(toDateOnlyString(d))} triggerClassName="w-[160px]" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>To</div>
          <DatePicker date={parseDateOnly(to)} onChange={d => setTo(toDateOnlyString(d))} triggerClassName="w-[160px]" />
        </div>
        <Button type="button" variant="outline" onClick={loadPreview} disabled={loadingPreview}>
          {loadingPreview ? 'Loading…' : 'Preview'}
        </Button>
        <Button type="button" onClick={() => preview && generateReportPDF(reportType, from, to, preview, vehicleName)} disabled={!preview}>
          <Icon name="download" size={14} /> Generate PDF
        </Button>
      </div>

      {locked && (
        <div className="mb-5"><Banner variant="warning" title="Advanced plan required">Report generation requires the Advanced plan or higher. <a href="/subscription" className="font-semibold underline">View plans</a></Banner></div>
      )}

      {preview && (
        <div style={{ marginBottom: 20 }}>
        <SectionCard title="Preview">
          <DataTable columns={previewColumns} rows={previewRows} empty={previewRows.length === 0} emptyIcon="fileText" emptyTitle="No preview records" emptyMessage="No records matched the selected report and date range." pageSize={15} />
        </SectionCard>
        </div>
      )}

      <MetricsRow cards={[
        { title: 'Vehicles', value: String(vehicles.length), comparisonLabel: 'Fleet records', barHighlight: 'var(--teal)' },
        { title: 'Completed trips', value: String(completedTrips), comparisonLabel: `${trips.length} total trips`, barHighlight: 'var(--green)' },
        { title: 'Total fuel cost', value: totalFuelCost.toLocaleString(), comparisonLabel: `${fuel.length} fuel entries`, barHighlight: 'var(--gold)' },
        { title: 'Maintenance cost', value: totalMaintenanceCost.toLocaleString(), comparisonLabel: `${maintenance.length} service records`, barHighlight: 'var(--blue)' },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SectionCard title="Fuel cost by month">
          <div style={{ height: 230 }}>
            <Line
              data={{ labels: months, datasets: [{ label: 'Fuel cost', data: months.map(m => fuelByMonth.get(m) ?? 0), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.25 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
            />
          </div>
        </SectionCard>
        <SectionCard title="Trips per vehicle">
          <div style={{ height: 230 }}>
            <Bar
              data={{ labels: [...tripsByVehicle.keys()].map(vehicleName), datasets: [{ label: 'Trips', data: [...tripsByVehicle.values()], backgroundColor: '#0891b2' }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
