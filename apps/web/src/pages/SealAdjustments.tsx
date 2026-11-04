import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { Textarea } from '../components/ui/textarea.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { ListPagination, paginate, useListPagination } from '../components/ui/list-pagination.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface CycleCount {
  id: string;
  count_ref: string;
  status: string;
  initiated_by: string | null;
  initiated_at: string;
  closed_at: string | null;
  notes: string | null;
  compartment_id: string | null;
  line_count?: number;
  variance_count?: number;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RECONCILING: 'Reconciling',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

// Simplified colour palette – only brand and gray tokens to maintain visual hierarchy
const STATUS_VARIANT: Record<string, 'brand' | 'gray'> = {
  OPEN: 'gray',
  IN_PROGRESS: 'brand',
  RECONCILING: 'brand',
  CLOSED: 'brand',
  CANCELLED: 'gray',
};

const STATUS_OPTIONS = [
  { value: '__all__', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RECONCILING', label: 'Reconciling' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function SealAdjustments() {
  const navigate = useNavigate();
  const [compartmentId] = useSealCompartmentId();
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newNotes, setNewNotes] = useState('');

  const { page, setPage, pageSize, setPageSize } = useListPagination(10);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/cycle-counts?${params}`)
      .then((r: any) => {
        setCounts(Array.isArray(r) ? r : r.data ?? []);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [compartmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result: any = await apiFetch('/v1/seal/cycle-counts', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId: compartmentId ?? undefined,
          notes: newNotes.trim() || undefined,
        }),
      });
      setShowNew(false);
      setNewNotes('');
      navigate(`/seal/adjustments/${result.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create cycle count.');
    } finally {
      setSaving(false);
    }
  }

  const openCounts = counts.filter(c => ['OPEN', 'IN_PROGRESS', 'RECONCILING'].includes(c.status));
  const closedCounts = counts.filter(c => c.status === 'CLOSED');
  const totalVariances = counts.reduce((acc, c) => acc + (c.variance_count ?? 0), 0);

  const filtered = counts.filter(c => {
    const matchesSearch =
      !search ||
      c.count_ref.toLowerCase().includes(search.toLowerCase()) ||
      (c.notes ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === '__all__' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const { visible: pagedCounts } = paginate(filtered, page, pageSize);

  return (
    <div className="seal-page">
      {/* New Cycle Count Modal Dialog */}
      {showNew && (
        <Dialog open onOpenChange={o => { if (!o) setShowNew(false); }}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>New Cycle Count</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <DialogBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                    Initializes a snapshot of all active bonded lots in the current perimeter to verify physical quantities against ledger balances.
                  </div>
                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Audit Scope & Notes (optional)
                    </label>
                    <Textarea
                      rows={3}
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value)}
                      placeholder="e.g. Q4 Wall-to-Wall Physical Audit, High-Value SKU verification..."
                    />
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNew(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? 'Creating…' : 'Start Count'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Page Header */}
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Inventory', to: '/seal/stock' },
          'Cycle Counts',
        ]}
        titlePlain="Counts &"
        titleEm="adjustments"
        subtitle="Periodic physical inventory verification — count lots, reconcile variances, and post adjustments."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={load}>
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Icon name="plus" size={14} />
              <span>New Count</span>
            </Button>
          </div>
        }
      />

      {error && <Banner variant="error">{error}</Banner>}

      {/* Helpful cross-app ledger hint */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--card-sunken, var(--bg))',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--ink2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="info" size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <span>
            Counts here audit bonded warehouse lots and locations. For item balances used by FinOps & production, view{' '}
            <Link className="underline font-semibold" style={{ color: 'var(--teal)' }} to="/seal/counts">
              Item Inventory Counts
            </Link>.
          </span>
        </div>
        <Link
          to="/seal/movements"
          style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}
        >
          View Movement History →
        </Link>
      </div>

      {/* KPI Metrics Row */}
      <div style={{ marginBottom: 20 }}>
        <MetricsRow
          cards={[
            {
              title: 'Active Counts',
              value: String(openCounts.length),
              icon: 'clipboardList',
              barHighlight: 'var(--teal)',
              sub1Label: 'In Progress',
              sub1Value: 'Needs counting or reconciliation',
            },
            {
              title: 'Discrepancies',
              value: String(totalVariances),
              icon: 'alertTriangle',
              barHighlight: 'var(--teal)',
              sub1Label: 'Variances',
              sub1Value: 'Lots with quantity delta',
            },
            {
              title: 'Reconciled',
              value: String(closedCounts.length),
              icon: 'checkCircle',
              barHighlight: 'var(--teal)',
              sub1Label: 'Completed',
              sub1Value: 'Posted to movement ledger',
            },
            {
              title: 'Total Audits',
              value: String(counts.length),
              icon: 'layers',
              barHighlight: 'var(--teal)',
              sub1Label: 'History',
              sub1Value: 'Audit cycles on record',
            },
          ]}
        />
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <SingleSelectFilter
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={v => setStatusFilter(v ?? '__all__')}
          allLabel="All Statuses"
        />
        <div style={{ flex: 1, minWidth: 240 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by count reference, notes..."
            activeFilterCount={statusFilter !== '__all__' ? 1 : 0}
          />
        </div>
      </div>

      {/* Data Table Card */}
      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <SectionLoading label="Loading cycle counts…" />
          ) : filtered.length === 0 ? (
            <div className="seal-empty">
              {counts.length === 0
                ? 'No cycle counts recorded yet. Click "New Count" to start your first physical audit.'
                : 'No cycle counts match your search or filter criteria.'}
            </div>
          ) : (
            <>
              <table className="seal-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Initiated By</th>
                    <th>Initiated</th>
                    <th>Closed</th>
                    <th style={{ textAlign: 'right' }}>Lines</th>
                    <th style={{ textAlign: 'right' }}>Variances</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCounts.map(c => (
                    <tr
                      key={c.id}
                      className="seal-table-row-clickable"
                      onClick={() => navigate(`/seal/adjustments/${c.id}`)}
                    >
                      <td>
                        <span
                          className="seal-mono"
                          style={{
                            fontWeight: 700,
                            color: 'var(--teal)',
                            fontSize: 13,
                          }}
                        >
                          {c.count_ref}
                        </span>
                        {c.notes && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: 'var(--ink3)',
                              maxWidth: 260,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 2,
                            }}
                          >
                            {c.notes}
                          </div>
                        )}
                      </td>
                      <td>
                        {c.initiated_by ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PersonAvatar userId={c.initiated_by} name="Initiator" size={22} />
                            <span style={{ fontSize: 12.5 }}>Initiator</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>System</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(c.initiated_at).toLocaleDateString()}
                      </td>
                      <td
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink3)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {c.closed_at ? new Date(c.closed_at).toLocaleDateString() : '—'}
                      </td>
                      <td
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: 12.5,
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      >
                        {c.line_count != null ? c.line_count.toLocaleString() : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {c.variance_count != null && c.variance_count > 0 ? (
                          <Badge variant="brand">{c.variance_count}</Badge>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                            {c.variance_count === 0 ? '0' : '—'}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                          {STATUS_LABELS[c.status] ?? c.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => navigate(`/seal/adjustments/${c.id}`)}
                        >
                          {c.status === 'CLOSED' ? 'Review' : 'Continue'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ padding: '0 20px 16px' }}>
                <ListPagination
                  total={filtered.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[10, 15, 25, 50]}
                  noun="counts"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
