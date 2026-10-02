import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

interface Examination {
  id: string;
  customs_entry_id: string;
  lot_description?: string;
  selectivity_channel: string;
  examination_type: string;
  status: string;
  outcome: string | null;
  created_at: string;
  scheduled_at?: string | null;
}

const STATUS_OPTIONS = [
  { value: '__all__', label: 'All statuses' },
  { value: 'REQUESTED',   label: 'Requested' },
  { value: 'SCHEDULED',   label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED',   label: 'Completed' },
  { value: 'WAIVED',      label: 'Waived (Green)' },
];

const CHANNEL_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  GREEN: 'success', YELLOW: 'warning', RED: 'error',
};

export function SealExaminations() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('REQUESTED');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== '__all__') params.set('status', statusFilter);
    apiFetch(`/v1/seal/examinations?${params}`)
      .then((r: any) => setRows(Array.isArray(r) ? r : r.data ?? []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  // KPI
  const pending   = rows.filter(r => ['REQUESTED', 'SCHEDULED'].includes(r.status)).length;
  const active    = rows.filter(r => r.status === 'IN_PROGRESS').length;
  const completed = rows.filter(r => r.status === 'COMPLETED').length;
  const redChannel = rows.filter(r => r.selectivity_channel === 'RED').length;

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.lot_description ?? '').toLowerCase().includes(q) ||
      r.selectivity_channel.toLowerCase().includes(q) ||
      r.examination_type.toLowerCase().includes(q);
  });

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Customs', 'Examinations']}
        titlePlain="Customs"
        titleEm="examinations"
        subtitle="Selectivity worklist — YELLOW and RED channel entries are blocked for release until an officer completes an examination here."
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Pending',    value: pending,   color: 'var(--gold)',  icon: 'clock' },
          { label: 'In Progress',value: active,    color: 'var(--blue)',  icon: 'search' },
          { label: 'Completed',  value: completed, color: 'var(--green)', icon: 'checkCircle' },
          { label: 'RED Channel',value: redChannel,color: 'var(--red)',   icon: 'alertCircle' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: k.color, opacity: 0.75, flexShrink: 0 }}><Icon name={k.icon as any} size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3, whiteSpace: 'nowrap' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <SingleSelectFilter
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={v => setStatusFilter(v ?? '__all__')}
        />
        <div style={{ flex: 1 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search lot, channel, examination type…"
            activeFilterCount={statusFilter !== '__all__' ? 1 : 0}
          />
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : filtered.length === 0 ? (
            <div className="seal-empty">No examinations match this filter.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Channel</th>
                  <th>Type</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ex => (
                  <tr key={ex.id} className="seal-table-row-clickable"
                    onClick={() => navigate(`/seal/ex-warehouse/${ex.customs_entry_id}`)}>
                    <td style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>
                      {ex.lot_description ?? 'Entry ' + ex.customs_entry_id.slice(0, 8)}
                    </td>
                    <td>
                      <Badge variant={CHANNEL_VARIANT[ex.selectivity_channel] ?? 'gray'}>
                        {ex.selectivity_channel}
                      </Badge>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink2)', textTransform: 'capitalize' }}>
                      {ex.examination_type.toLowerCase().replace(/_/g, ' ')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      {ex.scheduled_at ? new Date(ex.scheduled_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <Badge variant={['COMPLETED','WAIVED'].includes(ex.status) ? 'success' : ex.status === 'IN_PROGRESS' ? 'brand' : 'gray'}>
                        {ex.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      {ex.outcome ? ex.outcome.replace(/_/g, ' ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
