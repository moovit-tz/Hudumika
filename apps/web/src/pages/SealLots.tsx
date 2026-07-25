import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { CUSTOMS_STATUS_VARIANT, CUSTOMS_STATUS_COLOR_VAR } from '../lib/sealStatus.js';
import { CUSTOMS_STATUSES, CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import './Seal.css';

interface Lot {
  id: string; description: string; hsCode: string | null; ownerName?: string;
  customsStatus: CustomsStatus; currentLocationCode?: string | null;
  qtyOnHand: number; uom: string; daysRemaining: number | null; expiresOn: string | null;
}

const STATUS_ALL = '__all__';

export function SealLots() {
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(STATUS_ALL);
  const [q, setQ] = useState('');
  const [compartmentId] = useSealCompartmentId();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== STATUS_ALL) params.set('customs_status', status);
    if (q.trim()) params.set('q', q.trim());
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/lots?${params.toString()}`).then(setLots).finally(() => setLoading(false));
  }, [status, q, compartmentId]);

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Lots</h1>
          <p className="seal-page-sub">Every quantity of stock under customs control — one owner, one status, one storage clock each.</p>
        </div>
        <button type="button" className="seal-btn-primary" onClick={() => navigate('/seal/lots/new')}>
          <Icon name="plus" size={14} />
          <span>Receive Lot</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search description…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="input-field"
          style={{ maxWidth: 280 }}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="input-field" style={{ width: 220 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>All statuses</SelectItem>
            {CUSTOMS_STATUSES.map(s => <SelectItem key={s} value={s}>{CUSTOMS_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : lots.length === 0 ? (
            <div className="seal-empty">No lots match these filters.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Storage Clock</th>
                </tr>
              </thead>
              <tbody>
                {lots.map(lot => (
                  <tr key={lot.id} onClick={() => navigate(`/seal/lots/${lot.id}`)}>
                    <td>
                      <span className="seal-strip" style={{ background: `var(${CUSTOMS_STATUS_COLOR_VAR[lot.customsStatus]})` }} />
                      <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{lot.description}</div>
                        {lot.hsCode && <div className="seal-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>HS {lot.hsCode}</div>}
                      </div>
                    </td>
                    <td>{lot.ownerName ?? '—'}</td>
                    <td className="seal-mono">{lot.currentLocationCode ?? '—'}</td>
                    <td>{lot.qtyOnHand.toLocaleString()} {lot.uom}</td>
                    <td><Badge variant={CUSTOMS_STATUS_VARIANT[lot.customsStatus]}>{CUSTOMS_STATUS_LABELS[lot.customsStatus]}</Badge></td>
                    <td>
                      {lot.daysRemaining == null ? '—' : lot.daysRemaining < 0 ? (
                        <Badge variant="error">Expired</Badge>
                      ) : lot.daysRemaining <= 30 ? (
                        <Badge variant="warning">{lot.daysRemaining}d left</Badge>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>{lot.daysRemaining}d left</span>
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
