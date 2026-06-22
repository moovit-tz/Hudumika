import { useSyncExternalStore } from 'react';

export type ProductType   = 'product' | 'service';
export type ProductStatus = 'active' | 'inactive';

export interface Product {
  id: string;
  code: string;
  name: string;
  type: ProductType;
  description: string;
  category: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  currency: string;
  taxRate: number;
  status: ProductStatus;
  createdAt: string;
}

export const PRODUCT_UNITS = ['each', 'CBM', 'kg', 'container', 'shipment', 'hour', 'day', 'set', 'lot'];
export const PRODUCT_CATEGORIES = ['Clearance Services', 'Documentation', 'Port & Handling', 'Storage', 'Consulting', 'Freight', 'Insurance', 'Other'];
export const TAX_RATES = [0, 18];

export const PRODUCT_TYPE_COLOR: Record<ProductType, { bg: string; color: string }> = {
  product: { bg: '#dbeafe', color: '#1d4ed8' },
  service: { bg: '#ede9fe', color: '#6d28d9' },
};

const seed: Product[] = [
  {
    id: 'PRD-001', code: 'SVC-CLR-STD', name: 'Standard Customs Clearance', type: 'service',
    description: 'End-to-end customs clearance for standard import/export shipments.',
    category: 'Clearance Services', unit: 'shipment', salePrice: 850_000, purchasePrice: 400_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-01-01',
  },
  {
    id: 'PRD-002', code: 'SVC-CLR-EXP', name: 'Express Customs Clearance', type: 'service',
    description: 'Priority processing for time-sensitive shipments. 24-hr turnaround.',
    category: 'Clearance Services', unit: 'shipment', salePrice: 1_500_000, purchasePrice: 750_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-01-01',
  },
  {
    id: 'PRD-003', code: 'SVC-DOC-PKG', name: 'Documentation Package', type: 'service',
    description: 'Preparation of all import/export documentation (BOL, C23, Form M, etc.).',
    category: 'Documentation', unit: 'set', salePrice: 250_000, purchasePrice: 80_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-01-01',
  },
  {
    id: 'PRD-004', code: 'SVC-PORT-HDL', name: 'Port Handling & Supervision', type: 'service',
    description: 'On-site port supervision, container examination attendance, and cargo tracking.',
    category: 'Port & Handling', unit: 'container', salePrice: 400_000, purchasePrice: 180_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-01-05',
  },
  {
    id: 'PRD-005', code: 'SVC-STR-DAY', name: 'Bonded Warehouse Storage', type: 'service',
    description: 'Secure bonded storage per day per CBM. Climate-controlled facility.',
    category: 'Storage', unit: 'day', salePrice: 15_000, purchasePrice: 7_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-01-05',
  },
  {
    id: 'PRD-006', code: 'SVC-FRT-AIR', name: 'Air Freight Coordination', type: 'service',
    description: 'Coordination and arrangement of air freight shipments via JNIA.',
    category: 'Freight', unit: 'shipment', salePrice: 600_000, purchasePrice: 300_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-02-01',
  },
  {
    id: 'PRD-007', code: 'SVC-CST-ADV', name: 'Customs Classification Advisory', type: 'service',
    description: 'HS code classification and tariff advice for specific goods categories.',
    category: 'Consulting', unit: 'hour', salePrice: 120_000, purchasePrice: 60_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-03-10',
  },
  {
    id: 'PRD-008', code: 'PRD-SEAL-CTR', name: 'Container Seal Kit', type: 'product',
    description: 'Official tamper-evident seal kit for containers (set of 5).',
    category: 'Port & Handling', unit: 'set', salePrice: 45_000, purchasePrice: 22_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-03-15',
  },
  {
    id: 'PRD-009', code: 'SVC-INS-CARGO', name: 'Cargo Insurance Facilitation', type: 'service',
    description: 'Arrangement of marine/cargo insurance cover for shipments in transit.',
    category: 'Insurance', unit: 'shipment', salePrice: 0, purchasePrice: 0,
    currency: 'TZS', taxRate: 0, status: 'active', createdAt: '2025-04-01',
  },
  {
    id: 'PRD-010', code: 'SVC-TRK-LOCAL', name: 'Local Trucking & Delivery', type: 'service',
    description: 'Last-mile delivery within Dar es Salaam metropolitan area.',
    category: 'Freight', unit: 'shipment', salePrice: 180_000, purchasePrice: 95_000,
    currency: 'TZS', taxRate: 18, status: 'active', createdAt: '2025-04-05',
  },
];

const STORAGE_KEY = 'clearos_products';
function load(): Product[] {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : seed; } catch { return seed; }
}
let _products: Product[] = load();
const _listeners = new Set<() => void>();
function notify() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_products));
  _listeners.forEach(l => l());
}
function subscribe(cb: () => void) { _listeners.add(cb); return () => _listeners.delete(cb); }

export function useProducts()                { return useSyncExternalStore(subscribe, () => _products); }
export function getProducts()                { return _products; }
export function addProduct(p: Product)       { _products = [p, ..._products]; notify(); }
export function updateProduct(p: Product)    { _products = _products.map(x => x.id === p.id ? p : x); notify(); }
export function deleteProduct(id: string)    { _products = _products.filter(x => x.id !== id); notify(); }
