import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';

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
    if (!confirm('Delete this maintenance record?')) return;
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
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Maintenance</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>Service history &amp; scheduled maintenance</div>
        </div>
        <Link to="/tracking/maintenance/new"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          <Icon name="clipboardList" size={15} /> Log maintenance
        </Link>
      </div>

      {/* Previous / expected summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Done this month</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{doneThisMonthCount}</div>
        </div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Upcoming (expected)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ca8a04', marginTop: 4 }}>{upcomingCount}</div>
        </div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Overdue</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: overdueCount > 0 ? '#dc2626' : 'var(--ink)', marginTop: 4 }}>{overdueCount}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedDate ? '1fr 300px' : '1fr', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button type="button" title="Previous month" onClick={prevMonth} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)' }}>
              <Icon name="chevronLeft" size={13} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{MONTHS[month]} {year}</span>
            <button type="button" title="Next month" onClick={nextMonth} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)' }}>
              <Icon name="chevronRight" size={13} />
            </button>
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
                  style={{
                    minHeight: 68, borderRadius: 7, padding: '6px 6px',
                    background: selectedDate === cell.key ? 'var(--teal-l)' : isToday(cell.key) && cell.thisMonth ? 'var(--bg)' : 'transparent',
                    border: isToday(cell.key) && cell.thisMonth ? '1px solid var(--teal)' : '1px solid transparent',
                    opacity: cell.thisMonth ? 1 : 0.35,
                    cursor: cell.thisMonth && hasEvents ? 'pointer' : 'default',
                  }}>
                  <div style={{ fontSize: 11.5, fontWeight: isToday(cell.key) ? 800 : 600, color: 'var(--ink)' }}>{cell.day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                    {done.length > 0 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: 'rgba(22,163,74,0.14)', color: '#059669' }}>
                        {done.length} done
                      </div>
                    )}
                    {due.length > 0 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: 'rgba(202,138,4,0.14)', color: '#ca8a04' }}>
                        {due.length} due
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: 'var(--ink3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#059669' }} /> Service done</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#ca8a04' }} /> Expected / due</div>
          </div>
        </div>

        {selectedDate && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <button type="button" title="Close" onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="close" size={14} /></button>
            </div>

            {selectedDone.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: 6 }}>Done</div>
                {selectedDone.map(r => (
                  <div key={r.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{vehicleName(r.vehicle_id)}</div>
                    <div style={{ color: 'var(--ink2)' }}>{r.service_type} · {vendorName(r.vendor_id)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <span style={{ color: 'var(--ink3)' }}>{r.cost != null ? r.cost.toLocaleString() : '—'}</span>
                      <button type="button" onClick={() => remove(r.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="close" size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedDue.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#ca8a04', textTransform: 'uppercase', marginBottom: 6 }}>Expected / due</div>
                {selectedDue.map(r => (
                  <div key={r.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{vehicleName(r.vehicle_id)}</div>
                    <div style={{ color: 'var(--ink2)' }}>{r.service_type} · {vendorName(r.vendor_id)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && records.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No maintenance records yet.</div>
      )}
    </div>
  );
};
