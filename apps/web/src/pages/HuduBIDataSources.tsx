import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { SectionCard } from '../components/SectionCard.js';

interface DataSource { name: string; type: string; status: string; recordsCount: number; lastSync: string }
interface TableRow { table: string; records: number }

const TABLE_LABELS: Record<string, string> = {
  customers: 'Customers', shipment_cases: 'Shipment cases', declarations: 'Declarations',
  sales_invoices: 'Sales invoices', expenses: 'Expenses', finance_expenses: 'Finance expenses',
  users: 'Staff & users', hr_attendance: 'Attendance records', payroll_payslips: 'Payslips',
};

export function HuduBIDataSources() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [breakdown, setBreakdown] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/v1/hudubi/data-sources');
        if (res?.sources) setSources(res.sources);
        if (Array.isArray(res?.breakdown)) setBreakdown([...res.breakdown].sort((a, b) => b.records - a.records));
      } catch (err) { console.error('Failed to load data sources', err); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['HuduBI', 'Data Management']}
        titlePlain="Data"
        titleEm="sources"
        subtitle="The tables HuduBI reads to build your snapshot — scoped to this workspace, with live row counts."
      />

      {loading && <SectionCard><SectionLoading /></SectionCard>}

      {!loading && (
        <>
          {/* Connected sources (the real one) */}
          <SectionCard title="Connected sources">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {sources.map(s => (
                <div key={s.name} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="layers" size={18} color="var(--teal)" />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--green-l)', color: 'var(--green)' }}>{s.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink3)' }}>
                    <span>Type: <strong style={{ color: 'var(--ink)' }}>{s.type}</strong></span>
                    <span>Sync: {s.lastSync}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {s.recordsCount.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink3)' }}>records</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Real per-table breakdown (replaces the fabricated ETL pipeline table) */}
          <SectionCard title="Tables in your data layer">
            {breakdown.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No data yet.</div>
            ) : (() => {
              const max = Math.max(1, ...breakdown.map(r => r.records));
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {breakdown.map(r => (
                    <div key={r.table} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 13, color: 'var(--ink)', width: 160, flexShrink: 0 }}>{TABLE_LABELS[r.table] || r.table}</span>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((r.records / max) * 100)}%`, background: 'var(--teal)', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', minWidth: 48, textAlign: 'right' }}>{r.records.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              These are the live tables HuduBI aggregates. It reads them directly — there is no separate warehouse or ETL copy to fall out of sync.
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
