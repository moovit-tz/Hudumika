import { useSyncExternalStore } from 'react';

export type VendorCategory = 'port_services' | 'customs' | 'freight' | 'warehouse' | 'transport' | 'consulting' | 'utility' | 'other';
export type VendorStatus   = 'active' | 'inactive' | 'blocked';
export type PaymentTerms   = 'cod' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'prepaid';

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  taxId: string;
  category: VendorCategory;
  currency: string;
  paymentTerms: PaymentTerms;
  status: VendorStatus;
  balance: number;
  totalPaid: number;
  bankName: string;
  bankAccount: string;
  createdAt: string;
  notes: string;
}

export const VENDOR_CATEGORY_LABEL: Record<VendorCategory, string> = {
  port_services: 'Port Services',
  customs:       'Customs Agent',
  freight:       'Freight Forwarder',
  warehouse:     'Warehouse',
  transport:     'Transport',
  consulting:    'Consulting',
  utility:       'Utility',
  other:         'Other',
};

export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
  cod:     'Cash on Delivery',
  net_15:  'Net 15 Days',
  net_30:  'Net 30 Days',
  net_60:  'Net 60 Days',
  net_90:  'Net 90 Days',
  prepaid: 'Prepaid',
};

export const VENDOR_STATUS_COLOR: Record<VendorStatus, { bg: string; color: string }> = {
  active:   { bg: '#dcfce7', color: '#166534' },
  inactive: { bg: '#f1f5f9', color: '#64748b' },
  blocked:  { bg: '#fee2e2', color: '#dc2626' },
};

const seed: Vendor[] = [
  {
    id: 'VND-001', name: 'Tanzania Ports Authority', contactPerson: 'John Mwangi', email: 'billing@tpa.go.tz', phone: '+255 22 211 0000',
    address: 'Malindi, Bandari Road', city: 'Dar es Salaam', country: 'Tanzania', taxId: 'TPA-0001-TZ',
    category: 'port_services', currency: 'TZS', paymentTerms: 'net_30', status: 'active',
    balance: 4_200_000, totalPaid: 38_500_000, bankName: 'CRDB Bank', bankAccount: '0150112233445',
    createdAt: '2025-01-10', notes: 'Primary port authority. Standard payment monthly.',
  },
  {
    id: 'VND-002', name: 'Customs Clearance Solutions Ltd', contactPerson: 'Amina Hassan', email: 'ops@ccs.co.tz', phone: '+255 754 321 100',
    address: '14 Samora Avenue', city: 'Dar es Salaam', country: 'Tanzania', taxId: 'TIN-300456789',
    category: 'customs', currency: 'TZS', paymentTerms: 'cod', status: 'active',
    balance: 1_800_000, totalPaid: 22_000_000, bankName: 'NMB Bank', bankAccount: '40780001234567',
    createdAt: '2025-02-14', notes: 'Preferred customs sub-agent for complex declarations.',
  },
  {
    id: 'VND-003', name: 'East Africa Freight Services', contactPerson: 'David Kimani', email: 'finance@eafs.co.ke', phone: '+254 700 123 456',
    address: 'Industrial Area, Ring Road', city: 'Nairobi', country: 'Kenya', taxId: 'KRA-P0512345Z',
    category: 'freight', currency: 'USD', paymentTerms: 'net_30', status: 'active',
    balance: 3_500_000, totalPaid: 67_200_000, bankName: 'Equity Bank Kenya', bankAccount: 'KE12EQBL0000000987654',
    createdAt: '2024-11-05', notes: 'Cross-border freight partner. USD invoices, TZS equivalent on receipt.',
  },
  {
    id: 'VND-004', name: 'Dar Bonded Warehouse Ltd', contactPerson: 'Fatuma Omar', email: 'storage@darwarehouse.co.tz', phone: '+255 22 286 4400',
    address: 'Kurasini Industrial Zone', city: 'Dar es Salaam', country: 'Tanzania', taxId: 'TIN-300123456',
    category: 'warehouse', currency: 'TZS', paymentTerms: 'net_15', status: 'active',
    balance: 650_000, totalPaid: 9_800_000, bankName: 'Standard Chartered', bankAccount: '00000172548',
    createdAt: '2025-03-01', notes: 'Bonded warehouse for goods pending clearance.',
  },
  {
    id: 'VND-005', name: 'Swift Haulage Tanzania', contactPerson: 'Peter Ng\'anga', email: 'dispatch@swifthaulage.co.tz', phone: '+255 784 000 333',
    address: 'Kigamboni Road, Plot 7', city: 'Dar es Salaam', country: 'Tanzania', taxId: 'TIN-300789012',
    category: 'transport', currency: 'TZS', paymentTerms: 'cod', status: 'active',
    balance: 890_000, totalPaid: 14_500_000, bankName: 'CRDB Bank', bankAccount: '0150998877665',
    createdAt: '2025-01-22', notes: 'Last-mile delivery within DSM. Fleet of 12 trucks.',
  },
  {
    id: 'VND-006', name: 'Trade Compliance Advisory', contactPerson: 'Dr. Sarah Mapunda', email: 'sarah@tca.co.tz', phone: '+255 755 888 777',
    address: 'Upanga, Garden Avenue', city: 'Dar es Salaam', country: 'Tanzania', taxId: 'TIN-300334455',
    category: 'consulting', currency: 'TZS', paymentTerms: 'net_60', status: 'active',
    balance: 2_100_000, totalPaid: 5_500_000, bankName: 'Exim Bank', bankAccount: '001004567890',
    createdAt: '2025-04-10', notes: 'Trade law and HS code classification consulting.',
  },
  {
    id: 'VND-007', name: 'Tanzania Electric Supply (TANESCO)', contactPerson: 'Billing Dept', email: 'commercial@tanesco.co.tz', phone: '+255 22 211 5700',
    address: 'Ubungo Area, Morogoro Road', city: 'Dar es Salaam', country: 'Tanzania', taxId: 'TIN-100001010',
    category: 'utility', currency: 'TZS', paymentTerms: 'net_15', status: 'active',
    balance: 320_000, totalPaid: 3_200_000, bankName: 'NBC', bankAccount: '024003218890',
    createdAt: '2024-09-01', notes: 'Office electricity. Account #DSM-0044-B.',
  },
  {
    id: 'VND-008', name: 'Mombasa Container Handlers', contactPerson: 'Ali Said', email: 'ali.said@mch.co.ke', phone: '+254 722 556 677',
    address: 'Port Reitz Road, Gate 4', city: 'Mombasa', country: 'Kenya', taxId: 'KRA-P0678901X',
    category: 'port_services', currency: 'USD', paymentTerms: 'cod', status: 'inactive',
    balance: 0, totalPaid: 12_100_000, bankName: 'KCB Bank', bankAccount: 'KE98KCB0000112233445',
    createdAt: '2024-06-15', notes: 'Used for Mombasa transit shipments. Currently suspended — new contract pending.',
  },
];

const STORAGE_KEY = 'clearos_vendors';
function load(): Vendor[] {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : seed; } catch { return seed; }
}
let _vendors: Vendor[] = load();
const _listeners = new Set<() => void>();
function notify() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_vendors));
  _listeners.forEach(l => l());
}
function subscribe(cb: () => void) { _listeners.add(cb); return () => _listeners.delete(cb); }

export function useVendors()                 { return useSyncExternalStore(subscribe, () => _vendors); }
export function getVendors()                 { return _vendors; }
export function addVendor(v: Vendor)         { _vendors = [v, ..._vendors]; notify(); }
export function updateVendor(v: Vendor)      { _vendors = _vendors.map(x => x.id === v.id ? v : x); notify(); }
export function deleteVendor(id: string)     { _vendors = _vendors.filter(x => x.id !== id); notify(); }
