import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCurrency } from '../hooks/useCurrency.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { Tip } from '../components/ui/tooltip.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { getCompany } from '../data/companyStore.js';
import {
  Vendor, VendorCategory, VendorStatus, PaymentTerms,
  VENDOR_CATEGORY_LABEL, PAYMENT_TERMS_LABEL, VENDOR_STATUS_COLOR,
} from '../data/vendorData.js';
import type { ExpenseListItem } from './Expenses.js';
import './VendorProfilePage.css';

const CATEGORIES: VendorCategory[] = ['port_services', 'customs', 'freight', 'warehouse', 'transport', 'consulting', 'utility', 'other'];
const STATUSES: VendorStatus[] = ['active', 'inactive', 'blocked'];
const TERMS: PaymentTerms[] = ['cod', 'net_15', 'net_30', 'net_60', 'net_90', 'prepaid'];

const BILL_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  DRAFT:            { bg: 'var(--bg)', color: 'var(--ink3)' },
  PENDING_APPROVAL: { bg: 'var(--purple-l)', color: 'var(--purple)' },
  POSTED:           { bg: 'var(--blue-l)', color: 'var(--blue)' },
  PARTIAL:          { bg: 'var(--gold-l)', color: 'var(--gold)' },
  PAID:             { bg: 'var(--green-l)', color: 'var(--green)' },
  OVERDUE:          { bg: 'var(--red-l)', color: 'var(--red)' },
  VOID:             { bg: 'var(--bg)', color: 'var(--ink3)' },
};

const PO_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  DRAFT:     { bg: 'var(--bg)', color: 'var(--ink3)' },
  SENT:      { bg: 'var(--blue-l)', color: 'var(--blue)' },
  PARTIAL:   { bg: 'var(--gold-l)', color: 'var(--gold)' },
  RECEIVED:  { bg: 'var(--green-l)', color: 'var(--green)' },
  CANCELLED: { bg: 'var(--red-l)', color: 'var(--red)' },
};

/* ── TIN 1-click copy chip ── */
function TinChip({ tin }: { tin?: string }) {
  const [copied, setCopied] = useState(false);
  if (!tin) return <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tip label={copied ? 'Copied to clipboard!' : `TIN: ${tin} — click to copy`} side="top">
      <div
        onClick={handleCopy}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', padding: '2px 8px', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--teal)', background: 'var(--teal-l)', borderRadius: 'var(--r-sm)', padding: '1px 4px' }}>TIN</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--ink)' }}>{tin}</span>
        {copied ? (
          <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>✓</span>
        ) : (
          <Icon name="copy" size={11} style={{ color: 'var(--ink3)', opacity: 0.65 }} />
        )}
      </div>
    </Tip>
  );
}

/* ── Statement of Account print preview window ── */
function openVendorStatementPrintWindow(
  vendor: Vendor,
  bills: any[],
  payments: any[],
  totals: { totalBilled: number; totalPaid: number; outstanding: number },
) {
  const co = getCompany();
  const money = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Build combined chronological transactions
  const txs: { date: string; ref: string; type: string; debit: number; credit: number; balance: number }[] = [];
  let running = 0;

  const rawEvents = [
    ...bills.map(b => ({
      date: b.bill_date ? String(b.bill_date).slice(0, 10) : '',
      ref: b.bill_number || 'Bill',
      type: 'Supplier Bill',
      debit: Number(b.total) || 0,
      credit: 0,
    })),
    ...payments.map(p => ({
      date: p.payment_date ? String(p.payment_date).slice(0, 10) : '',
      ref: p.reference || 'Disbursement',
      type: `Payment (${p.method || 'Transfer'})`,
      debit: 0,
      credit: Number(p.amount) || 0,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  for (const e of rawEvents) {
    running += e.debit - e.credit;
    txs.push({ ...e, balance: running });
  }

  const rows = txs.map(tx => `<tr>
    <td>${tx.date || '—'}</td>
    <td><strong>${tx.ref}</strong></td>
    <td>${tx.type}</td>
    <td style="text-align:right;font-family:monospace;color:${tx.debit ? '#dc2626' : '#9ca3af'}">${tx.debit ? money(tx.debit) : '—'}</td>
    <td style="text-align:right;font-family:monospace;color:${tx.credit ? '#059669' : '#9ca3af'}">${tx.credit ? money(tx.credit) : '—'}</td>
    <td style="text-align:right;font-family:monospace;font-weight:700;${tx.balance > 0 ? 'color:#dc2626' : '#059669'}">${money(tx.balance)}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Vendor Statement of Account — ${vendor.name}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#111;padding:28px 36px;font-size:11px}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #d5dde8}
.from strong{font-size:16px;color:#111}
.from div{color:#555;line-height:1.6;margin-top:4px}
.title{text-align:right}
.title h1{font-size:18px;color:#111827}
.title .sub{color:#9ca3af;font-size:10px;margin-top:4px}
.to{margin-bottom:16px;display:flex;justify-content:space-between;gap:20px}
.to .lbl{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:4px}
.to .name{font-size:14px;font-weight:700}
.to .sub{color:#555;font-size:11px;margin-top:3px}
.totals{display:flex;gap:20px;margin-bottom:18px;padding:12px 16px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb}
.totals div{flex:1}
.totals .lbl{font-size:8.5px;font-weight:800;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
.totals .val{font-size:15px;font-weight:800;font-family:monospace}
table{width:100%;border-collapse:collapse}
thead tr{background:#f9fafb;border-bottom:2px solid #d5dde8}
th{padding:8px 10px;text-align:left;font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.04em;text-transform:uppercase}
th:nth-child(4),th:nth-child(5),th:nth-child(6){text-align:right}
td{padding:8px 10px;border-bottom:1px solid #edf0f4;font-size:11px}
@media print{body{padding:12px 18px}}
</style></head><body>
<div class="top">
  <div class="from">
    ${co.logoUrl ? `<img src="${co.logoUrl}" style="max-height:36px;max-width:140px;object-fit:contain" alt="${co.name}">` : `<strong>${co.name}</strong>`}
    <div>${co.address}<br>${co.city}, ${co.country} · VAT/TIN: ${co.taxId || '—'}</div>
  </div>
  <div class="title">
    <h1>Vendor Statement of Account</h1>
    <div class="sub">Generated ${today}</div>
  </div>
</div>
<div class="to">
  <div>
    <div class="lbl">Vendor / Supplier</div>
    <div class="name">${vendor.name}</div>
    <div class="sub">${[vendor.address, vendor.city, vendor.country].filter(Boolean).join(', ') || 'Tanzania'}</div>
    <div class="sub">TIN: ${vendor.taxId || '—'} · Terms: ${PAYMENT_TERMS_LABEL[vendor.paymentTerms]}</div>
  </div>
  <div style="text-align:right">
    <div class="lbl">Payment Details</div>
    <div style="font-size:11px;color:#111">Bank: <strong>${vendor.bankName || '—'}</strong></div>
    <div style="font-size:11px;color:#111">Account: <strong>${vendor.bankAccount || '—'}</strong></div>
    <div style="font-size:11px;color:#6b7280">Currency: ${vendor.currency}</div>
  </div>
</div>
<div class="totals">
  <div><div class="lbl">Total Invoiced (Bills)</div><div class="val">${money(totals.totalBilled)}</div></div>
  <div><div class="lbl">Total Paid to Date</div><div class="val" style="color:#059669">${money(totals.totalPaid)}</div></div>
  <div><div class="lbl">Net Outstanding Balance</div><div class="val" style="color:${totals.outstanding > 0 ? '#dc2626' : '#059669'}">${money(totals.outstanding)}</div></div>
</div>
<table><thead><tr>
  <th>Date</th><th>Reference</th><th>Transaction</th><th>Billed (Dr)</th><th>Paid (Cr)</th><th>Balance</th>
</tr></thead><tbody>${rows || '<tr><td colspan="6" style="color:#9ca3af;font-style:italic;padding:16px;text-align:center">No transactions recorded</td></tr>'}</tbody></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=880,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   VendorProfilePage
══════════════════════════════════════════════════════════════════════════════ */
export function VendorProfilePage() {
  const { id, tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const { fmt } = useCurrency();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Associated ledger datasets
  const [bills, setBills] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Navigation tab state
  const validTabs = ['overview', 'bills', 'orders', 'expenses', 'payments', 'edit'];
  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam && validTabs.includes(tabParam)) return tabParam;
    return 'overview';
  });

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (t: string) => {
    setActiveTab(t);
    navigate(`/finance/vendors/${id}/${t}`, { replace: true });
  };

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<Vendor>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Quick notes editor
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Bill & PO sub-filters
  const [billStatusFilter, setBillStatusFilter] = useState<string>('ALL');
  const [poStatusFilter, setPoStatusFilter] = useState<string>('ALL');

  // Load all supplier records
  const loadVendorData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [suppRes, billsRes, posRes, expRes, payRes] = await Promise.all([
        apiFetch<any>(`/v1/suppliers/${id}`),
        apiFetch<any>(`/v1/bills?supplier_id=${id}`).catch(() => []),
        apiFetch<any>('/v1/purchase-orders').catch(() => ({ purchase_orders: [] })),
        apiFetch<any>('/v1/finance/expenses').catch(() => ({ data: [] })),
        apiFetch<any>('/v1/bills/payments').catch(() => []),
      ]);

      const billList = Array.isArray(billsRes) ? billsRes : (billsRes?.items ?? []);
      const poList = (posRes?.purchase_orders ?? []).filter((p: any) => p.supplier_id === id);
      const expList = ((expRes?.data ?? expRes) || []).filter((e: any) => e.supplier_id === id);
      const payList = (Array.isArray(payRes) ? payRes : []).filter((p: any) => {
        return billList.some((b: any) => b.id === p.bill_id);
      });

      // Compute live balances
      let totalBillAmt = 0;
      let totalBillPaid = 0;
      for (const b of billList) {
        totalBillAmt += Number(b.total) || 0;
        totalBillPaid += Number(b.paid_amount) || 0;
      }
      const calculatedBalance = Math.max(0, totalBillAmt - totalBillPaid);

      const mapped: Vendor = {
        id: suppRes.id,
        name: suppRes.name || '',
        contactPerson: suppRes.contact_name || '',
        email: suppRes.email || '',
        phone: suppRes.phone || '',
        address: suppRes.address || '',
        city: suppRes.city || '',
        country: suppRes.country || 'Tanzania',
        taxId: suppRes.tax_id || '',
        category: (suppRes.category || 'other') as VendorCategory,
        currency: suppRes.currency || 'TZS',
        paymentTerms: (suppRes.payment_terms || 'net_30') as PaymentTerms,
        status: (suppRes.status || 'active') as VendorStatus,
        balance: calculatedBalance,
        totalPaid: totalBillPaid,
        bankName: suppRes.bank_name || '',
        bankAccount: suppRes.bank_account || '',
        createdAt: suppRes.created_at ? String(suppRes.created_at).slice(0, 10) : '',
        notes: suppRes.notes || '',
        refCode: suppRes.ref_code || '',
      };

      setVendor(mapped);
      setEditForm(mapped);
      setNotesDraft(mapped.notes || '');
      setBills(billList);
      setPurchaseOrders(poList);
      setExpenses(expList);
      setPayments(payList);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load vendor profile.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadVendorData();
  }, [loadVendorData]);

  // Financial aggregates
  const financialMetrics = useMemo(() => {
    const totalBilled = bills.reduce((s, b) => s + (Number(b.total) || 0), 0);
    const totalPaidOnBills = bills.reduce((s, b) => s + (Number(b.paid_amount) || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalPOValue = purchaseOrders.reduce((s, po) => s + (Number(po.total) || 0), 0);
    const outstanding = Math.max(0, totalBilled - totalPaidOnBills);
    const overdueBills = bills.filter(b => {
      const bal = Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0));
      return bal > 0 && ['POSTED', 'PARTIAL'].includes(b.status) && b.due_date && new Date(b.due_date) < new Date();
    });
    const overdueAmount = overdueBills.reduce((s, b) => s + Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0)), 0);

    return {
      totalBilled,
      totalPaid: totalPaidOnBills + totalExpenses,
      outstanding,
      overdueAmount,
      overdueBillsCount: overdueBills.length,
      totalPOValue,
      activePOCount: purchaseOrders.filter(po => !['CANCELLED', 'RECEIVED'].includes(po.status)).length,
      totalExpenses,
    };
  }, [bills, expenses, purchaseOrders]);

  // Save profile edits
  async function handleSaveProfile(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editForm.name?.trim() || !id) return;
    setSavingEdit(true);
    const payload = {
      name: editForm.name.trim(),
      contact_name: editForm.contactPerson || null,
      email: editForm.email || null,
      phone: editForm.phone || null,
      address: editForm.address || null,
      city: editForm.city || null,
      country: editForm.country || 'Tanzania',
      tax_id: editForm.taxId || null,
      category: editForm.category || 'other',
      currency: editForm.currency || 'TZS',
      payment_terms: editForm.paymentTerms || 'net_30',
      status: editForm.status || 'active',
      bank_name: editForm.bankName || null,
      bank_account: editForm.bankAccount || null,
      notes: editForm.notes || null,
      ref_code: editForm.refCode || undefined,
    };

    try {
      await apiFetch(`/v1/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showAlert('Vendor profile updated successfully.', { variant: 'success' });
      await loadVendorData();
      handleTabChange('overview');
    } catch (err: any) {
      showAlert(err?.message || 'Could not save vendor changes.');
    } finally {
      setSavingEdit(false);
    }
  }

  // Save quick notes
  async function handleSaveNotes() {
    if (!id) return;
    setSavingNotes(true);
    try {
      await apiFetch(`/v1/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify({ notes: notesDraft }) });
      setVendor(prev => prev ? { ...prev, notes: notesDraft } : prev);
      showAlert('Notes updated.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message || 'Could not update notes.');
    } finally {
      setSavingNotes(false);
    }
  }

  // Toggle vendor status (Active / Inactive / Blocked)
  async function handleToggleStatus(newStatus: VendorStatus) {
    if (!id || !vendor) return;
    const confirm = await showConfirm(`Change vendor status to ${newStatus.toUpperCase()}?`);
    if (!confirm) return;
    try {
      await apiFetch(`/v1/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setVendor(prev => prev ? { ...prev, status: newStatus } : prev);
      setEditForm(prev => ({ ...prev, status: newStatus }));
      showAlert(`Vendor marked as ${newStatus}.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message || 'Could not change status.');
    }
  }

  // Delete / Deactivate vendor
  async function handleDeleteVendor() {
    if (!id || !vendor) return;
    const confirm = await showConfirm(
      `Deactivate "${vendor.name}"? This removes them from active vendor selection and moves their account to inactive status.`,
      { confirmLabel: 'Deactivate Vendor' }
    );
    if (!confirm) return;
    try {
      await apiFetch(`/v1/suppliers/${id}`, { method: 'DELETE' });
      showAlert('Vendor deactivated.', { variant: 'success' });
      navigate('/finance/vendors');
    } catch (err: any) {
      showAlert(err?.message || 'Could not deactivate vendor.');
    }
  }

  // Filtered bills
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      if (billStatusFilter === 'ALL') return true;
      if (billStatusFilter === 'OVERDUE') {
        const bal = Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0));
        return bal > 0 && ['POSTED', 'PARTIAL'].includes(b.status) && b.due_date && new Date(b.due_date) < new Date();
      }
      if (billStatusFilter === 'UNPAID') {
        const bal = Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0));
        return bal > 0 && ['POSTED', 'PARTIAL'].includes(b.status);
      }
      return b.status === billStatusFilter;
    });
  }, [bills, billStatusFilter]);

  // Filtered purchase orders
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      if (poStatusFilter === 'ALL') return true;
      if (poStatusFilter === 'OPEN') return !['CANCELLED', 'RECEIVED'].includes(po.status);
      return po.status === poStatusFilter;
    });
  }, [purchaseOrders, poStatusFilter]);

  // Combined activity feed
  const recentActivities = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      type: 'bill' | 'po' | 'expense' | 'payment';
      title: string;
      subtitle: string;
      amount: number;
      currency?: string;
      status: string;
      statusStyle: { bg: string; color: string };
    }> = [];

    for (const b of bills) {
      list.push({
        id: `bill-${b.id}`,
        date: b.bill_date ? String(b.bill_date).slice(0, 10) : '',
        type: 'bill',
        title: `Bill ${b.bill_number}`,
        subtitle: `Due: ${b.due_date ? String(b.due_date).slice(0, 10) : '—'}`,
        amount: Number(b.total) || 0,
        currency: b.currency,
        status: b.status,
        statusStyle: BILL_STATUS_COLOR[b.status] || BILL_STATUS_COLOR.DRAFT,
      });
    }

    for (const po of purchaseOrders) {
      list.push({
        id: `po-${po.id}`,
        date: po.order_date ? String(po.order_date).slice(0, 10) : '',
        type: 'po',
        title: `Purchase Order ${po.po_number}`,
        subtitle: `Expected: ${po.expected_date ? String(po.expected_date).slice(0, 10) : '—'}`,
        amount: Number(po.total) || 0,
        currency: po.currency,
        status: po.status,
        statusStyle: PO_STATUS_COLOR[po.status] || PO_STATUS_COLOR.DRAFT,
      });
    }

    for (const exp of expenses) {
      list.push({
        id: `exp-${exp.id}`,
        date: exp.date ? exp.date.split('T')[0] : '',
        type: 'expense',
        title: exp.name || 'Expense Claim',
        subtitle: `${(exp as any).payment_mode || 'Cash'} · ${exp.category || 'General'}`,
        amount: Number(exp.amount) || 0,
        currency: 'TZS',
        status: 'LOGGED',
        statusStyle: { bg: 'var(--bg)', color: 'var(--ink2)' },
      });
    }

    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [bills, purchaseOrders, expenses]);

  /* ── Loading / Error states ── */
  if (loading) {
    return (
      <div className="vendor-profile-root" style={{ padding: '40px 0', textAlign: 'center' }}>
        <div style={{ color: 'var(--ink3)', fontSize: 14 }}>Loading vendor profile…</div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="vendor-profile-root" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div className="vendor-empty-state">
          <div className="vendor-empty-icon"><Icon name="alertCircle" size={28} /></div>
          <h2 className="vendor-empty-title">Vendor Not Found</h2>
          <p className="vendor-empty-desc">{error || 'The requested supplier record does not exist or has been removed.'}</p>
          <Button onClick={() => navigate('/finance/vendors')} style={{ marginTop: 12 }}>
            Return to Vendors Directory
          </Button>
        </div>
      </div>
    );
  }

  const v = vendor;
  const statusColor = VENDOR_STATUS_COLOR[v.status] || VENDOR_STATUS_COLOR.active;
  const phoneFormatted = v.phone ? v.phone.replace(/[^0-9+]/g, '') : '';

  return (
    <div className="vendor-profile-root">
      {/* ── Breadcrumbs Bar ── */}
      <div className="vendor-breadcrumbs-bar">
        <div className="vendor-breadcrumbs-path">
          <Link to="/finance">Finance</Link>
          <span>/</span>
          <Link to="/finance/vendors">Vendors</Link>
          <span>/</span>
          <span className="vendor-breadcrumbs-current">{v.name}</span>
        </div>
        <Link to="/finance/vendors" className="vendor-back-btn">
          <Icon name="arrowLeft" size={13} />
          <span>All Vendors</span>
        </Link>
      </div>

      {/* ── Master Vendor Hero Card ── */}
      <div className="vendor-master-hero">
        <div className="vendor-hero-header">
          {/* Identity Cluster */}
          <div className="vendor-hero-identity">
            <div className="vendor-avatar-frame">
              <AvatarPicker
                id={v.id}
                kind="suppliers"
                name={v.name}
                size={68}
                shape="square"
                onChange={() => showAlert('Vendor logo updated.', { variant: 'success' })}
              />
              <div className="vendor-verified-badge" title="Active Trade Vendor">
                <Icon name="check" size={12} strokeWidth={2.5} />
              </div>
            </div>

            <div className="vendor-hero-details">
              <div className="vendor-title-row">
                <h1 className="vendor-company-title">{v.name}</h1>
                <Badge
                  style={{
                    background: statusColor.bg,
                    color: statusColor.color,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                  }}
                >
                  {v.status}
                </Badge>
                <span className="vendor-category-chip">
                  <Icon name="briefcase" size={12} />
                  <span>{VENDOR_CATEGORY_LABEL[v.category] || v.category}</span>
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>
                  {v.currency}
                </span>
              </div>

              <div className="vendor-subtitle-row">
                <span>Terms: <strong>{PAYMENT_TERMS_LABEL[v.paymentTerms]}</strong></span>
                <span>&middot;</span>
                <span>Vendor Code: <strong style={{ fontFamily: 'var(--font)' }}>#VND-{v.id.slice(0, 8).toUpperCase()}</strong></span>
                {v.createdAt && (
                  <>
                    <span>&middot;</span>
                    <span>Supplier since <strong>{new Date(v.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</strong></span>
                  </>
                )}
                {v.bankName && (
                  <>
                    <span>&middot;</span>
                    <span>Bank: <strong>{v.bankName}</strong></span>
                  </>
                )}
              </div>

              <div className="vendor-meta-chips-row">
                {v.contactPerson && (
                  <span className="vendor-meta-chip">
                    <Icon name="user" size={13} style={{ color: 'var(--ink3)' }} />
                    <span>{v.contactPerson}</span>
                  </span>
                )}
                {v.phone && (
                  <span className="vendor-meta-chip">
                    <Icon name="phone" size={13} style={{ color: 'var(--ink3)' }} />
                    <a href={`tel:${v.phone}`}>{v.phone}</a>
                    {phoneFormatted && (
                      <a
                        href={`https://wa.me/${phoneFormatted.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="vendor-quick-action-link is-whatsapp"
                        title="Chat on WhatsApp"
                      >
                        <Icon name="messageSquare" size={11} style={{ color: 'var(--green)' }} />
                      </a>
                    )}
                  </span>
                )}
                {v.email && (
                  <span className="vendor-meta-chip">
                    <Icon name="mail" size={13} style={{ color: 'var(--ink3)' }} />
                    <a href={`mailto:${v.email}`}>{v.email}</a>
                    <a
                      href={`mailto:${v.email}?subject=Inquiry from ${getCompany().name}`}
                      className="vendor-quick-action-link"
                      title="Send email"
                    >
                      <Icon name="send" size={11} />
                    </a>
                  </span>
                )}
                {(v.address || v.city || v.country) && (
                  <span className="vendor-meta-chip">
                    <Icon name="mapPin" size={13} style={{ color: 'var(--ink3)' }} />
                    <span>{[v.address, v.city, v.country].filter(Boolean).join(', ')}</span>
                  </span>
                )}
                {v.taxId && (
                  <span className="vendor-meta-chip">
                    <TinChip tin={v.taxId} />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="vendor-hero-actions">
            <button
              type="button"
              onClick={() => handleTabChange('edit')}
              className="btn btn-secondary btn-sm"
              data-ui-native-button=""
              title="Edit vendor profile details"
            >
              <Icon name="edit" size={14} />
              <span>Edit Profile</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/finance/purchase-orders?supplier_id=${v.id}&new=1`)}
              className="btn btn-secondary btn-sm"
              data-ui-native-button=""
              title="Issue a purchase order"
            >
              <Icon name="shoppingCart" size={14} />
              <span>New PO</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/finance/bills?supplier_id=${v.id}&new=1`)}
              className="btn btn-primary btn-sm"
              data-ui-native-button=""
              title="Record a new supplier bill"
            >
              <Icon name="plus" size={14} />
              <span>Record Bill</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0 10px' }}
                  data-ui-native-button=""
                  aria-label="More vendor actions"
                >
                  <Icon name="moreHorizontal" size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => openVendorStatementPrintWindow(v, bills, payments, {
                    totalBilled: financialMetrics.totalBilled,
                    totalPaid: financialMetrics.totalPaid,
                    outstanding: financialMetrics.outstanding,
                  })}
                >
                  <Icon name="printer" size={14} />
                  <span>Statement PDF / Print</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    showAlert('Profile URL copied to clipboard.', { variant: 'success' });
                  }}
                >
                  <Icon name="share" size={14} />
                  <span>Copy Profile Link</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/finance/expenses/new?supplier_id=${v.id}`)}>
                  <Icon name="creditCard" size={14} />
                  <span>Log Operational Expense</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {v.status === 'active' ? (
                  <DropdownMenuItem onClick={() => handleToggleStatus('inactive')} style={{ color: 'var(--ink2)' }}>
                    <Icon name="pause" size={14} />
                    <span>Set Inactive</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handleToggleStatus('active')} style={{ color: 'var(--green)' }}>
                    <Icon name="check" size={14} />
                    <span>Reactivate Vendor</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleDeleteVendor} style={{ color: 'var(--red)' }}>
                  <Icon name="trash" size={14} />
                  <span>Deactivate Account</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Live 6-KPI Executive Ribbon */}
        <div className="vendor-hero-kpi-bar">
          <div className="vendor-kpi-item">
            <div className="vendor-kpi-top">
              <span className="vendor-kpi-label">Outstanding Balance</span>
              <Icon name="alertTriangle" size={14} style={{ color: financialMetrics.outstanding > 0 ? 'var(--red)' : 'var(--green)' }} />
            </div>
            <div className={`vendor-kpi-val ${financialMetrics.outstanding > 0 ? 'is-red' : 'is-green'}`}>
              {fmt(financialMetrics.outstanding, v.currency)}
            </div>
            <div className="vendor-kpi-sub">
              {financialMetrics.outstanding > 0
                ? `${financialMetrics.overdueBillsCount} overdue bill${financialMetrics.overdueBillsCount === 1 ? '' : 's'}`
                : 'Account in good standing'}
            </div>
          </div>

          <div className="vendor-kpi-item">
            <div className="vendor-kpi-top">
              <span className="vendor-kpi-label">Total Paid (Lifetime)</span>
              <Icon name="check" size={14} style={{ color: 'var(--green)' }} />
            </div>
            <div className="vendor-kpi-val is-green">
              {fmt(financialMetrics.totalPaid, v.currency)}
            </div>
            <div className="vendor-kpi-sub">Total disbursements</div>
          </div>

          <div className="vendor-kpi-item">
            <div className="vendor-kpi-top">
              <span className="vendor-kpi-label">Total Billed</span>
              <Icon name="receipt" size={14} style={{ color: 'var(--teal)' }} />
            </div>
            <div className="vendor-kpi-val is-teal">
              {fmt(financialMetrics.totalBilled, v.currency)}
            </div>
            <div className="vendor-kpi-sub">{bills.length} bills received</div>
          </div>

          <div className="vendor-kpi-item">
            <div className="vendor-kpi-top">
              <span className="vendor-kpi-label">Purchase Orders</span>
              <Icon name="shoppingCart" size={14} style={{ color: 'var(--blue)' }} />
            </div>
            <div className="vendor-kpi-val">
              {fmt(financialMetrics.totalPOValue, v.currency)}
            </div>
            <div className="vendor-kpi-sub">{financialMetrics.activePOCount} active orders</div>
          </div>

          <div className="vendor-kpi-item">
            <div className="vendor-kpi-top">
              <span className="vendor-kpi-label">Expenses Logged</span>
              <Icon name="creditCard" size={14} style={{ color: 'var(--purple)' }} />
            </div>
            <div className="vendor-kpi-val">
              {fmt(financialMetrics.totalExpenses, 'TZS')}
            </div>
            <div className="vendor-kpi-sub">{expenses.length} claims & records</div>
          </div>

          <div className="vendor-kpi-item">
            <div className="vendor-kpi-top">
              <span className="vendor-kpi-label">Credit Terms</span>
              <Icon name="clock" size={14} style={{ color: 'var(--gold)' }} />
            </div>
            <div className="vendor-kpi-val" style={{ fontSize: 14.5 }}>
              {PAYMENT_TERMS_LABEL[v.paymentTerms]}
            </div>
            <div className="vendor-kpi-sub">
              {financialMetrics.overdueAmount > 0 ? `${fmt(financialMetrics.overdueAmount, v.currency)} overdue` : 'Standard terms'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="vendor-tabs-nav">
        {[
          { key: 'overview',  label: 'Overview',              icon: 'grid'         as const },
          { key: 'bills',     label: 'Bills & Invoices',      icon: 'receipt'      as const, count: bills.length },
          { key: 'orders',    label: 'Purchase Orders',       icon: 'shoppingCart' as const, count: purchaseOrders.length },
          { key: 'expenses',  label: 'Expenses Logged',       icon: 'creditCard'   as const, count: expenses.length },
          { key: 'payments',  label: 'Payments & Remittance', icon: 'dollarSign'   as const, count: payments.length },
          { key: 'edit',      label: 'Profile & Settings',    icon: 'settings'     as const },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            className={`vendor-tab-btn ${activeTab === t.key ? 'is-active' : ''}`}
            onClick={() => handleTabChange(t.key)}
          >
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span className="vendor-tab-badge">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="vendor-overview-grid">
          {/* Main Column */}
          <div className="vendor-col">
            {/* Payables Snapshot Card */}
            <div className="vendor-card">
              <div className="vendor-card-header">
                <h3 className="vendor-card-title">
                  <Icon name="barChart" size={16} color="var(--teal)" />
                  <span>Payables & Financial Exposure</span>
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/finance/bills?supplier_id=${v.id}&new=1`)}>
                    <Icon name="plus" size={13} />
                    <span>Record Bill</span>
                  </Button>
                </div>
              </div>
              <div className="vendor-card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
                  <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Current Payable</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font)', marginTop: 4 }}>
                      {fmt(Math.max(0, financialMetrics.outstanding - financialMetrics.overdueAmount), v.currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Not yet overdue</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase' }}>Overdue Debt</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--font)', marginTop: 4 }}>
                      {fmt(financialMetrics.overdueAmount, v.currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{financialMetrics.overdueBillsCount} bills past due date</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase' }}>Lifetime Paid</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font)', marginTop: 4 }}>
                      {fmt(financialMetrics.totalPaid, v.currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Settled disbursements</div>
                  </div>
                </div>

                {/* Ratio bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--ink3)' }}>Disbursement settlement progress</span>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                      {financialMetrics.totalBilled > 0
                        ? `${Math.round((financialMetrics.totalPaid / financialMetrics.totalBilled) * 100)}% Settled`
                        : '100% Settled'}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <div
                      style={{
                        width: `${financialMetrics.totalBilled > 0 ? Math.min(100, Math.round((financialMetrics.totalPaid / financialMetrics.totalBilled) * 100)) : 100}%`,
                        background: 'var(--green)',
                      }}
                    />
                    <div
                      style={{
                        width: `${financialMetrics.totalBilled > 0 ? Math.min(100, Math.round((financialMetrics.outstanding / financialMetrics.totalBilled) * 100)) : 0}%`,
                        background: 'var(--red)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity Stream */}
            <div className="vendor-card">
              <div className="vendor-card-header">
                <h3 className="vendor-card-title">
                  <Icon name="clock" size={16} color="var(--blue)" />
                  <span>Recent Activity & Transactions</span>
                </h3>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Latest 10 records</span>
              </div>
              <div className="vendor-card-body" style={{ padding: '10px 20px' }}>
                {recentActivities.length === 0 ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
                    No recent bills, purchase orders or expenses logged for this vendor.
                  </div>
                ) : (
                  <div>
                    {recentActivities.map(act => (
                      <div key={act.id} className="vendor-activity-item">
                        <div
                          className="vendor-activity-icon"
                          style={{
                            background: act.type === 'bill' ? 'var(--teal-l)' : act.type === 'po' ? 'var(--blue-l)' : 'var(--purple-l)',
                            color: act.type === 'bill' ? 'var(--teal)' : act.type === 'po' ? 'var(--blue)' : 'var(--purple)',
                          }}
                        >
                          <Icon name={act.type === 'bill' ? 'receipt' : act.type === 'po' ? 'shoppingCart' : 'creditCard'} size={15} />
                        </div>
                        <div className="vendor-activity-content">
                          <div className="vendor-activity-title">{act.title}</div>
                          <div className="vendor-activity-meta">{act.date} &middot; {act.subtitle}</div>
                        </div>
                        <div className="vendor-activity-amount">
                          <div className="vendor-activity-val">{fmt(act.amount, act.currency || v.currency)}</div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 'var(--r-sm)',
                              ...act.statusStyle,
                            }}
                          >
                            {act.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar Column */}
          <div className="vendor-col">
            {/* Primary Contact Details */}
            <div className="vendor-card">
              <div className="vendor-card-header">
                <h3 className="vendor-card-title">
                  <Icon name="user" size={16} color="var(--ink2)" />
                  <span>Corporate & Contact Details</span>
                </h3>
              </div>
              <div className="vendor-card-body" style={{ padding: '16px 20px' }}>
                <div className="vendor-info-list">
                  <div className="vendor-info-row">
                    <span className="vendor-info-label"><Icon name="user" size={13} /> Contact Person</span>
                    <span className="vendor-info-value">{v.contactPerson || '—'}</span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label"><Icon name="mail" size={13} /> Email</span>
                    <span className="vendor-info-value">
                      {v.email ? <a href={`mailto:${v.email}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{v.email}</a> : '—'}
                    </span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label"><Icon name="phone" size={13} /> Phone</span>
                    <span className="vendor-info-value">
                      {v.phone ? <a href={`tel:${v.phone}`} style={{ color: 'var(--ink)', textDecoration: 'none', fontFamily: 'var(--font)' }}>{v.phone}</a> : '—'}
                    </span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label"><Icon name="mapPin" size={13} /> Address</span>
                    <span className="vendor-info-value">{v.address || '—'}</span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label"><Icon name="globe" size={13} /> City & Country</span>
                    <span className="vendor-info-value">{[v.city, v.country].filter(Boolean).join(', ') || 'Tanzania'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Banking & Remittance */}
            <div className="vendor-card">
              <div className="vendor-card-header">
                <h3 className="vendor-card-title">
                  <Icon name="creditCard" size={16} color="var(--green)" />
                  <span>Banking & Remittance</span>
                </h3>
              </div>
              <div className="vendor-card-body" style={{ padding: '16px 20px' }}>
                <div className="vendor-info-list">
                  <div className="vendor-info-row">
                    <span className="vendor-info-label">Reference Code</span>
                    <span className="vendor-info-value" style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal)' }}>{v.refCode || '—'}</span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label">Tax ID / TIN</span>
                    <span className="vendor-info-value"><TinChip tin={v.taxId} /></span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label">Settlement Bank</span>
                    <span className="vendor-info-value">{v.bankName || '—'}</span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label">Bank Account #</span>
                    <span className="vendor-info-value" style={{ fontFamily: 'var(--font)' }}>
                      {v.bankAccount ? (
                        <Tip label="Click to copy account number">
                          <span
                            onClick={() => {
                              navigator.clipboard.writeText(v.bankAccount);
                              showAlert('Account number copied.', { variant: 'success' });
                            }}
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {v.bankAccount}
                          </span>
                        </Tip>
                      ) : '—'}
                    </span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label">Settlement Currency</span>
                    <span className="vendor-info-value">{v.currency}</span>
                  </div>
                  <div className="vendor-info-row">
                    <span className="vendor-info-label">Default Terms</span>
                    <span className="vendor-info-value">{PAYMENT_TERMS_LABEL[v.paymentTerms]}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Internal Notes & Procurement Memo */}
            <div className="vendor-card">
              <div className="vendor-card-header">
                <h3 className="vendor-card-title">
                  <Icon name="fileText" size={16} color="var(--gold)" />
                  <span>Procurement & Account Notes</span>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={savingNotes || notesDraft === (v.notes || '')}
                  onClick={handleSaveNotes}
                >
                  {savingNotes ? 'Saving…' : 'Save Notes'}
                </Button>
              </div>
              <div className="vendor-card-body" style={{ padding: '16px 20px' }}>
                <Textarea
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  placeholder="Record supplier agreements, credit facilities, SLAs, special contact instructions…"
                  style={{ minHeight: 90, fontSize: 13, lineHeight: 1.5 }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BILLS & INVOICES TAB */}
      {activeTab === 'bills' && (
        <div className="vendor-card">
          <div className="vendor-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 className="vendor-card-title">
                <Icon name="receipt" size={16} color="var(--teal)" />
                <span>Supplier Bills ({filteredBills.length})</span>
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {['ALL', 'OVERDUE', 'UNPAID', 'PAID', 'DRAFT'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setBillStatusFilter(st)}
                    style={{
                      border: '1px solid var(--border)',
                      background: billStatusFilter === st ? 'var(--teal-l)' : 'var(--bg)',
                      color: billStatusFilter === st ? 'var(--teal)' : 'var(--ink2)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 'var(--r-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(`/finance/bills?supplier_id=${v.id}&new=1`)}>
              <Icon name="plus" size={14} />
              <span>Record Bill</span>
            </Button>
          </div>
          <div className="vendor-card-body" style={{ padding: 0 }}>
            {filteredBills.length === 0 ? (
              <div className="vendor-empty-state">
                <div className="vendor-empty-icon"><Icon name="receipt" size={24} /></div>
                <h4 className="vendor-empty-title">No bills found</h4>
                <p className="vendor-empty-desc">No supplier bills match the selected filter criteria.</p>
                <Button size="sm" onClick={() => navigate(`/finance/bills?supplier_id=${v.id}&new=1`)} style={{ marginTop: 8 }}>
                  Record a New Bill
                </Button>
              </div>
            ) : (
              <div className="vendor-table-wrapper">
                <table className="vendor-table">
                  <thead>
                    <tr>
                      <th>Bill Number</th>
                      <th>Bill Date</th>
                      <th>Due Date</th>
                      <th>Total Amount</th>
                      <th>Paid Amount</th>
                      <th>Remaining Balance</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.map(b => {
                      const bal = Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0));
                      const isOver = bal > 0 && ['POSTED', 'PARTIAL'].includes(b.status) && b.due_date && new Date(b.due_date) < new Date();
                      const displayStatus = isOver ? 'OVERDUE' : b.status;
                      const sc = BILL_STATUS_COLOR[displayStatus] || BILL_STATUS_COLOR.DRAFT;

                      return (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font)' }}>{b.bill_number}</td>
                          <td style={{ color: 'var(--ink2)' }}>{b.bill_date ? String(b.bill_date).slice(0, 10) : '—'}</td>
                          <td style={{ color: isOver ? 'var(--red)' : 'var(--ink2)', fontWeight: isOver ? 700 : 400 }}>
                            {b.due_date ? String(b.due_date).slice(0, 10) : '—'}
                          </td>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font)' }}>{fmt(Number(b.total) || 0, b.currency)}</td>
                          <td style={{ color: 'var(--green)', fontFamily: 'var(--font)' }}>{fmt(Number(b.paid_amount) || 0, b.currency)}</td>
                          <td style={{ fontWeight: 700, color: bal > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font)' }}>
                            {fmt(bal, b.currency)}
                          </td>
                          <td>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-sm)', ...sc }}>
                              {displayStatus}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/finance/bills')}>
                              <Icon name="arrowRight" size={13} />
                              <span>View in Bills</span>
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
      )}

      {/* 3. PURCHASE ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="vendor-card">
          <div className="vendor-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 className="vendor-card-title">
                <Icon name="shoppingCart" size={16} color="var(--blue)" />
                <span>Purchase Orders ({filteredPOs.length})</span>
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {['ALL', 'OPEN', 'RECEIVED', 'CANCELLED'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPoStatusFilter(st)}
                    style={{
                      border: '1px solid var(--border)',
                      background: poStatusFilter === st ? 'var(--blue-l)' : 'var(--bg)',
                      color: poStatusFilter === st ? 'var(--blue)' : 'var(--ink2)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 'var(--r-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(`/finance/purchase-orders?supplier_id=${v.id}&new=1`)}>
              <Icon name="plus" size={14} />
              <span>New PO</span>
            </Button>
          </div>
          <div className="vendor-card-body" style={{ padding: 0 }}>
            {filteredPOs.length === 0 ? (
              <div className="vendor-empty-state">
                <div className="vendor-empty-icon"><Icon name="shoppingCart" size={24} /></div>
                <h4 className="vendor-empty-title">No purchase orders found</h4>
                <p className="vendor-empty-desc">No purchase orders have been placed with this supplier under the current filter.</p>
                <Button size="sm" onClick={() => navigate(`/finance/purchase-orders?supplier_id=${v.id}&new=1`)} style={{ marginTop: 8 }}>
                  Create Purchase Order
                </Button>
              </div>
            ) : (
              <div className="vendor-table-wrapper">
                <table className="vendor-table">
                  <thead>
                    <tr>
                      <th>PO Number</th>
                      <th>Order Date</th>
                      <th>Expected Delivery</th>
                      <th>Currency</th>
                      <th>Total Value</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPOs.map(po => {
                      const sc = PO_STATUS_COLOR[po.status] || PO_STATUS_COLOR.DRAFT;
                      return (
                        <tr key={po.id}>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font)' }}>{po.po_number}</td>
                          <td style={{ color: 'var(--ink2)' }}>{po.order_date ? String(po.order_date).slice(0, 10) : '—'}</td>
                          <td style={{ color: 'var(--ink2)' }}>{po.expected_date ? String(po.expected_date).slice(0, 10) : '—'}</td>
                          <td style={{ color: 'var(--ink2)', fontWeight: 600 }}>{po.currency}</td>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font)' }}>{fmt(Number(po.total) || 0, po.currency)}</td>
                          <td>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-sm)', ...sc }}>
                              {po.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/finance/purchase-orders')}>
                              <Icon name="arrowRight" size={13} />
                              <span>View in POs</span>
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
      )}

      {/* 4. EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <div className="vendor-card">
          <div className="vendor-card-header">
            <h3 className="vendor-card-title">
              <Icon name="creditCard" size={16} color="var(--purple)" />
              <span>Operational Expenses Logged ({expenses.length})</span>
            </h3>
            <Button size="sm" onClick={() => navigate(`/finance/expenses/new?supplier_id=${v.id}`)}>
              <Icon name="plus" size={14} />
              <span>Log Expense</span>
            </Button>
          </div>
          <div className="vendor-card-body" style={{ padding: 0 }}>
            {expenses.length === 0 ? (
              <div className="vendor-empty-state">
                <div className="vendor-empty-icon"><Icon name="creditCard" size={24} /></div>
                <h4 className="vendor-empty-title">No expenses logged</h4>
                <p className="vendor-empty-desc">Direct cash, bank or mobile money payments attributed to this supplier will appear here.</p>
                <Button size="sm" onClick={() => navigate(`/finance/expenses/new?supplier_id=${v.id}`)} style={{ marginTop: 8 }}>
                  Log First Expense
                </Button>
              </div>
            ) : (
              <div className="vendor-table-wrapper">
                <table className="vendor-table">
                  <thead>
                    <tr>
                      <th>Expense Name</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th>Payment Mode</th>
                      <th>Amount</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 700 }}>{e.name}</td>
                        <td style={{ color: 'var(--ink2)' }}>{e.category}</td>
                        <td style={{ color: 'var(--ink2)' }}>{e.date.split('T')[0]}</td>
                        <td style={{ color: 'var(--ink3)' }}>{(e as any).payment_mode || 'Cash'}</td>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font)', color: e.is_revenue ? 'var(--green)' : 'var(--red)' }}>
                          {e.is_revenue ? '+' : '-'}{fmt(e.amount, 'TZS')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Button variant="ghost" size="sm" onClick={() => navigate('/finance/expenses')}>
                            <Icon name="arrowRight" size={13} />
                            <span>Details</span>
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
      )}

      {/* 5. PAYMENTS & REMITTANCE TAB */}
      {activeTab === 'payments' && (
        <div className="vendor-card">
          <div className="vendor-card-header">
            <h3 className="vendor-card-title">
              <Icon name="dollarSign" size={16} color="var(--green)" />
              <span>Payment & Remittance History ({payments.length})</span>
            </h3>
          </div>
          <div className="vendor-card-body" style={{ padding: 0 }}>
            {payments.length === 0 ? (
              <div className="vendor-empty-state">
                <div className="vendor-empty-icon"><Icon name="dollarSign" size={24} /></div>
                <h4 className="vendor-empty-title">No disbursements recorded</h4>
                <p className="vendor-empty-desc">When supplier bills are marked as paid or partial disbursements are recorded, they will show in this audit log.</p>
              </div>
            ) : (
              <div className="vendor-table-wrapper">
                <table className="vendor-table">
                  <thead>
                    <tr>
                      <th>Payment Date</th>
                      <th>Reference</th>
                      <th>Bill Reference</th>
                      <th>Payment Method</th>
                      <th>Amount Disbursed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--ink2)' }}>{p.payment_date ? String(p.payment_date).slice(0, 10) : '—'}</td>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font)' }}>{p.reference || 'Disbursement'}</td>
                        <td style={{ fontFamily: 'var(--font)' }}>{p.bill_number || 'Bill'}</td>
                        <td style={{ color: 'var(--ink2)' }}>{p.method || 'Bank Transfer'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font)' }}>
                          {fmt(Number(p.amount) || 0, p.currency || v.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. EDIT PROFILE & SETTINGS TAB */}
      {activeTab === 'edit' && (
        <div className="vendor-card">
          <div className="vendor-card-header">
            <h3 className="vendor-card-title">
              <Icon name="settings" size={16} color="var(--teal)" />
              <span>Edit Vendor Profile & Procurement Settings</span>
            </h3>
          </div>
          <div className="vendor-card-body">
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Vendor / Company Name *
                  </label>
                  <Input
                    required
                    value={editForm.name || ''}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Tanzania Ports Authority"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Vendor Category *
                  </label>
                  <Select
                    value={editForm.category || 'other'}
                    onValueChange={val => setEditForm(f => ({ ...f, category: val as VendorCategory }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{VENDOR_CATEGORY_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Account Status
                  </label>
                  <Select
                    value={editForm.status || 'active'}
                    onValueChange={val => setEditForm(f => ({ ...f, status: val as VendorStatus }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Contact Person Name
                  </label>
                  <Input
                    value={editForm.contactPerson || ''}
                    onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))}
                    placeholder="Key account manager or representative"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Billing / Corporate Email
                  </label>
                  <Input
                    type="email"
                    value={editForm.email || ''}
                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="billing@supplier.com"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Phone Number
                  </label>
                  <Input
                    value={editForm.phone || ''}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+255 700 000 000"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Payment Terms
                  </label>
                  <Select
                    value={editForm.paymentTerms || 'net_30'}
                    onValueChange={val => setEditForm(f => ({ ...f, paymentTerms: val as PaymentTerms }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TERMS.map(t => <SelectItem key={t} value={t}>{PAYMENT_TERMS_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Physical Street Address
                  </label>
                  <Input
                    value={editForm.address || ''}
                    onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Street, building, suite"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    City & Country
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Input
                      value={editForm.city || ''}
                      onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="City"
                    />
                    <Input
                      value={editForm.country || 'Tanzania'}
                      onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))}
                      placeholder="Country"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Reference Code
                    </label>
                    <Input
                      value={editForm.refCode || ''}
                      onChange={e => setEditForm(f => ({ ...f, refCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                      placeholder="Auto"
                      maxLength={20}
                      style={{ fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Tax ID / TIN Number
                    </label>
                    <Input
                      value={editForm.taxId || ''}
                      onChange={e => setEditForm(f => ({ ...f, taxId: e.target.value }))}
                      placeholder="TIN-000000000"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Default Currency
                  </label>
                  <Select
                    value={editForm.currency || 'TZS'}
                    onValueChange={val => setEditForm(f => ({ ...f, currency: val }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['TZS', 'USD', 'EUR', 'KES', 'GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Settlement Bank Name
                  </label>
                  <Input
                    value={editForm.bankName || ''}
                    onChange={e => setEditForm(f => ({ ...f, bankName: e.target.value }))}
                    placeholder="e.g. CRDB Bank, NMB Bank"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Bank Account Number
                  </label>
                  <Input
                    value={editForm.bankAccount || ''}
                    onChange={e => setEditForm(f => ({ ...f, bankAccount: e.target.value }))}
                    placeholder="Account number or IBAN"
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                    Internal Procurement Notes & Policy
                  </label>
                  <Textarea
                    value={editForm.notes || ''}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Specific notes on delivery agreements, credit terms or discount contracts…"
                    style={{ minHeight: 80 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => handleTabChange('overview')}
                  className="btn btn-secondary"
                  data-ui-native-button=""
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editForm.name?.trim()}
                  className="btn btn-primary"
                  data-ui-native-button=""
                >
                  <Icon name="check" size={14} />
                  <span>{savingEdit ? 'Saving Changes…' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
