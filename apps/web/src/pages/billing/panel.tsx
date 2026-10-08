import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Badge } from '../../components/ui/badge.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu.js';
import { getCompany, subscribeCompany } from '../../data/companyStore.js';
import { useIsDarkMode } from '../../hooks/useIsDarkMode.js';
import { useCurrency } from '../../hooks/useCurrency.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { EntityPicker, PickerItem } from '../../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { useFinanceConfiguration } from '../../hooks/useFinanceConfiguration.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { Invoice, InvNote, InvTask, InvReminder, InvAuditEntry } from './shared.js';
import { fmtTZS, fmtUSD, getStatusStyle, invoiceTotals, openPrintWindow } from './shared.js';
import { ChargeSectionView } from './editor.js';

/* ── Invoice detail panel ── */
type DetailTab = 'invoice' | 'tasks' | 'activity' | 'reminders' | 'notes';

export interface DetailPanelProps {
  inv: Invoice;
  onClose: () => void; onEdit: () => void; onCopy: () => void;
  onDelete: () => void; onRecordPayment: (amount: number, method: string, date: string) => void;
  onSubmitTRA?: () => Promise<void>;
}

/** Single-step "tag an approver + optional note" form – a Dialog, not a
 *  dedicated page, matching the same precedent SignTemplates.tsx's own
 *  BulkSendModal already established: CLAUDE.md's no-popup-forms rule is
 *  about *multi-step* forms, and this collects exactly one flat request. */
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
          <>
            <p style={{ fontSize: 13.5, color: 'var(--ink2)' }}>Your request has been sent – you'll get a notification once it's decided.</p>
            <Button variant="default" onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 10px' }}>
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
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4 }}>Note (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
              <Button variant="default" onClick={submit} disabled={!approver || sending} style={{ flex: 2 }}>
                {sending ? 'Sending…' : 'Send Request'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDetailPanel({ inv, onClose, onEdit, onCopy, onDelete, onRecordPayment, onSubmitTRA, isMobile = false }: DetailPanelProps & { isMobile?: boolean }) {
  const { fmt } = useCurrency();
  const financeConfiguration = useFinanceConfiguration();
  const businessLine = financeConfiguration.data?.businessLines.find(line => line.id === inv.businessLineId);
  const [co, setCo] = useState(getCompany);
  useEffect(() => subscribeCompany(() => setCo(getCompany())), []);
  const isDark = useIsDarkMode();
  const docLogoSrc = isDark ? (co.logoUrlDark || co.logoUrl) : co.logoUrl;
  const [tab, setTab]                 = useState<DetailTab>('invoice');
  const [showPayment, setShowPayment] = useState(false);
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

  const dbId = inv._dbId;
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

  useEffect(() => {
    setNotes([]); setTasks([]); setReminders([]); setActivity([]);
    setStampAllowed(null); setStampedFileUrl(null);
    if (!dbId) return;
    loadNotes(); loadTasks(); loadReminders(); loadActivity(); loadStampStatus();
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
      `Dear ${inv.client},\n\nPlease find attached Invoice ${inv.id} for ${fmtTZS(T.grandTotalTZS)}.\n\nBL/AWB: ${inv.blNumber}\nDue Date: ${inv.dueDate ?? 'Upon receipt'}\n\nKind regards,\n${co.name}`
    );
    window.open(`mailto:?subject=Invoice ${inv.id} – ${inv.client}&body=${body}`, '_blank');
  }

  const T = invoiceTotals(inv);
  const due = T.grandTotalTZS - inv.received;
  const st = getStatusStyle(inv.status);

  const qrData = [inv.id, inv.blNumber, `TZS ${Math.round(T.grandTotalTZS).toLocaleString()}`, inv.refCode].join(' | ');

  function submitPayment() {
    const amt = parseFloat(payAmt.replace(/,/g, ''));
    if (!amt || amt <= 0) return;
    onRecordPayment(Math.min(amt, due), payMethod, payDate);
    setShowPayment(false); setPayAmt('');
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Badge style={{ background: st.bg, color: st.color }}>{st.label}</Badge>
        {traFiscalized ? (
          <span title={`Verification #: ${inv.traRctvnum}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: 'var(--green-l)', color: 'var(--green)' }}>
            <Icon name="checkCircle" size={12} color="var(--green)" /> TRA Fiscalized
          </span>
        ) : onSubmitTRA ? (
          <button type="button" onClick={submitToTRA} disabled={traSubmitting || inv.status === 'Draft' || !inv._dbId}
            title={
              inv.status === 'Draft' ? 'Save & Send this invoice first – drafts cannot be fiscalized'
              : !inv._dbId ? 'This invoice only exists locally and was never saved to the server'
              : inv.traStatus === 'failed' ? (inv.traAckMsg || 'Previous submission failed – retry')
              : 'Submit this invoice to TRA EFDMS for fiscalization'
            }
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: (traSubmitting || inv.status === 'Draft' || !inv._dbId) ? 'default' : 'pointer', background: inv.status === 'Draft' || !inv._dbId ? 'var(--bg)' : inv.traStatus === 'failed' ? 'var(--red-l)' : 'var(--gold-l)', color: inv.status === 'Draft' || !inv._dbId ? 'var(--ink3)' : inv.traStatus === 'failed' ? 'var(--red)' : 'var(--gold)', opacity: traSubmitting ? 0.7 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
            <Icon name={inv.traStatus === 'failed' ? 'refresh' : 'send'} size={12} color={inv.status === 'Draft' || !inv._dbId ? 'var(--ink3)' : inv.traStatus === 'failed' ? 'var(--red)' : 'var(--gold)'} />
            {traSubmitting ? 'Submitting…' : inv.traStatus === 'failed' ? 'Retry TRA Submission' : 'Submit to TRA'}
          </button>
        ) : null}
        {dbId && (
          stampedFileUrl ? (
            <button type="button" onClick={() => apiDownload(`/v1/invoices/${dbId}/stamped-pdf`, `${inv.id} – stamped.pdf`)}
              title="Download the company-stamped copy"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--green-l)', color: 'var(--green)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
              <Icon name="checkCircle" size={12} color="var(--green)" /> Stamped
            </button>
          ) : stampAllowed === true ? (
            <button type="button" onClick={handleSignAndStamp} disabled={stamping}
              title="Apply the company stamp to this invoice"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: stamping ? 'default' : 'pointer', background: 'var(--blue-l)', color: 'var(--blue)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
              <Icon name="stamp" size={12} color="var(--blue)" /> {stamping ? 'Stamping…' : 'Sign & Stamp'}
            </button>
          ) : stampAllowed === false ? (
            <button type="button" onClick={() => setShowRequestStamp(true)}
              title="Your role doesn't have direct stamp access – tag someone who can approve it"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 20, border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--bg)', color: 'var(--ink2)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
              <Icon name="stamp" size={12} color="var(--ink3)" /> Request Stamping
            </button>
          ) : null
        )}
        <div style={{ flex: 1 }} />
        <Tip label="Edit"><Button type="button" size="icon" variant="outline" onClick={onEdit} aria-label="Edit"><Icon name="edit" size={13} color="var(--ink2)" /></Button></Tip>
        <Tip label="Duplicate"><Button type="button" size="icon" variant="outline" onClick={onCopy} aria-label="Duplicate"><Icon name="copy" size={13} color="var(--ink2)" /></Button></Tip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">More <Icon name="chevronDown" size={10} color="var(--ink3)" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={sendEmail}><Icon name="mail" size={14} color="var(--ink3)" /> Send by Email</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openPrintWindow(inv)}><Icon name="eye" size={14} color="var(--ink3)" /> View / Print</DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Add Note / Assign Task / Audit Log dropped – each just
                switched to a tab that's already one click away in the tab
                bar above, with no other effect. Add Reminder earns its
                keep by also pre-opening the new-reminder form. */}
            <DropdownMenuItem onClick={() => { setTab('reminders'); setShowRemForm(true); }}><Icon name="bell" size={14} color="var(--ink3)" /> Add Reminder</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleIssueCreditNote}><Icon name="minusCircle" size={14} color="var(--ink3)" /> Issue Credit Note</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Icon name="trash" size={14} color="var(--red)" /> Delete Invoice</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" size="sm" onClick={() => { setShowPayment(v => !v); setPayAmt(String(Math.round(due))); }}
          style={{ background: 'var(--green)', color: 'hsl(var(--green-foreground))' }}>
          <Icon name="dollarSign" size={13} color="hsl(var(--green-foreground))" /> Payment
        </Button>
      </div>

      {traError && (
        <Banner variant="error" className="rounded-none border-x-0 border-t-0" style={{ borderBottom: '1px solid var(--border)' }}>
          TRA submission failed: {traError}
        </Banner>
      )}

      {/* Payment form */}
      {showPayment && (
        <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 20px', background: 'var(--bg)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Record Payment – {inv.id}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
            {[['Amount (TZS)', payAmt, (v: string) => setPayAmt(v), 'number', 'var(--font)'],
              ['Payment Date', payDate, (v: string) => setPayDate(v), 'text', 'var(--font)']].map(([label, val, setter, type]) => (
              <div key={String(label)}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{String(label)}</label>
                <input type={String(type)} value={String(val)} onChange={e => (setter as (v: string) => void)(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Method</label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Bank Transfer', 'Cash', 'Cheque', 'Mobile Money'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>Outstanding: <strong style={{ color: due > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font)' }}>{fmt(due, 'TZS')}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" onClick={submitPayment} style={{ background: 'var(--green)', color: 'hsl(var(--green-foreground))' }}>Save Payment</Button>
            <Button type="button" variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {showRequestStamp && dbId && (
        <RequestStampDialog invoiceLabel={inv.id} onClose={() => setShowRequestStamp(false)} />
      )}

      {/* Tab content */}
      {tab === 'invoice' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 28px', fontFamily: 'var(--font)' }}>

          {/* Header: from company ← QR code → bill-to */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            {/* From */}
            <div>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>From</div>
              {docLogoSrc
                ? <img src={docLogoSrc} alt={co.name} style={{ height: 40, maxWidth: 140, objectFit: 'contain', marginBottom: 8, display: 'block' }} />
                : <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>{co.name}</div>
              }
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8 }}>
                {co.address}<br />{co.city}, {co.country}<br />VAT: {co.taxId}
              </div>
            </div>

            {/* QR Code – center. Once fiscalized, this must be the TRA verify-portal
                URL (what a real EFD receipt prints), not an internal reference code. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: traFiscalized ? 'var(--green-l)' : 'var(--bg)', alignSelf: 'flex-start', minWidth: 116 }}>
              <QRCodeSVG value={traFiscalized ? inv.traQrUrl! : qrData} size={88} level="M" />
              <div style={{ fontSize: 9, color: 'var(--ink3)', textAlign: 'center', lineHeight: 1.4 }}>
                {traFiscalized ? (
                  <>
                    <div style={{ fontWeight: 700, color: 'var(--green)' }}>TRA Verified</div>
                    <div>{inv.traRctvnum}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700 }}>Ref: {inv.refCode}</div>
                    <div>v{inv.version}{inv.status !== 'Draft' ? ' · not fiscalized' : ''}</div>
                  </>
                )}
              </div>
            </div>

            {/* Bill To */}
            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>Bill To</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>{inv.client}</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.8, marginBottom: 12 }}>
                {inv.clientAddress.map((l, i) => <React.Fragment key={i}>{l}{i < inv.clientAddress.length - 1 && <br />}</React.Fragment>)}
              </div>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink3)', marginBottom: 4 }}>Invoice Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Invoice #:</span><span style={{ color: 'var(--teal)', fontWeight: 700 }}>{inv.id}</span></div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Invoice Date:</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{inv.billDate}</span></div>
                  {inv.dueDate && <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Due Date:</span><span style={{ color: inv.status === 'Overdue' ? 'var(--red)' : 'var(--ink)', fontWeight: inv.status === 'Overdue' ? 700 : 600 }}>{inv.dueDate}</span></div>}
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Agent:</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{inv.saleAgent}</span></div>
                  {businessLine && <div style={{ display: 'flex', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--ink3)', fontWeight: 700 }}>Business Line:</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{businessLine.name} ({businessLine.code})</span></div>}
                </div>
            </div>
          </div>

          {/* Shipment details strip */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 8, background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            {[['BL / AWB', inv.blNumber], ['Mode', inv.mode], ['Origin', inv.origin], ['Destination', inv.destination]].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink3)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Three charge sections */}
          <ChargeSectionView title="Clearing Charges – Paid in TZS" color="var(--teal)" currency="TZS" items={T.cl} subTotal={T.sub(T.cl)} taxAmt={T.tax(T.cl)} sectionTotal={T.clearingTotal} />
          <ChargeSectionView title="Shipping Line Charges – Paid in USD" color="var(--ink)" currency="USD" items={T.sh} subTotal={T.sub(T.sh)} taxAmt={T.tax(T.sh)} sectionTotal={T.shippingTotal} />
          <ChargeSectionView title="Other Charges – Paid in TZS" color="var(--ink2)" currency="TZS" items={T.ot} subTotal={T.sub(T.ot)} taxAmt={T.tax(T.ot)} sectionTotal={T.otherTotal} />

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{ minWidth: 340 }}>
              {T.shippingTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed var(--border)' }}>
                  <span>USD {fmtUSD(T.shippingTotal)} × {inv.exchangeRate.toLocaleString()}</span>
                  <span style={{ fontFamily: 'var(--font)' }}>{fmtTZS(T.shippingTotal * inv.exchangeRate)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>TOTAL</span>
                <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--font)' }}>{fmt(T.grandTotalTZS, 'TZS')}</span>
              </div>
              {inv.received > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--green)', marginBottom: 4, paddingLeft: 4 }}>
                  <span>Less: Received</span><span style={{ fontFamily: 'var(--font)' }}>({fmt(inv.received, 'TZS')})</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: due > 0 ? 'var(--red)' : 'var(--green)', borderTop: '2px solid var(--border)', paddingTop: 8 }}>
                <span>Amount Due</span>
                <span style={{ fontFamily: 'var(--font)' }}>{fmt(Math.max(0, due), 'TZS')}</span>
              </div>
            </div>
          </div>

          {/* Carbon segment – live from the linked shipment, not a tradeable credit */}
          {inv.shipmentCarbon && (
            <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="globe" size={15} color="var(--green)" strokeWidth={1.75} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)' }}>Carbon Footprint (Estimate)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{Number(inv.shipmentCarbon.co2_emissions_kg).toLocaleString('en')} kg</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>CO₂ emissions</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>{Number(inv.shipmentCarbon.carbon_credits_saved).toFixed(2)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Credits saved (est.)</div>
                </div>
                {inv.shipmentCarbon.distance_km != null && (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{inv.shipmentCarbon.distance_km} km</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Route distance</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 10, fontStyle: 'italic' }}>
                GLEC v3.2 / ISO 14083 methodology. Internal ESG estimate – not a registry-issued or tradeable carbon credit.
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 24, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 12 }}>Payment Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Bank Name:</span><span>CRDB Bank Plc</span></div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Account Name:</span><span>Moovit ClearOS Ltd</span></div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Account No:</span><span style={{ fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink)' }}>0150244433200</span></div>
                <div style={{ display: 'flex', gap: 8 }}><span style={{ minWidth: 100, fontWeight: 600 }}>Swift Code:</span><span style={{ fontFamily: 'var(--font)' }}>CORUTZTZ</span></div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Pay Online</div>
                <a href={`https://pay.moovit.co.tz/invoice/${inv.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                  https://pay.moovit.co.tz/invoice/{inv.id}
                </a>
              </div>
            </div>
          </div>

          {/* Terms */}
          {inv.terms && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 6 }}>Terms &amp; Conditions</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.8 }}>{inv.terms}</div>
            </div>
          )}
        </div>
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
