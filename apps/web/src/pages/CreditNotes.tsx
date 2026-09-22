import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showPrompt } from '../lib/prompt.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { FormPage, FormPageActions } from '../components/FormPage.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Badge } from '../components/ui/badge.js';
import { getCompany } from '../data/companyStore.js';
import {
  DocumentDetailShell, DocumentDetailMain, DocumentDetailSidebar,
  DocumentHeaderCard, DocumentActionsCard, DocumentMetaCard, DocumentPartyCard,
  DocumentLineItemsCard, type DocumentAction,
} from '../components/DocumentDetail.js';

interface CreditNote {
  id: string; credit_note_number: string; original_invoice_id: string | null;
  customer_id: string | null; client_name: string | null; currency: string;
  credit_date: string | null; reason: string | null; notes: string | null;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  created_at: string;
  // The list endpoint attaches each note's real credit_note_lines (see
  // credit-notes.routes.ts) — there's no stored total column on the table
  // itself, the amount only ever exists as the sum of these lines.
  items?: { name?: string; description?: string; rate: number | string; qty: number | string; tax_pct: number | string }[];
}
function creditNoteTotal(cn: CreditNote): number {
  return (cn.items ?? []).reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.qty) || 1) * (1 + (Number(l.tax_pct) || 0) / 100), 0);
}
interface DraftLine { name: string; rate: string; qty: string; tax_pct: string }
const emptyLine = (): DraftLine => ({ name: '', rate: '', qty: '1', tax_pct: '0' });

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

const STATUS_VARIANT: Record<CreditNote['status'], 'gray' | 'success' | 'error'> = {
  DRAFT: 'gray', POSTED: 'success', VOID: 'error',
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Client-rendered print window — same pattern as Quotations.tsx's
 *  printQuote(); credit-notes.routes.ts has no PDF/send endpoint, so this
 *  (and the mailto: send below) are the only real options for this document. */
function printCreditNote(cn: CreditNote, total: number, fmt: (n: number, currency?: string) => string) {
  const co = getCompany();
  const items = cn.items ?? [];
  const logoHtml = co.logoUrl
    ? `<img src="${co.logoUrl}" style="height:48px;max-width:160px;object-fit:contain" alt="${co.name}"/>`
    : `<div style="font-size:22px;font-weight:800;color:#0d1a35">${co.name}</div>`;
  const rowsHtml = items.map((l, i) => {
    const lineTotal = (Number(l.rate) || 0) * (Number(l.qty) || 1) * (1 + (Number(l.tax_pct) || 0) / 100);
    return `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:8px 10px;color:#94a3b8;font-size:12px">${i + 1}</td>
      <td style="padding:8px 10px;font-weight:600;font-size:13px">${l.name || l.description || `Credit item ${i + 1}`}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${Number(l.qty) || 1}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmt(Number(l.rate) || 0, cn.currency)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#94a3b8">${Number(l.tax_pct) || 0}%</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700">${fmt(lineTotal, cn.currency)}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank', 'width=920,height=750');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${cn.credit_note_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,-apple-system,Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;padding:48px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid #dc2626}
    .co-sub{font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.5}
    .cnum{font-size:26px;font-weight:800;color:#dc2626;font-family:monospace;letter-spacing:-0.5px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px}
    .box{background:#f8fafc;border-radius:10px;padding:18px;border:1px solid #e2e8f0}
    .box-lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
    .box-val{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:6px}
    .box-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;color:#475569}
    .box-row span:last-child{font-weight:600;color:#1e293b}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;background:#f8fafc;border-bottom:2px solid #e2e8f0;letter-spacing:.04em}
    th.r{text-align:right}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:32px}
    .totals{width:260px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
    .trow{display:flex;justify-content:space-between;padding:9px 14px;font-size:13px;border-bottom:1px solid #e2e8f0}
    .trow:last-child{border:none;background:#fef2f2;font-weight:800;font-size:15px;color:#dc2626}
    .footer{border-top:2px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;align-items:center;margin-top:32px}
    .footer-co{font-size:11px;color:#94a3b8}
    @media print{body{padding:24px}@page{margin:1cm}}
  </style></head><body>
  <div class="hdr">
    <div>${logoHtml}<div class="co-sub">${co.tagline || ''}<br>${co.address ? co.address + ', ' : ''} ${co.city || ''}<br>${co.phone || ''} – ${co.email || ''}</div></div>
    <div style="text-align:right">
      <div class="cnum">${cn.credit_note_number}</div>
      <div style="font-size:12px;color:#64748b;margin-top:6px">Credit Note</div>
    </div>
  </div>
  <div class="grid2">
    <div class="box">
      <div class="box-lbl">Credited To</div>
      <div class="box-val">${cn.client_name || '—'}</div>
    </div>
    <div class="box">
      <div class="box-lbl">Credit Note Details</div>
      <div class="box-row"><span>Date</span><span>${fmtDate(cn.credit_date)}</span></div>
      <div class="box-row"><span>Currency</span><span>${cn.currency}</span></div>
      <div class="box-row"><span>Original Invoice</span><span>${cn.original_invoice_id || 'Standalone'}</span></div>
      ${cn.reason ? `<div class="box-row"><span>Reason</span><span>${cn.reason}</span></div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals-wrap"><div class="totals">
    <div class="trow"><span>Total Credited</span><span>${fmt(total, cn.currency)}</span></div>
  </div></div>
  <div class="footer">
    <div class="footer-co"><strong>${co.name}</strong><br>${co.website || ''} – ${co.email || ''}</div>
  </div>
  <script>window.onload=()=>{window.print()}</script></body></html>`);
  win.document.close();
}

function sendCreditNoteEmail(cn: CreditNote, total: number, fmt: (n: number, currency?: string) => string) {
  const body = encodeURIComponent(
    `Dear ${cn.client_name || 'Customer'},\n\nPlease find attached credit note ${cn.credit_note_number} for ${fmt(total, cn.currency)}.${cn.reason ? `\n\nReason: ${cn.reason}` : ''}\n\nKind regards,\n${getCompany().name}`
  );
  window.open(`mailto:?subject=Credit Note ${cn.credit_note_number}&body=${body}`, '_blank');
}

function CreditNoteDetailView({ note, fmt, voiding, onBack, onVoid }: {
  note: CreditNote;
  fmt: (n: number, currency?: string) => string;
  voiding: boolean;
  onBack: () => void;
  onVoid: () => void;
}) {
  const total = creditNoteTotal(note);
  const items = note.items ?? [];

  const actionGroups: DocumentAction[][] = [
    [
      { key: 'print', label: 'Print / PDF', icon: 'printer', onClick: () => printCreditNote(note, total, fmt) },
      { key: 'send', label: 'Send by Email', icon: 'mail', onClick: () => sendCreditNoteEmail(note, total, fmt) },
    ],
    [
      { key: 'void', label: 'Void Credit Note', icon: 'xCircle', variant: 'destructive', loading: voiding, loadingLabel: 'Voiding…', hidden: note.status !== 'POSTED', onClick: onVoid },
    ],
  ];

  return (
    <DocumentDetailShell backLabel="Credit Notes" onBack={onBack} docNumber={note.credit_note_number}>
      <DocumentDetailMain>
        <DocumentHeaderCard
          eyebrow="Credit note"
          number={note.credit_note_number}
          subtitle={note.client_name || 'No customer name'}
          status={<div style={{ textAlign: 'right' }}>
            <Badge variant={STATUS_VARIANT[note.status]}>{note.status}</Badge>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--red)', marginTop: 8 }}>{fmt(total, note.currency)}</div>
            <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2 }}>{fmtDate(note.credit_date)}</div>
          </div>}
          banner={note.status === 'VOID' && note.notes && (
            <div style={{ padding: '10px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--red)' }}>
              {note.notes}
            </div>
          )}
        />

        <DocumentLineItemsCard
          title="Line Items"
          columns={[
            { key: 'desc', header: 'Description', render: (l, i) => l.name || l.description || `Credit item ${i + 1}` },
            { key: 'qty', header: 'Qty', align: 'right', render: l => Number(l.qty) || 1 },
            { key: 'rate', header: 'Rate', align: 'right', render: l => fmt(Number(l.rate) || 0, note.currency) },
            { key: 'tax', header: 'Tax', align: 'right', render: l => `${Number(l.tax_pct) || 0}%` },
            { key: 'tot', header: 'Total', align: 'right', render: l => {
              const lineTotal = (Number(l.rate) || 0) * (Number(l.qty) || 1) * (1 + (Number(l.tax_pct) || 0) / 100);
              return <span style={{ fontWeight: 700 }}>{fmt(lineTotal, note.currency)}</span>;
            } },
          ]}
          rows={items}
          emptyLabel="No line-item details are available for this credit note."
          totals={[{ label: 'Total Credited', value: fmt(total, note.currency), emphasize: true }]}
        />
      </DocumentDetailMain>

      <DocumentDetailSidebar>
        <DocumentActionsCard groups={actionGroups} />
        <DocumentMetaCard rows={[
          ['Credit Note #', note.credit_note_number],
          ['Currency', note.currency],
          ['Reason', note.reason || 'No reason provided'],
          ['Created', fmtDate(note.created_at)],
        ]} />
        {note.original_invoice_id ? (
          <DocumentMetaCard title="Original Invoice" rows={[
            ['Invoice', <Link key="inv" to={`/finance/invoices?id=${note.original_invoice_id}`} style={{ color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{note.original_invoice_id}</Link>],
          ]} />
        ) : (
          <DocumentMetaCard title="Original Invoice" rows={[['Type', 'Standalone credit']]} />
        )}
        <DocumentPartyCard title="Credited To" name={note.client_name || 'No customer name'} avatarId={note.customer_id} />
      </DocumentDetailSidebar>
    </DocumentDetailShell>
  );
}

export function CreditNotes() {
  const { fmt } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = location.pathname.endsWith('/new');

  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [selected, setSelected] = useState<CreditNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const load = () => apiFetch('/v1/credit-notes').then((d: any) => { if (Array.isArray(d)) setNotes(d); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function voidNote(id: string) {
    const reason = await showPrompt('This voids the credit note and reverses its GL entries. Provide a reason for the audit trail.', {
      title: 'Void Credit Note', placeholder: 'e.g. Issued in error', confirmLabel: 'Void', required: true,
    });
    if (!reason) return;
    setVoiding(true);
    try {
      await apiFetch(`/v1/credit-notes/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
      await load();
      setSelected(prev => prev && prev.id === id ? { ...prev, status: 'VOID' } : prev);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not void this credit note.');
    } finally {
      setVoiding(false);
    }
  }

  // ── New credit note form ──
  const params = new URLSearchParams(location.search);
  const [invoiceId] = useState(params.get('invoice_id') || '');
  const [customerItem, setCustomerItem] = useState<PickerItem | null>(null);
  const [clientName, setClientName] = useState(params.get('client_name') || '');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res = await apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []);
    const list = Array.isArray(res) ? res : (res.data ?? []);
    return list.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
  }

  const updateLine = (i: number, patch: Partial<DraftLine>) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const total = lines.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.qty) || 1) * (1 + (Number(l.tax_pct) || 0) / 100), 0);

  async function submit() {
    const validLines = lines.filter(l => l.name.trim() && Number(l.rate) !== 0);
    if (validLines.length === 0) return showAlert('At least one line with a name and amount is required.');
    if (!clientName.trim() && !customerItem) return showAlert('A customer is required.');
    setSaving(true);
    try {
      await apiFetch('/v1/credit-notes', {
        method: 'POST',
        body: JSON.stringify({
          original_invoice_id: invoiceId || undefined,
          customer_id: customerItem?.id,
          client_name: clientName.trim() || customerItem?.label,
          reason: reason.trim() || undefined,
          items: validLines.map(l => ({ name: l.name.trim(), rate: Number(l.rate), qty: Number(l.qty) || 1, tax_pct: Number(l.tax_pct) || 0 })),
        }),
      });
      // The list route and this "new" route render the same component
      // instance (React Router doesn't remount across two sibling routes
      // with identical element types), so the mount-only `useEffect` above
      // never re-fires on navigate() below — the list previously stayed on
      // whatever it fetched before this credit note existed. Refetch here,
      // before navigating away, so the list is already current when it lands.
      await load();
      navigate('/finance/credit-notes');
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not issue this credit note.');
    } finally {
      setSaving(false);
    }
  }

  if (isNew) {
    return (
      <FormPage
        title="New Credit Note"
        subtitle={invoiceId ? 'Reduces the linked invoice’s outstanding balance.' : 'A standalone credit against a customer.'}
        onCancel={() => navigate('/finance/credit-notes')}
        actions={<FormPageActions onCancel={() => navigate('/finance/credit-notes')} onSave={submit} saving={saving} saveLabel="Issue Credit Note" />}
      >
        <div className="card" style={{ padding: 20 }}>
          {invoiceId && <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--teal-l)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--teal)' }}>Linked to invoice <code style={{ fontFamily: 'var(--mono)' }}>{invoiceId}</code></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Customer</label>
              {invoiceId ? (
                <input style={inp} value={clientName} onChange={e => setClientName(e.target.value)} disabled />
              ) : (
                <EntityPicker label="" value={customerItem} onChange={setCustomerItem} search={searchCustomers} placeholder="Search customers…" />
              )}
            </div>
            <div><label style={lbl}>Reason</label><input style={inp} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Returned goods, pricing error" /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px 32px', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Description</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Tax %</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px 32px', gap: 8, marginBottom: 8 }}>
              <input style={inp} value={l.name} onChange={e => updateLine(i, { name: e.target.value })} placeholder="What is being credited" />
              <input style={{ ...inp, textAlign: 'right' }} type="number" value={l.rate} onChange={e => updateLine(i, { rate: e.target.value })} placeholder="0.00" />
              <input style={{ ...inp, textAlign: 'right' }} type="number" value={l.qty} onChange={e => updateLine(i, { qty: e.target.value })} />
              <input style={{ ...inp, textAlign: 'right' }} type="number" value={l.tax_pct} onChange={e => updateLine(i, { tax_pct: e.target.value })} />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length <= 1} style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'not-allowed', opacity: lines.length > 1 ? 1 : 0.3, padding: 4 }}>
                <Icon name="trash" size={14} color="var(--red)" />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 4, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={12} /> Add line
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Total: <span style={{ color: 'var(--red)' }}>{fmt(total)}</span></div>
          </div>
        </div>
      </FormPage>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading credit notes…</div>;

  const cnStats = (() => {
    const now = new Date();
    const draftCount = notes.filter(n => n.status === 'DRAFT').length;
    const postedCount = notes.filter(n => n.status === 'POSTED').length;
    const voidCount = notes.filter(n => n.status === 'VOID').length;
    const linkedCount = notes.filter(n => !!n.original_invoice_id).length;
    const postedNotes = notes.filter(n => n.status === 'POSTED');
    const totalCredited = postedNotes.reduce((s, n) => s + creditNoteTotal(n), 0);
    const creditedThisMonth = postedNotes.reduce((s, n) => {
      if (!n.credit_date) return s;
      const d = new Date(n.credit_date);
      return s + (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? creditNoteTotal(n) : 0);
    }, 0);
    return { total: notes.length, draftCount, postedCount, voidCount, linkedCount, totalCredited, creditedThisMonth };
  })();

  if (selected) {
    return (
      <CreditNoteDetailView
        note={selected}
        fmt={fmt}
        voiding={voiding}
        onBack={() => setSelected(null)}
        onVoid={() => voidNote(selected.id)}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['FINANCE', 'CREDIT NOTES']}
        titlePlain="Credit "
        titleEm="notes"
        subtitle="Issue adjustments, customer refunds and invoice balance credits."
      />
      <MetricsRow cards={[
        {
          title: 'TOTAL CREDIT NOTES', value: String(cnStats.total),
          sub1Label: 'DRAFT', sub1Value: String(cnStats.draftCount),
          sub2Label: 'POSTED', sub2Value: String(cnStats.postedCount), barHighlight: 'var(--teal)',
        },
        {
          title: 'TOTAL CREDITED', value: fmt(cnStats.totalCredited),
          invertTrend: true,
          sub1Label: 'THIS MONTH', sub1Value: fmt(cnStats.creditedThisMonth),
          sub2Label: 'VOIDED', sub2Value: String(cnStats.voidCount), barHighlight: 'var(--red)',
        },
        {
          title: 'LINKED TO INVOICES', value: String(cnStats.linkedCount),
          sub1Label: 'LINKED', sub1Value: String(cnStats.linkedCount),
          sub2Label: 'STANDALONE', sub2Value: String(cnStats.total - cnStats.linkedCount), barHighlight: 'var(--blue)',
        },
        {
          title: 'VOID RATE', value: `${cnStats.total ? Math.round((cnStats.voidCount / cnStats.total) * 100) : 0}%`,
          sub1Label: 'VOID', sub1Value: String(cnStats.voidCount),
          sub2Label: 'TOTAL', sub2Value: String(cnStats.total), barHighlight: 'var(--gold)',
        },
      ]} />

      <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => navigate('/finance/credit-notes/new')}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Credit Note
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Number</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Reason</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>No credit notes issued yet.</td></tr>
              ) : notes.map(n => (
                <tr key={n.id} onClick={() => setSelected(n)} tabIndex={0} role="button"
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n); } }}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{n.credit_note_number}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{n.credit_date ? new Date(n.credit_date).toLocaleDateString('en-GB') : '—'}</td>
                  <td style={{ padding: '9px 12px' }}>{n.client_name || '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{n.reason || '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                    <Badge variant={STATUS_VARIANT[n.status]}>{n.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
