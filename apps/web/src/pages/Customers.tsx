import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch, apiDownload, apiFetchBlob } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Tip } from '../components/ui/tooltip.js';
import { PersonAvatar, CompanyAvatar } from '../components/PersonAvatar.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { mapApiInvoice, invoiceTotals } from './Billing.js';
import type { ExpenseListItem } from './Expenses.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '../components/ui/dropdown-menu.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter
} from '../components/ui/dialog.js';
import { showConfirm } from '../lib/confirm.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { SwitchRow } from '../components/ui/list-item-row.js';
import { getCompany } from '../data/companyStore.js';
import { ActivityTimeline } from '../components/crm/ActivityTimeline.js';
import { ComposeEmailButton } from '../components/crm/ComposeEmailButton.js';
import { StartCallButton } from '../components/crm/StartCallButton.js';
import { CustomFieldsPanel } from '../components/crm/CustomFieldsPanel.js';

/* ── Statement of Account — print/PDF ──
   Same open-window/write-html/auto-print structure as Billing.tsx's
   openPrintWindow(), but shaped for a customer's whole transaction history
   (many invoices + payments, oldest→newest, running balance) rather than
   one invoice's line groups. */
function openStatementPrintWindow(
  customer: { name: string },
  transactions: { type: 'invoice' | 'payment' | 'credit note'; date: string; ref: string; amount: number; debit: boolean; balance: number }[],
  totals: { totalInvoiced: number; totalPaid: number; outstanding: number },
) {
  const co = getCompany();
  const money = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const rows = transactions.map(tx => `<tr>
    <td>${tx.date ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
    <td>${tx.ref}</td>
    <td style="text-transform:capitalize">${tx.type}</td>
    <td style="text-align:right;font-family:monospace;color:${tx.debit ? '#dc2626' : '#059669'}">${tx.debit ? '-' : '+'}${money(tx.amount)}</td>
    <td style="text-align:right;font-family:monospace;font-weight:700;${tx.balance < 0 ? 'color:#dc2626' : ''}">${money(tx.balance)}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Statement of Account — ${customer.name}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#111;padding:24px 32px;font-size:11px}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #0b1e3a}
.from strong{font-size:15px;color:#111}
.from div{color:#555;line-height:1.6;margin-top:4px}
.title{text-align:right}
.title h1{font-size:18px;color:#0b1e3a}
.title .sub{color:#9ca3af;font-size:10px;margin-top:4px}
.to{margin-bottom:16px}
.to .lbl{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:4px}
.to .name{font-size:13px;font-weight:700}
.totals{display:flex;gap:24px;margin-bottom:16px;padding:12px 14px;background:#f9fafb;border-radius:6px}
.totals div{flex:1}
.totals .lbl{font-size:8px;font-weight:800;text-transform:uppercase;color:#9ca3af;margin-bottom:2px}
.totals .val{font-size:14px;font-weight:800;font-family:monospace}
table{width:100%;border-collapse:collapse}
thead tr{background:#f9fafb;border-bottom:1px solid #e5e7eb}
th{padding:6px 8px;text-align:left;font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.04em;text-transform:uppercase}
th:nth-child(4),th:nth-child(5){text-align:right}
td{padding:7px 8px;border-bottom:1px solid #f3f4f6;font-size:10.5px}
@media print{body{padding:10px 16px}}
</style></head><body>
<div class="top">
  <div class="from">
    ${co.logoUrl ? `<img src="${co.logoUrl}" style="max-height:36px;max-width:140px;object-fit:contain" alt="${co.name}">` : `<strong>${co.name}</strong>`}
    <div>${co.address}<br>${co.city}, ${co.country} · VAT: ${co.taxId}</div>
  </div>
  <div class="title">
    <h1>Statement of Account</h1>
    <div class="sub">Generated ${today}</div>
  </div>
</div>
<div class="to">
  <div class="lbl">Account</div>
  <div class="name">${customer.name}</div>
</div>
<div class="totals">
  <div><div class="lbl">Total Invoiced</div><div class="val">${money(totals.totalInvoiced)}</div></div>
  <div><div class="lbl">Total Paid</div><div class="val" style="color:#059669">${money(totals.totalPaid)}</div></div>
  <div><div class="lbl">Outstanding</div><div class="val" style="color:${totals.outstanding > 0 ? '#dc2626' : '#059669'}">${money(totals.outstanding)}</div></div>
</div>
<table><thead><tr>
  <th>Date</th><th>Reference</th><th>Type</th><th>Amount</th><th>Balance</th>
</tr></thead><tbody>${rows || '<tr><td colspan="5" style="color:#9ca3af;font-style:italic;padding:12px">No transactions</td></tr>'}</tbody></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ── Types ── */
interface Customer {
  id: string;
  name: string;
  email?: string;
  phone_wa?: string;
  tax_id?: string;
  contact_name?: string;
  address?: string;
  created_at: string;
  shipment_count?: number;
  city?: string;
  country?: string;
  website?: string;
  vat_number?: string;
  import_license?: string;
  preferred_port?: string;
  freight_terms?: string;
  commodity_type?: string;
  credit_days?: string;
  client_type?: string;
  account_status?: 'Active' | 'Inactive' | 'Suspended';
  notes?: string;
  currency?: string;
  tancis_number?: string;
  /** Links this tenant-private record to a platform-level Organization
   *  (migration 230) — the same real-world company tracked across every
   *  tenant that has linked a customer record to it. Staff-linked only. */
  organization_id?: string;
  organization_name?: string;
  // Daily shipment-report automation (migration 258) — null = platform
  // default (on); a shipment can further override this. See
  // shipment-report.service.ts's tri-state resolution.
  daily_report_enabled?: boolean | null;
}

/* ── Avatar helper ──
   This page carried its own initials-and-colour scheme, with its own seven-colour
   palette keyed off the first character of the name. So did Leads, and HRM, and
   the header — which is why one company appeared in a different colour in each
   app. It delegates now; the only thing kept is this page's corner radius.

   `customerId` is optional because the same component also draws `contact_name`,
   which is a text field on the customer row rather than a record of its own and
   so has no picture to fetch. */
function Avatar({ name, size = 36, customerId }: { name: string; size?: number; customerId?: string }) {
  return (
    <CompanyAvatar
      name={name}
      size={size}
      shape="square"
      style={{
        borderRadius: 'var(--r)',
        boxShadow: 'var(--elev-sm)',
        border: '1px solid var(--border)',
      }}
    />
  );
}

/* ── Helpers ── */
const PAGE_SIZE = 10;

function fmtDate(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ', ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

function fmtDateShort(d: string) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function maskTin(tin?: string) {
  if (!tin) return null;
  const last4 = tin.replace(/\D/g, '').slice(-4);
  return `**** ${last4 || '????'}`;
}

/* ── File type → icon/colour, for the Documents tab's Drive-linked list ── */
const FILE_TYPE_STYLE: Record<string, { icon: IconName; color: string; bg: string }> = {
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
function fileTypeStyle(type: string) {
  return FILE_TYPE_STYLE[(type || '').toLowerCase()] ?? { icon: 'file' as IconName, color: 'var(--ink3)', bg: 'var(--bg)' };
}

function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

/* ── Status badge ── */
const STATUS_VARIANT: Record<string, 'success' | 'gray' | 'error'> = {
  Active: 'success', Inactive: 'gray', Suspended: 'error',
};
function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'success'} className="whitespace-nowrap">{status}</Badge>;
}

/* ── TIN chip ── */
function TinChip({ tin }: { tin?: string }) {
  const [copied, setCopied] = useState(false);
  const masked = maskTin(tin);
  if (!masked) return <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tin) return;
    navigator.clipboard.writeText(tin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tip label={copied ? 'Copied!' : `TIN: ${tin} — click to copy`} side="top">
      <div
        onClick={handleCopy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          padding: '3px 8px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', background: 'var(--blue-l)', borderRadius: 'var(--r-sm)', padding: '1px 4px' }}>TIN</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)' }}>{masked}</span>
        {copied ? (
          <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>✓</span>
        ) : (
          <Icon name="copy" size={11} style={{ color: 'var(--ink3)', opacity: 0.65 }} />
        )}
      </div>
    </Tip>
  );
}

/* ── Table header cell ── */
function Th({ children, align = 'left', width, className }: { children?: React.ReactNode; align?: 'left'|'right'|'center'; width?: number | string; className?: string }) {
  return (
    <th className={className} style={{ textAlign: align, width }}>
      {children}
    </th>
  );
}

/* ── Actions dropdown ── */
function ActionsMenu({ onView, onEdit, onSuspend, onDelete }: { onView: () => void; onEdit: () => void; onSuspend: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="More actions" onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', color: 'var(--ink3)', display: 'flex', alignItems: 'center', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="moreHorizontal" size={16} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={onView} className="cursor-pointer"><Icon name="eye" size={13} className="text-muted-foreground" /> View Profile</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit} className="cursor-pointer"><Icon name="edit" size={13} className="text-muted-foreground" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onSuspend} className="cursor-pointer"><Icon name="lock" size={13} className="text-muted-foreground" /> Suspend</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive focus:text-destructive"><Icon name="trash" size={13} /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── View field — clean display of a label+value pair ── */
function ViewField({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--mono)' : 'var(--font)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </div>
    </div>
  );
}

/* ── Stat chip used in hero — an icon-square + value/label pair, matching
   the KPI card language used on the Overview tab, so a profile fact reads
   as data rather than a bare label-over-number. A missing profile field
   (Preferred Port, Freight Terms, TIN — all optional) shows a muted italic
   "Not set" instead of a bare "—", which used to read like a rendering bug
   rather than an honestly-empty optional field. ── */
function HeroStat({ icon, label, value, color, bg, muted }: { icon: IconName; label: string; value: string | number; color: string; bg: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={16} color={color} strokeWidth={1.75} />
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: muted ? 'var(--ink3)' : 'var(--navy)', fontStyle: muted ? 'italic' : 'normal', lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main component
══════════════════════════════════════════ */
export const Customers: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [view, setView]           = useState<'list' | 'profile'>('list');
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get('id');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses]   = useState<ExpenseListItem[]>([]);

  useEffect(() => {
    apiFetch('/v1/finance/expenses').then((res: any) => setExpenses(res?.data ?? [])).catch(() => {});
  }, []);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected]   = useState<Customer | null>(null);

  /* Profile navigation */
  const [mainTab, setMainTab]     = useState('overview');
  const [financeTab, setFinanceTab] = useState('invoices');
  const [shipTab, setShipTab]     = useState('shipments');
  const [supplyTab, setSupplyTab] = useState('projects');

  /* Profile edit */
  const [editMode, setEditMode]   = useState(false);
  const [form, setForm]           = useState<Partial<Customer>>({});
  const [saving, setSaving]       = useState(false);
  const [sendingClaimCode, setSendingClaimCode] = useState(false);

  /* Shipments */
  const [custShipments, setCustShipments] = useState<any[]>([]);
  const [shipLoading, setShipLoading]     = useState(false);

  /* Notes */
  const [notes, setNotes]         = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  /* Finance data */
  const [custInvoices, setCustInvoices] = useState<any[]>([]);
  const [custPayments, setCustPayments] = useState<any[]>([]);
  const [custCreditNotes, setCustCreditNotes] = useState<any[]>([]);
  const [finLoading, setFinLoading]     = useState(false);

  /* Supply chain */
  const [custTickets, setCustTickets]   = useState<any[]>([]);
  const [supplyLoading, setSupplyLoading] = useState(false);

  /* SEAL bonded storage (cross-app link) */
  const [custSealLots, setCustSealLots] = useState<any[]>([]);
  const [sealLoading, setSealLoading] = useState(false);

  /* Documents — files linked in from Drive (cloud_files, tagged
     entity_type='customer'), not a separate upload silo. */
  const [linkedFiles, setLinkedFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [defaultDriveId, setDefaultDriveId] = useState<string | null>(null);
  // This customer's real "Customers ▸ <name>" folder in Drive — resolved
  // (and auto-created if missing) on demand, per customer, so uploads and
  // "Open Drive" land inside the actual folder rather than just tagging a
  // file flat at the drive root. Keyed to avoid re-resolving on every click.
  const [customerFolder, setCustomerFolder] = useState<{ customerId: string; id: string; drive_id: string; name: string; parent: { id: string; name: string } | null } | null>(null);
  const [resolvingFolder, setResolvingFolder] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [showLinkFileModal, setShowLinkFileModal] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [fileSearchResults, setFileSearchResults] = useState<any[]>([]);
  const [fileSearching, setFileSearching] = useState(false);
  const [fileLinking, setFileLinking] = useState<string | null>(null);

  /* Signatures — Hudumika Sign envelopes linked to this customer
     (sign_envelopes.client_id, migration 426). Sending one reuses whatever
     is already linked in the Documents tab above, the same "pick from
     Drive" pattern as "Link Existing File" rather than a new upload path. */
  const [custSignEnvelopes, setCustSignEnvelopes] = useState<any[]>([]);
  const [signLoading, setSignLoading] = useState(false);
  const [showSendSignModal, setShowSendSignModal] = useState(false);
  const [signFileSearch, setSignFileSearch] = useState('');
  const [signFileSearchResults, setSignFileSearchResults] = useState<any[]>([]);
  const [signFileSearching, setSignFileSearching] = useState(false);
  const [sendingForSignature, setSendingForSignature] = useState<string | null>(null);

  /* Contacts */
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [contactSaving, setContactSaving] = useState(false);

  /* Create modal */
  /* Create modal */
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    client_type: 'Corporate',
    email: '',
    phone_wa: '',
    tax_id: '',
    vat_number: '',
    contact_name: '',
    address: '',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    preferred_port: 'Dar es Salaam Port',
    credit_days: '30',
  });
  const [createSaving, setCreateSaving] = useState(false);

  /* List-view state */
  const [selectedIds, setSelectedIds]           = useState<string[]>([]);
  const [page, setPage]                         = useState(1);
  const [bulkAction, setBulkAction]             = useState('');
  const [listTab, setListTab]                   = useState<'all' | 'active' | 'corporate' | 'shipments' | 'inactive'>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState('all');
  const [viewMode, setViewMode]                 = useState<'table' | 'grid'>('table');
  const [visibleCols, setVisibleCols]           = useState({
    email: true,
    phone: true,
    contact: true,
    tin: true,
    trade: true,
    joined: true,
  });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/customers');
      setCustomers(res.data ?? res ?? []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  /* Auto-open customer when navigated from Support with ?id= — and, when
     the link also carries ?tab=/&financeTab=, land straight on that tab
     (e.g. Aged Receivables' "View Statement" opens finance/statement
     directly) rather than always resetting to Overview the way a plain
     openProfile() does when a row is clicked from the list. */
  useEffect(() => {
    if (!deepLinkId || !customers.length) return;
    const match = customers.find(c => c.id === deepLinkId);
    if (!match || selected) return;
    openProfile(match);
    const tab = searchParams.get('tab');
    const finTab = searchParams.get('financeTab');
    if (tab) setMainTab(tab);
    if (finTab) setFinanceTab(finTab);
  }, [deepLinkId, customers]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProfile = (c: Customer) => {
    setSelected(c);
    setForm({ ...c });
    setMainTab('overview');
    setEditMode(false);
    setView('profile');
  };

  const loadShipments = useCallback(async (customerId: string) => {
    setShipLoading(true);
    try {
      const res = await apiFetch(`/v1/shipments?customer_id=${customerId}&limit=50`);
      setCustShipments(res.data ?? res ?? []);
    } catch { setCustShipments([]); } finally { setShipLoading(false); }
  }, []);

  useEffect(() => {
    // Loaded as soon as a customer is selected (not gated to the Shipments
    // tab) since Overview's KPIs and Carbon Footprint card need it immediately.
    if (selected) loadShipments(selected.id);
  }, [selected, loadShipments]);

  const loadFinance = useCallback(async (customerId: string) => {
    setFinLoading(true);
    try {
      const [inv, pay, cn] = await Promise.all([
        apiFetch(`/v1/invoices?customer_id=${customerId}`).catch(() => []),
        apiFetch(`/v1/payments?customer_id=${customerId}`).catch(() => []),
        apiFetch(`/v1/credit-notes?customer_id=${customerId}`).catch(() => []),
      ]);
      setCustInvoices(Array.isArray(inv) ? inv : (inv?.data ?? []));
      setCustPayments(Array.isArray(pay) ? pay : (pay?.data ?? []));
      setCustCreditNotes(Array.isArray(cn) ? cn : (cn?.data ?? []));
    } catch { /* empty */ } finally { setFinLoading(false); }
  }, []);

  useEffect(() => {
    // Loaded as soon as a customer is selected — Overview's Invoices/Outstanding
    // KPIs need real totals immediately, not only once the Finance tab is opened.
    if (selected) loadFinance(selected.id);
  }, [selected, loadFinance]);

  const loadTickets = useCallback(async (customerId: string) => {
    setSupplyLoading(true);
    try {
      const res = await apiFetch(`/v1/support/tickets?customer_id=${customerId}`).catch(() => []);
      setCustTickets(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { /* empty */ } finally { setSupplyLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'supply') loadTickets(selected.id);
  }, [selected, mainTab, loadTickets]);

  const loadSealLots = useCallback(async (customerId: string) => {
    setSealLoading(true);
    try {
      const res = await apiFetch(`/v1/seal/lots-for-customer?owner_id=${customerId}`).catch(() => []);
      setCustSealLots(Array.isArray(res) ? res : []);
    } catch { /* empty */ } finally { setSealLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'seal') loadSealLots(selected.id);
  }, [selected, mainTab, loadSealLots]);

  // The tenant's default drive to upload straight-from-this-page files into —
  // fetched once per profile visit, lazily, the first time it's actually
  // needed (Drive auto-creates "My Drive" on first GET if none exist yet).
  const ensureDefaultDrive = useCallback(async () => {
    if (defaultDriveId) return defaultDriveId;
    const drives = await apiFetch('/v1/drives').catch(() => []);
    const id = Array.isArray(drives) && drives.length ? drives[0].id : null;
    setDefaultDriveId(id);
    return id;
  }, [defaultDriveId]);

  // This customer's real Drive folder. GET /v1/files/customer-folder/:id
  // does more than just resolve an id — it creates the folder if missing
  // and retroactively tags any of the customer's own or their shipments'
  // documents that were uploaded before entity-tagging existed, so this
  // doubles as a self-healing sync. Cached per customerId so repeat calls
  // (tab load, then Open Drive, then Upload) don't re-resolve it each time.
  // `silent` skips the error alert for the automatic tab-load call below —
  // a background sync failing shouldn't interrupt someone just viewing the tab.
  const resolveCustomerFolder = useCallback(async (customerId: string, opts?: { silent?: boolean }) => {
    if (customerFolder?.customerId === customerId) return customerFolder;
    setResolvingFolder(true);
    try {
      const res = await apiFetch(`/v1/files/customer-folder/${customerId}`);
      const next = { customerId, id: res.id, drive_id: res.drive_id, name: res.name, parent: res.parent ?? null };
      setCustomerFolder(next);
      return next;
    } catch (err: any) {
      if (!opts?.silent) showAlert(err.message || "Could not open this customer's Drive folder");
      return null;
    } finally {
      setResolvingFolder(false);
    }
  }, [customerFolder]);

  const loadLinkedFiles = useCallback(async (customerId: string) => {
    setFilesLoading(true);
    try {
      // Self-heals this customer's Drive folder + shipment-folder tagging on
      // every open — no manual "Resync" click needed for a customer/shipment
      // (or a file dropped straight into Drive) that predates entity-tagging.
      await resolveCustomerFolder(customerId, { silent: true });
      const res = await apiFetch(`/v1/files?entity_type=customer&entity_id=${customerId}`).catch(() => []);
      setLinkedFiles(Array.isArray(res) ? res : []);
    } catch { /* empty */ } finally { setFilesLoading(false); }
  }, [resolveCustomerFolder]);

  useEffect(() => {
    if (selected && mainTab === 'documents') loadLinkedFiles(selected.id);
  }, [selected, mainTab, loadLinkedFiles]);

  async function openCustomerDrive() {
    if (!selected) return;
    const folder = await resolveCustomerFolder(selected.id);
    if (!folder) return;
    const qs = new URLSearchParams({ drive: folder.drive_id, folder: folder.id, name: folder.name });
    if (folder.parent) { qs.set('parentId', folder.parent.id); qs.set('parentName', folder.parent.name); }
    window.open(`/cloud?${qs.toString()}`, '_blank', 'noopener');
  }

  // Debounced search across the tenant's Drive files, for the "Link existing
  // file" picker — mirrors EntityPicker's search(q) shape without pulling in
  // its combobox chrome, since this needs a multi-select list, not a field.
  useEffect(() => {
    if (!showLinkFileModal) return;
    const q = fileSearch.trim();
    if (!q) { setFileSearchResults([]); return; }
    setFileSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/files?q=${encodeURIComponent(q)}`)
        .then((res: any) => setFileSearchResults(Array.isArray(res) ? res : []))
        .catch(() => setFileSearchResults([]))
        .finally(() => setFileSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [fileSearch, showLinkFileModal]);

  async function linkExistingFile(fileId: string) {
    if (!selected) return;
    setFileLinking(fileId);
    try {
      await apiFetch(`/v1/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ entity_type: 'customer', entity_id: selected.id }),
      });
      await loadLinkedFiles(selected.id);
      setShowLinkFileModal(false);
      setFileSearch('');
      setFileSearchResults([]);
    } catch (err: any) { showAlert(err.message || 'Failed to link file'); } finally { setFileLinking(null); }
  }

  async function unlinkFile(fileId: string, name: string) {
    if (!selected) return;
    if (!(await showConfirm(`Remove "${name}" from this customer? The file stays in Drive.`, { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ entity_type: null, entity_id: null }),
      });
      setLinkedFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err: any) { showAlert(err.message || 'Failed to remove file'); }
  }

  async function uploadFilesToDrive(files: File[]) {
    if (!selected || !files.length) return;
    setFileUploading(true);
    try {
      // Upload straight into the customer's real "Customers ▸ <name>"
      // folder (parent_id), not just tagged flat at the drive root — the
      // entity_type/entity_id tag is still passed explicitly too, so the
      // file stays reliably queryable even if it's later moved elsewhere.
      const folder = await resolveCustomerFolder(selected.id);
      const driveId = folder?.drive_id ?? await ensureDefaultDrive();
      if (!driveId) throw new Error('No Drive available to upload into');
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const qs = new URLSearchParams({ drive_id: driveId, entity_type: 'customer', entity_id: selected.id });
        if (folder) qs.set('parent_id', folder.id);
        await apiFetch(`/v1/files/upload?${qs.toString()}`, {
          method: 'POST', body: fd,
        });
      }
      showAlert(`${files.length} file(s) uploaded to Drive`, { variant: 'success' });
      await loadLinkedFiles(selected.id);
    } catch (err: any) { showAlert(err.message || 'Upload failed'); } finally { setFileUploading(false); }
  }

  const loadSignEnvelopes = useCallback(async (customerId: string) => {
    setSignLoading(true);
    try {
      const res = await apiFetch(`/v1/sign/envelopes?client_id=${customerId}`).catch(() => []);
      setCustSignEnvelopes(Array.isArray(res) ? res : []);
    } catch { /* empty */ } finally { setSignLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'signatures') loadSignEnvelopes(selected.id);
  }, [selected, mainTab, loadSignEnvelopes]);

  // Same debounced Drive search as "Link existing file" above, kept as its
  // own state so the two modals can never bleed search results into each
  // other if a user reopens one right after the other.
  useEffect(() => {
    if (!showSendSignModal) return;
    const q = signFileSearch.trim();
    if (!q) { setSignFileSearchResults([]); return; }
    setSignFileSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/files?q=${encodeURIComponent(q)}`)
        .then((res: any) => setSignFileSearchResults(Array.isArray(res) ? res : []))
        .catch(() => setSignFileSearchResults([]))
        .finally(() => setSignFileSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [signFileSearch, showSendSignModal]);

  async function sendFileForSignature(file: { id: string; name: string }) {
    if (!selected) return;
    if (!selected.email) { showAlert('This customer has no email on file — add one before sending a document for signature.'); return; }
    setSendingForSignature(file.id);
    try {
      // A Drive-sourced envelope is normally created file_id-only
      // (document_data left null — see SignEditor.tsx's own handleSave),
      // relying on the internal editor's authenticated /v1/files/:id/preview
      // fetch to render it. The public signing page (no auth, a token in an
      // email link) has no equivalent lazy fetch and only ever reads
      // document_data — so file_id-only would leave an external signer
      // looking at a blank document. Resolving the real bytes once here,
      // up front, sidesteps that gap entirely rather than depending on it.
      const blob = await apiFetchBlob(`/v1/files/${file.id}/download`);
      const documentData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve((ev.target?.result as string) ?? '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(blob);
      });

      // Two calls, matching SignEditor's own compose-then-send shape: POST
      // /envelopes only creates a draft (see that handler's own comment on
      // why no status/notify happens there) — /send is what actually
      // notifies the recipient and flips status to 'sent'.
      const envelope: any = await apiFetch('/v1/sign/envelopes', {
        method: 'POST',
        body: JSON.stringify({
          title: file.name,
          file_id: file.id,
          file_name: file.name,
          document_data: documentData,
          client_id: selected.id,
          order_mode: 'sequential',
          recipients: [{ name: selected.name, email: selected.email, sign_order: 1 }],
          fields: [{ recipient_index: 0, field_type: 'signature', page: 1, x: 0.55, y: 0.85, width: 0.35, height: 0.07, required: true }],
        }),
      });
      await apiFetch(`/v1/sign/envelopes/${envelope.id}/send`, { method: 'POST' });
      showAlert(`Sent "${file.name}" to ${selected.name} for signature`, { variant: 'success' });
      setShowSendSignModal(false);
      setSignFileSearch('');
      setSignFileSearchResults([]);
      await loadSignEnvelopes(selected.id);
    } catch (err: any) { showAlert(err.message || 'Failed to send for signature'); } finally { setSendingForSignature(null); }
  }

  useEffect(() => {
    if (selected) setNotes(selected.notes || '');
  }, [selected]);

  async function handleSaveNote() {
    if (!selected) return;
    setNoteSaving(true);
    try {
      await apiFetch(`/v1/customers/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      setSelected(prev => prev ? { ...prev, notes } : prev);
      setCustomers(cs => cs.map(c => c.id === selected.id ? { ...c, notes } : c));
    } catch (err: any) { showAlert(err.message || 'Failed to save notes'); } finally { setNoteSaving(false); }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !contactForm.name) return;
    setContactSaving(true);
    try {
      await apiFetch(`/v1/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ contact_name: contactForm.name, email: contactForm.email || selected.email, phone_wa: contactForm.phone || selected.phone_wa }),
      });
      setSelected(prev => prev ? { ...prev, contact_name: contactForm.name, email: contactForm.email || prev.email, phone_wa: contactForm.phone || prev.phone_wa } : prev);
      setCustomers(cs => cs.map(c => c.id === selected.id ? { ...c, contact_name: contactForm.name } : c));
      setShowAddContact(false);
      setContactForm({ name: '', email: '', phone: '', role: '' });
    } catch (err: any) { showAlert(err.message || 'Failed to save contact'); } finally { setContactSaving(false); }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name, email: form.email, phone_wa: form.phone_wa, tax_id: form.tax_id,
          contact_name: form.contact_name, address: form.address, website: form.website,
          city: form.city, country: form.country, vat_number: form.vat_number,
          import_license: form.import_license, preferred_port: form.preferred_port,
          freight_terms: form.freight_terms, commodity_type: form.commodity_type,
          credit_days: form.credit_days ? Number(form.credit_days) : null, client_type: form.client_type,
          currency: form.currency, tancis_number: form.tancis_number,
          organization_id: form.organization_id || null,
        }),
      });
      setSelected(prev => prev ? { ...prev, ...form } : prev);
      setCustomers(cs => cs.map(c => c.id === selected.id ? { ...c, ...form } : c));
      setEditMode(false);
    } catch (err: any) { showAlert(err.message || 'Save failed'); } finally { setSaving(false); }
  };

  async function handleSendClaimCode() {
    if (!selected || sendingClaimCode) return;
    setSendingClaimCode(true);
    try {
      const res = await apiFetch(`/v1/customers/${selected.id}/claim-code`, { method: 'POST' });
      const sentTo = [res.sent_to?.email, res.sent_to?.phone_wa].filter(Boolean);
      showAlert(
        `Code: ${res.token}`,
        {
          title: 'Claim code sent',
          variant: 'success',
          items: [
            sentTo.length ? `Sent to ${sentTo.join(' and ')}` : 'No email/WhatsApp on file — share the code above directly.',
            'Valid for 7 days, single use — enter it under "Link an Agent" in the organization portal.',
          ],
        },
      );
    } catch (err: any) {
      showAlert(err.message || 'Could not send a claim code');
    } finally {
      setSendingClaimCode(false);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSaving(true);
    try {
      await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify(createForm) });
      setShowCreate(false);
      setCreateForm({
        name: '',
        client_type: 'Corporate',
        email: '',
        phone_wa: '',
        tax_id: '',
        vat_number: '',
        contact_name: '',
        address: '',
        city: 'Dar es Salaam',
        country: 'Tanzania',
        preferred_port: 'Dar es Salaam Port',
        credit_days: '30',
      });
      loadCustomers();
      showAlert('Customer created successfully', { variant: 'success' });
    } catch (err: any) { showAlert(err.message || 'Failed to create customer', { variant: 'error' }); } finally { setCreateSaving(false); }
  };

  /* Metrics counts */
  const totalCount = customers.length;
  const activeCount = customers.filter(c => (c.account_status || 'Active') === 'Active').length;
  const inactiveCount = customers.filter(c => (c.account_status || 'Active') !== 'Active').length;
  const corporateCount = customers.filter(c => {
    const t = (c.client_type || '').toLowerCase();
    const n = c.name.toLowerCase();
    return t === 'corporate' || n.includes('ltd') || n.includes('limited') || n.includes('corp') || n.includes('industries') || n.includes('holdings') || n.includes('enterprises') || n.includes('group');
  }).length;
  const withShipmentsCount = customers.filter(c => (c.shipment_count ?? 0) > 0).length;
  const totalShipments = customers.reduce((s, c) => s + (c.shipment_count ?? 0), 0);
  const verifiedTinCount = customers.filter(c => !!c.tax_id).length;
  const tinRate = totalCount > 0 ? Math.round((verifiedTinCount / totalCount) * 100) : 0;

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone_wa || '').toLowerCase().includes(q) ||
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.tax_id || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.preferred_port || '').toLowerCase().includes(q);

      const status = c.account_status || 'Active';
      const matchStatus = statusFilter === 'all' || status === statusFilter;

      const isCorporate = (c.client_type || '').toLowerCase() === 'corporate' ||
        c.name.toLowerCase().includes('ltd') ||
        c.name.toLowerCase().includes('limited') ||
        c.name.toLowerCase().includes('corp') ||
        c.name.toLowerCase().includes('industries') ||
        c.name.toLowerCase().includes('holdings');

      const clientType = c.client_type || (isCorporate ? 'Corporate' : 'SME');
      const matchClientType = clientTypeFilter === 'all' || clientType === clientTypeFilter;

      let matchListTab = true;
      if (listTab === 'active') matchListTab = status === 'Active';
      else if (listTab === 'inactive') matchListTab = status !== 'Active';
      else if (listTab === 'corporate') matchListTab = isCorporate;
      else if (listTab === 'shipments') matchListTab = (c.shipment_count ?? 0) > 0;

      return matchSearch && matchStatus && matchClientType && matchListTab;
    });
  }, [customers, search, statusFilter, clientTypeFilter, listTab]);

  function exportCSV(rows: Customer[]) {
    const hdr = ['Name','Client Type','Email','Phone','Contact Person','TIN Number','City','Preferred Port','Shipments','Status','Joined'].join(',');
    const body = rows.map(c => [
      `"${c.name.replace(/"/g,'""')}"`,
      `"${c.client_type || 'Corporate'}"`,
      `"${(c.email||'').replace(/"/g,'""')}"`,
      `"${(c.phone_wa||'').replace(/"/g,'""')}"`,
      `"${(c.contact_name||'').replace(/"/g,'""')}"`,
      `"${(c.tax_id||'').replace(/"/g,'""')}"`,
      `"${(c.city||'').replace(/"/g,'""')}"`,
      `"${(c.preferred_port||'').replace(/"/g,'""')}"`,
      c.shipment_count ?? 0,
      c.account_status||'Active',
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '',
    ].join(',')).join('\n');
    const blob = new Blob([hdr+'\n'+body], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `customers-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handleBulkApply() {
    if (!bulkAction || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    try {
      if (bulkAction === 'delete') {
        if (!(await showConfirm(`Delete ${ids.length} customer${ids.length > 1 ? 's' : ''}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
        await Promise.all(ids.map(id => apiFetch(`/v1/customers/${id}`, { method: 'DELETE' })));
        setCustomers(cs => cs.filter(c => !ids.includes(c.id)));
      } else if (bulkAction === 'export') {
        exportCSV(customers.filter(c => ids.includes(c.id)));
      } else {
        const s: Customer['account_status'] = bulkAction === 'active' ? 'Active' : bulkAction === 'inactive' ? 'Inactive' : 'Suspended';
        await Promise.all(ids.map(id => apiFetch(`/v1/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ account_status: s }) })));
        setCustomers(cs => cs.map(c => ids.includes(c.id) ? { ...c, account_status: s } : c));
      }
      setSelectedIds([]); setBulkAction('');
    } catch (err: any) { showAlert(err.message || 'Action failed'); }
  }

  /* ══════════════════════════════
     LIST VIEW
  ══════════════════════════════ */
  if (loading && view === 'list') {
    return <SkeletonPage variant="table" />;
  }

  if (view === 'list') {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const allChecked = paginated.length > 0 && paginated.every(c => selectedIds.includes(c.id));
    const someChecked = paginated.some(c => selectedIds.includes(c.id));

    function toggleRow(id: string) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
    function toggleAll() {
      if (allChecked) setSelectedIds(prev => prev.filter(id => !paginated.some(c => c.id === id)));
      else setSelectedIds(prev => [...new Set([...prev, ...paginated.map(c => c.id)])]);
    }

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 32px', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

        {/* House Page Header */}
        <PageHeader
          crumbs={['CRM', 'Customers']}
          titlePlain="Customer"
          titleEm="directory"
          subtitle={`${totalCount.toLocaleString()} client accounts, commercial terms, billing statements, and trade history.`}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCSV(filtered)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="download" size={14} strokeWidth={2} /> Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/crm/customers/bulk-upload')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="upload" size={14} strokeWidth={2} /> Import
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowCreate(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="plus" size={15} strokeWidth={2.5} color="hsl(var(--primary-foreground))" /> Add Customer
              </Button>
            </div>
          }
        />

        {/* Main Content Layout */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Top KPI Metrics Ribbon */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 14 }}>
            {/* KPI 1 */}
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>
                  Total Customers
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>
                  {totalCount}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>{activeCount} active</span> · {inactiveCount} inactive
                </div>
              </div>
              <FeaturedIcon variant="brand" size="md" shape="square">
                <Icon name="users" size={18} />
              </FeaturedIcon>
            </div>

            {/* KPI 2 */}
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>
                  Corporate Accounts
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>
                  {corporateCount}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  {Math.round((corporateCount / Math.max(1, totalCount)) * 100)}% of client portfolio
                </div>
              </div>
              <FeaturedIcon variant="success" size="md" shape="square">
                <Icon name="briefcase" size={18} />
              </FeaturedIcon>
            </div>

            {/* KPI 3 */}
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>
                  Trade Shipments
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>
                  {totalShipments}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  Across {withShipmentsCount} active trading clients
                </div>
              </div>
              <FeaturedIcon variant="info" size="md" shape="square">
                <Icon name="ship" size={18} />
              </FeaturedIcon>
            </div>

            {/* KPI 4 */}
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>
                  Tax Compliance Rate
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginTop: 4, lineHeight: 1.1 }}>
                  {tinRate}%
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{verifiedTinCount}</span> verified TIN records
                </div>
              </div>
              <FeaturedIcon variant="warning" size="md" shape="square">
                <Icon name="shield" size={18} />
              </FeaturedIcon>
            </div>
          </div>

          {/* Quick Segmented Tabs */}
          <Tabs value={listTab} onValueChange={v => { setListTab(v as typeof listTab); setPage(1); }} variant="segmented">
            <TabsList style={{ overflowX: 'auto' }}>
              <TabsTrigger value="all">All Accounts ({totalCount})</TabsTrigger>
              <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
              <TabsTrigger value="corporate">Corporate & Key ({corporateCount})</TabsTrigger>
              <TabsTrigger value="shipments">With Shipments ({withShipmentsCount})</TabsTrigger>
              <TabsTrigger value="inactive">Inactive / Suspended ({inactiveCount})</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Main Card */}
          <div className="crm-card" style={{ borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', boxShadow: 'var(--elev-sm)' }}>

            {/* Unified Toolbar */}
            <div className="crm-toolbar" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
              
              {/* Bulk Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Select value={bulkAction || '__none__'} onValueChange={v => setBulkAction(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="w-40 h-8.5 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Bulk Action</SelectItem>
                    <SelectItem value="active">Mark as Active</SelectItem>
                    <SelectItem value="inactive">Mark as Inactive</SelectItem>
                    <SelectItem value="suspend">Suspend Selected</SelectItem>
                    <SelectItem value="export">Export Selected</SelectItem>
                    <SelectItem value="delete">Delete Selected</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={bulkAction && selectedIds.length > 0 ? 'default' : 'outline'}
                  onClick={handleBulkApply}
                  disabled={!bulkAction || selectedIds.length === 0}
                  style={{ height: 34 }}
                >
                  Apply
                </Button>
              </div>

              {selectedIds.length > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--border))', borderRadius: 'var(--r-sm)', padding: '3px 8px', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                  <span>{selectedIds.length} selected</span>
                  <button type="button" onClick={() => setSelectedIds([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
                </div>
              )}

              {/* Client Type Filter */}
              <Select value={clientTypeFilter} onValueChange={v => { setClientTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-8.5 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Client Types</SelectItem>
                  <SelectItem value="Corporate">Corporate</SelectItem>
                  <SelectItem value="SME">SME / Trading</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-34 h-8.5 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>

              <div style={{ flex: 1 }} />

              {/* Search input with clean icon */}
              <div style={{ position: 'relative', minWidth: 240 }}>
                <Icon name="search" size={14} strokeWidth={1.75} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search customer, contact, TIN, port…"
                  style={{
                    padding: '7px 28px 7px 32px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm, 6px)',
                    fontSize: 13,
                    fontFamily: 'var(--font)',
                    outline: 'none',
                    width: '100%',
                    color: 'var(--ink)',
                    background: 'var(--card-bg, var(--white))',
                    transition: 'border-color 0.15s',
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setPage(1); }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 14, padding: 0 }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* View Mode Toggle: Table vs Cards */}
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 6px)', overflow: 'hidden', background: 'var(--bg)' }}>
                <Tip label="Table View" side="bottom">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    style={{
                      padding: '6px 10px',
                      border: 'none',
                      background: viewMode === 'table' ? 'var(--card-bg, var(--white))' : 'transparent',
                      color: viewMode === 'table' ? 'var(--teal)' : 'var(--ink3)',
                      cursor: 'pointer',
                      boxShadow: viewMode === 'table' ? 'var(--elev-sm)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Icon name="list" size={15} />
                  </button>
                </Tip>
                <Tip label="Cards Grid View" side="bottom">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    style={{
                      padding: '6px 10px',
                      border: 'none',
                      background: viewMode === 'grid' ? 'var(--card-bg, var(--white))' : 'transparent',
                      color: viewMode === 'grid' ? 'var(--teal)' : 'var(--ink3)',
                      cursor: 'pointer',
                      boxShadow: viewMode === 'grid' ? 'var(--elev-sm)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Icon name="grid" size={15} />
                  </button>
                </Tip>
              </div>

              {/* Column Settings */}
              <Tip label="Column visibility" side="bottom">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" style={{ padding: '0 8px', height: 34 }}>
                      <Icon name="settings" size={14} style={{ color: 'var(--ink3)' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div style={{ padding: '6px 10px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Visible Columns</div>
                    {([
                      { key: 'email',   label: 'Email' },
                      { key: 'phone',   label: 'Phone / WhatsApp' },
                      { key: 'contact', label: 'Primary Contact' },
                      { key: 'tin',     label: 'TIN Number' },
                      { key: 'trade',   label: 'Trade Volume' },
                      { key: 'joined',  label: 'Joined Date' },
                    ] as { key: keyof typeof visibleCols; label: string }[]).map(col => (
                      <DropdownMenuCheckboxItem
                        key={col.key}
                        checked={visibleCols[col.key]}
                        onSelect={e => e.preventDefault()}
                        onCheckedChange={() => setVisibleCols(v => ({ ...v, [col.key]: !v[col.key] }))}
                      >
                        {col.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Tip>

            </div>

            {/* View Mode 1: Table View */}
            {viewMode === 'table' && (
              <div style={{ overflowX: 'auto' }}>
                <table className="crm-table crm-customer-table">
                  <thead>
                    <tr>
                      <Th width={42}>
                        <Checkbox checked={allChecked ? true : someChecked ? 'indeterminate' : false} onCheckedChange={toggleAll} />
                      </Th>
                      <Th className="crm-col-company" width={360}>Customer / Company</Th>
                      {visibleCols.contact && <Th className="crm-col-contact">Primary Contact</Th>}
                      {visibleCols.email   && <Th className="crm-col-email">Email Address</Th>}
                      {visibleCols.phone   && <Th className="crm-col-phone">Phone / WhatsApp</Th>}
                      {visibleCols.tin     && <Th className="crm-col-tin">TIN & Compliance</Th>}
                      {visibleCols.trade   && <Th className="crm-col-trade">Trade Volume</Th>}
                      {visibleCols.joined  && <Th className="crm-col-joined">Joined</Th>}
                      <Th>Status</Th>
                      <Th className="crm-col-actions" align="right" width={80}>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const colCount = 4 + Object.values(visibleCols).filter(Boolean).length;
                      if (loading) {
                        return <tr><td colSpan={colCount} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading customers…</td></tr>;
                      }
                      if (paginated.length === 0) {
                        return (
                          <tr>
                            <td colSpan={colCount} style={{ padding: '64px 20px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink3)' }}>
                                <FeaturedIcon variant="brand" size="lg" shape="circle">
                                  <Icon name="users" size={24} />
                                </FeaturedIcon>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>No customers found</div>
                                <div style={{ fontSize: 13, maxWidth: 360 }}>No client accounts match your current filters. Try changing your search query or add a new customer.</div>
                                <Button size="sm" onClick={() => setShowCreate(true)} style={{ marginTop: 6 }}>
                                  <Icon name="plus" size={14} /> Add Customer
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return paginated.map(c => {
                        const isChecked = selectedIds.includes(c.id);
                        const status = c.account_status || 'Active';
                        const isCorporate = (c.client_type || '').toLowerCase() === 'corporate' ||
                          c.name.toLowerCase().includes('ltd') ||
                          c.name.toLowerCase().includes('limited') ||
                          c.name.toLowerCase().includes('corp');
                        const clientTag = c.client_type || (isCorporate ? 'Corporate' : 'SME');

                        return (
                          <tr
                            key={c.id}
                            style={{
                              background: isChecked ? 'var(--teal-l, var(--bg))' : 'var(--card-bg, var(--white))',
                              cursor: 'pointer',
                              transition: 'background 0.1s ease',
                            }}
                            onClick={() => openProfile(c)}
                          >
                            <td style={{ width: 42 }} onClick={e => e.stopPropagation()}>
                              <Checkbox aria-label={`Select ${c.name}`} checked={isChecked} onCheckedChange={() => toggleRow(c.id)} />
                            </td>

                            {/* Customer Identity */}
                            <td className="crm-col-company crm-company-cell">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Avatar name={c.name} size={38} customerId={c.id} />
                                <div>
                                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.2 }}>
                                    {c.name}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                    <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>
                                      {clientTag}
                                    </span>
                                    {c.city && (
                                      <>
                                        <span style={{ color: 'var(--border)' }}>·</span>
                                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{c.city}</span>
                                      </>
                                    )}
                                    {c.preferred_port && (
                                      <>
                                        <span style={{ color: 'var(--border)' }}>·</span>
                                        <span style={{ fontSize: 10.5, color: 'var(--teal)', fontWeight: 600 }}>{c.preferred_port}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Contact Person */}
                            {visibleCols.contact && (
                              <td className="crm-col-contact">
                                {c.contact_name ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <PersonAvatar name={c.contact_name} size={24} />
                                    <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{c.contact_name}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>
                                )}
                              </td>
                            )}

                            {/* Email Address */}
                            {visibleCols.email && (
                              <td className="crm-col-email">
                                {c.email ? (
                                  <a
                                    href={`mailto:${c.email}`}
                                    onClick={e => e.stopPropagation()}
                                    style={{ fontSize: 13, color: 'var(--ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                    className="hover:underline"
                                  >
                                    <Icon name="mail" size={13} style={{ color: 'var(--ink3)' }} />
                                    {c.email}
                                  </a>
                                ) : (
                                  <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>
                                )}
                              </td>
                            )}

                            {/* Phone / WhatsApp */}
                            {visibleCols.phone && (
                              <td className="crm-col-phone">
                                {c.phone_wa ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Tip label={`Open WhatsApp — ${c.phone_wa}`} side="top">
                                    <a
                                      href={`https://wa.me/${c.phone_wa.replace(/\D/g, '')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink)',
                                        textDecoration: 'none', background: 'var(--bg)', padding: '2px 7px',
                                        borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                                      }}
                                    >
                                      <Icon name="phone" size={12} style={{ color: 'var(--green)' }} />
                                      {c.phone_wa}
                                    </a>
                                  </Tip>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>
                                )}
                              </td>
                            )}

                            {/* TIN Number */}
                            {visibleCols.tin && (
                              <td className="crm-col-tin">
                                <TinChip tin={c.tax_id} />
                              </td>
                            )}

                            {/* Trade Volume */}
                            {visibleCols.trade && (
                              <td className="crm-col-trade">
                                {(c.shipment_count ?? 0) > 0 ? (
                                  <Badge variant="info" className="gap-1 font-semibold">
                                    <Icon name="ship" size={11} />
                                    {c.shipment_count} shipments
                                  </Badge>
                                ) : (
                                  <span style={{ color: 'var(--ink3)', fontSize: 12 }}>None</span>
                                )}
                              </td>
                            )}

                            {/* Joined Date */}
                            {visibleCols.joined && (
                              <td className="crm-col-joined" style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                                {fmtDate(c.created_at)}
                              </td>
                            )}

                            {/* Status */}
                            <td>
                              <StatusBadge status={status} />
                            </td>

                            {/* Row Action Menu */}
                            <td className="crm-col-actions" style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <ActionsMenu
                                onView={() => openProfile(c)}
                                onEdit={() => { openProfile(c); setTimeout(() => setEditMode(true), 0); }}
                                onSuspend={() => {
                                  const next = c.account_status === 'Suspended' ? 'Active' : 'Suspended';
                                  apiFetch(`/v1/customers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ account_status: next }) })
                                    .then(() => setCustomers(cs => cs.map(x => x.id === c.id ? { ...x, account_status: next } : x)))
                                    .catch(err => showAlert(err.message || 'Failed'));
                                }}
                                onDelete={async () => {
                                  if (!(await showConfirm(`Delete ${c.name}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
                                  apiFetch(`/v1/customers/${c.id}`, { method: 'DELETE' })
                                    .then(() => setCustomers(cs => cs.filter(x => x.id !== c.id)))
                                    .catch(err => showAlert(err.message || 'Delete failed'));
                                }}
                              />
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            {/* View Mode 2: Cards Grid View */}
            {viewMode === 'grid' && (
              <div style={{ padding: 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {paginated.map(c => {
                  const status = c.account_status || 'Active';
                  const isChecked = selectedIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => openProfile(c)}
                      style={{
                        background: isChecked ? 'var(--teal-l)' : 'var(--card-bg, var(--white))',
                        border: `1px solid ${isChecked ? 'var(--teal)' : 'var(--border)'}`,
                        borderRadius: 'var(--r)',
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 14,
                        cursor: 'pointer',
                        boxShadow: 'var(--elev-sm)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                      }}
                      className="hover:shadow-md hover:border-primary/40"
                    >
                      {/* Card Header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={c.name} size={42} customerId={c.id} />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.2 }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                              {c.client_type || 'Corporate'} {c.city ? `· ${c.city}` : ''}
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      {/* Contact & Commercial Info */}
                      <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                        {c.contact_name && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--ink3)' }}>Contact:</span>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.contact_name}</span>
                          </div>
                        )}
                        {c.tax_id && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--ink3)' }}>TIN:</span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{maskTin(c.tax_id)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--ink3)' }}>Trade Shipments:</span>
                          <span style={{ fontWeight: 700, color: (c.shipment_count ?? 0) > 0 ? 'var(--blue)' : 'var(--ink3)' }}>
                            {c.shipment_count ?? 0}
                          </span>
                        </div>
                      </div>

                      {/* Card Actions Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {c.email && (
                            <Tip label={`Email — ${c.email}`} side="top">
                              <a
                                href={`mailto:${c.email}`}
                                onClick={e => e.stopPropagation()}
                                style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)', background: 'var(--card-bg, var(--white))' }}
                              >
                                <Icon name="mail" size={13} />
                              </a>
                            </Tip>
                          )}
                          {c.phone_wa && (
                            <Tip label={`WhatsApp — ${c.phone_wa}`} side="top">
                              <a
                                href={`https://wa.me/${c.phone_wa.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)', background: 'var(--card-bg, var(--white))' }}
                              >
                                <Icon name="phone" size={13} />
                              </a>
                            </Tip>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={e => {
                              e.stopPropagation();
                              openProfile(c);
                            }}
                            style={{ height: 30, fontSize: 12 }}
                          >
                            Profile
                          </Button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Bar */}
            {!loading && filtered.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                  Showing <strong style={{ color: 'var(--ink)' }}>{Math.min(filtered.length, (safePage - 1) * PAGE_SIZE + 1)}</strong>–<strong style={{ color: 'var(--ink)' }}>{Math.min(filtered.length, safePage * PAGE_SIZE)}</strong> of <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> customers
                </div>

                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <PagBtn label="Prev" disabled={safePage === 1} onClick={() => setPage(p => p - 1)} />
                  {getPageNums(safePage, totalPages).map((p, i) =>
                    p === '…' ? (
                      <span key={`e-${i}`} style={{ padding: '0 4px', color: 'var(--ink3)', fontSize: 13 }}>···</span>
                    ) : (
                      <PagBtn key={p} label={String(p)} active={p === safePage} onClick={() => setPage(p as number)} />
                    )
                  )}
                  <PagBtn label="Next" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink3)' }}>
                  <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>PAGE</span>
                  <input
                    type="number"
                    value={safePage}
                    min={1}
                    max={totalPages}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (v >= 1 && v <= totalPages) setPage(v);
                    }}
                    style={{ width: 44, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5, textAlign: 'center', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--card-bg, var(--white))' }}
                  />
                  <span>OF {totalPages}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enterprise Create Customer Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
              <DialogDescription>
                Register an enterprise client account with commercial credit terms, tax identification, and preferred customs ports.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <DialogBody>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                  
                  {/* Company Name */}
                  <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Company / Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.name}
                      onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Acme Industrial Supplies Ltd"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* Client Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Client Classification
                    </label>
                    <Select value={createForm.client_type} onValueChange={v => setCreateForm(p => ({ ...p, client_type: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Corporate">Corporate / Enterprise</SelectItem>
                        <SelectItem value="SME">SME / Trading Firm</SelectItem>
                        <SelectItem value="Government">Government / Public Agency</SelectItem>
                        <SelectItem value="Individual">Individual Trader</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Contact Person */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Primary Contact Person
                    </label>
                    <input
                      type="text"
                      value={createForm.contact_name}
                      onChange={e => setCreateForm(p => ({ ...p, contact_name: e.target.value }))}
                      placeholder="e.g. John Doe (Director)"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* Email Address */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Official Email Address
                    </label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="accounts@company.co.tz"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* WhatsApp / Phone */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      WhatsApp / Phone Number
                    </label>
                    <input
                      type="text"
                      value={createForm.phone_wa}
                      onChange={e => setCreateForm(p => ({ ...p, phone_wa: e.target.value }))}
                      placeholder="+255 712 345 678"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* TIN Number */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Taxpayer ID (TIN Number)
                    </label>
                    <input
                      type="text"
                      value={createForm.tax_id}
                      onChange={e => setCreateForm(p => ({ ...p, tax_id: e.target.value }))}
                      placeholder="e.g. 123-456-789"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* VAT Number */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      VAT Registration Number
                    </label>
                    <input
                      type="text"
                      value={createForm.vat_number}
                      onChange={e => setCreateForm(p => ({ ...p, vat_number: e.target.value }))}
                      placeholder="e.g. 40-001234-V"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                  {/* Preferred Port */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Preferred Port / ICD
                    </label>
                    <Select value={createForm.preferred_port} onValueChange={v => setCreateForm(p => ({ ...p, preferred_port: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dar es Salaam Port">Dar es Salaam Port (TZ)</SelectItem>
                        <SelectItem value="Mombasa Port">Mombasa Port (KE)</SelectItem>
                        <SelectItem value="Tanga Port">Tanga Port (TZ)</SelectItem>
                        <SelectItem value="Zanzibar Malindi">Zanzibar Malindi Port</SelectItem>
                        <SelectItem value="Mtwara Port">Mtwara Port</SelectItem>
                        <SelectItem value="Kurasini ICD">Kurasini ICD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Credit Days */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Commercial Payment Terms
                    </label>
                    <Select value={createForm.credit_days} onValueChange={v => setCreateForm(p => ({ ...p, credit_days: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Cash on Delivery (COD)</SelectItem>
                        <SelectItem value="15">15 Days Net</SelectItem>
                        <SelectItem value="30">30 Days Net (Standard)</SelectItem>
                        <SelectItem value="60">60 Days Net</SelectItem>
                        <SelectItem value="90">90 Days Net (Special)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Physical Address */}
                  <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                      Physical Address & Location
                    </label>
                    <input
                      type="text"
                      value={createForm.address}
                      onChange={e => setCreateForm(p => ({ ...p, address: e.target.value }))}
                      placeholder="e.g. Plot 45, Nyerere Road, Industrial Area, Dar es Salaam"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--card-bg, var(--white))', color: 'var(--ink)' }}
                    />
                  </div>

                </div>
              </DialogBody>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createSaving || !createForm.name.trim()}>
                  {createSaving ? 'Creating Account…' : 'Create Customer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    );
  }

  /* ══════════════════════════════
     PROFILE VIEW
  ══════════════════════════════ */
  if (!selected) return null;
  const sel = selected; // capture narrowed type for use inside closures/nested functions
  const shipCount = sel.shipment_count ?? custShipments.length;
  const status = sel.account_status || 'Active';

  const MAIN_TABS = [
    { key: 'overview',   label: 'Overview',      icon: 'grid'       as IconName },
    { key: 'activity',   label: 'Activity',      icon: 'activity'   as IconName },
    { key: 'profile',    label: 'Profile',        icon: 'user'       as IconName },
    { key: 'contacts',   label: 'Contacts',       icon: 'users'      as IconName },
    { key: 'finance',    label: 'Finance',        icon: 'barChart'   as IconName },
    { key: 'shipments',  label: 'Shipments',      icon: 'ship'       as IconName },
    { key: 'supply',     label: 'Supply Chain',   icon: 'layers'     as IconName },
    { key: 'seal',       label: 'Bonded Storage', icon: 'package'    as IconName },
    { key: 'documents',  label: 'Documents',      icon: 'folder'     as IconName },
    { key: 'signatures', label: 'Signatures',     icon: 'stamp'      as IconName },
    { key: 'notes',      label: 'Notes',          icon: 'edit'       as IconName },
  ];

  const btnS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' };

  function renderTabContent() {
    /* ── Overview ── */
    if (mainTab === 'overview') {
      const activeShipmentsCount = custShipments.filter(s => s.stage !== 'CLOSED').length;
      const ovTotalInvoiced = custInvoices.reduce((s: number, i: any) => s + invoiceTotals(mapApiInvoice(i)).grandTotalTZS, 0);
      const ovTotalPaid     = custPayments.reduce((s: number, p: any) => s + (parseFloat(p.amount ?? 0)), 0);
      const ovOutstanding   = ovTotalInvoiced - ovTotalPaid;
      return (
        <div style={{ padding: '24px 28px' }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Total Shipments', value: shipCount, icon: 'ship'      as IconName, color: 'var(--blue)', bg: 'var(--blue-l)' },
              { label: 'Active Shipments',value: shipLoading ? '…' : activeShipmentsCount, icon: 'activity' as IconName, color: 'var(--teal)', bg: 'var(--teal-l)' },
              { label: 'Invoices',         value: finLoading ? '…' : custInvoices.length, icon: 'fileText' as IconName, color: 'var(--purple)', bg: 'var(--purple-l)' },
              { label: 'Outstanding (TZS)',value: finLoading ? '…' : ovOutstanding.toLocaleString('en'), icon: 'alertCircle' as IconName, color: 'var(--red)', bg: 'var(--red-l)' },
            ].map(kpi => (
              <div key={kpi.label} className="crm-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 'var(--r)', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={kpi.icon} size={18} color={kpi.color} strokeWidth={1.75} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.1 }}>{kpi.value}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Carbon footprint — summed live from this customer's own shipments
              (co2_emissions_kg / carbon_credits_saved, already returned by the
              shipments fetch above; not a registry-issued tradeable credit). */}
          {(() => {
            const calc = custShipments.filter(s => s.co2_emissions_kg != null);
            const totalCo2 = calc.reduce((s, sh) => s + Number(sh.co2_emissions_kg || 0), 0);
            const totalCredits = calc.reduce((s, sh) => s + Number(sh.carbon_credits_saved || 0), 0);
            return (
              <div className="crm-card" style={{ padding: '16px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="globe" size={18} color="var(--green)" strokeWidth={1.75} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Carbon Footprint</div>
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{totalCo2.toLocaleString('en')} kg</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Total CO₂ emissions</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{totalCredits.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Credits saved (est.)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{calc.length} / {custShipments.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Shipments calculated</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Daily shipment-report automation (migration 258) — the
              customer-level default; an individual shipment can still
              override it (ShipmentDetail's own Automation card). */}
          <div className="crm-card" style={{ marginBottom: 24, padding: '4px 18px' }}>
            <SwitchRow
              title="Daily shipment progress reports"
              description="Sends today's PDF report by email and a live-status link by WhatsApp, ~21:00 EAT, for every active shipment unless that shipment overrides it."
              checked={sel.daily_report_enabled !== false}
              onCheckedChange={(enabled) => {
                apiFetch(`/v1/customers/${sel.id}`, { method: 'PATCH', body: JSON.stringify({ daily_report_enabled: enabled }) })
                  .then(() => { setSelected(prev => prev ? { ...prev, daily_report_enabled: enabled } : prev); setCustomers(cs => cs.map(x => x.id === sel.id ? { ...x, daily_report_enabled: enabled } : x)); })
                  .catch(err => showAlert(err.message || 'Failed to update daily report setting'));
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 20 }}>
            {/* Recent shipments */}
            <div className="crm-card">
              <div className="crm-card-header">
                <span className="crm-card-title">Recent Shipments</span>
                <button type="button" onClick={() => setMainTab('shipments')} style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>View all →</button>
              </div>
              {shipLoading ? (
                <SectionLoading />
              ) : custShipments.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
                  <Icon name="ship" size={28} strokeWidth={1.25} />
                  <div style={{ fontSize: 13, marginTop: 8 }}>No shipments yet</div>
                </div>
              ) : custShipments.slice(0, 6).map(s => (
                <Link key={s.id} to={`/clearos/clearance/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="ship" size={14} color="var(--teal)" strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ref_number || 'CLR-???'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{s.goods_desc || 'No description'}</div>
                  </div>
                  <Badge variant={s.stage === 'RELEASED' || s.stage === 'CLOSED' ? 'success' : s.stage === 'CUSTOMS' ? 'warning' : 'info'} className="text-[11px] font-semibold">
                    {s.stage || 'DRAFT'}
                  </Badge>
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                </Link>
              ))}
            </div>

            {/* Info card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="crm-card" style={{ padding: '18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 14 }}>Key Information</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Contact Person', value: sel.contact_name },
                    { label: 'Email', value: sel.email },
                    { label: 'Phone / WhatsApp', value: sel.phone_wa },
                    { label: 'TIN Number', value: sel.tax_id, mono: true },
                    { label: 'Preferred Port', value: sel.preferred_port },
                    { label: 'Freight Terms', value: sel.freight_terms },
                    { label: 'Credit Terms', value: sel.credit_days ? `Net ${sel.credit_days} days` : undefined },
                  ].map(({ label, value, mono }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 12.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--mono)' : 'var(--font)', textAlign: 'right', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="crm-card" style={{ padding: '18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 12 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const itemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' as const, textDecoration: 'none', width: '100%' };
                    const hoverHandlers = {
                      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--white)'),
                      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--bg)'),
                    };
                    const actions: { label: string; icon: IconName; path?: string; action?: () => void }[] = [
                      { label: 'Create Invoice',    icon: 'fileText'   as IconName, path: `/billing?customer_id=${sel.id}&new=1` },
                      { label: 'Add Shipment',      icon: 'ship'       as IconName, action: () => setMainTab('shipments') },
                      { label: 'Record Payment',    icon: 'creditCard' as IconName, action: () => { setMainTab('finance'); setFinanceTab('payments'); } },
                      { label: 'Generate Statement',icon: 'barChart'   as IconName, action: () => { setMainTab('finance'); setFinanceTab('statement'); } },
                    ];
                    return (
                      <>
                        <ComposeEmailButton subjectType="customer" subjectId={sel.id} onSent={() => setMainTab('activity')}>
                          <button type="button" style={itemStyle} {...hoverHandlers}>
                            <Icon name="mail" size={13} color="var(--teal)" strokeWidth={1.75} /> Send Email
                          </button>
                        </ComposeEmailButton>
                        <StartCallButton subjectType="customer" subjectId={sel.id} phone={sel.phone_wa} onLogged={() => setMainTab('activity')}>
                          <button type="button" style={itemStyle} {...hoverHandlers}>
                            <Icon name="phone" size={13} color="var(--teal)" strokeWidth={1.75} /> Start Call
                          </button>
                        </StartCallButton>
                        {actions.map(action => action.path ? (
                          <Link key={action.label} to={action.path} style={itemStyle} {...hoverHandlers}>
                            <Icon name={action.icon} size={13} color="var(--teal)" strokeWidth={1.75} /> {action.label}
                          </Link>
                        ) : (
                          <button key={action.label} type="button" onClick={action.action} style={itemStyle} {...hoverHandlers}>
                            <Icon name={action.icon} size={13} color="var(--teal)" strokeWidth={1.75} /> {action.label}
                          </button>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <CustomFieldsPanel entityType="customer" subjectId={sel.id} heading="Custom Fields" />
          </div>
        </div>
      );
    }

    /* ── Activity — real chronological history (calls, emails, meetings,
        stage changes), shared with Leads/Deals, backed by crm_activities
        (migration 449). Previously the only CRM subject type this wasn't
        wired to, despite the backend already supporting 'customer'. ── */
    if (mainTab === 'activity') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <ActivityTimeline subjectType="customer" subjectId={sel.id} />
        </div>
      );
    }

    /* ── Profile ── */
    if (mainTab === 'profile') {
      if (!editMode) {
        return (
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}>
              {!sel.organization_name && (
                <button type="button" onClick={handleSendClaimCode} disabled={sendingClaimCode}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: sendingClaimCode ? 'default' : 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                  title="Send a one-time code this customer can enter in their own organization portal to self-link, instead of picking an Organization here yourself.">
                  <Icon name="link" size={14} strokeWidth={1.75} /> {sendingClaimCode ? 'Sending…' : 'Send Claim Code'}
                </button>
              )}
              <button type="button" onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="edit" size={14} strokeWidth={1.75} /> Edit Profile
              </button>
            </div>

            {/* Company Information */}
            <Section title="Company Information">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="Company Name" value={sel.name} />
                <ViewField label="Email" value={sel.email} />
                <ViewField label="Phone / WhatsApp" value={sel.phone_wa} />
                <ViewField label="Contact Person" value={sel.contact_name} />
                <ViewField label="Website" value={sel.website} />
                <ViewField label="Client Type" value={sel.client_type} />
                <ViewField label="Currency" value={sel.currency || 'TZS'} />
                <ViewField label="Credit Terms" value={sel.credit_days ? `Net ${sel.credit_days} days` : 'Cash on Delivery'} />
                <ViewField label="Linked Organization" value={sel.organization_name} />
              </div>
            </Section>

            <Section title="Tax & Compliance">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="TIN Number" value={sel.tax_id} mono />
                <ViewField label="VAT / VRN Number" value={sel.vat_number} mono />
                <ViewField label="Import License No." value={sel.import_license} mono />
              </div>
            </Section>

            <Section title="Address">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="Street Address" value={sel.address} />
                <ViewField label="City / Town" value={sel.city} />
                <ViewField label="Country" value={sel.country} />
              </div>
            </Section>

            <Section title="Clearing & Forwarding">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                <ViewField label="Preferred Port" value={sel.preferred_port} />
                <ViewField label="Default Freight Terms" value={sel.freight_terms} />
                <ViewField label="Primary Commodity" value={sel.commodity_type} />
                <ViewField label="TANCIS Registration" value={sel.tancis_number} mono />
              </div>
            </Section>
          </div>
        );
      }

      /* Edit mode */
      return (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <Section title="Company Information">
              <div className="prof-grid">
                <div className="prof-field full"><label className="prof-label">Company Name *</label><input className="prof-input" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
                <div className="prof-field"><label className="prof-label">Email</label><input className="prof-input" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="prof-field"><label className="prof-label">Phone / WhatsApp</label><input className="prof-input" value={form.phone_wa || ''} onChange={e => setForm(p => ({ ...p, phone_wa: e.target.value }))} placeholder="+255..." /></div>
                <div className="prof-field"><label className="prof-label">Contact Person</label><input className="prof-input" value={form.contact_name || ''} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
                <div className="prof-field"><label className="prof-label">Website</label><input className="prof-input" value={form.website || ''} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} placeholder="https://" /></div>
                <div className="prof-field"><label className="prof-label">Client Type</label>
                  <Select value={form.client_type || '__none__'} onValueChange={v => setForm(p => ({ ...p, client_type: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select type…</SelectItem>
                      <SelectItem value="Importer">Importer</SelectItem>
                      <SelectItem value="Exporter">Exporter</SelectItem>
                      <SelectItem value="Importer & Exporter">Importer & Exporter</SelectItem>
                      <SelectItem value="Manufacturer">Manufacturer</SelectItem>
                      <SelectItem value="Trader">Trader</SelectItem>
                      <SelectItem value="Embassy / NGO">Embassy / NGO</SelectItem>
                      <SelectItem value="Government Agency">Government Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Currency</label>
                  <Select value={form.currency || 'TZS'} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                      <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Credit Terms</label>
                  <Select value={form.credit_days || '__none__'} onValueChange={v => setForm(p => ({ ...p, credit_days: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select terms…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select terms…</SelectItem>
                      <SelectItem value="0">Cash on Delivery</SelectItem>
                      <SelectItem value="15">Net 15 days</SelectItem>
                      <SelectItem value="30">Net 30 days</SelectItem>
                      <SelectItem value="45">Net 45 days</SelectItem>
                      <SelectItem value="60">Net 60 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field full">
                  <EntityPicker
                    label="Linked Organization"
                    value={form.organization_id ? { id: form.organization_id, label: form.organization_name || 'Linked organization' } : null}
                    onChange={item => setForm(p => ({ ...p, organization_id: item?.id, organization_name: item?.label }))}
                    search={async q => {
                      const res = await apiFetch(`/v1/organizations?q=${encodeURIComponent(q)}`).catch(() => []);
                      return (Array.isArray(res) ? res : []).map((o: any) => ({ id: o.id, label: o.name, sublabel: o.tax_id ? `TIN ${o.tax_id}` : undefined }));
                    }}
                    onCreate={async name => {
                      const created = await apiFetch('/v1/organizations', { method: 'POST', body: JSON.stringify({ name }) });
                      return { id: created.id, label: created.name };
                    }}
                    placeholder="Search or create an organization…"
                    hint="Links this customer to one shared identity across every tenant serving them — for a company also served by another clearing agent on Hudumika."
                  />
                </div>
              </div>
            </Section>

            <Section title="Tax & Compliance">
              <div className="prof-grid">
                <div className="prof-field"><label className="prof-label">TIN Number</label><input className="prof-input" value={form.tax_id || ''} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} placeholder="xxx-xxx-xxx" style={{ fontFamily: 'var(--mono)' }} /></div>
                <div className="prof-field"><label className="prof-label">VAT / VRN Number</label><input className="prof-input" value={form.vat_number || ''} onChange={e => setForm(p => ({ ...p, vat_number: e.target.value }))} placeholder="10-xxxxxxx-x" style={{ fontFamily: 'var(--mono)' }} /></div>
                <div className="prof-field"><label className="prof-label">Import License No.</label><input className="prof-input" value={form.import_license || ''} onChange={e => setForm(p => ({ ...p, import_license: e.target.value }))} placeholder="TBS/IMP/..." /></div>
              </div>
            </Section>

            <Section title="Address">
              <div className="prof-grid">
                <div className="prof-field full"><label className="prof-label">Street Address</label><input className="prof-input" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
                <div className="prof-field"><label className="prof-label">City / Town</label><input className="prof-input" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Dar es Salaam" /></div>
                <div className="prof-field"><label className="prof-label">Country</label>
                  <Select value={form.country || 'Tanzania'} onValueChange={v => setForm(p => ({ ...p, country: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Tanzania','Kenya','Uganda','Rwanda','Burundi','Zambia','Malawi','Mozambique','DRC Congo','Ethiopia','Other'].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <Section title="Clearing & Forwarding">
              <div className="prof-grid">
                <div className="prof-field"><label className="prof-label">Preferred Port</label>
                  <Select value={form.preferred_port || '__none__'} onValueChange={v => setForm(p => ({ ...p, preferred_port: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select port…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select port…</SelectItem>
                      <SelectItem value="DSM">Dar es Salaam (DSM)</SelectItem>
                      <SelectItem value="MOM">Mombasa (MOM)</SelectItem>
                      <SelectItem value="TNG">Tanga (TNG)</SelectItem>
                      <SelectItem value="ARU">Arusha Dry Port</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Default Freight Terms</label>
                  <Select value={form.freight_terms || '__none__'} onValueChange={v => setForm(p => ({ ...p, freight_terms: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select terms…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select terms…</SelectItem>
                      <SelectItem value="CIF">CIF — Cost, Insurance, Freight</SelectItem>
                      <SelectItem value="FOB">FOB — Free on Board</SelectItem>
                      <SelectItem value="EXW">EXW — Ex Works</SelectItem>
                      <SelectItem value="DDP">DDP — Delivered Duty Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">Primary Commodity</label>
                  <Select value={form.commodity_type || '__none__'} onValueChange={v => setForm(p => ({ ...p, commodity_type: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select category…</SelectItem>
                      {['General Merchandise','Food & Agriculture','Electronics & ICT','Machinery & Equipment','Chemicals & Pharmaceuticals','Motor Vehicles & Parts','Construction Materials'].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="prof-field"><label className="prof-label">TANCIS Registration</label><input className="prof-input" value={form.tancis_number || ''} onChange={e => setForm(p => ({ ...p, tancis_number: e.target.value }))} placeholder="TANCIS importer code…" style={{ fontFamily: 'var(--mono)' }} /></div>
              </div>
            </Section>
          </div>
          <div style={{ padding: '12px 28px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--white)', flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setForm({ ...selected }); setEditMode(false); }}>Discard Changes</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      );
    }

    /* ── Contacts ── */
    if (mainTab === 'contacts') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Contact Persons</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddContact(true)}>+ Add Contact</button>
          </div>

          {sel.contact_name ? (
            <div style={{ marginBottom: 14 }}>
            <SectionCard padded={false}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                <Avatar name={sel.contact_name} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{sel.contact_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Primary Contact</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    {sel.email && (
                      <a href={`mailto:${sel.email}`} style={{ fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                        {sel.email}
                      </a>
                    )}
                    {sel.phone_wa && (
                      <a href={`https://wa.me/${sel.phone_wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12.5, color: 'var(--ink2)', fontFamily: 'var(--mono)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink2)')}>
                        {sel.phone_wa}
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="badge badge-teal" style={{ fontSize: 9.5 }}>PRIMARY</span>
                  <button type="button" aria-label="Edit contact"
                    onClick={() => { setContactForm({ name: sel.contact_name || '', email: sel.email || '', phone: sel.phone_wa || '', role: 'Primary Contact' }); setShowAddContact(true); }}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', cursor: 'pointer', fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    Edit
                  </button>
                </div>
              </div>
            </SectionCard>
            </div>
          ) : (
            <EmptyState icon="users" title="No contacts added" sub="Add contact persons for this customer" />
          )}

          {/* Add / Edit Contact modal */}
          {showAddContact && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 440, padding: 24, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>{contactForm.name ? 'Edit Contact' : 'Add Contact Person'}</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); }}>×</button>
                </div>
                <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Full Name *',    key: 'name',  placeholder: 'John Doe',            required: true  },
                    { label: 'Email',          key: 'email', placeholder: 'john@company.co.tz',  required: false },
                    { label: 'Phone / WhatsApp', key: 'phone', placeholder: '+255712345678',     required: false },
                    { label: 'Role / Title',   key: 'role',  placeholder: 'Procurement Manager', required: false },
                  ].map(({ label, key, placeholder, required }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>{label}</label>
                      <input type="text" className="input-field" placeholder={placeholder} required={required}
                        value={(contactForm as any)[key]}
                        onChange={e => setContactForm(p => ({ ...p, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); }}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={contactSaving}>{contactSaving ? 'Saving…' : 'Save Contact'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Notes ── */
    if (mainTab === 'notes') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Internal Notes</span>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Only visible to your team</span>
          </div>
          <textarea className="prof-input" style={{ height: 220, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.7 }} placeholder={`Add internal notes about ${sel.name} — payment behavior, preferences, special instructions…`} value={notes} onChange={e => setNotes(e.target.value)} />
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{notes.length} characters</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveNote} disabled={noteSaving}>
              {noteSaving ? 'Saving…' : 'Save Notes'}
            </button>
          </div>
        </div>
      );
    }

    /* ── Finance ── */
    if (mainTab === 'finance') {
      const FIN_TABS = [
        { key: 'invoices',     label: 'Invoices'     },
        { key: 'payments',     label: 'Payments'     },
        { key: 'statement',    label: 'Statement'    },
        { key: 'proposals',    label: 'Proposals'    },
        { key: 'credit-notes', label: 'Credit Notes' },
        { key: 'expenses',     label: 'Expenses'     },
      ];

      const custExpenses = expenses.filter(e => e.customer_id === sel.id);

      const totalInvoiced = custInvoices.reduce((s: number, i: any) => s + invoiceTotals(mapApiInvoice(i)).grandTotalTZS, 0);
      const totalPaid     = custPayments.reduce((s: number, p: any) => s + (parseFloat(p.amount ?? 0)), 0);
      const totalCredited = custCreditNotes.filter((c: any) => c.status === 'POSTED')
        .reduce((s: number, c: any) => s + (c.items ?? []).reduce((ls: number, l: any) => ls + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0), 0);
      const outstanding   = totalInvoiced - totalPaid - totalCredited;

      const INV_STATUS: Record<string, { bg: string; color: string }> = {
        paid:     { bg: 'var(--green-l)', color: 'var(--green)' },
        unpaid:   { bg: 'var(--gold-l)',        color: 'var(--gold)'       },
        overdue:  { bg: 'var(--red-l)',   color: 'var(--red)'    },
        draft:    { bg: 'var(--bg)',      color: 'var(--ink3)'   },
        partial:  { bg: 'var(--purple-l)',        color: 'var(--purple)'       },
      };

      return (
        <div>
          <SubTabBar tabs={FIN_TABS} active={financeTab} onChange={setFinanceTab} />

          {/* Invoices */}
          {financeTab === 'invoices' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  {finLoading ? 'Loading…' : `${custInvoices.length} invoice${custInvoices.length !== 1 ? 's' : ''}`}
                </span>
                <Link to={`/billing?customer_id=${sel.id}&new=1`} className="btn btn-primary btn-sm">+ Create Invoice</Link>
              </div>
              {finLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading invoices…</div>}
              {!finLoading && custInvoices.length === 0 && (
                <div style={{ padding: '32px 28px' }}>
                  <EmptyState icon="fileText" title="No invoices yet" sub="Invoices issued to this customer will appear here" />
                </div>
              )}
              {!finLoading && custInvoices.length > 0 && (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th className="col-hide-sm">Date</th>
                        <th className="col-hide-sm">Due</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custInvoices.map((inv: any) => {
                        const st = (inv.status || 'draft').toLowerCase();
                        const sc = INV_STATUS[st] || INV_STATUS.draft;
                        return (
                          <tr key={inv.id}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', fontFamily: 'var(--mono)' }}>{inv.invoice_number || inv.ref || `INV-${inv.id?.slice(-5)}`}</div>
                              {inv.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{inv.description}</div>}
                            </td>
                            <td className="col-hide-sm">{inv.bill_date ? new Date(inv.bill_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="col-hide-sm">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', textAlign: 'right' }}>{invoiceTotals(mapApiInvoice(inv)).grandTotalTZS.toLocaleString()}</td>
                            <td style={{ textAlign: 'center' }}><span style={{ padding: '3px 10px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{st.charAt(0).toUpperCase() + st.slice(1)}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Payments */}
          {financeTab === 'payments' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  {finLoading ? 'Loading…' : `${custPayments.length} payment${custPayments.length !== 1 ? 's' : ''}`}
                </span>
                <Link to={`/billing?customer_id=${sel.id}`} className="btn btn-primary btn-sm">+ Record Payment</Link>
              </div>
              {finLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading payments…</div>}
              {!finLoading && custPayments.length === 0 && (
                <div style={{ padding: '32px 28px' }}>
                  <EmptyState icon="creditCard" title="No payments recorded" sub="Payments received from this customer will appear here" />
                </div>
              )}
              {!finLoading && custPayments.length > 0 && (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th className="col-hide-sm">Date</th>
                        <th className="col-hide-sm">Method</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custPayments.map((p: any) => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{p.invoice_number || `PAY-${p.id?.slice(-5)}`}</td>
                          <td className="col-hide-sm">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td className="col-hide-sm">{p.payment_method || p.method || '—'}</td>
                          <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)', textAlign: 'right' }}>+{Number(p.amount ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Statement */}
          {financeTab === 'statement' && (() => {
            // Balance is computed chronologically (oldest first) regardless
            // of display order, so each row's figure is the true running
            // balance at that point — then displayed newest-first, matching
            // every other list on this tab, with the balance already baked
            // into each row rather than recomputed for the reversed order.
            const creditNoteTotal = (cn: any) => (cn.items ?? []).reduce((s: number, l: any) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0);
            const chronological = [
              ...custInvoices.map((i: any) => ({ type: 'invoice' as const, date: i.bill_date, ref: i.invoice_number || `INV-${i.id?.slice(-5)}`, amount: invoiceTotals(mapApiInvoice(i)).grandTotalTZS, debit: true })),
              ...custPayments.map((p: any) => ({ type: 'payment' as const, date: p.payment_date, ref: p.invoice_number || `PAY-${p.id?.slice(-5)}`, amount: parseFloat(p.amount ?? 0), debit: false })),
              ...custCreditNotes.filter((c: any) => c.status === 'POSTED').map((c: any) => ({ type: 'credit note' as const, date: c.credit_date, ref: c.credit_note_number, amount: creditNoteTotal(c), debit: false })),
            ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
            let bal = 0;
            const withBalance = chronological.map(tx => { bal += tx.debit ? tx.amount : -tx.amount; return { ...tx, balance: bal }; });
            const transactions = [...withBalance].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

            return (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Statement of Account</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm"
                    disabled={transactions.length === 0}
                    onClick={() => selected && openStatementPrintWindow(selected, transactions, { totalInvoiced, totalPaid, outstanding })}>
                    <Icon name="printer" size={13} /> Print Statement
                  </button>
                  <button type="button" className="btn btn-primary btn-sm"
                    onClick={() => selected && apiDownload(`/v1/customers/${selected.id}/statement/pdf`, `statement-${selected.name}.pdf`).catch((err: any) => showAlert(err.message || 'Download failed'))}>
                    <Icon name="download" size={13} /> Download PDF
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
                {[
                  { label: 'Total Invoiced', value: totalInvoiced, color: 'var(--navy)' },
                  { label: 'Total Paid',     value: totalPaid,     color: 'var(--green)' },
                  { label: 'Outstanding',    value: outstanding,   color: outstanding > 0 ? 'var(--red)' : 'var(--green)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{s.value.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>TZS</div>
                  </div>
                ))}
              </div>
              {transactions.length === 0 ? (
                <EmptyState icon="barChart" title="No financial activity" sub="Invoices and payments will build your statement" />
              ) : (
                <SectionCard padded={false} title="Transaction History">
                  {transactions.map((tx, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', gap: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: tx.debit ? 'var(--red-l)' : 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={tx.debit ? 'fileText' : 'creditCard'} size={14} color={tx.debit ? 'var(--red)' : 'var(--green)'} strokeWidth={1.75} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{tx.ref}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1, textTransform: 'capitalize' }}>{tx.type}</div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{tx.date ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: tx.debit ? 'var(--red)' : 'var(--green)', width: 130, textAlign: 'right' }}>{tx.debit ? '-' : '+'}{tx.amount.toLocaleString()}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: tx.balance >= 0 ? 'var(--ink)' : 'var(--red)', width: 130, textAlign: 'right' }}>{tx.balance.toLocaleString()}</span>
                    </div>
                  ))}
                </SectionCard>
              )}
            </div>
            );
          })()}

          {/* Expenses */}
          {financeTab === 'expenses' && (
            custExpenses.length > 0 ? (
              <div>
                <div style={{ display: 'flex', padding: '12px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)' }}>
                  <div style={{ flex: 2 }}>Description</div>
                  <div style={{ flex: 1 }}>Date</div>
                  <div style={{ flex: 1 }}>Category</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Amount (TZS)</div>
                </div>
                {custExpenses.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.name}</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{e.date.split('T')[0]}</div>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink3)' }}>{e.category}</span></div>
                    <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: e.is_revenue ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{e.is_revenue ? '+' : '-'}{(e.amount || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px 28px' }}><EmptyState icon="receipt" title="No expenses" sub="Expenses linked to this customer will appear here" /></div>
            )
          )}

          {/* Proposals — placeholder (no proposal-tracking feature exists yet) */}
          {financeTab === 'proposals' && (
            <div style={{ padding: '32px 28px' }}>
              <EmptyState icon="clipboard" title="No proposals" sub="Quotations sent as proposals will appear here" />
            </div>
          )}

          {/* Credit Notes — real data (credit-notes.routes.ts) */}
          {financeTab === 'credit-notes' && (
            custCreditNotes.length === 0 ? (
              <div style={{ padding: '32px 28px' }}>
                <EmptyState icon="minusCircle" title="No credit notes" sub="Issued credit notes will appear here" />
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', padding: '12px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)' }}>
                  <div style={{ flex: 1 }}>Number</div>
                  <div style={{ flex: 1 }}>Date</div>
                  <div style={{ flex: 2 }}>Reason</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Amount</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Status</div>
                </div>
                {custCreditNotes.map((c: any) => {
                  const total = (c.items ?? []).reduce((s: number, l: any) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0);
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                      <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.credit_note_number}</div>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{c.credit_date ? new Date(c.credit_date).toLocaleDateString('en-GB') : '—'}</div>
                      <div style={{ flex: 2, fontSize: 12.5, color: 'var(--ink2)' }}>{c.reason || '—'}</div>
                      <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--red)', textAlign: 'right' }}>-{total.toLocaleString()}</div>
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r)', background: c.status === 'VOID' ? 'var(--red-l)' : 'var(--green-l)', color: c.status === 'VOID' ? 'var(--red)' : 'var(--green)' }}>{c.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      );
    }

    /* ── Shipments ── */
    if (mainTab === 'shipments') {
      const SHIP_TABS = [
        { key: 'shipments',    label: 'Shipments & B/L' },
        { key: 'declarations', label: 'Declarations'    },
        { key: 'containers',   label: 'Containers'      },
        { key: 'demurrage',    label: 'Demurrage'       },
        { key: 'permits',      label: 'Permits'         },
      ];

      if (shipTab === 'shipments') {
        return (
          <div>
            <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
            <div style={{ padding: '0 0 20px' }}>
              {shipLoading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Loading shipments…</div>}
              {!shipLoading && custShipments.length === 0 && <div style={{ padding: '24px 28px' }}><EmptyState icon="ship" title="No shipments recorded" sub="Shipments assigned to this customer will appear here" /></div>}
              {!shipLoading && custShipments.map(s => (
                <div key={s.id} className="cust-ship-row">
                  <span className="csr-ref">{s.ref_number || 'CLR-???'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="csr-desc">{s.goods_desc || 'No description'}</div>
                    {s.bl_number && <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 1 }}>B/L: {s.bl_number}</div>}
                  </div>
                  <Badge variant={s.stage === 'RELEASED' || s.stage === 'CLOSED' ? 'success' : s.stage === 'CUSTOMS' ? 'warning' : 'info'} className="text-[11px] font-semibold">
                    {s.stage || 'DRAFT'}
                  </Badge>
                  <span className="csr-date">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (shipTab === 'declarations') {
        const withDecl = custShipments.filter(s => s.tansad_number);
        return (
          <div>
            <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
            <div style={{ padding: '20px 28px' }}>
              {shipLoading && <SectionLoading />}
              {!shipLoading && withDecl.length === 0 && <EmptyState icon="stamp" title="No declarations yet" sub="TANSAD / entry numbers will appear once registered" />}
              {!shipLoading && withDecl.map(s => (
                <div key={s.id} className="decl-block">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{s.tansad_number}</span>
                    <Badge variant={s.stage === 'RELEASED' || s.stage === 'CLOSED' ? 'success' : s.stage === 'CUSTOMS' ? 'warning' : 'info'} className="text-[11px] font-semibold">
                      {s.stage || 'DRAFT'}
                    </Badge>
                  </div>
                  <div className="decl-grid">
                    <div className="decl-kv"><span className="decl-k">Reference</span><span className="decl-v">{s.ref_number}</span></div>
                    <div className="decl-kv"><span className="decl-k">Goods</span><span className="decl-v">{s.goods_desc || '—'}</span></div>
                    <div className="decl-kv"><span className="decl-k">B/L Number</span><span className="decl-v mono">{s.bl_number || '—'}</span></div>
                    <div className="decl-kv"><span className="decl-k">Date</span><span className="decl-v">{fmtDateShort(s.created_at)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      const shipMeta: Record<string, { icon: IconName; text: string; sub: string }> = {
        containers: { icon: 'package', text: 'No containers', sub: 'Container tracking records will appear here' },
        demurrage:  { icon: 'timer',   text: 'No demurrage charges', sub: 'Container free-day tracking will appear here' },
        permits:    { icon: 'award',   text: 'No permits', sub: 'Import/export permit records' },
      };
      const sm = shipMeta[shipTab] || shipMeta.containers;
      return (
        <div>
          <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
          <div style={{ padding: '32px 28px' }}><EmptyState icon={sm.icon} title={sm.text} sub={sm.sub} /></div>
        </div>
      );
    }

    /* ── Supply Chain ── */
    if (mainTab === 'supply') {
      const SUPPLY_TABS = [
        { key: 'projects', label: 'Projects' },
        { key: 'tasks',    label: 'Tasks'    },
        { key: 'tickets',  label: 'Tickets'  },
      ];

      const TICKET_STATUS: Record<string, { bg: string; color: string }> = {
        open:        { bg: 'var(--blue-l)', color: 'var(--blue)' },
        in_progress: { bg: 'var(--teal-l)', color: 'var(--teal)' },
        resolved:    { bg: 'var(--green-l)', color: 'var(--green)' },
        closed:      { bg: 'var(--bg)', color: 'var(--ink3)' },
        escalated:   { bg: 'var(--red-l)', color: 'var(--red)' },
      };

      return (
        <div>
          <SubTabBar tabs={SUPPLY_TABS} active={supplyTab} onChange={setSupplyTab} />

          {/* Tickets — loaded from API */}
          {supplyTab === 'tickets' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  {supplyLoading ? 'Loading…' : `${custTickets.length} ticket${custTickets.length !== 1 ? 's' : ''}`}
                </span>
                <Link to="/support/tickets" className="btn btn-primary btn-sm">+ New Ticket</Link>
              </div>
              {supplyLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading tickets…</div>}
              {!supplyLoading && custTickets.length === 0 && (
                <div style={{ padding: '32px 28px' }}>
                  <EmptyState icon="headphones" title="No support tickets" sub="Support tickets from this customer will appear here" />
                </div>
              )}
              {!supplyLoading && custTickets.length > 0 && custTickets.map((t: any) => {
                const st = (t.status || 'open').toLowerCase().replace(' ', '_');
                const sc = TICKET_STATUS[st] || TICKET_STATUS.open;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="headphones" size={14} color="var(--blue)" strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || t.title || `Ticket #${t.id?.slice(-5)}`}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{t.category || 'General'} · {t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {(t.status || 'Open').replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Projects & Tasks — placeholder */}
          {(supplyTab === 'projects' || supplyTab === 'tasks') && (
            <div style={{ padding: '32px 28px' }}>
              <EmptyState
                icon={supplyTab === 'projects' ? 'layers' : 'check'}
                title={supplyTab === 'projects' ? 'No projects' : 'No tasks'}
                sub={supplyTab === 'projects' ? 'Supply chain projects for this client' : 'Open tasks assigned to this account'}
              />
            </div>
          )}
        </div>
      );
    }

    /* ── Bonded Storage (SEAL cross-app link) ── */
    if (mainTab === 'seal') {
      const SEAL_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
        FOREIGN_DUTY_SUSPENDED: { bg: 'var(--teal-l)', color: 'var(--teal)' },
        FOREIGN_DUTY_PAID: { bg: 'var(--blue-l)', color: 'var(--blue)' },
        EXPORTED: { bg: 'var(--green-l)', color: 'var(--green)' },
        SEIZED: { bg: 'var(--red-l)', color: 'var(--red)' },
        ABANDONED: { bg: 'var(--red-l)', color: 'var(--red)' },
      };
      const totalAtRisk = custSealLots.reduce((s: number, l: any) => s + (l.dutyAtRisk || 0) + (l.taxAtRisk || 0), 0);
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Bonded Warehouse Lots (SEAL)</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
              {sealLoading ? 'Loading…' : `${custSealLots.length} lot${custSealLots.length !== 1 ? 's' : ''} · ${totalAtRisk.toLocaleString()} at risk`}
            </span>
          </div>
          {sealLoading ? (
            <SectionLoading />
          ) : custSealLots.length === 0 ? (
            <EmptyState icon="package" title="No bonded lots" sub="Lots this customer owns in SEAL's bonded warehouse ledger will appear here" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {custSealLots.map((l: any) => {
                const style = SEAL_STATUS_COLOR[l.customsStatus] || { bg: 'var(--bg)', color: 'var(--ink2)' };
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{l.description}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                        {l.qtyOnHand.toLocaleString()} {l.uom}{l.entryReference ? ` · ${l.entryReference}` : ''}
                        {l.expiresOn ? ` · storage expires ${fmtDateShort(l.expiresOn)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {(l.dutyAtRisk > 0 || l.taxAtRisk > 0) && (
                        <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{(l.dutyAtRisk + l.taxAtRisk).toLocaleString()} {l.currency ?? ''} at risk</span>
                      )}
                      <span style={{ padding: '3px 10px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>
                        {l.customsStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ── Documents — a filtered view into Drive, not a separate store.
       Files live in cloud_files (tagged entity_type='customer'), so
       "Upload" lands a new file straight in Drive, and "Link existing
       file" tags a file the user already has sitting in Drive. ── */
    if (mainTab === 'documents') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Documents</span>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Files linked from Drive — the same storage as the Drive app, filtered to this customer.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={openCustomerDrive} disabled={resolvingFolder}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: resolvingFolder ? 'default' : 'pointer', opacity: resolvingFolder ? 0.6 : 1 }}>
                <Icon name="externalLink" size={13} /> {resolvingFolder ? 'Opening…' : 'Open Drive'}
              </button>
              <button type="button" onClick={() => setShowLinkFileModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                <Icon name="link" size={13} /> Link Existing File
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px solid var(--teal)', borderRadius: 'var(--r)', background: fileUploading ? 'var(--ink3)' : 'hsl(var(--primary))', borderColor: fileUploading ? 'var(--ink3)' : 'var(--teal)', color: fileUploading ? '#fff' : 'hsl(var(--primary-foreground))', fontSize: 12.5, fontWeight: 600, cursor: fileUploading ? 'default' : 'pointer', fontFamily: 'var(--font)' }}>
                <Icon name="upload" size={13} strokeWidth={2} />
                {fileUploading ? 'Uploading…' : 'Upload to Drive'}
                <input type="file" multiple disabled={fileUploading} style={{ display: 'none' }}
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    if (files.length) await uploadFilesToDrive(files);
                  }} />
              </label>
            </div>
          </div>

          {/* Drop zone */}
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: '28px 24px', textAlign: 'center', color: 'var(--ink3)', margin: '18px 0', background: 'var(--bg)' }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.background = 'var(--teal-l)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
            onDrop={async e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--bg)';
              const files = Array.from(e.dataTransfer.files);
              if (files.length) await uploadFilesToDrive(files);
            }}>
            <Icon name="upload" size={24} strokeWidth={1.25} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 8 }}>Drop files here to upload straight into Drive</div>
            <div style={{ fontSize: 11.5, marginTop: 3 }}>Linked to {sel.name} automatically</div>
          </div>

          {filesLoading && <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading documents…</div>}
          {!filesLoading && linkedFiles.length === 0 && (
            <EmptyState icon="folder" title="No documents linked yet" sub="Upload a new file or link one already sitting in Drive" />
          )}
          {!filesLoading && linkedFiles.length > 0 && (
            <SectionCard padded={false}>
              {linkedFiles.map((f: any, i: number) => {
                const ft = fileTypeStyle(f.type);
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < linkedFiles.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={ft.icon} size={16} color={ft.color} strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                        {f.size != null ? `${(f.size / 1024).toFixed(1)} KB · ` : ''}{new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {f.owner_name}
                      </div>
                    </div>
                    <button type="button" onClick={() => apiDownload(`/v1/files/${f.id}/download`, f.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="download" size={13} /> Download
                    </button>
                    <button type="button" onClick={() => unlinkFile(f.id, f.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                      title="Remove from this customer (file stays in Drive)" aria-label={`Remove ${f.name} from this customer`}>
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                );
              })}
            </SectionCard>
          )}

          {/* Link existing file modal */}
          {showLinkFileModal && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowLinkFileModal(false); setFileSearch(''); setFileSearchResults([]); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 480, padding: 24, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Link a file from Drive</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowLinkFileModal(false); setFileSearch(''); setFileSearchResults([]); }}>×</button>
                </div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" className="input-field" placeholder="Search files by name…" autoFocus
                    style={{ paddingLeft: 32 }}
                    value={fileSearch} onChange={e => setFileSearch(e.target.value)} />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {fileSearching && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Searching…</div>}
                  {!fileSearching && fileSearch.trim() && fileSearchResults.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No matching files in Drive</div>
                  )}
                  {!fileSearching && !fileSearch.trim() && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Type to search every file in your Drive</div>
                  )}
                  {fileSearchResults.map(f => {
                    const ft = fileTypeStyle(f.type);
                    const alreadyLinked = f.entity_type === 'customer' && f.entity_id === sel.id;
                    return (
                      <button key={f.id} type="button" disabled={alreadyLinked || fileLinking === f.id}
                        onClick={() => linkExistingFile(f.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 8px', border: 'none', borderRadius: 'var(--r)', background: 'none', cursor: alreadyLinked ? 'default' : 'pointer', fontFamily: 'var(--font)' }}
                        onMouseEnter={e => { if (!alreadyLinked) e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <div style={{ width: 28, height: 28, borderRadius: 'var(--r)', background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={ft.icon} size={14} color={ft.color} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{f.size != null ? `${(f.size / 1024).toFixed(1)} KB` : ''}</div>
                        </div>
                        {alreadyLinked
                          ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>Linked</span>
                          : fileLinking === f.id
                            ? <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Linking…</span>
                            : <Icon name="link" size={13} color="var(--teal)" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Signatures ── */
    if (mainTab === 'signatures') {
      const envelopeBadgeVariant = (status: string): 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info' => {
        // Same semantic mapping SignInbox.tsx's own envelopeBadgeVariant
        // uses (not exported from that file, so mirrored here rather than
        // reached into) — keep the two in sync if the status set changes.
        const map: Record<string, 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
          draft: 'gray', sent: 'info', completed: 'success', voided: 'error', declined: 'error', expired: 'gray',
        };
        return map[status] ?? 'gray';
      };
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Signatures</span>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Documents sent to {sel.name} for signature via Hudumika Sign.</div>
            </div>
            <button type="button" onClick={() => setShowSendSignModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px solid var(--teal)', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 }}>
              <Icon name="stamp" size={13} strokeWidth={2} /> Send for Signature
            </button>
          </div>

          {signLoading && <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading signatures…</div>}
          {!signLoading && custSignEnvelopes.length === 0 && (
            <EmptyState icon="stamp" title="No documents sent yet" sub="Send a file already linked in Documents for this customer to sign" />
          )}
          {!signLoading && custSignEnvelopes.length > 0 && (
            <SectionCard padded={false}>
              {custSignEnvelopes.map((e: any, i: number) => (
                <Link key={e.id} to={`/sign/envelope/${e.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < custSignEnvelopes.length - 1 ? '1px solid var(--bg)' : 'none', cursor: 'pointer' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="stamp" size={16} color="var(--teal)" strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                        {new Date(e.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {e.recipients?.[0]?.status === 'signed' && e.status === 'completed' ? ' · Signed' : ''}
                      </div>
                    </div>
                    <Badge variant={envelopeBadgeVariant(e.status)}>{e.status}</Badge>
                  </div>
                </Link>
              ))}
            </SectionCard>
          )}

          {/* Send for signature modal — same "pick from Drive" shape as
              "Link Existing File" on the Documents tab above, deliberately
              mirrored rather than reinvented. */}
          {showSendSignModal && (
            <div className="modal-overlay" onClick={ev => { if (ev.target === ev.currentTarget) { setShowSendSignModal(false); setSignFileSearch(''); setSignFileSearchResults([]); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 480, padding: 24, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Send a file for signature</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowSendSignModal(false); setSignFileSearch(''); setSignFileSearchResults([]); }}>×</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
                  {sel.email ? `Sent to ${sel.name} · ${sel.email}` : 'This customer has no email on file — add one before sending.'}
                </div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" className="input-field" placeholder="Search files by name…" autoFocus
                    style={{ paddingLeft: 32 }}
                    value={signFileSearch} onChange={ev => setSignFileSearch(ev.target.value)} />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {signFileSearching && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Searching…</div>}
                  {!signFileSearching && signFileSearch.trim() && signFileSearchResults.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No matching files in Drive</div>
                  )}
                  {!signFileSearching && !signFileSearch.trim() && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Type to search every file in your Drive</div>
                  )}
                  {signFileSearchResults.map(f => {
                    const ft = fileTypeStyle(f.type);
                    return (
                      <button key={f.id} type="button" disabled={!sel.email || sendingForSignature === f.id}
                        onClick={() => sendFileForSignature(f)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 8px', border: 'none', borderRadius: 'var(--r)', background: 'none', cursor: !sel.email ? 'default' : 'pointer', fontFamily: 'var(--font)' }}
                        onMouseEnter={ev => { if (sel.email) ev.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}>
                        <div style={{ width: 28, height: 28, borderRadius: 'var(--r)', background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={ft.icon} size={14} color={ft.color} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{f.size != null ? `${(f.size / 1024).toFixed(1)} KB` : ''}</div>
                        </div>
                        {sendingForSignature === f.id
                          ? <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Sending…</span>
                          : <Icon name="stamp" size={13} color="var(--teal)" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Hero header ── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: '20px 28px 0' }}>

          {/* Back link */}
          <button type="button" onClick={() => setView('list')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)', fontWeight: 600, marginBottom: 16, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink3)')}>
            <Icon name="chevronDown" size={13} color="var(--ink3)" style={{ transform: 'rotate(90deg)' }} /> Back to Customers
          </button>

          {/* Main hero row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <AvatarPicker id={sel.id} kind="customers" name={sel.name} size={72} shape="square" />

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: 0, letterSpacing: '-0.3px' }}>{sel.name}</h1>
                <StatusBadge status={status} />
                {sel.client_type && (
                  <span style={{ padding: '2px 9px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: 'var(--bg)', color: 'var(--ink2)', border: '1px solid var(--border)' }}>{sel.client_type}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 16 }}>
                Member since {new Date(sel.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                {(sel.city || sel.country) && ` · ${[sel.city, sel.country].filter(Boolean).join(', ')}`}
                {sel.email && ` · ${sel.email}`}
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <HeroStat icon="ship" label="Shipments" value={shipCount || 0} color="var(--blue)" bg="var(--blue-l)" />
                <HeroStat icon="anchor" label="Preferred Port" value={sel.preferred_port || 'Not set'} muted={!sel.preferred_port} color="var(--teal)" bg="var(--teal-l)" />
                <HeroStat icon="truck" label="Freight Terms" value={sel.freight_terms || 'Not set'} muted={!sel.freight_terms} color="var(--gold)" bg="var(--gold-l)" />
                <HeroStat icon="creditCard" label="Credit Terms" value={sel.credit_days ? `Net ${sel.credit_days}d` : 'COD'} color="var(--green)" bg="var(--green-l)" />
                <HeroStat icon="shield" label="TIN" value={maskTin(sel.tax_id) || 'Not set'} muted={!sel.tax_id} color="var(--purple)" bg="var(--purple-l)" />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <ComposeEmailButton subjectType="customer" subjectId={sel.id} onSent={() => setMainTab('activity')}>
                <button type="button" style={btnS}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                  <Icon name="mail" size={13} strokeWidth={1.75} /> Email
                </button>
              </ComposeEmailButton>
              <button type="button" style={btnS}
                onClick={() => { const p = sel.phone_wa?.replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                <Icon name="send" size={13} strokeWidth={1.75} /> WhatsApp
              </button>
              <Link to={`/shipments?customer_id=${sel.id}`}
                style={{ ...btnS, background: 'hsl(var(--primary))', border: 'none', color: 'hsl(var(--primary-foreground))', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                + New Shipment
              </Link>
            </div>
          </div>
        </div>

        {/* Horizontal tabs */}
        <Tabs value={mainTab} onValueChange={v => { setMainTab(v as typeof mainTab); setEditMode(false); }} variant="segmented" style={{ margin: '14px 28px 16px' }}>
          <TabsList>
            {MAIN_TABS.map(tab => {
              const active = mainTab === tab.key;
              return (
                <TabsTrigger key={tab.key} value={tab.key}>
                  <Icon name={tab.icon} size={13} color={active ? 'var(--teal)' : 'var(--ink3)'} strokeWidth={1.75} />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        {renderTabContent()}
      </div>
    </div>
  );
};

/* ── Section card wrapper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionCard title={title}>{children}</SectionCard>
    </div>
  );
}

/* ── Sub-tab bar ── */
function SubTabBar({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
      {tabs.map(t => (
        <button key={t.key} type="button" onClick={() => onChange(t.key)}
          style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: active === t.key ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: active === t.key ? 'var(--teal-l)' : 'var(--bg)', color: active === t.key ? 'var(--teal)' : 'var(--ink2)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 20px', color: 'var(--ink3)' }}>
      <div style={{ width: 56, height: 56, borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={24} strokeWidth={1.25} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink2)' }}>{title}</div>
      <div style={{ fontSize: 12.5 }}>{sub}</div>
    </div>
  );
}

/* ── Pagination button ── */
function PagBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ minWidth: 32, height: 32, padding: '0 8px', border: active ? 'none' : '1.5px solid var(--border)', borderRadius: 'var(--r)', background: active ? 'var(--navy)' : disabled ? 'var(--bg)' : 'var(--card-bg, var(--white))', color: active ? 'var(--white)' : disabled ? 'var(--ink3)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}>
      {label}
    </button>
  );
}
