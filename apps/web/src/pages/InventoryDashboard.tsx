import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { ClickableBarChart } from '../components/AnalyticsKit.js';
import { apiFetch } from '../lib/api.js';
import './Inventory.css';
import { PageHeader } from '../components/PageHeader.js';

interface Warehouse { id: string; code: string; name: string; }
interface Item { id: string; sku: string; name: string; isBatchTracked: boolean; }
interface ReorderAlert { itemId: string; sku: string; name: string; baseUom: string; reorderPoint: number; reorderQty: number | null; totalQtyOnHand: number; }
interface DailyActivity { date: string; received: number; issued: number; }
interface MetricsData {
  itemCount: number; warehouseCount: number; outOfStockCount: number;
  dailyActivity: DailyActivity[];
}

export function InventoryDashboard() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [alerts, setAlerts] = useState<ReorderAlert[]>([]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/inventory/warehouses').catch(() => []),
      apiFetch('/v1/inventory/items').catch(() => []),
      apiFetch('/v1/inventory/reorder-alerts').catch(() => []),
      apiFetch('/v1/inventory/metrics').catch(() => null),
    ]).then(([w, i, a, m]) => {
      setWarehouses(w ?? []);
      setItems(i ?? []);
      setAlerts(a ?? []);
      setMetrics(m);
    }).finally(() => setLoading(false));
  }, []);

  const history = metrics?.dailyActivity ?? [];

  return (
    <div className="inv-page">
      {/* Header */}
      <div className="inv-page-hdr">
        <div>
          <PageHeader
            crumbs={['Inventory', 'Inventory Control Dashboard']}
            titlePlain="Inventory Control"
            titleEm="dashboard"
            subtitle="General multi-warehouse stock management — metrics, reorder alerts, stock movements &amp; item catalogs."
          />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button type="button" variant="outline" onClick={() => navigate('/inventory/stock')}>
            <Icon name="layers" size={14} />
            <span>Stock Levels</span>
          </Button>
          <Button type="button" onClick={() => navigate('/inventory/items')}>
            <Icon name="package" size={14} />
            <span>Manage Items</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="inv-empty">Loading inventory metrics &amp; dashboard data…</div>
      ) : (
        <>
          {/* KPI Strip */}
          <div className="inv-kpi-strip">
            <div className="inv-kpi-card">
              <div className="inv-kpi-value">{warehouses.length}</div>
              <div className="inv-kpi-label">Warehouses</div>
            </div>
            <div className="inv-kpi-card">
              <div className="inv-kpi-value">{items.length}</div>
              <div className="inv-kpi-label">Items Tracked</div>
            </div>
            <div className="inv-kpi-card">
              <div className="inv-kpi-value">{items.filter(i => i.isBatchTracked).length}</div>
              <div className="inv-kpi-label">Batch-Tracked Items</div>
            </div>
            <div className="inv-kpi-card">
              <div className={`inv-kpi-value${alerts.length > 0 ? ' inv-kpi-value--alert' : ''}`}>{alerts.length}</div>
              <div className="inv-kpi-label">Reorder Alerts</div>
            </div>
            <div className="inv-kpi-card">
              <div className={`inv-kpi-value${(metrics?.outOfStockCount ?? 0) > 0 ? ' inv-kpi-value--alert' : ''}`}>
                {metrics?.outOfStockCount ?? 0}
              </div>
              <div className="inv-kpi-label">Out of Stock</div>
            </div>
          </div>

          {/* Movement Activity Chart */}
          <div className="inv-card" style={{ marginBottom: 24 }}>
            <div className="inv-card-hdr">
              <div>
                <h2 className="inv-card-title">Stock Inbound &amp; Outbound Movements — Recent Activity</h2>
              </div>
              <Badge variant="brand">Stock Telemetry</Badge>
            </div>
            <div style={{ padding: 20 }}>
              {history.length === 0 || history.every(h => h.received === 0 && h.issued === 0) ? (
                <div className="inv-empty">No receipt or issue movements recorded in the last 30 days.</div>
              ) : (
                <ClickableBarChart
                  labels={history.map(h => new Date(h.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }))}
                  values={history.map(h => h.received - h.issued)}
                  barColors={history.map(h => (h.received - h.issued) >= 0 ? 'rgba(59,130,246,.75)' : 'rgba(239,68,68,.75)')}
                  yLabel="Net quantity (received − issued)"
                />
              )}
            </div>
          </div>

          {/* Grid Layout: Reorder Alerts & Warehouses */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Reorder Alerts */}
            <div className="inv-card">
              <div className="inv-card-hdr">
                <h2 className="inv-card-title">Reorder Point Alerts</h2>
                <Button type="button" variant="link" size="sm" onClick={() => navigate('/inventory/stock')}>
                  View Stock →
                </Button>
              </div>
              <div className="inv-card-body">
                {alerts.length === 0 ? (
                  <div className="inv-empty">All stock levels are optimal. No reorder alerts.</div>
                ) : (
                  <table className="inv-table">
                    <thead><tr><th>Item</th><th>On Hand</th><th>Reorder Point</th><th>Suggested Qty</th></tr></thead>
                    <tbody>
                      {alerts.map(a => (
                        <tr key={a.itemId}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{a.name}</div>
                            <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{a.sku}</div>
                          </td>
                          <td><Badge variant="warning">{a.totalQtyOnHand} {a.baseUom}</Badge></td>
                          <td>{a.reorderPoint} {a.baseUom}</td>
                          <td>{a.reorderQty != null ? `${a.reorderQty} ${a.baseUom}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Warehouses Overview */}
            <div className="inv-card">
              <div className="inv-card-hdr">
                <h2 className="inv-card-title">Storage Warehouses</h2>
                <Button type="button" variant="link" size="sm" onClick={() => navigate('/inventory/warehouses')}>
                  Manage Warehouses →
                </Button>
              </div>
              <div style={{ padding: 12 }}>
                {warehouses.length === 0 ? (
                  <div className="inv-empty">No storage warehouses defined.</div>
                ) : (
                  warehouses.map(w => (
                    <div
                      key={w.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        borderRadius: 12, border: '1px solid var(--border)', marginBottom: 10,
                        background: 'var(--white)',
                      }}
                    >
                      <FeaturedIcon variant="brand" size="sm" shape="square">
                        <Icon name="warehouse" size={16} />
                      </FeaturedIcon>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{w.name}</div>
                        <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11.5, marginTop: 2 }}>{w.code}</div>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
