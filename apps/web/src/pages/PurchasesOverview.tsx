import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { MOCK_BILLS } from './Bills.js';
import { MOCK_SUPPLIERS, MOCK_SUP_EXPENSES } from './Suppliers.js';
import { INITIAL_MOCK_POS, MOCK_PRODUCTS } from './PurchaseOrders.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TZS_RATE = 2560; // TZS per USD for stat normalisation
function toUSD(amount: number, currency: string) {
  return currency === 'TZS' ? amount / TZS_RATE : amount;
}
function poPOTotal(items: { productId: string; qty: number; unitPrice: number; discountPct: number }[]) {
  let total = 0;
  items.forEach(item => {
    const prod = MOCK_PRODUCTS.find(p => p.id === item.productId);
    const base = item.qty * item.unitPrice;
    const disc = base * (item.discountPct / 100);
    const taxable = base - disc;
    let tax = 0;
    prod?.taxRates.forEach(tr => { tax += taxable * (tr.rate / 100); });
    total += base - disc + tax;
  });
  return total;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, subColor, icon, color, onClick }:
  { title: string; value: string; sub: string; subColor?: string; icon: string; color: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ flex: 1, minWidth: 200, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s', boxShadow: 'var(--shadow-sm)' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon as any} size={20} color={color} strokeWidth={2} />
        </div>
        {onClick && <Icon name="arrowRight" size={14} color="var(--ink3)" />}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 12, color: subColor || 'var(--ink3)' }}>{sub}</div>
    </div>
  );
}

function SectionCard({ title, action, actionLabel, children }: { title: string; action?: () => void; actionLabel?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
        {action && <button type="button" title={actionLabel} onClick={action}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          {actionLabel} <Icon name="arrowRight" size={12} />
        </button>}
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  );
}

function QuickActionBtn({ icon, label, color, onClick }: { icon: string; label: string; color: string; onClick: () => void }) {
  return (
    <button type="button" title={label} onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9, border: `1.5px solid ${color}20`, background: color + '10', cursor: 'pointer', fontWeight: 700, fontSize: 13, color, transition: 'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = color + '25'; }}
      onMouseLeave={e => { e.currentTarget.style.background = color + '10'; }}>
      <Icon name={icon as any} size={16} color={color} />
      {label}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const PurchasesOverview: React.FC = () => {
  const navigate = useNavigate();
  const { fmtCompact } = useCurrency();
  const isMobile = useIsMobile();

  // ── Derive live PO data from localStorage or initial mock ──────────────────
  const livePos = useMemo(() => {
    try {
      const saved = localStorage.getItem('clearos_purchase_orders');
      return saved ? JSON.parse(saved) : INITIAL_MOCK_POS;
    } catch { return INITIAL_MOCK_POS; }
  }, []);

  const posWithTotals = useMemo(() =>
    livePos.map((po: any) => ({ ...po, total: poPOTotal(po.items) })),
    [livePos]
  );

  // ── Bills analytics ────────────────────────────────────────────────────────
  const billStats = useMemo(() => {
    const statusMap = { DRAFT: { count: 0, usd: 0 }, POSTED: { count: 0, usd: 0 }, PAID: { count: 0, usd: 0 }, PARTIAL: { count: 0, usd: 0 }, OVERDUE: { count: 0, usd: 0 }, VOID: { count: 0, usd: 0 } } as Record<string, { count: number; usd: number }>;
    let totalUSD = 0, payableUSD = 0, overdueUSD = 0, paidUSD = 0;
    MOCK_BILLS.forEach(b => {
      const isOv = b.status !== 'PAID' && b.status !== 'VOID' && new Date(b.due_date) < new Date('2026-06-15');
      const effStatus = isOv ? 'OVERDUE' : b.status;
      const usd = toUSD(b.total, b.currency);
      const paidU = toUSD(b.paid_amount, b.currency);
      const balU = usd - paidU;
      if (!statusMap[effStatus]) statusMap[effStatus] = { count: 0, usd: 0 };
      statusMap[effStatus].count++;
      statusMap[effStatus].usd += usd;
      totalUSD += usd;
      if (effStatus !== 'PAID' && effStatus !== 'VOID') payableUSD += balU;
      if (effStatus === 'OVERDUE') overdueUSD += balU;
      if (effStatus === 'PAID') paidUSD += usd;
    });
    return { statusMap, totalUSD, payableUSD, overdueUSD, paidUSD, count: MOCK_BILLS.length };
  }, []);

  // ── PO analytics ───────────────────────────────────────────────────────────
  const poStats = useMemo(() => {
    const statusMap = { Draft: { count: 0, total: 0 }, Posted: { count: 0, total: 0 }, Partial: { count: 0, total: 0 }, Paid: { count: 0, total: 0 } } as Record<string, { count: number; total: number }>;
    let openTotal = 0, openCount = 0, overdueCount = 0;
    posWithTotals.forEach((po: any) => {
      if (!statusMap[po.status]) statusMap[po.status] = { count: 0, total: 0 };
      statusMap[po.status].count++;
      statusMap[po.status].total += po.total;
      if (po.status !== 'Paid') {
        openTotal += po.total;
        openCount++;
        if (new Date(po.dueDate) < new Date('2026-06-15')) overdueCount++;
      }
    });
    return { statusMap, openTotal, openCount, overdueCount, total: posWithTotals.length };
  }, [posWithTotals]);

  // ── Supplier analytics ─────────────────────────────────────────────────────
  const supStats = useMemo(() => {
    const active = MOCK_SUPPLIERS.filter(s => s.status === 'ACTIVE').length;
    const kycVerified = MOCK_SUPPLIERS.filter(s => s.kyc_status === 'VERIFIED').length;
    const kycExpiring = MOCK_SUPPLIERS.filter(s => s.kyc_status === 'VERIFIED' && s.kyc_expiry && (new Date(s.kyc_expiry).getTime() - Date.now()) < 90 * 86400000).length;
    const suspended = MOCK_SUPPLIERS.filter(s => s.status === 'SUSPENDED').length;
    const totalSpend = MOCK_SUPPLIERS.reduce((s, sup) => s + sup.total_spend, 0);
    const topBySpend = [...MOCK_SUPPLIERS].sort((a, b) => b.total_spend - a.total_spend).slice(0, 5);
    return { active, kycVerified, kycExpiring, suspended, totalSpend, topBySpend, total: MOCK_SUPPLIERS.length };
  }, []);

  // ── Expense analytics ──────────────────────────────────────────────────────
  const expStats = useMemo(() => {
    const catMap: Record<string, { total: number; count: number }> = {};
    let totalTZS = 0;
    MOCK_SUP_EXPENSES.forEach(e => {
      const usd = toUSD(e.amount, e.currency);
      if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 };
      catMap[e.category].total += usd;
      catMap[e.category].count++;
      totalTZS += e.amount * (e.currency === 'USD' ? TZS_RATE : 1);
    });
    const cats = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);
    return { cats, totalTZS, count: MOCK_SUP_EXPENSES.length };
  }, []);

  // ── Recent bills (last 5) ───────────────────────────────────────────────────
  const recentBills = useMemo(() =>
    [...MOCK_BILLS].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
    []
  );

  const BILL_CFG: Record<string, { color: string; bg: string }> = {
    PAID:    { color: 'var(--green)', bg: 'var(--green-l)' },
    PARTIAL: { color: 'var(--gold)',  bg: 'var(--gold-l)'  },
    OVERDUE: { color: 'var(--red)',   bg: 'var(--red-l)'   },
    POSTED:  { color: 'var(--blue)',  bg: 'var(--blue-l)'  },
    DRAFT:   { color: 'var(--ink3)', bg: 'var(--bg)'      },
    VOID:    { color: 'var(--ink3)', bg: 'var(--bg)'      },
  };

  const CAT_LABELS: Record<string, string> = {
    FREIGHT: 'Freight', PORT_CHARGES: 'Port Charges', CUSTOMS_DUTY: 'Customs Duty',
    TRANSPORT: 'Transport', HANDLING: 'Handling', INSPECTION_FEE: 'Inspection',
    AGENT_FEE: 'Agent Fee', INSURANCE: 'Insurance', MISCELLANEOUS: 'Miscellaneous',
  };

  const CAT_COLORS: Record<string, string> = {
    FREIGHT: 'var(--blue)', PORT_CHARGES: 'var(--navy)', CUSTOMS_DUTY: 'var(--teal)',
    TRANSPORT: 'var(--green)', HANDLING: 'var(--gold)', INSPECTION_FEE: 'var(--orange)',
    AGENT_FEE: '#7c3aed', INSURANCE: 'var(--red)', MISCELLANEOUS: 'var(--ink3)',
  };

  const maxExpUSD = Math.max(...expStats.cats.map(([, v]) => v.total), 1);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '14px 16px' : '24px 28px', flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink3)', marginBottom: 6 }}>
          <button type="button" title="Finance Dashboard" onClick={() => navigate('/finance')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 600, fontSize: 11.5, padding: 0 }}>Finance</button>
          <Icon name="chevronRight" size={11} />
          <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>Purchases Overview</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Procurement Overview</h1>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>
              Bills · Purchase Orders · Suppliers · Expenses — consolidated spend view
            </p>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', background: 'var(--white)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 9 }}>
            YTD 2026
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard
          title="Total Spend YTD"
          value={fmtCompact(supStats.totalSpend, 'USD')}
          sub={`${MOCK_BILLS.length} bills · ${MOCK_SUP_EXPENSES.length} expenses`}
          icon="trendingUp" color="var(--teal)"
          onClick={() => navigate('/finance/bills')}
        />
        <KpiCard
          title="Bills Payable"
          value={fmtCompact(billStats.payableUSD, 'USD')}
          sub={billStats.overdueUSD > 0 ? `${fmtCompact(billStats.overdueUSD, 'USD')} overdue` : 'All current'}
          subColor={billStats.overdueUSD > 0 ? 'var(--red)' : 'var(--green)'}
          icon="receipt" color="var(--orange)"
          onClick={() => navigate('/finance/bills')}
        />
        <KpiCard
          title="Open Purchase Orders"
          value={String(poStats.openCount)}
          sub={`${fmtCompact(poStats.openTotal, 'USD')} total value${poStats.overdueCount > 0 ? ` · ${poStats.overdueCount} overdue` : ''}`}
          subColor={poStats.overdueCount > 0 ? 'var(--red)' : undefined}
          icon="clipboardList" color="var(--blue)"
          onClick={() => navigate('/purchase-orders')}
        />
        <KpiCard
          title="Supplier Network"
          value={String(supStats.active)}
          sub={`${supStats.kycVerified} KYC verified${supStats.kycExpiring > 0 ? ` · ${supStats.kycExpiring} expiring` : ''}`}
          subColor={supStats.kycExpiring > 0 ? 'var(--gold)' : undefined}
          icon="building" color="var(--navy)"
          onClick={() => navigate('/finance/suppliers')}
        />
      </div>

      {/* Alert bar for suspended suppliers / overdue */}
      {(supStats.suspended > 0 || billStats.overdueUSD > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {billStats.overdueUSD > 0 && (
            <div onClick={() => navigate('/finance/bills')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--red-l)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, cursor: 'pointer', flex: 1 }}>
              <Icon name="alertTriangle" size={15} color="var(--red)" />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)' }}>
                {billStats.statusMap['OVERDUE']?.count || 0} overdue bill{(billStats.statusMap['OVERDUE']?.count || 0) !== 1 ? 's' : ''} — {fmtCompact(billStats.overdueUSD, 'USD')} outstanding
              </span>
              <Icon name="arrowRight" size={12} color="var(--red)" />
            </div>
          )}
          {supStats.suspended > 0 && (
            <div onClick={() => navigate('/finance/suppliers')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--gold-l)', border: '1px solid rgba(202,138,4,0.25)', borderRadius: 9, cursor: 'pointer', flex: 1 }}>
              <Icon name="alertTriangle" size={15} color="var(--gold)" />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gold)' }}>
                {supStats.suspended} supplier{supStats.suspended !== 1 ? 's' : ''} suspended — review compliance
              </span>
              <Icon name="arrowRight" size={12} color="var(--gold)" />
            </div>
          )}
        </div>
      )}

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Bills Panel */}
        <SectionCard title="Bills" action={() => navigate('/finance/bills')} actionLabel="View All Bills">
          {/* Status breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {Object.entries(billStats.statusMap).filter(([, v]) => v.count > 0).map(([status, v]) => {
              const cfg = BILL_CFG[status] || BILL_CFG.DRAFT;
              return (
                <div key={status} style={{ padding: '10px 12px', borderRadius: 9, background: cfg.bg, border: `1px solid ${cfg.color}20` }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: cfg.color }}>{v.count}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, marginBottom: 2 }}>{status}</div>
                  <div style={{ fontSize: 11, color: cfg.color, opacity: 0.8 }}>{fmtCompact(v.usd, 'USD')}</div>
                </div>
              );
            })}
          </div>

          {/* Paid vs payable mini bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginBottom: 5 }}>
              <span>Paid: {fmtCompact(billStats.paidUSD, 'USD')}</span>
              <span>Payable: {fmtCompact(billStats.payableUSD, 'USD')}</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'var(--green)', width: `${billStats.totalUSD > 0 ? (billStats.paidUSD / billStats.totalUSD) * 100 : 0}%`, transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Recent bills */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recent Bills</div>
          {recentBills.map(b => {
            const isOv = b.status !== 'PAID' && b.status !== 'VOID' && new Date(b.due_date) < new Date('2026-06-15');
            const effStatus = isOv ? 'OVERDUE' : b.status;
            const cfg = BILL_CFG[effStatus] || BILL_CFG.DRAFT;
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.supplier_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{b.bill_number} · {fmtDate(b.due_date)}</div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtCompact(b.total, b.currency)}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.color, padding: '1px 7px', borderRadius: 9 }}>{effStatus}</span>
                </div>
              </div>
            );
          })}
        </SectionCard>

        {/* Purchase Orders Panel */}
        <SectionCard title="Purchase Orders" action={() => navigate('/purchase-orders')} actionLabel="View All POs">
          {/* Status funnel */}
          <div style={{ marginBottom: 16 }}>
            {(['Draft', 'Posted', 'Partial', 'Paid'] as const).map(status => {
              const s = poStats.statusMap[status] || { count: 0, total: 0 };
              const pct = poStats.total > 0 ? (s.count / poStats.total) * 100 : 0;
              const colors: Record<string, string> = { Draft: 'var(--ink3)', Posted: 'var(--blue)', Partial: 'var(--gold)', Paid: 'var(--green)' };
              const bgs: Record<string, string> = { Draft: 'var(--bg)', Posted: 'var(--blue-l)', Partial: 'var(--gold-l)', Paid: 'var(--green-l)' };
              return (
                <div key={status} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: colors[status] }}>{status}</span>
                    <span style={{ color: 'var(--ink2)' }}>{s.count} orders · {fmtCompact(s.total, 'USD')}</span>
                  </div>
                  <div style={{ height: 8, background: bgs[status], borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: colors[status], width: `${pct}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* PO summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Total POs', value: String(poStats.total), color: 'var(--ink)' },
              { label: 'Open', value: String(poStats.openCount), color: 'var(--blue)' },
              { label: 'Overdue', value: String(poStats.overdueCount), color: poStats.overdueCount > 0 ? 'var(--red)' : 'var(--ink3)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 9, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Recent POs */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recent Purchase Orders</div>
          {[...posWithTotals].sort((a: any, b: any) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5).map((po: any) => {
            const colors: Record<string, string> = { Draft: 'var(--ink3)', Posted: 'var(--blue)', Partial: 'var(--gold)', Paid: 'var(--green)' };
            const bgs: Record<string, string> = { Draft: 'var(--bg)', Posted: 'var(--blue-l)', Partial: 'var(--gold-l)', Paid: 'var(--green-l)' };
            const isOv = po.status !== 'Paid' && new Date(po.dueDate) < new Date('2026-06-15');
            return (
              <div key={po.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{po.po_number}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{po.orderDate} · Due {po.dueDate}{isOv ? ' ⚠' : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtCompact(po.total, 'USD')}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: bgs[po.status], color: colors[po.status], padding: '1px 7px', borderRadius: 9 }}>{po.status}</span>
                </div>
              </div>
            );
          })}
        </SectionCard>
      </div>

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: 16 }}>

        {/* Supplier Leaderboard */}
        <SectionCard title="Supplier Leaderboard" action={() => navigate('/finance/suppliers')} actionLabel="Manage Suppliers">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Total Suppliers', value: String(supStats.total), color: 'var(--ink)' },
              { label: 'Active', value: String(supStats.active), color: 'var(--green)' },
              { label: 'KYC Verified', value: String(supStats.kycVerified), color: 'var(--teal)' },
              { label: 'KYC Expiring', value: String(supStats.kycExpiring), color: supStats.kycExpiring > 0 ? 'var(--gold)' : 'var(--ink3)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '9px 12px', background: 'var(--bg)', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{s.label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Top 5 by Total Spend</div>
          {supStats.topBySpend.map((sup, i) => {
            const maxSpend = supStats.topBySpend[0].total_spend;
            const kyc = sup.kyc_status;
            const kycColor = kyc === 'VERIFIED' ? 'var(--green)' : kyc === 'PENDING' ? 'var(--gold)' : 'var(--red)';
            return (
              <div key={sup.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', width: 14 }}>#{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{sup.name}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: kycColor, display: 'inline-block' }} title={`KYC: ${kyc}`} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{fmtCompact(sup.total_spend, 'USD')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--teal)', borderRadius: 3, width: `${(sup.total_spend / maxSpend) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', flexShrink: 0, minWidth: 50 }}>
                    {sup.on_time_rate}% OT · ⭐{sup.rating.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })}
        </SectionCard>

        {/* Expense Category Breakdown */}
        <SectionCard title="Expense Breakdown" action={() => navigate('/expenses')} actionLabel="View Expenses">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{expStats.count} transactions</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{fmtCompact(expStats.totalTZS, 'TZS')}</span>
          </div>
          {expStats.cats.map(([cat, v]) => {
            const color = CAT_COLORS[cat] || 'var(--ink3)';
            const pct = (v.total / maxExpUSD) * 100;
            return (
              <div key={cat} style={{ marginBottom: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{CAT_LABELS[cat] || cat}</span>
                  <span style={{ color: 'var(--ink3)' }}>{v.count}× · {fmtCompact(v.total, 'USD')}</span>
                </div>
                <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: color, width: `${pct}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </SectionCard>
      </div>

      {/* Quick Actions bar */}
      <div style={{ marginTop: 20, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '14px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <QuickActionBtn icon="plus" label="New Purchase Order" color="var(--teal)" onClick={() => navigate('/purchase-orders')} />
          <QuickActionBtn icon="receipt" label="View Bills" color="var(--orange)" onClick={() => navigate('/finance/bills')} />
          <QuickActionBtn icon="building" label="Manage Suppliers" color="var(--blue)" onClick={() => navigate('/finance/suppliers')} />
          <QuickActionBtn icon="dollarSign" label="Track Expenses" color="var(--green)" onClick={() => navigate('/expenses')} />
          <QuickActionBtn icon="fileText" label="Expense Report" color="var(--navy)" onClick={() => navigate('/finance/reports/expenses')} />
        </div>
      </div>
    </div>
  );
};
