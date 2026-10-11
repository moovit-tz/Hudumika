import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import {
  SEAL_DECLARATION_STATUS_LABELS,
  SEAL_DECLARATION_PROCEDURE_LABELS,
  type SealDeclarationStatus,
} from '@hudumika/types';
import '../Seal.css';

interface Declaration {
  id: string;
  lot_description?: string;
  procedure_code: string;
  declaration_date: string;
  hs_code: string;
  status: SealDeclarationStatus;
  currency: string;
  total_payable_local?: number | null;
}

const STATUS_VARIANT: Record<SealDeclarationStatus, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  DRAFT: 'gray', SUBMITTED: 'info', QUERIED: 'warning', ASSESSED: 'brand', PAID: 'success', RELEASED: 'success', CANCELLED: 'error',
};

const STATUS_ALL = '__all__';

const STATUS_OPTIONS = [
  { value: STATUS_ALL, label: 'All statuses' },
  ...Object.entries(SEAL_DECLARATION_STATUS_LABELS).map(([k, label]) => ({ value: k, label })),
];

export function SealExWarehouseEntries() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== STATUS_ALL) params.set('status', statusFilter);
    apiFetch(`/v1/seal/customs-entries?${params}`)
      .then((r: any) => setEntries(Array.isArray(r) ? r : r.data ?? []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  // KPI
  const drafts    = entries.filter(e => e.status === 'DRAFT').length;
  const assessed  = entries.filter(e => e.status === 'ASSESSED').length;
  const paid      = entries.filter(e => e.status === 'PAID').length;
  const released  = entries.filter(e => e.status === 'RELEASED').length;
  const queried   = entries.filter(e => e.status === 'QUERIED').length;
  const totalDuty = entries.reduce((s, e) => s + (e.total_payable_local ?? 0), 0);
  const currency  = entries[0]?.currency ?? 'TZS';

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.lot_description ?? '').toLowerCase().includes(q) ||
      (e.hs_code ?? '').includes(q) ||
      SEAL_DECLARATION_PROCEDURE_LABELS[e.procedure_code]?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Customs', 'Ex-Warehouse Entries']}
        titlePlain="Ex-Warehouse"
        titleEm="entries"
        subtitle="Customs declarations releasing bonded lots for home use, re-export, or transfer — every duty figure traces to a stored tariff lookup."
        actions={<Button onClick={() => navigate('/seal/ex-warehouse/new')}><Icon name="plus" size={14} /> New Entry</Button>}
      />

      {/* KPI strip */}
      <div className="seal-kpi-strip">
        {[
          { label: 'Draft',     value: drafts,   variant: 'gray' as const,    icon: 'file' },
          { label: 'Assessed',  value: assessed, variant: 'brand' as const,   icon: 'clipboardCheck' },
          { label: 'Paid',      value: paid,     variant: 'info' as const,    icon: 'creditCard' },
          { label: 'Released',  value: released, variant: 'success' as const, icon: 'checkCircle' },
          { label: 'Queried',   value: queried,  variant: 'warning' as const, icon: 'alertCircle' },
          { label: `Total Duty (${currency})`, value: totalDuty.toLocaleString(), variant: 'brand' as const, icon: 'dollarSign' },
        ].map(k => (
          <div key={k.label} className="seal-kpi-card">
            <FeaturedIcon variant={k.variant} size="md" shape="squircle">
              <Icon name={k.icon as any} size={20} />
            </FeaturedIcon>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="seal-kpi-value">{k.value}</div>
              <div className="seal-kpi-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <SingleSelectFilter
          label="Status"
          value={statusFilter === STATUS_ALL ? null : statusFilter}
          options={Object.entries(SEAL_DECLARATION_STATUS_LABELS).map(([k, label]) => ({ value: k, label }))}
          allLabel="All statuses"
          onChange={v => setStatusFilter(v ?? STATUS_ALL)}
        />
        <div style={{ flex: 1, minWidth: 260 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search lot, HS code, procedure…"
            activeFilterCount={statusFilter !== STATUS_ALL ? 1 : 0}
          />
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : filtered.length === 0 ? (
            <div className="seal-empty">No ex-warehouse entries match these filters.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Procedure</th>
                  <th>HS Code</th>
                  <th>Date</th>
                  <th>Duty Payable</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="seal-table-row-clickable" onClick={() => navigate(`/seal/ex-warehouse/${e.id}`)}>
                    <td style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>{e.lot_description ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink2)' }}>{SEAL_DECLARATION_PROCEDURE_LABELS[e.procedure_code] ?? e.procedure_code}</td>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{e.hs_code}</td>
                    <td style={{ fontSize: 12 }}>{new Date(e.declaration_date).toLocaleDateString()}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                      {e.total_payable_local != null ? `${e.total_payable_local.toLocaleString()} ${e.currency}` : '—'}
                    </td>
                    <td><Badge variant={STATUS_VARIANT[e.status]}>{SEAL_DECLARATION_STATUS_LABELS[e.status]}</Badge></td>
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
