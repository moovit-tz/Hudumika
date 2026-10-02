import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Lots',  value: lots.length,  color: 'var(--teal)',  icon: 'package' },
          { label: 'Expired',     value: expired,      color: 'var(--red)',   icon: 'alertCircle' },
          { label: 'Near Expiry', value: nearExpiry,   color: 'var(--gold)',  icon: 'clock' },
          ...(caps.customs
            ? [{ label: 'Held / Exam', value: held,   color: 'var(--red)',   icon: 'shield' }]
            : [{ label: 'With SKU',   value: withSku,  color: 'var(--green)', icon: 'tag' }]),
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: k.color, opacity: 0.75, flexShrink: 0 }}>
              <Icon name={k.icon as any} size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3, whiteSpace: 'nowrap' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        {caps.customs && (
          <SingleSelectFilter
            label="Customs status"
            value={statusFilter}
            options={statusOptions}
            onChange={v => setStatusFilter(v ?? STATUS_ALL)}
          />
        )}
        <div style={{ flex: 1 }}>
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
            <div className="seal-empty">No lots match these filters.</div>
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
