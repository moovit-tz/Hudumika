import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Button } from '../components/ui/button.js';

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
  const columns: TableColumn<FuelLog>[] = [
    { key: 'vehicle', header: 'Vehicle', accessor: 'vehicle_name', sortable: true, render: log => <span className="font-semibold text-foreground">{log.vehicle_name ?? '—'}{log.vehicle_plate ? ` (${log.vehicle_plate})` : ''}</span> },
    { key: 'driver', header: 'Driver', accessor: 'driver_name', sortable: true, render: log => log.driver_name ?? '—' },
    { key: 'liters', header: 'Liters', accessor: 'liters', sortable: true, align: 'right', render: log => `${log.liters.toLocaleString()} L` },
    { key: 'cost', header: 'Cost', accessor: 'cost', sortable: true, align: 'right', render: log => log.cost != null ? log.cost.toLocaleString() : '—' },
    { key: 'odometer', header: 'Odometer', accessor: 'odometer_km', sortable: true, align: 'right', hideAt: 'sm', render: log => log.odometer_km != null ? `${log.odometer_km.toLocaleString()} km` : '—' },
    { key: 'station', header: 'Station', accessor: 'station', sortable: true, hideAt: 'md', render: log => log.station || '—' },
    { key: 'date', header: 'Date', accessor: 'logged_at', sortable: true, render: log => new Date(log.logged_at).toLocaleDateString() },
    { key: 'action', header: '', align: 'right', width: 48, render: log => <Button type="button" variant="ghost" size="icon" aria-label={`Delete fuel entry for ${log.vehicle_name ?? 'vehicle'}`} onClick={() => remove(log.id)}><Icon name="trash" size={14} /></Button> },
  ];

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
        <Button asChild><Link to="/tracking/fuel/new"><Icon name="plus" size={15} />Log fuel entry</Link></Button>
      </div>

      <MetricsRow cards={[
        { title: 'Fuel entries', value: String(logs.length), comparisonLabel: 'Recorded transactions', barHighlight: 'var(--teal)', loading },
        { title: 'Fuel volume', value: `${totalLiters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`, comparisonLabel: 'Total logged volume', barHighlight: 'var(--blue)', loading },
        { title: 'Fuel cost', value: totalCost.toLocaleString(), comparisonLabel: 'Total recorded spend', barHighlight: 'var(--gold)', loading },
        { title: 'Average cost / litre', value: totalLiters > 0 ? (totalCost / totalLiters).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—', comparisonLabel: totalLiters > 0 ? 'Cost ÷ litres' : 'Needs volume and cost data', barHighlight: 'var(--green)', loading },
      ]} />

      <SectionCard padded={false}>
        <DataTable columns={columns} rows={logs} loading={loading} empty={!loading && logs.length === 0} emptyIcon="activity" emptyTitle="No fuel entries" emptyMessage="Fuel transactions appear here after the first entry is logged." defaultSortKey="date" defaultSortDir="desc" pageSize={15} />
      </SectionCard>
    </div>
  );
};
