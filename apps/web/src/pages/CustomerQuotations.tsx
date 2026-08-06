import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';

/* ── Types ── */
type QuoteStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'EXPIRED';

interface QuoteLine {
  id: string;
  line_number: number;
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
}

interface Quote {
  id: string;
  quote_number: string;
  title: string;
  customer_name: string;
  customer_email?: string;
  shipment_type: string;
  origin_port: string;
  destination_port: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: QuoteStatus;
  valid_until: string | null;
  notes?: string;
  terms?: string;
  rejection_reason?: string;
  created_at: string;
  lines?: QuoteLine[];
}

/* ── Status config ── */
const STATUS_CFG: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9' },
  PENDING:   { label: 'Pending',   color: '#d97706', bg: '#fef3c7' },
  APPROVED:  { label: 'Accepted',  color: '#059669', bg: '#ecfdf5' },
  REJECTED:  { label: 'Rejected',  color: '#dc2626', bg: '#fee2e2' },
  CONVERTED: { label: 'Converted', color: '#0891b2', bg: '#ecfeff' },
  EXPIRED:   { label: 'Expired',   color: '#9ca3af', bg: '#f3f4f6' },
};

/* ── Mock quotes for fallback ── */
const MOCK_QUOTES: Quote[] = [
  {
    id: 'q1', quote_number: 'QTE-2026-0012', title: 'Sea Freight — 2×FCL 20ft Singapore',
    customer_name: 'Karibu Traders Ltd', shipment_type: 'SEA',
    origin_port: 'SINGAPORE', destination_port: 'DAR ES SALAAM',
    subtotal: 4200000, tax_amount: 252000, total_amount: 4452000, currency: 'TZS',
    status: 'PENDING', valid_until: '2026-07-05', created_at: '2026-06-15T08:00:00Z',
    notes: 'Rates valid for FCL containers only. Subject to vessel space availability.',
    terms: 'Payment due within 7 days of acceptance.',
    lines: [
      { id: 'l1', line_number: 1, description: 'Sea Freight — 20ft FCL', category: 'FREIGHT', quantity: 2, unit_price: 1200000, tax_rate: 0, line_total: 2400000 },
      { id: 'l2', line_number: 2, description: 'Port Handling Fees',     category: 'HANDLING', quantity: 2, unit_price: 400000,  tax_rate: 0, line_total: 800000  },
      { id: 'l3', line_number: 3, description: 'Customs Documentation',  category: 'CLEARING', quantity: 1, unit_price: 1000000, tax_rate: 0, line_total: 1000000 },
    ],
  },
  {
    id: 'q2', quote_number: 'QTE-2026-0009', title: 'Air Freight — Pharmaceuticals Nairobi',
    customer_name: 'Karibu Traders Ltd', shipment_type: 'AIR',
    origin_port: 'NAIROBI (NBO)', destination_port: 'DAR ES SALAAM (DAR)',
    subtotal: 2800000, tax_amount: 504000, total_amount: 3304000, currency: 'TZS',
    status: 'APPROVED', valid_until: '2026-06-28', created_at: '2026-06-10T10:00:00Z',
    lines: [
      { id: 'l1', line_number: 1, description: 'Air Freight — 350 kg',  category: 'FREIGHT', quantity: 350, unit_price: 4500, tax_rate: 0,  line_total: 1575000 },
      { id: 'l2', line_number: 2, description: 'Customs Clearance',     category: 'CLEARING', quantity: 1,  unit_price: 1225000, tax_rate: 0,  line_total: 1225000 },
    ],
  },
  {
    id: 'q3', quote_number: 'QTE-2026-0005', title: 'Road Freight — Zambia via TAZARA',
    customer_name: 'Karibu Traders Ltd', shipment_type: 'ROAD',
    origin_port: 'DAR ES SALAAM', destination_port: 'LUSAKA, ZAMBIA',
    subtotal: 6500000, tax_amount: 0, total_amount: 6500000, currency: 'TZS',
    status: 'EXPIRED', valid_until: '2026-06-01', created_at: '2026-05-20T14:00:00Z',
  },
];

/* ── helpers ── */
function fmtAmt(n: number, currency = 'TZS') {
  if (currency === 'USD') return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `TZS ${Math.round(n).toLocaleString()}`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
}
function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 5 * 86400000; // within 5 days
}

/* ── Reject modal ── */
function RejectModal({ quote, onClose, onReject }: {
  quote: Quote;
  onClose: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px' }}>
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font)' }}>Reject Quote</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{quote.quote_number}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="x" size={20} color="var(--ink3)" />
          </button>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontFamily: 'var(--font)' }}>
          Reason (optional)
        </label>
        <textarea
          title="Rejection reason"
          placeholder="Let us know why you're rejecting this quote…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          style={{ width: '100%', resize: 'none', border: '1.5px solid var(--border)', borderRadius: 9, padding: '12px 14px', fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' as const, marginBottom: 16 }}
        />
        <button type="button" title="Confirm rejection" onClick={() => onReject(reason.trim())}
          style={{ width: '100%', padding: '14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          Reject Quote
        </button>
      </div>
    </div>
  );
}

/* ── Accept confirmation ── */
function AcceptModal({ quote, onClose, onAccept }: {
  quote: Quote;
  onClose: () => void;
  onAccept: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px' }}>
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 20px' }} />
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-l)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkCircle" size={28} color="#059669" />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font)' }}>Accept this quote?</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5 }}>
            You are accepting <strong style={{ color: 'var(--ink)' }}>{quote.quote_number}</strong> for{' '}
            <strong style={{ color: 'var(--teal)' }}>{fmtAmt(quote.total_amount, quote.currency)}</strong>.
            {quote.terms && <><br />Terms: {quote.terms}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" title="Cancel" onClick={onClose}
            style={{ flex: 1, padding: '13px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancel
          </button>
          <button type="button" title="Accept quote" onClick={onAccept}
            style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Yes, Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Quote detail ── */
function QuoteDetail({ quote: initial, onBack }: { quote: Quote; onBack: () => void }) {
  const [quote, setQuote]       = useState(initial);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');

  const st       = STATUS_CFG[quote.status];
  const canAct   = quote.status === 'PENDING' || quote.status === 'DRAFT';
  const expiring = isExpiringSoon(quote.valid_until);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function doAccept() {
    setSaving(true);
    setAccepting(false);
    try {
      await apiFetch(`/v1/quotations/${quote.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED' }) });
      setQuote(q => ({ ...q, status: 'APPROVED' }));
      showToast('Quote accepted! Our team will be in touch shortly.');
    } catch {
      showToast('Could not accept quote — please try again or contact support.');
    } finally {
      setSaving(false);
    }
  }

  async function doReject(reason: string) {
    setSaving(true);
    setRejecting(false);
    try {
      await apiFetch(`/v1/quotations/${quote.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', reason }) });
      setQuote(q => ({ ...q, status: 'REJECTED', rejection_reason: reason }));
      showToast('Quote rejected.');
    } catch {
      showToast('Could not reject quote — please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ fontFamily: 'var(--font)', paddingBottom: canAct ? 140 : 100 }}>
      {/* Top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" title="Back" onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)', padding: 0 }}>
          <Icon name="chevronLeft" size={18} color="var(--teal)" />
          Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', flex: 1 }}>{quote.quote_number}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>{st.label}</span>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        {/* Expiry warning */}
        {expiring && canAct && (
          <div style={{ background: 'var(--gold-l)', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alertTriangle" size={16} color="#d97706" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
              Expires {fmtDate(quote.valid_until)} — accept before it lapses
            </span>
          </div>
        )}

        {/* Summary card */}
        <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', borderRadius: 14, padding: '20px', marginBottom: 20, color: '#fff' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Total Amount</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            {fmtAmt(quote.total_amount, quote.currency)}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{quote.title}</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <span>{quote.origin_port} → {quote.destination_port}</span>
            {quote.valid_until && <span>Valid until {fmtDate(quote.valid_until)}</span>}
          </div>
        </div>

        {/* Rejection reason */}
        {quote.status === 'REJECTED' && quote.rejection_reason && (
          <div style={{ background: 'var(--red-l)', borderRadius: 9, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10 }}>
            <Icon name="x" size={16} color="#dc2626" />
            <span style={{ fontSize: 13, color: '#7f1d1d' }}><strong>Rejection reason:</strong> {quote.rejection_reason}</span>
          </div>
        )}

        {/* Shipment details */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 12 }}>SHIPMENT DETAILS</div>
          {[
            { label: 'Type',        value: quote.shipment_type },
            { label: 'Origin',      value: quote.origin_port },
            { label: 'Destination', value: quote.destination_port },
            { label: 'Created',     value: fmtDate(quote.created_at) },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--bg)' }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Line items */}
        {quote.lines && quote.lines.length > 0 && (
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 12 }}>SERVICES QUOTED</div>
            {quote.lines.map((line, i) => (
              <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 10, borderBottom: i < (quote.lines!.length - 1) ? '1px solid var(--bg)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{line.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{line.category} · Qty {line.quantity}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtAmt(line.line_total, quote.currency)}</div>
                  {line.tax_rate > 0 && <div style={{ fontSize: 10, color: 'var(--ink3)' }}>+{line.tax_rate}% VAT</div>}
                </div>
              </div>
            ))}
            {/* Totals */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Subtotal</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{fmtAmt(quote.subtotal, quote.currency)}</span>
              </div>
              {quote.tax_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>VAT</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{fmtAmt(quote.tax_amount, quote.currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)' }}>{fmtAmt(quote.total_amount, quote.currency)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {quote.notes && (
          <div style={{ background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)', padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 6 }}>NOTES</div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0, lineHeight: 1.6 }}>{quote.notes}</p>
          </div>
        )}
        {quote.terms && (
          <div style={{ background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)', padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 6 }}>TERMS</div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0, lineHeight: 1.6 }}>{quote.terms}</p>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, padding: '12px 16px', background: 'var(--white)', borderTop: '1px solid var(--border)', zIndex: 50 }}>
        {canAct ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" title="Reject this quote" onClick={() => setRejecting(true)} disabled={saving}
                style={{ flex: 1, padding: 'var(--ds-btn-py-lg) 0', border: '1.5px solid #dc2626', borderRadius: 'var(--r)', background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="x" size={15} color="#dc2626" />
                Reject
              </button>
              <button type="button" title="Accept this quote" onClick={() => setAccepting(true)} disabled={saving}
                style={{ flex: 2, padding: 'var(--ds-btn-py-lg) 0', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="checkCircle" size={15} color="#fff" />
                {saving ? 'Saving…' : 'Accept Quote'}
              </button>
            </div>
            <Link to="/support/tickets" title="Request changes via support"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 0', border: '1.5px solid var(--border)', borderRadius: 9, background: 'var(--bg)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
              <Icon name="messageSquare" size={14} color="var(--ink3)" />
              Request Changes
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/support/tickets" title="Contact support"
              style={{ flex: 1, padding: '12px 0', border: '1.5px solid var(--border)', borderRadius: 9, background: 'var(--bg)', color: 'var(--ink2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
              <Icon name="headphones" size={15} color="var(--ink3)" />
              Get Support
            </Link>
            {quote.status === 'EXPIRED' && (
              <Link to="/support/tickets" title="Request a new quote"
                style={{ flex: 2, padding: '12px 0', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <Icon name="refresh" size={15} color="#fff" />
                Request New Quote
              </Link>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 160, left: 16, right: 16, background: 'var(--ink)', color: '#fff', borderRadius: 9, padding: '12px 16px', fontSize: 13, fontWeight: 600, zIndex: 400, textAlign: 'center', boxShadow: 'var(--elev-lg)' }}>
          {toast}
        </div>
      )}

      {accepting && <AcceptModal quote={quote} onClose={() => setAccepting(false)} onAccept={doAccept} />}
      {rejecting && <RejectModal quote={quote} onClose={() => setRejecting(false)} onReject={doReject} />}
    </div>
  );
}

/* ── Quote list card ── */
function QuoteCard({ quote, onClick }: { quote: Quote; onClick: () => void }) {
  const st     = STATUS_CFG[quote.status];
  const canAct = quote.status === 'PENDING' || quote.status === 'DRAFT';
  const expiring = isExpiringSoon(quote.valid_until);

  return (
    <button type="button" title={`Open ${quote.quote_number}`} onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: 'var(--white)', border: '1px solid var(--border)',
      borderLeft: `4px solid ${st.color}`,
      borderRadius: 'var(--r)', padding: '16px', fontFamily: 'var(--font)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', fontFamily: 'var(--mono)', flex: 1 }}>{quote.quote_number}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '2px 10px', flexShrink: 0 }}>{st.label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.3 }}>{quote.title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>{quote.origin_port} → {quote.destination_port}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: expiring && canAct ? '#d97706' : 'var(--ink3)', fontWeight: expiring && canAct ? 600 : 400 }}>
          {expiring && canAct ? <><Icon name="alertTriangle" size={11} /> Expires {fmtDate(quote.valid_until)}</> : quote.valid_until ? `Valid until ${fmtDate(quote.valid_until)}` : fmtDate(quote.created_at)}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal)' }}>{fmtAmt(quote.total_amount, quote.currency)}</span>
      </div>
      {canAct && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bg)', display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: 'var(--gold-l)', borderRadius: 20, padding: '3px 10px' }}>Action required</span>
        </div>
      )}
    </button>
  );
}

/* ── Main page ── */
export const CustomerQuotations: React.FC = () => {
  const [quotes, setQuotes]     = useState<Quote[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [filter, setFilter]     = useState<'ALL' | QuoteStatus>('ALL');

  useEffect(() => {
    apiFetch('/v1/quotations')
      .then((data: any) => setQuotes(Array.isArray(data) ? data : (data.quotes ?? [])))
      .catch(() => setQuotes(MOCK_QUOTES))
      .finally(() => setLoading(false));
  }, []);

  // Update selected quote if the quotes list changes (after accept/reject)
  useEffect(() => {
    if (selected) {
      const updated = quotes.find(q => q.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [quotes]);

  if (selected) {
    return <QuoteDetail quote={selected} onBack={() => setSelected(null)} />;
  }

  const pendingCount = quotes.filter(q => q.status === 'PENDING' || q.status === 'DRAFT').length;

  const filtered = filter === 'ALL' ? quotes : quotes.filter(q => q.status === filter);

  const FILTER_OPTIONS: Array<{ key: 'ALL' | QuoteStatus; label: string }> = [
    { key: 'ALL',       label: 'All'      },
    { key: 'PENDING',   label: 'Pending'  },
    { key: 'APPROVED',  label: 'Accepted' },
    { key: 'REJECTED',  label: 'Rejected' },
    { key: 'EXPIRED',   label: 'Expired'  },
  ];

  return (
    <div style={{ fontFamily: 'var(--font)', paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0' }}>
        <h2 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Quotations</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: pendingCount > 0 ? '#d97706' : 'var(--ink3)' }}>
          {loading ? 'Loading…' : pendingCount > 0 ? `${pendingCount} pending your action` : `${quotes.length} quote${quotes.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {FILTER_OPTIONS.map(f => (
          <button key={f.key} type="button" title={f.label} onClick={() => setFilter(f.key)}
            style={{ flexShrink: 0, padding: 'var(--ds-btn-py) 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: `1.5px solid ${filter === f.key ? 'var(--teal)' : 'var(--border)'}`, background: filter === f.key ? 'var(--teal)' : 'var(--white)', color: filter === f.key ? '#fff' : 'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {f.label}
            {f.key === 'PENDING' && pendingCount > 0 && (
              <span style={{ marginLeft: 6, background: '#dc2626', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Quote list */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, height: 120 }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="clipboard" size={36} color="var(--ink3)" />
            <p style={{ color: 'var(--ink3)', fontSize: 14, margin: '12px 0 0' }}>
              {filter === 'ALL' ? 'No quotations yet' : `No ${filter.toLowerCase()} quotes`}
            </p>
          </div>
        ) : (
          filtered.map(q => <QuoteCard key={q.id} quote={q} onClick={() => setSelected(q)} />)
        )}
      </div>
    </div>
  );
};
