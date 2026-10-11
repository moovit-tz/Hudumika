import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { useSealCapabilities } from '../hooks/useSealCapabilities.js';
import { CUSTOMS_STATUS_VARIANT, CUSTOMS_STATUS_COLOR_VAR } from '../lib/sealStatus.js';
import { CUSTOMS_STATUSES, CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import './Seal.css';

interface Lot {
  id: string;
  description: string;
  lot_ref?: string;
  hs_code: string | null;
  owner_id?: string;
  owner_name?: string;
  customs_status: CustomsStatus;
  current_location_code?: string | null;
  qty_on_hand: number;
  uom: string;
  unit: string;
  days_remaining: number | null;
  expires_on: string | null;
  product_id: string | null;
  sku?: string | null;
}

const STATUS_ALL = '__all__';

export function SealLots() {
  const navigate = useNavigate();
  const caps = useSealCapabilities();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL);
  const [search, setSearch] = useState('');
  const [compartmentId] = useSealCompartmentId();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== STATUS_ALL) params.set('customs_status', statusFilter);
    if (search.trim()) params.set('q', search.trim());
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/lots?${params}`)
      .then((r: any) => setLots(Array.isArray(r) ? r : r.data ?? []))
      .finally(() => setLoading(false));
  }, [statusFilter, search, compartmentId]);

  // KPI
  const expired    = lots.filter(l => (l.days_remaining ?? 1) < 0).length;
  const nearExpiry = lots.filter(l => l.days_remaining != null && l.days_remaining >= 0 && l.days_remaining <= 30).length;
  const held       = caps.customs ? lots.filter(l => ['HELD_BY_CUSTOMS', 'UNDER_EXAMINATION'].includes(l.customs_status)).length : 0;
  const withSku    = lots.filter(l => l.product_id != null).length;

  const statusOptions = [
    { value: STATUS_ALL, label: 'All statuses' },
    ...CUSTOMS_STATUSES.map(s => ({ value: s, label: CUSTOMS_STATUS_LABELS[s] })),
  ];

  const titlePlain = caps.customs ? 'Bonded' : 'Inventory';
  const titleEm    = 'lots';

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', caps.customs ? 'The Ledger' : 'Inventory', 'Lots']}
        titlePlain={titlePlain}
        titleEm={titleEm}
        subtitle={caps.customs
          ? 'Every quantity of stock under customs control — one owner, one status, one storage clock each.'
          : 'All stock items tracked in your warehouse — location, quantity, and SKU linkage.'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => navigate('/seal/adjustments')}><Icon name="clipboardList" size={14} /> Cycle Count</Button>
            <Button onClick={() => navigate('/seal/lots/new')}><Icon name="plus" size={14} /> Receive Lot</Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="seal-kpi-strip">
        {[
          { label: 'Total Lots',  value: lots.length,  variant: 'brand' as const,   icon: 'package' },
          { label: 'Expired',     value: expired,      variant: 'error' as const,   icon: 'alertCircle' },
          { label: 'Near Expiry', value: nearExpiry,   variant: 'warning' as const, icon: 'clock' },
          ...(caps.customs
            ? [{ label: 'Held / Exam', value: held,   variant: 'error' as const,   icon: 'shield' }]
            : [{ label: 'With SKU',   value: withSku,  variant: 'success' as const, icon: 'tag' }]),
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
        {caps.customs && (
          <SingleSelectFilter
            label="Customs status"
            value={statusFilter === STATUS_ALL ? null : statusFilter}
            options={CUSTOMS_STATUSES.map(s => ({ value: s, label: CUSTOMS_STATUS_LABELS[s] }))}
            allLabel="All statuses"
            onChange={v => setStatusFilter(v ?? STATUS_ALL)}
          />
        )}
        <div style={{ flex: 1, minWidth: 260 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search description, HS code, SKU…"
            activeFilterCount={statusFilter !== STATUS_ALL ? 1 : 0}
          />
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : lots.length === 0 ? (
            <div className="seal-empty">
              <FeaturedIcon variant="gray" size="lg" shape="squircle">
                <Icon name="package" size={24} />
              </FeaturedIcon>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '14px 0 6px' }}>
                No lots match these filters
              </h3>
              <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 16px' }}>
                Try adjusting your customs status filter or search query.
              </p>
              {statusFilter !== STATUS_ALL && (
                <Button variant="outline" onClick={() => setStatusFilter(STATUS_ALL)}>Clear Status Filter</Button>
              )}
            </div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th>Qty</th>
                  {caps.customs && <th>Status</th>}
                  <th>Storage Clock</th>
                </tr>
              </thead>
              <tbody>
                {lots.map(lot => (
                  <tr key={lot.id} className="seal-table-row-clickable" onClick={() => navigate(`/seal/lots/${lot.id}`)}>
                    <td>
                      {caps.customs && (
                        <span className="seal-strip" style={{ background: `var(${CUSTOMS_STATUS_COLOR_VAR[lot.customs_status]})` }} />
                      )}
                      <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>
                          {lot.description}
                          {lot.lot_ref && <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--teal)', marginLeft: 8 }}>{lot.lot_ref}</span>}
                        </div>
                        {lot.hs_code && <div style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--ink3)', fontSize: 11, marginTop: 1 }}>HS {lot.hs_code}</div>}
                        {lot.sku    && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 1 }}>SKU {lot.sku}</div>}
                      </div>
                    </td>
                    <td>
                      {lot.owner_name ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar userId={lot.owner_id} kind="customers" name={lot.owner_name} size={22} />
                          <span style={{ fontSize: 13 }}>{lot.owner_name}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{lot.current_location_code ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {(lot.qty_on_hand ?? 0).toLocaleString()} <span style={{ color: 'var(--ink3)', fontSize: 11 }}>{lot.uom || lot.unit}</span>
                    </td>
                    {caps.customs && (
                      <td><Badge variant={CUSTOMS_STATUS_VARIANT[lot.customs_status]}>{CUSTOMS_STATUS_LABELS[lot.customs_status]}</Badge></td>
                    )}
                    <td>
                      {lot.days_remaining == null ? (
                        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>
                      ) : lot.days_remaining < 0 ? (
                        <Badge variant="error">Expired</Badge>
                      ) : lot.days_remaining <= 30 ? (
                        <Badge variant="warning">{lot.days_remaining}d left</Badge>
                      ) : (
                        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{lot.days_remaining}d left</span>
                      )}
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
