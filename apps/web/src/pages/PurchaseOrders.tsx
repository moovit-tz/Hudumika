import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { useBranding } from '../hooks/useBranding.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

// Types and Interfaces
// Mirrors the backend's purchase_orders.status CHECK constraint
// (DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED) in Titlecase for display.
type POStatus = 'Draft' | 'Sent' | 'Partial' | 'Received' | 'Cancelled';
const toApiStatus = (s: POStatus): string => s.toUpperCase();
const fromApiStatus = (s: string): POStatus => {
  const up = (s || 'DRAFT').toUpperCase();
  return (up.charAt(0) + up.slice(1).toLowerCase()) as POStatus;
};

interface POItem {
  productId: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendorId: string;
  warehouseId: string;
  orderDate: string;
  dueDate: string;
  paymentTerms: string;
  notes: string;
  items: POItem[];
  status: POStatus;
  balancePaid: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  unitPrice: number;
  taxRates: { name: string; rate: number }[];
}

interface Supplier {
  id: string;
  name: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
}

interface Warehouse {
  id: string;
  name: string;
}

// Global Mock Databases
export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Cordless Drill Machine',
    sku: 'AUTO-PROD-030',
    description: 'Rechargeable cordless drill with variable speed and multiple drill bit attachments',
    unitPrice: 70,
    taxRates: [{ name: 'GST', rate: 18 }, { name: 'VAT', rate: 12 }]
  },
  {
    id: 'prod-2',
    name: 'Brake Pad Set',
    sku: 'AUTO-PART-032',
    description: 'Durable replacement brake pads compatible with most mid-size cars and SUVs',
    unitPrice: 40,
    taxRates: [{ name: 'GST', rate: 18 }]
  },
  {
    id: 'prod-3',
    name: 'Light Bulb',
    sku: 'HOME-PART-014',
    description: 'Standard household light bulb for daily lighting needs',
    unitPrice: 250,
    taxRates: [{ name: 'GST', rate: 18 }]
  },
  {
    id: 'prod-4',
    name: 'Safety Vest',
    sku: 'SAFE-VEST-001',
    description: 'High-visibility reflective safety vest for outdoor work',
    unitPrice: 15,
    taxRates: [{ name: 'GST', rate: 18 }]
  },
  {
    id: 'prod-5',
    name: 'Hard Hat',
    sku: 'SAFE-HAT-002',
    description: 'Standard protective industrial hard hat',
    unitPrice: 25,
    taxRates: [{ name: 'GST', rate: 18 }]
  }
];

// Vendor/supplier records are real rows served by /v1/suppliers — see allSuppliers below.

const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'gulf', name: 'Gulf Coast Distribution' },
  { id: 'east', name: 'East Coast Logistics' },
  { id: 'main', name: 'Main Warehouse' },
  { id: 'bonded', name: 'Bonded Port Terminal' }
];

// Purchase orders are now real rows served by /v1/purchase-orders
// (apps/api/src/routes/purchase-orders.routes.ts). The mapping helpers below
// translate between that backend shape and this page's existing UI shape.
// Product catalog is a closed local set (MOCK_PRODUCTS), so each line's SKU
// is round-tripped through purchase_order_lines.category to resolve back to
// a productId on load.
function apiLineToItem(line: any): POItem {
  const prod = MOCK_PRODUCTS.find(p => p.sku === line.category) || MOCK_PRODUCTS[0];
  return {
    productId: prod.id,
    qty: Number(line.qty) || 1,
    unitPrice: Number(line.unit_price) || 0,
    discountPct: 0, // discount is baked into unit_price before it's sent to the backend
  };
}

function itemToApiLine(item: POItem) {
  const prod = MOCK_PRODUCTS.find(p => p.id === item.productId);
  const taxRate = prod ? prod.taxRates.reduce((sum, t) => sum + t.rate, 0) : 0;
  return {
    description: prod?.name || 'Item',
    category: prod?.sku || null,
    qty: item.qty,
    unit_price: item.unitPrice * (1 - (item.discountPct || 0) / 100),
    tax_rate: taxRate,
  };
}

function apiToPO(apiPo: any, lines: any[]): PurchaseOrder {
  return {
    id: apiPo.id,
    po_number: apiPo.po_number,
    vendorId: apiPo.supplier_id || '',
    warehouseId: apiPo.warehouse_id || '',
    orderDate: apiPo.order_date ? String(apiPo.order_date).slice(0, 10) : '',
    dueDate: apiPo.expected_date ? String(apiPo.expected_date).slice(0, 10) : '',
    paymentTerms: apiPo.payment_terms || '',
    notes: apiPo.notes || '',
    items: (lines || []).map(apiLineToItem),
    status: fromApiStatus(apiPo.status),
    balancePaid: 0, // POs don't track payment; that lives on the linked supplier bill
  };
}

const STATUS_THEME: Record<POStatus, { bg: string; color: string }> = {
  Draft:     { bg: 'var(--bg)', color: 'var(--ink2)' },
  Sent:      { bg: 'rgba(59, 130, 246, 0.12)', color: 'var(--blue)' },
  Partial:   { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--gold)' },
  Received:  { bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)' },
  Cancelled: { bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)' },
};

// Formatting Helper
const formatUSD = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TZS', minimumFractionDigits: 0 }).format(amount);
};

export const PurchaseOrders: React.FC = () => {
  const branding = useBranding();
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const formatUSD = (amount: number) => fmt(amount, 'USD');
  // Navigation & View Mode State
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'EDIT' | 'DETAILS'>('LIST');
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // Core Purchase Orders State (backed by /v1/purchase-orders)
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(true);

  const loadPOs = React.useCallback(async () => {
    try {
      const res: any = await apiFetch('/v1/purchase-orders');
      const list = Array.isArray(res?.purchase_orders) ? res.purchase_orders : [];
      const withLines = await Promise.all(list.map(async (po: any) => {
        try {
          const detail: any = await apiFetch(`/v1/purchase-orders/${po.id}`);
          return apiToPO(po, detail?.lines || []);
        } catch {
          return apiToPO(po, []);
        }
      }));
      setPOs(withLines);
    } catch {
      setPOs([]);
    } finally {
      setLoadingPOs(false);
    }
  }, []);

  useEffect(() => { loadPOs(); }, [loadPOs]);
  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'purchase-orders') setViewMode('CREATE');
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  // List View Filter/Display State
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterVendor, setFilterVendor] = useState<string>('');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [isCardView, setIsCardView] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting State
  const [sortField, setSortField] = useState<string>('po_number');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Toasts State
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: 'success' | 'info' | 'error' }[]>([]);
  const showToast = (msg: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  // Real suppliers (from the backend) — sole source for the vendor picker.
  const [apiSuppliers, setApiSuppliers] = useState<any[]>([]);
  useEffect(() => {
    apiFetch('/v1/suppliers').then((d: any) => { if (Array.isArray(d)) setApiSuppliers(d); }).catch(() => {});
  }, []);
  const allSuppliers: Supplier[] = useMemo(() => (
    apiSuppliers.map((s) => ({ id: s.id, name: s.name, email: s.email || '', billingAddress: s.address || '', shippingAddress: s.address || '' }))
  ), [apiSuppliers]);

  function handleSupplierCreated(s: any) { setApiSuppliers(prev => [...prev, s]); }

  async function searchVendorsLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? allSuppliers.filter((s) => s.name.toLowerCase().includes(ql) || s.email.toLowerCase().includes(ql))
      : allSuppliers;
    return filtered.slice(0, 25).map((s) => ({ id: s.id, label: s.name, sublabel: s.email || undefined }));
  }

  async function createVendorInline(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify({ name }) });
    handleSupplierCreated(created);
    return { id: created.id, label: created.name };
  }

  function handleVendorChange(item: PickerItem | null) {
    setFormVendorItem(item);
    setFormVendor(item?.id ?? '');
  }

  // Form State (for Create/Edit)
  const [formVendor, setFormVendor] = useState('');
  const [formVendorItem, setFormVendorItem] = useState<PickerItem | null>(null);
  const [formWarehouse, setFormWarehouse] = useState('');
  const [formOrderDate, setFormOrderDate] = useState('2026-06-15');
  const [formDueDate, setFormDueDate] = useState('');
  const [formPaymentTerms, setFormPaymentTerms] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<POItem[]>([{ productId: MOCK_PRODUCTS[0].id, qty: 1, unitPrice: MOCK_PRODUCTS[0].unitPrice, discountPct: 0 }]);

  // Reference date for Overdue checking (June 15, 2026)
  const REF_DATE = new Date('2026-06-15');

  // Helper: Calculate sums for a PO
  const getPOTotals = useMemo(() => {
    return (items: POItem[]) => {
      let subtotal = 0;
      let discount = 0;
      let tax = 0;

      items.forEach(item => {
        const prod = MOCK_PRODUCTS.find(p => p.id === item.productId);
        if (!prod) return;

        const base = item.qty * item.unitPrice;
        const disc = base * (item.discountPct / 100);
        const taxable = base - disc;

        let itemTax = 0;
        prod.taxRates.forEach(tr => {
          itemTax += taxable * (tr.rate / 100);
        });

        subtotal += base;
        discount += disc;
        tax += itemTax;
      });

      const total = subtotal - discount + tax;
      return { subtotal, discount, tax, total };
    };
  }, []);

  // Filtered and Sorted POs
  const processedPOs = useMemo(() => {
    let result = pos.map(po => {
      const { subtotal, discount, tax, total } = getPOTotals(po.items);
      const balance = Math.max(0, total - po.balancePaid);
      const isOverdue = po.status !== 'Received' && po.status !== 'Cancelled' && new Date(po.dueDate) < REF_DATE;
      const vendorName = allSuppliers.find(s => s.id === po.vendorId)?.name || 'Unknown Vendor';

      return {
        ...po,
        subtotal,
        discount,
        tax,
        total,
        balance,
        isOverdue,
        vendorName
      };
    });

    // Apply Search
    if (appliedSearch.trim()) {
      const q = appliedSearch.toLowerCase().trim();
      result = result.filter(po => po.po_number.toLowerCase().includes(q));
    }

    // Apply Filters
    if (filterStatus) {
      result = result.filter(po => po.status === filterStatus);
    }
    if (filterVendor) {
      result = result.filter(po => po.vendorId === filterVendor);
    }

    // Apply Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      // Handle nested or string comparison
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [pos, appliedSearch, filterStatus, filterVendor, sortField, sortAsc, getPOTotals]);

  // Pagination calculations
  const paginatedPOs = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return processedPOs.slice(startIndex, startIndex + rowsPerPage);
  }, [processedPOs, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(processedPOs.length / rowsPerPage);

  // Trigger loading details
  const currentDetailsPo = useMemo(() => {
    if (!selectedPoId) return null;
    const po = pos.find(p => p.id === selectedPoId);
    if (!po) return null;

    const vendor = allSuppliers.find(s => s.id === po.vendorId);
    const warehouse = MOCK_WAREHOUSES.find(w => w.id === po.warehouseId);
    const totals = getPOTotals(po.items);
    const balance = Math.max(0, totals.total - po.balancePaid);
    const isOverdue = po.status !== 'Received' && po.status !== 'Cancelled' && new Date(po.dueDate) < REF_DATE;

    return {
      ...po,
      vendor,
      warehouse,
      ...totals,
      balance,
      isOverdue
    };
  }, [selectedPoId, pos, getPOTotals]);

  // Load Form Data for Editing
  const handleEditInit = (id: string) => {
    const po = pos.find(p => p.id === id);
    if (!po) return;

    if (po.status !== 'Draft') {
      showToast('Only Draft Purchase Orders can be edited', 'error');
      return;
    }

    setSelectedPoId(id);
    setFormVendor(po.vendorId);
    const vendor = allSuppliers.find(s => s.id === po.vendorId);
    setFormVendorItem(vendor ? { id: vendor.id, label: vendor.name, sublabel: vendor.email || undefined } : null);
    setFormWarehouse(po.warehouseId);
    setFormOrderDate(po.orderDate);
    setFormDueDate(po.dueDate);
    setFormPaymentTerms(po.paymentTerms);
    setFormNotes(po.notes);
    setFormItems(po.items.map(item => ({ ...item })));
    setViewMode('EDIT');
  };

  // Load Init Create Mode
  const handleCreateInit = () => {
    setSelectedPoId(null);
    const firstVendor = allSuppliers[0];
    setFormVendor(firstVendor?.id || '');
    setFormVendorItem(firstVendor ? { id: firstVendor.id, label: firstVendor.name, sublabel: firstVendor.email || undefined } : null);
    setFormWarehouse(MOCK_WAREHOUSES[0].id);
    setFormOrderDate('2026-06-15');
    setFormDueDate('2026-07-15');
    setFormPaymentTerms('Net 30');
    setFormNotes('');
    setFormItems([{ productId: MOCK_PRODUCTS[0].id, qty: 1, unitPrice: MOCK_PRODUCTS[0].unitPrice, discountPct: 0 }]);
    setViewMode('CREATE');
  };

  // Form Handlers
  const handleAddFormItem = () => {
    setFormItems(prev => [
      ...prev,
      { productId: MOCK_PRODUCTS[0].id, qty: 1, unitPrice: MOCK_PRODUCTS[0].unitPrice, discountPct: 0 }
    ]);
  };

  const handleRemoveFormItem = (index: number) => {
    if (formItems.length === 1) {
      showToast('You must have at least 1 item in the purchase order', 'error');
      return;
    }
    setFormItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleFormItemChange = (index: number, field: keyof POItem, value: any) => {
    setFormItems(prev => prev.map((item, i) => {
      if (i !== index) return item;

      const updated = { ...item, [field]: value };

      // If product changes, auto-populate SKU/description price
      if (field === 'productId') {
        const prod = MOCK_PRODUCTS.find(p => p.id === value);
        if (prod) {
          updated.unitPrice = prod.unitPrice;
        }
      }

      return updated;
    }));
  };

  // Save/Create Form PO
  const nextPoNumber = () => {
    const sortedNumbers = [...pos]
      .map(p => {
        const m = p.po_number.match(/PO-2026-01-(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .sort((a, b) => b - a);
    const nextId = (sortedNumbers[0] || 0) + 1;
    return `PO-2026-01-${String(nextId).padStart(3, '0')}`;
  };

  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formVendor || !formWarehouse || !formOrderDate || !formDueDate) {
      showToast('Please fill out all required fields', 'error');
      return;
    }

    if (new Date(formDueDate) < new Date(formOrderDate)) {
      showToast('Due Date cannot be earlier than Order Date', 'error');
      return;
    }

    const vendor = allSuppliers.find(s => s.id === formVendor);
    const warehouse = MOCK_WAREHOUSES.find(w => w.id === formWarehouse);
    const payload: any = {
      supplier_id: formVendor,
      supplier_name: vendor?.name || null,
      warehouse_id: formWarehouse,
      warehouse_name: warehouse?.name || null,
      order_date: formOrderDate,
      expected_date: formDueDate,
      payment_terms: formPaymentTerms,
      notes: formNotes,
      lines: formItems.map(itemToApiLine),
    };

    try {
      if (viewMode === 'CREATE') {
        payload.po_number = nextPoNumber();
        const created: any = await apiFetch('/v1/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
        await loadPOs();
        showToast(`Purchase Order ${created.po_number} created successfully!`, 'success');
      } else {
        await apiFetch(`/v1/purchase-orders/${selectedPoId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        await loadPOs();
        showToast(`Purchase Order updated successfully!`, 'success');
      }
      setViewMode('LIST');
    } catch {
      showToast('Failed to save purchase order', 'error');
    }
  };

  // Actions implementations
  const handlePostPO = async (id: string) => {
    try {
      await apiFetch(`/v1/purchase-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: toApiStatus('Sent') }) });
      setPOs(prev => prev.map(po => po.id === id ? { ...po, status: 'Sent' } : po));
      showToast(`Purchase Order sent to vendor!`, 'success');
    } catch {
      showToast('Failed to update purchase order status', 'error');
    }
  };

  const handleDuplicatePO = async (id: string) => {
    const original = pos.find(p => p.id === id);
    if (!original) return;

    const vendor = allSuppliers.find(s => s.id === original.vendorId);
    const warehouse = MOCK_WAREHOUSES.find(w => w.id === original.warehouseId);
    const payload = {
      po_number: nextPoNumber(),
      supplier_id: original.vendorId,
      supplier_name: vendor?.name || null,
      warehouse_id: original.warehouseId,
      warehouse_name: warehouse?.name || null,
      order_date: '2026-06-15',
      expected_date: '2026-07-15',
      payment_terms: original.paymentTerms,
      notes: original.notes,
      lines: original.items.map(itemToApiLine),
    };

    try {
      const created: any = await apiFetch('/v1/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
      await loadPOs();
      showToast(`Duplicated into ${created.po_number} as Draft`, 'success');
    } catch {
      showToast('Failed to duplicate purchase order', 'error');
    }
  };

  const handleDeletePO = async (id: string) => {
    const po = pos.find(p => p.id === id);
    if (!po) return;

    if (po.status !== 'Draft') {
      showToast('Cannot delete a purchase order that has already been sent, partially received, received, or cancelled', 'error');
      return;
    }

    if (window.confirm(`Are you sure you want to delete ${po.po_number}?`)) {
      try {
        await apiFetch(`/v1/purchase-orders/${id}`, { method: 'DELETE' });
        setPOs(prev => prev.filter(p => p.id !== id));
        showToast(`Deleted ${po.po_number}`, 'success');
        if (viewMode === 'DETAILS') setViewMode('LIST');
      } catch {
        showToast('Failed to delete purchase order', 'error');
      }
    }
  };

  // Simulated PDF download
  const [downloading, setDownloading] = useState<string | null>(null);
  const handleDownloadPDF = (poNum: string) => {
    setDownloading(poNum);
    showToast(`Generating PDF for ${poNum}...`, 'info');
    setTimeout(() => {
      setDownloading(null);
      showToast(`Downloaded PDF file successfully!`, 'success');
    }, 1200);
  };

  // Toggle sort field helper
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Clear filters
  const handleClearFilters = () => {
    setFilterStatus('');
    setFilterVendor('');
    setSearchQuery('');
    setAppliedSearch('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Toast Notifications */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              padding: '12px 20px',
              borderRadius: 9,
              background: 'var(--white)',
              borderLeft: `5px solid ${t.type === 'success' ? 'var(--green)' : t.type === 'info' ? 'var(--blue)' : 'var(--red)'}`,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 280,
              animation: 'slideIn 0.2s ease'
            }}
          >
            <Icon
              name={t.type === 'success' ? 'checkCircle' : t.type === 'info' ? 'info' : 'xCircle'}
              color={t.type === 'success' ? 'var(--green)' : t.type === 'info' ? 'var(--blue)' : 'var(--red)'}
              size={18}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* CSS Animations (defined inline for simplicity and self-containment) */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* HEADER: compact bar for detail/create/edit only */}
      {viewMode !== 'LIST' && (
        <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>
            {viewMode === 'DETAILS' && currentDetailsPo && `PO #${currentDetailsPo.po_number}`}
            {viewMode === 'CREATE' && 'Create Purchase Order'}
            {viewMode === 'EDIT' && `Edit PO #${pos.find(p => p.id === selectedPoId)?.po_number ?? ''}`}
          </div>
          <button onClick={() => setViewMode('LIST')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="arrowLeft" size={13} /> Back
          </button>
        </div>
      )}


      {/* CORE WORKSPACE */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        
        {/* PAGE HEADER — list mode */}
        {viewMode === 'LIST' && (
          <PageHeader
            crumbs={['Finance', 'Purchase Orders']}
            titlePlain="Purchase"
            titleEm="orders"
            subtitle="Request goods and services, manage approvals and track delivery."
          />
        )}

        {/* VIEW MODE: LIST OF POS */}
        {viewMode === 'LIST' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Filter, Search & Toggles Block */}
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: 14, gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                
                {/* Search field */}
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 260, position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search by purchase order number..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && setAppliedSearch(searchQuery)}
                    style={{
                      width: '100%',
                      padding: '8px 100px 8px 12px',
                      borderRadius: 9,
                      border: '1px solid var(--border)',
                      fontSize: 13,
                      background: 'var(--bg)',
                      color: 'var(--ink)',
                      outline: 'none',
                      transition: 'border-color 0.15s ease'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  />
                  <button
                    onClick={() => setAppliedSearch(searchQuery)}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: 4,
                      bottom: 4,
                      padding: '0 12px',
                      background: '#059669',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Search
                  </button>
                </div>

                {/* View toggles and filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  
                  {/* Grid / List toggle */}
                  <div style={{ display: 'flex', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', overflow: 'hidden', padding: 2 }}>
                    <button
                      onClick={() => setIsCardView(false)}
                      style={{
                        padding: 6,
                        border: 'none',
                        background: !isCardView ? '#059669' : 'transparent',
                        color: !isCardView ? '#fff' : 'var(--ink3)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="List View"
                    >
                      <Icon name="list" size={14} />
                    </button>
                    <button
                      onClick={() => setIsCardView(true)}
                      style={{
                        padding: 6,
                        border: 'none',
                        background: isCardView ? '#059669' : 'transparent',
                        color: isCardView ? '#fff' : 'var(--ink3)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Card View"
                    >
                      <Icon name="grid" size={14} />
                    </button>
                  </div>

                  {/* Rows per page */}
                  <Select value={String(rowsPerPage)} onValueChange={v => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 per page</SelectItem>
                      <SelectItem value="10">10 per page</SelectItem>
                      <SelectItem value="25">25 per page</SelectItem>
                      <SelectItem value="50">50 per page</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Filters toggle */}
                  <button
                    onClick={() => setShowFiltersPanel(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      borderRadius: 9,
                      border: '1px solid var(--border)',
                      background: showFiltersPanel || filterStatus || filterVendor ? 'rgba(5, 150, 105, 0.08)' : 'var(--white)',
                      borderColor: showFiltersPanel || filterStatus || filterVendor ? '#059669' : 'var(--border)',
                      color: showFiltersPanel || filterStatus || filterVendor ? '#059669' : 'var(--ink2)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="filter" size={13} />
                    Filters
                    <Icon name={showFiltersPanel ? 'chevronUp' : 'chevronDown'} size={11} />
                  </button>
                </div>
              </div>

              {/* Collapsible Filters Sub-Panel */}
              {showFiltersPanel && (
                <div style={{ display: 'flex', gap: 12, padding: '12px 0 0 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  
                  {/* Status Filter */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Status</label>
                    <Select
                      value={filterStatus || '__all__'}
                      onValueChange={v => { setFilterStatus(v === '__all__' ? '' : v); setCurrentPage(1); }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Statuses</SelectItem>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Sent">Sent</SelectItem>
                        <SelectItem value="Partial">Partial</SelectItem>
                        <SelectItem value="Received">Received</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vendor Filter */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Vendor</label>
                    <Combobox
                      options={[{ value: '', label: 'All Vendors' }, ...allSuppliers.map(s => ({ value: s.id, label: s.name }))]}
                      value={filterVendor} onChange={v => { setFilterVendor(v); setCurrentPage(1); }} placeholder="All Vendors"
                    />
                  </div>

                  {/* Clear Filters Action */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <button
                      onClick={handleClearFilters}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--ink3)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Empty State vs List vs Grid Display */}
            {processedPOs.length === 0 ? (
              <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="shoppingCart" size={26} strokeWidth={1.5} color="var(--ink3)" />
                  </div>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px 0' }}>No Purchase Orders Found</h3>
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 20px 0', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
                  There are no purchase orders matching your search queries or filter conditions.
                </p>
                <button
                  onClick={handleClearFilters}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 9,
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    color: 'var(--ink2)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : isCardView ? (
              // GRID CARD VIEW (WOW Factor)
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {paginatedPOs.map(po => {
                  const badge = STATUS_THEME[po.status] || STATUS_THEME.Draft;
                  return (
                    <div
                      key={po.id}
                      style={{
                        background: 'var(--white)',
                        borderRadius: 9,
                        border: '1px solid var(--border)',
                        padding: 18,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        cursor: 'default'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(0,0,0,0.05)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <button
                          onClick={() => { setSelectedPoId(po.id); setViewMode('DETAILS'); }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontFamily: 'monospace',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--blue)',
                            cursor: 'pointer'
                          }}
                        >
                          {po.po_number}
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 5, padding: '2px 8px' }}>
                          {po.status}
                        </span>
                      </div>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{po.vendorName}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Terms: {po.paymentTerms || 'N/A'}</div>
                      </div>

                      <div style={{ height: 1, background: 'var(--border)' }} />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                        <div>
                          <span style={{ color: 'var(--ink3)' }}>Order Date</span>
                          <div style={{ fontWeight: 600, color: 'var(--ink2)', marginTop: 2 }}>{po.orderDate}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--ink3)' }}>Due Date</span>
                          <div style={{ fontWeight: 600, color: po.isOverdue ? 'var(--red)' : 'var(--ink2)', marginTop: 2 }}>
                            {po.dueDate} {po.isOverdue && <span style={{ color: 'var(--red)', fontSize: 9 }}>(Overdue)</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ height: 1, background: 'var(--border)' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Total Amount</span>
                          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 1 }}>{fmt(po.total, 'USD')}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Balance Due</span>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginTop: 1 }}>{fmt(po.balance, 'USD')}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                        <button
                          onClick={() => handleDownloadPDF(po.po_number)}
                          disabled={downloading === po.po_number}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--white)',
                            color: '#e28743',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Download PDF"
                        >
                          <Icon name="download" size={13} />
                        </button>
                        <button
                          onClick={() => { setSelectedPoId(po.id); setViewMode('DETAILS'); }}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--white)',
                            color: 'var(--green)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="View Details"
                        >
                          <Icon name="eye" size={13} />
                        </button>
                        {po.status === 'Draft' && (
                          <>
                            <button
                              onClick={() => handleDuplicatePO(po.id)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--white)',
                                color: '#7c3aed',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Duplicate"
                            >
                              <Icon name="copy" size={13} />
                            </button>
                            <button
                              onClick={() => handleEditInit(po.id)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--white)',
                                color: 'var(--blue)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Edit"
                            >
                              <Icon name="edit" size={13} />
                            </button>
                            <button
                              onClick={() => handleDeletePO(po.id)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--white)',
                                color: 'var(--red)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Delete"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // MAIN LIST VIEW (TABLE)
              <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                  <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {[
                          { key: 'po_number', label: 'Invoice Number' },
                          { key: 'vendorId', label: 'Vendor' },
                          { key: 'orderDate', label: 'Invoice Date' },
                          { key: 'dueDate', label: 'Due Date' },
                          { key: 'subtotal', label: 'Subtotal' },
                          { key: 'tax', label: 'Tax' },
                          { key: 'total', label: 'Total Amount' },
                          { key: 'balance', label: 'Balance' },
                          { key: 'status', label: 'Status' }
                        ].map(col => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            style={{
                              padding: '12px 14px',
                              textAlign: 'left',
                              fontWeight: 600,
                              color: 'var(--ink2)',
                              fontSize: 11,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              userSelect: 'none',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {col.label}
                              {sortField === col.key ? (
                                <Icon name={sortAsc ? 'chevronUp' : 'chevronDown'} size={11} />
                              ) : (
                                <div style={{ opacity: 0.15 }}><Icon name="chevronDown" size={11} /></div>
                              )}
                            </div>
                          </th>
                        ))}
                        <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPOs.map(po => {
                        const badge = STATUS_THEME[po.status] || STATUS_THEME.Draft;
                        return (
                          <tr
                            key={po.id}
                            style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.05s ease' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {/* Invoice number link */}
                            <td style={{ padding: '12px 14px' }}>
                              <button
                                onClick={() => { setSelectedPoId(po.id); setViewMode('DETAILS'); }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  fontFamily: 'monospace',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: 'var(--blue)',
                                  cursor: 'pointer',
                                  outline: 'none'
                                }}
                              >
                                {po.po_number}
                              </button>
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                              {po.vendorName}
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                              {po.orderDate}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <div>
                                <span style={{ color: po.isOverdue ? 'var(--red)' : 'var(--ink2)', fontWeight: po.isOverdue ? 600 : 400 }}>{po.dueDate}</span>
                                {po.isOverdue && (
                                  <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginTop: 1 }}>
                                    Overdue
                                  </div>
                                )}
                              </div>
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--ink2)', fontFamily: 'monospace' }}>
                              {fmt(po.subtotal, 'USD')}
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--ink2)', fontFamily: 'monospace' }}>
                              {fmt(po.tax, 'USD')}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace' }}>
                              {fmt(po.total, 'USD')}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--blue)', fontFamily: 'monospace' }}>
                              {fmt(po.balance, 'USD')}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  background: badge.bg,
                                  color: badge.color,
                                  borderRadius: 5,
                                  padding: '3px 8px',
                                  display: 'inline-block'
                                }}
                              >
                                {po.status}
                              </span>
                            </td>

                            {/* Actions Column */}
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 5, justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button
                                  onClick={() => handleDownloadPDF(po.po_number)}
                                  disabled={downloading === po.po_number}
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--white)',
                                    color: '#e28743',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  title="Download PDF"
                                >
                                  <Icon name="download" size={12.5} />
                                </button>
                                <button
                                  onClick={() => { setSelectedPoId(po.id); setViewMode('DETAILS'); }}
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--white)',
                                    color: 'var(--green)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  title="View Details"
                                >
                                  <Icon name="eye" size={12.5} />
                                </button>
                                {po.status === 'Draft' ? (
                                  <>
                                    <button
                                      onClick={() => handleDuplicatePO(po.id)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 6,
                                        border: '1px solid var(--border)',
                                        background: 'var(--white)',
                                        color: '#7c3aed',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                      title="Duplicate"
                                    >
                                      <Icon name="copy" size={12.5} />
                                    </button>
                                    <button
                                      onClick={() => handleEditInit(po.id)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 6,
                                        border: '1px solid var(--border)',
                                        background: 'var(--white)',
                                        color: 'var(--blue)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                      title="Edit"
                                    >
                                      <Icon name="edit" size={12.5} />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePO(po.id)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 6,
                                        border: '1px solid var(--border)',
                                        background: 'var(--white)',
                                        color: 'var(--red)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                      title="Delete"
                                    >
                                      <Icon name="trash" size={12.5} />
                                    </button>
                                  </>
                                ) : (
                                  <div style={{ width: 94 }} /> // placeholder to keep actions aligned
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, processedPOs.length)} of {processedPOs.length} results
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    color: currentPage === 1 ? 'var(--ink3)' : 'var(--ink)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: 'none',
                      background: currentPage === pageNum ? '#059669' : 'transparent',
                      color: currentPage === pageNum ? '#fff' : 'var(--ink2)',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {pageNum}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    color: currentPage === totalPages || totalPages === 0 ? 'var(--ink3)' : 'var(--ink)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>
              </div>
            </div>

          </div>
        )}

        {/* VIEW MODE: PURCHASE ORDER DETAILS */}
        {viewMode === 'DETAILS' && currentDetailsPo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Details Shell Card */}
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* Header summary inside details card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
                <div>
                  {/* Branding Logo */}
                  <div style={{ marginBottom: 16 }}>
                    {branding.logoLight ? (
                      <img src={branding.logoLight} alt={branding.platformName} style={{ height: 32, objectFit: 'contain' }} />
                    ) : (
                      <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)' }}>{branding.platformName}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--ink3)' }}>
                    #{currentDetailsPo.po_number}
                  </span>
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      background: (STATUS_THEME[currentDetailsPo.status] || STATUS_THEME.Draft).bg,
                      color: (STATUS_THEME[currentDetailsPo.status] || STATUS_THEME.Draft).color,
                      borderRadius: 5,
                      padding: '2px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {currentDetailsPo.status}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>
                    {formatUSD(currentDetailsPo.total)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>
                    Total Amount
                  </div>
                </div>
              </div>

              {/* Grid with 3 columns: VENDOR, SHIPPING, DETAILS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, fontSize: 13 }}>
                
                {/* Vendor billing details */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Vendor
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{currentDetailsPo.vendor?.name}</div>
                  <div style={{ color: 'var(--ink2)', margin: '4px 0 12px 0' }}>{currentDetailsPo.vendor?.email}</div>
                  
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Billing Address
                  </div>
                  <div style={{ color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {currentDetailsPo.vendor?.billingAddress}
                  </div>
                </div>

                {/* Shipping address details */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Shipping Address
                  </div>
                  <div style={{ color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {currentDetailsPo.vendor?.shippingAddress}
                  </div>
                </div>

                {/* Meta details */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Details
                  </div>
                  <div className="rtbl-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 0', color: 'var(--ink3)' }}>Invoice Date</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{currentDetailsPo.orderDate}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: 'var(--ink3)' }}>Due Date</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: currentDetailsPo.isOverdue ? 'var(--red)' : 'var(--ink)' }}>
                          {currentDetailsPo.dueDate}
                          {currentDetailsPo.isOverdue && (
                            <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, display: 'inline', marginLeft: 4 }}>(Overdue)</div>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: 'var(--ink3)' }}>Warehouse</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{currentDetailsPo.warehouse?.name}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: 'var(--ink3)' }}>Terms</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{currentDetailsPo.paymentTerms || 'COD'}</td>
                      </tr>
                    </tbody>
                  </table></div>
                </div>

              </div>

              {/* Blue action bar inside card */}
              <div
                style={{
                  background: 'var(--bg)',
                  borderRadius: 9,
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid var(--border)',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleDownloadPDF(currentDetailsPo.po_number)}
                    disabled={downloading === currentDetailsPo.po_number}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      borderRadius: 9,
                      border: '1px solid var(--border)',
                      background: 'var(--white)',
                      color: 'var(--ink)',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="download" size={13} />
                    Download PDF
                  </button>

                  {currentDetailsPo.status === 'Draft' && (
                    <button
                      onClick={() => handlePostPO(currentDetailsPo.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        borderRadius: 9,
                        border: 'none',
                        background: '#059669',
                        color: '#fff',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Icon name="checkCircle" size={13} />
                      Send to Vendor
                    </button>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue)' }}>
                    {formatUSD(currentDetailsPo.balance)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', marginTop: 1 }}>
                    Balance Due
                  </div>
                </div>
              </div>

              {/* Notes */}
              {currentDetailsPo.notes && (
                <div style={{ fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Notes: </span>
                  <span style={{ color: 'var(--ink2)' }}>{currentDetailsPo.notes}</span>
                </div>
              )}
            </div>

            {/* Items Table Card */}
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Invoice Items</h3>
              </div>
              <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>Product</th>
                      <th style={{ padding: '12px 20px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '12px 20px', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ padding: '12px 20px', textAlign: 'right' }}>Discount</th>
                      <th style={{ padding: '12px 20px', textAlign: 'right' }}>Tax</th>
                      <th style={{ padding: '12px 20px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentDetailsPo.items.map((item, idx) => {
                      const prod = MOCK_PRODUCTS.find(p => p.id === item.productId);
                      if (!prod) return null;

                      const base = item.qty * item.unitPrice;
                      const discAmount = base * (item.discountPct / 100);
                      const taxable = base - discAmount;

                      let totalTax = 0;
                      const taxDetails = prod.taxRates.map(tr => {
                        const amt = taxable * (tr.rate / 100);
                        totalTax += amt;
                        return { name: tr.name, rate: tr.rate, amt };
                      });

                      const rowTotal = taxable + totalTax;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{prod.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, fontFamily: 'monospace' }}>SKU: {prod.sku}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{prod.description}</div>
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'center', color: 'var(--ink)' }}>{item.qty}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--ink)' }}>{formatUSD(item.unitPrice)}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--red)' }}>
                            {item.discountPct > 0 ? `-${formatUSD(discAmount)}` : '—'}
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink2)' }}>
                              {taxDetails.map((td, i) => (
                                <div key={i}>
                                  {td.name} ({td.rate}%)
                                </div>
                              ))}
                              {totalTax > 0 && (
                                <div style={{ fontWeight: 600, color: 'var(--ink3)', marginTop: 2, fontFamily: 'monospace' }}>
                                  {formatUSD(totalTax)}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ink)' }}>{formatUSD(rowTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* VIEW MODE: CREATE / EDIT PURCHASE ORDER FORM */}
        {(viewMode === 'CREATE' || viewMode === 'EDIT') && (
          <form onSubmit={handleSavePO} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Purchase Invoice Details Card */}
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 4 }}>
                <Icon name="calendar" size={16} color="var(--blue)" />
                Purchase Invoice Details
              </div>

              {/* Grid 4 columns details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                
                {/* Order Date */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Invoice Date *</label>
                  <DatePicker date={parseDateOnly(formOrderDate)} onChange={d => setFormOrderDate(toDateOnlyString(d))} />
                </div>

                {/* Due Date */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Due Date *</label>
                  <DatePicker date={parseDateOnly(formDueDate)} onChange={d => setFormDueDate(toDateOnlyString(d))} />
                </div>

                {/* Vendor Picker */}
                <div>
                  <EntityPicker
                    label="Vendor *" value={formVendorItem} onChange={handleVendorChange}
                    search={searchVendorsLocal} onCreate={createVendorInline}
                    createLabel={(q) => `Create new vendor "${q}"`}
                    placeholder="Search vendors…"
                  />
                </div>

                {/* Warehouse Dropdown */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Warehouse *</label>
                  <Select value={formWarehouse} onValueChange={setFormWarehouse}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOCK_WAREHOUSES.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

              {/* Side-by-side Terms & Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Payment Terms</label>
                  <input
                    type="text"
                    placeholder="e.g., Net 30, COD"
                    value={formPaymentTerms}
                    onChange={e => setFormPaymentTerms(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Notes</label>
                  <textarea
                    placeholder="Additional notes..."
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    style={{ width: '100%', height: 42, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </div>

            {/* Purchase Invoice Items Card */}
            <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  <Icon name="package" size={16} color="var(--blue)" />
                  Purchase Invoice Items
                </div>
                <button
                  type="button"
                  onClick={handleAddFormItem}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#059669',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Icon name="plus" size={12} strokeWidth={2.5} /> Add Item
                </button>
              </div>

              {/* Items Table Form */}
              <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: 240 }}>Product *</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', width: 90 }}>Qty *</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', width: 140 }}>Unit Price *</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', width: 110 }}>Discount %</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', width: 140 }}>Tax</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', width: 130 }}>Total</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', width: 60 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.map((item, idx) => {
                      const prod = MOCK_PRODUCTS.find(p => p.id === item.productId);
                      const base = item.qty * item.unitPrice;
                      const disc = base * (item.discountPct / 100);
                      const taxable = base - disc;

                      let taxSum = 0;
                      let taxDesc = 'No tax';
                      if (prod) {
                        prod.taxRates.forEach(tr => {
                          taxSum += taxable * (tr.rate / 100);
                        });
                        if (prod.taxRates.length > 0) {
                          taxDesc = prod.taxRates.map(tr => `${tr.name} (${tr.rate}%)`).join(', ');
                        }
                      }

                      const rowTotal = taxable + taxSum;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          
                          {/* Product select */}
                          <td style={{ padding: '12px 12px' }}>
                            <Combobox
                              options={MOCK_PRODUCTS.map(p => ({ value: p.id, label: `${p.name} [${p.sku}]` }))}
                              value={item.productId} onChange={v => handleFormItemChange(idx, 'productId', v)}
                            />
                          </td>

                          {/* Quantity */}
                          <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min={1}
                              required
                              value={item.qty}
                              onChange={e => handleFormItemChange(idx, 'qty', parseInt(e.target.value, 10) || 1)}
                              style={{ width: '100%', padding: '7px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, outline: 'none', textAlign: 'center' }}
                            />
                          </td>

                          {/* Unit Price */}
                          <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px' }}>
                              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>$</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                required
                                value={item.unitPrice}
                                onChange={e => handleFormItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                style={{ width: '100%', padding: '7px 0 7px 4px', border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13, outline: 'none', textAlign: 'right' }}
                              />
                            </div>
                          </td>

                          {/* Discount % */}
                          <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px' }}>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={item.discountPct}
                                onChange={e => handleFormItemChange(idx, 'discountPct', parseFloat(e.target.value) || 0)}
                                style={{ width: '100%', padding: '7px 4px 7px 0', border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13, outline: 'none', textAlign: 'right' }}
                              />
                              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>%</span>
                            </div>
                          </td>

                          {/* Tax Text */}
                          <td style={{ padding: '12px 12px', textAlign: 'right', fontSize: 12, color: 'var(--ink2)' }}>
                            <div style={{ fontWeight: 600 }}>{taxDesc}</div>
                            {taxSum > 0 && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, fontFamily: 'monospace' }}>({formatUSD(taxSum)})</div>}
                          </td>

                          {/* Row Total */}
                          <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: 'var(--ink)' }}>
                            {formatUSD(rowTotal)}
                          </td>

                          {/* Delete Action */}
                          <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveFormItem(idx)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--red)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 6,
                                borderRadius: 6
                              }}
                              title="Remove item"
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary Bottom Layout */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24, marginTop: 12 }}>
                
                {/* Total count details */}
                <div style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>
                  {formItems.length} {formItems.length === 1 ? 'item' : 'items'} added
                </div>

                {/* Calculations details Summary Box */}
                {(() => {
                  const totals = getPOTotals(formItems);
                  return (
                    <div style={{ width: 280, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, fontSize: 13 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>Invoice Summary</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: '4px 0', color: 'var(--ink2)' }}>Subtotal</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace' }}>{formatUSD(totals.subtotal)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 0', color: 'var(--ink2)' }}>Discount</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--red)', fontFamily: 'monospace' }}>-{formatUSD(totals.discount)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 0', color: 'var(--ink2)' }}>Tax</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace' }}>{formatUSD(totals.tax)}</td>
                          </tr>
                          <tr style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 0 0 0', fontWeight: 700, color: 'var(--ink)' }}>Total</td>
                            <td style={{ padding: '10px 0 0 0', textAlign: 'right', fontWeight: 800, color: 'var(--ink)', fontSize: 16, fontFamily: 'monospace' }}>{formatUSD(totals.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

              </div>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setViewMode('LIST')}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 9,
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    color: 'var(--ink2)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 20px',
                    borderRadius: 9,
                    border: 'none',
                    background: '#059669',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {viewMode === 'CREATE' ? 'Create' : 'Save Changes'}
                </button>
              </div>

            </div>
          </form>
        )}

      </div>
    </div>
  );
};
