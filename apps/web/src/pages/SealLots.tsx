import { Banner } from '../components/ui/alert.js';
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
import { CUSTOMS_STATUSES, CUSTOMS_STATUS_LABELS, type SealLot as Lot } from '@hudumika/types';
import './Seal.css';


const STATUS_ALL = '__all__';

export function SealLots() {
  const navigate = useNavigate();
  const caps = useSealCapabilities();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      .then((r: Lot[]) => { setLots(r); setError(null); })
      .catch(e => { setLots([]); setError(e.message); })
      .finally(() => setLoading(false));
  }, [statusFilter, search, compartmentId]);

  // KPI
  const expired    = lots.filter(l => (l.daysRemaining ?? 1) < 0).length;
  const nearExpiry = lots.filter(l => l.daysRemaining != null && l.daysRemaining >= 0 && l.daysRemaining <= 30).length;
  const held       = caps.customs ? lots.filter(l => ['SEIZED', 'ABANDONED'].includes(l.customsStatus)).length : 0;
  const withSku    = lots.filter(l => l.productId != null).length;

  const statusOptions = [
    { value: STATUS_ALL, label: 'All statuses' },
    ...CUSTOMS_STATUSES.map(s => ({ value: s, label: CUSTOMS_STATUS_LABELS[s] })),
  ];

  const titlePlain = caps.customs ? 'Bonded' : 'Inventory';
  const titleEm    = 'lots';

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', caps.customs ? 'Inventory' : 'Inventory', 'Lots']}
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

      {error && <Banner variant="error">{error}</Banner>}
      {/* KPI strip */}
      <div className="seal-kpi-strip">
        {[
          { label: 'Total Lots',  value: lots.length,  variant: 'brand' as const,   icon: 'package' },
          { label: 'Expired',     value: expired,      variant: 'error' as const,   icon: 'alertCircle' },
          { label: 'Near Expiry', value: nearExpiry,   variant: 'warning' as const, icon: 'clock' },
          ...(caps.customs
            ? [{ label: 'Seized / Abandoned', value: held,   variant: 'error' as const,   icon: 'shield' }]
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
            placeholder="Search lot description…"
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
                        <span className="seal-strip" style={{ background: `var(${CUSTOMS_STATUS_COLOR_VAR[lot.customsStatus]})` }} />
                      )}
                      <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>
                          {lot.description}
                          {lot.entryReference && <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--teal)', marginLeft: 8 }}>{lot.entryReference}</span>}
                        </div>
                        {lot.hsCode && <div style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--ink3)', fontSize: 11, marginTop: 1 }}>HS {lot.hsCode}</div>}
                        {lot.productId    && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 1 }}>Catalogue linked</div>}
                      </div>
                    </td>
                    <td>
                      {lot.ownerName ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar userId={lot.ownerId} kind="customers" name={lot.ownerName} size={22} />
                          <span style={{ fontSize: 13 }}>{lot.ownerName}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{lot.currentLocationCode ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {(lot.qtyOnHand ?? 0).toLocaleString()} <span style={{ color: 'var(--ink3)', fontSize: 11 }}>{lot.uom}</span>
                    </td>
                    {caps.customs && (
                      <td><Badge variant={CUSTOMS_STATUS_VARIANT[lot.customsStatus]}>{CUSTOMS_STATUS_LABELS[lot.customsStatus]}</Badge></td>
                    )}
                    <td>
                      {lot.daysRemaining == null ? (
                        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>
                      ) : lot.daysRemaining < 0 ? (
                        <Badge variant="error">Expired</Badge>
                      ) : lot.daysRemaining <= 30 ? (
                        <Badge variant="warning">{lot.daysRemaining}d left</Badge>
                      ) : (
                        <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{lot.daysRemaining}d left</span>
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
