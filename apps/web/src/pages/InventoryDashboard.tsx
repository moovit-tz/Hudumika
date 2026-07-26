import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import './Inventory.css';

interface Warehouse { id: string; code: string; name: string; }
interface Item { id: string; sku: string; name: string; isBatchTracked: boolean; }
interface ReorderAlert { itemId: string; sku: string; name: string; baseUom: string; reorderPoint: number; reorderQty: number | null; totalQtyOnHand: number; }

export function InventoryDashboard() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [alerts, setAlerts] = useState<ReorderAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/inventory/warehouses'),
      apiFetch('/v1/inventory/items'),
      apiFetch('/v1/inventory/reorder-alerts'),
    ]).then(([w, i, a]) => { setWarehouses(w); setItems(i); setAlerts(a); }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <h1 className="inv-page-title">Inventory Control</h1>
          <p className="inv-page-sub">General multi-warehouse stock — a different domain from SEAL's customs-controlled bonded warehouses.</p>
        </div>
        <Button type="button" onClick={() => navigate('/inventory/items')}>
          <Icon name="package" size={14} />
          <span>Manage Items</span>
        </Button>
      </div>

      {loading ? (
        <div className="inv-empty">Loading…</div>
      ) : (
        <>
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
          </div>

          {alerts.length > 0 && (
            <div className="inv-card" style={{ marginBottom: 20 }}>
              <div className="inv-card-hdr">
                <h2 className="inv-card-title">Reorder Alerts</h2>
                <Button type="button" variant="link" size="sm" onClick={() => navigate('/inventory/stock')}>
                  View Stock →
                </Button>
              </div>
              <div className="inv-card-body">
                <table className="inv-table">
                  <thead><tr><th>Item</th><th>On Hand</th><th>Reorder Point</th><th>Suggested Reorder Qty</th></tr></thead>
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
              </div>
            </div>
          )}

          <div className="inv-card">
            <div className="inv-card-hdr">
              <h2 className="inv-card-title">Warehouses</h2>
              <Button type="button" variant="link" size="sm" onClick={() => navigate('/inventory/warehouses')}>
                Manage →
              </Button>
            </div>
            <div style={{ padding: 8 }}>
              {warehouses.length === 0 ? (
                <div className="inv-empty">No warehouses yet — <a href="/inventory/warehouses" onClick={e => { e.preventDefault(); navigate('/inventory/warehouses'); }} style={{ color: 'var(--teal)' }}>create one</a> to get started.</div>
              ) : warehouses.map(w => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="warehouse" size={15} />
                  </FeaturedIcon>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{w.name}</div>
                    <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11.5 }}>{w.code}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
