import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = 'company' | 'billing' | 'payments' | 'security' | 'plans' | 'modules' | 'reports' | 'support';
type PlanKey = 'starter' | 'professional' | 'enterprise';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLANS: Record<PlanKey, { name: string; color: string; bg: string; monthly: number; yearly: number; badge?: string; features: string[] }> = {
  starter: {
    name: 'Starter', color: 'var(--blue)', bg: '#e8f0fe', monthly: 99, yearly: 999,
    features: ['Up to 50 shipments / month','2 user accounts','Basic clearance dashboard','TANCIS declaration forms','Email support (48h SLA)','Standard reports','5 GB document storage'],
  },
  professional: {
    name: 'Professional', color: 'var(--teal)', bg: '#e6f4f1', monthly: 299, yearly: 2999, badge: 'Most Popular',
    features: ['Up to 300 shipments / month','10 user accounts','Full clearance dashboard','TANCIS + TANESW integration','Priority email & WhatsApp support (12h SLA)','Advanced analytics','50 GB storage','Demurrage tracker','Custom duty calculator'],
  },
  enterprise: {
    name: 'Enterprise', color: '#6e40c9', bg: '#f3efff', monthly: 599, yearly: 5999,
    features: ['Unlimited shipments','Unlimited users','Full clearance + CRM suite','TANCIS + TANESW + TRA integration','Dedicated account manager (4h SLA)','Custom analytics & white-label reports','500 GB storage','API access + webhooks','Custom branding','SLA 99.9% uptime','Onboarding & training','Multi-branch support'],
  },
};

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
    Paid:   { bg: '#dcfce7', color: '#16a34a' }, Due:    { bg: '#fef9c3', color: '#ca8a04' },
    Open:   { bg: '#dbeafe', color: '#2563eb' }, Closed: { bg: '#f1f5f9', color: '#64748b' },
    High:   { bg: '#fee2e2', color: '#dc2626' }, Medium: { bg: '#fef9c3', color: '#ca8a04' }, Low: { bg: '#f1f5f9', color: '#64748b' },
    Active: { bg: '#dcfce7', color: '#16a34a' },
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

function CompanyInfoTab() {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Company details */}
        <Card>
          <CardHead
            title="Company Information"
            sub="Details registered with ClearOS for this account."
            right={<Btn label={editing ? 'Save Changes' : 'Edit'} icon={editing ? 'save' : 'edit'} onClick={() => setEditing(e => !e)} variant={editing ? 'primary' : 'ghost'} />}
          />
          <div style={{ padding: '0 20px 20px' }}>
            {[
              { label: 'Company Name',   value: 'Dangote Clearing & Forwarding Ltd' },
              { label: 'TIN / Tax ID',   value: '108-254-890' },
              { label: 'Business Type',  value: 'Customs Clearing Agent' },
              { label: 'Contact Person', value: 'Alhassan Musa' },
              { label: 'Email Address',  value: 'alhassan@dangoteclearing.co.tz' },
              { label: 'Phone',          value: '+255 754 320 000' },
              { label: 'Physical Address',value: 'Harbour View Tower, Toure Drive, Dar es Salaam' },
              { label: 'Country',        value: 'Tanzania' },
            ].map(row => (
              <FormRow key={row.label} label={row.label}>
                {editing
                  ? <input defaultValue={row.value} className="input-field" style={{ fontSize: 13, padding: '7px 12px', width: '100%' }} />
                  : <span style={{ fontSize: 13, color: 'var(--ink)' }}>{row.value}</span>}
              </FormRow>
            ))}
          </div>
        </Card>

        {/* Licence number */}
        <Card>
          <CardHead title="Regulatory Details" sub="Customs authority credentials and clearance licence." />
          <div style={{ padding: '0 20px 20px' }}>
            {[
              { label: 'Customs Agent Licence', value: 'TRA-CA-2024-0094' },
              { label: 'Licence Expiry',         value: '31 Dec 2026' },
              { label: 'TRA PIN',                value: 'P000108254890T' },
              { label: 'TANCIS Username',        value: 'dangote_clearing' },
            ].map(row => (
              <FormRow key={row.label} label={row.label}>
                <span style={{ fontSize: 13, color: 'var(--ink)', fontFamily: row.label.includes('Licence') || row.label.includes('PIN') || row.label.includes('Username') ? 'var(--mono)' : undefined }}>{row.value}</span>
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
              <div style={{ width: 48, height: 48, borderRadius: 9, background: '#f3efff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="layers" size={22} strokeWidth={1.75} style={{ color: '#6e40c9' } as React.CSSProperties} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Enterprise Plan</div>
                <StatusBadge status="Active" />
              </div>
            </div>
            {[
              ['Subscribed', '01 Jun 2024'],
              ['Renews', '01 Jul 2026'],
              ['Seats', 'Unlimited'],
              ['Storage', '500 GB'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Company Logo" />
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: 9, background: 'var(--bg)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Icon name="building" size={28} strokeWidth={1.5} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
            </div>
            <Btn label="Upload Logo" icon="upload" />
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>PNG or SVG, max 2 MB</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Billing ─────────────────────────────────────────────────────────────

function BillingTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Current plan + next payment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <Card>
          <CardHead title="Current Subscription" sub="Your active plan and renewal details." right={<Btn label="Change Plan" icon="layers" />} />
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 9, background: '#f3efff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="layers" size={22} strokeWidth={1.75} style={{ color: '#6e40c9' } as React.CSSProperties} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>Enterprise Plan</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>Unlimited access · Priority support · 99.9% SLA</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#6e40c9' }}>$5,999</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>per year</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Renewal',      value: '01 Jul 2026',  icon: 'calendar' as IconName },
                { label: 'Start Date',   value: '01 Jun 2024',  icon: 'clock'    as IconName },
                { label: 'Next Payment', value: '$5,999',       icon: 'creditCard' as IconName },
                { label: 'Status',       value: 'Active',       icon: 'check'    as IconName, green: true },
              ].map(item => (
                <div key={item.label} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <Icon name={item.icon} size={12} strokeWidth={2} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: (item as any).green ? '#15803d' : 'var(--ink)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ flex: 1, padding: '9px 0', border: '1.5px solid #6e40c9', borderRadius: 9, background: '#f3efff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#6e40c9', fontFamily: 'var(--font)' }}>View Invoice</button>
              <button style={{ padding: '9px 18px', border: '1.5px solid var(--border)', borderRadius: 9, background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--red)', fontFamily: 'var(--font)' }}>Cancel Subscription</button>
            </div>
          </div>
        </Card>

        {/* Billing summary */}
        <Card>
          <CardHead title="Billing Summary" />
          <div style={{ padding: '16px 20px' }}>
            {[
              ['Amount Due', '$5,999.00'],
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
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{row.desc}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{row.issued}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{row.due}</td>
                <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{row.amount}</td>
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

function PaymentsTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Payment methods */}
        <Card>
          <CardHead title="Payment Methods" sub="Manage cards and accounts used for billing." right={<Btn label="Add Method" icon="plus" variant="primary" />} />
          <div style={{ padding: '0 20px 8px' }}>
            {[
              { type: 'Visa',    last4: '9484', expiry: '08 / 2028', holder: 'DANGOTE CLEARING LTD', primary: true  },
              { type: 'PayPal',  last4: '',     expiry: '',           holder: 'billing@dangote.co.tz',primary: false },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 52, height: 36, borderRadius: 6, background: m.primary ? '#1a3260' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="creditCard" size={18} strokeWidth={1.75} style={{ color: m.primary ? '#fff' : 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {m.type}{m.last4 ? ` •••• ${m.last4}` : ''}
                    {m.primary && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: '#dcfce7', color: '#16a34a', fontSize: 10, fontWeight: 700 }}>Default</span>}
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
                    {s.current && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: '#dcfce7', color: '#16a34a', fontSize: 10, fontWeight: 700 }}>This device</span>}
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
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', border: '4px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 800, color: '#16a34a' }}>74</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>Good</div>
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

function PlansTab() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const currentPlan: PlanKey = 'enterprise';
  const plan = PLANS[currentPlan];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>Choose Your Plan</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>All plans include a 14-day free trial. Cancel anytime.</div>
        </div>
        <div style={{ display: 'flex', background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 9, padding: '4px 6px', gap: 4 }}>
          {(['monthly', 'yearly'] as const).map(b => (
            <button key={b} onClick={() => setBilling(b)} style={{ padding: '6px 18px', border: 'none', borderRadius: 7, background: billing === b ? 'var(--navy)' : 'transparent', color: billing === b ? '#fff' : 'var(--ink3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              {b.charAt(0).toUpperCase() + b.slice(1)}
              {b === 'yearly' && billing === 'monthly' && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 9, background: '#dcfce7', color: '#16a34a', fontSize: 10, fontWeight: 700 }}>–17%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Feature comparison table */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 160px)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '16px 20px' }} />
          {(['starter', 'professional', 'enterprise'] as PlanKey[]).map(k => {
            const p = PLANS[k]; const price = billing === 'yearly' ? p.yearly : p.monthly;
            const isCur = k === currentPlan;
            return (
              <div key={k} style={{ padding: '16px 14px', textAlign: 'center', borderLeft: '1px solid var(--border)', background: isCur ? p.bg : 'var(--white)' }}>
                {p.badge && <div style={{ fontSize: 10, fontWeight: 700, color: p.color, marginBottom: 4 }}>{p.badge}</div>}
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: p.color }}>
                  ${price.toLocaleString()}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink3)' }}>/{billing === 'yearly' ? 'yr' : 'mo'}</span>
                </div>
                {isCur ? (
                  <div style={{ marginTop: 8, padding: '5px 0', background: p.bg, color: p.color, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Current Plan</div>
                ) : (
                  <button style={{ marginTop: 8, width: '100%', padding: '7px 0', border: `1.5px solid ${p.color}`, borderRadius: 7, background: 'transparent', color: p.color, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Select</button>
                )}
              </div>
            );
          })}
        </div>
        {[
          ['Shipments / month', '50', '300', 'Unlimited'],
          ['User accounts', '2', '10', 'Unlimited'],
          ['Document storage', '5 GB', '50 GB', '500 GB'],
          ['TANCIS integration', '✓', '✓', '✓'],
          ['TANESW integration', '—', '✓', '✓'],
          ['WhatsApp Bot', '—', '✓', '✓'],
          ['API access', '—', '—', '✓'],
          ['Custom branding', '—', '—', '✓'],
          ['Dedicated manager', '—', '—', '✓'],
          ['SLA uptime', '99%', '99.5%', '99.9%'],
        ].map(([feat, ...vals]) => (
          <div key={feat} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 160px)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '11px 20px', fontSize: 13, color: 'var(--ink2)' }}>{feat}</div>
            {vals.map((v, i) => (
              <div key={i} style={{ padding: '11px 14px', textAlign: 'center', borderLeft: '1px solid var(--border)', fontSize: 13, color: v === '—' ? 'var(--ink3)' : '#16a34a', fontWeight: v === '—' ? 400 : 600 }}>{v}</div>
            ))}
          </div>
        ))}
      </Card>

      {/* Current plan features */}
      <Card>
        <CardHead title={`Your ${plan.name} Plan Includes`} sub="All features available under your current subscription." />
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {plan.features.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
              <Icon name="check" size={13} strokeWidth={2.5} style={{ color: '#6e40c9', flexShrink: 0, marginTop: 1 } as React.CSSProperties} />
              {f}
            </div>
          ))}
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
        sub="Enable or disable modules for your ClearOS installation. Changes take effect immediately."
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
                <select className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%' }}>
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>
              </FormRow>
              <FormRow label="Module">
                <select className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%' }}>
                  {MODULES.map(m => <option key={m.id}>{m.name}</option>)}
                </select>
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
              { icon: 'mail'       as IconName, label: 'Email Support',     sub: 'support@clearos.co.tz',        color: 'var(--teal)' },
              { icon: 'chatBubble' as IconName, label: 'WhatsApp Chat',     sub: '+255 800 123 456',              color: '#16a34a' },
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
  const navigate  = useNavigate();
  const [tab, setTab] = useState<SubTab>('company');

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* ── Hero header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0f2942 0%, #1a4f8a 100%)', padding: '24px 28px 0', position: 'relative', overflow: 'hidden' }}>
        {/* decorative circles */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, right: 100, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.025)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            {/* breadcrumb */}
            <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 10, padding: 0, fontFamily: 'var(--font)' }}>
              <Icon name="chevronLeft" size={13} strokeWidth={2} /> Ops Command
            </button>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Subscription & Account</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Dangote Clearing & Forwarding Ltd — Enterprise Plan</div>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <div style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} /> ACTIVE
            </div>
            <div style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>
              EXP: 01 Jul 2026
            </div>
          </div>
        </div>

        {/* Tab bar inside hero */}
        <div style={{ display: 'flex', gap: 2 }}>
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
      <div style={{ padding: '24px 28px' }}>
        {tab === 'company'  && <CompanyInfoTab />}
        {tab === 'billing'  && <BillingTab    />}
        {tab === 'payments' && <PaymentsTab   />}
        {tab === 'security' && <SecurityTab   />}
        {tab === 'plans'    && <PlansTab      />}
        {tab === 'modules'  && <ModulesTab    />}
        {tab === 'reports'  && <ReportsTab    />}
        {tab === 'support'  && <SupportTab    />}
      </div>
    </div>
  );
};
