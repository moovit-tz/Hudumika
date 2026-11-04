import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { ListPagination, paginate, useListPagination } from '../components/ui/list-pagination.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
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
  requested_by_name: string | null;
  requested_at: string;
  expected_at: string | null;
  executed_at: string | null;
  notes: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_VARIANT: Record<string, 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  DRAFT: 'gray',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

const STATUS_OPTIONS = [
  { value: '__all__', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function SealStockTransfers() {
  const navigate = useNavigate();
  const [compartmentId] = useSealCompartmentId();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [compartments, setCompartments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');

  const { page, setPage, pageSize, setPageSize } = useListPagination(10);

  useEffect(() => {
    apiFetch('/v1/seal/compartments')
      .then((data: any) => {
        const map: Record<string, string> = {};
        if (Array.isArray(data)) {
          data.forEach((c: any) => {
            map[c.id] = c.name || c.code;
          });
        }
        setCompartments(map);
      })
      .catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== '__all__') params.set('status', statusFilter);
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/stock-transfers?${params}`)
      .then((r: any) => setTransfers(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [statusFilter, compartmentId]);

  const filtered = transfers.filter(
    t =>
      !search ||
      t.transfer_ref.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const pending = transfers.filter(t => ['PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS'].includes(t.status));
  const completed = transfers.filter(t => t.status === 'COMPLETED');
  const today = transfers.filter(
    t => new Date(t.requested_at).toDateString() === new Date().toDateString()
  );
  const overdue = transfers.filter(
    t =>
      t.expected_at &&
      !['COMPLETED', 'CANCELLED'].includes(t.status) &&
      new Date(t.expected_at) < new Date()
  );

  const { visible: pagedTransfers } = paginate(filtered, page, pageSize);

  function formatLocation(zone: string | null, compId: string | null): string {
    const compName = compId ? compartments[compId] ?? compId.slice(0, 8).toUpperCase() : null;
    if (zone && compName) return `${compName} (${zone})`;
    if (zone) return zone;
    if (compName) return compName;
    return '—';
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Inventory', to: '/seal/stock' },
          'Stock Transfers',
        ]}
        titlePlain="Stock"
        titleEm="transfers"
        subtitle="Move lots between warehouses, zones, and locations — every transfer is recorded in the audit ledger."
        actions={
          <div className="seal-xfer-actions">
            <Button variant="outline" size="sm" onClick={load}>
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </Button>
            <Button size="sm" onClick={() => navigate('/seal/stock-transfers/new')}>
              <Icon name="plus" size={14} />
              <span>New Transfer</span>
            </Button>
          </div>
        }
      />

      <div className="seal-xfer-metrics">
        <MetricsRow
          cards={[
            {
              title: 'Active Transfers',
              value: String(pending.length),
              icon: 'clock',
              barHighlight: 'var(--teal)',
              sub1Label: 'In Progress',
              sub1Value: 'Pending approval or execution',
            },
            {
              title: "Today's Requests",
              value: String(today.length),
              icon: 'arrowRight',
              barHighlight: 'var(--teal)',
              sub1Label: 'New Activity',
              sub1Value: 'Initiated today',
            },
            {
              title: 'Completed',
              value: String(completed.length),
              icon: 'checkCircle',
              barHighlight: 'var(--green)',
              sub1Label: 'Reconciled',
              sub1Value: 'Executed in movement ledger',
            },
            {
              title: 'Overdue Attention',
              value: String(overdue.length),
              icon: 'alertCircle',
              barHighlight: 'var(--red)',
              sub1Label: 'Exceptions',
              sub1Value: 'Past expected completion date',
            },
          ]}
        />
      </div>

      <div className="seal-xfer-toolbar">
        <SingleSelectFilter
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={v => setStatusFilter(v ?? '__all__')}
          allLabel="All Statuses"
        />
        <div className="seal-xfer-search">
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by transfer reference, notes…"
            activeFilterCount={statusFilter !== '__all__' ? 1 : 0}
          />
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <SectionLoading label="Loading stock transfers…" />
          ) : filtered.length === 0 ? (
            <div className="seal-empty">
              {transfers.length === 0
                ? 'No stock transfers on record. Click "New Transfer" to initiate a lot movement.'
                : 'No stock transfers match your search or filter criteria.'}
            </div>
          ) : (
            <>
              <table className="seal-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Origin → Destination</th>
                    <th>Requested</th>
                    <th>Expected</th>
                    <th>Requested By</th>
                    <th>Status</th>
                    <th className="seal-xfer-th-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTransfers.map(t => {
                    const isOverdue =
                      t.expected_at &&
                      !['COMPLETED', 'CANCELLED'].includes(t.status) &&
                      new Date(t.expected_at) < new Date();

                    return (
                      <tr
                        key={t.id}
                        className="seal-table-row-clickable"
                        onClick={() => navigate(`/seal/stock-transfers/${t.id}`)}
                      >
                        <td>
                          <span className="seal-xfer-ref">{t.transfer_ref}</span>
                          {t.notes && <div className="seal-xfer-notes">{t.notes}</div>}
                        </td>
                        <td>
                          <div className="seal-xfer-route">
                            <span className="seal-xfer-route-loc">
                              {formatLocation(t.from_zone, t.from_compartment_id)}
                            </span>
                            <Icon name="arrowRight" size={12} className="seal-xfer-route-arrow" />
                            <span className="seal-xfer-route-loc">
                              {formatLocation(t.to_zone, t.to_compartment_id)}
                            </span>
                          </div>
                        </td>
                        <td className="seal-xfer-date">
                          {new Date(t.requested_at).toLocaleDateString()}
                        </td>
                        <td
                          className="seal-xfer-date"
                          style={isOverdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}
                        >
                          {t.expected_at ? new Date(t.expected_at).toLocaleDateString() : '—'}
                          {isOverdue && ' (Overdue)'}
                        </td>
                        <td>
                          {t.requested_by ? (
                            <div className="seal-xfer-requester">
                              <PersonAvatar userId={t.requested_by} name={t.requested_by_name || 'User'} size={22} />
                              <span className="seal-xfer-requester-name">{t.requested_by_name || '—'}</span>
                            </div>
                          ) : (
                            <span className="seal-xfer-system">System</span>
                          )}
                        </td>
                        <td>
                          <Badge variant={STATUS_VARIANT[t.status] ?? 'gray'}>
                            {STATUS_LABELS[t.status] ?? t.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="seal-xfer-td-action" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => navigate(`/seal/stock-transfers/${t.id}`)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="seal-xfer-pagination">
                <ListPagination
                  total={filtered.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[10, 15, 25, 50]}
                  noun="transfers"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
