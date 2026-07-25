import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { CUSTOMS_STATUS_VARIANT } from '../lib/sealStatus.js';
import { CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import './Seal.css';

interface DashboardData {
  compartmentCount: number;
  lotCount: number;
  expiringSoonCount: number;
  byStatus: { status: CustomsStatus; count: number }[];
}

interface Compartment {
  id: string; code: string; name: string; warehouse_type: string; jurisdiction: string;
}

export function SealDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    Promise.all([
      apiFetch(`/v1/seal/dashboard?${params.toString()}`),
      apiFetch('/v1/seal/compartments'),
    ]).then(([d, c]) => { setData(d); setCompartments(c); }).finally(() => setLoading(false));
  }, [compartmentId]);

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Bonded Warehouse Overview</h1>
          <p className="seal-page-sub">The customs-controlled stock ledger — every physical movement here writes a fiscal consequence.</p>
        </div>
        <button type="button" className="seal-btn-primary" onClick={() => navigate('/seal/lots')}>
          <Icon name="package" size={14} />
          <span>View All Lots</span>
        </button>
      </div>

      {loading ? (
        <div className="seal-empty">Loading…</div>
      ) : (
        <>
          <div className="seal-kpi-strip">
            <div className="seal-kpi-card">
              <div className="seal-kpi-value">{data?.compartmentCount ?? 0}</div>
              <div className="seal-kpi-label">Compartments</div>
            </div>
            <div className="seal-kpi-card">
              <div className="seal-kpi-value">{data?.lotCount ?? 0}</div>
              <div className="seal-kpi-label">Lots on Hand</div>
            </div>
            <div className="seal-kpi-card">
              <div className={`seal-kpi-value${(data?.expiringSoonCount ?? 0) > 0 ? ' seal-kpi-value--alert' : ''}`}>{data?.expiringSoonCount ?? 0}</div>
              <div className="seal-kpi-label">Expiring &le; 30 Days</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="seal-card">
              <div className="seal-card-hdr">
                <h2 className="seal-card-title">Lots by Customs Status</h2>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(data?.byStatus?.length ?? 0) === 0 ? (
                  <div className="seal-empty">No lots yet.</div>
                ) : data!.byStatus.map(row => (
                  <div key={row.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Badge variant={CUSTOMS_STATUS_VARIANT[row.status]}>{CUSTOMS_STATUS_LABELS[row.status] ?? row.status}</Badge>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="seal-card">
              <div className="seal-card-hdr">
                <h2 className="seal-card-title">Compartments</h2>
                <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/compartments')}>
                  <Icon name="layers" size={13} />
                  <span>Manage</span>
                </button>
              </div>
              <div style={{ padding: 8 }}>
                {compartments.length === 0 ? (
                  <div className="seal-empty">No compartments yet.</div>
                ) : compartments.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                    <FeaturedIcon variant="brand" size="sm" shape="square">
                      <Icon name="layers" size={15} />
                    </FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                      <div className="seal-mono" style={{ color: 'var(--ink3)', fontSize: 11.5 }}>{c.code} · {c.jurisdiction}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
