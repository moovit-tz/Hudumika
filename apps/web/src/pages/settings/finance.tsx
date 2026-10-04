import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { IconName } from '../../components/Icon.js';
import { getCompany, setCompany } from '../../data/companyStore.js';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { MetricsRow } from '../../components/MetricCard.js';
import type { MetricCardProps } from '../../components/MetricCard.js';
import { refreshTenantLocale } from '../../lib/tenantLocale.js';
import { pushTenantBranding, useBranding } from '../../hooks/useBranding.js';
import { useLocale } from '../../hooks/useLocale.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { Badge } from '../../components/ui/badge.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeatureToggleRow } from '../../components/ui/list-item-row.js';
import { SectionCard } from '../../components/SectionCard.js';
import { EntityPicker } from '../../components/EntityPicker.js';
import { Button } from '../../components/ui/button.js';
import { Switch } from '../../components/ui/switch.js';
import { LauncherAppSvg, LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { SignaturePad } from '../../components/SignaturePad.js';
import { showAlert } from '../../lib/alert.js';
import { UpgradeNotice } from '../../components/UpgradeNotice.js';
import { showConfirm } from '../../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../../hooks/useEntitlements.js';
import { useAuth } from '../../hooks/useAuth.js';
import { APP_META } from '../Utilities.js';
import { AI_PROVIDERS } from '../../lib/aiProviders.js';
import { SettingsCtx, Toggle, Field, ToggleRow, Card, SaveRow, useFields, useSettingsFields } from './shared.js';

export const FinanceGeneralSection: React.FC = () => {
  const co = getCompany();
  const [f, set] = useFields({
    currency: co.currency ?? 'TZS',
    fiscalMonth: String(co.fiscalMonth ?? 1),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setCompany({ currency: f.currency, fiscalMonth: parseInt(f.fiscalMonth, 10) || 1 });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      <Card title="Currency & Fiscal Year">
        <Field label="Default Currency" hint="Applied to all new bills, expenses, and invoices">
          <Select value={f.currency} onValueChange={v => set('currency', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['TZS','TZS — Tanzanian Shilling'],['USD','USD — US Dollar'],['EUR','EUR — Euro'],['GBP','GBP — British Pound'],['KES','KES — Kenyan Shilling'],['UGX','UGX — Ugandan Shilling'],['ZAR','ZAR — South African Rand'],['AED','AED — UAE Dirham']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fiscal Year Start Month">
          <Select value={f.fiscalMonth} onValueChange={v => set('fiscalMonth', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Card>
      <SaveRow onSave={handleSave} saving={saving} saved={saved} />
    </>
  );
};

/**
 * Used to also carry Default Due Days, a Content & Appearance card (Show
 * Logo / Terms & Conditions / Footer Note) and a Payments card (Allow
 * Partial Payments / Payment Instructions) — all saved to a generic
 * `invoices` settings key with zero readers anywhere in the platform
 * (grepped both apps/api and apps/web). FinOps's real Billing.tsx invoice
 * screen never consulted any of them; it has its own separate hardcoded
 * defaults (a 14-day terms string, always-on logo) — so "Terms &
 * Conditions" here was a second, dead, drifted copy of a decision FinOps
 * had already made elsewhere, not a real setting. Only Numbering survives:
 * it is genuinely backed by /v1/settings/numbering/invoice, the same
 * counter invoices.routes.ts uses when actually issuing a number.
 */
export const InvoicesSection: React.FC = () => {
  const [prefix, setPrefix] = useState('INV-');
  const [pad, setPad] = useState('4');
  const [nextInv, setNextInv] = useState('1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/v1/settings/numbering/invoice')
      .then((d: any) => { setPrefix(d.prefix ?? 'INV-'); setPad(String(d.pad_length ?? 4)); setNextInv(String(d.next_number ?? 1)); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const num = await apiFetch('/v1/settings/numbering/invoice', {
        method: 'PATCH',
        body: JSON.stringify({ prefix, pad_length: Number(pad), next_number: Number(nextInv) }),
      });
      setPrefix(num.prefix); setPad(String(num.pad_length)); setNextInv(String(num.next_number));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Numbering" desc="Backed by the real invoice number counter used by ClearOS/FinOps when issuing invoices.">
        <Field label="Prefix" hint="e.g. INV-0001"><input className="input-field" value={prefix} onChange={e => setPrefix(e.target.value)} /></Field>
        <Field label="Number Padding">
          <Select value={pad} onValueChange={setPad}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 digits (001)</SelectItem>
              <SelectItem value="4">4 digits (0001)</SelectItem>
              <SelectItem value="5">5 digits (00001)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Next Invoice #" hint="Starting number for the next auto-generated invoice"><input className="input-field" type="number" placeholder="1" value={nextInv} onChange={e => setNextInv(e.target.value)} /></Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Quotations -----------------------------------------------------
export const QuotationsSection: React.FC = () => {
  // prefix/nextEst are backed by the real quotation counter (GET/PATCH
  // /v1/settings/numbering/quotation) — the only genuinely live part of this
  // section. validity/terms/footer/logo/notif used to live here too, saved
  // to settings.quotations, which nothing on the backend ever read — a form
  // that looked exactly as functional as the fields beside it but silently
  // did nothing when submitted. Removed rather than left to keep collecting
  // input no one downstream sees.
  const [prefix, setPrefix] = useState('QT-');
  const [nextEst, setNextEst] = useState('1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/v1/settings/numbering/quotation')
      .then((d: any) => { setPrefix(d.prefix ?? 'QT-'); setNextEst(String(d.next_number ?? 1)); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const num = await apiFetch('/v1/settings/numbering/quotation', {
        method: 'PATCH',
        body: JSON.stringify({ prefix, next_number: Number(nextEst) }),
      });
      setPrefix(num.prefix); setNextEst(String(num.next_number));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Quotation Format" desc="Numbering is backed by the real quotation counter used when converting/issuing quotes.">
        <Field label="Quote Prefix" hint="e.g. QT-0001"><input className="input-field" value={prefix} onChange={e => setPrefix(e.target.value)} /></Field>
        <Field label="Next Estimate #" hint="Starting number for the next auto-generated quote"><input className="input-field" type="number" placeholder="1" value={nextEst} onChange={e => setNextEst(e.target.value)} /></Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Purchase Orders ------------------------------------------------
export const PurchaseOrdersSection: React.FC = () => {
  // prefix is backed by the real numbering counter (GET/PATCH
  // /v1/settings/numbering/purchase_order) — the only genuinely live part of
  // this section. autoNo/approval/threshold used to live here too, saved to
  // settings['purchase-orders'], which nothing on the backend ever read —
  // an "approval required above this amount" control that never actually
  // gated anything. Removed rather than left implying an approval flow
  // exists.
  const [prefix, setPrefix] = useState('PO-');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/v1/settings/numbering/purchase_order')
      .then((d: any) => { setPrefix(d.prefix ?? 'PO-'); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const num = await apiFetch('/v1/settings/numbering/purchase_order', { method: 'PATCH', body: JSON.stringify({ prefix }) });
      setPrefix(num.prefix);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Purchase Order Settings" desc="Prefix is backed by the real PO counter used when issuing purchase orders.">
        <Field label="PO Number Prefix"><input className="input-field" value={prefix} onChange={e => setPrefix(e.target.value)} /></Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Payment Gateways -----------------------------------------------

export type GWField = { key: string; label: string; type?: string; placeholder?: string; hint?: string };

export interface GatewayDef {
  id:      string;
  name:    string;
  desc:    string;
  color:   string;
  bg:      string;
  abbr:    string;       // 2-4 char logo text
  region:  string;
  sandbox: boolean;      // has sandbox toggle
  fields:  GWField[];
}

export const GATEWAYS: GatewayDef[] = [
  // -- International ------------------------------------------
  {
    id: 'stripe', name: 'Stripe', desc: 'Global card payments, subscriptions & invoicing.',
    color: '#6772e5', bg: '#f0f0fd', abbr: 'S', region: 'International', sandbox: false,
    fields: [
      { key: 'pub',     label: 'Publishable Key',  placeholder: 'pk_live_…' },
      { key: 'sec',     label: 'Secret Key',        placeholder: 'sk_live_…', type: 'password' },
      { key: 'webhook', label: 'Webhook Secret',    placeholder: 'whsec_…',   type: 'password', hint: 'From Stripe Dashboard → Webhooks' },
    ],
  },
  {
    id: 'paypal', name: 'PayPal', desc: 'Accept PayPal balance, cards and Pay Later.',
    color: '#003087', bg: '#e8f0fb', abbr: 'PP', region: 'International', sandbox: true,
    fields: [
      { key: 'clientId',  label: 'Client ID'     },
      { key: 'secret',    label: 'Client Secret', type: 'password' },
    ],
  },
  {
    id: 'braintree', name: 'Braintree', desc: 'PayPal-owned gateway: cards, PayPal, Venmo.',
    color: '#1f9ee0', bg: '#e6f5fd', abbr: 'BT', region: 'International', sandbox: true,
    fields: [
      { key: 'merchantId', label: 'Merchant ID'   },
      { key: 'publicKey',  label: 'Public Key'    },
      { key: 'privateKey', label: 'Private Key',  type: 'password' },
    ],
  },
  {
    id: 'square', name: 'Square', desc: 'In-person and online card processing.',
    color: '#111', bg: '#f0f0f0', abbr: 'SQ', region: 'International', sandbox: true,
    fields: [
      { key: 'appId',       label: 'Application ID'  },
      { key: 'accessToken', label: 'Access Token',    type: 'password' },
      { key: 'locationId',  label: 'Location ID'     },
    ],
  },
  {
    id: 'authorize', name: 'Authorize.net', desc: 'Reliable US card gateway · AIM / SIM APIs.',
    color: '#c8102e', bg: '#fdecea', abbr: 'AN', region: 'International', sandbox: true,
    fields: [
      { key: 'apiLogin',  label: 'API Login ID'  },
      { key: 'transKey',  label: 'Transaction Key', type: 'password' },
    ],
  },
  {
    id: 'razorpay', name: 'Razorpay', desc: 'Payments gateway popular in India & emerging markets.',
    color: '#3395ff', bg: '#e8f3ff', abbr: 'RZ', region: 'International', sandbox: true,
    fields: [
      { key: 'keyId',     label: 'Key ID'    },
      { key: 'keySecret', label: 'Key Secret', type: 'password' },
    ],
  },

  // -- Pan-Africa ---------------------------------------------
  {
    id: 'flutterwave', name: 'Flutterwave', desc: 'Pan-African gateway: cards, mobile money, bank.',
    color: '#f5a623', bg: '#fef9ed', abbr: 'FW', region: 'Pan-Africa', sandbox: true,
    fields: [
      { key: 'publicKey',  label: 'Public Key'   },
      { key: 'secretKey',  label: 'Secret Key',   type: 'password' },
      { key: 'encKey',     label: 'Encryption Key', type: 'password' },
    ],
  },
  {
    id: 'paystack', name: 'Paystack', desc: 'Stripe-backed gateway for Africa · cards & USSD.',
    color: '#00c3f7', bg: '#e6faff', abbr: 'PS', region: 'Pan-Africa', sandbox: true,
    fields: [
      { key: 'publicKey',  label: 'Public Key'  },
      { key: 'secretKey',  label: 'Secret Key',  type: 'password' },
    ],
  },

  // -- East Africa (Mobile Money) -----------------------------
  {
    id: 'mpesa', name: 'M-Pesa (Safaricom)', desc: 'Kenya & Tanzania M-Pesa STK Push & B2C.',
    color: '#00a651', bg: '#e6f7ed', abbr: 'MP', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'consumerKey',    label: 'Consumer Key'   },
      { key: 'consumerSecret', label: 'Consumer Secret', type: 'password' },
      { key: 'shortcode',      label: 'Business Shortcode / Paybill' },
      { key: 'passkey',        label: 'Lipa na M-Pesa Passkey', type: 'password' },
      { key: 'initiatorName',  label: 'Initiator Name', hint: 'API operator username (B2C only)' },
      { key: 'secCredential',  label: 'Security Credential', type: 'password', hint: 'Encrypted (B2C only)' },
    ],
  },
  {
    id: 'vodacom', name: 'Vodacom M-Pesa (TZ)', desc: 'Tanzania-specific Vodacom M-Pesa integration.',
    color: '#e60000', bg: '#fdecea', abbr: 'VM', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'apiKey',     label: 'API Key'      },
      { key: 'publicKey',  label: 'Public Key'   },
      { key: 'serviceId',  label: 'Service ID'   },
    ],
  },
  {
    id: 'tigopesa', name: 'Tigo Pesa', desc: 'Miitel / MIC Tanzania mobile money push & pull.',
    color: '#0072bc', bg: '#e6f1fb', abbr: 'TP', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'username',   label: 'Username / API User' },
      { key: 'password',   label: 'Password',  type: 'password' },
      { key: 'billerCode', label: 'Biller Code' },
      { key: 'accountRef', label: 'Account Reference' },
    ],
  },
  {
    id: 'airtel', name: 'Airtel Money', desc: 'Airtel Africa mobile money · TZ, KE, UG, RW.',
    color: '#e40000', bg: '#fdecea', abbr: 'AM', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'clientId',     label: 'Client ID'   },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
      { key: 'country',      label: 'Country Code', placeholder: 'TZ, KE, UG, RW…' },
      { key: 'currency',     label: 'Currency',     placeholder: 'TZS, KES, UGX…' },
    ],
  },
  {
    id: 'selcom', name: 'Selcom', desc: 'Tanzania payment aggregator · USSD, cards & wallets.',
    color: 'var(--blue)', bg: 'var(--blue-l)', abbr: 'SC', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'apiKey',    label: 'API Key'   },
      { key: 'apiSecret', label: 'API Secret', type: 'password' },
      { key: 'vendor',    label: 'Vendor ID'  },
    ],
  },
  {
    id: 'halotel', name: 'Halotel (HaloPesa)', desc: 'Viettel Tanzania mobile money integration.',
    color: '#7c3aed', bg: 'var(--purple-l)', abbr: 'HP', region: 'East Africa', sandbox: false,
    fields: [
      { key: 'merchantId', label: 'Merchant ID'  },
      { key: 'apiKey',     label: 'API Key',       type: 'password' },
      { key: 'accountNo',  label: 'Account Number' },
    ],
  },

  // -- Bank & Manual ------------------------------------------
  {
    id: 'bank', name: 'Bank Transfer', desc: 'Manual bank transfers · CRDB, NMB, NBC and others.',
    color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted))', abbr: 'BK', region: 'Bank / Manual', sandbox: false,
    fields: [
      { key: 'bankName',   label: 'Bank Name',         placeholder: 'e.g. CRDB Bank' },
      { key: 'accountNo',  label: 'Account Number',    placeholder: 'e.g. 0150614123600' },
      { key: 'accountName',label: 'Account Name'      },
      { key: 'branch',     label: 'Branch'             },
      { key: 'swiftCode',  label: 'SWIFT / BIC Code',  placeholder: 'e.g. CORUTZTZ' },
      { key: 'instructions',label: 'Payment Instructions', hint: 'Shown on invoices & checkout' },
    ],
  },
];

export const REGIONS = ['International', 'Pan-Africa', 'East Africa', 'Bank / Manual'] as const;

export const PaymentGatewaysSection: React.FC = () => {
  // enabled state + field values per gateway
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [sandbox, setSandbox] = useState<Record<string, boolean>>(
    Object.fromEntries(GATEWAYS.filter(g => g.sandbox).map(g => [g.id, true]))
  );
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    Object.fromEntries(GATEWAYS.map(g => [g.id, Object.fromEntries(g.fields.map(f => [f.key, '']))]))
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const { s, save } = useContext(SettingsCtx);
  const hydrated = useRef(false);

  // Rehydrate from whichever save path last wrote this gateway's data: the
  // per-gateway "Save" button writes a top-level `gw-<id>` key directly on
  // the settings blob, while the bulk "Save All Changes" button nests all
  // enabled gateways under `payment-gateways`. Check the top-level key first.
  useEffect(() => {
    if (hydrated.current) return;
    if (Object.keys(s).length === 0) return;
    const nextEnabled: Record<string, boolean> = {};
    const nextSandbox: Record<string, boolean> = { ...sandbox };
    const nextValues: Record<string, Record<string, string>> = { ...values };
    for (const gw of GATEWAYS) {
      const data = s[`gw-${gw.id}`] ?? s['payment-gateways']?.[`gw-${gw.id}`];
      if (data) {
        nextEnabled[gw.id] = true;
        if (typeof data.sandbox === 'boolean') nextSandbox[gw.id] = data.sandbox;
        nextValues[gw.id] = { ...nextValues[gw.id], ...data };
      }
    }
    setEnabled(e => ({ ...e, ...nextEnabled }));
    setSandbox(nextSandbox);
    setValues(nextValues);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  function setVal(gid: string, key: string, val: string) {
    setValues(v => ({ ...v, [gid]: { ...v[gid], [key]: val } }));
  }

  function toggleEnabled(gid: string, v: boolean) {
    setEnabled(e => ({ ...e, [gid]: v }));
    if (v) setExpanded(ex => ({ ...ex, [gid]: true }));
  }

  async function testGateway(gw: GatewayDef) {
    setTesting(gw.id);
    try {
      const res = await apiFetch(`/v1/settings/payment-gateways/${gw.id}/test`, { method: 'POST', body: JSON.stringify(values[gw.id] ?? {}) });
      setTestResults(r => ({ ...r, [gw.id]: { ok: true, message: res.message || 'Connected.' } }));
    } catch (err: any) {
      setTestResults(r => ({ ...r, [gw.id]: { ok: false, message: err?.message || 'Test failed.' } }));
    } finally {
      setTesting(null);
    }
  }

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div>
      {/* -- Header summary -- */}
      <div className="s-gw-hdr">
        <div className="s-gw-count">
          {enabledCount} of {GATEWAYS.length} gateways active · customers will see enabled gateways at checkout.
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={async () => {
          setSaving(true);
          // Every top-level `gw-<id>` key directly, the exact same shape the
          // per-gateway "Save" button and lib/payment-gateway.ts's own
          // getActiveGateway()/getConfiguredGateways() already read — this
          // used to nest everything under one `payment-gateways` key
          // instead, which neither of those ever looked at, so a tenant who
          // configured gateways through this button (rather than one at a
          // time) had checkout silently see none of them. A disabled
          // gateway is sent as `null` (mergeSettings deletes the key) rather
          // than omitted, since a plain PATCH merges and would otherwise
          // leave a previously-enabled gateway's old config in place.
          const payload: Record<string, any> = {};
          for (const gw of GATEWAYS) {
            payload[`gw-${gw.id}`] = enabled[gw.id] ? { enabled: true, sandbox: !!sandbox[gw.id], ...values[gw.id] } : null;
          }
          try { await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify(payload) }); } catch {}
          setSaving(false);
        }}>
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>

      {REGIONS.map(region => {
        const gws = GATEWAYS.filter(g => g.region === region);
        return (
          <div key={region} className="s-gw-region">
            <div className="s-gw-rlbl">{region}</div>
            <div className="s-gw-grid">
              {gws.map(gw => {
                const on     = !!enabled[gw.id];
                const isOpen = !!expanded[gw.id];
                const sbx    = !!sandbox[gw.id];
                return (
                  <div key={gw.id}
                    className={`s-gw-card${on ? ' s-gw-card--on' : ''}`}
                    style={{ '--gw-c': gw.color, '--gw-bg': gw.bg } as React.CSSProperties}>
                    {/* Card header */}
                    <div className={`s-gw-chdr${isOpen ? ' s-gw-chdr--sep' : ''}${on ? ' s-gw-chdr--on' : ''}`}>
                      {/* Logo badge */}
                      <div className="s-gw-badge" style={{ background: gw.color }}>
                        <span className={`s-gw-babbr${gw.abbr.length > 2 ? ' s-gw-babbr--sm' : ''}`}>{gw.abbr}</span>
                      </div>
                      {/* Name + desc */}
                      <div className="s-gw-info">
                        <div className="s-gw-name">
                          {gw.name}
                          {on && gw.sandbox && (
                            <span className={`s-gw-pill${sbx ? ' s-gw-pill--sbx' : ' s-gw-pill--live'}`}>
                              {sbx ? 'SANDBOX' : 'LIVE'}
                            </span>
                          )}
                        </div>
                        <div className="s-gw-gdesc">{gw.desc}</div>
                      </div>
                      {/* Toggle + expand */}
                      <div className="s-gw-ctrls">
                        <Toggle value={on} onChange={v => toggleEnabled(gw.id, v)} />
                        {on && (
                          <button
                            type="button"
                            title={isOpen ? 'Collapse' : 'Configure'}
                            onClick={() => setExpanded(ex => ({ ...ex, [gw.id]: !ex[gw.id] }))}
                            className="s-gw-exp-btn"
                          >
                            <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={14} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable config */}
                    {on && isOpen && (
                      <div className="s-gw-body">
                        {/* Sandbox toggle */}
                        {gw.sandbox && (
                          <div className={`s-gw-mode${sbx ? ' s-gw-mode--sbx' : ' s-gw-mode--live'}`}>
                            <div>
                              <div className={`s-gw-mode-lbl${sbx ? ' s-gw-mode-lbl--sbx' : ' s-gw-mode-lbl--live'}`}>
                                {sbx ? '? Sandbox / Test Mode' : '? Live Mode'}
                              </div>
                              <div className={`s-gw-mode-sub${sbx ? ' s-gw-mode-sub--sbx' : ' s-gw-mode-sub--live'}`}>
                                {sbx ? 'No real money · use test credentials' : 'Real transactions will be processed'}
                              </div>
                            </div>
                            <Toggle value={sbx} onChange={v => setSandbox(s => ({ ...s, [gw.id]: v }))} />
                          </div>
                        )}
                        {/* Fields */}
                        <div className={`s-gw-fields${gw.fields.length > 3 ? ' s-gw-fields--2' : ''}`}>
                          {gw.fields.map(f => (
                            <div key={f.key} className={f.key === 'instructions' || f.key === 'webhook' ? 's-gw-fspan' : undefined}>
                              <label className="s-gw-flbl">{f.label}</label>
                              {f.key === 'instructions' ? (
                                <textarea
                                  className="input-field s-fw s-resize-n s-fs-sm"
                                  rows={2}
                                  placeholder={f.placeholder}
                                  value={values[gw.id][f.key]}
                                  onChange={e => setVal(gw.id, f.key, e.target.value)}
                                />
                              ) : (
                                <input
                                  className="input-field s-fw s-fs-sm"
                                  type={f.type ?? 'text'}
                                  placeholder={f.placeholder ?? ''}
                                  value={values[gw.id][f.key]}
                                  onChange={e => setVal(gw.id, f.key, e.target.value)}
                                />
                              )}
                              {f.hint && <div className="s-gw-fhint">{f.hint}</div>}
                            </div>
                          ))}
                        </div>
                        {/* Actions */}
                        <div className="s-gw-foot">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => save(`gw-${gw.id}`, { enabled: true, sandbox: sbx, ...values[gw.id] }).catch(() => {})}>Save</button>
                          <button type="button" className="btn btn-secondary btn-sm" disabled={testing === gw.id} onClick={() => testGateway(gw)}>
                            {testing === gw.id ? 'Testing…' : 'Test Connection'}
                          </button>
                          {testResults[gw.id] && (
                            <span style={{ fontSize: 11.5, marginLeft: 8, fontWeight: 600, color: testResults[gw.id].ok ? 'var(--green)' : 'var(--red)' }}>
                              {testResults[gw.id].message}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// -- section: Expenses Categories --------------------------------------------
// -- section: Google ---------------------------------------------------------
/**
 * Used to also carry "Google Analytics" (Measurement ID) and "Google Maps"
 * (API key) cards, both saved under this same `int-google` key. Neither had
 * a consumer anywhere — no gtag/GTM injection reads `gaId`, and no map
 * component anywhere in the codebase reads `mapsKey` (there IS a real GA4
 * analytics system, apps/web/src/pages/SeoAnalyticsView.tsx, but it is a
 * platform-level, SuperAdmin-only screen storing to localStorage — a
 * different scope entirely, not this tenant key). OAuth + reCAPTCHA are
 * real: recaptcha.ts reads rcSecret, contacts-sync/google-contacts.ts read
 * oauthId/oauthSecret.
 */
