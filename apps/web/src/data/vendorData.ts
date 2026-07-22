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
  active:   { bg: '#ecfdf5', color: '#065f46' },
  inactive: { bg: '#f1f5f9', color: '#64748b' },
  blocked:  { bg: '#fee2e2', color: '#dc2626' },
};

// Vendor/supplier records are now real rows served by /v1/suppliers
// (apps/api/src/routes/suppliers.routes.ts) — see FinanceVendors.tsx.
