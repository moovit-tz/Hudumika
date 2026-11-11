import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UserRole } from '@hudumika/types';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { formatAmount } from '../lib/currency.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { useTaxCodes } from '../data/taxCodeData.js';
import { getCompany } from '../data/companyStore.js';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from '../components/ui/dialog.js';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet.js';
import { Tip } from '../components/ui/tooltip.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { KanbanBoard } from '../components/ui/kanban-board.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import './Sales.css';

// ─── Constants & Configurations ────────────────────────────────────────────────

const STAGES = [
  { key: 'DRAFT',     label: 'Draft',          color: 'var(--ink3)',  badgeVariant: 'outline' as const },
  { key: 'PENDING',   label: 'Pending Review', color: 'var(--gold)',  badgeVariant: 'warning' as const },
  { key: 'APPROVED',  label: 'Approved',       color: 'var(--green)', badgeVariant: 'success' as const },
  { key: 'CONVERTED', label: 'Converted',      color: 'var(--teal)',  badgeVariant: 'brand' as const },
  { key: 'REJECTED',  label: 'Rejected',       color: 'var(--red)',   badgeVariant: 'destructive' as const },
];

const SHIPMENT_TYPES = [
  { key: 'SEA',  label: 'Sea Freight',     icon: 'ship'  as IconName },
  { key: 'AIR',  label: 'Air Freight',     icon: 'plane' as IconName },
  { key: 'ROAD', label: 'Road Transport',  icon: 'truck' as IconName },
  { key: 'RAIL', label: 'Rail Transport',  icon: 'train' as IconName },
];

const CURRENCIES = ['USD', 'TZS', 'EUR', 'GBP'];
const CATEGORIES = ['Freight', 'Handling', 'Customs', 'Insurance', 'Other'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, c = 'USD') {
  return formatAmount(n ?? 0, c);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toDateInput(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function isExpired(validUntil: string | null | undefined, status: string) {
  if (!validUntil || ['CONVERTED', 'REJECTED'].includes(status)) return false;
  return new Date(validUntil) < new Date();
}

function blankLine() {
  return { description: '', category: 'Freight', quantity: 1, unit_price: 0, tax_rate: 0, tax_code_id: null as string | null };
}

function StatusBadge({ status }: { status: string }) {
  const stage = STAGES.find(s => s.key === status);
  return (
    <Badge variant={stage?.badgeVariant ?? 'outline'} className="tracking-wide text-[11px] font-semibold whitespace-nowrap">
      {stage?.label ?? status}
    </Badge>
  );
}

function getModeIcon(mode?: string): IconName {
  const m = (mode || '').toUpperCase();
  if (m === 'AIR') return 'plane';
  if (m === 'ROAD') return 'truck';
  if (m === 'RAIL') return 'train';
  return 'ship';
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">Confirm Action</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground my-2">{msg}</p>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>Delete Quotation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Change Modal ──────────────────────────────────────────────────────

function StatusModal({
  quote, onClose, onDone,
}: { quote: any; onClose: () => void; onDone: (q: any) => void }) {
  const [status, setStatus] = useState(quote.status);
  const [reason, setReason] = useState(quote.rejection_reason || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const allowed = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].filter(s => s !== quote.status);

  async function save() {
    setSaving(true); setErr('');
    try {
      const updated = await apiFetch(`/v1/quotations/${quote.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(status === 'REJECTED' && reason ? { reason } : {}) }),
      });
      onDone(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Icon name="refresh" size={16} className="text-primary" />
            <span>Update Quotation Status</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-2.5 bg-muted/40 rounded-lg border border-border/50 text-xs">
            <span className="text-muted-foreground">Current Status: </span>
            <StatusBadge status={quote.status} />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">New Stage *</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="New Status" className="w-full h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map(s => {
                  const stage = STAGES.find(x => x.key === s);
                  return (
                    <SelectItem key={s} value={s} className="text-xs">
                      {stage?.label ?? s}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {status === 'REJECTED' && (
            <div>
              <label className="text-xs font-semibold text-destructive block mb-1.5">Rejection Reason *</label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="Explain why this quotation was rejected or cancelled…"
                className="text-xs resize-none"
              />
            </div>
          )}

          {err && <div className="text-xs text-destructive p-2 rounded bg-destructive/10">{err}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || (status === 'REJECTED' && !reason.trim())}>
            {saving ? 'Updating…' : 'Save Status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Email Modal ─────────────────────────────────────────────────────────

function SendEmailModal({
  quote, onClose, onSent,
}: { quote: any; onClose: () => void; onSent: () => void }) {
  const [email, setEmail]     = useState(quote.customer_email || '');
  const [message, setMessage] = useState(`Dear ${quote.customer_name || 'Client'},\n\nPlease find attached the quotation details for ${quote.title}.\n\nTotal: ${fmt(quote.total_amount, quote.currency)}\nValid until: ${fmtDate(quote.valid_until)}\n\nPlease feel free to contact us with any questions.`);
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState('');

  async function send() {
    if (!email.trim() || !email.includes('@')) {
      setErr('Please enter a valid recipient email address');
      return;
    }
    setSending(true); setErr('');
    try {
      await apiFetch(`/v1/quotations/${quote.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), message }),
      });
      onSent();
    } catch (e: any) {
      setErr(e.message || 'Failed to send quotation email');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Icon name="mail" size={16} className="text-primary" />
            <span>Send Quotation to Client</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 py-2 text-xs">
          <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex items-center justify-between">
            <div>
              <div className="font-mono text-xs font-bold text-primary">{quote.quote_number}</div>
              <div className="font-semibold text-foreground text-xs mt-0.5">{quote.title}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase font-bold">Total Amount</div>
              <div className="font-extrabold text-foreground text-sm">{fmt(quote.total_amount, quote.currency)}</div>
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">Recipient Email *</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. client@company.com"
              className="h-9 text-xs"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">Email Message / Cover Note</label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              placeholder="Add personal notes or scope clarifications…"
              className="text-xs leading-relaxed"
            />
          </div>

          {err && <div className="text-xs text-destructive p-2 rounded bg-destructive/10">{err}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button size="sm" onClick={send} disabled={sending} className="gap-1.5">
            <Icon name="send" size={13} />
            <span>{sending ? 'Sending…' : 'Send Email'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Slide-out Drawer ──────────────────────────────────────────────────

function DetailPanel({
  quoteId, onClose, onEdit, onDelete, canDelete, onStatusChange, onConvert, onSendEmail,
}: {
  quoteId: string;
  onClose: () => void;
  onEdit: (q: any) => void;
  onDelete: (q: any) => void;
  canDelete: boolean;
  onStatusChange: (q: any) => void;
  onConvert: (q: any) => void;
  onSendEmail: (q: any) => void;
}) {
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/quotations/${quoteId}`)
      .then((d: any) => setQuote(d))
      .catch((err: any) => showAlert(err.message || 'Failed to load quotation details', { variant: 'error' }))
      .finally(() => setLoading(false));
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

  async function handleDownloadPdf() {
    if (!quote) return;
    setDownloadingPdf(true);
    try {
      await apiDownload(`/v1/quotations/${quote.id}/pdf`, `Quotation-${quote.quote_number || quote.id}.pdf`);
      showAlert('Quotation PDF generated.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to download quotation PDF', { variant: 'error' });
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) {
    return (
      <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
        <SheetContent className="w-full sm:max-w-160 flex items-center justify-center p-0">
          <SheetTitle className="sr-only">Loading quotation</SheetTitle>
          <SectionLoading label="Loading quotation details…" />
        </SheetContent>
      </Sheet>
    );
  }

  if (!quote) return null;

  const expired = isExpired(quote.valid_until, quote.status);
  const routeString = [quote.origin_port || quote.origin_city, quote.destination_port || quote.destination_city].filter(Boolean).join(' ➔ ');
  const modeIcon = getModeIcon(quote.shipment_type);

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-160 flex flex-col p-0 gap-0 overflow-y-auto">
        {/* Sticky Header */}
        <div className="p-4 sm:px-6 border-b border-border bg-card sticky top-0 z-10 flex items-center justify-between gap-3 shadow-xs">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-primary">{quote.quote_number}</span>
              <StatusBadge status={quote.status} />
              {expired && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
            </div>
            <SheetTitle className="text-base font-bold text-foreground truncate">{quote.title}</SheetTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tip label="Download PDF document">
              <Button variant="outline" size="icon" iconOnly onClick={handleDownloadPdf} disabled={downloadingPdf} aria-label="Download PDF">
                <Icon name="download" size={14} />
              </Button>
            </Tip>
            <Tip label="Send quotation to client">
              <Button variant="outline" size="icon" iconOnly onClick={() => onSendEmail(quote)} aria-label="Send Email">
                <Icon name="mail" size={14} />
              </Button>
            </Tip>
            <Tip label="Edit quotation">
              <Button variant="outline" size="icon" iconOnly onClick={() => onEdit(quote)} aria-label="Edit Quotation">
                <Icon name="edit" size={14} />
              </Button>
            </Tip>
          </div>
        </div>

        {/* Quick Action Ribbon */}
        <div className="p-3 sm:px-6 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onStatusChange(quote)} className="text-xs h-8 gap-1.5">
            <Icon name="refresh" size={13} />
            <span>Change Stage</span>
          </Button>

          {quote.status === 'APPROVED' && (
            <Button size="sm" onClick={() => onConvert(quote)} className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <Icon name="arrowRight" size={13} />
              <span>Convert to Shipment</span>
            </Button>
          )}

          {canDelete && (
            <Button variant="outline" size="sm" onClick={() => onDelete(quote)} className="text-xs h-8 gap-1 text-destructive hover:bg-destructive/10 hover:border-destructive/30 ml-auto">
              <Icon name="trash2" size={13} />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-6 flex-1 text-xs">
          {/* Logistics Route Banner */}
          <div className="p-3.5 bg-card rounded-xl border border-border shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Icon name={modeIcon} size={13} className="text-primary" />
                <span>Logistics & Route</span>
              </span>
              <span className="sales-mode-pill">
                <Icon name={modeIcon} size={11} />
                <span>{quote.shipment_type || 'General'}</span>
              </span>
            </div>
            <div className="text-sm font-bold text-foreground flex items-center gap-2 mt-1">
              <span>{quote.origin_port || quote.origin_city || 'Origin Port'}</span>
              <Icon name="arrowRight" size={13} className="text-primary shrink-0" />
              <span>{quote.destination_port || quote.destination_city || 'Destination Port'}</span>
            </div>
            {(quote.origin_city || quote.destination_city) && (
              <div className="text-[11px] text-muted-foreground">
                Cities: {quote.origin_city || '—'} ➔ {quote.destination_city || '—'}
              </div>
            )}
          </div>

          {/* Customer & Commercial Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-muted/20 rounded-xl border border-border/60">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Customer / Client</span>
              <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                <PersonAvatar userId={quote.customer_id} kind="customers" name={quote.customer_name || 'Customer'} size={18} />
                <span className="truncate">{quote.customer_name || 'Unassigned'}</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Currency</span>
              <div className="font-bold text-foreground text-xs">{quote.currency || 'USD'}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Valid From</span>
              <div className="font-medium text-foreground text-xs">{fmtDate(quote.valid_from)}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Valid Until</span>
              <div className={`font-semibold text-xs ${expired ? 'text-destructive' : 'text-foreground'}`}>
                {fmtDate(quote.valid_until)} {expired ? '(Expired)' : ''}
              </div>
            </div>
          </div>

          {/* Rejection / Converted Banners */}
          {quote.rejection_reason && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs">
              <div className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Rejection Reason</div>
              <div>{quote.rejection_reason}</div>
            </div>
          )}

          {quote.converted_shipment_id && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold">Converted to Shipment: </span>
                <span className="font-mono">{quote.converted_shipment_id}</span>
              </div>
              <Badge variant="success" className="text-[10px]">Active Shipment</Badge>
            </div>
          )}

          {/* Line Items Table */}
          {quote.lines && quote.lines.length > 0 && (
            <div>
              <div className="sales-detail-section-title">
                <Icon name="list" size={13} className="text-primary" />
                <span>Quoted Line Items ({quote.lines.length})</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="sales-line-table">
                    <thead>
                      <tr>
                        <th className="text-left w-8">#</th>
                        <th className="text-left">Description</th>
                        <th className="text-left">Category</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Tax%</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.lines.map((l: any, i: number) => (
                        <tr key={l.id || i}>
                          <td className="text-muted-foreground font-mono text-[11px]">{l.line_number || i + 1}</td>
                          <td className="font-medium text-foreground">{l.description}</td>
                          <td className="text-muted-foreground">{l.category}</td>
                          <td className="text-center font-mono">{l.quantity}</td>
                          <td className="text-right font-mono">{fmt(l.unit_price, quote.currency)}</td>
                          <td className="text-right text-muted-foreground">{l.tax_rate ?? 0}%</td>
                          <td className="text-right font-mono font-bold text-foreground">{fmt(l.line_total, quote.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Totals Summary Card */}
          <div className="sales-totals-box">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-mono font-semibold text-foreground">{fmt(quote.subtotal, quote.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tax Amount:</span>
              <span className="font-mono font-semibold text-foreground">{fmt(quote.tax_amount, quote.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold text-foreground border-t border-border/80 pt-2 mt-1">
              <span>Grand Total:</span>
              <span className="font-mono text-base font-extrabold text-primary">{fmt(quote.total_amount, quote.currency)}</span>
            </div>
          </div>

          {/* Logistics Notes / Goods Description */}
          {quote.goods_description && (
            <div>
              <div className="sales-detail-section-title">
                <Icon name="fileText" size={13} className="text-primary" />
                <span>Goods & Cargo Description</span>
              </div>
              <p className="p-3 bg-muted/20 rounded-lg border border-border/40 text-foreground m-0 leading-relaxed">
                {quote.goods_description}
              </p>
            </div>
          )}

          {quote.notes && (
            <div>
              <div className="sales-detail-section-title">
                <Icon name="edit" size={13} className="text-primary" />
                <span>Internal Notes & Scope</span>
              </div>
              <p className="p-3 bg-muted/20 rounded-lg border border-border/40 text-foreground m-0 leading-relaxed">
                {quote.notes}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Create / Edit Quote Modal ────────────────────────────────────────────────

function QuoteModal({
  editQuote, customers, onClose, onSaved,
}: {
  editQuote: any | null;
  customers: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit   = Boolean(editQuote);
  const taxCodes = useTaxCodes().filter(c => c.appliesTo !== 'PURCHASE');

  const [form, setForm] = useState<any>(() => ({
    title:             editQuote?.title ?? '',
    customer_id:       editQuote?.customer_id ?? '',
    shipment_type:     editQuote?.shipment_type ?? 'SEA',
    currency:          editQuote?.currency ?? getCompany().currency ?? 'USD',
    origin_port:       editQuote?.origin_port ?? '',
    origin_city:       editQuote?.origin_city ?? '',
    destination_port:  editQuote?.destination_port ?? '',
    destination_city:  editQuote?.destination_city ?? '',
    valid_from:        toDateInput(editQuote?.valid_from),
    valid_until:       toDateInput(editQuote?.valid_until),
    goods_description: editQuote?.goods_description ?? '',
    notes:             editQuote?.notes ?? '',
  }));

  const [lines, setLines] = useState<any[]>(() =>
    editQuote?.lines?.length
      ? editQuote.lines.map((l: any) => ({
          description: l.description,
          category:    l.category,
          quantity:    l.quantity,
          unit_price:  l.unit_price,
          tax_rate:    l.tax_rate,
          tax_code_id: l.tax_code_id ?? null,
        }))
      : [blankLine()]
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const [customerItem, setCustomerItem] = useState<PickerItem | null>(() => {
    const c = customers.find((x: any) => x.id === (editQuote?.customer_id ?? ''));
    return c ? { id: c.id, label: c.name, sublabel: c.email || c.phone || undefined, avatarUserId: c.id, avatarKind: 'customers' as const, avatarType: 'company' as const } : null;
  });

  async function searchCustomersLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    const usable = customers.filter((c: any) => c.active !== false);
    const filtered = ql
      ? usable.filter((c: any) => (c.name || '').toLowerCase().includes(ql) || (c.email || '').toLowerCase().includes(ql))
      : usable;
    return filtered.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined, avatarUserId: c.id, avatarKind: 'customers' as const, avatarType: 'company' as const }));
  }

  async function createCustomerInline(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify({ name }) });
    customers.push(created);
    return { id: created.id, label: created.name };
  }

  function setField(key: string, val: string) {
    setForm((f: any) => ({ ...f, [key]: val }));
  }

  function setLine(idx: number, key: string, val: any) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function setTaxCode(idx: number, codeId: string) {
    const tc = taxCodes.find(c => c.id === codeId);
    setLines(ls => ls.map((l, i) =>
      i === idx ? { ...l, tax_code_id: codeId, tax_rate: tc ? tc.rate : l.tax_rate } : l));
  }

  function addLine() { setLines(ls => [...ls, blankLine()]); }
  function removeLine(idx: number) { setLines(ls => ls.filter((_, i) => i !== idx)); }

  // Computed totals
  const computed = useMemo(() => lines.map(l => {
    const lt = Number(l.quantity || 0) * Number(l.unit_price || 0);
    const ta = lt * (Number(l.tax_rate || 0) / 100);
    return { lineTotal: lt, taxAmount: ta };
  }), [lines]);

  const subtotal   = useMemo(() => computed.reduce((s, c) => s + c.lineTotal, 0), [computed]);
  const totalTax   = useMemo(() => computed.reduce((s, c) => s + c.taxAmount, 0), [computed]);
  const grandTotal = subtotal + totalTax;

  async function save() {
    if (!form.title.trim()) { setErr('Quotation title is required'); return; }
    if (!form.customer_id)  { setErr('Customer selection is required'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form, lines };
      if (isEdit) {
        await apiFetch(`/v1/quotations/${editQuote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/v1/quotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Failed to save quotation');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Icon name={isEdit ? 'edit' : 'plus'} size={16} className="text-primary" />
            <span>{isEdit ? 'Edit Quotation' : 'Create New Quotation'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Row 1: Title */}
          <div>
            <label className="font-semibold text-foreground block mb-1">Quotation Title *</label>
            <Input
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="e.g. Sea Freight Quote — Mombasa to Dar es Salaam"
              className="h-9 text-xs"
            />
          </div>

          {/* Row 2: Customer & Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-foreground block mb-1">Customer / Account *</label>
              <EntityPicker
                value={customerItem}
                onChange={(item) => { setCustomerItem(item); setField('customer_id', item?.id ?? ''); }}
                search={searchCustomersLocal}
                onCreate={createCustomerInline}
                createLabel={(q) => `Add new customer "${q}"`}
                placeholder="Search customers…"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Shipment Mode</label>
              <Select value={form.shipment_type} onValueChange={v => setField('shipment_type', v)}>
                <SelectTrigger aria-label="Shipment Mode" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPMENT_TYPES.map(t => (
                    <SelectItem key={t.key} value={t.key} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Currency & Validity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-foreground block mb-1">Currency</label>
              <Select value={form.currency} onValueChange={v => setField('currency', v)}>
                <SelectTrigger aria-label="Currency" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Valid From</label>
              <DatePicker date={parseDateOnly(form.valid_from)} onChange={d => setField('valid_from', toDateOnlyString(d))} />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Valid Until</label>
              <DatePicker date={parseDateOnly(form.valid_until)} onChange={d => setField('valid_until', toDateOnlyString(d))} />
            </div>
          </div>

          {/* Row 4: Route Ports & Cities */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="font-semibold text-foreground block mb-1">Origin Port</label>
              <Input value={form.origin_port} onChange={e => setField('origin_port', e.target.value)} placeholder="e.g. Mombasa" className="h-9 text-xs" />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Origin City</label>
              <Input value={form.origin_city} onChange={e => setField('origin_city', e.target.value)} placeholder="e.g. Mombasa" className="h-9 text-xs" />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Dest. Port</label>
              <Input value={form.destination_port} onChange={e => setField('destination_port', e.target.value)} placeholder="e.g. Dar es Salaam" className="h-9 text-xs" />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Dest. City</label>
              <Input value={form.destination_city} onChange={e => setField('destination_city', e.target.value)} placeholder="e.g. Dar es Salaam" className="h-9 text-xs" />
            </div>
          </div>

          {/* Line Items Builder */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="list" size={13} className="text-primary" />
                <span>Line Items ({lines.length})</span>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="h-7 px-2.5 text-xs gap-1">
                <Icon name="plus" size={12} />
                <span>Add Line Item</span>
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-2 min-w-[160px]">Description</th>
                      <th className="p-2 min-w-[110px]">Category</th>
                      <th className="p-2 w-16 text-center">Qty</th>
                      <th className="p-2 w-28 text-right">Unit Price</th>
                      <th className="p-2 min-w-[130px]">Tax Treatment</th>
                      <th className="p-2 w-24 text-right">Total</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="p-2">
                          <Input
                            value={l.description}
                            onChange={e => setLine(i, 'description', e.target.value)}
                            placeholder="Item description…"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Select value={l.category} onValueChange={v => setLine(i, 'category', v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(cat => <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 text-center">
                          <Input
                            type="number"
                            min={1}
                            value={l.quantity}
                            onChange={e => setLine(i, 'quantity', Number(e.target.value))}
                            className="h-8 text-xs text-center w-16 font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.unit_price}
                            onChange={e => setLine(i, 'unit_price', Number(e.target.value))}
                            className="h-8 text-xs text-right font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <Select value={l.tax_code_id ?? ''} onValueChange={v => setTaxCode(i, v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Standard tax" />
                            </SelectTrigger>
                            <SelectContent>
                              {taxCodes.map(tc => (
                                <SelectItem key={tc.id} value={tc.id} className="text-xs">
                                  {tc.code} · {tc.rate}%
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-foreground whitespace-nowrap">
                          {fmt(computed[i]?.lineTotal ?? 0, form.currency)}
                        </td>
                        <td className="p-2 text-center">
                          {lines.length > 1 && (
                            <Tip label="Remove line item">
                              <Button variant="ghost" size="icon" iconOnly onClick={() => removeLine(i)} className="h-7 w-7 text-destructive hover:bg-destructive/10">
                                <Icon name="x" size={13} />
                              </Button>
                            </Tip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="flex flex-col items-end gap-1 mt-3 pr-2 text-xs">
              <div className="text-muted-foreground">Subtotal: <span className="font-mono font-bold text-foreground">{fmt(subtotal, form.currency)}</span></div>
              <div className="text-muted-foreground">Tax Amount: <span className="font-mono font-bold text-foreground">{fmt(totalTax, form.currency)}</span></div>
              <div className="text-sm font-bold text-foreground border-t border-border pt-1.5 mt-0.5">
                Total Quotation: <span className="font-mono text-base font-extrabold text-primary">{fmt(grandTotal, form.currency)}</span>
              </div>
            </div>
          </div>

          {/* Notes & Goods Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="font-semibold text-foreground block mb-1">Goods & Cargo Description</label>
              <Textarea
                value={form.goods_description}
                onChange={e => setField('goods_description', e.target.value)}
                rows={2}
                placeholder="Cargo specs, weights, packaging details…"
                className="text-xs resize-none"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Internal Notes & Scope</label>
              <Textarea
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
                placeholder="Instructions, payment terms, follow-up timeline…"
                className="text-xs resize-none"
              />
            </div>
          </div>

          {err && <div className="text-xs text-destructive p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">{err}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Quotation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Sales / Quotations Page ─────────────────────────────────────────────

export const Sales: React.FC = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Role gating
  const canDelete = MGMT_ROLES.includes((user?.role ?? '') as UserRole);

  // Data state
  const [quotes, setQuotes]       = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [qStats, setQStats]       = useState<{
    total: number; pipeline_value: number; avg_quote: number;
    win_rate: number; converted: number; approved: number;
    rejected: number; pending_value: number; status_counts: Record<string, number>;
  } | null>(null);

  // View state
  const view = (searchParams.get('view') ?? 'kanban') as 'kanban' | 'list';
  function setView(v: 'kanban' | 'list') {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      n.set('view', v);
      return n;
    }, { replace: true });
  }

  // Filter state
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState<string>('ALL');
  const [modeFilter, setModeFilter]         = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');

  // Modal / Drawer state
  const [showModal, setShowModal]         = useState(false);
  const [editQuote, setEditQuote]         = useState<any>(null);
  const [detailId, setDetailId]           = useState<string | null>(() => searchParams.get('quote'));
  const [statusQuote, setStatusQuote]     = useState<any>(null);
  const [emailQuote, setEmailQuote]       = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  // Pagination for table view
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchStats = useCallback(() => {
    apiFetch('/v1/quotations/stats').then(setQStats).catch(() => {});
  }, []);

  const loadQuotes = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/quotations')
      .then((d: any) => setQuotes(Array.isArray(d) ? d : d.items ?? d.data ?? []))
      .catch((err: any) => showAlert(err.message || 'Failed to load quotations', { variant: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadQuotes();
    fetchStats();
  }, [loadQuotes, fetchStats]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((d: any) => setCustomers(Array.isArray(d) ? d : d.items ?? d.data ?? []))
      .catch(() => {});
  }, []);

  // Sync quote deep link
  useEffect(() => {
    const qid = searchParams.get('quote');
    if (qid && qid !== detailId) setDetailId(qid);
  }, [searchParams, detailId]);

  function handleOpenDetail(id: string) {
    setDetailId(id);
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      n.set('quote', id);
      return n;
    }, { replace: true });
  }

  function handleCloseDetail() {
    setDetailId(null);
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      n.delete('quote');
      return n;
    }, { replace: true });
  }

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    let list = quotes;
    if (statusFilter !== 'ALL') {
      list = list.filter(q => q.status === statusFilter);
    }
    if (modeFilter !== 'ALL') {
      list = list.filter(q => (q.shipment_type || '').toUpperCase() === modeFilter);
    }
    if (currencyFilter !== 'ALL') {
      list = list.filter(q => q.currency === currencyFilter);
    }
    if (search.trim()) {
      const ql = search.trim().toLowerCase();
      list = list.filter(q =>
        (q.quote_number || '').toLowerCase().includes(ql) ||
        (q.title || '').toLowerCase().includes(ql) ||
        (q.customer_name || '').toLowerCase().includes(ql) ||
        (q.origin_port || '').toLowerCase().includes(ql) ||
        (q.destination_port || '').toLowerCase().includes(ql) ||
        (q.origin_city || '').toLowerCase().includes(ql) ||
        (q.destination_city || '').toLowerCase().includes(ql)
      );
    }
    return list;
  }, [quotes, statusFilter, modeFilter, currencyFilter, search]);

  // Paginated list
  const paginatedQuotes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredQuotes.slice(start, start + pageSize);
  }, [filteredQuotes, page, pageSize]);

  const totalPages = Math.ceil(filteredQuotes.length / pageSize) || 1;

  // Actions
  function openCreate() {
    setEditQuote(null);
    setShowModal(true);
  }

  function openEdit(q: any) {
    setEditQuote(q);
    handleCloseDetail();
    setShowModal(true);
  }

  function openDelete(q: any) {
    handleCloseDetail();
    setConfirmDelete(q);
  }

  async function doDelete() {
    const q = confirmDelete;
    setConfirmDelete(null);
    try {
      await apiFetch(`/v1/quotations/${q.id}`, { method: 'DELETE' });
      showAlert('Quotation deleted successfully.', { variant: 'success' });
      loadQuotes();
      fetchStats();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete quotation', { variant: 'error' });
    }
  }

  async function doConvert(q: any) {
    handleCloseDetail();
    try {
      await apiFetch(`/v1/quotations/${q.id}/convert`, { method: 'POST' });
      showAlert('Quotation converted to shipment successfully!', { variant: 'success' });
      loadQuotes();
      fetchStats();
    } catch (e: any) {
      showAlert(e.message || 'Conversion to shipment failed', { variant: 'error' });
    }
  }

  // Drag and drop column move
  async function handleColumnDrop(itemId: string, fromColumn: string, toColumn: string) {
    if (fromColumn === toColumn) return;
    try {
      await apiFetch(`/v1/quotations/${itemId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toColumn }),
      });
      showAlert(`Moved quotation to ${toColumn}`, { variant: 'success' });
      loadQuotes();
      fetchStats();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update quotation stage', { variant: 'error' });
    }
  }

  function onSaved() {
    setShowModal(false);
    setEditQuote(null);
    showAlert(editQuote ? 'Quotation updated successfully.' : 'New quotation created successfully.', { variant: 'success' });
    loadQuotes();
    fetchStats();
  }

  function onStatusDone() {
    setStatusQuote(null);
    showAlert('Status updated successfully.', { variant: 'success' });
    loadQuotes();
    fetchStats();
  }

  function exportCSV() {
    if (filteredQuotes.length === 0) {
      showAlert('No quotations to export.', { variant: 'warning' });
      return;
    }
    const headers = ['Quote Number', 'Title', 'Customer', 'Shipment Mode', 'Origin', 'Destination', 'Currency', 'Subtotal', 'Tax', 'Total Amount', 'Status', 'Valid Until', 'Created At'];
    const rows = filteredQuotes.map(q => [
      `"${q.quote_number || ''}"`,
      `"${(q.title || '').replace(/"/g, '""')}"`,
      `"${(q.customer_name || '').replace(/"/g, '""')}"`,
      q.shipment_type || '',
      `"${(q.origin_port || q.origin_city || '').replace(/"/g, '""')}"`,
      `"${(q.destination_port || q.destination_city || '').replace(/"/g, '""')}"`,
      q.currency || 'USD',
      q.subtotal ?? 0,
      q.tax_amount ?? 0,
      q.total_amount ?? 0,
      q.status || '',
      q.valid_until || '',
      q.created_at || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quotations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showAlert(`Exported ${filteredQuotes.length} quotations to CSV.`, { variant: 'success' });
  }

  const hasActiveFilters = statusFilter !== 'ALL' || modeFilter !== 'ALL' || currencyFilter !== 'ALL' || search.trim() !== '';

  return (
    <div className="sales-page">
      {/* Page Header */}
      <div className="sales-page-header">
        <PageHeader
          crumbs={['CRM', 'Quotes']}
          titlePlain="Quotation"
          titleEm="pipeline"
          subtitle="Prepare, track, approve and convert commercial freight quotations."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs gap-1.5 h-8">
                <Icon name="download" size={13} />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
              <Button size="sm" onClick={openCreate} className="text-xs gap-1.5 h-8 font-semibold">
                <Icon name="plus" size={14} />
                <span>New Quotation</span>
              </Button>
            </div>
          }
        />
      </div>

      {/* KPI Metrics Deck */}
      <div className="sales-metrics">
        <div className="sales-metrics-grid">
          {/* Card 1: Total Quotes */}
          <div
            className={`sales-metric-card ${statusFilter === 'ALL' && !hasActiveFilters ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
            role="button"
            tabIndex={0}
          >
            <div className="sales-metric-card-top">
              <span className="sales-metric-label">Total Quotations</span>
              <Icon name="clipboard" size={16} className="text-primary" />
            </div>
            <div className="sales-metric-val">{qStats?.total ?? quotes.length}</div>
            <div className="sales-metric-sub">
              <span>Approved: <strong className="text-foreground">{qStats?.approved ?? 0}</strong></span>
              <span>Win Rate: <strong className="text-emerald-600 font-bold">{qStats?.win_rate ?? 0}%</strong></span>
            </div>
          </div>

          {/* Card 2: Pipeline Value */}
          <div className="sales-metric-card">
            <div className="sales-metric-card-top">
              <span className="sales-metric-label">Pipeline Value</span>
              <Icon name="trendingUp" size={16} className="text-amber-500" />
            </div>
            <div className="sales-metric-val text-primary">{fmt(qStats?.pipeline_value ?? 0)}</div>
            <div className="sales-metric-sub">
              <span>Won: <strong className="text-foreground">{fmt(qStats?.pipeline_value ? qStats.pipeline_value - (qStats.pending_value ?? 0) : 0)}</strong></span>
              <span>Avg: <strong className="text-foreground">{fmt(qStats?.avg_quote ?? 0)}</strong></span>
            </div>
          </div>

          {/* Card 3: In Review / Pending */}
          <div
            className={`sales-metric-card ${statusFilter === 'PENDING' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
            role="button"
            tabIndex={0}
          >
            <div className="sales-metric-card-top">
              <span className="sales-metric-label">Pending Review</span>
              <Icon name="clock" size={16} className="text-amber-500" />
            </div>
            <div className="sales-metric-val text-amber-500">{qStats?.status_counts?.PENDING ?? 0}</div>
            <div className="sales-metric-sub">
              <span>Pending Value:</span>
              <span className="font-bold text-foreground">{fmt(qStats?.pending_value ?? 0)}</span>
            </div>
          </div>

          {/* Card 4: Converted to Won */}
          <div
            className={`sales-metric-card ${statusFilter === 'CONVERTED' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'CONVERTED' ? 'ALL' : 'CONVERTED')}
            role="button"
            tabIndex={0}
          >
            <div className="sales-metric-card-top">
              <span className="sales-metric-label">Converted Shipments</span>
              <Icon name="checkCircle" size={16} className="text-emerald-500" />
            </div>
            <div className="sales-metric-val text-emerald-600">{qStats?.converted ?? 0}</div>
            <div className="sales-metric-sub">
              <span>Rejected: <strong className="text-destructive">{qStats?.rejected ?? 0}</strong></span>
              <Badge variant="brand" className="text-[10px]">Shipment Cases</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar & Filter Bar */}
      <div className="sales-toolbar">
        <div className="sales-toolbar-filters">
          {/* Search Box */}
          <div className="sales-search-box">
            <Icon name="search" size={14} className="sales-search-icon" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by quote #, title, customer, route…"
              className="sales-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8.5 text-xs w-[130px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Statuses</SelectItem>
              {STAGES.map(s => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Shipment Mode Filter */}
          <Select value={modeFilter} onValueChange={v => { setModeFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8.5 text-xs w-[130px]">
              <SelectValue placeholder="All Modes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Modes</SelectItem>
              {SHIPMENT_TYPES.map(m => (
                <SelectItem key={m.key} value={m.key} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Currency Filter */}
          <Select value={currencyFilter} onValueChange={v => { setCurrencyFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8.5 text-xs w-[110px]">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Currencies</SelectItem>
              {CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setStatusFilter('ALL'); setModeFilter('ALL'); setCurrencyFilter('ALL'); setPage(1); }}
              className="text-xs h-8.5 text-muted-foreground hover:text-foreground gap-1"
            >
              <Icon name="x" size={12} />
              <span>Reset</span>
            </Button>
          )}
        </div>

        {/* View Toggle & Counts */}
        <div className="sales-toolbar-actions">
          <span className="text-xs text-muted-foreground hidden md:inline">
            Showing <strong className="text-foreground">{filteredQuotes.length}</strong> of {quotes.length}
          </span>

          <div className="sales-view-toggle">
            <Button
              variant={view === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('kanban')}
              className="h-7 px-2.5 text-xs font-semibold gap-1"
            >
              <Icon name="layoutGrid" size={13} />
              <span className="hidden sm:inline">Board</span>
            </Button>
            <Button
              variant={view === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('list')}
              className="h-7 px-2.5 text-xs font-semibold gap-1"
            >
              <Icon name="list" size={13} />
              <span className="hidden sm:inline">Table</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="p-12 text-center bg-card rounded-xl border border-border">
          <SectionLoading label="Loading quotation pipeline…" />
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="p-16 text-center bg-card rounded-xl border border-border">
          <Icon name="clipboard" size={32} className="mx-auto mb-3 text-muted-foreground/50" />
          <h3 className="text-sm font-bold text-foreground">No quotations found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {hasActiveFilters ? 'No quotations match your current filter criteria. Try clearing some filters.' : 'Get started by creating your first freight quotation.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('ALL'); setModeFilter('ALL'); setCurrencyFilter('ALL'); }}>
                Clear Filters
              </Button>
            ) : (
              <Button size="sm" onClick={openCreate} className="gap-1.5 font-semibold">
                <Icon name="plus" size={14} />
                <span>Create Quotation</span>
              </Button>
            )}
          </div>
        </div>
      ) : view === 'kanban' ? (
        /* ── Kanban Board View ── */
        <KanbanBoard
          columns={STAGES.map(s => ({ id: s.key, label: s.label, color: s.color }))}
          items={filteredQuotes.map(q => ({ id: q.id, columnId: q.status, quote: q }))}
          onDrop={handleColumnDrop}
          emptyMessage="No quotations in this stage"
          renderCard={(item) => {
            const q = (item as any).quote;
            const expired = isExpired(q.valid_until, q.status);
            const routeStr = [q.origin_port || q.origin_city, q.destination_port || q.destination_city].filter(Boolean).join(' ➔ ');
            const modeIcon = getModeIcon(q.shipment_type);

            return (
              <div
                className="sales-card-inner"
                role="button"
                tabIndex={0}
                onClick={() => handleOpenDetail(q.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDetail(q.id); } }}
              >
                {/* Top: Quote # & Mode Badge */}
                <div className="sales-card-top">
                  <span className="sales-quote-num">{q.quote_number}</span>
                  <span className="sales-mode-pill">
                    <Icon name={modeIcon} size={11} />
                    <span>{q.shipment_type || 'General'}</span>
                  </span>
                </div>

                {/* Title */}
                <div className="sales-card-title">{q.title}</div>

                {/* Customer */}
                <div className="sales-card-cust">
                  <PersonAvatar userId={q.customer_id} kind="customers" name={q.customer_name || 'Customer'} size={16} />
                  <span className="truncate">{q.customer_name || 'No customer specified'}</span>
                </div>

                {/* Route Pill */}
                {routeStr && (
                  <div className="sales-card-route" title={routeStr}>
                    <Icon name="mapPin" size={11} className="text-primary shrink-0" />
                    <span>{routeStr}</span>
                  </div>
                )}

                {/* Meta Footer */}
                <div className="sales-card-meta">
                  <div className="sales-card-amount">
                    {fmt(q.total_amount, q.currency)}
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Tip label="Quick edit quotation">
                      <Button variant="ghost" size="icon" iconOnly onClick={() => openEdit(q)} className="h-6 w-6 text-muted-foreground hover:text-foreground">
                        <Icon name="edit" size={12} />
                      </Button>
                    </Tip>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" iconOnly className="h-6 w-6 text-muted-foreground hover:text-foreground">
                          <Icon name="moreHorizontal" size={12} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem onClick={() => handleOpenDetail(q.id)}>
                          <Icon name="eye" size={13} className="text-primary" />
                          <span>View Details</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(q)}>
                          <Icon name="edit" size={13} />
                          <span>Edit Details</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusQuote(q)}>
                          <Icon name="refresh" size={13} />
                          <span>Update Stage</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEmailQuote(q)}>
                          <Icon name="mail" size={13} />
                          <span>Send by Email</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => apiDownload(`/v1/quotations/${q.id}/pdf`, `Quotation-${q.quote_number || q.id}.pdf`)}>
                          <Icon name="download" size={13} />
                          <span>Download PDF</span>
                        </DropdownMenuItem>
                        {q.status === 'APPROVED' && (
                          <DropdownMenuItem onClick={() => doConvert(q)} className="text-emerald-600 font-semibold">
                            <Icon name="arrowRight" size={13} />
                            <span>Convert to Shipment</span>
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDelete(q)} className="text-destructive">
                              <Icon name="trash2" size={13} />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Validity Note */}
                {q.valid_until && (
                  <div className={`sales-card-validity ${expired ? 'is-expired' : ''}`}>
                    {expired ? '⚠ Expired ' : 'Valid until '} {fmtDate(q.valid_until)}
                  </div>
                )}
              </div>
            );
          }}
        />
      ) : (
        /* ── Data Table / List View ── */
        <div className="sales-table-card">
          <div className="sales-table-wrapper">
            <table className="sales-data-table">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Title & Description</th>
                  <th>Customer</th>
                  <th>Mode</th>
                  <th>Logistics Route</th>
                  <th className="text-right">Total Amount</th>
                  <th>Valid Until</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedQuotes.map((q) => {
                  const expired = isExpired(q.valid_until, q.status);
                  const routeStr = [q.origin_port || q.origin_city, q.destination_port || q.destination_city].filter(Boolean).join(' ➔ ');
                  const modeIcon = getModeIcon(q.shipment_type);

                  return (
                    <tr key={q.id} onClick={() => handleOpenDetail(q.id)}>
                      <td>
                        <span className="font-mono text-xs font-bold text-primary">{q.quote_number}</span>
                      </td>
                      <td>
                        <div className="font-bold text-foreground text-xs">{q.title}</div>
                        <div className="text-[11px] text-muted-foreground">{fmtDate(q.created_at)}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                          <PersonAvatar userId={q.customer_id} kind="customers" name={q.customer_name || 'Customer'} size={18} />
                          <span className="truncate max-w-[150px]">{q.customer_name || '—'}</span>
                        </div>
                      </td>
                      <td>
                        <span className="sales-mode-pill">
                          <Icon name={modeIcon} size={11} />
                          <span>{q.shipment_type || 'General'}</span>
                        </span>
                      </td>
                      <td>
                        <div className="text-xs text-foreground font-medium truncate max-w-[180px]">
                          {routeStr || '—'}
                        </div>
                      </td>
                      <td className="text-right font-mono font-bold text-foreground text-xs whitespace-nowrap">
                        {fmt(q.total_amount, q.currency)}
                      </td>
                      <td>
                        <span className={`text-xs ${expired ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                          {fmtDate(q.valid_until)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Tip label="View details">
                            <Button variant="ghost" size="icon" iconOnly onClick={() => handleOpenDetail(q.id)} className="h-7 w-7">
                              <Icon name="eye" size={13} />
                            </Button>
                          </Tip>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" iconOnly className="h-7 w-7">
                                <Icon name="moreHorizontal" size={13} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => handleOpenDetail(q.id)}>
                                <Icon name="eye" size={13} className="text-primary" />
                                <span>View Details</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(q)}>
                                <Icon name="edit" size={13} />
                                <span>Edit Quotation</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setStatusQuote(q)}>
                                <Icon name="refresh" size={13} />
                                <span>Update Stage</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEmailQuote(q)}>
                                <Icon name="mail" size={13} />
                                <span>Send by Email</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => apiDownload(`/v1/quotations/${q.id}/pdf`, `Quotation-${q.quote_number || q.id}.pdf`)}>
                                <Icon name="download" size={13} />
                                <span>Download PDF</span>
                              </DropdownMenuItem>
                              {q.status === 'APPROVED' && (
                                <DropdownMenuItem onClick={() => doConvert(q)} className="text-emerald-600 font-semibold">
                                  <Icon name="arrowRight" size={13} />
                                  <span>Convert to Shipment</span>
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openDelete(q)} className="text-destructive">
                                    <Icon name="trash2" size={13} />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-border flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} ({filteredQuotes.length} total)
              </span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-7 text-xs">
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-7 text-xs">
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Slide-out Drawer */}
      {detailId && (
        <DetailPanel
          quoteId={detailId}
          onClose={handleCloseDetail}
          onEdit={openEdit}
          onDelete={openDelete}
          canDelete={canDelete}
          onStatusChange={q => setStatusQuote(q)}
          onConvert={doConvert}
          onSendEmail={q => setEmailQuote(q)}
        />
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <QuoteModal
          editQuote={editQuote}
          customers={customers}
          onClose={() => { setShowModal(false); setEditQuote(null); }}
          onSaved={onSaved}
        />
      )}

      {/* Status Change Modal */}
      {statusQuote && (
        <StatusModal
          quote={statusQuote}
          onClose={() => setStatusQuote(null)}
          onDone={onStatusDone}
        />
      )}

      {/* Send Email Modal */}
      {emailQuote && (
        <SendEmailModal
          quote={emailQuote}
          onClose={() => setEmailQuote(null)}
          onSent={() => {
            setEmailQuote(null);
            showAlert('Quotation emailed to customer successfully!', { variant: 'success' });
          }}
        />
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          msg={`Are you sure you want to delete quotation "${confirmDelete.quote_number || confirmDelete.title}"? This action cannot be undone.`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
