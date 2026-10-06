import type { IconName } from '../../components/Icon.js';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  phone_wa?: string;
  tax_id?: string;
  contact_name?: string;
  contact_person?: string;
  contact_role?: string;
  account_manager_name?: string;
  address?: string;
  created_at: string;
  shipment_count?: number;
  city?: string;
  country?: string;
  website?: string;
  vat_number?: string;
  vrn_number?: string;
  import_license?: string;
  preferred_port?: string;
  freight_terms?: string;
  incoterms?: string;
  commodity_type?: string;
  sector?: string;
  classification?: string;
  credit_days?: string;
  payment_terms?: string;
  client_type?: string;
  status?: string;
  account_status?: 'Active' | 'Inactive' | 'Suspended';
  notes?: string;
  currency?: string;
  avatar_url?: string;
  tancis_number?: string;
  organization_id?: string;
  organization_name?: string;
  daily_report_enabled?: boolean | null;
  whatsapp_alerts_enabled?: boolean | null;
}

export const PAGE_SIZE = 10;

export function fmtDate(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ', ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

export function fmtDateShort(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function maskTin(tin?: string) {
  if (!tin) return null;
  const last4 = tin.replace(/\D/g, '').slice(-4);
  return `**** ${last4 || '????'}`;
}

export const FILE_TYPE_STYLE: Record<string, { icon: IconName; color: string; bg: string }> = {
  pdf:  { icon: 'file',     color: 'var(--red)',    bg: 'var(--red-l)'    },
  doc:  { icon: 'fileText', color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  docx: { icon: 'fileText', color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  xls:  { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  xlsx: { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  csv:  { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  zip:  { icon: 'briefcase',color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  png:  { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  jpg:  { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  jpeg: { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  webp: { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
};

export function fileTypeStyle(type: string) {
  return FILE_TYPE_STYLE[(type || '').toLowerCase()] ?? { icon: 'file' as IconName, color: 'var(--ink3)', bg: 'var(--bg)' };
}

export function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

export const STATUS_VARIANT: Record<string, 'success' | 'gray' | 'error'> = {
  Active: 'success', Inactive: 'gray', Suspended: 'error',
};
