import React, { useState, useEffect } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { useCompany } from '../data/companyStore.js';
import { useIsDarkMode } from '../hooks/useIsDarkMode.js';
import {
  type Invoice, type Status,
  invoiceTotals, STATUS_STYLE, mapApiInvoice, fmtTZS,
} from './Billing.js';

/* ── helpers ── */
function fmtDate(str?: string | null) {
  if (!str) return '—';
  // str comes as DD-MM-YYYY from mapApiInvoice, or ISO from API
  if (str.includes('T')) return new Date(str).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
  const [d, m, y] = str.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

type FilterKey = 'ALL' | 'Unpaid' | 'Overdue' | 'Paid' | 'Partial';

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'ALL',     label: 'All'      },
  { key: 'Unpaid',  label: 'Unpaid'   },
  { key: 'Overdue', label: 'Overdue'  },
  { key: 'Partial', label: 'Partial'  },
  { key: 'Paid',    label: 'Paid'     },
];

/* ── Invoice list card ── */
function InvoiceCard({ inv, onClick }: { inv: Invoice; onClick: () => void }) {
  const st    = STATUS_STYLE[inv.status];
  const total = invoiceTotals(inv).grandTotalTZS;
  const bal   = total - (inv.received ?? 0);
  const isOverdue = inv.status === 'Overdue';

  return (
    <button type="button" title={`Open ${inv.id}`} onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: 'var(--white)',
      border: `1px solid ${isOverdue ? '#fca5a5' : 'var(--border)'}`,
      borderLeft: `4px solid ${st.color}`,
      borderRadius: 'var(--r)', padding: '16px',
      fontFamily: 'var(--font)',
      boxShadow: isOverdue ? '0 0 0 1px #fca5a5' : 'none',
    }}>
      {/* Row 1: id + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', flex: 1 }}>{inv.id}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '2px 10px', flexShrink: 0 }}>
          {st.label}
        </span>
      </div>

      {/* Row 2: client + route */}
      <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {inv.origin} → {inv.destination}
      </div>

      {/* Row 3: dates + amount */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
          {inv.status === 'Paid' ? `Paid · ${fmtDate(inv.billDate)}` : `Due ${fmtDate(inv.dueDate)}`}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: isOverdue ? '#dc2626' : 'var(--ink)' }}>
          {fmtTZS(bal > 0 ? bal : total)}
        </span>
      </div>
    </button>
  );
}

/* ── Dispute modal (bottom sheet) ── */
function DisputeModal({ inv, onClose, onSubmit }: {
  inv: Invoice;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font)' }}>Dispute Invoice</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{inv.id}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} color="var(--ink3)" />
          </button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontFamily: 'var(--font)' }}>
          Reason for dispute
        </label>
        <textarea
          title="Describe the dispute"
          placeholder="Describe the issue with this invoice…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          style={{ width: '100%', resize: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' as const, marginBottom: 16 }}
        />
        <button type="button" title="Submit dispute" onClick={() => { if (reason.trim()) onSubmit(reason.trim()); }}
          disabled={!reason.trim()}
          style={{ width: '100%', padding: '14px', background: reason.trim() ? '#dc2626' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 15, fontWeight: 700, cursor: reason.trim() ? 'pointer' : 'default', fontFamily: 'var(--font)' }}>
          Submit Dispute
        </button>
      </div>
    </div>
  );
}

/* ── Invoice detail (read-only) ── */
function InvoiceDetail({ inv, onBack }: { inv: Invoice; onBack: () => void }) {
  const co = useCompany();
  const isDark = useIsDarkMode();
  const logoSrc = isDark ? (co.logoUrlDark || co.logoUrl) : co.logoUrl;
  const navigate   = useNavigate();
  const [disputing, setDisputing] = useState(false);
  const [disputed, setDisputed]   = useState(false);
  const { cl, sh, ot, sub, tax, tot, grandTotalTZS } = invoiceTotals(inv);
  const st  = STATUS_STYLE[inv.status];
  const bal = grandTotalTZS - (inv.received ?? 0);

  function handlePrint() {
    window.print();
  }

  function handleDispute(reason: string) {
    // Navigate to support with pre-filled context
    setDisputing(false);
    setDisputed(true);
    setTimeout(() => navigate(`/support/tickets?subject=Dispute: ${encodeURIComponent(inv.id)}&body=${encodeURIComponent(`I would like to dispute invoice ${inv.id}.\n\nReason: ${reason}`)}`), 800);
  }

  return (
    <div style={{ fontFamily: 'var(--font)', paddingBottom: 100 }}>
      {/* Top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" title="Back" onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)', padding: 0 }}>
          <Icon name="chevronLeft" size={18} color="var(--teal)" />
          Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', flex: 1 }}>{inv.id}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>{st.label}</span>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        {/* Branding Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          {logoSrc ? (
            <img src={logoSrc} alt={co.name} style={{ height: 40, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)' }}>{co.name}</div>
          )}
          {inv.traStatus === 'submitted' && inv.traAckCode === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: '#e6f4ea', marginLeft: 'auto' }}>
              <QRCodeSVG value={inv.traQrUrl!} size={60} level="M" />
              <div style={{ fontSize: 9, color: 'var(--ink3)', textAlign: 'center', lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700, color: '#059669' }}>TRA Verified</div>
                <div>{inv.traRctvnum}</div>
              </div>
            </div>
          )}
        </div>

        {/* Summary card */}
        <div style={{ background: 'linear-gradient(135deg, #0b7264 0%, #14b8a6 100%)', borderRadius: 14, padding: '20px', marginBottom: 20, color: '#fff' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            {inv.status === 'Paid' ? 'Amount Paid' : inv.status === 'Partial' ? 'Balance Due' : 'Amount Due'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
            {fmtTZS(inv.status === 'Paid' ? grandTotalTZS : bal)}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
            <span>Issued: {fmtDate(inv.billDate)}</span>
            {inv.dueDate && <span>Due: {fmtDate(inv.dueDate)}</span>}
          </div>
          {inv.status === 'Partial' && inv.received > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Received: {fmtTZS(inv.received)} · Outstanding: {fmtTZS(bal)}
            </div>
          )}
        </div>

        {/* Shipment info */}
        <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 12 }}>SHIPMENT DETAILS</div>
          {[
            { label: 'BL / Reference', value: inv.blNumber },
            { label: 'Origin',         value: inv.origin },
            { label: 'Destination',    value: inv.destination },
            { label: 'Mode',           value: inv.mode },
            { label: 'Payment terms',  value: inv.terms },
          ].filter(r => r.value).map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--bg)' }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0, marginRight: 12 }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Carbon segment — live from the linked shipment, not a tradeable credit */}
        {inv.shipmentCarbon && (
          <div style={{ background: 'var(--green-l)', borderRadius: 'var(--r)', border: '1px solid #a7f3d0', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Icon name="globe" size={13} color="#059669" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em' }}>CARBON FOOTPRINT</span>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{Number(inv.shipmentCarbon.co2_emissions_kg).toLocaleString('en')} kg</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>CO₂ emissions</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#059669' }}>{Number(inv.shipmentCarbon.carbon_credits_saved).toFixed(2)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Credits saved (est.)</div>
              </div>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--ink3)', marginTop: 8, fontStyle: 'italic' }}>
              Internal ESG estimate — not a registry-issued or tradeable carbon credit.
            </div>
          </div>
        )}

        {/* Line items — Clearing */}
        {cl.length > 0 && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 12 }}>CLEARING CHARGES (TZS)</div>
            {cl.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, paddingBottom: 8, borderBottom: i < cl.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Qty {item.qty} × {item.unit}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtTZS(item.qty * item.rate)}</div>
                  {item.taxPct > 0 && <div style={{ fontSize: 10, color: 'var(--ink3)' }}>+{item.taxPct}% VAT</div>}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Sub-total</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{fmtTZS(tot(cl))}</span>
            </div>
          </div>
        )}

        {/* Line items — Shipping */}
        {sh.length > 0 && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 12 }}>SHIPPING CHARGES (USD)</div>
            {sh.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, paddingBottom: 8, borderBottom: i < sh.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Qty {item.qty} × {item.unit}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>USD {(item.qty * item.rate).toFixed(2)}</div>
                  {item.taxPct > 0 && <div style={{ fontSize: 10, color: 'var(--ink3)' }}>+{item.taxPct}% VAT</div>}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Sub-total</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>USD {tot(sh).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Line items — Other */}
        {ot.length > 0 && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', marginBottom: 12 }}>OTHER CHARGES (TZS)</div>
            {ot.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, paddingBottom: 8, borderBottom: i < ot.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Qty {item.qty} × {item.unit}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtTZS(item.qty * item.rate)}</div>
                  {item.taxPct > 0 && <div style={{ fontSize: 10, color: 'var(--ink3)' }}>+{item.taxPct}% VAT</div>}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Sub-total</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{fmtTZS(tot(ot))}</span>
            </div>
          </div>
        )}

        {/* Grand total */}
        <div style={{ background: 'var(--teal)', borderRadius: 'var(--r)', padding: '16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Grand Total</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{fmtTZS(grandTotalTZS)}</span>
          </div>
          {inv.received > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Balance due</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{fmtTZS(bal)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action bar — fixed at bottom */}
      <div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, padding: '12px 16px', background: 'var(--white)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, zIndex: 50 }}>
        <button type="button" title="Download PDF" onClick={handlePrint}
          style={{ flex: 1, padding: 'var(--ds-btn-py) 0', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="download" size={15} color="var(--ink2)" />
          Download
        </button>
        <Link to="/support/tickets" title="Get support for this invoice"
          style={{ flex: 1, padding: '11px 0', border: '1.5px solid var(--teal)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--teal)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box' }}>
          <Icon name="headphones" size={15} color="var(--teal)" />
          Support
        </Link>
        {inv.status !== 'Paid' && inv.status !== 'Credited' && (
          <button type="button" title="Dispute this invoice" onClick={() => setDisputing(true)}
            style={{ flex: 1, padding: 'var(--ds-btn-py) 0', border: 'none', borderRadius: 'var(--r)', background: 'var(--red-l)', color: 'var(--red)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="alertCircle" size={15} color="#dc2626" />
            Dispute
          </button>
        )}
      </div>

      {disputed && (
        <div style={{ position: 'fixed', bottom: 130, left: 16, right: 16, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 'var(--r)', padding: '12px 16px', fontSize: 13, fontWeight: 600, zIndex: 200, textAlign: 'center' }}>
          Dispute submitted — opening support ticket…
        </div>
      )}

      {disputing && <DisputeModal inv={inv} onClose={() => setDisputing(false)} onSubmit={handleDispute} />}
    </div>
  );
}

/* ── Main page ── */
export const CustomerInvoices: React.FC = () => {
  usePageSEO('Billing & Invoices', 'Manage your outstanding invoices and billing history.');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  // A failed fetch used to silently substitute five invented invoices — a
  // customer would see fabricated amounts and a fake client name in place of
  // their real bill. It now says the load failed and offers to retry, the same
  // as every other honest error state in the app.
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter]     = useState<FilterKey>('ALL');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const load = () => {
    setLoading(true); setLoadError(false);
    apiFetch('/v1/invoices')
      .then((rows: any[]) => setInvoices(rows.map(mapApiInvoice)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (selected) {
    return <InvoiceDetail inv={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = filter === 'ALL' ? invoices : invoices.filter(i => i.status === filter);
  const overdue  = invoices.filter(i => i.status === 'Overdue').length;
  const unpaid   = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue' || i.status === 'Partial').length;

  return (
    <div style={{ fontFamily: 'var(--font)', paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0' }}>
        <h2 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Invoices</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: overdue > 0 ? '#dc2626' : 'var(--ink3)' }}>
          {loading ? 'Loading…' : unpaid > 0 ? `${unpaid} invoice${unpaid !== 1 ? 's' : ''} outstanding` : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
        </p>

        {/* Summary bar */}
        {!loading && invoices.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { label: 'Overdue',  count: invoices.filter(i => i.status === 'Overdue').length,  color: 'var(--red)', bg: 'var(--red-l)' },
              { label: 'Unpaid',   count: invoices.filter(i => i.status === 'Unpaid').length,   color: 'var(--gold)', bg: 'var(--gold-l)' },
              { label: 'Paid',     count: invoices.filter(i => i.status === 'Paid').length,     color: '#059669', bg: 'var(--green-l)' },
            ].map(s => (
              <button key={s.label} type="button" title={`Show ${s.label}`} onClick={() => setFilter(s.label as FilterKey)}
                style={{ background: 'var(--white)', border: `1.5px solid ${filter === s.label ? s.color : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 8px', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink3)', marginTop: 2 }}>{s.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)} variant="segmented" style={{ margin: '0 16px', marginBottom: 12 }}>
        <TabsList>
          {FILTER_TABS.map(f => (
            <TabsTrigger key={f.key} value={f.key} title={f.label}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Invoice list */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, height: 88 }} />
          ))
        ) : loadError ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="alertCircle" size={36} color="var(--red)" />
            <p style={{ color: 'var(--ink2)', fontSize: 14, margin: '12px 0 4px', fontWeight: 600 }}>Couldn't load your invoices</p>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px' }}>Check your connection and try again.</p>
            <button type="button" onClick={load} style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="invoice" size={36} color="var(--ink3)" />
            <p style={{ color: 'var(--ink3)', fontSize: 14, margin: '12px 0 0' }}>
              {filter === 'ALL' ? 'No invoices yet' : `No ${filter.toLowerCase()} invoices`}
            </p>
          </div>
        ) : (
          filtered.map(inv => (
            <InvoiceCard key={inv.id} inv={inv} onClick={() => setSelected(inv)} />
          ))
        )}
      </div>
    </div>
  );
};
