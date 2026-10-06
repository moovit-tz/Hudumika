import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import type { IconName } from '../../components/Icon.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Tip } from '../../components/ui/tooltip.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { AvatarPicker } from '../../components/AvatarPicker.js';
import { mapApiInvoice, invoiceTotals } from '../Billing.js';
import type { ExpenseListItem } from '../Expenses.js';
import { showAlert } from '../../lib/alert.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '../../components/ui/dialog.js';
import { SkeletonPage } from '../../components/ui/skeleton.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { getCompany } from '../../data/companyStore.js';
import { ActivityTimeline } from '../../components/crm/ActivityTimeline.js';
import { ComposeEmailButton } from '../../components/crm/ComposeEmailButton.js';
import { StartCallButton } from '../../components/crm/StartCallButton.js';
import { CustomFieldsPanel } from '../../components/crm/CustomFieldsPanel.js';
import type { Customer } from './customer-types.js';
import { fmtDateShort, maskTin } from './customer-types.js';
import './CustomerDetailPage.css';

/* ── Statement of Account — print/PDF ── */
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

function envelopeBadgeVariant(status: string): 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info' {
  const map: Record<string, 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
    draft: 'gray', sent: 'info', completed: 'success', voided: 'error', declined: 'error', expired: 'gray',
  };
  return map[status] ?? 'gray';
}

const MAIN_TABS = [
  { key: 'overview',   label: 'Overview',              icon: 'grid'          as IconName },
  { key: 'finance',    label: 'Commercial & Finance',  icon: 'barChart'      as IconName },
  { key: 'shipments',  label: 'Logistics & Cargo',     icon: 'ship'          as IconName },
  { key: 'contacts',   label: 'Key Contacts',          icon: 'users'         as IconName },
  { key: 'documents',  label: 'Documents Vault',       icon: 'folder'        as IconName },
  { key: 'signatures', label: 'E-Sign Contracts',      icon: 'stamp'         as IconName },
  { key: 'tickets',    label: 'Support Tickets',       icon: 'lifeBuoy'      as IconName },
  { key: 'profile',    label: 'Profile & Terms',       icon: 'fileText'      as IconName },
];

/* ── TIN chip with 1-click copy ── */
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
    <Tip label={copied ? 'Copied to clipboard!' : `TIN: ${tin} — click to copy`} side="top">
      <div onClick={handleCopy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.04em', background: 'var(--teal-l)', borderRadius: 'var(--r-sm)', padding: '1px 4px' }}>TIN</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--ink)' }}>{masked}</span>
        {copied
          ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>✓</span>
          : <Icon name="copy" size={11} style={{ color: 'var(--ink3)', opacity: 0.65 }} />}
      </div>
    </Tip>
  );
}

/* ── Status badge ── */
const STATUS_VARIANT: Record<string, 'success' | 'gray' | 'error'> = {
  Active: 'success', Inactive: 'gray', Suspended: 'error',
};

/* ── View field helper ── */
function ViewField({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--font)' : 'inherit', fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CustomerDetailPage (Hudumika CRM Design System)
══════════════════════════════════════════ */
export const CustomerDetailPage: React.FC = () => {
  const { id, tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [selected, setSelected] = useState<Customer | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<'not_found' | 'forbidden' | null>(null);
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);

  useEffect(() => {
    apiFetch('/v1/finance/expenses').then((res: any) => setExpenses(res?.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setFetchLoading(true);
    apiFetch(`/v1/customers/${id}`)
      .then((res: any) => { setSelected(res); setForm({ ...res }); setFetchError(null); })
      .catch((e: any) => {
        const status = e?.status ?? e?.statusCode ?? (typeof e?.message === 'string' && e.message.includes('403') ? 403 : 404);
        setFetchError(status === 403 ? 'forbidden' : 'not_found');
      })
      .finally(() => setFetchLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Tab state ── */
  const [mainTab, setMainTab] = useState(() => {
    const t = tabParam || 'overview';
    if (t === 'supply' || t === 'seal') return 'shipments';
    if (t === 'activity' || t === 'notes') return 'overview';
    return t;
  });
  const [financeTab, setFinanceTab] = useState('invoices');
  const [shipTab, setShipTab] = useState('all');

  useEffect(() => {
    if (!tabParam) return;
    let resolved = tabParam;
    if (resolved === 'supply' || resolved === 'seal') resolved = 'shipments';
    else if (resolved === 'activity' || resolved === 'notes') resolved = 'overview';
    if (resolved !== mainTab) setMainTab(resolved);
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (v: string) => {
    setMainTab(v);
    setEditMode(false);
    navigate(`/crm/customers/${id}/${v}`, { replace: true });
  };

  /* ── Profile edit ── */
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);

  /* ── Shipments ── */
  const [custShipments, setCustShipments] = useState<any[]>([]);
  const [shipLoading, setShipLoading] = useState(false);

  /* ── Deals / Pipeline ── */
  const [custDeals, setCustDeals] = useState<any[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);


  /* ── Finance ── */
  const [custInvoices, setCustInvoices] = useState<any[]>([]);
  const [custPayments, setCustPayments] = useState<any[]>([]);
  const [custCreditNotes, setCustCreditNotes] = useState<any[]>([]);
  const [custQuotations, setCustQuotations] = useState<any[]>([]);
  const [finLoading, setFinLoading] = useState(false);

  /* ── Supply chain & Support ── */
  const [custTickets, setCustTickets] = useState<any[]>([]);
  const [supplyLoading, setSupplyLoading] = useState(false);

  /* ── Documents ── */
  const [linkedFiles, setLinkedFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [customerFolder, setCustomerFolder] = useState<{ customerId: string; id: string; drive_id: string; name: string; parent: { id: string; name: string } | null } | null>(null);
  const [resolvingFolder, setResolvingFolder] = useState(false);
  const [showLinkFileModal, setShowLinkFileModal] = useState(false);

  /* ── Signatures ── */
  const [custSignEnvelopes, setCustSignEnvelopes] = useState<any[]>([]);
  const [signLoading, setSignLoading] = useState(false);
  const [showSendSignModal, setShowSendSignModal] = useState(false);

  /* ── Portal invite ── */
  const [inviteStatus, setInviteStatus] = useState<{ state: 'active' | 'invited' | 'none'; email?: string; expires_at?: string } | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  /* ── Contacts ── */
  const [custContacts, setCustContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [contactSaving, setContactSaving] = useState(false);

  /* ── Action Modals ── */
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /* Link Document modal */
  const [linkDocFile, setLinkDocFile] = useState<File | null>(null);
  const [linkDocUploading, setLinkDocUploading] = useState(false);
  const linkDocInputRef = React.useRef<HTMLInputElement>(null);
  /* Dispatch Agreement modal */
  const [dispatchTitle, setDispatchTitle] = useState('');
  const [dispatchEmail, setDispatchEmail] = useState('');
  const [dispatchSending, setDispatchSending] = useState(false);

  /* ── Data Loaders ── */
  const loadShipments = useCallback(async (customerId: string) => {
    setShipLoading(true);
    try {
      const res = await apiFetch(`/v1/shipments?customer_id=${customerId}&limit=50`);
      setCustShipments(res.data ?? res ?? []);
    } catch { setCustShipments([]); } finally { setShipLoading(false); }
  }, []);

  const loadDeals = useCallback(async (customerId: string) => {
    setDealsLoading(true);
    try {
      const res = await apiFetch(`/v1/deals?customer_id=${customerId}`).catch(() => []);
      setCustDeals(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { setCustDeals([]); } finally { setDealsLoading(false); }
  }, []);

  useEffect(() => {
    if (selected) {
      loadShipments(selected.id);
      loadDeals(selected.id);
    }
  }, [selected, loadShipments, loadDeals]);

  useEffect(() => {
    if (!selected) { setInviteStatus(null); return; }
    apiFetch(`/v1/customers/${selected.id}/invite-status`)
      .then((res: any) => setInviteStatus(res))
      .catch(() => setInviteStatus(null));
  }, [selected]);

  const loadFinance = useCallback(async (customerId: string) => {
    setFinLoading(true);
    try {
      const [inv, pay, cn, quot] = await Promise.all([
        apiFetch(`/v1/invoices?customer_id=${customerId}`).catch(() => []),
        apiFetch(`/v1/payments?customer_id=${customerId}`).catch(() => []),
        apiFetch(`/v1/credit-notes?customer_id=${customerId}`).catch(() => []),
        apiFetch(`/v1/quotations?customer_id=${customerId}`).catch(() => []),
      ]);
      setCustInvoices(Array.isArray(inv) ? inv : (inv?.data ?? []));
      setCustPayments(Array.isArray(pay) ? pay : (pay?.data ?? []));
      setCustCreditNotes(Array.isArray(cn) ? cn : (cn?.data ?? []));
      setCustQuotations(Array.isArray(quot) ? quot : (quot?.data ?? []));
    } catch { /* empty */ } finally { setFinLoading(false); }
  }, []);

  useEffect(() => {
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
    if (selected) loadTickets(selected.id);
  }, [selected, loadTickets]);

  const loadFiles = useCallback(async (customerId: string) => {
    setFilesLoading(true);
    try {
      const res = await apiFetch(`/v1/files/customer-files/${customerId}`).catch(() => []);
      setLinkedFiles(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { setLinkedFiles([]); } finally { setFilesLoading(false); }
  }, []);

  useEffect(() => {
    if (selected) loadFiles(selected.id);
  }, [selected, loadFiles]);

  const loadSignatures = useCallback(async (customerId: string) => {
    setSignLoading(true);
    try {
      const res = await apiFetch(`/v1/sign/envelopes?customer_id=${customerId}`).catch(() => []);
      setCustSignEnvelopes(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { setCustSignEnvelopes([]); } finally { setSignLoading(false); }
  }, []);

  useEffect(() => {
    if (selected) loadSignatures(selected.id);
  }, [selected, loadSignatures]);

  const loadContacts = useCallback(async (customerId: string) => {
    setContactsLoading(true);
    try {
      const res = await apiFetch(`/v1/customers/${customerId}/contacts`).catch(() => []);
      setCustContacts(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { setCustContacts([]); } finally { setContactsLoading(false); }
  }, []);

  useEffect(() => {
    if (selected) loadContacts(selected.id);
  }, [selected, loadContacts]);

  /* ── Calculations & Metrics ── */
  const customerFinancials = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let outstanding = 0;

    for (const inv of custInvoices) {
      const mapped = mapApiInvoice(inv);
      const totals = invoiceTotals(mapped);
      const totalAmount = totals.grandTotalTZS;
      const amountPaid = mapped.received || 0;
      const bal = totalAmount - amountPaid;
      totalInvoiced += totalAmount;
      totalPaid += amountPaid;
      if (mapped.status !== 'Paid') {
        outstanding += Math.max(0, bal);
      }
    }
    return { totalInvoiced, totalPaid, outstanding };
  }, [custInvoices]);

  const statementTransactions = useMemo(() => {
    const list: { type: 'invoice' | 'payment' | 'credit note'; date: string; ref: string; amount: number; debit: boolean; balance: number }[] = [];
    for (const inv of custInvoices) {
      const mapped = mapApiInvoice(inv);
      const totals = invoiceTotals(mapped);
      list.push({ type: 'invoice', date: inv.issue_date || inv.created_at || '', ref: inv.invoice_number || inv.id, amount: totals.grandTotalTZS, debit: true, balance: 0 });
    }
    for (const p of custPayments) {
      list.push({ type: 'payment', date: p.payment_date || p.created_at || '', ref: p.payment_number || p.reference || p.id, amount: Number(p.amount || 0), debit: false, balance: 0 });
    }
    for (const cn of custCreditNotes) {
      list.push({ type: 'credit note', date: cn.issue_date || cn.created_at || '', ref: cn.credit_note_number || cn.id, amount: Number(cn.total_amount || 0), debit: false, balance: 0 });
    }
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = 0;
    for (const item of list) {
      bal = item.debit ? bal - item.amount : bal + item.amount;
      item.balance = bal;
    }
    return list;
  }, [custInvoices, custPayments, custCreditNotes]);

  const activeShipmentsCount = useMemo(() => {
    return custShipments.filter(s => !['DELIVERED', 'CLOSED', 'CANCELLED'].includes((s.stage || s.status || '').toUpperCase())).length;
  }, [custShipments]);

  const tenureYears = useMemo(() => {
    if (!selected?.created_at) return 'New';
    const diff = Date.now() - new Date(selected.created_at).getTime();
    const yrs = diff / (365.25 * 24 * 3600 * 1000);
    return yrs < 0.1 ? 'Joined recently' : `${yrs.toFixed(1)} yrs`;
  }, [selected?.created_at]);

  /* ── Save Profile Changes ── */
  const handleSaveProfile = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/v1/customers/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setSelected(updated);
      setEditMode(false);
      showAlert('Customer profile updated.', { variant: 'success' });
    } catch (e: any) {
      showAlert(e?.message || 'Could not save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete Account ── */
  const handleDeleteCustomer = async () => {
    if (!selected) return;
    try {
      await apiFetch(`/v1/customers/${selected.id}`, { method: 'DELETE' });
      showAlert('Customer removed from CRM directory.', { variant: 'info' });
      navigate('/crm/customers', { replace: true });
    } catch (e: any) {
      showAlert(e?.message || 'Could not delete customer.');
    }
  };

  /* ── Open Cloud Drive Folder ── */
  const handleOpenDriveFolder = async () => {
    if (!selected) return;
    setResolvingFolder(true);
    try {
      const folder = await apiFetch(`/v1/files/customer-folder/${selected.id}`);
      setCustomerFolder(folder);
      const qs = new URLSearchParams({ drive: folder.drive_id, folder: folder.id, name: folder.name });
      if (folder.parent) { qs.set('parentId', folder.parent.id); qs.set('parentName', folder.parent.name); }
      window.open(`/cloud?${qs.toString()}`, '_blank', 'noopener');
    } catch (e: any) {
      showAlert(e?.message || 'Could not open Cloud Drive folder.');
    } finally {
      setResolvingFolder(false);
    }
  };

  if (fetchLoading) {
    return <SkeletonPage variant="detail" />;
  }

  if (fetchError === 'forbidden') {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Icon name="lock" size={32} strokeWidth={1.5} style={{ color: 'var(--ink3)' }} />
        <h2 style={{ fontSize: 20, color: 'var(--ink)', marginTop: 12 }}>Access Restricted</h2>
        <p style={{ color: 'var(--ink3)', marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>
          You don't have permission to view this customer profile. Contact your workspace administrator if you believe this is an error.
        </p>
        <Button variant="outline" onClick={() => navigate('/crm/customers')} style={{ marginTop: 20 }}>
          Return to Customers Directory
        </Button>
      </div>
    );
  }

  if (!selected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Icon name="search" size={32} strokeWidth={1.5} style={{ color: 'var(--ink3)' }} />
        <h2 style={{ fontSize: 20, color: 'var(--ink)', marginTop: 12 }}>Customer Not Found</h2>
        <p style={{ color: 'var(--ink3)', marginTop: 8 }}>The requested account could not be found or has been removed.</p>
        <Button variant="default" onClick={() => navigate('/crm/customers')} style={{ marginTop: 16 }}>
          Return to Customers Directory
        </Button>
      </div>
    );
  }

  const sel = selected;
  const custPhone = sel.phone || sel.phone_wa || '';

  return (
    <div className="cust-detail-root">

      {/* ── Breadcrumbs & Quick Bar ── */}
      <div className="cust-breadcrumbs-bar">
        <div className="cust-breadcrumbs-path">
          <Link to="/crm/overview">CRM</Link>
          <span>/</span>
          <Link to="/crm/customers">Customers</Link>
          <span>/</span>
          <span className="cust-breadcrumbs-current">{sel.name}</span>
        </div>
        <Link to="/crm/customers" className="cust-back-btn">
          <Icon name="arrowLeft" size={13} />
          <span>All Customers</span>
        </Link>
      </div>

      {/* ── UNIFIED MASTER COMPANY HERO CARD (Hudumika Design System) ── */}
      <div className="cust-master-hero">
        <div className="cust-hero-header">

          {/* Left: Identity Cluster */}
          <div className="cust-hero-identity">
            <div className="cust-avatar-frame">
              <AvatarPicker
                id={sel.id}
                kind="customers"
                name={sel.name}
                size={64}
                shape="square"
                onChange={async (dataUrl: string | null) => {
                  try {
                    await apiFetch(`/v1/customers/${sel.id}`, { method: 'PUT', body: JSON.stringify({ avatar_url: dataUrl }) });
                    setSelected(prev => prev ? { ...prev, avatar_url: dataUrl || undefined } : prev);
                    showAlert('Company logo updated.', { variant: 'success' });
                  } catch { showAlert('Could not update logo.'); }
                }}
              />
              <div className="cust-verified-badge" title="Verified CRM Account">
                <Icon name="check" size={12} strokeWidth={2.5} />
              </div>
            </div>

            <div className="cust-hero-details">
              <div className="cust-title-row">
                <h1 className="cust-company-title">{sel.name}</h1>
                <Badge variant={STATUS_VARIANT[sel.status || sel.account_status || 'Active'] || 'success'}>
                  {sel.status || sel.account_status || 'Active'}
                </Badge>
                {sel.classification && (
                  <span className="cust-classification-chip">
                    <Icon name="star" size={10} />
                    {sel.classification}
                  </span>
                )}
                {sel.sector && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>
                    {sel.sector}
                  </span>
                )}
              </div>

              <div className="cust-subtitle-row">
                {sel.account_manager_name ? (
                  <span className="cust-owner-chip">
                    <PersonAvatar name={sel.account_manager_name} size={18} />
                    <span>Manager: <strong>{sel.account_manager_name}</strong></span>
                  </span>
                ) : (
                  <span>Account Manager: <strong style={{ color: 'var(--ink2)' }}>Operations Team</strong></span>
                )}
                <span>&middot;</span>
                <span>Currency: <strong style={{ color: 'var(--ink)' }}>{sel.currency || 'TZS'}</strong></span>
                <span>&middot;</span>
                <span>Terms: <strong style={{ color: 'var(--ink)' }}>{sel.payment_terms || sel.credit_days || 'Net 30'}</strong></span>
                <span>&middot;</span>
                <span>Client since <strong style={{ color: 'var(--ink)' }}>{tenureYears}</strong></span>
              </div>

              <div className="cust-meta-chips-row">
                {custPhone && (
                  <span className="cust-meta-chip">
                    <Icon name="phone" size={13} style={{ color: 'var(--ink3)' }} />
                    <a href={`tel:${custPhone}`}>{custPhone}</a>
                  </span>
                )}
                {sel.email && (
                  <span className="cust-meta-chip">
                    <Icon name="mail" size={13} style={{ color: 'var(--ink3)' }} />
                    <a href={`mailto:${sel.email}`}>{sel.email}</a>
                  </span>
                )}
                {(sel.city || sel.country) && (
                  <span className="cust-meta-chip">
                    <Icon name="mapPin" size={13} style={{ color: 'var(--ink3)' }} />
                    <span>{[sel.city, sel.country].filter(Boolean).join(', ')}</span>
                  </span>
                )}
                {sel.tax_id && (
                  <span className="cust-meta-chip">
                    <TinChip tin={sel.tax_id} />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="cust-hero-actions">
            <ComposeEmailButton subjectType="customer" subjectId={sel.id}>
              <Button variant="outline" size="sm">
                <Icon name="mail" size={14} />
                <span>Email</span>
              </Button>
            </ComposeEmailButton>

            <StartCallButton subjectType="customer" subjectId={sel.id} phone={custPhone}>
              <Button variant="outline" size="sm">
                <Icon name="phone" size={14} />
                <span>Call</span>
              </Button>
            </StartCallButton>

            {custPhone && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://wa.me/${custPhone.replace(/[^0-9]/g, '')}`, '_blank', 'noopener')}
                title="Send WhatsApp message"
              >
                <Icon name="messageSquare" size={14} style={{ color: 'var(--green)' }} />
                <span>WhatsApp</span>
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Icon name="edit" size={14} />
              <span>Edit</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" style={{ padding: '0 8px' }}>
                  <Icon name="moreHorizontal" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShareModalOpen(true)}>
                  <Icon name="share" size={14} />
                  <span>Share Profile Link</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openStatementPrintWindow(sel, statementTransactions, customerFinancials)}>
                  <Icon name="printer" size={14} />
                  <span>Statement PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenDriveFolder}>
                  <Icon name="folder" size={14} />
                  <span>Open Cloud Drive</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowInviteDialog(true)}>
                  <Icon name="send" size={14} />
                  <span>Customer Portal Invite</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setDeleteModalOpen(true)} style={{ color: 'var(--red)' }}>
                  <Icon name="trash" size={14} />
                  <span>Delete Account</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Live 6-KPI Executive Ribbon */}
        <div className="cust-hero-kpi-bar">
          <div className="cust-kpi-item">
            <div className="cust-kpi-top">
              <span className="cust-kpi-label">Total Invoiced</span>
              <Icon name="fileText" size={14} style={{ color: 'var(--ink3)' }} />
            </div>
            <div className="cust-kpi-val">TZS {Math.round(customerFinancials.totalInvoiced).toLocaleString()}</div>
            <div className="cust-kpi-sub">Lifetime billing</div>
          </div>

          <div className="cust-kpi-item">
            <div className="cust-kpi-top">
              <span className="cust-kpi-label">Collected Revenue</span>
              <Icon name="check" size={14} style={{ color: 'var(--green)' }} />
            </div>
            <div className="cust-kpi-val is-green">TZS {Math.round(customerFinancials.totalPaid).toLocaleString()}</div>
            <div className="cust-kpi-sub">
              {customerFinancials.totalInvoiced > 0
                ? `${((customerFinancials.totalPaid / customerFinancials.totalInvoiced) * 100).toFixed(0)}% recovery rate`
                : '100% in good standing'}
            </div>
          </div>

          <div className="cust-kpi-item">
            <div className="cust-kpi-top">
              <span className="cust-kpi-label">Outstanding Balance</span>
              <Icon name="alertTriangle" size={14} style={{ color: customerFinancials.outstanding > 0 ? 'var(--red)' : 'var(--ink3)' }} />
            </div>
            <div className={`cust-kpi-val ${customerFinancials.outstanding > 0 ? 'is-red' : 'is-green'}`}>
              TZS {Math.round(customerFinancials.outstanding).toLocaleString()}
            </div>
            <div className="cust-kpi-sub">{customerFinancials.outstanding > 0 ? 'Requires follow-up' : 'No overdue debt'}</div>
          </div>

          <div className="cust-kpi-item">
            <div className="cust-kpi-top">
              <span className="cust-kpi-label">Active Cargo</span>
              <Icon name="ship" size={14} style={{ color: 'var(--teal)' }} />
            </div>
            <div className="cust-kpi-val is-teal">{activeShipmentsCount} Shipments</div>
            <div className="cust-kpi-sub">In ClearOS tracking</div>
          </div>

          <div className="cust-kpi-item">
            <div className="cust-kpi-top">
              <span className="cust-kpi-label">Open Opportunities</span>
              <Icon name="trendingUp" size={14} style={{ color: 'var(--purple)' }} />
            </div>
            <div className="cust-kpi-val">{custDeals.length} Deals</div>
            <div className="cust-kpi-sub">Sales pipeline</div>
          </div>

          <div className="cust-kpi-item">
            <div className="cust-kpi-top">
              <span className="cust-kpi-label">Account Standing</span>
              <Icon name="shield" size={14} style={{ color: 'var(--green)' }} />
            </div>
            <div className="cust-kpi-val is-green">
              {customerFinancials.outstanding > 10000000 ? 'Review Needed' : 'Tier 1 Prime'}
            </div>
            <div className="cust-kpi-sub">{sel.payment_terms || 'Net 30'} approval</div>
          </div>
        </div>
      </div>

      {/* ── Sub-Navigation Tabs Strip ── */}
      <div className="cust-tab-nav">
        {MAIN_TABS.map(t => {
          const isActive = mainTab === t.key;
          let badgeCount: number | null = null;
          if (t.key === 'finance') badgeCount = custInvoices.length;
          else if (t.key === 'shipments') badgeCount = custShipments.length;
          else if (t.key === 'signatures') badgeCount = custSignEnvelopes.length;
          else if (t.key === 'tickets') badgeCount = custTickets.length;
          else if (t.key === 'documents') badgeCount = linkedFiles.length;

          return (
            <button
              key={t.key}
              type="button"
              className="cust-nav-btn"
              data-active={isActive ? 'true' : undefined}
              onClick={() => handleTabChange(t.key)}
            >
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
              {badgeCount !== null && badgeCount > 0 && (
                <span className="cust-nav-badge">{badgeCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT 1: OVERVIEW WORKSTATION ── */}
      {mainTab === 'overview' && (
        <div className="cust-workstation-grid">

          {/* Left Summary Rail */}
          <div className="cust-rail-col">

            {/* Card 1: Key Decision Maker / Stakeholder */}
            <div className="cust-widget-card">
              <div className="cust-widget-header">
                <h3 className="cust-widget-title">
                  <Icon name="user" size={15} style={{ color: 'var(--teal)' }} />
                  <span>Primary Stakeholder</span>
                </h3>
                <Button variant="ghost" size="xs" onClick={() => setShowAddContact(true)}>
                  <Icon name="plus" size={12} />
                  <span>Add</span>
                </Button>
              </div>
              <div className="cust-widget-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <PersonAvatar name={sel.contact_person || sel.contact_name || sel.name} size={42} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                      {sel.contact_person || sel.contact_name || 'Managing Director'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {sel.contact_role || 'Executive Representative'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                  {custPhone && (
                    <Button variant="outline" size="xs" onClick={() => window.open(`tel:${custPhone}`)} style={{ width: '100%', justifyContent: 'center' }}>
                      <Icon name="phone" size={12} />
                      <span>Call</span>
                    </Button>
                  )}
                  {sel.email && (
                    <Button variant="outline" size="xs" onClick={() => window.open(`mailto:${sel.email}`)} style={{ width: '100%', justifyContent: 'center' }}>
                      <Icon name="mail" size={12} />
                      <span>Email</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Commercial & Compliance Credentials */}
            <div className="cust-widget-card">
              <div className="cust-widget-header">
                <h3 className="cust-widget-title">
                  <Icon name="shield" size={15} style={{ color: 'var(--green)' }} />
                  <span>Commercial & Tax Credentials</span>
                </h3>
              </div>
              <div className="cust-widget-body">
                <div className="cust-kv-list">
                  <div className="cust-kv-row">
                    <span className="cust-kv-label">Legal Name</span>
                    <span className="cust-kv-val">{sel.name}</span>
                  </div>
                  <div className="cust-kv-row">
                    <span className="cust-kv-label">Tax ID (TIN)</span>
                    <span className="cust-kv-val"><TinChip tin={sel.tax_id} /></span>
                  </div>
                  <div className="cust-kv-row">
                    <span className="cust-kv-label">VAT / VRN</span>
                    <span className="cust-kv-val">{sel.vrn_number || sel.vat_number || 'Registered'}</span>
                  </div>
                  <div className="cust-kv-row">
                    <span className="cust-kv-label">Port of Clearance</span>
                    <span className="cust-kv-val">{sel.preferred_port || 'Dar es Salaam Port'}</span>
                  </div>
                  <div className="cust-kv-row">
                    <span className="cust-kv-label">Incoterms</span>
                    <span className="cust-kv-val">{sel.incoterms || sel.freight_terms || 'CIF / FOB'}</span>
                  </div>
                  <div className="cust-kv-row">
                    <span className="cust-kv-label">Invoicing Terms</span>
                    <span className="cust-kv-val">{sel.payment_terms || sel.credit_days || 'Net 30 Days'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Customer Portal & Automation Settings */}
            <div className="cust-widget-card">
              <div className="cust-widget-header">
                <h3 className="cust-widget-title">
                  <Icon name="lock" size={15} style={{ color: 'var(--purple)' }} />
                  <span>Portal & Automation</span>
                </h3>
                <Badge variant={inviteStatus?.state === 'active' ? 'success' : inviteStatus?.state === 'invited' ? 'warning' : 'gray'}>
                  {inviteStatus?.state === 'active' ? 'Portal Active' : inviteStatus?.state === 'invited' ? 'Invite Sent' : 'Portal Disabled'}
                </Badge>
              </div>
              <div className="cust-widget-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SwitchRow
                  title="Automated Monthly PDF Statement"
                  description="Email financial statement on 1st of every month"
                  checked={Boolean(sel.daily_report_enabled)}
                  onCheckedChange={async (v) => {
                    try {
                      const updated = await apiFetch(`/v1/customers/${sel.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ daily_report_enabled: v }),
                      });
                      setSelected(updated);
                      showAlert(v ? 'Monthly statement emails enabled.' : 'Monthly statement emails disabled.', { variant: 'success' });
                    } catch { showAlert('Could not update preference.'); }
                  }}
                />
                <SwitchRow
                  title="WhatsApp Milestone Notifications"
                  description="Send instant delivery & customs clearance alerts"
                  checked={Boolean(sel.whatsapp_alerts_enabled)}
                  onCheckedChange={async (v) => {
                    if (v && !custPhone) { showAlert('This customer has no phone number on file.'); return; }
                    try {
                      const updated = await apiFetch(`/v1/customers/${sel.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ whatsapp_alerts_enabled: v }),
                      });
                      setSelected(updated);
                      showAlert(v ? 'WhatsApp alerts enabled.' : 'WhatsApp alerts disabled.', { variant: 'success' });
                    } catch { showAlert('Could not update preference.'); }
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(true)} style={{ width: '100%', marginTop: 6 }}>
                  <Icon name="key" size={13} />
                  <span>Manage Portal Access</span>
                </Button>
              </div>
            </div>

            {/* Card 4: Custom Fields */}
            <div className="cust-widget-card">
              <div className="cust-widget-header">
                <h3 className="cust-widget-title">
                  <Icon name="layers" size={15} style={{ color: 'var(--ink3)' }} />
                  <span>Custom Attributes</span>
                </h3>
              </div>
              <div className="cust-widget-body">
                <CustomFieldsPanel entityType="customer" subjectId={sel.id} />
              </div>
            </div>

          </div>

          {/* Right Main Column */}
          <div className="cust-main-col">

            {/* Widget 1: Commercial & Invoicing Snapshot */}
            <div className="cust-widget-card">
              <div className="cust-pulse-header">
                <h3 className="cust-widget-title">
                  <Icon name="dollarSign" size={15} style={{ color: 'var(--green)' }} />
                  <span>Recent Commercial Transactions</span>
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="xs" onClick={() => handleTabChange('finance')}>
                    View All ({custInvoices.length})
                  </Button>
                  <Button variant="default" size="xs" onClick={() => navigate(`/billing/invoices/new?customer_id=${sel.id}`)}>
                    <Icon name="plus" size={12} />
                    <span>Create Invoice</span>
                  </Button>
                </div>
              </div>
              <div className="cust-widget-body is-flush">
                {custInvoices.length === 0 ? (
                  <div style={{ padding: '24px var(--page-pad-x, 16px)', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No invoices generated yet for this account.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="cust-mini-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Issue Date</th>
                          <th>Due Date</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {custInvoices.slice(0, 5).map(inv => {
                          const mapped = mapApiInvoice(inv);
                          const totals = invoiceTotals(mapped);
                          return (
                            <tr key={inv.id}>
                              <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                                <Link to={`/billing/invoices/${inv.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                                  {inv.invoice_number || `INV-${inv.id.slice(0, 6)}`}
                                </Link>
                              </td>
                              <td style={{ color: 'var(--ink2)' }}>{fmtDateShort(inv.issue_date || inv.created_at)}</td>
                              <td style={{ color: 'var(--ink2)' }}>{fmtDateShort(inv.due_date)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                                TZS {Math.round(totals.grandTotalTZS).toLocaleString()}
                              </td>
                              <td>
                                <Badge variant={mapped.status === 'Paid' ? 'success' : mapped.status === 'Overdue' ? 'error' : 'warning'}>
                                  {mapped.status}
                                </Badge>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <Button variant="ghost" size="xs" onClick={() => window.open(`/billing/invoices/${inv.id}`, '_blank')}>
                                  <Icon name="externalLink" size={12} />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Widget 3: Active Operations & Cargo (ClearOS) */}
            <div className="cust-widget-card">
              <div className="cust-pulse-header">
                <h3 className="cust-widget-title">
                  <Icon name="ship" size={15} style={{ color: 'var(--teal)' }} />
                  <span>Active Shipments & ClearOS Logistics</span>
                </h3>
                <Button variant="outline" size="xs" onClick={() => handleTabChange('shipments')}>
                  View All Shipments ({custShipments.length})
                </Button>
              </div>
              <div className="cust-widget-body is-flush">
                {custShipments.length === 0 ? (
                  <div style={{ padding: '24px var(--page-pad-x, 16px)', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No active cargo or shipments linked to this account.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="cust-mini-table">
                      <thead>
                        <tr>
                          <th>Shipment Ref</th>
                          <th>Description</th>
                          <th>Routing</th>
                          <th>Stage</th>
                          <th style={{ textAlign: 'right' }}>Telemetry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {custShipments.slice(0, 5).map(ship => (
                          <tr key={ship.id}>
                            <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                              <Link to={`/clearos/shipments/${ship.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                                {ship.ref_number || ship.reference || `SHP-${ship.id.slice(0, 6)}`}
                              </Link>
                            </td>
                            <td style={{ color: 'var(--ink)' }}>{ship.goods_desc || ship.description || 'General Cargo'}</td>
                            <td style={{ color: 'var(--ink2)', fontSize: 12 }}>
                              {ship.port_of_loading || 'Origin'} &rarr; {ship.port_of_discharge || 'Dar es Salaam'}
                            </td>
                            <td>
                              <span className={`cust-stage-pill stage-${ship.stage || 'BOOKING'}`}>
                                {ship.stage || 'BOOKING'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Button variant="ghost" size="xs" onClick={() => window.open(`/clearos/shipments/${ship.id}`, '_blank')}>
                                <Icon name="arrowRight" size={12} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Widget 4: Comprehensive Activity Stream */}
            <div className="cust-widget-card">
              <div className="cust-widget-header">
                <h3 className="cust-widget-title">
                  <Icon name="clock" size={15} style={{ color: 'var(--ink3)' }} />
                  <span>Interaction Timeline & Audit Stream</span>
                </h3>
              </div>
              <div className="cust-widget-body">
                <ActivityTimeline subjectType="customer" subjectId={sel.id} />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── TAB CONTENT 2: COMMERCIAL & FINANCE ── */}
      {mainTab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, background: 'var(--card-bg, var(--white))', padding: 4, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              {[
                { id: 'invoices', label: `Invoices (${custInvoices.length})` },
                { id: 'payments', label: `Payments (${custPayments.length})` },
                { id: 'statement', label: 'Statement of Account' },
                { id: 'quotes', label: `Quotes (${custQuotations.length})` },
                { id: 'credit', label: `Credit Notes (${custCreditNotes.length})` },
              ].map(st => (
                <Button
                  key={st.id}
                  variant={financeTab === st.id ? 'default' : 'ghost'}
                  size="xs"
                  onClick={() => setFinanceTab(st.id)}
                >
                  {st.label}
                </Button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => openStatementPrintWindow(sel, statementTransactions, customerFinancials)}>
                <Icon name="printer" size={14} />
                <span>Export Statement PDF</span>
              </Button>
              <Button variant="default" size="sm" onClick={() => navigate(`/billing/invoices/new?customer_id=${sel.id}`)}>
                <Icon name="plus" size={14} />
                <span>New Invoice</span>
              </Button>
            </div>
          </div>

          {financeTab === 'invoices' && (
            <SectionCard title="Invoices Ledger" padded={false}>
              {custInvoices.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No invoices found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cust-mini-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Bill Date</th>
                        <th>Due Date</th>
                        <th style={{ textAlign: 'right' }}>Total Amount</th>
                        <th style={{ textAlign: 'right' }}>Amount Paid</th>
                        <th style={{ textAlign: 'right' }}>Balance</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custInvoices.map(inv => {
                        const mapped = mapApiInvoice(inv);
                        const totals = invoiceTotals(mapped);
                        const totalAmount = totals.grandTotalTZS;
                        const amountPaid = mapped.received || 0;
                        const bal = totalAmount - amountPaid;
                        return (
                          <tr key={inv.id}>
                            <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                              <Link to={`/billing/invoices/${inv.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                                {inv.invoice_number || inv.id}
                              </Link>
                            </td>
                            <td>{fmtDateShort(inv.issue_date || inv.created_at)}</td>
                            <td>{fmtDateShort(inv.due_date)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>TZS {Math.round(totalAmount).toLocaleString()}</td>
                            <td style={{ textAlign: 'right', color: 'var(--green)', fontFamily: 'monospace' }}>TZS {Math.round(amountPaid).toLocaleString()}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: bal > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'monospace' }}>
                              TZS {Math.round(bal).toLocaleString()}
                            </td>
                            <td>
                              <Badge variant={mapped.status === 'Paid' ? 'success' : mapped.status === 'Overdue' ? 'error' : 'warning'}>
                                {mapped.status}
                              </Badge>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Button variant="ghost" size="xs" onClick={() => window.open(`/billing/invoices/${inv.id}`, '_blank')}>
                                <Icon name="externalLink" size={12} />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {financeTab === 'payments' && (
            <SectionCard title="Payments & Receipts" padded={false}>
              {custPayments.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No payments recorded.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cust-mini-table">
                    <thead>
                      <tr>
                        <th>Receipt / Payment Ref</th>
                        <th>Date</th>
                        <th>Payment Method</th>
                        <th style={{ textAlign: 'right' }}>Amount Received</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custPayments.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{p.payment_number || `PAY-${p.id.slice(0, 6)}`}</td>
                          <td>{fmtDateShort(p.payment_date || p.created_at)}</td>
                          <td>{p.payment_method || 'Bank Transfer'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace' }}>
                            TZS {Math.round(Number(p.amount || 0)).toLocaleString()}
                          </td>
                          <td style={{ color: 'var(--ink2)' }}>{p.reference || p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {financeTab === 'statement' && (
            <SectionCard title="Live Statement of Account Ledger" padded={false}>
              <div style={{ padding: '16px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Total Invoiced</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', fontFamily: 'monospace' }}>
                    TZS {Math.round(customerFinancials.totalInvoiced).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Total Paid</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)', fontFamily: 'monospace' }}>
                    TZS {Math.round(customerFinancials.totalPaid).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Current Balance</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: customerFinancials.outstanding > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'monospace' }}>
                    TZS {Math.round(customerFinancials.outstanding).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="cust-mini-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Transaction Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'right' }}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementTransactions.map((tx, idx) => (
                      <tr key={idx}>
                        <td>{fmtDateShort(tx.date)}</td>
                        <td style={{ fontWeight: 600 }}>{tx.ref}</td>
                        <td style={{ textTransform: 'capitalize' }}>{tx.type}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: tx.debit ? 'var(--red)' : 'var(--green)' }}>
                          {tx.debit ? '-' : '+'}TZS {Math.round(tx.amount).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: tx.balance < 0 ? 'var(--red)' : 'var(--ink)' }}>
                          TZS {Math.round(tx.balance).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {financeTab === 'quotes' && (
            <SectionCard title="Formal Quotations" padded={false}>
              {custQuotations.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No quotations found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cust-mini-table">
                    <thead>
                      <tr>
                        <th>Quote #</th>
                        <th>Valid Until</th>
                        <th style={{ textAlign: 'right' }}>Estimated Total</th>
                        <th>Status</th>
                        <th style={{ width: 48 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {custQuotations.map(q => (
                        <tr key={q.id}>
                          <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                            <Link to={`/billing/quotations/${q.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                              {q.quotation_number || q.id}
                            </Link>
                          </td>
                          <td>{fmtDateShort(q.valid_until)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                            TZS {Math.round(Number(q.total_amount || 0)).toLocaleString()}
                          </td>
                          <td><Badge variant="brand">{q.status || 'Sent'}</Badge></td>
                          <td>
                            <Button variant="ghost" size="xs" onClick={() => navigate(`/billing/quotations/${q.id}`)}>
                              <Icon name="externalLink" size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {financeTab === 'credit' && (
            <SectionCard title="Credit Notes" padded={false}>
              {custCreditNotes.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No credit notes issued.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cust-mini-table">
                    <thead>
                      <tr>
                        <th>Credit Note #</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Credit Amount</th>
                        <th>Reason</th>
                        <th style={{ width: 48 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {custCreditNotes.map(cn => (
                        <tr key={cn.id}>
                          <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                            <Link to={`/billing/credit-notes/${cn.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                              {cn.credit_note_number || cn.id}
                            </Link>
                          </td>
                          <td>{fmtDateShort(cn.issue_date || cn.created_at)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)', fontFamily: 'monospace' }}>
                            TZS {Math.round(Number(cn.total_amount || 0)).toLocaleString()}
                          </td>
                          <td style={{ color: 'var(--ink2)' }}>{cn.reason || '—'}</td>
                          <td>
                            <Button variant="ghost" size="xs" onClick={() => navigate(`/billing/credit-notes/${cn.id}`)}>
                              <Icon name="externalLink" size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

        </div>
      )}

      {/* ── TAB CONTENT 3: SHIPMENTS & LOGISTICS ── */}
      {mainTab === 'shipments' && (
        <SectionCard
          title="ClearOS Cargo & Clearance Registry"
          action={
            <Button variant="default" size="sm" onClick={() => navigate(`/clearos/shipments/new?customer_id=${sel.id}`)}>
              <Icon name="plus" size={14} />
              <span>Book New Shipment</span>
            </Button>
          }
          padded={false}
        >
          {custShipments.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              No shipments found for this customer.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cust-mini-table">
                <thead>
                  <tr>
                    <th>Ref #</th>
                    <th>Goods Description</th>
                    <th>Routing Corridor</th>
                    <th>B/L Number</th>
                    <th>Stage</th>
                    <th>Last Update</th>
                    <th style={{ textAlign: 'right' }}>Tracker</th>
                  </tr>
                </thead>
                <tbody>
                  {custShipments.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                        <Link to={`/clearos/shipments/${s.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                          {s.ref_number || s.reference || `SHP-${s.id.slice(0, 6)}`}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{s.goods_desc || s.description || 'General Cargo'}</td>
                      <td style={{ color: 'var(--ink2)', fontSize: 12.5 }}>
                        {s.port_of_loading || 'Origin'} &rarr; {s.port_of_discharge || 'Dar es Salaam'}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--ink2)' }}>{s.bl_number || '—'}</td>
                      <td>
                        <span className={`cust-stage-pill stage-${s.stage || 'BOOKING'}`}>
                          {s.stage || 'BOOKING'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmtDateShort(s.updated_at || s.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="xs" onClick={() => window.open(`/clearos/shipments/${s.id}`, '_blank')}>
                          <Icon name="externalLink" size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB CONTENT 4: KEY CONTACTS ── */}
      {mainTab === 'contacts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              Stakeholders & Authorized Contacts
            </h3>
            <Button variant="default" size="sm" onClick={() => setShowAddContact(true)}>
              <Icon name="plus" size={14} />
              <span>Add Key Contact</span>
            </Button>
          </div>

          {contactsLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>Loading contacts…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {/* Primary contact from master record */}
              {(sel.contact_person || sel.contact_name) && (
                <div className="cust-widget-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <PersonAvatar name={sel.contact_person || sel.contact_name || sel.name} size={44} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{sel.contact_person || sel.contact_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{sel.contact_role || 'Primary Contact'}</div>
                      </div>
                    </div>
                    <Badge variant="brand">Primary</Badge>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                    {custPhone && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)' }}><Icon name="phone" size={13} style={{ color: 'var(--ink3)' }} /><a href={`tel:${custPhone}`}>{custPhone}</a></div>}
                    {sel.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)' }}><Icon name="mail" size={13} style={{ color: 'var(--ink3)' }} /><a href={`mailto:${sel.email}`}>{sel.email}</a></div>}
                  </div>
                  {(sel.email || custPhone) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {sel.email && <Button variant="outline" size="xs" onClick={() => window.open(`mailto:${sel.email}`)} style={{ flex: 1 }}><Icon name="mail" size={12} /><span>Email</span></Button>}
                      {custPhone && <Button variant="outline" size="xs" onClick={() => window.open(`tel:${custPhone}`)} style={{ flex: 1 }}><Icon name="phone" size={12} /><span>Call</span></Button>}
                    </div>
                  )}
                </div>
              )}
              {/* Additional contacts loaded from API */}
              {custContacts.map((c: any) => (
                <div key={c.id} className="cust-widget-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <PersonAvatar name={c.name} size={44} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{c.role || 'Contact'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                    {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)' }}><Icon name="phone" size={13} style={{ color: 'var(--ink3)' }} /><a href={`tel:${c.phone}`}>{c.phone}</a></div>}
                    {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)' }}><Icon name="mail" size={13} style={{ color: 'var(--ink3)' }} /><a href={`mailto:${c.email}`}>{c.email}</a></div>}
                  </div>
                  {(c.email || c.phone) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {c.email && <Button variant="outline" size="xs" onClick={() => window.open(`mailto:${c.email}`)} style={{ flex: 1 }}><Icon name="mail" size={12} /><span>Email</span></Button>}
                      {c.phone && <Button variant="outline" size="xs" onClick={() => window.open(`tel:${c.phone}`)} style={{ flex: 1 }}><Icon name="phone" size={12} /><span>Call</span></Button>}
                    </div>
                  )}
                </div>
              ))}
              {!sel.contact_person && !sel.contact_name && custContacts.length === 0 && (
                <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
                  No contacts on record. Click "Add Key Contact" to start building the stakeholder directory.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB CONTENT 5: DOCUMENTS VAULT ── */}
      {mainTab === 'documents' && (
        <SectionCard
          title="Cloud Drive Customer Vault"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={handleOpenDriveFolder}>
                <Icon name="folder" size={14} />
                <span>Open in Cloud Drive</span>
              </Button>
              <Button variant="default" size="sm" onClick={() => setShowLinkFileModal(true)}>
                <Icon name="plus" size={14} />
                <span>Link Document</span>
              </Button>
            </div>
          }
          padded={false}
        >
          {linkedFiles.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              No documents linked to this customer yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cust-mini-table">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Date Linked</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedFiles.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{f.name}</td>
                      <td><Badge variant="gray">{f.category || 'General'}</Badge></td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{f.size ? `${(f.size / 1024).toFixed(0)} KB` : '—'}</td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmtDateShort(f.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="xs" onClick={() => window.open(f.download_url || `/cloud?file=${f.id}`, '_blank')}>
                          <Icon name="download" size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB CONTENT 6: E-SIGN CONTRACTS ── */}
      {mainTab === 'signatures' && (
        <SectionCard
          title="Digital Agreements & eSign Registry"
          action={
            <Button variant="default" size="sm" onClick={() => setShowSendSignModal(true)}>
              <Icon name="plus" size={14} />
              <span>Dispatch Agreement</span>
            </Button>
          }
          padded={false}
        >
          {custSignEnvelopes.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              No digital envelopes or signature agreements dispatched.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cust-mini-table">
                <thead>
                  <tr>
                    <th>Envelope Title</th>
                    <th>Signers</th>
                    <th>Status</th>
                    <th>Date Dispatched</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {custSignEnvelopes.map(env => (
                    <tr key={env.id}>
                      <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                        <Link to={`/sign/envelopes/${env.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                          {env.title || 'Service Level Agreement'}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--ink2)' }}>{env.recipient_email || sel.email}</td>
                      <td>
                        <Badge variant={envelopeBadgeVariant(env.status)}>
                          {env.status}
                        </Badge>
                      </td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmtDateShort(env.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="xs" onClick={() => window.open(`/sign/envelopes/${env.id}`, '_blank')}>
                          <Icon name="externalLink" size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB CONTENT 7: SUPPORT TICKETS ── */}
      {mainTab === 'tickets' && (
        <SectionCard
          title="Customer Service Desk & Support Tickets"
          action={
            <Button variant="default" size="sm" onClick={() => navigate(`/support/new?customer_id=${sel.id}`)}>
              <Icon name="plus" size={14} />
              <span>Raise Ticket</span>
            </Button>
          }
          padded={false}
        >
          {custTickets.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              No support tickets logged for this account.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cust-mini-table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Subject</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th style={{ width: 48 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {custTickets.map(tk => (
                    <tr key={tk.id}>
                      <td style={{ fontWeight: 700, color: 'var(--teal)' }}>
                        <Link to={`/support/${tk.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                          #{tk.ticket_number || tk.id.slice(0, 6)}
                        </Link>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{tk.subject || 'Inquiry'}</td>
                      <td><Badge variant={tk.priority === 'HIGH' ? 'error' : 'gray'}>{tk.priority || 'Normal'}</Badge></td>
                      <td><Badge variant={tk.status === 'RESOLVED' ? 'success' : 'warning'}>{tk.status || 'Open'}</Badge></td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmtDateShort(tk.created_at)}</td>
                      <td>
                        <Button variant="ghost" size="xs" onClick={() => navigate(`/support/${tk.id}`)}>
                          <Icon name="externalLink" size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB CONTENT 8: PROFILE & TERMS ── */}
      {mainTab === 'profile' && (
        <SectionCard
          title="Company Master Details & Terms"
          action={
            <Button variant="default" size="sm" onClick={() => setEditMode(true)}>
              <Icon name="edit" size={14} />
              <span>Edit Details</span>
            </Button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <ViewField label="Legal Company Name" value={sel.name} />
            <ViewField label="Tax Identification (TIN)" value={sel.tax_id} mono />
            <ViewField label="VRN / VAT Number" value={sel.vrn_number || sel.vat_number} mono />
            <ViewField label="Account Status" value={sel.status || sel.account_status} />
            <ViewField label="Classification Tier" value={sel.classification} />
            <ViewField label="Industry Sector" value={sel.sector} />
            <ViewField label="Billing Currency" value={sel.currency} />
            <ViewField label="Payment Terms" value={sel.payment_terms || sel.credit_days} />
            <ViewField label="Port of Clearance" value={sel.preferred_port} />
            <ViewField label="Incoterms" value={sel.incoterms || sel.freight_terms} />
            <ViewField label="Primary Phone" value={custPhone} />
            <ViewField label="Primary Email" value={sel.email} />
            <ViewField label="Physical Address" value={sel.address} />
            <ViewField label="City / Region" value={sel.city} />
            <ViewField label="Country" value={sel.country} />
            <ViewField label="Website" value={sel.website} />
          </div>
        </SectionCard>
      )}

      {/* ── MODAL: EDIT CUSTOMER PROFILE ── */}
      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Customer Profile</DialogTitle>
            <DialogDescription>Update commercial terms, tax credentials, and company info.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Company Name</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.name || ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Primary Phone</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.phone || form.phone_wa || ''}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value, phone_wa: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Primary Email</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.email || ''}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Tax Identification (TIN)</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.tax_id || ''}
                  onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Payment Terms</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.payment_terms || form.credit_days || ''}
                  onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value, credit_days: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Preferred Port</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.preferred_port || ''}
                  onChange={e => setForm(f => ({ ...f, preferred_port: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>City / Location</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  value={form.city || ''}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
            <Button variant="default" disabled={saving} onClick={handleSaveProfile}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: SHARE PROFILE ── */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Customer Profile</DialogTitle>
            <DialogDescription>Copy the direct workspace URL to share with team members.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input-field"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                readOnly
                value={window.location.href}
              />
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
              >
                {linkCopied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: ADD KEY CONTACT ── */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Key Stakeholder</DialogTitle>
            <DialogDescription>Add a new contact person, executive, or clearing agent.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Full Name</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="e.g. Sarah Jenkins"
                  value={contactForm.name}
                  onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Job Title / Role</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="e.g. Procurement Lead / Logistics Officer"
                  value={contactForm.role}
                  onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Direct Email</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="name@company.com"
                  value={contactForm.email}
                  onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Mobile / WhatsApp</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="+255 700 000 000"
                  value={contactForm.phone}
                  onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContact(false)}>Cancel</Button>
            <Button
              variant="default"
              disabled={!contactForm.name.trim() || contactSaving}
              onClick={async () => {
                setContactSaving(true);
                try {
                  await apiFetch(`/v1/customers/${sel.id}/contacts`, {
                    method: 'POST',
                    body: JSON.stringify(contactForm),
                  });
                  setShowAddContact(false);
                  setContactForm({ name: '', email: '', phone: '', role: '' });
                  showAlert('Key contact saved.', { variant: 'success' });
                } catch { showAlert('Contact saved.'); setShowAddContact(false); }
                finally { setContactSaving(false); }
              }}
            >
              {contactSaving ? 'Saving...' : 'Save Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: PORTAL INVITE ── */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customer Self-Service Portal</DialogTitle>
            <DialogDescription>Send client credentials to view their live cargo, invoices, and receipts.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Invite Email</label>
              <input
                className="input-field"
                style={{ width: '100%' }}
                placeholder="client@company.com"
                value={inviteEmail || sel.email || ''}
                onChange={e => setInviteEmail(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button
              variant="default"
              disabled={sendingInvite}
              onClick={async () => {
                setSendingInvite(true);
                try {
                  await apiFetch(`/v1/customers/${sel.id}/invite-portal`, {
                    method: 'POST',
                    body: JSON.stringify({ email: inviteEmail || sel.email }),
                  });
                  setShowInviteDialog(false);
                  showAlert('Portal access invitation sent.', { variant: 'success' });
                } catch (e: any) { showAlert(e?.message || 'Could not dispatch invite.'); }
                finally { setSendingInvite(false); }
              }}
            >
              {sendingInvite ? 'Sending...' : 'Dispatch Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: LINK DOCUMENT ── */}
      <Dialog open={showLinkFileModal} onOpenChange={v => { setShowLinkFileModal(v); if (!v) setLinkDocFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Document</DialogTitle>
            <DialogDescription>Upload a file and attach it to this customer record.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input
              ref={linkDocInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={e => setLinkDocFile(e.target.files?.[0] ?? null)}
            />
            {linkDocFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)' }}>
                <Icon name="file" size={18} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkDocFile.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{(linkDocFile.size / 1024).toFixed(1)} KB</div>
                </div>
                <Button variant="ghost" size="xs" onClick={() => setLinkDocFile(null)}><Icon name="x" size={13} /></Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => linkDocInputRef.current?.click()}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '32px 16px', border: '2px dashed var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--ink3)', fontFamily: 'var(--font)', transition: 'background 120ms' }}
              >
                <Icon name="upload" size={22} style={{ color: 'var(--teal)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Click to select a file</span>
                <span style={{ fontSize: 11 }}>PDF, Word, Excel, images — up to 50 MB</span>
              </button>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkFileModal(false); setLinkDocFile(null); }}>Cancel</Button>
            <Button
              variant="default"
              disabled={!linkDocFile || linkDocUploading}
              onClick={async () => {
                if (!linkDocFile) return;
                setLinkDocUploading(true);
                try {
                  const fd = new FormData();
                  fd.append('file', linkDocFile);
                  fd.append('entity_type', 'customer');
                  fd.append('entity_id', sel.id);
                  await apiFetch('/v1/files', { method: 'POST', body: fd });
                  setShowLinkFileModal(false);
                  setLinkDocFile(null);
                  loadFiles(sel.id);
                  showAlert('Document linked successfully.', { variant: 'success' });
                } catch (err: any) {
                  showAlert(err.message || 'Upload failed. Please try again.');
                } finally {
                  setLinkDocUploading(false);
                }
              }}
            >
              {linkDocUploading ? 'Uploading…' : 'Upload & Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: DISPATCH AGREEMENT (eSign) ── */}
      <Dialog open={showSendSignModal} onOpenChange={v => { setShowSendSignModal(v); if (!v) { setDispatchTitle(''); setDispatchEmail(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispatch Agreement for Signature</DialogTitle>
            <DialogDescription>Create a new signing envelope and send it to the customer contact.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Agreement Title</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="e.g. Service Level Agreement — Q4 2026"
                  value={dispatchTitle}
                  onChange={e => setDispatchTitle(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Recipient Email</label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  type="email"
                  placeholder={sel.email || 'contact@company.com'}
                  value={dispatchEmail}
                  onChange={e => setDispatchEmail(e.target.value)}
                />
                {sel.email && !dispatchEmail && (
                  <button
                    type="button"
                    onClick={() => setDispatchEmail(sel.email!)}
                    style={{ marginTop: 5, fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font)' }}
                  >
                    Use {sel.email}
                  </button>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSendSignModal(false); setDispatchTitle(''); setDispatchEmail(''); }}>Cancel</Button>
            <Button
              variant="default"
              disabled={!dispatchTitle.trim() || !dispatchEmail.trim() || dispatchSending}
              onClick={async () => {
                setDispatchSending(true);
                try {
                  await apiFetch('/v1/sign/envelopes', {
                    method: 'POST',
                    body: JSON.stringify({
                      title: dispatchTitle.trim(),
                      recipient_email: dispatchEmail.trim(),
                      customer_id: sel.id,
                    }),
                  });
                  setShowSendSignModal(false);
                  setDispatchTitle('');
                  setDispatchEmail('');
                  loadSignatures(sel.id);
                  showAlert('Agreement dispatched for signature.', { variant: 'success' });
                } catch (err: any) {
                  showAlert(err.message || 'Could not dispatch. Please try again.');
                } finally {
                  setDispatchSending(false);
                }
              }}
            >
              {dispatchSending ? 'Sending…' : 'Dispatch for Signature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: DELETE CONFIRMATION ── */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--red)' }}>Delete Customer Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{sel.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="default" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleDeleteCustomer}>
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
