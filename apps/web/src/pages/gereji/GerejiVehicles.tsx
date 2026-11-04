import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Vehicle {
  id: string; registration: string; make: string | null; model: string | null;
  year: number | null; vin: string | null; color: string | null;
  mileage: number | null; customer_id: string | null; created_at: string;
}

export function GerejiVehicles() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiFetch('/v1/gereji/vehicles').then(d => setRows(d.vehicles ?? [])).finally(() => setLoading(false));
  }, []);

  const filtered = q.trim()
    ? rows.filter(r => [r.registration, r.make, r.model, r.vin].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="page-layout">
      <PageHeader crumbs={['Gereji', 'Registry']} titlePlain="Customer" titleEm="vehicles" subtitle="Vehicle service history, VIN registry and maintenance schedules." />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search vehicles..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {rows.length === 0 ? 'No vehicles registered yet.' : 'No matches.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Registration', 'Make', 'Model', 'Year', 'VIN', 'Mileage', 'Registered'].map(h => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--ink)' }}>{r.registration}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink)' }}>{r.make ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink)' }}>{r.model ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.year ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)', fontFamily: 'var(--font)', fontSize: 12 }}>{r.vin ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.mileage != null ? `${r.mileage.toLocaleString()} km` : '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
