import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import './Subscription.css';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Switch } from '../components/ui/switch.js';
import { Badge } from '../components/ui/badge.js';
import { useCompany, setCompany } from '../data/companyStore.js';
import { useEntitlements, resetEntitlementsCache } from '../hooks/useEntitlements.js';
import { APP_META } from './Utilities.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { Addon } from '@hudumika/types';
import { AreaSparkline } from '../components/MetricCard.js';
import { refreshFxRates, convertAmount, formatAmount } from '../lib/currency.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = 'company' | 'billing' | 'payments' | 'plans' | 'modules' | 'reports' | 'support';
// Was a fixed 4-value union ('starter'|'growth'|'scale'|'enterprise') — that
// ceiling is exactly why this page couldn't see anything a SuperAdmin added,
// renamed, or retired in /admin/packages: any other code was silently
// dropped by `if (pkg.code in next)` below. A package's code is real,
// admin-defined data (packages.routes.ts), not a fixed set this page gets
// to assume — so it's a plain string everywhere from here down.
type PlanKey = string;

// ─── Constants ────────────────────────────────────────────────────────────────

type PlanDisplay = { name: string; color: string; bg: string; pricePerSeat: number | null; extraSeatPrice: number | null; extraSeatThreshold: number | null; itemLimit: number | null; storageLimitGb: number | null; tagline?: string; icon: IconName; badge?: string; features: string[] };

/** Mirrors billing.routes.ts's computePlanAmount — the real per-period charge
 *  for a seat count, discounted past extraSeatThreshold when a plan has one
 *  set. Used only as the pre-invoice estimate; once a real invoice exists,
 *  its server-computed amount is authoritative (see priceMonthlyTotalNum's
 *  own comment on why that estimate is never allowed to override it). */
function estimatePlanAmount(plan: PlanDisplay, seats: number): number | null {
  if (plan.pricePerSeat === null) return null;
  if (plan.extraSeatPrice != null && plan.extraSeatThreshold != null && seats > plan.extraSeatThreshold) {
    return plan.extraSeatThreshold * plan.pricePerSeat + (seats - plan.extraSeatThreshold) * plan.extraSeatPrice;
  }
  return plan.pricePerSeat * seats;
}

// Curated tagline/icon for the packages seeded by migration 078 — cosmetic
// polish for codes this page happens to already know about, never a gate on
// which packages appear. Any other real code (renamed, added, or retired-and-
// replaced in /admin/packages) still renders fully, just with a generic icon
// and no tagline rather than fabricated copy.
const PLAN_TAGLINES: Record<string, string> = {
  starter: 'HuduStarter — For solo founders and small teams just getting started',
  growth: 'HuduPlus — For growing teams scaling their operations',
  scale: 'Legacy Plan — Scale',
  enterprise: 'Hudu Advanced — Metered option shared per quotation',
};
const PLAN_ICONS: Record<string, IconName> = {
  starter: 'zap', growth: 'trendingUp', scale: 'barChart', enterprise: 'crown',
};

// Shown only until /v1/packages resolves for the first time, so there's no
// flash of an empty page — replaced wholesale (not merged) by the real
// catalog once it loads. Mirrors migration 078's seeded values.
const PLAN_DEFAULTS: Record<string, PlanDisplay> = {
  starter: {
    name: 'HuduStarter', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 6, extraSeatPrice: null, extraSeatThreshold: null, itemLimit: 100, storageLimitGb: 10, icon: 'zap',
    features: ['Every module included', '100 items / month', '10 GB storage', 'Basic shipment tracking', 'TANCIS integration', 'Email support', 'Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)'],
  },
  growth: {
    name: 'HuduPlus', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 18, extraSeatPrice: null, extraSeatThreshold: null, itemLimit: 500, storageLimitGb: 50, icon: 'trendingUp', badge: 'Most Popular',
    features: ['Every module included', '500 items / month', '50 GB storage', 'Advanced tracking & alerts', 'WhatsApp Bot', 'Priority 24h support'],
  },
  enterprise: {
    name: 'Hudu Advanced', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: null, extraSeatPrice: null, extraSeatThreshold: null, itemLimit: null, storageLimitGb: null, icon: 'crown',
    features: ['Every module included', 'Unlimited items / month', 'Unlimited storage', 'Dedicated account manager', '24/7 phone & WhatsApp support', 'Custom integrations (core banking APIs)', 'White-label option', '99.99% SLA guarantee', 'Metered option shared per quotation'],
  },
};

/** Fetches the canonical package catalog (same /v1/packages SuperAdmin's own
 *  PackagesView reads) and shapes it to match this page's render code —
 *  every real, active package the admin has configured, keyed by its own
 *  code, nothing added or dropped. */
function usePlans(): Record<string, PlanDisplay> {
  const [plans, setPlans] = useState<Record<string, PlanDisplay>>(PLAN_DEFAULTS);

  useEffect(() => {
    apiFetch('/v1/packages').then(res => {
      const next: Record<string, PlanDisplay> = {};
      for (const pkg of res.data as Array<{ code: string; name: string; price_per_seat: number | null; extra_seat_price: number | null; extra_seat_threshold: number | null; monthly_item_limit: number | null; storage_limit_bytes: number | null; features: string[]; color: string; popular: boolean }>) {
        next[pkg.code] = {
          name: pkg.name,
          color: pkg.color || 'var(--teal)',
          bg: 'var(--teal-l)',
          pricePerSeat: pkg.price_per_seat,
          extraSeatPrice: pkg.extra_seat_price,
          extraSeatThreshold: pkg.extra_seat_threshold,
          itemLimit: pkg.monthly_item_limit,
          storageLimitGb: pkg.storage_limit_bytes != null ? Math.round(pkg.storage_limit_bytes / 1073741824) : null,
          tagline: PLAN_TAGLINES[pkg.code],
          icon: PLAN_ICONS[pkg.code] ?? 'package',
          badge: pkg.popular ? 'Most Popular' : undefined,
          features: pkg.features,
        };
      }
      if (Object.keys(next).length > 0) setPlans(next);
    }).catch(() => { /* keep defaults on failure */ });
  }, []);

  return plans;
}

const UNKNOWN_PLAN: PlanDisplay = {
  name: 'Unknown plan', color: 'var(--ink3)', bg: 'var(--bg)', pricePerSeat: null, extraSeatPrice: null, extraSeatThreshold: null, itemLimit: null, storageLimitGb: null, icon: 'package', features: [],
};

/** The tenant's own current plan by code, falling back to the first real
 *  package if that exact code isn't in the live catalog for some reason
 *  (never silently to a *different specific* plan's price — that plan's
 *  own genuine "Custom pricing" state is closer to the truth than pretending
 *  they're on whichever code happens to be first). */
function planFor(plans: Record<string, PlanDisplay>, code: string): PlanDisplay {
  return plans[code] ?? Object.values(plans)[0] ?? UNKNOWN_PLAN;
}

/** East African tenants think in shillings first — every headline USD price
 *  on this page gets a real TZS-equivalent line under it, sourced from the
 *  same live customs/fx-rates feed FinOps already uses (currency.ts). The
 *  stored plan/invoice amounts stay USD (no billing-pipeline change); this
 *  only affects what's displayed. Re-renders once live rates arrive so the
 *  page doesn't stay pinned to the frozen fallback rate. */
function useFxReady(): void {
  const [, force] = useState(0);
  useEffect(() => { refreshFxRates().then(() => force(v => v + 1)); }, []);
}
function tzsEquivalent(usd: number): string {
  return formatAmount(convertAmount(usd, 'USD', 'TZS'), 'TZS');
}

/** Green below the limit, gold once a tenant is close enough to it that a
 *  heads-up is actually useful, red once it's actually hit — never a silent
 *  jump straight from "fine" to "blocked". */
function usageBarColor(used: number, limit: number, base: string): string {
  const pct = (used / limit) * 100;
  if (pct >= 100) return 'var(--red)';
  if (pct >= 80) return 'var(--gold)';
  return base;
}

/** Active (non-suspended) user count for this tenant — drives the per-seat price estimate. */
function useSeatCount(): number {
  const [seats, setSeats] = useState(1);
  useEffect(() => {
    apiFetch('/v1/settings').then(res => { if (res.seatCount) setSeats(res.seatCount); }).catch(() => {});
  }, []);
  return seats;
}

/** Relative-time formatter for session `last_used_at` — same pattern as TopBar.tsx's relTime(), duplicated locally since it's not exported from there. */
function relTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${Math.max(sec, 0)} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hrs ago`;
  return `${Math.floor(hr / 24)} days ago`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Real subscription invoices — replaces the old PAYMENT_HISTORY fixture. Generates the current
 *  period's invoice (idempotent) on mount so there's always at least one real row to show. */
function useInvoices() {
  const [invoices, setInvoices] = useState<any[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setInvoices(await apiFetch('/v1/billing/invoices'));
    } catch {
      setInvoices([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try { await apiFetch('/v1/billing/invoices/generate', { method: 'POST' }); } catch { /* best-effort; GET still runs */ }
      await reload();
    })();
  }, [reload]);

  return { invoices, reload };
}

/** Real payment methods — replaces the hardcoded Visa/PayPal fixture rows. */
function usePaymentMethods() {
  const [methods, setMethods] = useState<any[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setMethods(await apiFetch('/v1/billing/payment-methods'));
    } catch {
      setMethods([]);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { methods, reload };
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // Keys are case-insensitive so this covers both the old display-cased fixture
  // strings (Paid/Open/High…) and the real API's UPPER_SNAKE enums (OPEN, IN_PROGRESS,
  // due/paid/overdue/cancelled) without needing two lookup tables.
  const variants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
    PAID: 'success', DUE: 'warning',
    OVERDUE: 'error', CANCELLED: 'gray',
    OPEN: 'info', IN_PROGRESS: 'warning',
    RESOLVED: 'success', CLOSED: 'gray',
    HIGH: 'error', URGENT: 'error',
    NORMAL: 'warning', MEDIUM: 'warning', LOW: 'gray',
    ACTIVE: 'success',
  };
  const variant = variants[status.toUpperCase()] || 'gray';
  return <Badge variant={variant} style={{ whiteSpace: 'nowrap' }}>{status}</Badge>;
}

function Btn({ label, icon, onClick, variant = 'ghost', disabled = false }: { label: string; icon?: IconName; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const style: Record<string, React.CSSProperties> = {
    primary: { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none' },
    ghost:   { background: 'var(--white)', color: 'var(--ink)', border: '1.5px solid var(--border)' },
    danger:  { background: 'var(--white)', color: 'var(--red)', border: '1.5px solid var(--border)' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'var(--font)', ...style[variant], minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
      {icon && <Icon name={icon} size={13} strokeWidth={2} />}
      {label}
    </button>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Tab: Company Info ────────────────────────────────────────────────────────

function CompanyInfoTab({ tenant }: { tenant: any }) {
  const co = useCompany();
  const [editingReg, setEditingReg] = useState(false);
  const [regForm, setRegForm] = useState(co);

  function startEditReg() { setRegForm(co); setEditingReg(true); }
  function saveReg() {
    setCompany({
      customsAgentLicence: regForm.customsAgentLicence, licenceExpiry: regForm.licenceExpiry,
      traPin: regForm.traPin, tancisUsername: regForm.tancisUsername,
    });
    setEditingReg(false);
  }

  const plans = usePlans();
  const currentPlan = tenant?.plan || 'starter';
  const plan = planFor(plans, currentPlan);
  const seats = useSeatCount();
  const entitlements = useEntitlements();
  const usage = entitlements?.usage;
  const estMonthly = estimatePlanAmount(plan, seats);
  useFxReady();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Company name, logo, contact and address fields live in Settings > Company Info
            (the single source for that data, shared across every app) — not duplicated here. */}
        <Card>
          <CardHead
            title="Regulatory Details"
            sub={`Customs authority credentials and clearance licence for ${co.name || 'this account'}. Company profile and logo are managed in Settings → Company Info.`}
            right={
              editingReg ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn label="Cancel" onClick={() => setEditingReg(false)} />
                  <Btn label="Save Changes" icon="save" onClick={saveReg} variant="primary" />
                </div>
              ) : (
                <Btn label="Edit" icon="edit" onClick={startEditReg} />
              )
            }
          />
          <div style={{ padding: '0 20px 20px' }}>
            {([
              ['Customs Agent Licence', 'customsAgentLicence'], ['Licence Expiry', 'licenceExpiry'],
              ['TRA PIN', 'traPin'], ['TANCIS Username', 'tancisUsername'],
            ] as const).map(([label, key]) => (
              <FormRow key={key} label={label}>
                {editingReg ? (
                  <input value={regForm[key]} onChange={e => setRegForm(f => ({ ...f, [key]: e.target.value }))} className="input-field" style={{ fontSize: 13, padding: '7px 12px', width: '100%', fontFamily: 'var(--mono)' }} />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{co[key] || '—'}</span>
                )}
              </FormRow>
            ))}
          </div>
        </Card>

      </div>

      {/* Right: plan summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <CardHead title="Active Subscription" />
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 9, background: plan.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="layers" size={22} strokeWidth={1.75} style={{ color: plan.color } as React.CSSProperties} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>{plan.name} Plan</div>
                <StatusBadge status="Active" />
              </div>
            </div>
            {[
              ['Price / seat', plan.pricePerSeat === null ? 'Custom' : `$${plan.pricePerSeat}/mo`],
              ['Active seats', String(seats)],
              ['Est. monthly bill', estMonthly === null ? 'Custom' : `$${estMonthly.toLocaleString()}`],
              ['Storage', plan.storageLimitGb === null ? 'Unlimited' : `${plan.storageLimitGb} GB`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            {estMonthly !== null && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>≈ {tzsEquivalent(estMonthly)}</span>
              </div>
            )}
            {usage && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)', marginBottom: 5 }}>
                  <span>Items this month</span>
                  <span style={{ fontWeight: 700, color: usage.limit !== null && usage.used / usage.limit >= 0.8 ? usageBarColor(usage.used, usage.limit, 'var(--ink)') : 'var(--ink)' }}>{usage.used}{usage.limit !== null ? ` / ${usage.limit}` : ''}</span>
                </div>
                {usage.limit !== null && usage.used / usage.limit >= 0.8 && usage.used < usage.limit && (
                  <div style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 600, marginBottom: 5 }}>Approaching this month's limit</div>
                )}
                {usage.limit !== null && (
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`, background: usageBarColor(usage.used, usage.limit, plan.color), borderRadius: 4 }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Billing ─────────────────────────────────────────────────────────────

function BillingTab({ tenant, onNavigateTab }: { tenant: any; onNavigateTab: (t: SubTab) => void }) {
  const plans = usePlans();
  const currentPlan = tenant?.plan || 'starter';
  const plan = planFor(plans, currentPlan);
  const seats = useSeatCount();
  const isCustomPricing = plan.pricePerSeat === null;
  const priceLabel = isCustomPricing ? 'Custom' : `$${plan.pricePerSeat}/user`;

  const { invoices, reload: reloadInvoices } = useInvoices();
  const { methods } = usePaymentMethods();
  const defaultMethod = methods?.find(m => m.is_default) ?? null;
  // Invoices come back newest-period-first per the API contract, so [0] is the current period.
  const current = invoices?.[0] ?? null;
  const [paying, setPaying] = useState<string | null>(null);

  // The real, server-computed total for the current period (plan + active
  // add-ons — see billing.routes.ts's /invoices/generate) is what's actually
  // owed. A client-recomputed `pricePerSeat * seats` used to stand in for
  // this even once a real invoice existed, silently excluding add-ons —
  // e.g. a tenant with $9 of add-ons active saw "$36/mo" as the headline
  // figure here while the adjacent Billing Summary card's real "Amount Due"
  // correctly read $45. Only fall back to the estimate before any invoice
  // has ever been generated for this tenant.
  const priceMonthlyTotalNum = isCustomPricing ? null : current ? Number(current.amount) : estimatePlanAmount(plan, seats);
  const priceMonthlyTotal = priceMonthlyTotalNum === null ? 'Custom' : `$${priceMonthlyTotalNum.toLocaleString()}`;
  useFxReady();

  function fmtAmount(inv: any) { return `${inv.currency} ${Number(inv.amount).toFixed(2)}`; }
  function planNameFor(code: string) { return plans[code as PlanKey]?.name ?? code; }
  function descFor(inv: any) { return `${planNameFor(inv.plan_code)} Plan${Number(inv.addons_amount ?? 0) > 0 ? ' + add-ons' : ''} — ${fmtDate(inv.period_start)}`; }

  async function payInvoice(id: string) {
    if (!defaultMethod) {
      showAlert('Add a payment method on the Payments tab before paying an invoice.', { title: 'No payment method on file' });
      return;
    }
    setPaying(id);
    try {
      await apiFetch(`/v1/billing/invoices/${id}/pay`, { method: 'POST', body: JSON.stringify({ payment_method_id: defaultMethod.id }) });
      await reloadInvoices();
    } catch (err: any) {
      showAlert(`Payment failed: ${err.message}`);
    } finally {
      setPaying(null);
    }
  }

  async function downloadInvoice(inv: any) {
    try {
      await apiDownload(`/v1/billing/invoices/${inv.id}/download`, `${inv.invoice_number}.html`);
    } catch (err: any) {
      showAlert(`Download failed: ${err.message}`);
    }
  }

  // No bulk-export endpoint exists — loops the same per-invoice download call across every
  // row rather than fabricating a combined statement.
  async function downloadAll() {
    if (!invoices?.length) return;
    for (const inv of invoices) await downloadInvoice(inv);
  }

  async function cancelSubscription() {
    if (!(await showConfirm('Are you sure you want to cancel your subscription?', { variant: 'danger', confirmLabel: 'Cancel Subscription' }))) return;
    showAlert('Contact support to cancel your subscription — self-service cancellation isn’t available yet.', { variant: 'info', title: 'Contact support' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Current plan + next payment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <Card>
          <CardHead title="Current Subscription" sub="Your active plan and renewal details." right={<Btn label="Change Plan" icon="layers" onClick={() => onNavigateTab('plans')} />} />
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 9, background: plan.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="layers" size={22} strokeWidth={1.75} style={{ color: plan.color } as React.CSSProperties} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{plan.name} Plan</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>
                  {plan.itemLimit === null ? 'Unlimited items / month' : `Up to ${plan.itemLimit.toLocaleString()} items / month`} · {priceLabel}/mo · {seats} seat{seats === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: plan.color }}>{priceMonthlyTotal}</div>
                {priceMonthlyTotalNum !== null && <div style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>≈ {tzsEquivalent(priceMonthlyTotalNum)}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>per month</div>
                {Number(current?.addons_amount ?? 0) > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, marginTop: 2 }}>
                    + {current.currency} {Number(current.addons_amount).toFixed(2)} in add-ons
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Renewal',      value: fmtDate(current?.due_date ?? current?.period_end),  icon: 'calendar' as IconName },
                { label: 'Start Date',   value: fmtDate(tenant?.created_at),  icon: 'clock'    as IconName },
                { label: 'Next Payment', value: priceMonthlyTotal, icon: 'creditCard' as IconName },
                { label: 'Status',       value: tenant?.active ? 'Active' : 'Inactive', icon: 'check' as IconName, green: tenant?.active },
              ].map(item => (
                <div key={item.label} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <Icon name={item.icon} size={12} strokeWidth={2} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.green ? 'var(--green)' : 'var(--ink)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={cancelSubscription} style={{ padding: 'var(--ds-btn-py) 18px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--red)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel Subscription</button>
            </div>
          </div>
        </Card>

        {/* Billing summary */}
        <Card>
          <CardHead title="Billing Summary" />
          <div style={{ padding: '16px 20px' }}>
            {[
              ['Amount Due', current ? fmtAmount(current) : '—'],
              ['Due Date',   fmtDate(current?.due_date)],
              ['Currency',   current?.currency || 'USD'],
              ['Tax',        'Included'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            {current && current.status !== 'paid' ? (
              <button onClick={() => payInvoice(current.id)} disabled={paying === current.id} style={{ width: '100%', marginTop: 16, padding: 'var(--ds-btn-py) 0', border: 'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: paying === current.id ? 'default' : 'pointer', opacity: paying === current.id ? 0.6 : 1, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                {paying === current.id ? 'Processing…' : 'Pay Now'}
              </button>
            ) : (
              <div style={{ width: '100%', marginTop: 16, padding: '10px 0', textAlign: 'center', borderRadius: 9, background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 13.5, fontWeight: 700 }}>
                {current ? 'Paid' : 'No invoice yet'}
              </div>
            )}
            <button onClick={() => current && downloadInvoice(current)} disabled={!current} style={{ width: '100%', marginTop: 8, padding: 'var(--ds-btn-py) 0', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'none', cursor: current ? 'pointer' : 'default', opacity: current ? 1 : 0.5, fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Download Statement</button>
          </div>
        </Card>
      </div>

      {/* Billing history table */}
      <Card>
        <CardHead title="Invoice History" sub="Download invoices and track payment status." right={<Btn label="Download All" icon="download" onClick={downloadAll} disabled={!invoices?.length} />} />
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Invoice No.','Description','Issued','Due Date','Amount','Status',''].map(h => (
              <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {invoices === null && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--ink3)' }}>Loading invoices…</td></tr>
            )}
            {invoices?.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--ink3)' }}>No invoices yet.</td></tr>
            )}
            {invoices?.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>{inv.invoice_number}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{descFor(inv)}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{fmtDate(inv.period_start)}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{fmtDate(inv.due_date)}</td>
                <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{fmtAmount(inv)}</td>
                <td style={{ padding: '12px 16px' }}><StatusBadge status={inv.status} /></td>
                <td style={{ padding: '12px 12px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {inv.status !== 'paid' && <Btn label="Pay" icon="creditCard" variant="primary" onClick={() => payInvoice(inv.id)} disabled={paying === inv.id} />}
                  <Btn label="PDF" icon="download" onClick={() => downloadInvoice(inv)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

// ─── Tab: Payments ────────────────────────────────────────────────────────────

// Mobile money leads — it's the rail most tenants in this market actually
// pay with — followed by the Petti wallet (itself funded by mobile money
// deposits), with card last since it's the least commonly held option here.
const METHOD_TYPES: { value: 'card' | 'mobile_money' | 'petti_wallet'; label: string; sub: string; icon: IconName }[] = [
  { value: 'mobile_money', label: 'Mobile Money', sub: 'M-Pesa, Tigo Pesa, Airtel Money', icon: 'smartphone' },
  { value: 'petti_wallet', label: 'Petti Wallet', sub: 'Pay from a wallet topped up by mobile money', icon: 'wallet' },
  { value: 'card', label: 'Card', sub: 'Visa, Mastercard', icon: 'creditCard' },
];

const MOBILE_MONEY_PROVIDERS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa', 'Other'];

/** The tenant's own Petti wallets — for the "pay from wallet" payment
 *  method. Empty (not an error) if Petti isn't entitled for this tenant;
 *  the option just has nothing to offer, same as add-ons with none configured. */
function useWallets() {
  const [wallets, setWallets] = useState<Array<{ id: string; name: string; currency: string; balance: number; status: string }> | null>(null);
  useEffect(() => {
    apiFetch('/v1/petti/wallets').then(res => setWallets(res.data ?? [])).catch(() => setWallets([]));
  }, []);
  return wallets;
}

function PaymentsTab({ onNavigateTab }: { tenant?: any; onNavigateTab: (t: SubTab) => void }) {
  const { user } = useAuth();
  const { methods, reload: reloadMethods } = usePaymentMethods();
  const { invoices, reload: reloadInvoices } = useInvoices();
  const wallets = useWallets();

  const [showAddForm, setShowAddForm] = useState(false);
  const [methodType, setMethodType] = useState<'card' | 'mobile_money' | 'petti_wallet'>('mobile_money');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState('');
  const [walletId, setWalletId] = useState('');
  const [methodLabel, setMethodLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [payingUpcoming, setPayingUpcoming] = useState(false);

  const upcoming = invoices?.find((inv: any) => inv.status === 'due' || inv.status === 'overdue') ?? null;
  const paidInvoices = (invoices ?? []).filter((inv: any) => !!inv.tx_ref);
  useFxReady();

  // The wallet-top-up nudge — the default method IS a Petti wallet but its
  // real balance (billing.routes.ts enriches this on every GET) can't cover
  // what's about to come due, so the fix is one tap to Petti, not a failed
  // charge discovered after the fact.
  const defaultMethodForNudge = methods?.find((m: any) => m.is_default) ?? null;
  const walletLow = !!(upcoming && defaultMethodForNudge?.type === 'petti_wallet' && Number(defaultMethodForNudge.wallet_balance ?? 0) < Number(upcoming.amount));

  function methodLabelFor(id: string | null) {
    if (!id) return '—';
    const m = methods?.find(mm => mm.id === id);
    return m ? (m.label || `${m.brand ?? ''} •••• ${m.last4 ?? ''}`) : '—';
  }

  function resetForm() {
    setCardNumber(''); setCardExpiry(''); setCardCvc(''); setPhone(''); setProvider(''); setWalletId(''); setMethodLabel(''); setFormError(null);
  }

  async function submitAdd() {
    setFormError(null);
    if (methodType === 'petti_wallet' && !walletId) {
      setFormError('Choose which wallet this payment method draws from.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = methodType === 'card'
        ? { type: 'card', card_number: cardNumber, card_expiry: cardExpiry, card_cvc: cardCvc, ...(methodLabel ? { label: methodLabel } : {}) }
        : methodType === 'mobile_money'
        ? { type: 'mobile_money', phone, ...(provider ? { provider } : {}), ...(methodLabel ? { label: methodLabel } : {}) }
        : { type: 'petti_wallet', petti_wallet_id: walletId, ...(methodLabel ? { label: methodLabel } : {}) };
      await apiFetch('/v1/billing/payment-methods', { method: 'POST', body: JSON.stringify(body) });
      await reloadMethods();
      setShowAddForm(false);
      resetForm();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id: string) {
    try {
      await apiFetch(`/v1/billing/payment-methods/${id}/default`, { method: 'PATCH' });
      await reloadMethods();
    } catch (err: any) {
      showAlert(`Failed to set default: ${err.message}`);
    }
  }

  async function removeMethod(id: string) {
    if (!(await showConfirm('Remove this payment method?', { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/billing/payment-methods/${id}`, { method: 'DELETE' });
      await reloadMethods();
    } catch (err: any) {
      showAlert(`Failed to remove: ${err.message}`);
    }
  }

  async function payUpcoming() {
    if (!upcoming) return;
    const def = methods?.find(m => m.is_default);
    if (!def) {
      showAlert('Add a payment method below before paying.', { title: 'No payment method on file' });
      return;
    }
    setPayingUpcoming(true);
    try {
      await apiFetch(`/v1/billing/invoices/${upcoming.id}/pay`, { method: 'POST', body: JSON.stringify({ payment_method_id: def.id }) });
      await reloadInvoices();
      showAlert('Payment successful.', { variant: 'success', title: 'Paid' });
    } catch (err: any) {
      showAlert(`Payment failed: ${err.message}`);
    } finally {
      setPayingUpcoming(false);
    }
  }

  function fmtAmount(inv: any) { return `${inv.currency} ${Number(inv.amount).toFixed(2)}`; }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Payment methods */}
        <Card>
          <CardHead title="Payment Methods" sub="Manage cards and accounts used for billing." right={<Btn label="Add Method" icon="plus" variant="primary" onClick={() => setShowAddForm(v => !v)} />} />
          <div style={{ padding: '0 20px 8px' }}>
            {methods === null && <div style={{ padding: '14px 0', fontSize: 12.5, color: 'var(--ink3)' }}>Loading payment methods…</div>}
            {methods?.length === 0 && !showAddForm && <div style={{ padding: '14px 0', fontSize: 12.5, color: 'var(--ink3)' }}>No payment methods yet — add one below.</div>}
            {methods?.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 52, height: 36, borderRadius: 6, background: m.is_default ? 'var(--navy2)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={m.type === 'petti_wallet' ? 'wallet' : m.type === 'mobile_money' ? 'smartphone' : 'creditCard'} size={18} strokeWidth={1.75} style={{ color: m.is_default ? '#fff' : 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {m.label || m.brand}{m.last4 ? ` •••• ${m.last4}` : ''}
                    {m.is_default && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: 'var(--green-l)', color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>Default</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                    {m.type === 'petti_wallet'
                      ? (m.wallet_status === 'missing' ? 'Wallet no longer exists' : m.wallet_status === 'closed' ? 'Wallet closed' : `Balance: ${m.wallet_currency} ${Number(m.wallet_balance ?? 0).toLocaleString()}`)
                      : m.exp_month && m.exp_year ? `Expires ${String(m.exp_month).padStart(2, '0')}/${m.exp_year}` : (m.type === 'mobile_money' ? 'Mobile money' : '')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!m.is_default && <Btn label="Set Default" onClick={() => setDefault(m.id)} />}
                  <Btn label="Remove" variant="danger" onClick={() => removeMethod(m.id)} />
                </div>
              </div>
            ))}

            {showAddForm && (
              <div style={{ padding: '14px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '4px 0 16px' }}>
                  {METHOD_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setMethodType(t.value)}
                      className="pm-type-card"
                      data-active={methodType === t.value}
                    >
                      <Icon name={t.icon} size={20} strokeWidth={1.75} />
                      <span className="pm-type-card-label">{t.label}</span>
                      <span className="pm-type-card-sub">{t.sub}</span>
                    </button>
                  ))}
                </div>
                {methodType === 'card' ? (
                  <>
                    <FormRow label="Card Number"><input value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                    <FormRow label="Expiry (MM/YY)"><input value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} placeholder="08/28" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                    <FormRow label="CVC"><input value={cardCvc} onChange={e => setCardCvc(e.target.value)} placeholder="123" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                  </>
                ) : methodType === 'mobile_money' ? (
                  <>
                    <FormRow label="Phone Number"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0755 000 000" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                    <FormRow label="Provider">
                      <Select value={provider} onValueChange={setProvider}>
                        <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue placeholder="Choose a provider…" /></SelectTrigger>
                        <SelectContent>
                          {MOBILE_MONEY_PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormRow>
                  </>
                ) : (
                  <FormRow label="Wallet">
                    {wallets === null ? (
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '8px 0' }}>Loading your Petti wallets…</div>
                    ) : wallets.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '8px 0' }}>
                        No Petti wallets found. Set one up in the <a onClick={() => window.location.assign('/petti')} style={{ color: 'var(--teal)', cursor: 'pointer' }}>Petti app</a> first.
                      </div>
                    ) : (
                      <Select value={walletId} onValueChange={setWalletId}>
                        <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue placeholder="Choose a wallet…" /></SelectTrigger>
                        <SelectContent>
                          {wallets.map(w => (
                            <SelectItem key={w.id} value={w.id}>{w.name} — {w.currency} {w.balance.toLocaleString()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormRow>
                )}
                <FormRow label="Label (optional)"><input value={methodLabel} onChange={e => setMethodLabel(e.target.value)} placeholder="e.g. Company Visa" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                {formError && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{formError}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <Btn label={saving ? 'Saving…' : 'Save Method'} icon="save" variant="primary" onClick={submitAdd} disabled={saving} />
                  <Btn label="Cancel" onClick={() => { setShowAddForm(false); resetForm(); }} />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Transaction history */}
        <Card>
          <CardHead title="Payment Transactions" sub="All successful subscription charges." />
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date','Description','Method','Amount','Status'].map(h => (
                <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {invoices !== null && paidInvoices.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--ink3)' }}>No payments yet.</td></tr>
              )}
              {paidInvoices.map((inv: any) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{fmtDate(inv.paid_at)}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--ink)' }}>{inv.invoice_number}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{methodLabelFor(inv.payment_method_id)}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{fmtAmount(inv)}</td>
                  <td style={{ padding: '11px 16px' }}><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>

      {/* Right: next invoice */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <CardHead title="Upcoming Invoice" />
          <div style={{ padding: 20 }}>
            {upcoming ? (
              <>
                <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{fmtAmount(upcoming)}</div>
                {upcoming.currency === 'USD' && <div style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 600, marginBottom: 4 }}>≈ {tzsEquivalent(Number(upcoming.amount))}</div>}
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>Due on {fmtDate(upcoming.due_date)}</div>
                {[[`${upcoming.plan_code} (${upcoming.seats} seat${upcoming.seats === 1 ? '' : 's'})`, fmtAmount(upcoming)], ['Tax', 'Included'], ['Total', fmtAmount(upcoming)]].map(([k, v], i) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)', fontWeight: i === 2 ? 700 : 400, color: i === 2 ? 'var(--ink)' : 'var(--ink3)' }}>
                    <span>{k}</span><span>{v}</span>
                  </div>
                ))}
                {walletLow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--gold-l)', border: '1px solid var(--gold)' }}>
                    <Icon name="alertTriangle" size={14} strokeWidth={2} style={{ color: 'var(--gold)', flexShrink: 0 } as React.CSSProperties} />
                    <span style={{ fontSize: 12, color: 'var(--ink2)', flex: 1 }}>Your wallet balance won't cover this invoice.</span>
                    <a href="/petti" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', whiteSpace: 'nowrap' }}>Top up →</a>
                  </div>
                )}
                <button onClick={payUpcoming} disabled={payingUpcoming} style={{ width: '100%', marginTop: 16, padding: 'var(--ds-btn-py) 0', border: 'none', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: payingUpcoming ? 'default' : 'pointer', opacity: payingUpcoming ? 0.6 : 1, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {payingUpcoming ? 'Processing…' : 'Pay Now'}
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No upcoming invoice due.</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Billing Contact" sub="The account this workspace's billing notices go to." />
          <div style={{ padding: '0 20px 16px' }}>
            {[['Name', user?.name || '—'], ['Email', user?.email || '—'], ['Phone', user?.phone || '—']].map(([k, v]) => (
              <FormRow key={k} label={k}><span style={{ fontSize: 13 }}>{v}</span></FormRow>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

// ─── Tab: Plans ───────────────────────────────────────────────────────────────

// PLAN_ORDER/PLAN_TAGLINES/PLAN_ICONS/COMPARE_ROWS used to be hardcoded to
// exactly the 4 packages migration 078 seeded — meaning a package renamed,
// retired, or added in /admin/packages since then either vanished from this
// tab or (worse) COMPARE_ROWS kept showing fabricated feature checkmarks for
// whatever 3 codes happened to still be here. PLAN_TAGLINES/PLAN_ICONS now
// live with PLAN_DEFAULTS above (real fallback cosmetics for the known
// legacy codes, not a gate). The list below and the compare table are both
// derived from whatever `plans` the live catalog actually contains.

/** Real packages only — cheapest first, custom-priced (pricePerSeat: null)
 *  last regardless of price so "Talk to Sales" tiers don't interleave with
 *  numeric ones. */
function orderedPlanCodes(plans: Record<string, PlanDisplay>): string[] {
  // /v1/packages already returns rows ordered by the admin's own sort_order
  // (packages.routes.ts) and usePlans() fills `plans` by iterating that same
  // response in order — plain string keys preserve insertion order in JS, so
  // this is that same admin-configured order, not a second opinion re-derived
  // from price.
  return Object.keys(plans);
}

/** Real add-ons catalog (376_package_addons.sql) — "Get more with add-ons",
 *  the same purchasable-independent-of-plan concept SuperAdmin's own Packages
 *  page shows (there for catalog management; here for the tenant's own
 *  purchase/cancel action). Onsite lives here now instead of being a fourth
 *  competing base plan. */
function useAddons() {
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const reload = useCallback(async () => {
    try { setAddons((await apiFetch('/v1/addons')).data); } catch { setAddons([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { addons, reload };
}

function AddonsSection() {
  const { addons, reload } = useAddons();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  useFxReady();

  // There is deliberately no separate checkout step (addons.routes.ts's own
  // comment: "instant activation, no separate checkout step") — activating
  // here folds the cost into the next generated subscription invoice
  // (Billing tab), paid from your on-file default payment method, the same
  // as the base plan itself. That's easy to miss with no confirmation
  // saying so, which is exactly what prompted this.
  async function purchase(code: string, name: string) {
    setBusyCode(code);
    try {
      await apiFetch(`/v1/addons/${code}/purchase`, { method: 'POST' });
      await reload();
      showAlert(`${name} added. There's no separate checkout — its cost is included on your next Billing invoice, charged from your default payment method there.`, { variant: 'success', title: 'Add-on activated' });
    } catch (err: any) {
      showAlert(`Failed to add: ${err.message}`);
    } finally {
      setBusyCode(null);
    }
  }

  async function cancel(code: string, name: string) {
    if (!(await showConfirm(`Remove the ${name} add-on from your subscription? It stops immediately and won't appear on any future invoice.`, { variant: 'warning', confirmLabel: 'Remove' }))) return;
    setBusyCode(code);
    try {
      await apiFetch(`/v1/addons/${code}/cancel`, { method: 'POST' });
      await reload();
    } catch (err: any) {
      showAlert(`Failed to remove: ${err.message}`);
    } finally {
      setBusyCode(null);
    }
  }

  if (!addons || addons.length === 0) return null; // still loading, or nothing purchasable configured

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHead title="Get more with add-ons" sub="Purchasable on top of your plan — not a separate tier. Adding one activates it immediately; there's no checkout, its cost is simply included on your next Billing invoice." />
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        {addons.map(addon => (
          <div key={addon.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 9, background: addon.color ? `${addon.color}18` : 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="globe" size={16} strokeWidth={1.75} style={{ color: addon.color ?? 'var(--teal)' } as React.CSSProperties} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>{addon.name}</span>
                  {addon.purchased && <span style={{ padding: '1px 8px', borderRadius: 20, background: 'var(--green-l)', color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>Active</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: addon.color ?? 'var(--navy)', marginTop: 2 }}>
                  ${addon.monthlyPrice}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)' }}>/mo</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)' }}>≈ {tzsEquivalent(addon.monthlyPrice)}/mo</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink2)', margin: 0, lineHeight: 1.5, flex: 1 }}>{addon.description}</p>
            {addon.purchased ? (
              <Btn label={busyCode === addon.code ? 'Removing…' : 'Remove'} variant="danger" onClick={() => cancel(addon.code, addon.name)} disabled={busyCode === addon.code} />
            ) : (
              <Btn label={busyCode === addon.code ? 'Adding…' : 'Add to Plan'} icon="plus" variant="primary" onClick={() => purchase(addon.code, addon.name)} disabled={busyCode === addon.code} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlansTab({ tenant, onReload }: { tenant: any; onReload: () => Promise<void> }) {
  const plans = usePlans();
  // Monthly is the hero choice, not yearly — a market where cash flow is
  // tight and unpredictable-spend is the real objection favors the lower
  // up-front commitment by default; yearly is still one tap away for anyone
  // who wants the discount.
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const currentPlan: PlanKey = tenant?.plan || 'starter';
  const order = orderedPlanCodes(plans);
  useFxReady();

  async function handleSelectPlan(k: PlanKey) {
    const name = plans[k]?.name ?? k;
    if (!(await showConfirm(`Change your plan to ${name}? This takes effect immediately — there's no separate checkout, the new price is simply what's billed on your next Billing invoice.`, { variant: 'warning', confirmLabel: 'Change Plan' }))) return;
    try {
      await apiFetch('/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ plan: k })
      });
      await onReload();
      showAlert(`You're now on ${name}.`, { variant: 'success', title: 'Plan changed' });
    } catch (err: any) {
      showAlert(`Failed to update plan: ${err.message}`);
    }
  }

  return (
    <div>
      <div className="sub-plans-head">
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>Choose Your Plan</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>All plans include a 14-day free trial. Cancel anytime.</div>
        </div>
        <div className="sub-billing-toggle">
          {(['monthly', 'yearly'] as const).map(b => (
            <button key={b} className={`sub-toggle-btn${billing === b ? ' active' : ''}`}
               onClick={() => setBilling(b)}>
              {b.charAt(0).toUpperCase() + b.slice(1)}
              {b === 'yearly' && <span className="sub-toggle-badge">2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="sub-cards" style={{ marginBottom: 16 }}>
        {order.map(k => {
          const p = plans[k];
          const isCurrent = k === currentPlan;
          const isCustom = p.pricePerSeat === null;
          // Yearly billing = ~17% off, same discount rate the old flat-price plans used — no separate
          // per-seat-yearly column on the backend, so it's derived client-side from the monthly seat price.
          const perSeatDisplay = isCustom ? null : (billing === 'yearly' ? Math.round((p.pricePerSeat as number) * 0.83) : (p.pricePerSeat as number));
          return (
            <div key={k} data-plan={k} className={`sub-card${p.badge && !isCurrent ? ' sub-card--rec' : ''}${isCurrent ? ' sub-card--current' : ''}`}>
              {isCurrent ? (
                <div className="sub-card-cur-badge">Current Plan</div>
              ) : p.badge ? (
                <div className="sub-card-rec-badge">{p.badge}</div>
              ) : null}

              <div className="sub-card-icon">
                <Icon name={p.icon} size={18} strokeWidth={1.75} style={{ color: 'var(--plan-color)' } as React.CSSProperties} />
              </div>
              <div className="sub-card-name">{p.name}</div>
              {p.tagline && <div className="sub-card-sub">{p.tagline}</div>}

              {isCustom ? (
                <>
                  <div className="sub-card-price-row"><span className="sub-card-price">Custom</span></div>
                  <div className="sub-card-annual-note">Tailored pricing for your organization</div>
                </>
              ) : (
                <>
                  <div className="sub-card-price-row">
                    <span className="sub-card-currency">$</span>
                    <span className="sub-card-price">{perSeatDisplay!.toLocaleString()}</span>
                    <span className="sub-card-per">/user/mo</span>
                  </div>
                  <div className="sub-card-fx">≈ {tzsEquivalent(perSeatDisplay!)}/user/mo</div>
                  <div className="sub-card-annual-note">
                    {billing === 'yearly'
                      ? `Billed annually · $${(perSeatDisplay! * 12).toLocaleString()} /seat/yr — save ${tzsEquivalent(((p.pricePerSeat as number) - perSeatDisplay!) * 12)}/seat/yr`
                      : 'Billed monthly · switch to yearly for 2 months free'}
                  </div>
                  <div className="sub-card-annual-note" style={{ marginTop: 2 }}>
                    {p.itemLimit === null ? 'Unlimited items / month' : `Up to ${p.itemLimit.toLocaleString()} items / month`}
                  </div>
                  {p.extraSeatThreshold != null && p.extraSeatPrice != null && (
                    <div className="sub-card-annual-note" style={{ marginTop: 2 }}>
                      Seat {p.extraSeatThreshold + 1}+ at ${billing === 'yearly' ? Math.round(p.extraSeatPrice * 0.83) : p.extraSeatPrice}/user/mo
                    </div>
                  )}
                </>
              )}

              {isCustom && !isCurrent ? (
                <a
                  href="mailto:sales@hudumika.tz?subject=Enterprise%20Plan%20Inquiry"
                  className="sub-card-cta"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Talk to Sales <Icon name="arrowRight" size={13} strokeWidth={2.5} /></span>
                </a>
              ) : (
                <button
                  className={`sub-card-cta${isCurrent ? ' sub-card-cta--current' : ''}`}
                  style={isCurrent ? undefined : { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                  disabled={isCurrent}
                  onClick={() => handleSelectPlan(k)}
                >
                  {isCurrent ? 'Current Plan' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Get Started <Icon name="arrowRight" size={13} strokeWidth={2.5} /></span>}
                </button>
              )}

              <div className="sub-card-divider" />
              <ul className="sub-card-features">
                {p.features.map(f => (
                  <li key={f} className="sub-card-feat">
                    <Icon name="check" size={13} strokeWidth={2.5} className="sub-card-feat-check" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="sub-enterprise-note">
        Need something custom? <a className="sub-contact-link" href="mailto:sales@hudumika.tz">Talk to sales</a>
      </div>

      <AddonsSection />

      {/* Feature comparison table — 3 rows only, each backed by a real
          per-package column (packages.routes.ts), not the fixed 3-plan,
          8-fabricated-checkmark table this used to be. Each plan's own
          free-text feature list is already shown on its card above, so it
          isn't duplicated here as a guessed boolean grid. */}
      <Card style={{ marginTop: 28 }}>
        <CardHead title="Compare plans" sub="Price, item cap and storage, side by side." />
        <div className="sub-compare-scroll">
          <div className="sub-compare-grid">
            <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${order.length}, 150px)`, borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '16px 20px' }} />
              {order.map(k => {
                const p = plans[k]; const isCur = k === currentPlan;
                return (
                  <div key={k} style={{ padding: '16px 14px', textAlign: 'center', borderLeft: '1px solid var(--border)', background: isCur ? p.bg : 'var(--white)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>{p.name}</div>
                    {isCur && <div style={{ fontSize: 10, fontWeight: 700, color: p.color, marginTop: 2 }}>Current</div>}
                  </div>
                );
              })}
            </div>
            {([
              ['Price / seat', (p: PlanDisplay) => p.pricePerSeat === null ? 'Custom' : `$${p.pricePerSeat}/mo`],
              ['Items / month', (p: PlanDisplay) => p.itemLimit === null ? 'Unlimited' : p.itemLimit.toLocaleString()],
              ['Storage', (p: PlanDisplay) => p.storageLimitGb === null ? 'Unlimited' : `${p.storageLimitGb} GB`],
            ] as [string, (p: PlanDisplay) => string][]).map(([feat, getVal]) => (
              <div key={feat} style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${order.length}, 150px)`, borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '11px 20px', fontSize: 13, color: 'var(--ink2)' }}>{feat}</div>
                {order.map(k => (
                  <div key={k} style={{ padding: '11px 14px', textAlign: 'center', borderLeft: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{getVal(plans[k])}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Modules ─────────────────────────────────────────────────────────────

function ModulesTab() {
  /**
   * Modules are configured in Settings.
   *
   * This tab, the Settings section and the Utilities panel were three screens
   * editing one value, each with its own local state — so changing it in one
   * left the other two showing the old value until a reload, and each carried
   * its own copy of the "send the whole map" rule. One control now.
   */
  return (
    <div>
      <SectionHead
        title="Installed Modules"
        sub="Which apps this workspace uses is configured in Settings."
      />
      <Card>
        <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--ink2)', maxWidth: 460 }}>
            Turning an app on or off for everyone in this workspace lives with the
            rest of the workspace configuration.
          </div>
          <Link to="/workspace/settings?s=modules" className="btn btn-primary btn-sm">
            Open module settings
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Reports ─────────────────────────────────────────────────────────────

function ReportsTab() {
  const seats = useSeatCount();
  const entitlements = useEntitlements();
  const usage = entitlements?.usage;
  const modulesOn = entitlements ? Object.values(entitlements.features).filter(Boolean).length : null;

  const history = usage?.history ?? [];
  // getUsageHistory zero-fills every month in range, so this is only ever
  // empty/short while /v1/entitlements is still loading — never a real
  // "less than a year old" tenant getting a fabricated flat line.
  const hasHistory = history.length > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Card>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Active Seats</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{seats}</div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Items This Period{usage?.period ? ` (${usage.period})` : ''}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{usage ? usage.used : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: usage && usage.limit !== null ? 8 : 0 }}>{usage ? (usage.limit !== null ? `of ${usage.limit}` : 'Unlimited') : 'Loading…'}</div>
            {usage && usage.limit !== null && usage.used / usage.limit >= 0.8 && usage.used < usage.limit && (
              <div style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 600, marginBottom: 6 }}>Approaching this month's limit</div>
            )}
            {usage && usage.limit !== null && (
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`, height: '100%', background: usageBarColor(usage.used, usage.limit, 'var(--teal)'), borderRadius: 2 }} />
              </div>
            )}
          </div>
        </Card>
        <Card>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Modules Enabled</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{modulesOn ?? '—'}</div>
          </div>
        </Card>
      </div>

      {hasHistory && (
        <Card>
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Usage — last {history.length} months</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                {history[0].period} <Icon name="arrowRight" size={10} style={{ verticalAlign: 'middle', margin: '0 3px' }} /> {history[history.length - 1].period}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <AreaSparkline data={history.map(h => h.count)} color="var(--teal)" id="subscription-usage-history" />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Support ─────────────────────────────────────────────────────────────

const TICKET_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical', label: 'Technical' },
  { value: 'account', label: 'Account' },
  { value: 'feature_request', label: 'Feature Request' },
];

function SupportTab() {
  const [showNew, setShowNew] = useState(false);
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [thread, setThread] = useState<any | null>(null);
  const [reply, setReply] = useState('');

  const reload = useCallback(async () => {
    try { setTickets(await apiFetch('/v1/platform-support/tickets')); } catch { setTickets([]); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function submitTicket() {
    setFormError(null);
    if (!subject.trim() || !message.trim()) { setFormError('Subject and description are required.'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/v1/platform-support/tickets', { method: 'POST', body: JSON.stringify({ subject, category, priority, message }) });
      setSubject(''); setMessage(''); setCategory('general'); setPriority('NORMAL');
      setShowNew(false);
      await reload();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTicket(id: string) {
    if (expandedId === id) { setExpandedId(null); setThread(null); return; }
    setExpandedId(id);
    setThread(null);
    try {
      setThread(await apiFetch(`/v1/platform-support/tickets/${id}`));
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  async function sendReply() {
    if (!thread || !reply.trim()) return;
    try {
      await apiFetch(`/v1/platform-support/tickets/${thread.id}/reply`, { method: 'POST', body: JSON.stringify({ message: reply }) });
      setReply('');
      setThread(await apiFetch(`/v1/platform-support/tickets/${thread.id}`));
      await reload();
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  const openCount = tickets?.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length ?? 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* New ticket */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Btn label="Open New Ticket" icon="plus" variant="primary" onClick={() => setShowNew(v => !v)} />
        </div>

        {showNew && (
          <Card>
            <CardHead title="New Support Ticket" />
            <div style={{ padding: '0 20px 20px' }}>
              <FormRow label="Subject"><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Describe the issue briefly…" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
              <FormRow label="Priority">
                <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Category">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormRow>
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Provide steps to reproduce, screenshots, or any relevant details…" className="input-field" style={{ width: '100%', fontSize: 13, padding: '10px 12px', resize: 'none', boxSizing: 'border-box' as const }} />
              </div>
              {formError && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn label={submitting ? 'Submitting…' : 'Submit Ticket'} icon="send" variant="primary" onClick={submitTicket} disabled={submitting} />
                <Btn label="Cancel" onClick={() => setShowNew(false)} />
              </div>
            </div>
          </Card>
        )}

        {/* Ticket list */}
        <Card>
          <CardHead title="My Tickets" sub={tickets ? `${openCount} open` : undefined} />
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Ticket ID','Subject','Priority','Status','Last Updated',''].map(h => (
                <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {tickets === null && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--ink3)' }}>Loading tickets…</td></tr>
              )}
              {tickets?.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--ink3)' }}>No support tickets yet.</td></tr>
              )}
              {tickets?.map((t) => (
                <React.Fragment key={t.id}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>{t.ref_number}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)', maxWidth: 280 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.subject}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={t.priority} /></td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={t.status} /></td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(t.updated_at)}</td>
                    <td style={{ padding: '12px 12px' }}><Btn label={expandedId === t.id ? 'Hide' : 'View'} icon="eye" onClick={() => toggleTicket(t.id)} /></td>
                  </tr>
                  {expandedId === t.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '14px 16px', background: 'var(--bg)' }}>
                        {!thread ? (
                          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading thread…</div>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                              {thread.messages.map((m: any) => (
                                <div key={m.id} style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 8, background: m.is_platform_staff ? 'var(--teal-l)' : 'var(--white)', border: '1px solid var(--border)' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{m.author_name}{m.is_platform_staff ? ' · Hudumika Support' : ''}</div>
                                  <div style={{ color: 'var(--ink2)' }}>{m.content}</div>
                                  <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 4 }}>{new Date(m.created_at).toLocaleString()}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply…" className="input-field" style={{ flex: 1, fontSize: 12.5, padding: '7px 10px' }} />
                              <Btn label="Send" icon="send" variant="primary" onClick={sendReply} disabled={!reply.trim()} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>

      {/* Right: contact options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card>
          <CardHead title="Contact Us" />
          <div style={{ padding: '12px 20px 16px' }}>
            {[
              { icon: 'headphones' as IconName, label: 'Priority Support', sub: 'Enterprise: 4h response SLA', color: 'var(--purple)', bg: 'var(--purple-l)', href: undefined },
              { icon: 'mail'       as IconName, label: 'Email Support',    sub: 'support@hudumika.tz',         color: 'var(--teal)', bg: 'var(--teal-l)', href: 'mailto:support@hudumika.tz' },
              { icon: 'chatBubble' as IconName, label: 'WhatsApp Chat',    sub: '+255 800 123 456',            color: 'var(--green)', bg: 'var(--green-l)', href: 'https://wa.me/255800123456' },
            ].map(c => {
              const row = (
                <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: c.href ? 'pointer' : 'default' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={c.icon} size={17} strokeWidth={1.75} style={{ color: c.color } as React.CSSProperties} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{c.sub}</div>
                  </div>
                  {c.href && <Icon name="chevronRight" size={14} strokeWidth={2} style={{ marginLeft: 'auto', color: 'var(--ink3)' } as React.CSSProperties} />}
                </div>
              );
              return c.href
                ? <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{row}</a>
                : <div key={c.label}>{row}</div>;
            })}
          </div>
        </Card>

        <Card>
          <CardHead title="Resources" />
          <div style={{ padding: '12px 20px 16px' }}>
            {/* No real docs/status pages exist in this app yet — decorative only, so the
                cursor and external-link affordance are removed rather than promising a link that goes nowhere. */}
            {[
              { label: 'Documentation',      icon: 'fileText'  as IconName },
              { label: 'Video Tutorials',    icon: 'monitor'   as IconName },
              { label: 'API Reference',      icon: 'clipboard' as IconName },
              { label: 'Release Notes',      icon: 'bell'      as IconName },
              { label: 'System Status',      icon: 'activity'  as IconName },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <Icon name={r.icon} size={14} strokeWidth={2} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                <span style={{ fontSize: 13, color: 'var(--ink2)', flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Coming soon</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//   Main Component
// ═══════════════════════════════════════════════════════════════════════════════

// Security used to be a tab here (rendering AccountSecurityPanel — password/
// 2FA/passkeys/sessions for the signed-in admin's own account). Removed: the
// exact same panel already lives on /profile and Ondi's own Security
// Settings page, and personal 2FA is not something anyone thinks to look
// for inside Billing.
const TABS: { id: SubTab; label: string; icon: IconName }[] = [
  { id: 'company',  label: 'Company Info', icon: 'building'    },
  { id: 'billing',  label: 'Billing',      icon: 'fileText'    },
  { id: 'payments', label: 'Payments',     icon: 'creditCard'  },
  { id: 'plans',    label: 'Plans',        icon: 'layers'      },
  { id: 'modules',  label: 'Modules',      icon: 'package'     },
  { id: 'reports',  label: 'Reports',      icon: 'barChart'    },
  { id: 'support',  label: 'Support',      icon: 'headphones'  },
];

const TAB_IDS = new Set(TABS.map(t => t.id));

export const Subscription: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('v');
  const [tab, setTab] = useState<SubTab>(requestedTab && TAB_IDS.has(requestedTab as SubTab) ? (requestedTab as SubTab) : 'company');
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/settings');
      if (res.tenant) setTenant(res.tenant);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading account & billing information…</div>;
  }

  const tenantName = tenant?.name || 'My Company';
  const tenantPlan = tenant?.plan || 'starter';
  const planLabel = tenantPlan.charAt(0).toUpperCase() + tenantPlan.slice(1);

  return (
    <div className="sub-account-root" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['Workspace Admin', 'Subscription & Billing']}
        titlePlain="Subscription &"
        titleEm="billing."
        subtitle={`${tenantName} — ${planLabel} Plan · Account & Billing Management`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ padding: '5px 12px', borderRadius: 20, background: tenant?.active ? 'var(--green-l, #ecfdf5)' : 'var(--red-l, #fef2f2)', color: tenant?.active ? 'var(--green, #10b981)' : 'var(--red, #ef4444)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid currentColor' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {tenant?.active ? 'ACTIVE' : 'INACTIVE'}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setTab('plans')}
              style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 16px' }}
            >
              <Icon name="layers" size={14} />
              <span>Change Plan</span>
            </button>
          </div>
        }
      />

      {/* ── Tab Bar Navigation ── */}
      <div className="sub-hero-tabbar">
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`sub-tab-pill ${isActive ? 'active' : ''}`}
            >
              <Icon name={t.icon} size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="sub-tab-content">
        {tab === 'company'  && <CompanyInfoTab tenant={tenant} />}
        {tab === 'billing'  && <BillingTab tenant={tenant} onNavigateTab={setTab} />}
        {tab === 'payments' && <PaymentsTab tenant={tenant} onNavigateTab={setTab} />}
        {tab === 'plans'    && <PlansTab tenant={tenant} onReload={load} />}
        {tab === 'modules'  && <ModulesTab />}
        {tab === 'reports'  && <ReportsTab />}
        {tab === 'support'  && <SupportTab />}
      </div>
    </div>
  );
};
