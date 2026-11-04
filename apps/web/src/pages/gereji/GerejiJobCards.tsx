import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface JobCard {
  id: string; work_id: string; vehicle_id: string; reported_fault: string;
  status: string; bay_number: string | null; technician_id: string | null;
  estimated_hours: number | null; created_at: string;
}

const JC_BADGE: Record<string, 'info' | 'warning' | 'brand' | 'success' | 'gray'> = {
  received: 'info', diagnosing: 'warning', awaiting_parts: 'warning',
  in_progress: 'brand', quality_check: 'brand', ready: 'success', delivered: 'success',
};

export function GerejiJobCards() {
  const [rows, setRows] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/v1/gereji/job-cards').then(d => setRows(d.jobCards ?? [])).finally(() => setLoading(false));
  }, []);

  const filtered = q.trim()
    ? rows.filter(r => r.reported_fault.toLowerCase().includes(q.toLowerCase()) || r.vehicle_id.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="page-layout">
      <PageHeader crumbs={['Gereji', 'Workshop']} titlePlain="Job" titleEm="cards" subtitle="Open and completed workshop jobs — diagnosis, labour, parts and customer sign-off." />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search job cards..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {rows.length === 0 ? 'No job cards yet. Convert an approved estimate to create one.' : 'No matches.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Vehicle', 'Reported Fault', 'Status', 'Bay', 'Est. Hours', 'Created', ''].map(h => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 12.5 }}>{r.vehicle_id.slice(0, 8)}...</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reported_fault}</td>
                      <td style={{ padding: '12px 18px' }}><Badge variant={JC_BADGE[r.status] ?? 'gray'}>{r.status.replace(/_/g, ' ')}</Badge></td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.bay_number ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.estimated_hours ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}><Icon name="moreHorizontal" size={16} /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => navigate('/finops/journal')}><Icon name="invoice" size={14} /> View costs in FinOps</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate('/inventory')}><Icon name="package" size={14} /> Issue parts from Inventory</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate('/gereji/estimates')}><Icon name="fileText" size={14} /> Back to Estimates</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
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
