import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { QueryState } from '../components/ui/DataTable.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Vendor { id: string; name: string }
interface Record_ {
  id: string; vehicle_id: string; vendor_id: string | null; service_type: string;
  description?: string | null; cost: number | null; odometer_km: number | null;
  service_date: string; next_due_date: string | null; status?: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Local YYYY-MM-DD (not toISOString, which shifts by timezone offset).
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const TrackingMaintenance: React.FC = () => {
  const [records, setRecords] = useState<Record_[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/maintenance').then(setRecords).catch(() => setRecords([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
    apiFetch('/v1/tracking/vendors').then(setVendors).catch(() => setVendors([]));
  }, [reload]);

  const vehicleName = (id: string) => vehicles.find(v => v.id === id)?.name ?? '—';
  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.name ?? '—';

  async function remove(id: string) {
    if (!(await showConfirm('Delete this maintenance record?', { confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/tracking/maintenance/${id}`, { method: 'DELETE' });
    reload();
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  // Bucket real records by date — a single row can appear on two different
  // days: "done" on its service_date (past/actual), "due" on its
  // next_due_date (future/expected), if set.
  const { doneByDate, dueByDate } = useMemo(() => {
    const done = new Map<string, Record_[]>();
    const due = new Map<string, Record_[]>();
    for (const r of records) {
      const sKey = r.service_date.slice(0, 10);
      done.set(sKey, [...(done.get(sKey) ?? []), r]);
      if (r.next_due_date) {
        const dKey = r.next_due_date.slice(0, 10);
        due.set(dKey, [...(due.get(dKey) ?? []), r]);
      }
    }
    return { doneByDate: done, dueByDate: due };
  }, [records]);

  const now = Date.now();
  const upcomingCount = useMemo(() => records.filter(r => r.next_due_date && new Date(r.next_due_date).getTime() >= now).length, [records, now]);
  const overdueCount = useMemo(() => records.filter(r => r.next_due_date && new Date(r.next_due_date).getTime() < now).length, [records, now]);
  const doneThisMonthCount = useMemo(() => records.filter(r => {
    const d = new Date(r.service_date);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length, [records, year, month]);
  const totalCost = useMemo(() => records.reduce((sum, record) => sum + (record.cost ?? 0), 0), [records]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: { day: number; thisMonth: boolean; key: string }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevDays - i);
    cells.push({ day: prevDays - i, thisMonth: false, key: dateKey(d) });
  }
  for (let d = 1; d <= daysCount; d++) cells.push({ day: d, thisMonth: true, key: dateKey(new Date(year, month, d)) });
  while (cells.length % 7 !== 0) {
    const overflow = cells.length - daysCount - firstDow + 1;
    cells.push({ day: overflow, thisMonth: false, key: dateKey(new Date(year, month + 1, overflow)) });
  }

  const isToday = (key: string) => key === dateKey(today);
  const selectedDone = selectedDate ? (doneByDate.get(selectedDate) ?? []) : [];
  const selectedDue = selectedDate ? (dueByDate.get(selectedDate) ?? []) : [];

  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Maintenance']}
            titlePlain="Vehicle"
            titleEm="maintenance"
            subtitle="Service history &amp; scheduled maintenance"
          />
        </div>
        <Button asChild><Link to="/tracking/maintenance/new"><Icon name="clipboardList" size={15} />Log maintenance</Link></Button>
      </div>

      {/* Previous / expected summary */}
      <MetricsRow cards={[
        { title: 'Done this month', value: String(doneThisMonthCount), comparisonLabel: `${MONTHS[month]} ${year}`, barHighlight: 'var(--green)', loading },
        { title: 'Upcoming', value: String(upcomingCount), comparisonLabel: 'Expected service dates', barHighlight: 'var(--gold)', loading },
        { title: 'Overdue', value: String(overdueCount), comparisonLabel: 'Past next-due date', barHighlight: overdueCount > 0 ? 'var(--red)' : 'var(--green)', loading },
        { title: 'Maintenance cost', value: totalCost.toLocaleString(), comparisonLabel: `${records.length} service records`, barHighlight: 'var(--blue)', loading },
      ]} />

      <div className={selectedDate ? 'grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]' : 'grid grid-cols-1 items-start gap-4'}>
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Button type="button" variant="outline" size="icon" aria-label="Previous month" onClick={prevMonth}>
              <Icon name="chevronLeft" size={13} />
            </Button>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{MONTHS[month]} {year}</span>
            <Button type="button" variant="outline" size="icon" aria-label="Next month" onClick={nextMonth}>
              <Icon name="chevronRight" size={13} />
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
            {DAYS.map(d => <div key={d} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textAlign: 'center', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {cells.map((cell, i) => {
              const done = doneByDate.get(cell.key) ?? [];
              const due = dueByDate.get(cell.key) ?? [];
              const hasEvents = done.length > 0 || due.length > 0;
              return (
                <div key={i} onClick={() => cell.thisMonth && hasEvents && setSelectedDate(cell.key)}
                  role={cell.thisMonth && hasEvents ? 'button' : undefined} tabIndex={cell.thisMonth && hasEvents ? 0 : undefined}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && cell.thisMonth && hasEvents) { e.preventDefault(); setSelectedDate(cell.key); } }}
                  style={{
                    minHeight: 68, borderRadius: 'var(--r)', padding: '6px 6px',
                    background: selectedDate === cell.key ? 'var(--teal-l)' : isToday(cell.key) && cell.thisMonth ? 'var(--bg)' : 'transparent',
                    border: isToday(cell.key) && cell.thisMonth ? '1px solid var(--teal)' : '1px solid transparent',
                    opacity: cell.thisMonth ? 1 : 0.35,
                    cursor: cell.thisMonth && hasEvents ? 'pointer' : 'default',
                  }}>
                  <div style={{ fontSize: 11.5, fontWeight: isToday(cell.key) ? 800 : 600, color: 'var(--ink)' }}>{cell.day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                    {done.length > 0 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 'var(--r-sm)', padding: '1px 5px', background: 'var(--green-l)', color: 'var(--green)' }}>
                        {done.length} done
                      </div>
                    )}
                    {due.length > 0 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 'var(--r-sm)', padding: '1px 5px', background: 'var(--gold-l)', color: 'var(--gold)' }}>
                        {due.length} due
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: 'var(--ink3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)' }} /> Service done</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gold)' }} /> Expected / due</div>
          </div>
        </SectionCard>

        {selectedDate && (
          <SectionCard
            title={new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            action={<Button type="button" variant="ghost" size="icon" aria-label="Close selected date" onClick={() => setSelectedDate(null)}><Icon name="close" size={14} /></Button>}
          >
            {selectedDone.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 6 }}>Done</div>
                {selectedDone.map(r => (
                  <div key={r.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{vehicleName(r.vehicle_id)}</div>
                    <div style={{ color: 'var(--ink2)' }}>{r.service_type} · {vendorName(r.vendor_id)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <span style={{ color: 'var(--ink3)' }}>{r.cost != null ? r.cost.toLocaleString() : '—'}</span>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${r.service_type} record`} onClick={() => remove(r.id)}><Icon name="trash" size={12} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedDue.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 6 }}>Expected / due</div>
                {selectedDue.map(r => (
                  <div key={r.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{vehicleName(r.vehicle_id)}</div>
                    <div style={{ color: 'var(--ink2)' }}>{r.service_type} · {vendorName(r.vendor_id)}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>

      {!loading && records.length === 0 && <QueryState empty emptyIcon="clipboardList" emptyTitle="No maintenance records" emptyMessage="Log completed service or schedule a due date to populate the maintenance calendar."><span /></QueryState>}
    </div>
  );
};
