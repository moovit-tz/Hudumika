import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Draft',     value: drafts,   color: 'var(--ink3)',  icon: 'file' },
          { label: 'Assessed',  value: assessed, color: 'var(--teal)',  icon: 'clipboardCheck' },
          { label: 'Paid',      value: paid,     color: 'var(--blue)',  icon: 'creditCard' },
          { label: 'Released',  value: released, color: 'var(--green)', icon: 'checkCircle' },
          { label: 'Queried',   value: queried,  color: 'var(--gold)',  icon: 'alertCircle' },
          { label: `Total Duty (${currency})`, value: totalDuty.toLocaleString(), color: 'var(--ink2)', icon: 'dollarSign' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: k.color, opacity: 0.75, flexShrink: 0 }}><Icon name={k.icon as any} size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
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
          onChange={v => setStatusFilter(v ?? STATUS_ALL)}
        />
        <div style={{ flex: 1 }}>
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
