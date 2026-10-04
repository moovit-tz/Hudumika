import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { apiFetch, apiDownload, apiFetchBlob } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { IconName } from '../../components/Icon.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Tip } from '../../components/ui/tooltip.js';
import { CompanyAvatar } from '../../components/PersonAvatar.js';
import { AvatarPicker } from '../../components/AvatarPicker.js';
import { EntityPicker } from '../../components/EntityPicker.js';
import { mapApiInvoice, invoiceTotals } from '../Billing.js';
import type { ExpenseListItem } from '../Expenses.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '../../components/ui/dialog.js';
import { showConfirm } from '../../lib/confirm.js';
import { SkeletonPage } from '../../components/ui/skeleton.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { getCompany } from '../../data/companyStore.js';
import { ActivityTimeline } from '../../components/crm/ActivityTimeline.js';
import { ComposeEmailButton } from '../../components/crm/ComposeEmailButton.js';
import { StartCallButton } from '../../components/crm/StartCallButton.js';
import { CustomFieldsPanel } from '../../components/crm/CustomFieldsPanel.js';
import type { Customer } from './customer-types.js';
import { fmtDateShort, maskTin, fileTypeStyle } from './customer-types.js';

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

/* ── Avatar helper ── */
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <CompanyAvatar
      name={name}
      size={size}
      shape="square"
      style={{ borderRadius: 'var(--r)', boxShadow: 'var(--elev-sm)', border: '1px solid var(--border)' }}
    />
  );
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
      <div onClick={handleCopy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', background: 'var(--blue-l)', borderRadius: 'var(--r-sm)', padding: '1px 4px' }}>TIN</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--ink)' }}>{masked}</span>
        {copied
          ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>✓</span>
          : <Icon name="copy" size={11} style={{ color: 'var(--ink3)', opacity: 0.65 }} />}
      </div>
    </Tip>
  );
}

/* ── View field ── */
function ViewField({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--font)' : 'var(--font)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </div>
    </div>
  );
}

/* ── Hero stat chip ── */
function HeroStat({ icon, label, value, color, bg, muted }: { icon: IconName; label: string; value: string | number; color: string; bg: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={16} color={color} strokeWidth={1.75} />
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: muted ? 'var(--ink3)' : 'var(--ink)', fontStyle: muted ? 'italic' : 'normal', lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CustomerDetailPage
══════════════════════════════════════════ */
export const CustomerDetailPage: React.FC = () => {
  const { id, tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [selected, setSelected] = useState<Customer | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);

  useEffect(() => {
    apiFetch('/v1/finance/expenses').then((res: any) => setExpenses(res?.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setFetchLoading(true);
    apiFetch(`/v1/customers/${id}`)
      .then((res: any) => { setSelected(res); setForm({ ...res }); })
      .catch(() => navigate('/crm/customers', { replace: true }))
      .finally(() => setFetchLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Tab state ── */
  const [mainTab, setMainTab] = useState(tabParam || 'overview');
  const [financeTab, setFinanceTab] = useState('invoices');
  const [shipTab, setShipTab] = useState('shipments');
  const [supplyTab, setSupplyTab] = useState('projects');

  useEffect(() => {
    if (tabParam && tabParam !== mainTab) setMainTab(tabParam);
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
  const [sendingClaimCode, setSendingClaimCode] = useState(false);

  /* ── Shipments ── */
  const [custShipments, setCustShipments] = useState<any[]>([]);
  const [shipLoading, setShipLoading] = useState(false);

  /* ── Notes ── */
  const [notes, setNotes] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  /* ── Finance ── */
  const [custInvoices, setCustInvoices] = useState<any[]>([]);
  const [custPayments, setCustPayments] = useState<any[]>([]);
  const [custCreditNotes, setCustCreditNotes] = useState<any[]>([]);
  const [custQuotations, setCustQuotations] = useState<any[]>([]);
  const [finLoading, setFinLoading] = useState(false);

  /* ── Supply chain ── */
  const [custTickets, setCustTickets] = useState<any[]>([]);
  const [custProjects, setCustProjects] = useState<any[]>([]);
  const [supplyLoading, setSupplyLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);

  /* ── SEAL bonded storage ── */
  const [custSealLots, setCustSealLots] = useState<any[]>([]);
  const [sealLoading, setSealLoading] = useState(false);

  /* ── Documents ── */
  const [linkedFiles, setLinkedFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [defaultDriveId, setDefaultDriveId] = useState<string | null>(null);
  const [customerFolder, setCustomerFolder] = useState<{ customerId: string; id: string; drive_id: string; name: string; parent: { id: string; name: string } | null } | null>(null);
  const [resolvingFolder, setResolvingFolder] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [showLinkFileModal, setShowLinkFileModal] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [fileSearchResults, setFileSearchResults] = useState<any[]>([]);
  const [fileSearching, setFileSearching] = useState(false);
  const [fileLinking, setFileLinking] = useState<string | null>(null);

  /* ── Signatures ── */
  const [custSignEnvelopes, setCustSignEnvelopes] = useState<any[]>([]);
  const [signLoading, setSignLoading] = useState(false);
  const [showSendSignModal, setShowSendSignModal] = useState(false);
  const [signFileSearch, setSignFileSearch] = useState('');
  const [signFileSearchResults, setSignFileSearchResults] = useState<any[]>([]);
  const [signFileSearching, setSignFileSearching] = useState(false);
  const [sendingForSignature, setSendingForSignature] = useState<string | null>(null);

  /* ── Portal invite ── */
  const [inviteStatus, setInviteStatus] = useState<{ state: 'active' | 'invited' | 'none'; email?: string; expires_at?: string } | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  /* ── Contacts ── */
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [contactSaving, setContactSaving] = useState(false);

  /* ── Data loaders ── */
  const loadShipments = useCallback(async (customerId: string) => {
    setShipLoading(true);
    try {
      const res = await apiFetch(`/v1/shipments?customer_id=${customerId}&limit=50`);
      setCustShipments(res.data ?? res ?? []);
    } catch { setCustShipments([]); } finally { setShipLoading(false); }
  }, []);

  useEffect(() => {
    if (selected) loadShipments(selected.id);
  }, [selected, loadShipments]);

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
    if (selected && mainTab === 'supply') loadTickets(selected.id);
  }, [selected, mainTab, loadTickets]);

  const loadProjects = useCallback(async (customerId: string) => {
    setProjectsLoading(true);
    try {
      const res = await apiFetch(`/v1/tasks/projects?customer_id=${customerId}`).catch(() => ({ data: [] }));
      setCustProjects(Array.isArray(res) ? res : (res?.data ?? []));
    } catch { /* empty */ } finally { setProjectsLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && mainTab === 'supply' && supplyTab === 'projects') loadProjects(selected.id);
  }, [selected, mainTab, supplyTab, loadProjects]);

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

  const ensureDefaultDrive = useCallback(async () => {
    if (defaultDriveId) return defaultDriveId;
    const drives = await apiFetch('/v1/drives').catch(() => []);
    const dvId = Array.isArray(drives) && drives.length ? drives[0].id : null;
    setDefaultDriveId(dvId);
    return dvId;
  }, [defaultDriveId]);

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
      const folder = await resolveCustomerFolder(selected.id);
      const driveId = folder?.drive_id ?? await ensureDefaultDrive();
      if (!driveId) throw new Error('No Drive available to upload into');
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const qs = new URLSearchParams({ drive_id: driveId, entity_type: 'customer', entity_id: selected.id });
        if (folder) qs.set('parent_id', folder.id);
        await apiFetch(`/v1/files/upload?${qs.toString()}`, { method: 'POST', body: fd });
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
      const blob = await apiFetchBlob(`/v1/files/${file.id}/download`);
      const documentData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve((ev.target?.result as string) ?? '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(blob);
      });
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

  if (fetchLoading) return <SkeletonPage variant="table" />;
  if (!selected) return null;

  const sel = selected;
  const shipCount = sel.shipment_count ?? custShipments.length;
  const status = sel.account_status || 'Active';

  const btnS: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    border: '1px solid var(--border)', borderRadius: 'var(--r)',
    background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5,
    fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  };

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
              { label: 'Total Shipments',  value: shipCount, icon: 'ship' as IconName, color: 'var(--blue)', bg: 'var(--blue-l)' },
              { label: 'Active Shipments', value: shipLoading ? '…' : activeShipmentsCount, icon: 'activity' as IconName, color: 'var(--teal)', bg: 'var(--teal-l)' },
              { label: 'Invoices',         value: finLoading ? '…' : custInvoices.length, icon: 'fileText' as IconName, color: 'var(--purple)', bg: 'var(--purple-l)' },
              { label: 'Outstanding (TZS)',value: finLoading ? '…' : ovOutstanding.toLocaleString('en'), icon: 'alertCircle' as IconName, color: 'var(--red)', bg: 'var(--red-l)' },
            ].map(kpi => (
              <div key={kpi.label} className="crm-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 'var(--r)', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={kpi.icon} size={18} color={kpi.color} strokeWidth={1.75} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{kpi.value}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Carbon footprint */}
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Carbon Footprint</div>
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{totalCo2.toLocaleString('en')} kg</div>
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

          {/* Daily report toggle */}
          <div className="crm-card" style={{ marginBottom: 24, padding: '4px 18px' }}>
            <SwitchRow
              title="Daily shipment progress reports"
              description="Sends today's PDF report by email and a live-status link by WhatsApp, ~21:00 EAT, for every active shipment unless that shipment overrides it."
              checked={sel.daily_report_enabled !== false}
              onCheckedChange={(enabled) => {
                apiFetch(`/v1/customers/${sel.id}`, { method: 'PATCH', body: JSON.stringify({ daily_report_enabled: enabled }) })
                  .then(() => setSelected(prev => prev ? { ...prev, daily_report_enabled: enabled } : prev))
                  .catch(err => showAlert(err.message || 'Failed to update daily report setting'));
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 20 }}>
            {/* Recent shipments */}
            <div className="crm-card">
              <div className="crm-card-header">
                <span className="crm-card-title">Recent Shipments</span>
                <button type="button" onClick={() => handleTabChange('shipments')} style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>View all →</button>
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
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="ship" size={14} color="var(--teal)" strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ref_number || 'CLR-???'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{s.goods_desc || 'No description'}</div>
                  </div>
                  <Badge variant={s.stage === 'RELEASED' || s.stage === 'CLOSED' ? 'success' : s.stage === 'CUSTOMS' ? 'warning' : 'info'} className="text-[11px] font-semibold">
                    {s.stage || 'DRAFT'}
                  </Badge>
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                </Link>
              ))}
            </div>

            {/* Info + quick actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="crm-card" style={{ padding: '18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 14 }}>Key Information</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Contact Person',    value: sel.contact_name },
                    { label: 'Email',             value: sel.email },
                    { label: 'Phone / WhatsApp',  value: sel.phone_wa },
                    { label: 'TIN Number',        value: sel.tax_id, mono: true },
                    { label: 'Preferred Port',    value: sel.preferred_port },
                    { label: 'Freight Terms',     value: sel.freight_terms },
                    { label: 'Credit Terms',      value: sel.credit_days ? `Net ${sel.credit_days} days` : undefined },
                  ].map(({ label, value, mono }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 12.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontFamily: mono ? 'var(--font)' : 'var(--font)', textAlign: 'right', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</span>
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
                      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--hover-bg)'),
                      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--bg)'),
                    };
                    const actions: { label: string; icon: IconName; path?: string; action?: () => void }[] = [
                      { label: 'Create Invoice',     icon: 'fileText'   as IconName, path: `/billing?customer_id=${sel.id}&new=1` },
                      { label: 'Add Shipment',       icon: 'ship'       as IconName, action: () => handleTabChange('shipments') },
                      { label: 'Record Payment',     icon: 'creditCard' as IconName, action: () => { handleTabChange('finance'); setFinanceTab('payments'); } },
                      { label: 'Generate Statement', icon: 'barChart'   as IconName, action: () => { handleTabChange('finance'); setFinanceTab('statement'); } },
                      {
                        label: inviteStatus?.state === 'active' ? 'Portal: Active' : inviteStatus?.state === 'invited' ? 'Portal: Invite Pending' : 'Invite to Portal',
                        icon: 'userPlus' as IconName,
                        action: () => { setInviteEmail(sel.email || ''); setShowInviteDialog(true); },
                      },
                    ];
                    return (
                      <>
                        <ComposeEmailButton subjectType="customer" subjectId={sel.id} onSent={() => handleTabChange('activity')}>
                          <button type="button" style={itemStyle} {...hoverHandlers}>
                            <Icon name="mail" size={13} color="var(--teal)" strokeWidth={1.75} /> Send Email
                          </button>
                        </ComposeEmailButton>
                        <StartCallButton subjectType="customer" subjectId={sel.id} phone={sel.phone_wa} onLogged={() => handleTabChange('activity')}>
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

    /* ── Activity ── */
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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: sendingClaimCode ? 'default' : 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}
                  title="Send a one-time code this customer can enter in their own organization portal to self-link.">
                  <Icon name="link" size={14} strokeWidth={1.75} /> {sendingClaimCode ? 'Sending…' : 'Send Claim Code'}
                </button>
              )}
              <button type="button" onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                <Icon name="edit" size={14} strokeWidth={1.75} /> Edit Profile
              </button>
            </div>

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
                    hint="Links this customer to one shared identity across every tenant serving them."
                  />
                </div>
              </div>
            </Section>

            <Section title="Tax & Compliance">
              <div className="prof-grid">
                <div className="prof-field"><label className="prof-label">TIN Number</label><input className="prof-input" value={form.tax_id || ''} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} placeholder="xxx-xxx-xxx" style={{ fontFamily: 'var(--font)' }} /></div>
                <div className="prof-field"><label className="prof-label">VAT / VRN Number</label><input className="prof-input" value={form.vat_number || ''} onChange={e => setForm(p => ({ ...p, vat_number: e.target.value }))} placeholder="10-xxxxxxx-x" style={{ fontFamily: 'var(--font)' }} /></div>
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
                <div className="prof-field"><label className="prof-label">TANCIS Registration</label><input className="prof-input" value={form.tancis_number || ''} onChange={e => setForm(p => ({ ...p, tancis_number: e.target.value }))} placeholder="TANCIS importer code…" style={{ fontFamily: 'var(--font)' }} /></div>
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
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Contact Persons</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddContact(true)}>+ Add Contact</button>
          </div>

          {sel.contact_name ? (
            <div style={{ marginBottom: 14 }}>
              <SectionCard padded={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                  <Avatar name={sel.contact_name} size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{sel.contact_name}</div>
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
                          style={{ fontSize: 12.5, color: 'var(--ink2)', fontFamily: 'var(--font)', textDecoration: 'none' }}
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
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', cursor: 'pointer', fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                      Edit
                    </button>
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : (
            <EmptyState icon="users" title="No contacts added" sub="Add contact persons for this customer" />
          )}

          {/* Portal Invite dialog */}
          {showInviteDialog && (
            <Dialog open onOpenChange={open => { if (!open) setShowInviteDialog(false); }}>
              <DialogContent size="sm">
                <DialogHeader>
                  <DialogTitle>Invite to Customer Portal</DialogTitle>
                  <DialogDescription>
                    {inviteStatus?.state === 'active'
                      ? `${sel.name} already has an active portal account (${inviteStatus.email}).`
                      : inviteStatus?.state === 'invited'
                      ? `A pending invite was sent to ${inviteStatus.email}. Sending again will revoke it and create a new link.`
                      : `Send ${sel.name} a link to set up their portal login.`}
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  {inviteStatus?.state !== 'active' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Email address</label>
                      <input type="email" className="input-field" placeholder={sel.email || 'customer@example.com'}
                        value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ width: '100%' }} />
                      <p style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6 }}>
                        Link valid for 7 days. Leave blank to use the customer's email on file{sel.email ? ` (${sel.email})` : ''}.
                      </p>
                    </div>
                  )}
                </DialogBody>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
                  {inviteStatus?.state !== 'active' && (
                    <Button size="sm" disabled={sendingInvite} onClick={async () => {
                      setSendingInvite(true);
                      try {
                        await apiFetch(`/v1/customers/${sel.id}/invite`, {
                          method: 'POST',
                          body: JSON.stringify({ email: inviteEmail || sel.email }),
                        });
                        showAlert(`Invite sent to ${inviteEmail || sel.email}`, { variant: 'success' });
                        setShowInviteDialog(false);
                        const fresh: any = await apiFetch(`/v1/customers/${sel.id}/invite-status`).catch(() => null);
                        if (fresh) setInviteStatus(fresh);
                      } catch (err: any) {
                        showAlert(err.message || 'Failed to send invite');
                      } finally {
                        setSendingInvite(false);
                      }
                    }}>
                      {sendingInvite ? 'Sending…' : inviteStatus?.state === 'invited' ? 'Resend Invite' : 'Send Invite'}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Add / Edit Contact modal */}
          {showAddContact && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 440, padding: 24, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{contactForm.name ? 'Edit Contact' : 'Add Contact Person'}</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAddContact(false); setContactForm({ name: '', email: '', phone: '', role: '' }); }}>×</button>
                </div>
                <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Full Name *',       key: 'name',  placeholder: 'John Doe',            required: true  },
                    { label: 'Email',             key: 'email', placeholder: 'john@company.co.tz',  required: false },
                    { label: 'Phone / WhatsApp',  key: 'phone', placeholder: '+255712345678',        required: false },
                    { label: 'Role / Title',      key: 'role',  placeholder: 'Procurement Manager', required: false },
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
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Internal Notes</span>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Only visible to your team</span>
          </div>
          <textarea className="prof-input" style={{ height: 220, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.7 }}
            placeholder={`Add internal notes about ${sel.name} — payment behavior, preferences, special instructions…`}
            value={notes} onChange={e => setNotes(e.target.value)} />
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
      const outstanding = totalInvoiced - totalPaid - totalCredited;

      const INV_STATUS: Record<string, { bg: string; color: string }> = {
        paid:    { bg: 'var(--green-l)',  color: 'var(--green)'  },
        unpaid:  { bg: 'var(--gold-l)',   color: 'var(--gold)'   },
        overdue: { bg: 'var(--red-l)',    color: 'var(--red)'    },
        draft:   { bg: 'var(--bg)',       color: 'var(--ink3)'   },
        partial: { bg: 'var(--purple-l)', color: 'var(--purple)' },
      };

      return (
        <div>
          <SubTabBar tabs={FIN_TABS} active={financeTab} onChange={setFinanceTab} />

          {financeTab === 'invoices' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{finLoading ? 'Loading…' : `${custInvoices.length} invoice${custInvoices.length !== 1 ? 's' : ''}`}</span>
                <Link to={`/billing?customer_id=${sel.id}&new=1`} className="btn btn-primary btn-sm">+ Create Invoice</Link>
              </div>
              {finLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading invoices…</div>}
              {!finLoading && custInvoices.length === 0 && <div style={{ padding: '32px 28px' }}><EmptyState icon="fileText" title="No invoices yet" sub="Invoices issued to this customer will appear here" /></div>}
              {!finLoading && custInvoices.length > 0 && (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ minWidth: 560 }}>
                    <thead><tr>
                      <th>Invoice</th>
                      <th className="col-hide-sm">Date</th>
                      <th className="col-hide-sm">Due</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr></thead>
                    <tbody>
                      {custInvoices.map((inv: any) => {
                        const st = (inv.status || 'draft').toLowerCase();
                        const sc = INV_STATUS[st] || INV_STATUS.draft;
                        return (
                          <tr key={inv.id}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)' }}>{inv.invoice_number || inv.ref || `INV-${inv.id?.slice(-5)}`}</div>
                              {inv.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{inv.description}</div>}
                            </td>
                            <td className="col-hide-sm">{inv.bill_date ? new Date(inv.bill_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="col-hide-sm">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font)', textAlign: 'right' }}>{invoiceTotals(mapApiInvoice(inv)).grandTotalTZS.toLocaleString()}</td>
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

          {financeTab === 'payments' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{finLoading ? 'Loading…' : `${custPayments.length} payment${custPayments.length !== 1 ? 's' : ''}`}</span>
                <Link to={`/billing?customer_id=${sel.id}`} className="btn btn-primary btn-sm">+ Record Payment</Link>
              </div>
              {finLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading payments…</div>}
              {!finLoading && custPayments.length === 0 && <div style={{ padding: '32px 28px' }}><EmptyState icon="creditCard" title="No payments recorded" sub="Payments received from this customer will appear here" /></div>}
              {!finLoading && custPayments.length > 0 && (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ minWidth: 520 }}>
                    <thead><tr>
                      <th>Reference</th>
                      <th className="col-hide-sm">Date</th>
                      <th className="col-hide-sm">Method</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {custPayments.map((p: any) => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)' }}>{p.invoice_number || `PAY-${p.id?.slice(-5)}`}</td>
                          <td className="col-hide-sm">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td className="col-hide-sm">{p.payment_method || p.method || '—'}</td>
                          <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font)', textAlign: 'right' }}>+{Number(p.amount ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {financeTab === 'statement' && (() => {
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
                    <button type="button" className="btn btn-secondary btn-sm" disabled={transactions.length === 0}
                      onClick={() => openStatementPrintWindow(sel, transactions, { totalInvoiced, totalPaid, outstanding })}>
                      <Icon name="printer" size={13} /> Print Statement
                    </button>
                    <button type="button" className="btn btn-primary btn-sm"
                      onClick={() => apiDownload(`/v1/customers/${sel.id}/statement/pdf`, `statement-${sel.name}.pdf`).catch((err: any) => showAlert(err.message || 'Download failed'))}>
                      <Icon name="download" size={13} /> Download PDF
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
                  {[
                    { label: 'Total Invoiced', value: totalInvoiced, color: 'var(--ink)' },
                    { label: 'Total Paid',     value: totalPaid,     color: 'var(--green)' },
                    { label: 'Outstanding',    value: outstanding,   color: outstanding > 0 ? 'var(--red)' : 'var(--green)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--font)' }}>{s.value.toLocaleString()}</div>
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
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)' }}>{tx.ref}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1, textTransform: 'capitalize' }}>{tx.type}</div>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{tx.date ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', color: tx.debit ? 'var(--red)' : 'var(--green)', width: 130, textAlign: 'right' }}>{tx.debit ? '-' : '+'}{tx.amount.toLocaleString()}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', color: tx.balance >= 0 ? 'var(--ink)' : 'var(--red)', width: 130, textAlign: 'right' }}>{tx.balance.toLocaleString()}</span>
                      </div>
                    ))}
                  </SectionCard>
                )}
              </div>
            );
          })()}

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
                    <div style={{ flex: 2 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.name}</div></div>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{e.date.split('T')[0]}</div>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink3)' }}>{e.category}</span></div>
                    <div style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700, color: e.is_revenue ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{e.is_revenue ? '+' : '-'}{(e.amount || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px 28px' }}><EmptyState icon="receipt" title="No expenses" sub="Expenses linked to this customer will appear here" /></div>
            )
          )}

          {financeTab === 'proposals' && (
            finLoading ? (
              <div style={{ padding: '32px 28px' }}><SectionLoading /></div>
            ) : custQuotations.length === 0 ? (
              <div style={{ padding: '32px 28px' }}><EmptyState icon="clipboard" title="No quotations" sub="Quotations issued to this customer will appear here" /></div>
            ) : (
              <div>
                <div style={{ display: 'flex', padding: '12px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)' }}>
                  <div style={{ flex: 1 }}>Number</div>
                  <div style={{ flex: 1 }}>Date</div>
                  <div style={{ flex: 2 }}>Subject</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Amount</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Status</div>
                </div>
                {custQuotations.map((q: any) => {
                  const total = (q.items ?? []).reduce((s: number, l: any) => s + Number(l.qty ?? 1) * Number(l.unit_price ?? l.rate ?? 0), 0);
                  const statusColor: Record<string, { bg: string; color: string }> = {
                    DRAFT:    { bg: 'var(--bg)',      color: 'var(--ink3)' },
                    SENT:     { bg: 'var(--blue-l)',  color: 'var(--blue)' },
                    ACCEPTED: { bg: 'var(--green-l)', color: 'var(--green)' },
                    REJECTED: { bg: 'var(--red-l)',   color: 'var(--red)'  },
                    EXPIRED:  { bg: 'var(--gold-l)',  color: 'var(--gold)' },
                  };
                  const sc = statusColor[(q.status ?? 'DRAFT').toUpperCase()] ?? statusColor.DRAFT;
                  return (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                      <div style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{q.quote_number ?? q.number ?? '—'}</div>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{q.issue_date || q.created_at ? new Date(q.issue_date || q.created_at).toLocaleDateString('en-GB') : '—'}</div>
                      <div style={{ flex: 2, fontSize: 12.5, color: 'var(--ink2)' }}>{q.subject || q.title || '—'}</div>
                      <div style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>{total.toLocaleString()}</div>
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r)', background: sc.bg, color: sc.color }}>{q.status ?? 'DRAFT'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {financeTab === 'credit-notes' && (
            custCreditNotes.length === 0 ? (
              <div style={{ padding: '32px 28px' }}><EmptyState icon="minusCircle" title="No credit notes" sub="Issued credit notes will appear here" /></div>
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
                      <div style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.credit_note_number}</div>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{c.credit_date ? new Date(c.credit_date).toLocaleDateString('en-GB') : '—'}</div>
                      <div style={{ flex: 2, fontSize: 12.5, color: 'var(--ink2)' }}>{c.reason || '—'}</div>
                      <div style={{ flex: 1, fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700, color: 'var(--red)', textAlign: 'right' }}>-{total.toLocaleString()}</div>
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
                    {s.bl_number && <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontFamily: 'var(--font)', marginTop: 1 }}>B/L: {s.bl_number}</div>}
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
                    <span style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700 }}>{s.tansad_number}</span>
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
        containers: { icon: 'package', text: 'Container tracking coming soon', sub: 'Per-container arrival, free-day status, and movement tracking will be connected here' },
        demurrage:  { icon: 'timer',   text: 'Demurrage tracking coming soon', sub: 'Free-day expiry and demurrage accrual will be tracked here once the module is configured' },
        permits:    { icon: 'award',   text: 'Permit tracking coming soon', sub: "Import and export permits linked to this customer's shipments will appear here" },
      };
      const sm = shipMeta[shipTab] || shipMeta.containers;
      return (
        <div>
          <SubTabBar tabs={SHIP_TABS} active={shipTab} onChange={setShipTab} />
          <div style={{ padding: '32px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-l)', padding: '3px 10px', borderRadius: 20, marginBottom: 4 }}>
                <Icon name="clock" size={11} /> Coming Soon
              </div>
              <EmptyState icon={sm.icon} title={sm.text} sub={sm.sub} />
            </div>
          </div>
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
        open:        { bg: 'var(--blue-l)',  color: 'var(--blue)'  },
        in_progress: { bg: 'var(--teal-l)',  color: 'var(--teal)'  },
        resolved:    { bg: 'var(--green-l)', color: 'var(--green)' },
        closed:      { bg: 'var(--bg)',      color: 'var(--ink3)'  },
        escalated:   { bg: 'var(--red-l)',   color: 'var(--red)'   },
      };

      return (
        <div>
          <SubTabBar tabs={SUPPLY_TABS} active={supplyTab} onChange={setSupplyTab} />

          {supplyTab === 'tickets' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {supplyLoading ? 'Loading…' : `${custTickets.length} ticket${custTickets.length !== 1 ? 's' : ''}`}
                </span>
                <Link to="/support/tickets" className="btn btn-primary btn-sm">+ New Ticket</Link>
              </div>
              {supplyLoading && <div style={{ padding: '32px 28px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading tickets…</div>}
              {!supplyLoading && custTickets.length === 0 && <div style={{ padding: '32px 28px' }}><EmptyState icon="headphones" title="No support tickets" sub="Support tickets from this customer will appear here" /></div>}
              {!supplyLoading && custTickets.length > 0 && custTickets.map((t: any) => {
                const st = (t.status || 'open').toLowerCase().replace(' ', '_');
                const sc = TICKET_STATUS[st] || TICKET_STATUS.open;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="headphones" size={14} color="var(--blue)" strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || t.title || `Ticket #${t.id?.slice(-5)}`}</div>
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

          {supplyTab === 'projects' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {projectsLoading ? 'Loading…' : `${custProjects.length} project${custProjects.length !== 1 ? 's' : ''}`}
                </span>
                <Link to="/projects" className="btn btn-primary btn-sm">+ New Project</Link>
              </div>
              {projectsLoading && <div style={{ padding: '32px 28px' }}><SectionLoading /></div>}
              {!projectsLoading && custProjects.length === 0 && <div style={{ padding: '32px 28px' }}><EmptyState icon="layers" title="No projects" sub="Projects assigned to this customer will appear here" /></div>}
              {!projectsLoading && custProjects.map((p: any) => {
                const taskDone = p.task_done_count ?? 0;
                const taskTotal = p.task_count ?? 0;
                const pct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;
                const statusColor: Record<string, { bg: string; color: string }> = {
                  active:    { bg: 'var(--green-l)', color: 'var(--green)' },
                  on_hold:   { bg: 'var(--gold-l)',  color: 'var(--gold)'  },
                  completed: { bg: 'var(--teal-l)',  color: 'var(--teal)'  },
                  cancelled: { bg: 'var(--red-l)',   color: 'var(--red)'   },
                };
                const sc = statusColor[(p.status ?? 'active').toLowerCase()] ?? statusColor.active;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--teal)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
                        {p.ref ? `${p.ref} · ` : ''}{taskTotal} task{taskTotal !== 1 ? 's' : ''}
                        {p.target_date ? ` · Due ${new Date(p.target_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                      </div>
                    </div>
                    {taskTotal > 0 && (
                      <div style={{ width: 60 }}>
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--bg)' }}>
                          <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: 'var(--green)' }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink3)', textAlign: 'right', marginTop: 2 }}>{pct}%</div>
                      </div>
                    )}
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {(p.status ?? 'Active').replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {supplyTab === 'tasks' && (
            <div style={{ padding: '32px 28px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-l)', padding: '3px 10px', borderRadius: 20, marginBottom: 4 }}>
                  <Icon name="info" size={11} /> Via Projects
                </div>
                <EmptyState icon="check" title="Tasks live inside projects" sub="Tasks assigned to this customer's projects are visible inside each project. Open a project above to see its tasks." />
                {custProjects.length > 0 && (
                  <Link to="/projects" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Open Projects App</Link>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Bonded Storage ── */
    if (mainTab === 'seal') {
      const SEAL_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
        FOREIGN_DUTY_SUSPENDED: { bg: 'var(--teal-l)',  color: 'var(--teal)'  },
        FOREIGN_DUTY_PAID:      { bg: 'var(--blue-l)',  color: 'var(--blue)'  },
        EXPORTED:               { bg: 'var(--green-l)', color: 'var(--green)' },
        SEIZED:                 { bg: 'var(--red-l)',   color: 'var(--red)'   },
        ABANDONED:              { bg: 'var(--red-l)',   color: 'var(--red)'   },
      };
      const totalAtRisk = custSealLots.reduce((s: number, l: any) => s + (l.dutyAtRisk || 0) + (l.taxAtRisk || 0), 0);
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Bonded Warehouse Lots (SEAL)</span>
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

    /* ── Documents ── */
    if (mainTab === 'documents') {
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Documents</span>
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
          {!filesLoading && linkedFiles.length === 0 && <EmptyState icon="folder" title="No documents linked yet" sub="Upload a new file or link one already sitting in Drive" />}
          {!filesLoading && linkedFiles.length > 0 && (
            <SectionCard padded={false}>
              {linkedFiles.map((f: any, i: number) => {
                const ft = fileTypeStyle(f.type);
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < linkedFiles.length - 1 ? '1px solid var(--border)' : 'none' }}>
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
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                      <Icon name="download" size={13} /> Download
                    </button>
                    <button type="button" onClick={() => unlinkFile(f.id, f.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}
                      title="Remove from this customer (file stays in Drive)" aria-label={`Remove ${f.name} from this customer`}>
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                );
              })}
            </SectionCard>
          )}

          {showLinkFileModal && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowLinkFileModal(false); setFileSearch(''); setFileSearchResults([]); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 480, padding: 24, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Link a file from Drive</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowLinkFileModal(false); setFileSearch(''); setFileSearchResults([]); }}>×</button>
                </div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" className="input-field" placeholder="Search files by name…" autoFocus style={{ paddingLeft: 32 }}
                    value={fileSearch} onChange={e => setFileSearch(e.target.value)} />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {fileSearching && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Searching…</div>}
                  {!fileSearching && fileSearch.trim() && fileSearchResults.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No matching files in Drive</div>}
                  {!fileSearching && !fileSearch.trim() && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Type to search every file in your Drive</div>}
                  {fileSearchResults.map(f => {
                    const ft = fileTypeStyle(f.type);
                    const alreadyLinked = f.entity_type === 'customer' && f.entity_id === sel.id;
                    return (
                      <button key={f.id} type="button" disabled={alreadyLinked || fileLinking === f.id}
                        onClick={() => linkExistingFile(f.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 8px', border: 'none', borderRadius: 'var(--r)', background: 'none', cursor: alreadyLinked ? 'default' : 'pointer', fontFamily: 'var(--font)' }}
                        onMouseEnter={e => { if (!alreadyLinked) e.currentTarget.style.background = 'var(--hover-bg)'; }}
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
      return (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Signatures</span>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Documents sent to {sel.name} for signature via Hudumika Sign.</div>
            </div>
            <button type="button" onClick={() => setShowSendSignModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px solid var(--teal)', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 }}>
              <Icon name="stamp" size={13} strokeWidth={2} /> Send for Signature
            </button>
          </div>

          {signLoading && <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading signatures…</div>}
          {!signLoading && custSignEnvelopes.length === 0 && <EmptyState icon="stamp" title="No documents sent yet" sub="Send a file already linked in Documents for this customer to sign" />}
          {!signLoading && custSignEnvelopes.length > 0 && (
            <SectionCard padded={false}>
              {custSignEnvelopes.map((e: any, i: number) => (
                <Link key={e.id} to={`/sign/envelope/${e.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < custSignEnvelopes.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
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

          {showSendSignModal && (
            <div className="modal-overlay" onClick={ev => { if (ev.target === ev.currentTarget) { setShowSendSignModal(false); setSignFileSearch(''); setSignFileSearchResults([]); } }}>
              <div className="card" style={{ width: '90%', maxWidth: 480, padding: 24, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Send a file for signature</h2>
                  <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowSendSignModal(false); setSignFileSearch(''); setSignFileSearchResults([]); }}>×</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
                  {sel.email ? `Sent to ${sel.name} · ${sel.email}` : 'This customer has no email on file — add one before sending.'}
                </div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" className="input-field" placeholder="Search files by name…" autoFocus style={{ paddingLeft: 32 }}
                    value={signFileSearch} onChange={ev => setSignFileSearch(ev.target.value)} />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {signFileSearching && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Searching…</div>}
                  {!signFileSearching && signFileSearch.trim() && signFileSearchResults.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No matching files in Drive</div>}
                  {!signFileSearching && !signFileSearch.trim() && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Type to search every file in your Drive</div>}
                  {signFileSearchResults.map(f => {
                    const ft = fileTypeStyle(f.type);
                    return (
                      <button key={f.id} type="button" disabled={!sel.email || sendingForSignature === f.id}
                        onClick={() => sendFileForSignature(f)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 8px', border: 'none', borderRadius: 'var(--r)', background: 'none', cursor: !sel.email ? 'default' : 'pointer', fontFamily: 'var(--font)' }}
                        onMouseEnter={ev => { if (sel.email) ev.currentTarget.style.background = 'var(--hover-bg)'; }}
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
      {/* Hero header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: '20px 28px 0' }}>
          <button type="button" onClick={() => navigate('/crm/customers')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)', fontWeight: 600, marginBottom: 16, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink3)')}>
            <Icon name="chevronDown" size={13} color="var(--ink3)" style={{ transform: 'rotate(90deg)' }} /> Back to Customers
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <AvatarPicker id={sel.id} kind="customers" name={sel.name} size={72} shape="square" />

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.3px' }}>{sel.name}</h1>
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

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <HeroStat icon="ship" label="Shipments" value={shipCount || 0} color="var(--blue)" bg="var(--blue-l)" />
                <HeroStat icon="anchor" label="Preferred Port" value={sel.preferred_port || 'Not set'} muted={!sel.preferred_port} color="var(--teal)" bg="var(--teal-l)" />
                <HeroStat icon="truck" label="Freight Terms" value={sel.freight_terms || 'Not set'} muted={!sel.freight_terms} color="var(--gold)" bg="var(--gold-l)" />
                <HeroStat icon="creditCard" label="Credit Terms" value={sel.credit_days ? `Net ${sel.credit_days}d` : 'COD'} color="var(--green)" bg="var(--green-l)" />
                <HeroStat icon="shield" label="TIN" value={maskTin(sel.tax_id) || 'Not set'} muted={!sel.tax_id} color="var(--purple)" bg="var(--purple-l)" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <ComposeEmailButton subjectType="customer" subjectId={sel.id} onSent={() => handleTabChange('activity')}>
                <button type="button" style={btnS}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                  <Icon name="mail" size={13} strokeWidth={1.75} /> Email
                </button>
              </ComposeEmailButton>
              <button type="button" style={btnS}
                onClick={() => { const p = sel.phone_wa?.replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
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

        <Tabs value={mainTab} onValueChange={handleTabChange} variant="segmented" style={{ margin: '14px 28px 16px' }}>
          <TabsList>
            {MAIN_TABS.map(t => {
              const active = mainTab === t.key;
              return (
                <TabsTrigger key={t.key} value={t.key}>
                  <Icon name={t.icon} size={13} color={active ? 'var(--teal)' : 'var(--ink3)'} strokeWidth={1.75} />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

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
          style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: active === t.key ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: active === t.key ? 'var(--teal-l)' : 'var(--bg)', color: active === t.key ? 'var(--teal)' : 'var(--ink2)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
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
