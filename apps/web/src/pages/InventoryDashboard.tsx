import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import './Inventory.css';

interface Warehouse { id: string; code: string; name: string; }
interface Item { id: string; sku: string; name: string; isBatchTracked: boolean; }

export function InventoryDashboard() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/inventory/warehouses'),
      apiFetch('/v1/inventory/items'),
    ]).then(([w, i]) => { setWarehouses(w); setItems(i); }).finally(() => setLoading(false));
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
          </div>

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
