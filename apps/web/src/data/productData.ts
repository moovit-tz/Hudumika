import { useSyncExternalStore } from 'react';
import { apiFetch } from '../lib/api.js';

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
  /**
   * The tax *treatment*, from the workspace's own tax codes. `taxRate` stays as
   * the rate it implies — the two are written together so they cannot drift.
   * null means the treatment was never recorded (everything predating tax
   * codes), which is not the same as zero-rated.
   */
  taxCodeId: string | null;
  status: ProductStatus;
  createdAt: string;
}

export const PRODUCT_UNITS = ['each', 'CBM', 'kg', 'container', 'shipment', 'hour', 'day', 'set', 'lot'];
export const PRODUCT_CATEGORIES = ['Clearance Services', 'Documentation', 'Port & Handling', 'Storage', 'Consulting', 'Freight', 'Insurance', 'Other'];

export const PRODUCT_TYPE_COLOR: Record<ProductType, { bg: string; color: string }> = {
  product: { bg: '#dbeafe', color: '#1d4ed8' },
  service: { bg: '#ede9fe', color: '#6d28d9' },
};

function mapApiProduct(d: any): Product {
  return {
    id: d.id, code: d.code || '', name: d.name || '', type: (d.type || 'service') as ProductType,
    description: d.description || '', category: d.category || '', unit: d.unit || 'each',
    salePrice: Number(d.sale_price) || 0, purchasePrice: Number(d.purchase_price) || 0,
    currency: d.currency || 'TZS', taxRate: Number(d.tax_rate) || 0,
    taxCodeId: d.tax_code_id ?? null,
    status: (d.status || 'active') as ProductStatus,
    createdAt: d.created_at ? String(d.created_at).slice(0, 10) : '',
  };
}

function toApiPayload(p: Product) {
  return {
    id: p.id, code: p.code, name: p.name, type: p.type, description: p.description,
    category: p.category, unit: p.unit, sale_price: p.salePrice, purchase_price: p.purchasePrice,
    currency: p.currency, tax_rate: p.taxRate, tax_code_id: p.taxCodeId ?? null,
    status: p.status,
  };
}

let _products: Product[] = [];
const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(l => l()); }
function subscribe(cb: () => void) { _listeners.add(cb); return () => _listeners.delete(cb); }

/**
 * Loaded on first use, not at import.
 *
 * This module used to call loadFromApi() at the top level, so the request went
 * out the moment anything imported it — which happens on pages that have
 * nothing to do with products, and before the auth token is available. The
 * result was a 401 on /v1/products on essentially every page load, swallowed
 * by the .catch() and therefore invisible except in the network log.
 *
 * `_loaded` makes it fire once, from the first component that actually reads
 * the store. `_inFlight` keeps several mounting at once from each firing their
 * own request.
 */
let _loaded = false;
let _inFlight: Promise<void> | null = null;

function loadFromApi(): Promise<void> {
  if (_inFlight) return _inFlight;
  _inFlight = apiFetch('/v1/products')
    .then((data: any) => { _products = Array.isArray(data) ? data.map(mapApiProduct) : []; notify(); })
    .catch(() => { _products = []; notify(); })
    .finally(() => { _inFlight = null; });
  return _inFlight;
}

function ensureLoaded() {
  if (_loaded) return;
  _loaded = true;
  loadFromApi();
}

/** Re-fetch on demand — e.g. after an import, or when a page wants fresh data. */
export function refreshProducts() { _loaded = true; return loadFromApi(); }

export function useProducts() {
  // Subscribing is the signal that something is actually rendering products.
  return useSyncExternalStore(
    (cb) => { ensureLoaded(); return subscribe(cb); },
    () => _products,
  );
}
export function getProducts()  { ensureLoaded(); return _products; }

export function addProduct(p: Product) {
  _products = [p, ..._products];
  notify();
  apiFetch('/v1/products', { method: 'POST', body: JSON.stringify(toApiPayload(p)) })
    .then((created: any) => { _products = _products.map(x => x.id === p.id ? mapApiProduct(created) : x); notify(); })
    .catch(() => { _products = _products.filter(x => x.id !== p.id); notify(); });
}

export function updateProduct(p: Product) {
  const prev = _products;
  _products = _products.map(x => x.id === p.id ? p : x);
  notify();
  apiFetch(`/v1/products/${p.id}`, { method: 'PATCH', body: JSON.stringify(toApiPayload(p)) })
    .catch(() => { _products = prev; notify(); });
}

export function deleteProduct(id: string) {
  const prev = _products;
  _products = _products.filter(x => x.id !== id);
  notify();
  apiFetch(`/v1/products/${id}`, { method: 'DELETE' })
    .catch(() => { _products = prev; notify(); });
}
