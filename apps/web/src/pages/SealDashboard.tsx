import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from 'recharts';
import { Icon } from '../components/Icon.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import './SealInventoryDashboard.css';
import { PageHeader } from '../components/PageHeader.js';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  warehouse: string;
  qty: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  value: number; // numerical value for sorting / export
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

const INITIAL_ITEMS: InventoryItem[] = [
  {
    id: 'item-1',
    name: 'Smart Watch Ultra',
    sku: 'SKU-48120',
    category: 'Electronics',
    warehouse: 'Warehouse A',
    qty: 312,
    reserved: 48,
    available: 264,
    reorderLevel: 80,
    value: 62400,
    status: 'in_stock',
  },
  {
    id: 'item-2',
    name: 'Aurora Headset',
    sku: 'SKU-48121',
    category: 'Electronics',
    warehouse: 'Warehouse A',
    qty: 204,
    reserved: 22,
    available: 182,
    reorderLevel: 60,
    value: 28900,
    status: 'in_stock',
  },
  {
    id: 'item-3',
    name: 'Cascade Jacket',
    sku: 'SKU-32209',
    category: 'Apparel',
    warehouse: 'Warehouse B',
    qty: 18,
    reserved: 4,
    available: 14,
    reorderLevel: 25,
    value: 1700,
    status: 'low_stock',
  },
  {
    id: 'item-4',
    name: 'Flex Resistance Set',
    sku: 'SKU-77310',
    category: 'Fitness & Sports',
    warehouse: 'Warehouse C',
    qty: 0,
    reserved: 0,
    available: 0,
    reorderLevel: 40,
    value: 0,
    status: 'out_of_stock',
  },
  {
    id: 'item-5',
    name: 'Halo Smart Lamp',
    sku: 'SKU-55102',
    category: 'Home & Living',
    warehouse: 'Warehouse B',
    qty: 9,
    reserved: 2,
    available: 7,
    reorderLevel: 20,
    value: 900,
    status: 'low_stock',
  },
  {
    id: 'item-6',
    name: 'Trailblazer Backpack',
    sku: 'SKU-91847',
    category: 'Outdoor & Camping',
    warehouse: 'Warehouse D',
    qty: 156,
    reserved: 12,
    available: 144,
    reorderLevel: 50,
    value: 9400,
    status: 'in_stock',
  },
  {
    id: 'item-7',
    name: 'Nimbus Bluetooth Speaker',
    sku: 'SKU-63321',
    category: 'Electronics',
    warehouse: 'Warehouse A',
    qty: 88,
    reserved: 6,
    available: 82,
    reorderLevel: 30,
    value: 5200,
    status: 'in_stock',
  },
  {
    id: 'item-8',
    name: 'Ridgeline Hiking Boots',
    sku: 'SKU-40218',
    category: 'Outdoor & Camping',
    warehouse: 'Warehouse C',
    qty: 42,
    reserved: 8,
    available: 34,
    reorderLevel: 35,
    value: 6800,
    status: 'low_stock',
  },
  {
    id: 'item-9',
    name: 'Zenith Yoga Mat',
    sku: 'SKU-28850',
    category: 'Fitness & Sports',
    warehouse: 'Warehouse D',
    qty: 214,
    reserved: 15,
    available: 199,
    reorderLevel: 60,
    value: 3100,
    status: 'in_stock',
  },
  {
    id: 'item-10',
    name: 'Ember Camping Stove',
    sku: 'SKU-70094',
    category: 'Outdoor & Camping',
    warehouse: 'Warehouse B',
    qty: 0,
    reserved: 0,
    available: 0,
    reorderLevel: 20,
    value: 0,
    status: 'out_of_stock',
  },
  {
    id: 'item-11',
    name: 'Pulse Heart Rate Monitor',
    sku: 'SKU-58210',
    category: 'Fitness & Sports',
    warehouse: 'Warehouse A',
    qty: 95,
    reserved: 10,
    available: 85,
    reorderLevel: 30,
    value: 7600,
    status: 'in_stock',
  },
  {
    id: 'item-12',
    name: 'Vertex Waterproof Duffel',
    sku: 'SKU-99341',
    category: 'Outdoor & Camping',
    warehouse: 'Warehouse D',
    qty: 12,
    reserved: 2,
    available: 10,
    reorderLevel: 25,
    value: 1440,
    status: 'low_stock',
  },
];

const WAREHOUSE_OPTIONS = [
  'All Warehouses',
  'Warehouse A',
  'Warehouse B',
  'Warehouse C',
  'Warehouse D',
  'Warehouse E – North',
  'Warehouse F – Overseas',
];

const CATEGORY_OPTIONS = [
  'All Categories',
  'Electronics',
  'Apparel',
  'Fitness & Sports',
  'Home & Living',
  'Outdoor & Camping',
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
];

const STOCK_TREND_DATA = [
  { month: 'Jan', units: 2400 },
  { month: 'Feb', units: 1900 },
  { month: 'Mar', units: 3800 },
  { month: 'Apr', units: 1700 },
  { month: 'May', units: 2600 },
  { month: 'Jun', units: 4200 },
  { month: 'Jul', units: 4710 },
];

import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { apiFetch } from '../lib/api.js';

interface Compartment {
  id: string;
  code: string;
  name: string;
}

export function SealDashboard() {
  const navigate = useNavigate();
  const [compartmentId, setCompartmentId] = useSealCompartmentId();
  const [dbCompartments, setDbCompartments] = useState<Compartment[]>([]);

  // Fetch real compartments from backend
  React.useEffect(() => {
    apiFetch('/v1/seal/compartments')
      .then((data: any) => {
        if (Array.isArray(data) && data.length > 0) {
          setDbCompartments(data);
        }
      })
      .catch(() => setDbCompartments([]));
  }, []);

  // Combined warehouse list
  const warehouseList = useMemo(() => {
    if (dbCompartments.length > 0) {
      return ['All Warehouses', ...dbCompartments.map(c => c.name)];
    }
    return WAREHOUSE_OPTIONS;
  }, [dbCompartments]);

  // Selected warehouse name
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(() => {
    return 'Warehouse A';
  });

  // Keep selected warehouse in sync if compartmentId changes
  React.useEffect(() => {
    if (!compartmentId) {
      setSelectedWarehouse('All Warehouses');
    } else {
      const match = dbCompartments.find(c => c.id === compartmentId);
      if (match) setSelectedWarehouse(match.name);
    }
  }, [compartmentId, dbCompartments]);

  const handleSelectWarehouse = (wName: string) => {
    setSelectedWarehouse(wName);
    if (wName === 'All Warehouses') {
      setCompartmentId(null);
    } else {
      const match = dbCompartments.find(c => c.name === wName);
      if (match) {
        setCompartmentId(match.id);
      } else {
        setCompartmentId(wName);
      }
    }
  };

  // Filter States
  const [items, setItems] = useState<InventoryItem[]>(INITIAL_ITEMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [dateRangeText, setDateRangeText] = useState('Jul 1 – Jul 20');

  // Dropdown States
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('Cycle Count Adjustment');

  // Form State for Add Item
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    category: 'Electronics',
    warehouse: 'Warehouse A',
    qty: 100,
    reserved: 0,
    reorderLevel: 25,
    unitValue: 50,
  });

  // Filtered Items Computation
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Warehouse filter
      if (selectedWarehouse !== 'All Warehouses' && item.warehouse !== selectedWarehouse) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'All Categories' && item.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'ALL' && item.status !== selectedStatus) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesSku = item.sku.toLowerCase().includes(q);
        const matchesCat = item.category.toLowerCase().includes(q);
        const matchesWh = item.warehouse.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesCat && !matchesWh) return false;
      }
      return true;
    });
  }, [items, selectedWarehouse, selectedCategory, selectedStatus, searchQuery]);

  // Formatter for values (e.g. $62.4K or $0.00)
  const formatCurrency = (val: number) => {
    if (val === 0) return '$0.00';
    if (val >= 1000) {
      return `$${(val / 1000).toFixed(1)}K`;
    }
    return `$${val.toLocaleString()}`;
  };

  // Status Badge Renderer
  const renderStatusBadge = (status: InventoryItem['status']) => {
    if (status === 'in_stock') {
      return (
        <span className="sid-pill sid-pill--in-stock">
          <span className="sid-pill-dot" />
          In Stock
        </span>
      );
    }
    if (status === 'low_stock') {
      return (
        <span className="sid-pill sid-pill--low-stock">
          <span className="sid-pill-dot" />
          Low Stock
        </span>
      );
    }
    return (
      <span className="sid-pill sid-pill--out-of-stock">
        <span className="sid-pill-dot" />
        Out of Stock
      </span>
    );
  };

  // Add Item Handler
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim() || !newItem.sku.trim()) {
      showAlert('Product name and SKU are required.', { variant: 'error' });
      return;
    }

    const qty = Number(newItem.qty) || 0;
    const reserved = Number(newItem.reserved) || 0;
    const available = Math.max(0, qty - reserved);
    const reorderLevel = Number(newItem.reorderLevel) || 10;
    const unitVal = Number(newItem.unitValue) || 0;
    const totalVal = qty * unitVal;

    let status: InventoryItem['status'] = 'in_stock';
    if (qty === 0) {
      status = 'out_of_stock';
    } else if (available <= reorderLevel) {
      status = 'low_stock';
    }

    const created: InventoryItem = {
      id: `item-${Date.now()}`,
      name: newItem.name.trim(),
      sku: newItem.sku.trim().toUpperCase(),
      category: newItem.category,
      warehouse: newItem.warehouse,
      qty,
      reserved,
      available,
      reorderLevel,
      value: totalVal,
      status,
    };

    setItems(prev => [created, ...prev]);
    setShowAddModal(false);
    setNewItem({
      name: '',
      sku: '',
      category: 'Electronics',
      warehouse: 'Warehouse A',
      qty: 100,
      reserved: 0,
      reorderLevel: 25,
      unitValue: 50,
    });
    showAlert(`Successfully added ${created.name} (${created.sku})`, { variant: 'success' });
  };

  // Export Table to CSV
  const handleExportCSV = () => {
    const headers = ['Product', 'SKU', 'Category', 'Warehouse', 'Qty', 'Reserved', 'Available', 'Reorder Level', 'Value', 'Status'];
    const csvRows = [
      headers.join(','),
      ...filteredItems.map(i => [
        `"${i.name.replace(/"/g, '""')}"`,
        `"${i.sku}"`,
        `"${i.category}"`,
        `"${i.warehouse}"`,
        i.qty,
        i.reserved,
        i.available,
        i.reorderLevel,
        `"${formatCurrency(i.value)}"`,
        `"${i.status}"`,
      ].join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert(`Exported ${filteredItems.length} inventory records to CSV.`, { variant: 'success' });
  };

  // Adjust Stock Handler
  const handleSaveAdjustment = () => {
    if (!adjustingItem) return;
    const delta = Number(adjustQty) || 0;
    const newTotal = Math.max(0, adjustingItem.qty + delta);
    const newAvail = Math.max(0, newTotal - adjustingItem.reserved);

    let newStatus: InventoryItem['status'] = 'in_stock';
    if (newTotal === 0) newStatus = 'out_of_stock';
    else if (newAvail <= adjustingItem.reorderLevel) newStatus = 'low_stock';

    const unitPrice = adjustingItem.qty > 0 ? adjustingItem.value / adjustingItem.qty : 50;

    setItems(prev => prev.map(item => {
      if (item.id === adjustingItem.id) {
        return {
          ...item,
          qty: newTotal,
          available: newAvail,
          value: newTotal * unitPrice,
          status: newStatus,
        };
      }
      return item;
    }));

    showAlert(`Adjusted ${adjustingItem.name} by ${delta >= 0 ? '+' : ''}${delta} units (${adjustReason})`, { variant: 'success' });
    setAdjustingItem(null);
    setAdjustQty(0);
  };

  return (
    <div className="seal-page" onClick={() => setActiveActionMenuId(null)}>
      <PageHeader
        crumbs={['SEAL']}
        titlePlain="Warehouse"
        titleEm="dashboard"
        subtitle="Stock levels, movement and reorder health across all warehouses."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            <Select
              value={compartmentId ?? '__all__'}
              onValueChange={v => {
                if (v === '__all__') { setCompartmentId(null); setSelectedWarehouse('All Warehouses'); }
                else { const m = dbCompartments.find(c => c.id === v); setCompartmentId(v); setSelectedWarehouse(m?.name ?? v); }
              }}
            >
              <SelectTrigger style={{ minWidth: 160 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Warehouses</SelectItem>
                {dbCompartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" className="sid-btn-outline" onClick={() => setShowImportModal(true)}>
              <Icon name="fileText" size={14} color="var(--ink2)" /><span>Import</span>
            </button>
            <button type="button" className="sid-btn-outline" onClick={handleExportCSV}>
              <Icon name="send" size={14} color="var(--ink2)" /><span>Export</span>
            </button>
            <button type="button" className="sid-btn-primary" onClick={() => setShowAddModal(true)}>
              <Icon name="plus" size={14} color="currentColor" /><span>Add Item</span>
            </button>
          </div>
        }
      />

      {/* ── Top Bento Row (2 Cards) ── */}
      <div className="sid-bento-grid">
        
        {/* Left Card: Stock Level Trend */}
        <div className="sid-card">
          <div>
            <div className="sid-card-header">
              <div>
                <h2 className="sid-card-title">Stock Level Trend</h2>
                <div className="sid-card-sub">In-stock units, last 6 months</div>
              </div>
              <span className="sid-card-badge-success">
                <Icon name="trendingUp" size={12} />
                +12.4% vs Jun
              </span>
            </div>

            {/* Recharts Area Chart */}
            <div className="sid-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={STOCK_TREND_DATA} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sealStockAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--teal)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--ink3)' }}
                  />
                  <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toLocaleString()} units`, 'Stock']}
                    contentStyle={{
                      background: 'var(--white)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      boxShadow: 'var(--elev-sm)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="units"
                    stroke="var(--teal)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#sealStockAreaGrad)"
                    dot={{ r: 4, fill: 'var(--teal)', stroke: 'var(--white)', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: 'var(--teal)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Analysis Strip */}
          <div className="sid-chart-stats-row">
            {/* ABC Analysis */}
            <div className="sid-stat-block">
              <div className="sid-stat-lbl">ABC Analysis</div>
              <div className="sid-segmented-bar">
                <div className="sid-seg-a" style={{ width: '20%' }} title="A: 20%" />
                <div className="sid-seg-b" style={{ width: '30%' }} title="B: 30%" />
                <div className="sid-seg-c" style={{ width: '50%' }} title="C: 50%" />
              </div>
              <div className="sid-stat-meta">A: 20% &middot; B: 30% &middot; C: 50%</div>
            </div>

            {/* Stock Aging */}
            <div className="sid-stat-block">
              <div className="sid-stat-lbl">Stock Aging</div>
              <div className="sid-segmented-bar">
                <div className="sid-seg-age-1" style={{ width: '62%' }} title="<30d: 62%" />
                <div className="sid-seg-age-2" style={{ width: '24%' }} title="30-90d: 24%" />
                <div className="sid-seg-age-3" style={{ width: '14%' }} title="90d+: 14%" />
              </div>
              <div className="sid-stat-meta">&lt;30d: 62% &middot; 30-90d: 24% &middot; 90d+: 14%</div>
            </div>
          </div>
        </div>

        {/* Right Card: Warehouse Distribution */}
        <div className="sid-card">
          <div>
            <div className="sid-card-header">
              <h2 className="sid-card-title">Warehouse Distribution</h2>
              <span className="sid-card-link" onClick={() => navigate('/seal/compartments')}>
                Manage warehouses
                <Icon name="arrowUpRight" size={12} />
              </span>
            </div>

            {/* Overview Row with Circular Donut Gauge */}
            <div className="sid-dist-overview">
              <div className="sid-donut-wrap">
                <svg width="54" height="54" viewBox="0 0 42 42">
                  <circle
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="transparent"
                    stroke="var(--bg)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="transparent"
                    stroke="var(--teal)"
                    strokeWidth="4"
                    strokeDasharray="60 40"
                    strokeDashoffset="25"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="sid-donut-center">60%</div>
              </div>

              <div className="sid-dist-stats">
                <div className="sid-dist-stat-item">
                  <div className="sid-dist-stat-lbl">Avg. Utilization</div>
                  <div className="sid-dist-stat-val">60%</div>
                </div>
                <div className="sid-dist-stat-item">
                  <div className="sid-dist-stat-lbl">Total Capacity</div>
                  <div className="sid-dist-stat-val">184,200</div>
                </div>
                <div className="sid-dist-stat-item">
                  <div className="sid-dist-stat-lbl">Nearing Capacity</div>
                  <div className="sid-dist-stat-val sid-dist-stat-val--alert">1 site</div>
                </div>
              </div>
            </div>

            {/* Warehouse Utilization List */}
            <div className="sid-wh-list">
              {/* Warehouse E - North (82%) */}
              <div className="sid-wh-item">
                <div className="sid-wh-icon-wrap sid-wh-icon--rose">
                  <Icon name="building" size={14} />
                </div>
                <div className="sid-wh-info">
                  <div className="sid-wh-top">
                    <span>Warehouse E – North</span>
                    <span className="sid-wh-pct">82%</span>
                  </div>
                  <div className="sid-wh-track">
                    <div className="sid-wh-fill sid-wh-fill--rose" style={{ width: '82%' }} />
                  </div>
                </div>
              </div>

              {/* Warehouse B - South (71%) */}
              <div className="sid-wh-item">
                <div className="sid-wh-icon-wrap sid-wh-icon--amber">
                  <Icon name="building" size={14} />
                </div>
                <div className="sid-wh-info">
                  <div className="sid-wh-top">
                    <span>Warehouse B – South</span>
                    <span className="sid-wh-pct">71%</span>
                  </div>
                  <div className="sid-wh-track">
                    <div className="sid-wh-fill sid-wh-fill--amber" style={{ width: '71%' }} />
                  </div>
                </div>
              </div>

              {/* Warehouse A - East (68%) */}
              <div className="sid-wh-item">
                <div className="sid-wh-icon-wrap sid-wh-icon--teal">
                  <Icon name="building" size={14} />
                </div>
                <div className="sid-wh-info">
                  <div className="sid-wh-top">
                    <span>Warehouse A – East</span>
                    <span className="sid-wh-pct">68%</span>
                  </div>
                  <div className="sid-wh-track">
                    <div className="sid-wh-fill sid-wh-fill--teal" style={{ width: '68%' }} />
                  </div>
                </div>
              </div>

              {/* Warehouse F - Overseas (46%) */}
              <div className="sid-wh-item">
                <div className="sid-wh-icon-wrap sid-wh-icon--teal">
                  <Icon name="building" size={14} />
                </div>
                <div className="sid-wh-info">
                  <div className="sid-wh-top">
                    <span>Warehouse F – Overseas</span>
                    <span className="sid-wh-pct">46%</span>
                  </div>
                  <div className="sid-wh-track">
                    <div className="sid-wh-fill sid-wh-fill--teal" style={{ width: '46%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="sid-filter-bar">
        <div className="sid-search-wrap">
          <Icon name="search" size={16} />
          <input
            type="text"
            className="sid-search-input"
            placeholder="Search by product or SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink3)' }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
          {CATEGORY_OPTIONS.map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
          {STATUS_OPTIONS.map(s => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Products Inventory Table ── */}
      <div className="sid-table-card">
        <div className="sid-table-wrap">
          <table className="sid-table">
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>SKU</th>
                <th>WAREHOUSE</th>
                <th>QTY</th>
                <th>RESERVED</th>
                <th>AVAILABLE</th>
                <th>REORDER LEVEL</th>
                <th>VALUE</th>
                <th>STATUS</th>
                <th style={{ width: 40, textAlign: 'center' }} />
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink3)' }}>
                    No inventory records match your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="sid-prod-name">{item.name}</span>
                    </td>
                    <td>
                      <span className="sid-sku-code">{item.sku}</span>
                    </td>
                    <td>
                      <span className="sid-wh-col">{item.warehouse}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.qty}</td>
                    <td style={{ color: 'var(--ink3)' }}>{item.reserved}</td>
                    <td style={{ fontWeight: 700, color: item.available === 0 ? 'var(--red)' : 'var(--ink)' }}>
                      {item.available}
                    </td>
                    <td style={{ color: 'var(--ink3)' }}>{item.reorderLevel}</td>
                    <td className="sid-val-col">{formatCurrency(item.value)}</td>
                    <td>{renderStatusBadge(item.status)}</td>
                    <td style={{ textAlign: 'center', position: 'relative' }}>
                      <button
                        type="button"
                        className="sid-action-btn"
                        onClick={e => {
                          e.stopPropagation();
                          setActiveActionMenuId(activeActionMenuId === item.id ? null : item.id);
                        }}
                      >
                        <Icon name="moreVertical" size={15} />
                      </button>

                      {/* Row Action Dropdown Menu */}
                      {activeActionMenuId === item.id && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            right: 12,
                            marginTop: 2,
                            background: 'var(--white)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-sm)',
                            boxShadow: 'var(--elev-lg, 0 10px 25px rgba(0,0,0,0.15))',
                            zIndex: 60,
                            minWidth: 160,
                            padding: 4,
                            textAlign: 'left',
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <div
                            onClick={() => {
                              setAdjustingItem(item);
                              setAdjustQty(0);
                              setActiveActionMenuId(null);
                            }}
                            style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', borderRadius: 'var(--r-sm)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            Adjust Stock
                          </div>
                          <div
                            onClick={() => {
                              showAlert(`Barcode printed for ${item.sku}`, { variant: 'success' });
                              setActiveActionMenuId(null);
                            }}
                            style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', borderRadius: 'var(--r-sm)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            Print Barcode
                          </div>
                          <div
                            onClick={() => {
                              setItems(prev => prev.filter(i => i.id !== item.id));
                              showAlert(`Deleted ${item.name}`, { variant: 'warning' });
                              setActiveActionMenuId(null);
                            }}
                            style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--red)', cursor: 'pointer', borderRadius: 'var(--r-sm)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(225,29,72,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            Delete SKU
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Item Modal Dialog ── */}
      {showAddModal && (
        <div className="sid-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="sid-modal" onClick={e => e.stopPropagation()}>
            <div className="sid-modal-hdr">
              <div className="sid-modal-title">Add Inventory Item</div>
              <button
                type="button"
                className="sid-action-btn"
                onClick={() => setShowAddModal(false)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleAddItem}>
              <div className="sid-modal-body">
                <div className="sid-form-group">
                  <label className="sid-form-label">Product Name</label>
                  <input
                    type="text"
                    className="sid-input"
                    placeholder="e.g. Smart Watch Ultra"
                    value={newItem.name}
                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sid-form-group">
                    <label className="sid-form-label">SKU Code</label>
                    <input
                      type="text"
                      className="sid-input"
                      placeholder="e.g. SKU-48120"
                      value={newItem.sku}
                      onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                      required
                    />
                  </div>
                  <div className="sid-form-group">
                    <label className="sid-form-label">Category</label>
                    <Select value={newItem.category} onValueChange={value => setNewItem({ ...newItem, category: value })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                      {CATEGORY_OPTIONS.filter(c => c !== 'All Categories').map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sid-form-group">
                    <label className="sid-form-label">Warehouse</label>
                    <Select value={newItem.warehouse} onValueChange={value => setNewItem({ ...newItem, warehouse: value })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                      {WAREHOUSE_OPTIONS.filter(w => w !== 'All Warehouses').map(w => (
                        <SelectItem key={w} value={w}>{w}</SelectItem>
                      ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sid-form-group">
                    <label className="sid-form-label">Reorder Level</label>
                    <input
                      type="number"
                      className="sid-input"
                      value={newItem.reorderLevel}
                      onChange={e => setNewItem({ ...newItem, reorderLevel: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="sid-form-group">
                    <label className="sid-form-label">Initial Qty</label>
                    <input
                      type="number"
                      className="sid-input"
                      value={newItem.qty}
                      onChange={e => setNewItem({ ...newItem, qty: Number(e.target.value) })}
                    />
                  </div>
                  <div className="sid-form-group">
                    <label className="sid-form-label">Reserved Qty</label>
                    <input
                      type="number"
                      className="sid-input"
                      value={newItem.reserved}
                      onChange={e => setNewItem({ ...newItem, reserved: Number(e.target.value) })}
                    />
                  </div>
                  <div className="sid-form-group">
                    <label className="sid-form-label">Unit Value ($)</label>
                    <input
                      type="number"
                      className="sid-input"
                      value={newItem.unitValue}
                      onChange={e => setNewItem({ ...newItem, unitValue: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="sid-modal-footer">
                <button
                  type="button"
                  className="sid-btn-outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sid-btn-primary"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Import CSV Modal Dialog ── */}
      {showImportModal && (
        <div className="sid-modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="sid-modal" onClick={e => e.stopPropagation()}>
            <div className="sid-modal-hdr">
              <div className="sid-modal-title">Bulk Import Inventory</div>
              <button
                type="button"
                className="sid-action-btn"
                onClick={() => setShowImportModal(false)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="sid-modal-body">
              <div
                style={{
                  border: '2px dashed var(--border2)',
                  borderRadius: 'var(--r)',
                  padding: '32px 20px',
                  textAlign: 'center',
                  background: 'var(--bg)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  showAlert('Sample CSV imported successfully: +10 SKUs synced.', { variant: 'success' });
                  setShowImportModal(false);
                }}
              >
                <Icon name="upload" size={32} color="var(--teal)" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  Drag & drop CSV or Excel spreadsheet
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                  Supports .csv, .xlsx up to 25MB (Product, SKU, Qty, Warehouse)
                </div>
              </div>
            </div>
            <div className="sid-modal-footer">
              <button
                type="button"
                className="sid-btn-outline"
                onClick={() => setShowImportModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Adjustment Modal Dialog ── */}
      {adjustingItem && (
        <div className="sid-modal-backdrop" onClick={() => setAdjustingItem(null)}>
          <div className="sid-modal" onClick={e => e.stopPropagation()}>
            <div className="sid-modal-hdr">
              <div className="sid-modal-title">Adjust Stock Level &middot; {adjustingItem.name}</div>
              <button
                type="button"
                className="sid-action-btn"
                onClick={() => setAdjustingItem(null)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="sid-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 'var(--r-sm)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>CURRENT ON HAND</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{adjustingItem.qty} units</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>RESERVED</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink2)' }}>{adjustingItem.reserved} units</div>
                </div>
              </div>

              <div className="sid-form-group">
                <label className="sid-form-label">Adjustment Quantity (+ / −)</label>
                <input
                  type="number"
                  className="sid-input"
                  placeholder="e.g. +10 or -5"
                  value={adjustQty}
                  onChange={e => setAdjustQty(Number(e.target.value))}
                />
              </div>

              <div className="sid-form-group">
                <label className="sid-form-label">Reason Code</label>
                <Select value={adjustReason} onValueChange={setAdjustReason}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cycle Count Adjustment">Cycle Count Adjustment</SelectItem>
                    <SelectItem value="Purchase Receipt">Purchase Receipt</SelectItem>
                    <SelectItem value="Customer Return">Customer Return</SelectItem>
                    <SelectItem value="Damaged / Scrap">Damaged / Scrap</SelectItem>
                    <SelectItem value="Internal Transfer">Internal Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="sid-modal-footer">
              <button
                type="button"
                className="sid-btn-outline"
                onClick={() => setAdjustingItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sid-btn-primary"
                onClick={handleSaveAdjustment}
              >
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
