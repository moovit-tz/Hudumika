import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

interface Transfer {
  id: string;
  transfer_ref: string;
  status: string;
  from_compartment_id: string | null;
  to_compartment_id: string | null;
  from_zone: string | null;
  to_zone: string | null;
  requested_by: string | null;
  requested_at: string;
  expected_at: string | null;
  executed_at: string | null;
  notes: string | null;
}

const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'gray'> = {
  DRAFT:            'gray',
  PENDING_APPROVAL: 'warning',
  APPROVED:         'brand',
  IN_PROGRESS:      'brand',
  COMPLETED:        'success',
  CANCELLED:        'error',
};

const STATUS_OPTIONS = [
  { value: '__none__', label: 'All statuses' },
  { value: 'DRAFT',            label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED',         label: 'Approved' },
  { value: 'IN_PROGRESS',      label: 'In Progress' },
  { value: 'COMPLETED',        label: 'Completed' },
  { value: 'CANCELLED',        label: 'Cancelled' },
];

export function SealStockTransfers() {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__none__');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== '__none__') params.set('status', statusFilter);
    apiFetch(`/v1/seal/stock-transfers?${params}`)
      .then((r: any) => setTransfers(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = transfers.filter(t =>
    !search || t.transfer_ref.toLowerCase().includes(search.toLowerCase()) ||
    (t.notes ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const pending = transfers.filter(t => ['PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS'].includes(t.status));
  const completed = transfers.filter(t => t.status === 'COMPLETED');
  const today = transfers.filter(t => new Date(t.requested_at).toDateString() === new Date().toDateString());
  const overdue = transfers.filter(t => t.expected_at && !['COMPLETED','CANCELLED'].includes(t.status) && new Date(t.expected_at) < new Date());

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Inventory', 'Stock Transfers']}
        titlePlain="Stock"
        titleEm="transfers"
        subtitle="Move lots between warehouses, zones, and locations — every transfer is recorded in the audit ledger."
        actions={<Button onClick={() => navigate('/seal/stock-transfers/new')}><Icon name="plus" size={14} /> New Transfer</Button>}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Requested Today', value: today.length, color: 'var(--teal)', icon: 'arrowRight' },
          { label: 'Active', value: pending.length, color: 'var(--gold)', icon: 'clock' },
          { label: 'Completed', value: completed.length, color: 'var(--green)', icon: 'checkCircle' },
          { label: 'Overdue', value: overdue.length, color: 'var(--red)', icon: 'alertCircle' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color: k.color, opacity: 0.7 }}>
              <Icon name={k.icon as any} size={22} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <SingleSelectFilter
            label="Status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={v => setStatusFilter(v ?? '__none__')}
          />
        </div>
        <div style={{ flex: 2 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by reference or notes…"
            activeFilterCount={statusFilter !== '__none__' ? 1 : 0}
          />
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : filtered.length === 0 ? (
            <div className="seal-empty">
              {transfers.length === 0 ? 'No stock transfers yet.' : 'No transfers match your filters.'}
            </div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>From → To</th>
                  <th>Requested</th>
                  <th>Expected</th>
                  <th>Requested By</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="seal-table-row-clickable" onClick={() => navigate(`/seal/stock-transfers/${t.id}`)}>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                      {t.transfer_ref}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ color: 'var(--ink2)' }}>{t.from_zone ?? t.from_compartment_id ?? '—'}</span>
                        <Icon name="arrowRight" size={11} style={{ color: 'var(--ink3)' }} />
                        <span style={{ color: 'var(--ink2)' }}>{t.to_zone ?? t.to_compartment_id ?? '—'}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{new Date(t.requested_at).toLocaleDateString()}</td>
                    <td style={{ fontSize: 12, color: t.expected_at && !['COMPLETED','CANCELLED'].includes(t.status) && new Date(t.expected_at) < new Date() ? 'var(--red)' : 'var(--ink3)' }}>
                      {t.expected_at ? new Date(t.expected_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      {t.requested_by
                        ? <PersonAvatar userId={t.requested_by} name="Requester" size={22} />
                        : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>
                      }
                    </td>
                    <td><Badge variant={STATUS_VARIANT[t.status] ?? 'gray'}>{t.status.replace(/_/g, ' ')}</Badge></td>
                    <td><Icon name="chevronRight" size={14} style={{ color: 'var(--ink3)' }} /></td>
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
