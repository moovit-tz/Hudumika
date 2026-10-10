import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Badge } from '../../components/ui/badge.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu.js';
import { getCompany, subscribeCompany } from '../../data/companyStore.js';
import { useIsDarkMode } from '../../hooks/useIsDarkMode.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { EntityPicker, PickerItem } from '../../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { showConfirm } from '../../lib/confirm.js';
import { Input } from '../../components/ui/input.js';
import { formatAmount } from '../../lib/currency.js';
import { showAlert } from '../../lib/alert.js';
import { useFinanceConfiguration } from '../../hooks/useFinanceConfiguration.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { Invoice, InvNote, InvTask, InvReminder, InvAuditEntry } from './shared.js';
import { getStatusVariant, invoiceTotals, openPrintWindow } from './shared.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { InvoiceDocument } from './document.js';

/* ── Invoice detail panel ── */
type DetailTab = 'invoice' | 'tasks' | 'activity' | 'reminders' | 'notes';

export interface DetailPanelProps {
  inv: Invoice;
  onClose: () => void; onEdit: () => void; onCopy: () => void;
  onDelete: () => void; onRecordPayment: (amount: number, method: string, date: string) => Promise<boolean>;
  onSubmitTRA?: () => Promise<void>;
}

/* ── Send for Signature dialog ── */
function SendForSignatureDialog({ invoiceId, invoiceNumber, customerName, customerEmail, onClose }: {
  invoiceId: string; invoiceNumber: string; customerName: string; customerEmail?: string; onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<{ name: string; email: string }[]>([
    { name: customerName || '', email: customerEmail || '' },
  ]);
  const [message, setMessage] = useState(`Please review and sign invoice ${invoiceNumber}.`);
  const [requireOtp, setRequireOtp] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function updateRecipient(idx: number, field: 'name' | 'email', value: string) {
    setRecipients(r => r.map((rec, i) => i === idx ? { ...rec, [field]: value } : rec));
  }
  function addRecipient() { setRecipients(r => [...r, { name: '', email: '' }]); }
  function removeRecipient(idx: number) { setRecipients(r => r.filter((_, i) => i !== idx)); }

  async function submit() {
    const valid = recipients.filter(r => r.name.trim() && r.email.trim());
    if (!valid.length) return;
    setSending(true);
    try {
      await apiFetch(`/v1/invoices/${invoiceId}/esign-envelope`, {
        method: 'POST',
        body: JSON.stringify({ recipients: valid, message: message.trim() || undefined, require_otp: requireOtp }),
      });
      setSent(true);
    } catch (e: any) {
      showAlert(e?.message || 'Failed to create the signing envelope', { title: 'Could not send for signature' });
    } finally { setSending(false); }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Send invoice for signature</DialogTitle></DialogHeader>
        <DialogBody>
          {sent ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-[var(--green)]">
                <Icon name="checkCircle" size={20} />
                <span className="font-semibold">Signing envelope created</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Recipients will receive an email with a link to sign {invoiceNumber}. You can track progress in the Sign app.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-muted-foreground">
                Create an eSign envelope with the invoice PDF. Recipients will sign electronically via a secure link.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-muted-foreground">Recipients</label>
                {recipients.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Name" value={r.name} onChange={e => updateRecipient(i, 'name', e.target.value)} />
                    <Input placeholder="Email" type="email" value={r.email} onChange={e => updateRecipient(i, 'email', e.target.value)} />
                    {recipients.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeRecipient(i)}><Icon name="x" size={14} /></Button>
                    )}
                  </div>
                ))}
                <Button type="button" size="xs" variant="outline" onClick={addRecipient}>
                  <Icon name="plus" size={12} /> Add recipient
                </Button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  className="w-full rounded-[var(--r-sm)] border border-input bg-background text-foreground text-[13px] p-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={requireOtp} onCheckedChange={v => setRequireOtp(!!v)} />
                Require SMS/WhatsApp OTP verification
              </label>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {sent ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={sending || !recipients.some(r => r.name.trim() && r.email.trim())}>
                {sending ? <><ButtonSpinner /> Sending…</> : 'Send for Signature'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Collect Online Payment dialog ── */
function CollectOnlineDialog({ invoiceId, invoiceNumber, balance, currency, customerEmail, customerName, onClose }: {
  invoiceId: string; invoiceNumber: string; balance: number; currency: string;
  customerEmail?: string; customerName?: string; onClose: () => void;
}) {
  const [email, setEmail] = useState(customerEmail || '');
  const [creating, setCreating] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [gatewayName, setGatewayName] = useState('');

  async function createCheckout() {
    if (!email.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch(`/v1/invoices/${invoiceId}/gateway-checkout`, {
        method: 'POST',
        body: JSON.stringify({ customer_email: email.trim(), customer_name: customerName || '' }),
      });
      setCheckoutUrl(res.checkout_url);
      setGatewayName(res.gateway);
    } catch (e: any) {
      showAlert(e?.message || 'Could not create a checkout link', { title: 'Gateway error' });
    } finally { setCreating(false); }
  }

  function copyLink() {
    if (!checkoutUrl) return;
    navigator.clipboard.writeText(checkoutUrl).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Collect payment online</DialogTitle></DialogHeader>
        <DialogBody>
          {checkoutUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[var(--green)]">
                <Icon name="checkCircle" size={18} />
                <span className="text-sm font-semibold">Checkout link ready</span>
              </div>
              <p className="text-[13px] text-muted-foreground">
                A {gatewayName} checkout page has been created for {formatAmount(balance, currency)}. Share this link with your customer or open it to complete payment.
              </p>
              <div className="flex gap-2">
                <Input value={checkoutUrl} readOnly className="text-xs" />
                <Tip label={linkCopied ? 'Copied!' : 'Copy link'}>
                  <Button size="icon" variant="outline" onClick={copyLink}>
                    <Icon name={linkCopied ? 'check' : 'copy'} size={14} />
                  </Button>
                </Tip>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => window.open(checkoutUrl!, '_blank')}>
                  <Icon name="externalLink" size={14} /> Open Checkout
                </Button>
                <Button variant="outline" onClick={() => {
                  const body = encodeURIComponent(`Please complete your payment of ${formatAmount(balance, currency)} for invoice ${invoiceNumber}:\n\n${checkoutUrl}`);
                  window.open(`mailto:${email}?subject=Payment for ${invoiceNumber}&body=${body}`, '_blank');
                }}>
                  <Icon name="mail" size={14} /> Email Link
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-muted-foreground">
                Generate a hosted payment page for <strong>{invoiceNumber}</strong> ({formatAmount(balance, currency)} due).
                Your customer pays on the gateway's secure page — no card details touch this platform.
              </p>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Customer email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" />
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {checkoutUrl ? (
            <Button variant="outline" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={createCheckout} disabled={creating || !email.trim()}>
                {creating ? <><ButtonSpinner /> Creating…</> : 'Create Checkout Link'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Single-step "tag an approver + optional note" form */
function RequestStampDialog({ invoiceLabel, onClose }: { invoiceLabel: string; onClose: () => void }) {
  const [approver, setApprover] = useState<PickerItem | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!approver) return;
    setSending(true);
    try {
      await apiFetch('/v1/sign/stamp-requests', {
        method: 'POST',
        body: JSON.stringify({ approver_id: approver.id, target_type: 'invoice', target_ref: invoiceLabel, note: note.trim() || undefined }),
      });
      setSent(true);
    } catch (e: any) {
      showAlert(e?.message || 'Failed to send the request', { title: 'Could not send request' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-105">
        <DialogHeader><DialogTitle>Request stamping</DialogTitle></DialogHeader>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Your request has been sent – you'll get a notification once it's decided.</p>
            <Button variant="default" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              Your role doesn't have direct stamp access for <strong>{invoiceLabel}</strong>. Tag who should approve it.
            </p>
            <EntityPicker
              label="Approver" placeholder="Search staff…"
              value={approver} onChange={setApprover}
              search={async q => {
                const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
                return rows.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
              }}
            />
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Note (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                className="w-full rounded-[var(--r-sm)] border border-input bg-background text-foreground text-[13px] p-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button variant="default" onClick={submit} disabled={!approver || sending} className="flex-[2]">
                {sending ? 'Sending…' : 'Send Request'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDetailPanel({ inv, onClose, onEdit, onCopy, onDelete, onRecordPayment, onSubmitTRA, isMobile = false }: DetailPanelProps & { isMobile?: boolean }) {
  const financeConfiguration = useFinanceConfiguration();
  const businessLine = financeConfiguration.data?.businessLines.find(line => line.id === inv.businessLineId);
  const [co, setCo] = useState(getCompany);
  useEffect(() => subscribeCompany(() => setCo(getCompany())), []);
  const isDark = useIsDarkMode();
  const docLogoSrc = isDark ? (co.logoUrlDark || co.logoUrl) : co.logoUrl;
  const [tab, setTab]                 = useState<DetailTab>('invoice');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [traSubmitting, setTraSubmitting] = useState(false);
  const [traError, setTraError]           = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const [payAmt, setPayAmt]     = useState('');
  const [payDate, setPayDate]   = useState(today);
  const [payMethod, setPayMethod] = useState('Bank Transfer');

  /* ── Notes/Tasks/Reminders/Activity – real, persisted per invoice ── */
  const [notes, setNotes]         = useState<InvNote[]>([]);
  const [tasks, setTasks]         = useState<InvTask[]>([]);
  const [reminders, setReminders] = useState<InvReminder[]>([]);
  const [activity, setActivity]   = useState<InvAuditEntry[]>([]);

  const [pdfBusy,setPdfBusy]=useState(false);
  const [linkBusy,setLinkBusy]=useState(false);
  const [paymentLink,setPaymentLink]=useState<string|null>(null);
  const [linkCopied,setLinkCopied]=useState(false);
  const dbId = inv._dbId;
  async function downloadPdf() {
    if(!dbId)return;setPdfBusy(true);
    try {await apiDownload(`/v1/invoices/${dbId}/pdf`,`${inv.id.replace(/[^a-zA-Z0-9_.-]/g,'_')}.pdf`);}
    catch(e){showAlert(e instanceof Error?e.message:'Could not download PDF.');}finally{setPdfBusy(false);}
  }
  async function createPaymentLink() {
    if(!dbId)return;setLinkBusy(true);
    try {const link=await apiFetch<{path:string}>(`/v1/invoices/${dbId}/payment-link`,{method:'POST'});setLinkCopied(false);setPaymentLink(new URL(link.path,window.location.origin).href);}
    catch(e){showAlert(e instanceof Error?e.message:'Could not create payment link.');}finally{setLinkBusy(false);}
  }
  async function copyPaymentLink() {
    try {if(paymentLink){await navigator.clipboard.writeText(paymentLink);setLinkCopied(true);}}
    catch {showAlert('Copy the link from the field above.');}
  }
  const navigate = useNavigate();
  function handleIssueCreditNote() {
    if (!dbId) return;
    const qs = new URLSearchParams({ invoice_id: dbId, client_name: inv.client || '' });
    navigate(`/finance/credit-notes/new?${qs.toString()}`);
  }

  function loadNotes()     { if (dbId) apiFetch(`/v1/invoices/${dbId}/notes`).then((r: any) => setNotes(r?.data ?? [])).catch(() => {}); }
  function loadTasks()     { if (dbId) apiFetch(`/v1/invoices/${dbId}/tasks`).then((r: any) => setTasks(r?.data ?? [])).catch(() => {}); }
  function loadReminders() { if (dbId) apiFetch(`/v1/invoices/${dbId}/reminders`).then((r: any) => setReminders(r?.data ?? [])).catch(() => {}); }
  function loadActivity()  { if (dbId) apiFetch(`/v1/invoices/${dbId}/activity`).then((r: any) => setActivity(r?.data ?? [])).catch(() => {}); }

  /* ── Sign & Stamp (M6 cross-app stamp API) ── */
  const [stampAllowed, setStampAllowed] = useState<boolean | null>(null);
  const [stampedFileUrl, setStampedFileUrl] = useState<string | null>(null);
  const [stamping, setStamping] = useState(false);
  const [showRequestStamp, setShowRequestStamp] = useState(false);
  const [showEsign, setShowEsign] = useState(false);
  const [showOnlinePayment, setShowOnlinePayment] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<{ online: boolean; active_gateway: { id: string; sandbox: boolean } | null } | null>(null);

  function loadStampStatus() {
    if (!dbId) return;
    apiFetch('/v1/sign/stamps/access').then(r => setStampAllowed(r.allowed)).catch(() => setStampAllowed(false));
    apiFetch(`/v1/invoices/${dbId}`).then((r: any) => setStampedFileUrl(r?.stamped_file_url ?? null)).catch(() => {});
  }

  async function handleSignAndStamp() {
    if (!dbId) return;
    setStamping(true);
    try {
      const r = await apiFetch(`/v1/invoices/${dbId}/sign-stamp`, { method: 'POST' });
      setStampedFileUrl(r.stamped_file_url);
    } catch (e: any) {
      showAlert(e?.message || 'Failed to apply the stamp', { title: 'Could not stamp this invoice' });
    } finally {
      setStamping(false);
    }
  }

  function loadPaymentOptions() {
    if (!dbId) return;
    apiFetch(`/v1/invoices/${dbId}/payment-options`).then(r => setPaymentOptions(r)).catch(() => setPaymentOptions(null));
  }

  useEffect(() => {
    setNotes([]); setTasks([]); setReminders([]); setActivity([]);
    setStampAllowed(null); setStampedFileUrl(null); setPaymentOptions(null);
    if (!dbId) return;
    loadNotes(); loadTasks(); loadReminders(); loadActivity(); loadStampStatus(); loadPaymentOptions();
  }, [dbId]); // eslint-disable-line

  /* ── Notes state ── */
  const [newNote, setNewNote] = useState('');

  /* ── Tasks state ── */
  const [newTaskDesc, setNewTaskDesc]         = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskDue, setNewTaskDue]           = useState('');
  const [showTaskForm, setShowTaskForm]       = useState(false);

  /* ── Reminders state ── */
  const [newRemDate, setNewRemDate] = useState('');
  const [newRemMsg, setNewRemMsg]   = useState('');
  const [showRemForm, setShowRemForm] = useState(false);

  function addNote() {
    if (!newNote.trim() || !dbId) return;
    apiFetch(`/v1/invoices/${dbId}/notes`, { method: 'POST', body: JSON.stringify({ content: newNote.trim() }) })
      .then(() => { loadNotes(); loadActivity(); }).catch(() => {});
    setNewNote('');
  }
  async function deleteNote(id: string) {
    if (!dbId || !(await showConfirm('Delete this note?', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/invoices/${dbId}/notes/${id}`, { method: 'DELETE' }).then(loadNotes).catch(() => {});
  }

  function addTask() {
    if (!newTaskDesc.trim() || !dbId) return;
    apiFetch(`/v1/invoices/${dbId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ description: newTaskDesc.trim(), assignee: newTaskAssignee.trim() || null, due_date: newTaskDue || null }),
    }).then(() => { loadTasks(); loadActivity(); }).catch(() => {});
    setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskDue(''); setShowTaskForm(false);
  }
  function toggleTask(id: string) {
    if (!dbId) return;
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    apiFetch(`/v1/invoices/${dbId}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) })
      .then(() => { loadTasks(); loadActivity(); }).catch(() => {});
  }
  async function deleteTask(id: string) {
    if (!dbId || !(await showConfirm('Delete this task?', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/invoices/${dbId}/tasks/${id}`, { method: 'DELETE' }).then(loadTasks).catch(() => {});
  }

  function addReminder() {
    if (!newRemDate || !newRemMsg.trim() || !dbId) return;
    apiFetch(`/v1/invoices/${dbId}/reminders`, {
      method: 'POST', body: JSON.stringify({ remind_date: newRemDate, message: newRemMsg.trim() }),
    }).then(() => { loadReminders(); loadActivity(); }).catch(() => {});
    setNewRemDate(''); setNewRemMsg(''); setShowRemForm(false);
  }
  function toggleReminder(id: string) {
    if (!dbId) return;
    const r = reminders.find(x => x.id === id);
    if (!r) return;
    apiFetch(`/v1/invoices/${dbId}/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ done: !r.done }) })
      .then(loadReminders).catch(() => {});
  }
  async function deleteReminder(id: string) {
    if (!dbId || !(await showConfirm('Delete this reminder?', { confirmLabel: 'Delete' }))) return;
    apiFetch(`/v1/invoices/${dbId}/reminders/${id}`, { method: 'DELETE' }).then(loadReminders).catch(() => {});
  }

  function sendEmail() {
    const T = invoiceTotals(inv);
    const body = encodeURIComponent(
      `Dear ${inv.client},\n\nPlease find attached Invoice ${inv.id} for ${formatAmount(T.documentTotal, inv.documentCurrency || 'TZS')}.\n\nBL/AWB: ${inv.blNumber}\nDue Date: ${inv.dueDate ?? 'Upon receipt'}\n\nKind regards,\n${co.name}`
    );
    window.open(`mailto:?subject=Invoice ${inv.id} – ${inv.client}&body=${body}`, '_blank');
  }

  const T = invoiceTotals(inv);
  const due = T.documentTotal - inv.received;
  const paymentDue = T.documentTotal - inv.received;
  const paymentCurrency = inv.documentCurrency || 'TZS';
  const st = getStatusVariant(inv.status);


  async function submitPayment() {
    const amt = parseFloat(payAmt.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0 || paymentSaving) return;
    if (amt > paymentDue) { showAlert('Payment exceeds the invoice balance. Record an advance separately.'); return; }
    setPaymentSaving(true);
    try {
      if (await onRecordPayment(amt, payMethod, payDate)) { setShowPayment(false); setPayAmt(''); }
    } finally { setPaymentSaving(false); }
  }

  const traFiscalized = inv.traStatus === 'submitted' && inv.traAckCode === 0;

  async function submitToTRA() {
    if (!onSubmitTRA || traSubmitting) return;
    setTraSubmitting(true);
    setTraError(null);
    try {
      await onSubmitTRA();
    } catch (err: any) {
      setTraError(err?.message || 'TRA submission failed');
    } finally {
      setTraSubmitting(false);
    }
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'invoice', label: 'Invoice' }, { id: 'tasks', label: 'Tasks' },
    { id: 'activity', label: 'Activity Log' }, { id: 'reminders', label: 'Reminders' }, { id: 'notes', label: 'Notes' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', overflow: 'hidden', minWidth: 0 }}>
      {paymentLink&&<Dialog open onOpenChange={open=>{if(!open)setPaymentLink(null);}}><DialogContent size="sm"><DialogHeader><DialogTitle>Invoice payment link</DialogTitle></DialogHeader><DialogBody className="space-y-4"><p className="text-sm text-muted-foreground">The customer must sign in to view this invoice and download its PDF. Online payments await Selcom or Azam Pay integration.</p><Input aria-label="Invoice payment link" readOnly value={paymentLink}/></DialogBody><DialogFooter><Button variant="outline" onClick={()=>setPaymentLink(null)}>Close</Button><Button onClick={copyPaymentLink}>{linkCopied?'Copied':'Copy link'}</Button></DialogFooter></DialogContent></Dialog>}
      {tab !== 'invoice'  && <div className="hidden"><InvoiceDocument inv={inv}/></div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0 }}>
        <Tabs value={tab} onValueChange={v => setTab(v as DetailTab)} style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <TabsList>
            {TABS.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {/* Was three icons (mail / eye / maximize) – "Export PDF" opened the
              exact same print window as "View / Print" (there's no separate
              PDF export, just the browser's own print-to-PDF), and the mail
              icon fired a bare `mailto:?subject=` with no body while the
              proper message lived only in sendEmail() below. Down to the two
              that do something distinct, both routed through the real
              implementations. */}
          {!isMobile && (
            <>
              <Tip label="Send email"><Button type="button" size="icon" variant="ghost" aria-label="Send email" onClick={sendEmail}>
                <Icon name="mail" size={15} color="var(--ink3)" />
              </Button></Tip>
              <Tip label="View / Print"><Button type="button" size="icon" variant="ghost" aria-label="View or print" onClick={() => openPrintWindow(inv)}>
                <Icon name="eye" size={15} color="var(--ink3)" />
              </Button></Tip>
            </>
          )}
          <Tip label="Close"><Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={15} color="var(--ink3)" />
          </Button></Tip>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1.5 flex-wrap px-4 py-2 border-b border-border shrink-0">
        <Badge variant={st.variant as any}>{st.label}</Badge>

        {/* TRA fiscalization */}
        {traFiscalized ? (
          <Tip label={`Verification #: ${inv.traRctvnum}`}>
            <Badge variant="success"><Icon name="checkCircle" size={12} /> TRA Fiscalized</Badge>
          </Tip>
        ) : onSubmitTRA ? (
          <Tip label={
            inv.status === 'Draft' ? 'Save & Send this invoice first – drafts cannot be fiscalized'
            : !inv._dbId ? 'This invoice only exists locally and was never saved to the server'
            : inv.traStatus === 'failed' ? (inv.traAckMsg || 'Previous submission failed – retry')
            : 'Submit this invoice to TRA EFDMS for fiscalization'
          }>
            <Button type="button" size="xs" onClick={submitToTRA}
              disabled={traSubmitting || inv.status === 'Draft' || !inv._dbId}
              variant={inv.status === 'Draft' || !inv._dbId ? 'secondary' : 'outline'}
              className={inv.status === 'Draft' || !inv._dbId ? '' : inv.traStatus === 'failed' ? 'border-[var(--red-l)] bg-[var(--red-l)] text-[var(--red)] hover:bg-[var(--red-l)]' : 'border-[var(--gold-l)] bg-[var(--gold-l)] text-[var(--gold)] hover:bg-[var(--gold-l)]'}>
              <Icon name={inv.traStatus === 'failed' ? 'refresh' : 'send'} size={12} />
              {traSubmitting ? 'Submitting…' : inv.traStatus === 'failed' ? 'Retry TRA' : 'Submit to TRA'}
            </Button>
          </Tip>
        ) : null}

        {/* Sign & Stamp */}
        {dbId && (
          stampedFileUrl ? (
            <Tip label="Download the company-stamped copy">
              <Button type="button" size="xs" variant="outline"
                className="border-[var(--green-l)] bg-[var(--green-l)] text-[var(--green)] hover:bg-[var(--green-l)]"
                onClick={() => apiDownload(`/v1/invoices/${dbId}/stamped-pdf`, `${inv.id} – stamped.pdf`)}>
                <Icon name="checkCircle" size={12} /> Stamped
              </Button>
            </Tip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="xs" variant="outline"
                  className={stampAllowed === true ? 'border-[var(--blue-l)] bg-[var(--blue-l)] text-[var(--blue)] hover:bg-[var(--blue-l)]' : ''}>
                  <Icon name="stamp" size={12} /> Sign & Stamp <Icon name="chevronDown" size={10} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {stampAllowed === true ? (
                  <DropdownMenuItem onClick={handleSignAndStamp} disabled={stamping}>
                    <Icon name="stamp" size={14} /> {stamping ? 'Stamping…' : 'Apply Company Stamp'}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setShowRequestStamp(true)}>
                    <Icon name="stamp" size={14} /> Request Company Stamp
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowEsign(true)} disabled={inv.status === 'Draft'}>
                  <Icon name="edit" size={14} /> Send for Signature
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/sign/editor?attach_invoice=${dbId}`)}>
                  <Icon name="externalLink" size={14} /> Open in Sign App
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}

        <div className="flex-1" />

        <Tip label="Edit"><Button type="button" size="icon" variant="outline" onClick={onEdit} aria-label="Edit"><Icon name="edit" size={13} /></Button></Tip>
        <Tip label="Duplicate"><Button type="button" size="icon" variant="outline" onClick={onCopy} aria-label="Duplicate"><Icon name="copy" size={13} /></Button></Tip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">More <Icon name="chevronDown" size={10} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={sendEmail}><Icon name="mail" size={14} /> Send by Email</DropdownMenuItem>
            <DropdownMenuItem disabled={!dbId||pdfBusy} onClick={downloadPdf}>{pdfBusy?'Downloading…':'Download PDF'}</DropdownMenuItem>
            <DropdownMenuItem disabled={!dbId||linkBusy||['Draft','Credited'].includes(inv.status)} onClick={createPaymentLink}>{linkBusy?'Creating link…':'Payment link'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openPrintWindow(inv)}><Icon name="eye" size={14} /> View / Print</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setTab('reminders'); setShowRemForm(true); }}><Icon name="bell" size={14} /> Add Reminder</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleIssueCreditNote}><Icon name="minusCircle" size={14} /> Issue Credit Note</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Icon name="trash" size={14} /> Delete Invoice</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="bg-[var(--green)] text-white hover:bg-[var(--green)]/90">
              <Icon name="dollarSign" size={13} /> Payment <Icon name="chevronDown" size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setShowPayment(true); setPayAmt(String(paymentDue)); }}>
              <Icon name="edit" size={14} /> Record Manual Payment
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!dbId || linkBusy || ['Draft', 'Credited'].includes(inv.status)} onClick={createPaymentLink}>
              <Icon name="link" size={14} /> {linkBusy ? 'Creating…' : 'Generate Payment Link'}
            </DropdownMenuItem>
            {paymentOptions?.online && (
              <DropdownMenuItem disabled={!dbId || ['Draft', 'Paid', 'Credited'].includes(inv.status)} onClick={() => setShowOnlinePayment(true)}>
                <Icon name="creditCard" size={14} /> Collect Online{paymentOptions.active_gateway?.sandbox ? ' (Sandbox)' : ''}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {traError && (
        <Banner variant="error" className="rounded-none border-x-0 border-t-0" style={{ borderBottom: '1px solid var(--border)' }}>
          TRA submission failed: {traError}
        </Banner>
      )}

      {/* Payment form */}
      {showPayment && (
        <div className="border-b border-border px-5 py-3 bg-muted shrink-0">
          <div className="text-xs font-bold text-foreground mb-2.5">Record Payment – {inv.id}</div>
          <div className={`grid gap-2.5 mb-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
            <div>
              <label className="block text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Amount ({paymentCurrency})</label>
              <Input disabled={paymentSaving} aria-label={`Amount (${paymentCurrency})`} type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Payment Date</label>
              <Input disabled={paymentSaving} aria-label="Payment Date" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Method</label>
              <Select disabled={paymentSaving} value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Bank Transfer', 'Cash', 'Cheque', 'Mobile Money'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-[11.5px] text-muted-foreground mb-2">Outstanding: <strong style={{ color: due > 0 ? 'var(--red)' : 'var(--green)' }}>{formatAmount(paymentDue, paymentCurrency)}</strong></div>
          <div className="flex gap-2">
            <Button type="button" disabled={paymentSaving} onClick={submitPayment}
              className="bg-[var(--green)] text-white hover:bg-[var(--green)]/90">Save Payment</Button>
            <Button type="button" variant="outline" disabled={paymentSaving} onClick={() => setShowPayment(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {showRequestStamp && dbId && (
        <RequestStampDialog invoiceLabel={inv.id} onClose={() => setShowRequestStamp(false)} />
      )}
      {showEsign && dbId && (
        <SendForSignatureDialog
          invoiceId={dbId} invoiceNumber={inv.id}
          customerName={inv.client} customerEmail={undefined}
          onClose={() => { setShowEsign(false); loadActivity(); }}
        />
      )}
      {showOnlinePayment && dbId && (
        <CollectOnlineDialog
          invoiceId={dbId} invoiceNumber={inv.id}
          balance={paymentDue} currency={paymentCurrency}
          customerEmail={undefined} customerName={inv.client}
          onClose={() => setShowOnlinePayment(false)}
        />
      )}

      {/* Tab content */}
      {tab === 'invoice' ? (
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"><InvoiceDocument inv={inv}/></div>
      ) : tab === 'notes' ? (
        <div className="inv-tab-panel">
          <div className="inv-tab-compose">
            <textarea
              className="inv-tab-textarea"
              placeholder="Write a note…"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
              rows={3}
            />
            <div className="inv-tab-compose-foot">
              <span className="inv-tab-hint">⌘↵ to save</span>
              <button type="button" className="inv-tab-submit" onClick={addNote} disabled={!newNote.trim()} data-ui-native-button="">Add Note</button>
            </div>
          </div>
          <div className="inv-tab-list">
            {notes.length === 0 && <div className="inv-tab-empty">No notes yet.</div>}
            {notes.map(n => (
              <div key={n.id} className="inv-note-item">
                <div className="inv-note-meta">{n.author_name} · {new Date(n.created_at).toLocaleString('en-GB')}</div>
                <div className="inv-note-text">{n.content}</div>
                <Tip label="Delete note"><button type="button" className="inv-note-del" aria-label="Delete note" onClick={() => deleteNote(n.id)} data-ui-native-button="">
                  <Icon name="x" size={12} color="var(--ink3)" />
                </button></Tip>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'tasks' ? (
        <div className="inv-tab-panel">
          {showTaskForm ? (
            <div className="inv-task-form">
              <input className="inv-tab-input" placeholder="Task description…" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} />
              <div className="inv-task-form-row">
                <input className="inv-tab-input" placeholder="Assignee" value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} />
                <DatePicker date={parseDateOnly(newTaskDue)} onChange={d => setNewTaskDue(toDateOnlyString(d))} />
              </div>
              <div className="inv-tab-compose-foot">
                <button type="button" className="inv-tab-cancel" onClick={() => setShowTaskForm(false)} data-ui-native-button="">Cancel</button>
                <button type="button" className="inv-tab-submit" onClick={addTask} disabled={!newTaskDesc.trim()} data-ui-native-button="">Add Task</button>
              </div>
            </div>
          ) : (
            <div className="inv-tab-toolbar">
              <button type="button" className="inv-tab-submit" onClick={() => setShowTaskForm(true)} data-ui-native-button="">
                <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> New Task
              </button>
            </div>
          )}
          <div className="inv-tab-list">
            {tasks.length === 0 && <div className="inv-tab-empty">No tasks yet.</div>}
            {tasks.map(t => (
              <div key={t.id} className={`inv-task-item${t.done ? ' inv-task-item--done' : ''}`}>
                <Checkbox checked={t.done} onCheckedChange={() => toggleTask(t.id)} className="mt-0.5" title="Toggle task" />
                <div className="inv-task-body">
                  <span className="inv-task-desc">{t.description}</span>
                  {t.assignee && <span className="inv-task-assignee">→ {t.assignee}</span>}
                  {t.due_date && <span className="inv-task-due">Due {t.due_date}</span>}
                </div>
                <Tip label="Delete task"><button type="button" className="inv-note-del" aria-label="Delete task" onClick={() => deleteTask(t.id)} data-ui-native-button="">
                  <Icon name="x" size={12} color="var(--ink3)" />
                </button></Tip>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'reminders' ? (
        <div className="inv-tab-panel">
          {showRemForm ? (
            <div className="inv-task-form">
              <div className="inv-task-form-row">
                <DatePicker date={parseDateOnly(newRemDate)} onChange={d => setNewRemDate(toDateOnlyString(d))} />
                <input className="inv-tab-input" placeholder="Reminder message…" value={newRemMsg} onChange={e => setNewRemMsg(e.target.value)} />
              </div>
              <div className="inv-tab-compose-foot">
                <button type="button" className="inv-tab-cancel" onClick={() => setShowRemForm(false)} data-ui-native-button="">Cancel</button>
                <button type="button" className="inv-tab-submit" onClick={addReminder} disabled={!newRemDate || !newRemMsg.trim()} data-ui-native-button="">Set Reminder</button>
              </div>
            </div>
          ) : (
            <div className="inv-tab-toolbar">
              <button type="button" className="inv-tab-submit" onClick={() => setShowRemForm(true)} data-ui-native-button="">
                <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> New Reminder
              </button>
            </div>
          )}
          <div className="inv-tab-list">
            {reminders.length === 0 && <div className="inv-tab-empty">No reminders set.</div>}
            {[...reminders].sort((a, b) => a.remind_date.localeCompare(b.remind_date)).map(r => (
              <div key={r.id} className={`inv-task-item${r.done ? ' inv-task-item--done' : ''}`}>
                <Checkbox checked={r.done} onCheckedChange={() => toggleReminder(r.id)} className="mt-0.5" title="Mark done" />
                <div className="inv-task-body">
                  <span className="inv-task-due">{r.remind_date}</span>
                  <span className="inv-task-desc">{r.message}</span>
                </div>
                <Tip label="Delete reminder"><button type="button" className="inv-note-del" aria-label="Delete reminder" onClick={() => deleteReminder(r.id)} data-ui-native-button="">
                  <Icon name="x" size={12} color="var(--ink3)" />
                </button></Tip>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'activity' ? (
        <div className="inv-tab-panel">
          <div className="inv-tab-list">
            {activity.length === 0 && <div className="inv-tab-empty">No activity recorded yet.</div>}
            {activity.map(e => (
              <div key={e.id} className="inv-audit-item">
                <Icon name="activity" size={13} color="var(--teal)" />
                <div className="inv-audit-body">
                  <span className="inv-audit-action">{e.action.replace(/_/g, ' ')}{e.detail ? `: ${e.detail}` : ''}</span>
                  <span className="inv-audit-ts">{e.actor_name ? `${e.actor_name} · ` : ''}{new Date(e.created_at).toLocaleString('en-GB')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
