import React, { useEffect, useState } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { ShipmentCase } from '@hudumika/types';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { mapApiInvoice, invoiceTotals } from './Billing.js';

/* ── helpers ──────────────────────────────────────────────── */
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' });
}
function fmtAmt(n: number) {
  return 'TZS ' + n.toLocaleString('en-TZ');
}

const STAGE_CFG: Record<string, { label: string; color: string; bg: string; step: number }> = {
  INTAKE:      { label: 'Received',       color: '#0891b2', bg: '#ecfeff', step: 1 },
  DOCS:        { label: 'Docs Check',     color: '#7c3aed', bg: 'var(--purple-l)', step: 2 },
  CUSTOMS:     { label: 'Customs',        color: 'var(--gold)', bg: 'var(--gold-l)', step: 3 },
  DUTY:        { label: 'Duty Payment',   color: '#ea580c', bg: 'var(--gold-l)', step: 4 },
  RELEASE:     { label: 'Port Release',   color: '#0d7a6b', bg: '#ccfbf1', step: 5 },
  DELIVERY:    { label: 'Delivery',       color: '#059669', bg: 'var(--green-l)', step: 6 },
  CLOSED:      { label: 'Completed',      color: 'var(--ink2)', bg: '#f3f4f6', step: 7 },
};
const TOTAL_STEPS = 7;

/* ── Quick action button ──────────────────────────────────── */
function QuickAction({ icon, label, to, color = 'var(--teal)' }: {
  icon: string; label: string; to: string; color?: string;
}) {
  return (
    <Link to={to} title={label} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
      padding: '18px 8px', cursor: 'pointer', fontFamily: 'var(--font)', flex: 1,
      minWidth: 72, transition: 'transform 0.1s', textDecoration: 'none', boxSizing: 'border-box',
    }}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
      onMouseUp={e => (e.currentTarget.style.transform = '')}
      onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.96)')}
      onTouchEnd={e => (e.currentTarget.style.transform = '')}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 9, background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon as any} size={20} color={color} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </Link>
  );
}

/* ── Shipment card ────────────────────────────────────────── */
function ShipmentCard({ s }: { s: ShipmentCase & { active_risk_types?: string[] } }) {
  const cfg = STAGE_CFG[s.stage] ?? STAGE_CFG.INTAKE;
  const pct = Math.round((cfg.step / TOTAL_STEPS) * 100);
  const atRisk = s.active_risk_types?.includes('DEMURRAGE') || s.active_risk_types?.includes('SLA_BREACH');

  return (
    <Link to={`/clearance/${s.id}`} title={`Open ${s.ref_number}`}
      style={{
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'pointer',
        background: 'var(--white)', border: `1px solid ${atRisk ? '#fca5a5' : 'var(--border)'}`,
        borderRadius: 9, padding: '14px 16px', fontFamily: 'var(--font)',
        boxShadow: atRisk ? '0 0 0 1px #fca5a5' : 'none', textDecoration: 'none', color: 'inherit',
      }}
    >
      {/* Row 1: ref + stage badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{s.ref_number}</span>
        {atRisk && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', background: 'var(--red-l)', borderRadius: 20, padding: '2px 8px' }}>
            At Risk
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: '2px 9px' }}>
          {cfg.label}
        </span>
      </div>

      {/* Row 2: goods description */}
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.goods_desc}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg)', borderRadius: 99, height: 5, marginBottom: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99, width: `${pct}%`,
          background: s.stage === 'CLOSED' ? '#6b7280' : 'var(--teal)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Row 3: ETA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
          {s.type?.replace('_', ' ')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>
          ETA {fmtDate(s.eta)}
        </span>
      </div>
    </Link>
  );
}

/* ── Main dashboard ───────────────────────────────────────── */
export const CustomerDashboard: React.FC = () => {
  usePageSEO('Customer Portal', 'Track your shipments and invoices.');
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [shipments, setShipments] = useState<(ShipmentCase & { active_risk_types?: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [finLoading, setFinLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/shipments/grouped')
      .then((res: any) => {
        const all: any[] = [];
        (res.data || []).forEach((g: any) => all.push(...(g.shipments || [])));
        setShipments(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      apiFetch(`/v1/invoices?customer_id=${user.id}`).catch(() => []),
      apiFetch(`/v1/payments?customer_id=${user.id}`).catch(() => []),
    ]).then(([inv, pay]) => {
      setInvoices(Array.isArray(inv) ? inv : (inv?.data ?? []));
      setPayments(Array.isArray(pay) ? pay : (pay?.data ?? []));
    }).finally(() => setFinLoading(false));
  }, [user?.id]);

  // Real per-invoice grand total requires the same line-item math Billing.tsx
  // uses (sales_invoices has no amount/total column of its own).
  const totalInvoiced = invoices.reduce((s: number, i: any) => s + invoiceTotals(mapApiInvoice(i)).grandTotalTZS, 0);
  const totalPaid      = payments.reduce((s: number, p: any) => s + (parseFloat(p.amount ?? 0)), 0);
  const totalPending    = Math.max(0, totalInvoiced - totalPaid);

  const active    = shipments.filter(s => s.stage !== 'CLOSED' && s.stage !== 'DELIVERY');
  const delivered = shipments.filter(s => s.stage === 'CLOSED' || s.stage === 'DELIVERY');
  const atRisk    = shipments.filter(s => s.active_risk_types && s.active_risk_types.length > 0);

  const co2Calculated = shipments.filter(s => s.co2_emissions_kg != null);
  const totalCo2Kg     = co2Calculated.reduce((sum, s) => sum + Number(s.co2_emissions_kg || 0), 0);
  const totalCredits   = co2Calculated.reduce((sum, s) => sum + Number(s.carbon_credits_saved || 0), 0);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* ── Hero card ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0b7264 0%, #0e9b85 60%, #14b8a6 100%)',
        padding: '28px 20px 32px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* decorative circles */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ position: 'relative' }}>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '0 0 4px' }}>
            Good day, {firstName}
          </p>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 20px', fontFamily: 'var(--font)' }}>
            {user?.name?.split(' ').slice(0, 2).join(' ')}
          </h1>

          {/* Stat chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Active', value: active.length,    icon: 'package',       bg: 'rgba(255,255,255,0.18)' },
              { label: 'At Risk', value: atRisk.length,   icon: 'alertTriangle', bg: 'rgba(239,68,68,0.35)'   },
              { label: 'Done',    value: delivered.length, icon: 'checkCircle',  bg: 'rgba(255,255,255,0.18)' },
            ].map(chip => (
              <div key={chip.label} style={{
                background: chip.bg, borderRadius: 9, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(6px)',
              }}>
                <Icon name={chip.icon as any} size={15} color="#fff" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{chip.value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>{chip.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ── Quick actions ── */}
        <div style={{ marginTop: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>QUICK ACTIONS</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <QuickAction icon="package"    label="Track Shipment"   to="/"                  color="var(--teal)"  />
            <QuickAction icon="clipboard"  label="Request Quote"    to="/quotations"         color="#7c3aed"      />
            <QuickAction icon="headphones" label="Get Support"      to="/support/tickets"   color="#0891b2"      />
            <QuickAction icon="folder"     label="My Files"         to="/documents"          color="#d97706"      />
          </div>
        </div>

        {/* ── Active shipments ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', margin: 0 }}>MY SHIPMENTS</p>
            <Link to="/" title="View all"
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
          ) : shipments.length === 0 ? (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
              padding: '32px 20px', textAlign: 'center',
            }}>
              <Icon name="package" size={36} color="var(--ink3)" />
              <p style={{ color: 'var(--ink3)', fontSize: 14, margin: '12px 0 0' }}>No active shipments</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shipments.slice(0, 5).map(s => <ShipmentCard key={s.id} s={s} />)}
              {shipments.length > 5 && (
                <Link to="/" title="See more"
                  style={{
                    display: 'block', textAlign: 'center', boxSizing: 'border-box',
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9,
                    padding: '12px', fontSize: 13, fontWeight: 600, color: 'var(--teal)',
                    cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'none',
                  }}>
                  +{shipments.length - 5} more shipments
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Carbon footprint — summed from my own shipments' GLEC estimate ── */}
        {co2Calculated.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>CARBON FOOTPRINT</p>
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="globe" size={17} color="#059669" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{totalCo2Kg.toLocaleString('en')} kg</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>CO₂ emissions ({co2Calculated.length} of {shipments.length} shipments)</div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>{totalCredits.toFixed(2)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Credits saved (est.)</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Invoices summary ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', margin: 0 }}>INVOICES</p>
            <Link to="/billing" title="View invoices"
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Pending',  value: finLoading ? '…' : fmtAmt(totalPending), icon: 'clock',      color: 'var(--gold)', bg: 'var(--gold-l)' },
              { label: 'Paid',     value: finLoading ? '…' : fmtAmt(totalPaid),    icon: 'checkCircle', color: '#059669', bg: 'var(--green-l)' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
                padding: '14px', display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={c.icon as any} size={14} color={c.color} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
