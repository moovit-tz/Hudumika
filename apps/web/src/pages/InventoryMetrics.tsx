import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js';
import { Badge } from '../components/ui/badge.js';
import { ClickableBarChart } from '../components/AnalyticsKit.js';
import { apiFetch } from '../lib/api.js';
import './Inventory.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface DailyActivity { date: string; received: number; issued: number; }
interface WarehouseMetric { warehouseId: string; name: string; itemCount: number; totalQty: number; }
interface LowStockItem { itemId: string; sku: string; name: string; baseUom: string; reorderPoint: number; totalQtyOnHand: number; }
interface Metrics {
  itemCount: number; warehouseCount: number; byWarehouse: WarehouseMetric[];
  dailyActivity: DailyActivity[]; topLowStock: LowStockItem[];
}

export function InventoryMetrics() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/inventory/metrics').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="inv-page"><div className="inv-empty">Loading metrics…</div></div>;

  const activityDays = data.dailyActivity.filter((_, i) => i % 3 === 0 || i === data.dailyActivity.length - 1);

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <h1 className="inv-page-title">Metrics</h1>
          <p className="inv-page-sub">Every number here traces to a real inventory_movements or inventory_stock_levels row — no fabricated figures.</p>
        </div>
      </div>

      <div className="inv-kpi-strip">
        <div className="inv-kpi-card">
          <div className="inv-kpi-value">{data.itemCount}</div>
          <div className="inv-kpi-label">Active Items</div>
        </div>
        <div className="inv-kpi-card">
          <div className="inv-kpi-value">{data.warehouseCount}</div>
          <div className="inv-kpi-label">Warehouses</div>
        </div>
        <div className="inv-kpi-card">
          <div className={`inv-kpi-value${data.topLowStock.length > 0 ? ' inv-kpi-value--alert' : ''}`}>{data.topLowStock.length}</div>
          <div className="inv-kpi-label">Items Below Reorder Point</div>
        </div>
      </div>

      <div className="inv-card" style={{ marginBottom: 20 }}>
        <div className="inv-card-hdr">
          <h2 className="inv-card-title">Receiving &amp; Issuing Activity — Last 30 Days</h2>
        </div>
        <div style={{ padding: 20 }}>
          {data.dailyActivity.every(d => d.received === 0 && d.issued === 0) ? (
            <div className="inv-empty">No receipt or issue movements recorded in the last 30 days.</div>
          ) : (
            <ClickableBarChart
              labels={activityDays.map(d => new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }))}
              values={activityDays.map(d => d.received - d.issued)}
              barColors={activityDays.map(d => (d.received - d.issued) >= 0 ? 'rgba(20,184,166,.75)' : 'rgba(220,38,38,.75)')}
              yLabel="Net units (received − issued)"
            />
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="inv-card">
          <div className="inv-card-hdr"><h2 className="inv-card-title">By Warehouse</h2></div>
          <div className="inv-card-body">
            {data.byWarehouse.length === 0 ? (
              <div className="inv-empty">No warehouses yet.</div>
            ) : (
              <table className="inv-table">
                <thead><tr><th>Warehouse</th><th>Distinct Items</th><th>Total Qty</th></tr></thead>
                <tbody>
                  {data.byWarehouse.map(w => (
                    <tr key={w.warehouseId}>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{w.name}</td>
                      <td>{w.itemCount}</td>
                      <td className="inv-mono">{w.totalQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="inv-card">
          <div className="inv-card-hdr"><h2 className="inv-card-title">Top Low-Stock Items</h2></div>
          <div className="inv-card-body">
            {data.topLowStock.length === 0 ? (
              <div className="inv-empty">Nothing below its reorder point right now.</div>
            ) : (
              <table className="inv-table">
                <thead><tr><th>Item</th><th>On Hand</th><th>Reorder Point</th></tr></thead>
                <tbody>
                  {data.topLowStock.map(item => (
                    <tr key={item.itemId}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
                        <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{item.sku}</div>
                      </td>
                      <td><Badge variant="warning">{item.totalQtyOnHand} {item.baseUom}</Badge></td>
                      <td>{item.reorderPoint} {item.baseUom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
