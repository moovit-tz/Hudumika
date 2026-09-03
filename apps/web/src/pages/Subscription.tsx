import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import './Subscription.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Switch } from '../components/ui/switch.js';
import { useCompany, setCompany } from '../data/companyStore.js';
import { useEntitlements, resetEntitlementsCache } from '../hooks/useEntitlements.js';
import { APP_META } from './Utilities.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { Addon } from '@hudumika/types';
import { AreaSparkline } from '../components/MetricCard.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = 'company' | 'billing' | 'payments' | 'plans' | 'modules' | 'reports' | 'support';
type PlanKey = 'starter' | 'growth' | 'scale' | 'enterprise';

// ─── Constants ────────────────────────────────────────────────────────────────

type PlanDisplay = { name: string; color: string; bg: string; pricePerSeat: number | null; itemLimit: number | null; badge?: string; features: string[] };

// Fallback shown until /v1/packages resolves — mirrors the seeded values (migration 078) so there's no flash of wrong pricing.
// Every tier gets every module now (see package_features) — tiers differ by $/seat/month and monthly item cap, not feature access.
// All 4 tiers share the single brand accent (matches --teal) instead of a different hue each —
// they're differentiated by icon (PLAN_ICONS) and the "Most Popular"/"Current Plan" badges instead.
const PLAN_DEFAULTS: Record<PlanKey, PlanDisplay> = {
  starter: {
    name: 'HuduStarter', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 6, itemLimit: 100,
    features: ['Every module included', '100 items / month', '10 GB storage', 'Basic shipment tracking', 'TANCIS integration', 'Email support', 'Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)'],
  },
  growth: {
    name: 'HuduPlus', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 18, itemLimit: 500, badge: 'Most Popular',
    features: ['Every module included', '500 items / month', '50 GB storage', 'Advanced tracking & alerts', 'WhatsApp Bot', 'Priority 24h support'],
  },
  scale: {
    name: 'Scale (Legacy)', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 19, itemLimit: 1500,
    features: ['Every module included', '1,500 items / month', '250 GB storage', 'Full API access', 'TANESW integration', 'Custom reports', 'Multi-branch support'],
  },
  enterprise: {
    name: 'Hudu Advanced', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: null, itemLimit: null,
    features: ['Every module included', 'Unlimited items / month', 'Unlimited storage', 'Dedicated account manager', '24/7 phone & WhatsApp support', 'Custom integrations (core banking APIs)', 'White-label option', '99.99% SLA guarantee', 'Metered option shared per quotation'],
  },
};

const PLAN_BG: Record<string, string> = { starter: 'var(--teal-l)', growth: 'var(--teal-l)', scale: 'var(--teal-l)', enterprise: 'var(--teal-l)' };

/** Fetches the canonical package catalog and shapes it to match this page's existing render code. */
function usePlans(): Record<PlanKey, PlanDisplay> {
  const [plans, setPlans] = useState<Record<PlanKey, PlanDisplay>>(PLAN_DEFAULTS);

  useEffect(() => {
    apiFetch('/v1/packages').then(res => {
      const next = { ...PLAN_DEFAULTS };
      for (const pkg of res.data as Array<{ code: string; name: string; price_per_seat: number | null; monthly_item_limit: number | null; features: string[]; color: string; popular: boolean }>) {
        if (pkg.code in next) {
          next[pkg.code as PlanKey] = {
            name: pkg.name,
            color: pkg.color,
            bg: PLAN_BG[pkg.code] ?? '#f4f5f7',
            pricePerSeat: pkg.price_per_seat,
            itemLimit: pkg.monthly_item_limit,
            badge: pkg.popular ? 'Most Popular' : undefined,
            features: pkg.features,
          };
        }
      }
      setPlans(next);
    }).catch(() => { /* keep defaults on failure */ });
  }, []);

  return plans;
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
  const cfg: Record<string, { bg: string; color: string }> = {
    PAID:     { bg: 'var(--green-l)', color: '#059669' }, DUE:        { bg: 'var(--gold-l)', color: 'var(--gold)' },
    OVERDUE:  { bg: 'var(--red-l)', color: 'var(--red)' }, CANCELLED:  { bg: '#f1f5f9', color: 'var(--ink2)' },
    OPEN:     { bg: 'var(--blue-l)', color: '#2563eb' }, IN_PROGRESS:{ bg: 'var(--gold-l)', color: 'var(--gold)' },
    RESOLVED: { bg: 'var(--green-l)', color: '#059669' }, CLOSED:     { bg: '#f1f5f9', color: 'var(--ink2)' },
    HIGH:     { bg: 'var(--red-l)', color: 'var(--red)' }, URGENT:     { bg: 'var(--red-l)', color: 'var(--red)' },
    NORMAL:   { bg: 'var(--gold-l)', color: 'var(--gold)' }, MEDIUM:     { bg: 'var(--gold-l)', color: 'var(--gold)' }, LOW: { bg: '#f1f5f9', color: 'var(--ink2)' },
    ACTIVE:   { bg: 'var(--green-l)', color: '#059669' },
  };
  const c = cfg[status.toUpperCase()] || cfg.LOW;
  return <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{status}</span>;
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
  const { user } = useAuth();
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingReg, setEditingReg] = useState(false);
  const [infoForm, setInfoForm] = useState(co);
  const [regForm, setRegForm] = useState(co);

  function startEditInfo() { setInfoForm(co); setEditingInfo(true); }
  function startEditReg() { setRegForm(co); setEditingReg(true); }
  function saveInfo() {
    setCompany({
      name: infoForm.name, taxId: infoForm.taxId, businessType: infoForm.businessType,
      contactPerson: infoForm.contactPerson, email: infoForm.email, phone: infoForm.phone,
      address: infoForm.address, country: infoForm.country,
    });
    setEditingInfo(false);
  }
  function saveReg() {
    setCompany({
      customsAgentLicence: regForm.customsAgentLicence, licenceExpiry: regForm.licenceExpiry,
      traPin: regForm.traPin, tancisUsername: regForm.tancisUsername,
    });
    setEditingReg(false);
  }

  const plans = usePlans();
  const currentPlan = tenant?.plan || 'starter';
  const plan = plans[currentPlan as PlanKey] || plans.starter;
  const seats = useSeatCount();
  const entitlements = useEntitlements();
  const usage = entitlements?.usage;
  const estMonthly = plan.pricePerSeat === null ? null : plan.pricePerSeat * seats;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Company details */}
        <Card>
          <CardHead
            title="Company Information"
            sub="Details registered with Hudumika for this account — shared across Finance, ClearOS and every app that prints your company info."
            right={
              editingInfo ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn label="Cancel" onClick={() => setEditingInfo(false)} />
                  <Btn label="Save Changes" icon="save" onClick={saveInfo} variant="primary" />
                </div>
              ) : (
                <Btn label="Edit" icon="edit" onClick={startEditInfo} />
              )
            }
          />
          <div style={{ padding: '0 20px 20px' }}>
            {([
              ['Company Name', 'name'], ['TIN / Tax ID', 'taxId'], ['Business Type', 'businessType'],
              ['Contact Person', 'contactPerson'], ['Email Address', 'email'], ['Phone', 'phone'],
              ['Physical Address', 'address'], ['Country', 'country'],
            ] as const).map(([label, key]) => (
              <FormRow key={key} label={label}>
                {editingInfo ? (
                  <input value={infoForm[key]} onChange={e => setInfoForm(f => ({ ...f, [key]: e.target.value }))} className="input-field" style={{ fontSize: 13, padding: '7px 12px', width: '100%' }} />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{co[key] || '—'}</span>
                )}
              </FormRow>
            ))}
          </div>
        </Card>

        {/* Licence number */}
        <Card>
          <CardHead
            title="Regulatory Details"
            sub="Customs authority credentials and clearance licence."
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

      {/* Right: plan summary + logo */}
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
              ['Storage', currentPlan === 'starter' ? '10 GB' : currentPlan === 'growth' ? '50 GB' : currentPlan === 'scale' ? '250 GB' : 'Unlimited'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            {usage && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)', marginBottom: 5 }}>
                  <span>Items this month</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{usage.used}{usage.limit !== null ? ` / ${usage.limit}` : ''}</span>
                </div>
                {usage.limit !== null && (
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`, background: usage.used >= usage.limit ? 'var(--red)' : plan.color, borderRadius: 4 }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Company Logo" />
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: 9, background: 'var(--bg)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', overflow: 'hidden' }}>
              {co.logoUrl ? (
                <img src={co.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Icon name="building" size={28} strokeWidth={1.5} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
              )}
            </div>
            <input type="file" id="logo-upload" style={{ display: 'none' }} accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                setCompany({ logoUrl: ev.target?.result as string });
              };
              reader.readAsDataURL(file);
            }} />
            <Btn label="Upload Logo" icon="upload" onClick={() => document.getElementById('logo-upload')?.click()} />
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>PNG or SVG, max 2 MB</div>
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
  const plan = plans[currentPlan as PlanKey] || plans.starter;
  const seats = useSeatCount();
  const isCustomPricing = plan.pricePerSeat === null;
  const monthlyTotal = isCustomPricing ? null : (plan.pricePerSeat as number) * seats;
  const priceLabel = isCustomPricing ? 'Custom' : `$${plan.pricePerSeat}/user`;
  const priceMonthlyTotal = isCustomPricing ? 'Custom' : `$${monthlyTotal!.toLocaleString()}`;

  const { invoices, reload: reloadInvoices } = useInvoices();
  const { methods } = usePaymentMethods();
  const defaultMethod = methods?.find(m => m.is_default) ?? null;
  // Invoices come back newest-period-first per the API contract, so [0] is the current period.
  const current = invoices?.[0] ?? null;
  const [paying, setPaying] = useState<string | null>(null);

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
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.green ? '#047857' : 'var(--ink)' }}>{item.value}</div>
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

const METHOD_TYPES: { value: 'card' | 'mobile_money'; label: string }[] = [
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
];

function PaymentsTab({ onNavigateTab }: { tenant?: any; onNavigateTab: (t: SubTab) => void }) {
  const { user } = useAuth();
  const { methods, reload: reloadMethods } = usePaymentMethods();
  const { invoices, reload: reloadInvoices } = useInvoices();

  const [showAddForm, setShowAddForm] = useState(false);
  const [methodType, setMethodType] = useState<'card' | 'mobile_money'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState('');
  const [methodLabel, setMethodLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [payingUpcoming, setPayingUpcoming] = useState(false);

  const upcoming = invoices?.find((inv: any) => inv.status === 'due' || inv.status === 'overdue') ?? null;
  const paidInvoices = (invoices ?? []).filter((inv: any) => !!inv.tx_ref);

  function methodLabelFor(id: string | null) {
    if (!id) return '—';
    const m = methods?.find(mm => mm.id === id);
    return m ? (m.label || `${m.brand ?? ''} •••• ${m.last4 ?? ''}`) : '—';
  }

  function resetForm() {
    setCardNumber(''); setCardExpiry(''); setCardCvc(''); setPhone(''); setProvider(''); setMethodLabel(''); setFormError(null);
  }

  async function submitAdd() {
    setFormError(null);
    setSaving(true);
    try {
      const body: Record<string, string> = methodType === 'card'
        ? { type: 'card', card_number: cardNumber, card_expiry: cardExpiry, card_cvc: cardCvc, ...(methodLabel ? { label: methodLabel } : {}) }
        : { type: 'mobile_money', phone, ...(provider ? { provider } : {}), ...(methodLabel ? { label: methodLabel } : {}) };
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
                <div style={{ width: 52, height: 36, borderRadius: 6, background: m.is_default ? '#1a3260' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={m.type === 'mobile_money' ? 'smartphone' : 'creditCard'} size={18} strokeWidth={1.75} style={{ color: m.is_default ? '#fff' : 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {m.label || m.brand}{m.last4 ? ` •••• ${m.last4}` : ''}
                    {m.is_default && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: 'var(--green-l)', color: '#059669', fontSize: 10, fontWeight: 700 }}>Default</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{m.exp_month && m.exp_year ? `Expires ${String(m.exp_month).padStart(2, '0')}/${m.exp_year}` : (m.type === 'mobile_money' ? 'Mobile money' : '')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!m.is_default && <Btn label="Set Default" onClick={() => setDefault(m.id)} />}
                  <Btn label="Remove" variant="danger" onClick={() => removeMethod(m.id)} />
                </div>
              </div>
            ))}

            {showAddForm && (
              <div style={{ padding: '14px 0' }}>
                <FormRow label="Type">
                  <Select value={methodType} onValueChange={(v: any) => setMethodType(v)}>
                    <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHOD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormRow>
                {methodType === 'card' ? (
                  <>
                    <FormRow label="Card Number"><input value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                    <FormRow label="Expiry (MM/YY)"><input value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} placeholder="08/28" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                    <FormRow label="CVC"><input value={cardCvc} onChange={e => setCardCvc(e.target.value)} placeholder="123" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                  </>
                ) : (
                  <>
                    <FormRow label="Phone Number"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0755 000 000" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                    <FormRow label="Provider"><input value={provider} onChange={e => setProvider(e.target.value)} placeholder="M-Pesa, Tigo Pesa, Airtel Money…" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
                  </>
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
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>Due on {fmtDate(upcoming.due_date)}</div>
                {[[`${upcoming.plan_code} (${upcoming.seats} seat${upcoming.seats === 1 ? '' : 's'})`, fmtAmount(upcoming)], ['Tax', 'Included'], ['Total', fmtAmount(upcoming)]].map(([k, v], i) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)', fontWeight: i === 2 ? 700 : 400, color: i === 2 ? 'var(--ink)' : 'var(--ink3)' }}>
                    <span>{k}</span><span>{v}</span>
                  </div>
                ))}
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

const PLAN_ORDER: PlanKey[] = ['starter', 'growth', 'enterprise'];

const PLAN_TAGLINES: Record<PlanKey, string> = {
  starter: 'HuduStarter — For solo founders and small teams just getting started',
  growth: 'HuduPlus — For growing teams scaling their operations',
  scale: 'Legacy Plan — Scale',
  enterprise: 'Hudu Advanced — Metered option shared per quotation',
};

const PLAN_ICONS: Record<PlanKey, IconName> = {
  starter: 'zap', growth: 'trendingUp', scale: 'barChart', enterprise: 'crown',
};

const COMPARE_ROWS: [string, string, string, string][] = [
  ['Shipments / month', '100', '500', 'Unlimited'],
  ['User accounts limit', 'Up to 300', 'Up to 300', 'Unlimited'],
  ['Document storage', '10 GB', '50 GB', 'Unlimited'],
  ['TANCIS integration', '✓', '✓', '✓'],
  ['TANESW integration', '—', '✓', '✓'],
  ['WhatsApp Bot', '—', '✓', '✓'],
  ['API access', '—', '✓', '✓'],
  ['Custom branding', '—', '—', '✓'],
  ['Dedicated manager', '—', '—', '✓'],
  ['SLA uptime', '99%', '99.5%', '99.99%'],
];

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

  async function purchase(code: string) {
    setBusyCode(code);
    try {
      await apiFetch(`/v1/addons/${code}/purchase`, { method: 'POST' });
      await reload();
    } catch (err: any) {
      showAlert(`Failed to add: ${err.message}`);
    } finally {
      setBusyCode(null);
    }
  }

  async function cancel(code: string, name: string) {
    if (!(await showConfirm(`Remove the ${name} add-on from your subscription?`, { variant: 'warning', confirmLabel: 'Remove' }))) return;
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
      <CardHead title="Get more with add-ons" sub="Purchasable on top of your plan — not a separate tier." />
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        {addons.map(addon => (
          <div key={addon.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 9, background: `${addon.color ?? '#e8461a'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="globe" size={16} strokeWidth={1.75} style={{ color: addon.color ?? 'var(--teal)' } as React.CSSProperties} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>{addon.name}</span>
                  {addon.purchased && <span style={{ padding: '1px 8px', borderRadius: 20, background: 'var(--green-l)', color: '#059669', fontSize: 10, fontWeight: 700 }}>Active</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: addon.color ?? 'var(--navy)', marginTop: 2 }}>
                  ${addon.monthlyPrice}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)' }}>/mo</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink2)', margin: 0, lineHeight: 1.5, flex: 1 }}>{addon.description}</p>
            {addon.purchased ? (
              <Btn label={busyCode === addon.code ? 'Removing…' : 'Remove'} variant="danger" onClick={() => cancel(addon.code, addon.name)} disabled={busyCode === addon.code} />
            ) : (
              <Btn label={busyCode === addon.code ? 'Adding…' : 'Add to Plan'} icon="plus" variant="primary" onClick={() => purchase(addon.code)} disabled={busyCode === addon.code} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlansTab({ tenant, onReload }: { tenant: any; onReload: () => Promise<void> }) {
  const plans = usePlans();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const currentPlan: PlanKey = (tenant?.plan || 'starter') as PlanKey;

  async function handleSelectPlan(k: PlanKey) {
    if (!(await showConfirm(`Are you sure you want to change your plan to ${k}?`, { variant: 'warning', confirmLabel: 'Change Plan' }))) return;
    try {
      await apiFetch('/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ plan: k })
      });
      await onReload();
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
        <div className="sub-billing-toggle" style={{ background: 'var(--bg)', border: '1.5px solid var(--border)' }}>
          {(['monthly', 'yearly'] as const).map(b => (
            <button key={b} className={`sub-toggle-btn${billing === b ? ' active' : ''}`}
               style={billing === b ? { background: 'var(--navy)', color: '#fff' } : { color: 'var(--ink3)' }}
               onClick={() => setBilling(b)}>
              {b.charAt(0).toUpperCase() + b.slice(1)}
              {b === 'yearly' && <span className="sub-toggle-badge">Save ~17%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="sub-cards" style={{ marginBottom: 16 }}>
        {PLAN_ORDER.map(k => {
          const p = plans[k];
          const isCurrent = k === currentPlan;
          const isCustom = k === 'enterprise';
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
                <Icon name={PLAN_ICONS[k]} size={18} strokeWidth={1.75} style={{ color: 'var(--plan-color)' } as React.CSSProperties} />
              </div>
              <div className="sub-card-name">{p.name}</div>
              <div className="sub-card-sub">{PLAN_TAGLINES[k]}</div>

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
                  <div className="sub-card-annual-note">
                    {billing === 'yearly' ? `Billed annually · $${(perSeatDisplay! * 12).toLocaleString()} /seat/yr` : 'Billed monthly · switch to yearly to save'}
                  </div>
                  <div className="sub-card-annual-note" style={{ marginTop: 2 }}>
                    {p.itemLimit === null ? 'Unlimited items / month' : `Up to ${p.itemLimit.toLocaleString()} items / month`}
                  </div>
                </>
              )}

              {isCustom && !isCurrent ? (
                <a
                  href="mailto:sales@hudumika.tz?subject=Enterprise%20Plan%20Inquiry"
                  className="sub-card-cta"
                  style={{ background: 'var(--plan-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Talk to Sales <Icon name="arrowRight" size={13} strokeWidth={2.5} /></span>
                </a>
              ) : (
                <button
                  className={`sub-card-cta${isCurrent ? ' sub-card-cta--current' : ''}`}
                  style={isCurrent ? undefined : { background: 'var(--plan-color)' }}
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

      {/* Feature comparison table */}
      <Card style={{ marginTop: 28 }}>
        <CardHead title="Compare plans" sub="Every feature, side by side." />
        <div className="sub-compare-scroll">
          <div className="sub-compare-grid">
            <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${PLAN_ORDER.length}, 150px)`, borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '16px 20px' }} />
              {PLAN_ORDER.map(k => {
                const p = plans[k]; const isCur = k === currentPlan;
                return (
                  <div key={k} style={{ padding: '16px 14px', textAlign: 'center', borderLeft: '1px solid var(--border)', background: isCur ? p.bg : 'var(--white)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>{p.name}</div>
                    {isCur && <div style={{ fontSize: 10, fontWeight: 700, color: p.color, marginTop: 2 }}>Current</div>}
                  </div>
                );
              })}
            </div>
            {COMPARE_ROWS.map(([feat, ...vals]) => (
              <div key={feat} style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${PLAN_ORDER.length}, 150px)`, borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '11px 20px', fontSize: 13, color: 'var(--ink2)' }}>{feat}</div>
                {vals.map((v, i) => (
                  <div key={i} style={{ padding: '11px 14px', textAlign: 'center', borderLeft: '1px solid var(--border)', fontSize: 13, color: v === '—' ? 'var(--ink3)' : '#059669', fontWeight: v === '—' ? 400 : 600 }}>{v}</div>
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
            {usage && usage.limit !== null && (
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`, height: '100%', background: usage.used >= usage.limit ? 'var(--red)' : 'var(--teal)', borderRadius: 2 }} />
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
              { icon: 'headphones' as IconName, label: 'Priority Support', sub: 'Enterprise: 4h response SLA', color: '#6e40c9', href: undefined },
              { icon: 'mail'       as IconName, label: 'Email Support',    sub: 'support@hudumika.tz',         color: 'var(--teal)', href: 'mailto:support@hudumika.tz' },
              { icon: 'chatBubble' as IconName, label: 'WhatsApp Chat',    sub: '+255 800 123 456',            color: '#059669', href: 'https://wa.me/255800123456' },
            ].map(c => {
              const row = (
                <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: c.href ? 'pointer' : 'default' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: c.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* ── Hero header ── */}
      <div className="sub-hero2" style={{ background: 'linear-gradient(135deg, #0f2942 0%, #1a4f8a 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* decorative circles */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, right: 100, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.025)', pointerEvents: 'none' }} />

        <div className="sub-hero-topline" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            {/* breadcrumb */}
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 10, padding: 0, fontFamily: 'var(--font)', textDecoration: 'none' }}>
              <Icon name="chevronLeft" size={13} strokeWidth={2} /> Ops Command
            </Link>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Subscription & Account</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{tenantName} — {planLabel} Plan</div>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <div style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tenant?.active ? '#4ade80' : '#ef4444', display: 'inline-block' }} /> {tenant?.active ? 'ACTIVE' : 'INACTIVE'}
            </div>
          </div>
        </div>

        {/* Tab bar inside hero */}
        <div className="sub-hero-tabbar">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px',
              border: 'none', borderBottom: `2px solid ${tab === t.id ? '#fff' : 'transparent'}`,
              background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name={t.icon} size={13} strokeWidth={tab === t.id ? 2.5 : 2} />
              {t.label}
            </button>
          ))}
        </div>
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
