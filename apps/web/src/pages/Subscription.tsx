import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import './Subscription.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { useCompany, setCompany } from '../data/companyStore.js';
import { useEntitlements } from '../hooks/useEntitlements.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = 'company' | 'billing' | 'payments' | 'security' | 'plans' | 'modules' | 'reports' | 'support';
type PlanKey = 'starter' | 'growth' | 'scale' | 'enterprise';

// ─── Constants ────────────────────────────────────────────────────────────────

type PlanDisplay = { name: string; color: string; bg: string; pricePerSeat: number | null; itemLimit: number | null; badge?: string; features: string[] };

// Fallback shown until /v1/packages resolves — mirrors the seeded values (migration 078) so there's no flash of wrong pricing.
// Every tier gets every module now (see package_features) — tiers differ by $/seat/month and monthly item cap, not feature access.
// All 4 tiers share the single brand accent (matches --teal) instead of a different hue each —
// they're differentiated by icon (PLAN_ICONS) and the "Most Popular"/"Current Plan" badges instead.
const PLAN_DEFAULTS: Record<PlanKey, PlanDisplay> = {
  starter: {
    name: 'Starter', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 4, itemLimit: 50,
    features: ['Every module included', '50 items / month', '10 GB storage', 'Basic shipment tracking', 'TANCIS integration', 'Email support', 'Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)'],
  },
  growth: {
    name: 'Growth', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 9, itemLimit: 300, badge: 'Most Popular',
    features: ['Every module included', '300 items / month', '50 GB storage', 'Advanced tracking & alerts', 'WhatsApp Bot', 'Priority 24h support'],
  },
  scale: {
    name: 'Scale', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: 19, itemLimit: 1500,
    features: ['Every module included', '1,500 items / month', '250 GB storage', 'Full API access', 'TANESW integration', 'Custom reports', 'Multi-branch support'],
  },
  enterprise: {
    name: 'Enterprise', color: 'var(--teal)', bg: 'var(--teal-l)', pricePerSeat: null, itemLimit: null,
    features: ['Every module included', 'Unlimited items / month', 'Unlimited storage', 'Dedicated account manager', '24/7 phone & WhatsApp support', 'Custom integrations (core banking APIs)', 'White-label option', '99.99% SLA guarantee', 'On-premise / private cloud option'],
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

const PAYMENT_HISTORY = [
  { no: 'INV-2026-0604', desc: 'Enterprise Plan — Jun 2026', issued: '01 Jun 2026', due: '01 Jun 2026', amount: '$599.00', status: 'Paid'    },
  { no: 'INV-2026-0504', desc: 'Enterprise Plan — May 2026', issued: '01 May 2026', due: '01 May 2026', amount: '$599.00', status: 'Paid'    },
  { no: 'INV-2026-0404', desc: 'Enterprise Plan — Apr 2026', issued: '01 Apr 2026', due: '01 Apr 2026', amount: '$599.00', status: 'Paid'    },
  { no: 'INV-2026-0304', desc: 'Maintenance Add-on — Mar 2026', issued: '01 Mar 2026', due: '15 Mar 2026', amount: '$99.00', status: 'Paid' },
  { no: 'INV-2026-0104', desc: 'Enterprise Plan — Jan 2026', issued: '01 Jan 2026', due: '15 Jan 2026', amount: '$599.00', status: 'Due'     },
];

const MODULES = [
  { id: 'clearance',   name: 'Customs Clearance',  desc: 'TANCIS declaration, stage tracking, document management.', icon: 'shield' as IconName,      active: true,  version: 'v2.4.1' },
  { id: 'crm',         name: 'CRM & Sales',        desc: 'Customer management, leads, quotations and contracts.',     icon: 'users' as IconName,       active: true,  version: 'v1.9.0' },
  { id: 'finance',     name: 'Finance & Billing',  desc: 'Invoicing, ledgers, expense tracking and reports.',         icon: 'barChart' as IconName,    active: true,  version: 'v1.6.3' },
  { id: 'hrm',         name: 'HRM',                desc: 'Staff directory, roles, departments and time tracking.',     icon: 'briefcase' as IconName,   active: true,  version: 'v1.2.0' },
  { id: 'filemanager', name: 'File Manager',       desc: 'Secure document storage with AI extraction support.',       icon: 'folder' as IconName,      active: true,  version: 'v1.3.2' },
  { id: 'demurrage',   name: 'Demurrage Tracker',  desc: 'Monitor container dwell times and calculate penalties.',     icon: 'clock' as IconName,       active: true,  version: 'v1.1.0' },
  { id: 'tanesw',      name: 'TANESW Integration', desc: 'Real-time Tanzania e-Single Window API connector.',         icon: 'globe' as IconName,       active: false, version: 'v0.9.5' },
  { id: 'analytics',   name: 'Advanced Analytics', desc: 'Deep-dive dashboards, custom charts and KPI tracking.',     icon: 'pieChart' as IconName,    active: false, version: 'v1.0.0' },
  { id: 'whatsapp',    name: 'WhatsApp Bot',       desc: 'Automated customer updates via WhatsApp Business API.',     icon: 'chatBubble' as IconName,  active: true,  version: 'v2.0.1' },
];

const SUPPORT_TICKETS = [
  { id: 'TKT-0142', subject: 'TANCIS sync failing for port of Tanga', status: 'Open',   priority: 'High',   updated: '12 Jun 2026' },
  { id: 'TKT-0138', subject: 'Invoice PDF not generating correctly',   status: 'Closed', priority: 'Medium', updated: '08 Jun 2026' },
  { id: 'TKT-0121', subject: 'WhatsApp notifications delay > 10 min',  status: 'Closed', priority: 'Medium', updated: '29 May 2026' },
  { id: 'TKT-0117', subject: 'Request: bulk import shipments from CSV', status: 'Open',  priority: 'Low',    updated: '22 May 2026' },
];

const USAGE_STATS = [
  { label: 'Shipments This Month', value: '47', max: 'Unlimited', pct: 0 },
  { label: 'Active Users',         value: '8',  max: 'Unlimited', pct: 0 },
  { label: 'Storage Used',         value: '38.4 GB', max: '500 GB', pct: 8 },
  { label: 'API Calls (month)',     value: '12,480', max: 'Unlimited', pct: 0 },
];

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
  const cfg: Record<string, { bg: string; color: string }> = {
    Paid:   { bg: '#ecfdf5', color: '#059669' }, Due:    { bg: '#fef9c3', color: '#ca8a04' },
    Open:   { bg: '#dbeafe', color: '#2563eb' }, Closed: { bg: '#f1f5f9', color: '#64748b' },
    High:   { bg: '#fee2e2', color: '#dc2626' }, Medium: { bg: '#fef9c3', color: '#ca8a04' }, Low: { bg: '#f1f5f9', color: '#64748b' },
    Active: { bg: '#ecfdf5', color: '#059669' },
  };
  const c = cfg[status] || cfg.Low;
  return <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{status}</span>;
}

function Btn({ label, icon, onClick, variant = 'ghost' }: { label: string; icon?: IconName; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' }) {
  const style: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--teal)', color: '#fff', border: 'none' },
    ghost:   { background: 'var(--white)', color: 'var(--ink)', border: '1.5px solid var(--border)' },
    danger:  { background: 'var(--white)', color: 'var(--red)', border: '1.5px solid var(--border)' },
  };
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', ...style[variant] }}>
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

function BillingTab({ tenant }: { tenant: any }) {
  const plans = usePlans();
  const currentPlan = tenant?.plan || 'starter';
  const plan = plans[currentPlan as PlanKey] || plans.starter;
  const seats = useSeatCount();
  const isCustomPricing = plan.pricePerSeat === null;
  const monthlyTotal = isCustomPricing ? null : (plan.pricePerSeat as number) * seats;
  const priceLabel = isCustomPricing ? 'Custom' : `$${plan.pricePerSeat}/user`;
  const priceMonthlyTotal = isCustomPricing ? 'Custom' : `$${monthlyTotal!.toLocaleString()}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Current plan + next payment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <Card>
          <CardHead title="Current Subscription" sub="Your active plan and renewal details." right={<Btn label="Change Plan" icon="layers" />} />
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
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Renewal',      value: '01 Jul 2026',  icon: 'calendar' as IconName },
                { label: 'Start Date',   value: '01 Jun 2024',  icon: 'clock'    as IconName },
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
              <button style={{ flex: 1, padding: '9px 0', border: `1.5px solid ${plan.color}`, borderRadius: 9, background: plan.bg, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: plan.color, fontFamily: 'var(--font)' }}>View Invoice</button>
              <button style={{ padding: '9px 18px', border: '1.5px solid var(--border)', borderRadius: 9, background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--red)', fontFamily: 'var(--font)' }}>Cancel Subscription</button>
            </div>
          </div>
        </Card>

        {/* Billing summary */}
        <Card>
          <CardHead title="Billing Summary" />
          <div style={{ padding: '16px 20px' }}>
            {[
              ['Amount Due', isCustomPricing ? 'Custom' : priceMonthlyTotal + '.00'],
              ['Due Date',   '01 Jul 2026'],
              ['Currency',   'USD'],
              ['Tax',        'Included'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            <button style={{ width: '100%', marginTop: 16, padding: '10px 0', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font)' }}>Pay Now</button>
            <button style={{ width: '100%', marginTop: 8, padding: '9px 0', border: '1.5px solid var(--border)', borderRadius: 9, background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)' }}>Download Statement</button>
          </div>
        </Card>
      </div>

      {/* Billing history table */}
      <Card>
        <CardHead title="Invoice History" sub="Download PDF invoices and track payment status." right={<Btn label="Download All" icon="download" />} />
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Invoice No.','Description','Issued','Due Date','Amount','Status',''].map(h => (
              <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {PAYMENT_HISTORY.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>{row.no}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{row.desc.replace('Enterprise Plan', plan.name + ' Plan')}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{row.issued}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{row.due}</td>
                <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{row.no.includes('INV') && !row.desc.includes('Add-on') ? (isCustomPricing ? 'Custom' : priceMonthlyTotal + '.00') : row.amount}</td>
                <td style={{ padding: '12px 16px' }}><StatusBadge status={row.status} /></td>
                <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                  <Btn label="PDF" icon="download" />
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

function PaymentsTab({ tenant }: { tenant?: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Payment methods */}
        <Card>
          <CardHead title="Payment Methods" sub="Manage cards and accounts used for billing." right={<Btn label="Add Method" icon="plus" variant="primary" />} />
          <div style={{ padding: '0 20px 8px' }}>
            {[
              { type: 'Visa',    last4: '9484', expiry: '08 / 2028', holder: (tenant?.name || 'Company').toUpperCase(), primary: true  },
              { type: 'PayPal',  last4: '',     expiry: '',           holder: tenant?.email || 'billing@company.com', primary: false },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 52, height: 36, borderRadius: 6, background: m.primary ? '#1a3260' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="creditCard" size={18} strokeWidth={1.75} style={{ color: m.primary ? '#fff' : 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {m.type}{m.last4 ? ` •••• ${m.last4}` : ''}
                    {m.primary && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: '#ecfdf5', color: '#059669', fontSize: 10, fontWeight: 700 }}>Default</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{m.holder}{m.expiry ? ` · Expires ${m.expiry}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!m.primary && <Btn label="Set Default" />}
                  <Btn label="Remove" variant="danger" />
                </div>
              </div>
            ))}
            <div style={{ paddingBottom: 12 }}>
              <button style={{ width: '100%', marginTop: 14, padding: '10px 0', border: '1.5px dashed var(--border)', borderRadius: 9, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink3)', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="plus" size={14} strokeWidth={2.5} /> Add Payment Method
              </button>
            </div>
          </div>
        </Card>

        {/* Transaction history */}
        <Card>
          <CardHead title="Payment Transactions" sub="All successful charges and refunds." />
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date','Description','Method','Amount','Status'].map(h => (
                <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {PAYMENT_HISTORY.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{row.issued}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--ink)' }}>{row.desc}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>Visa ••9484</td>
                  <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{row.amount}</td>
                  <td style={{ padding: '11px 16px' }}><StatusBadge status={row.status} /></td>
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
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>$5,999.00</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>Due on 01 Jul 2026</div>
            {[['Enterprise Plan (12 mo)', '$5,999.00'], ['Tax', 'Included'], ['Total', '$5,999.00']].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)', fontWeight: i === 2 ? 700 : 400, color: i === 2 ? 'var(--ink)' : 'var(--ink3)' }}>
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
            <button style={{ width: '100%', marginTop: 16, padding: '11px 0', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)' }}>Pay Now</button>
          </div>
        </Card>
        <Card>
          <CardHead title="Billing Contact" />
          <div style={{ padding: '0 20px 16px' }}>
            {[['Name','Alhassan Musa'],['Email','billing@dangote.co.tz'],['Phone','+255 754 320 000']].map(([k,v]) => (
              <FormRow key={k} label={k}><span style={{ fontSize: 13 }}>{v}</span></FormRow>
            ))}
            <div style={{ marginTop: 12 }}><Btn label="Edit Billing Contact" icon="edit" /></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab() {
  const [show2FA, setShow2FA] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Change password */}
        <Card>
          <CardHead title="Change Password" sub="Use a strong password that you don't use elsewhere." />
          <div style={{ padding: '0 20px 20px' }}>
            {['Current Password', 'New Password', 'Confirm New Password'].map(label => (
              <FormRow key={label} label={label}>
                <input type="password" placeholder="••••••••••••" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%' }} />
              </FormRow>
            ))}
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <Btn label="Update Password" icon="save" variant="primary" />
            </div>
          </div>
        </Card>

        {/* 2FA */}
        <Card>
          <CardHead title="Two-Factor Authentication" sub="Add an extra layer of protection to your account." right={
            <button onClick={() => setShow2FA(v => !v)} style={{ width: 44, height: 24, borderRadius: 9, background: show2FA ? 'var(--teal)' : 'var(--border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: show2FA ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          } />
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: show2FA ? 12 : 0 }}>
              {show2FA ? 'Two-factor authentication is enabled. Scan the QR code with your authenticator app.' : 'Enable 2FA to require a verification code when signing in from a new device.'}
            </div>
            {show2FA && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ width: 100, height: 100, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="camera" size={32} strokeWidth={1.5} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Can't scan? Enter this code manually:</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.1em', background: 'var(--bg)', padding: '8px 14px', borderRadius: 6, marginBottom: 12 }}>JBSW Y3DP EHPK 3PXP</div>
                  <input placeholder="Enter 6-digit code to verify" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%', marginBottom: 10 }} />
                  <Btn label="Verify & Enable" variant="primary" />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Active sessions */}
        <Card>
          <CardHead title="Active Sessions" sub="All devices currently signed in." right={<Btn label="Sign Out All" variant="danger" />} />
          <div>
            {[
              { device: 'Chrome on Windows 11', ip: '196.33.224.45', location: 'Dar es Salaam, TZ', last: 'Active now', current: true },
              { device: 'Safari on iPhone 15',  ip: '196.33.219.12', location: 'Dar es Salaam, TZ', last: '2 hours ago', current: false },
              { device: 'Chrome on MacBook',    ip: '41.222.4.93',   location: 'Nairobi, KE',        last: '3 days ago', current: false },
            ].map((s, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="monitor" size={18} strokeWidth={1.75} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {s.device}
                    {s.current && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: '#ecfdf5', color: '#059669', fontSize: 10, fontWeight: 700 }}>This device</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{s.ip} · {s.location} · {s.last}</div>
                </div>
                {!s.current && <Btn label="Sign Out" variant="danger" />}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Right: tips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <CardHead title="Security Score" />
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#ecfdf5', border: '4px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 800, color: '#059669' }}>74</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', marginBottom: 4 }}>Good</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Enable 2FA to reach 100</div>
          </div>
        </Card>
        <Card>
          <CardHead title="Security Tips" />
          <div style={{ padding: '12px 20px 16px' }}>
            {['Use a unique, strong password (12+ chars)','Enable two-factor authentication','Review active sessions regularly','Never share your login credentials'].map(tip => (
              <div key={tip} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink2)', padding: '7px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.4 }}>
                <Icon name="check" size={13} strokeWidth={2.5} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 1 } as React.CSSProperties} />
                {tip}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Plans ───────────────────────────────────────────────────────────────

const PLAN_ORDER: PlanKey[] = ['starter', 'growth', 'scale', 'enterprise'];

const PLAN_TAGLINES: Record<PlanKey, string> = {
  starter: 'For solo founders and small teams just getting started',
  growth: 'For growing teams scaling their operations',
  scale: 'For scaling multi-branch operations across East Africa',
  enterprise: 'For large enterprises & financial institutions — custom-built for mission-critical deployments',
};

const PLAN_ICONS: Record<PlanKey, IconName> = {
  starter: 'zap', growth: 'trendingUp', scale: 'barChart', enterprise: 'crown',
};

const COMPARE_ROWS: [string, string, string, string, string][] = [
  ['Shipments / month', '50', '250', '1000', 'Unlimited'],
  ['User accounts', '5', '20', '99', 'Unlimited'],
  ['Document storage', '10 GB', '50 GB', '250 GB', 'Unlimited'],
  ['TANCIS integration', '✓', '✓', '✓', '✓'],
  ['TANESW integration', '—', '—', '✓', '✓'],
  ['WhatsApp Bot', '—', '✓', '✓', '✓'],
  ['API access', '—', '—', '✓', '✓'],
  ['Custom branding', '—', '—', '—', '✓'],
  ['Dedicated manager', '—', '—', '—', '✓'],
  ['SLA uptime', '99%', '99.5%', '99.9%', '99.99%'],
];

function PlansTab({ tenant, onReload }: { tenant: any; onReload: () => Promise<void> }) {
  const plans = usePlans();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const currentPlan: PlanKey = (tenant?.plan || 'starter') as PlanKey;

  async function handleSelectPlan(k: PlanKey) {
    if (!confirm(`Are you sure you want to change your plan to ${k}?`)) return;
    try {
      await apiFetch('/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ plan: k })
      });
      await onReload();
    } catch (err: any) {
      alert(`Failed to update plan: ${err.message}`);
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

      {/* Feature comparison table */}
      <Card style={{ marginTop: 28 }}>
        <CardHead title="Compare plans" sub="Every feature, side by side." />
        <div className="sub-compare-scroll">
          <div className="sub-compare-grid">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 150px)', borderBottom: '1px solid var(--border)' }}>
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
              <div key={feat} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 150px)', borderBottom: '1px solid var(--border)' }}>
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
  const [states, setStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MODULES.map(m => [m.id, m.active]))
  );
  return (
    <div>
      <SectionHead
        title="Installed Modules"
        sub="Enable or disable modules for your Hudumika installation. Changes take effect immediately."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {MODULES.map(m => {
          const active = states[m.id];
          return (
            <Card key={m.id}>
              <div style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 9, background: active ? 'var(--teal-l)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={m.icon} size={20} strokeWidth={1.75} style={{ color: active ? 'var(--teal)' : 'var(--ink3)' } as React.CSSProperties} />
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => setStates(s => ({ ...s, [m.id]: !s[m.id] }))}
                    style={{ width: 40, height: 22, borderRadius: 9, background: active ? 'var(--teal)' : 'var(--border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: active ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 12 }}>{m.desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{m.version}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn label="Download" icon="download" />
                    {!active && <Btn label="Install" icon="plus" variant="primary" />}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Reports ─────────────────────────────────────────────────────────────

function ReportsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Usage stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {USAGE_STATS.map(s => (
          <Card key={s.label}>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: s.pct > 0 ? 8 : 0 }}>of {s.max}</div>
              {s.pct > 0 && (
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', background: s.pct > 80 ? 'var(--red)' : 'var(--teal)', borderRadius: 2 }} />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Activity report */}
      <Card>
        <CardHead title="Usage Activity" sub="Shipment processing and user activity over the last 30 days." right={<Btn label="Export CSV" icon="download" />} />
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Period','Shipments Processed','TANCIS Filings','Documents Uploaded','Active Users'].map(h => (
              <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {[
              ['Jun 2026 (MTD)', '47', '32', '124', '8'],
              ['May 2026',       '63', '51', '198', '7'],
              ['Apr 2026',       '58', '44', '173', '8'],
              ['Mar 2026',       '71', '60', '212', '9'],
              ['Feb 2026',       '44', '38', '141', '7'],
            ].map(([period, ...vals], i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{period}</td>
                {vals.map((v, j) => (
                  <td key={j} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

// ─── Tab: Support ─────────────────────────────────────────────────────────────

function SupportTab() {
  const [showNew, setShowNew] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* New ticket */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Btn label="Open New Ticket" icon="plus" variant="primary" onClick={() => setShowNew(v => !v)} />
          <input placeholder="Search tickets…" className="input-field" style={{ flex: 1, fontSize: 13, padding: '8px 12px' }} />
        </div>

        {showNew && (
          <Card>
            <CardHead title="New Support Ticket" />
            <div style={{ padding: '0 20px 20px' }}>
              <FormRow label="Subject"><input placeholder="Describe the issue briefly…" className="input-field" style={{ width: '100%', fontSize: 13, padding: '8px 12px' }} /></FormRow>
              <FormRow label="Priority">
                <Select defaultValue="Low">
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Module">
                <Select defaultValue={MODULES[0]?.name}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULES.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormRow>
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea rows={4} placeholder="Provide steps to reproduce, screenshots, or any relevant details…" className="input-field" style={{ width: '100%', fontSize: 13, padding: '10px 12px', resize: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn label="Submit Ticket" icon="send" variant="primary" onClick={() => setShowNew(false)} />
                <Btn label="Cancel" onClick={() => setShowNew(false)} />
              </div>
            </div>
          </Card>
        )}

        {/* Ticket list */}
        <Card>
          <CardHead title="My Tickets" sub={`${SUPPORT_TICKETS.filter(t => t.status === 'Open').length} open`} />
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Ticket ID','Subject','Priority','Status','Last Updated',''].map(h => (
                <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {SUPPORT_TICKETS.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>{t.id}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)', maxWidth: 280 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.subject}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={t.priority} /></td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={t.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{t.updated}</td>
                  <td style={{ padding: '12px 12px' }}><Btn label="View" icon="eye" /></td>
                </tr>
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
              { icon: 'headphones' as IconName, label: 'Priority Support',  sub: 'Enterprise: 4h response SLA', color: '#6e40c9' },
              { icon: 'mail'       as IconName, label: 'Email Support',     sub: 'support@hudumika.tz',        color: 'var(--teal)' },
              { icon: 'chatBubble' as IconName, label: 'WhatsApp Chat',     sub: '+255 800 123 456',              color: '#059669' },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: c.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={c.icon} size={17} strokeWidth={1.75} style={{ color: c.color } as React.CSSProperties} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{c.sub}</div>
                </div>
                <Icon name="chevronRight" size={14} strokeWidth={2} style={{ marginLeft: 'auto', color: 'var(--ink3)' } as React.CSSProperties} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Resources" />
          <div style={{ padding: '12px 20px 16px' }}>
            {[
              { label: 'Documentation',      icon: 'fileText'  as IconName },
              { label: 'Video Tutorials',    icon: 'monitor'   as IconName },
              { label: 'API Reference',      icon: 'clipboard' as IconName },
              { label: 'Release Notes',      icon: 'bell'      as IconName },
              { label: 'System Status',      icon: 'activity'  as IconName },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <Icon name={r.icon} size={14} strokeWidth={2} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                <span style={{ fontSize: 13, color: 'var(--ink2)', flex: 1 }}>{r.label}</span>
                <Icon name="externalLink" size={12} strokeWidth={2} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
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

const TABS: { id: SubTab; label: string; icon: IconName }[] = [
  { id: 'company',  label: 'Company Info', icon: 'building'    },
  { id: 'billing',  label: 'Billing',      icon: 'fileText'    },
  { id: 'payments', label: 'Payments',     icon: 'creditCard'  },
  { id: 'security', label: 'Security',     icon: 'lock'        },
  { id: 'plans',    label: 'Plans',        icon: 'layers'      },
  { id: 'modules',  label: 'Modules',      icon: 'package'     },
  { id: 'reports',  label: 'Reports',      icon: 'barChart'    },
  { id: 'support',  label: 'Support',      icon: 'headphones'  },
];

export const Subscription: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<SubTab>('company');
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
            <div style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>
              EXP: 01 Jul 2026
            </div>
          </div>
        </div>

        {/* Tab bar inside hero */}
        <div className="sub-hero-tabbar">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              border: 'none', borderBottom: `2px solid ${tab === t.id ? '#fff' : 'transparent'}`,
              background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
              <Icon name={t.icon} size={13} strokeWidth={tab === t.id ? 2.5 : 2} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="sub-tab-content">
        {tab === 'company'  && <CompanyInfoTab tenant={tenant} />}
        {tab === 'billing'  && <BillingTab tenant={tenant} />}
        {tab === 'payments' && <PaymentsTab tenant={tenant} />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'plans'    && <PlansTab tenant={tenant} onReload={load} />}
        {tab === 'modules'  && <ModulesTab />}
        {tab === 'reports'  && <ReportsTab />}
        {tab === 'support'  && <SupportTab />}
      </div>
    </div>
  );
};
