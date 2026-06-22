import React, { useState, useEffect, createContext, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { getCompany, setCompany } from '../data/companyStore.js';
import { apiFetch } from '../lib/api.js';

// ── Settings API context ───────────────────────────────────────────────────
interface SettingsCtxType { s: Record<string, any>; save: (key: string, data: Record<string, any>) => Promise<void> }
const SettingsCtx = createContext<SettingsCtxType>({ s: {}, save: async () => {} });

// ── nav structure ──────────────────────────────────────────────────────────
const NAV: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  {
    group: 'General',
    items: [
      { key: 'company',      label: 'Company Information' },
      { key: 'localization', label: 'Localization' },
      { key: 'email',        label: 'Email' },
      { key: 'update',       label: 'System Update' },
      { key: 'server',       label: 'System / Server Info' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { key: 'finance-general',     label: 'General' },
      { key: 'payment-gateways',    label: 'Payment Gateways' },
      { key: 'tax-rates',           label: 'Tax Rates' },
      { key: 'currencies',          label: 'Currencies' },
      { key: 'payment-modes',       label: 'Payment Modes' },
      { key: 'einvoice',            label: 'e-Invoice' },
      { key: 'expenses-categories', label: 'Expenses Categories' },
    ],
  },
  {
    group: 'Sales',
    items: [
      { key: 'invoices',        label: 'Invoices' },
      { key: 'quotations',      label: 'Quotations' },
      { key: 'purchase-orders', label: 'Purchase Orders' },
      { key: 'credit-notes',    label: 'Credit Notes' },
      { key: 'subscriptions',   label: 'Subscriptions' },
    ],
  },
  {
    group: 'Configure Features',
    items: [
      { key: 'feat-customers', label: 'Customers' },
      { key: 'feat-tasks',     label: 'Tasks' },
      { key: 'feat-support',   label: 'Support' },
      { key: 'feat-leads',     label: 'Leads' },
    ],
  },
  {
    group: 'Integrations',
    items: [
      { key: 'int-google',  label: 'Google' },
      { key: 'int-pusher',  label: 'Pusher.com' },
      { key: 'int-ai',      label: 'AI Integration' },
      { key: 'int-openai',  label: 'OpenAI' },
      { key: 'int-sms',     label: 'SMS' },
      { key: 'int-general', label: 'General' },
    ],
  },
  {
    group: 'Other',
    items: [
      { key: 'other-calendar', label: 'Calendar' },
      { key: 'other-pdf',      label: 'PDF' },
      { key: 'other-esign',    label: 'E-Sign' },
      { key: 'other-tags',     label: 'Tags' },
    ],
  },
  {
    group: 'Misc',
    items: [
      { key: 'misc-cron',    label: 'Cron Job' },
      { key: 'misc-general', label: 'Misc' },
    ],
  },
];

// ── primitives ─────────────────────────────────────────────────────────────
const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    style={{
      width: 40, height: 22, borderRadius: 9, border: 'none', cursor: 'pointer',
      background: value ? 'var(--teal)' : 'var(--border)',
      position: 'relative', transition: 'background .2s', flexShrink: 0,
    }}
  >
    <span style={{
      position: 'absolute', top: 3, left: value ? 21 : 3,
      width: 16, height: 16, borderRadius: '50%', background: '#fff',
      transition: 'left .2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
    }} />
  </button>
);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; full?: boolean }> = ({ label, hint, children, full }) => (
  <div style={{ gridColumn: full ? '1 / -1' : 'span 1' }}>
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>
      {label}
    </label>
    {children}
    {hint && <p style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4, marginBottom: 0 }}>{hint}</p>}
  </div>
);

const ToggleRow: React.FC<{ label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, hint, value, onChange }) => (
  <div style={{
    gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
    padding: '12px 0', borderBottom: '1px solid var(--border)',
  }}>
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{hint}</div>}
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

const Card: React.FC<{ title: string; desc?: string; children: React.ReactNode; cols?: string }> = ({ title, desc, children, cols = 'repeat(auto-fill, minmax(280px, 1fr))' }) => (
  <div className="card" style={{ marginBottom: 20 }}>
    <div style={{ paddingBottom: 16, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h3>
      {desc && <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>{desc}</p>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '16px 20px' }}>
      {children}
    </div>
  </div>
);

const SaveRow: React.FC<{ extra?: React.ReactNode; onSave?: () => void; saving?: boolean; saved?: boolean }> = ({ extra, onSave, saving, saved }) => (
  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginBottom: 8 }}>
    {saved && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={13} color="var(--green)" /> Saved</span>}
    {extra}
    <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  </div>
);

// ── helpers ─────────────────────────────────────────────────────────────────
function useFields<T extends Record<string, string>>(init: T): [T, (k: keyof T, v: string) => void] {
  const [f, setF] = useState<T>(init);
  const set = (k: keyof T, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return [f, set];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── section: Company ────────────────────────────────────────────────────────
const CompanySection: React.FC = () => {
  const co = getCompany();
  const { save: apiSave } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [f, set] = useFields({
    name: co.name, email: co.email, phone: co.phone,
    website: co.website, vat: co.taxId, address: co.address,
    city: co.city, state: '', zip: '', country: 'TZ', desc: co.tagline,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(co.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(co.faviconUrl);
  const [saved, setSaved] = useState(false);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setLogoUrl(ev.target.result); };
    reader.readAsDataURL(file);
  }

  function handleFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setFaviconUrl(ev.target.result); };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setCompany({ name: f.name, email: f.email, phone: f.phone, website: f.website, taxId: f.vat, address: f.address, city: f.city, tagline: f.desc, logoUrl, faviconUrl });
    try { await apiSave('company', { name: f.name, email: f.email, phone: f.phone, website: f.website, vat: f.vat, address: f.address, city: f.city, state: f.state, zip: f.zip, country: f.country, desc: f.desc, logoUrl, faviconUrl }); } catch {}
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Company Information" desc="Basic details about your business.">
        <Field label="Company Name"><input className="input-field" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="VAT / Tax Number"><input className="input-field" value={f.vat} onChange={e => set('vat', e.target.value)} /></Field>
        <Field label="Email Address"><input className="input-field" type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Phone Number"><input className="input-field" value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Website"><input className="input-field" type="url" value={f.website} onChange={e => set('website', e.target.value)} /></Field>
        <div />
        <Field label="Street Address" full><input className="input-field" value={f.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label="City"><input className="input-field" value={f.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="State / Region"><input className="input-field" value={f.state} onChange={e => set('state', e.target.value)} /></Field>
        <Field label="ZIP / Postal Code"><input className="input-field" value={f.zip} onChange={e => set('zip', e.target.value)} /></Field>
        <Field label="Country">
          <select className="input-field" value={f.country} onChange={e => set('country', e.target.value)}>
            {[['TZ','Tanzania'],['KE','Kenya'],['UG','Uganda'],['RW','Rwanda'],['ZA','South Africa'],['NG','Nigeria'],['GH','Ghana'],['US','United States'],['GB','United Kingdom'],['DE','Germany'],['AE','UAE'],['IN','India'],['CN','China']].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Company Description" full>
          <textarea className="input-field" rows={3} value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Short description of your company…" style={{ resize: 'vertical' }} />
        </Field>
      </Card>
      <Card title="Branding" desc="Company logo and favicon displayed in PDFs and the portal.">
        <Field label="Company Logo" hint="Recommended: 400×100px PNG or SVG" full>
          <label style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px', border: `2px dashed ${logoUrl ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 9, background: logoUrl ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer' }}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo preview" style={{ height: 40, maxWidth: 120, objectFit: 'contain', borderRadius: 4 }} />
              : <div style={{ width: 80, height: 32, borderRadius: 4, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--ink3)', fontWeight: 700 }}>LOGO</div>
            }
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: logoUrl ? 'var(--teal)' : 'var(--ink)' }}>{logoUrl ? 'Logo uploaded — click to change' : 'Click to upload logo'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>PNG, SVG or JPG — max 2 MB</div>
            </div>
            {logoUrl && (
              <button type="button" title="Remove logo" onClick={e => { e.preventDefault(); setLogoUrl(null); }}
                style={{ marginLeft: 'auto', background: '#fee2e2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}>
                <Icon name="x" size={13} color="#dc2626" />
              </button>
            )}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
          </label>
        </Field>
        {co.logoHistory.length > 0 && (
          <Field label="Previous Logos" hint="Click to restore" full>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {co.logoHistory.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  title={`Restore logo ${i + 1}`}
                  onClick={() => setLogoUrl(src)}
                  style={{ padding: 6, border: `2px solid ${logoUrl === src ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 9, background: logoUrl === src ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <img src={src} alt={`Previous logo ${i + 1}`} style={{ height: 32, maxWidth: 100, objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Favicon" hint="512×512px · PNG, JPG, SVG or ICO">
          <label style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: `2px dashed ${faviconUrl ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 9, background: faviconUrl ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer' }}>
            {faviconUrl
              ? <img src={faviconUrl} alt="Favicon preview" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />
              : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--ink3)', fontWeight: 700 }}>ICO</div>
            }
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: faviconUrl ? 'var(--teal)' : 'var(--ink)' }}>{faviconUrl ? 'Favicon uploaded — click to change' : 'Upload favicon'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>512×512px · PNG, JPG, SVG or ICO</div>
            </div>
            {faviconUrl && (
              <button type="button" title="Remove favicon" onClick={e => { e.preventDefault(); setFaviconUrl(null); }}
                style={{ marginLeft: 'auto', background: '#fee2e2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}>
                <Icon name="x" size={13} color="#dc2626" />
              </button>
            )}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.svg,.ico" style={{ display: 'none' }} onChange={handleFaviconChange} />
          </label>
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Localization ───────────────────────────────────────────────────
const LocalizationSection: React.FC = () => {
  const [f, set] = useFields({ lang: 'en', tz: 'Africa/Dar_es_Salaam', date: 'DD/MM/YYYY', time: '24', week: '1', currency: 'TZS', currPos: 'before', decimals: '2', decSep: '.', thouSep: ',' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('localization', { ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Language & Region">
        <Field label="Default Language">
          <select className="input-field" value={f.lang} onChange={e => set('lang', e.target.value)}>
            {[['en','English'],['sw','Swahili'],['fr','French'],['ar','Arabic'],['pt','Portuguese']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Timezone">
          <select className="input-field" value={f.tz} onChange={e => set('tz', e.target.value)}>
            {[['Africa/Dar_es_Salaam','Africa/Dar es Salaam (EAT +3)'],['Africa/Nairobi','Africa/Nairobi (EAT +3)'],['Africa/Kampala','Africa/Kampala (EAT +3)'],['Africa/Johannesburg','Africa/Johannesburg (SAST +2)'],['Africa/Lagos','Africa/Lagos (WAT +1)'],['Europe/London','Europe/London (GMT)'],['Europe/Paris','Europe/Paris (CET +1)'],['Asia/Dubai','Asia/Dubai (GST +4)'],['America/New_York','America/New York (EST -5)'],['UTC','UTC']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Week Start Day">
          <select className="input-field" value={f.week} onChange={e => set('week', e.target.value)}>
            <option value="0">Sunday</option><option value="1">Monday</option><option value="6">Saturday</option>
          </select>
        </Field>
      </Card>
      <Card title="Date & Time">
        <Field label="Date Format">
          <select className="input-field" value={f.date} onChange={e => set('date', e.target.value)}>
            <option value="DD/MM/YYYY">31/12/2024</option>
            <option value="MM/DD/YYYY">12/31/2024</option>
            <option value="YYYY-MM-DD">2024-12-31</option>
            <option value="D MMM YYYY">31 Dec 2024</option>
            <option value="MMM D, YYYY">Dec 31, 2024</option>
          </select>
        </Field>
        <Field label="Time Format">
          <select className="input-field" value={f.time} onChange={e => set('time', e.target.value)}>
            <option value="24">24-hour (14:30)</option>
            <option value="12">12-hour (2:30 PM)</option>
          </select>
        </Field>
      </Card>
      <Card title="Number & Currency">
        <Field label="Default Currency">
          <select className="input-field" value={f.currency} onChange={e => set('currency', e.target.value)}>
            {[['TZS','TZS — Tanzanian Shilling'],['USD','USD — US Dollar'],['EUR','EUR — Euro'],['GBP','GBP — British Pound'],['KES','KES — Kenyan Shilling'],['UGX','UGX — Ugandan Shilling'],['ZAR','ZAR — South African Rand'],['AED','AED — UAE Dirham'],['CNY','CNY — Chinese Yuan']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Currency Position">
          <select className="input-field" value={f.currPos} onChange={e => set('currPos', e.target.value)}>
            <option value="before">Before amount ($ 1,000)</option>
            <option value="after">After amount (1,000 $)</option>
          </select>
        </Field>
        <Field label="Decimal Separator">
          <select className="input-field" value={f.decSep} onChange={e => set('decSep', e.target.value)}>
            <option value=".">Period · 1,000.00</option>
            <option value=",">Comma · 1.000,00</option>
          </select>
        </Field>
        <Field label="Thousands Separator">
          <select className="input-field" value={f.thouSep} onChange={e => set('thouSep', e.target.value)}>
            <option value=",">Comma (1,000)</option>
            <option value=".">Period (1.000)</option>
            <option value=" ">Space (1 000)</option>
            <option value="">None (1000)</option>
          </select>
        </Field>
        <Field label="Decimal Places">
          <select className="input-field" value={f.decimals} onChange={e => set('decimals', e.target.value)}>
            <option value="0">0 — 1,000</option>
            <option value="2">2 — 1,000.00</option>
            <option value="3">3 — 1,000.000</option>
          </select>
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Email ──────────────────────────────────────────────────────────
const EmailSection: React.FC = () => {
  const [protocol, setProtocol] = useState('smtp');
  const [f, set] = useFields({ host: '', port: '587', user: '', pass: '', enc: 'tls', fromName: 'ClearOS', fromEmail: '', sig: '' });
  const [preview, setPreview] = useState(true);
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('email', { protocol, ...f, preview }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Email Protocol">
        <Field label="Protocol">
          <select className="input-field" value={protocol} onChange={e => setProtocol(e.target.value)}>
            <option value="smtp">SMTP</option>
            <option value="phpmail">PHP Mail</option>
            <option value="sendgrid">SendGrid API</option>
            <option value="mailgun">Mailgun API</option>
            <option value="ses">Amazon SES</option>
          </select>
        </Field>
      </Card>
      {protocol === 'smtp' && (
        <Card title="SMTP Configuration">
          <Field label="SMTP Host"><input className="input-field" placeholder="mail.example.com" value={f.host} onChange={e => set('host', e.target.value)} /></Field>
          <Field label="Port"><input className="input-field" type="number" value={f.port} onChange={e => set('port', e.target.value)} /></Field>
          <Field label="Username"><input className="input-field" placeholder="your@email.com" value={f.user} onChange={e => set('user', e.target.value)} /></Field>
          <Field label="Password"><input className="input-field" type="password" value={f.pass} onChange={e => set('pass', e.target.value)} /></Field>
          <Field label="Encryption">
            <select className="input-field" value={f.enc} onChange={e => set('enc', e.target.value)}>
              <option value="">None</option><option value="ssl">SSL</option><option value="tls">TLS (Recommended)</option>
            </select>
          </Field>
        </Card>
      )}
      <Card title="Sender Identity">
        <Field label="From Name"><input className="input-field" value={f.fromName} onChange={e => set('fromName', e.target.value)} /></Field>
        <Field label="From Email"><input className="input-field" type="email" value={f.fromEmail} onChange={e => set('fromEmail', e.target.value)} /></Field>
        <ToggleRow label="Email Preview" hint="Allow in-browser preview when testing emails" value={preview} onChange={setPreview} />
        <Field label="Email Signature" full>
          <textarea className="input-field" rows={4} value={f.sig} onChange={e => set('sig', e.target.value)} placeholder="HTML signature appended to outgoing emails…" style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
        </Field>
      </Card>
      <SaveRow extra={<button type="button" className="btn btn-secondary">Send Test Email</button>} saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Finance General ────────────────────────────────────────────────
const FinanceGeneralSection: React.FC = () => {
  const co = getCompany();
  const { save: apiSave } = useContext(SettingsCtx);
  const [f, set] = useFields({
    currency: co.currency ?? 'TZS',
    fiscalMonth: String(co.fiscalMonth ?? 1),
    defaultTax: String(co.defaultTax ?? 18),
    decimals: '2', nextInv: '1', nextEst: '1', nextCN: '1',
  });
  const [taxPerItem, setTaxPerItem] = useState(false);
  const [showQty, setShowQty] = useState(true);
  const [editNo, setEditNo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setCompany({ currency: f.currency, defaultTax: parseFloat(f.defaultTax) || 0, fiscalMonth: parseInt(f.fiscalMonth, 10) || 1 });
    try { await apiSave('finance-general', { ...f, taxPerItem, showQty, editNo }); } catch {}
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      <Card title="Currency & Fiscal Year">
        <Field label="Default Currency" hint="Applied to all new bills, expenses, and invoices">
          <select className="input-field" value={f.currency} onChange={e => set('currency', e.target.value)}>
            {[['TZS','TZS — Tanzanian Shilling'],['USD','USD — US Dollar'],['EUR','EUR — Euro'],['GBP','GBP — British Pound'],['KES','KES — Kenyan Shilling'],['UGX','UGX — Ugandan Shilling'],['ZAR','ZAR — South African Rand'],['AED','AED — UAE Dirham']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Fiscal Year Start Month">
          <select className="input-field" value={f.fiscalMonth} onChange={e => set('fiscalMonth', e.target.value)}>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
              <option key={i+1} value={String(i+1)}>{m}</option>
            ))}
          </select>
        </Field>
      </Card>
      <Card title="Tax & Pricing">
        <Field label="Default Tax Rate (%)" hint="Pre-filled on new bill and invoice line items"><input className="input-field" type="number" value={f.defaultTax} onChange={e => set('defaultTax', e.target.value)} /></Field>
        <Field label="Price Decimal Points">
          <select className="input-field" value={f.decimals} onChange={e => set('decimals', e.target.value)}>
            <option value="0">0</option><option value="2">2</option><option value="3">3</option>
          </select>
        </Field>
        <ToggleRow label="Show Tax Per Item" hint="Tax breakdown per line item on invoices" value={taxPerItem} onChange={setTaxPerItem} />
        <ToggleRow label="Show Quantity Field" hint="Quantity column in invoice line items" value={showQty} onChange={setShowQty} />
      </Card>
      <Card title="Numbering">
        <Field label="Next Invoice #"><input className="input-field" type="number" value={f.nextInv} onChange={e => set('nextInv', e.target.value)} /></Field>
        <Field label="Next Estimate #"><input className="input-field" type="number" value={f.nextEst} onChange={e => set('nextEst', e.target.value)} /></Field>
        <Field label="Next Credit Note #"><input className="input-field" type="number" value={f.nextCN} onChange={e => set('nextCN', e.target.value)} /></Field>
        <ToggleRow label="Allow Manual Invoice Number Editing" value={editNo} onChange={setEditNo} />
      </Card>
      <SaveRow onSave={handleSave} saving={saving} saved={saved} />
    </>
  );
};

// ── section: Invoices ───────────────────────────────────────────────────────
const InvoicesSection: React.FC = () => {
  const [f, set] = useFields({ prefix: 'INV-', pad: '4', due: '30', terms: '', footer: '', payInstr: '' });
  const [logo, setLogo] = useState(true);
  const [partial, setPartial] = useState(true);
  const [showPayInstr, setShowPayInstr] = useState(false);
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('invoices', { ...f, logo, partial, showPayInstr }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Invoice Format">
        <Field label="Prefix" hint="e.g. INV-0001"><input className="input-field" value={f.prefix} onChange={e => set('prefix', e.target.value)} /></Field>
        <Field label="Number Padding">
          <select className="input-field" value={f.pad} onChange={e => set('pad', e.target.value)}>
            <option value="3">3 digits (001)</option><option value="4">4 digits (0001)</option><option value="5">5 digits (00001)</option>
          </select>
        </Field>
        <Field label="Default Due Days" hint="Days before invoice is overdue"><input className="input-field" type="number" value={f.due} onChange={e => set('due', e.target.value)} /></Field>
      </Card>
      <Card title="Content & Appearance">
        <ToggleRow label="Show Company Logo on Invoice PDF" value={logo} onChange={setLogo} />
        <Field label="Terms & Conditions" full>
          <textarea className="input-field" rows={3} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder="Default payment terms…" style={{ resize: 'vertical' }} />
        </Field>
        <Field label="Footer Note" full>
          <textarea className="input-field" rows={2} value={f.footer} onChange={e => set('footer', e.target.value)} placeholder="Thank you for your business…" style={{ resize: 'vertical' }} />
        </Field>
      </Card>
      <Card title="Payments">
        <ToggleRow label="Allow Partial Payments" hint="Customers can pay in multiple installments" value={partial} onChange={setPartial} />
        <ToggleRow label="Show Payment Instructions on Invoice PDF" value={showPayInstr} onChange={setShowPayInstr} />
        {showPayInstr && (
          <Field label="Payment Instructions" full>
            <textarea className="input-field" rows={3} value={f.payInstr} onChange={e => set('payInstr', e.target.value)} placeholder="e.g. Transfer to Account No: 123-456 CRDB Bank" style={{ resize: 'vertical' }} />
          </Field>
        )}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Quotations ─────────────────────────────────────────────────────
const QuotationsSection: React.FC = () => {
  const [f, set] = useFields({ prefix: 'QT-', validity: '14', terms: '', footer: '' });
  const [logo, setLogo] = useState(true);
  const [notif, setNotif] = useState(true);
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('quotations', { ...f, logo, notif }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Quotation Format">
        <Field label="Quote Prefix" hint="e.g. QT-0001"><input className="input-field" value={f.prefix} onChange={e => set('prefix', e.target.value)} /></Field>
        <Field label="Validity Days" hint="Days before quote expires"><input className="input-field" type="number" value={f.validity} onChange={e => set('validity', e.target.value)} /></Field>
        <ToggleRow label="Show Logo on Quote PDF" value={logo} onChange={setLogo} />
        <ToggleRow label="Notify When Quote is Converted to Invoice" value={notif} onChange={setNotif} />
        <Field label="Terms & Conditions" full>
          <textarea className="input-field" rows={3} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder="Default quotation terms…" style={{ resize: 'vertical' }} />
        </Field>
        <Field label="Footer Note" full>
          <textarea className="input-field" rows={2} value={f.footer} onChange={e => set('footer', e.target.value)} placeholder="Thank you for considering our services…" style={{ resize: 'vertical' }} />
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Purchase Orders ────────────────────────────────────────────────
const PurchaseOrdersSection: React.FC = () => {
  const [f, set] = useFields({ prefix: 'PO-', threshold: '1000000' });
  const [autoNo, setAutoNo] = useState(true);
  const [approval, setApproval] = useState(true);
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('purchase-orders', { ...f, autoNo, approval }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Purchase Order Settings">
        <Field label="PO Number Prefix"><input className="input-field" value={f.prefix} onChange={e => set('prefix', e.target.value)} /></Field>
        <ToggleRow label="Auto-Number Purchase Orders" value={autoNo} onChange={setAutoNo} />
        <ToggleRow label="Require Approval for Large Orders" hint="Orders above the threshold need admin approval" value={approval} onChange={setApproval} />
        {approval && (
          <Field label="Approval Threshold (TZS)"><input className="input-field" type="number" value={f.threshold} onChange={e => set('threshold', e.target.value)} /></Field>
        )}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Tax Rates ──────────────────────────────────────────────────────
const TaxRatesSection: React.FC = () => {
  const [rates, setRates] = useState([
    { id: '1', name: 'VAT 18%', rate: 18 },
    { id: '2', name: 'Withholding Tax 5%', rate: 5 },
    { id: '3', name: 'VAT 0% (Exempt)', rate: 0 },
  ]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const { save } = useContext(SettingsCtx);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Tax Rates</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Manage VAT and other tax rates applied to transactions.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Rate</button>
      </div>
      <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Name</th>
            <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>Rate</th>
            <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rates.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px' }}>{r.name}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{r.rate}%</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                <button type="button" onClick={() => { const next = rates.filter(x => x.id !== r.id); setRates(next); save('tax-rates', { rates: next }).catch(() => {}); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12, padding: '4px 8px' }}>Remove</button>
              </td>
            </tr>
          ))}
          {adding && (
            <tr style={{ background: 'var(--bg)' }}>
              <td style={{ padding: '8px 12px' }}><input className="input-field" placeholder="e.g. VAT 18%" value={newName} onChange={e => setNewName(e.target.value)} style={{ fontSize: 13 }} /></td>
              <td style={{ padding: '8px 12px' }}><input className="input-field" type="number" placeholder="18" value={newRate} onChange={e => setNewRate(e.target.value)} style={{ fontSize: 13, textAlign: 'right' }} /></td>
              <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button type="button" className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => { if (newName && newRate) { const newEntry = { id: Date.now().toString(), name: newName, rate: parseFloat(newRate) }; const next = [...rates, newEntry]; setRates(next); save('tax-rates', { rates: next }).catch(() => {}); setNewName(''); setNewRate(''); setAdding(false); } }}>Add</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Cancel</button>
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
    </div>
  );
};

// ── section: Currencies ─────────────────────────────────────────────────────
const CurrenciesSection: React.FC = () => {
  const [currencies, setCurrencies] = useState([
    { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', rate: 1, isBase: true },
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.00039, isBase: false },
    { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.00036, isBase: false },
    { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.00031, isBase: false },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', rate: 0.052, isBase: false },
    { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rate: 0.00143, isBase: false },
  ]);
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('currencies', { currencies }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Currencies</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Set the base currency and manage exchange rates.</p>
        </div>
        <div className="rtbl-wrap">
        <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Currency</th>
              <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Code</th>
              <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Symbol</th>
              <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>Exchange Rate</th>
              <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>Base</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map(c => (
              <tr key={c.code} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px' }}>{c.name}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{c.code}</td>
                <td style={{ padding: '10px 12px' }}>{c.symbol}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  {c.isBase ? <span style={{ color: 'var(--ink3)', fontSize: 12 }}>— base —</span> : (
                    <input className="input-field" type="number" step="0.00001" value={c.rate}
                      onChange={e => setCurrencies(cs => cs.map(x => x.code === c.code ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))}
                      style={{ fontSize: 13, textAlign: 'right', maxWidth: 120 }} />
                  )}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {c.isBase && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--teal)', color: '#fff' }}>Base</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Payment Gateways ───────────────────────────────────────────────

type GWField = { key: string; label: string; type?: string; placeholder?: string; hint?: string };

interface GatewayDef {
  id:      string;
  name:    string;
  desc:    string;
  color:   string;
  bg:      string;
  abbr:    string;       // 2–4 char logo text
  region:  string;
  sandbox: boolean;      // has sandbox toggle
  fields:  GWField[];
}

const GATEWAYS: GatewayDef[] = [
  // ── International ──────────────────────────────────────────
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
    id: 'authorize', name: 'Authorize.net', desc: 'Reliable US card gateway — AIM / SIM APIs.',
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

  // ── Pan-Africa ─────────────────────────────────────────────
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
    id: 'paystack', name: 'Paystack', desc: 'Stripe-backed gateway for Africa — cards & USSD.',
    color: '#00c3f7', bg: '#e6faff', abbr: 'PS', region: 'Pan-Africa', sandbox: true,
    fields: [
      { key: 'publicKey',  label: 'Public Key'  },
      { key: 'secretKey',  label: 'Secret Key',  type: 'password' },
    ],
  },

  // ── East Africa (Mobile Money) ─────────────────────────────
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
    id: 'airtel', name: 'Airtel Money', desc: 'Airtel Africa mobile money — TZ, KE, UG, RW.',
    color: '#e40000', bg: '#fdecea', abbr: 'AM', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'clientId',     label: 'Client ID'   },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
      { key: 'country',      label: 'Country Code', placeholder: 'TZ, KE, UG, RW…' },
      { key: 'currency',     label: 'Currency',     placeholder: 'TZS, KES, UGX…' },
    ],
  },
  {
    id: 'selcom', name: 'Selcom', desc: 'Tanzania payment aggregator — USSD, cards & wallets.',
    color: '#1d4ed8', bg: '#eff6ff', abbr: 'SC', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'apiKey',    label: 'API Key'   },
      { key: 'apiSecret', label: 'API Secret', type: 'password' },
      { key: 'vendor',    label: 'Vendor ID'  },
    ],
  },
  {
    id: 'halotel', name: 'Halotel (HaloPesa)', desc: 'Viettel Tanzania mobile money integration.',
    color: '#7c3aed', bg: '#f5f3ff', abbr: 'HP', region: 'East Africa', sandbox: false,
    fields: [
      { key: 'merchantId', label: 'Merchant ID'  },
      { key: 'apiKey',     label: 'API Key',       type: 'password' },
      { key: 'accountNo',  label: 'Account Number' },
    ],
  },

  // ── Bank & Manual ──────────────────────────────────────────
  {
    id: 'bank', name: 'Bank Transfer', desc: 'Manual bank transfers — CRDB, NMB, NBC and others.',
    color: '#475569', bg: '#f1f5f9', abbr: 'BK', region: 'Bank / Manual', sandbox: false,
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

const REGIONS = ['International', 'Pan-Africa', 'East Africa', 'Bank / Manual'] as const;

const PaymentGatewaysSection: React.FC = () => {
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
  const { save } = useContext(SettingsCtx);

  function setVal(gid: string, key: string, val: string) {
    setValues(v => ({ ...v, [gid]: { ...v[gid], [key]: val } }));
  }

  function toggleEnabled(gid: string, v: boolean) {
    setEnabled(e => ({ ...e, [gid]: v }));
    if (v) setExpanded(ex => ({ ...ex, [gid]: true }));
  }

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div>
      {/* ── Header summary ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>
            {enabledCount} of {GATEWAYS.length} gateways active — customers will see enabled gateways at checkout.
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={async () => {
          setSaving(true);
          const payload: Record<string, any> = {};
          for (const gw of GATEWAYS) { if (enabled[gw.id]) payload[`gw-${gw.id}`] = { enabled: true, sandbox: !!sandbox[gw.id], ...values[gw.id] }; }
          try { await save('payment-gateways', payload); } catch {}
          setSaving(false);
        }}>
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>

      {REGIONS.map(region => {
        const gws = GATEWAYS.filter(g => g.region === region);
        return (
          <div key={region} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              {region}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {gws.map(gw => {
                const on      = !!enabled[gw.id];
                const isOpen  = !!expanded[gw.id];
                const sbx     = !!sandbox[gw.id];
                return (
                  <div key={gw.id} style={{ background: 'var(--white)', border: `1.5px solid ${on ? gw.color + '55' : 'var(--border)'}`, borderRadius: 9, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: isOpen ? '1px solid var(--border)' : 'none', background: on ? gw.bg : 'var(--white)' }}>
                      {/* Logo badge */}
                      <div style={{ width: 40, height: 40, borderRadius: 9, background: gw.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontWeight: 900, fontSize: gw.abbr.length > 2 ? 10 : 13, fontFamily: 'var(--mono)', letterSpacing: '-0.03em' }}>{gw.abbr}</span>
                      </div>
                      {/* Name + desc */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          {gw.name}
                          {on && gw.sandbox && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 9, background: sbx ? '#fef9c3' : '#dcfce7', color: sbx ? '#92400e' : '#166534' }}>
                              {sbx ? 'SANDBOX' : 'LIVE'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gw.desc}</div>
                      </div>
                      {/* Toggle + expand */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Toggle value={on} onChange={v => toggleEnabled(gw.id, v)} />
                        {on && (
                          <button
                            type="button"
                            onClick={() => setExpanded(ex => ({ ...ex, [gw.id]: !ex[gw.id] }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', alignItems: 'center', padding: 4 }}
                          >
                            <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={14} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable config */}
                    {on && isOpen && (
                      <div style={{ padding: '16px 16px 14px' }}>
                        {/* Sandbox toggle */}
                        {gw.sandbox && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '8px 12px', background: sbx ? '#fefce8' : '#f0fdf4', borderRadius: 7, border: `1px solid ${sbx ? '#fde68a' : '#bbf7d0'}` }}>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: sbx ? '#92400e' : '#166534' }}>
                                {sbx ? '⚠ Sandbox / Test Mode' : '✓ Live Mode'}
                              </div>
                              <div style={{ fontSize: 11.5, color: sbx ? '#b45309' : '#15803d', marginTop: 1 }}>
                                {sbx ? 'No real money — use test credentials' : 'Real transactions will be processed'}
                              </div>
                            </div>
                            <Toggle value={sbx} onChange={v => setSandbox(s => ({ ...s, [gw.id]: v }))} />
                          </div>
                        )}
                        {/* Fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: gw.fields.length > 3 ? '1fr 1fr' : '1fr', gap: '10px 14px' }}>
                          {gw.fields.map(f => (
                            <div key={f.key} style={{ gridColumn: (f.key === 'instructions' || f.key === 'webhook') ? '1 / -1' : 'span 1' }}>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{f.label}</label>
                              {f.key === 'instructions' ? (
                                <textarea
                                  className="input-field"
                                  rows={2}
                                  placeholder={f.placeholder}
                                  value={values[gw.id][f.key]}
                                  onChange={e => setVal(gw.id, f.key, e.target.value)}
                                  style={{ resize: 'none', fontSize: 12.5, width: '100%', boxSizing: 'border-box' as const }}
                                />
                              ) : (
                                <input
                                  className="input-field"
                                  type={f.type ?? 'text'}
                                  placeholder={f.placeholder ?? ''}
                                  value={values[gw.id][f.key]}
                                  onChange={e => setVal(gw.id, f.key, e.target.value)}
                                  style={{ fontSize: 12.5, width: '100%', boxSizing: 'border-box' as const }}
                                />
                              )}
                              {f.hint && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{f.hint}</div>}
                            </div>
                          ))}
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => save(`gw-${gw.id}`, { enabled: true, sandbox: sbx, ...values[gw.id] }).catch(() => {})}>Save</button>
                          <button type="button" className="btn btn-secondary btn-sm">Test Connection</button>
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

// ── section: Expenses Categories ────────────────────────────────────────────
const ExpensesCategoriesSection: React.FC = () => {
  const [cats, setCats] = useState([
    { id: '1', name: 'Port Charges',       color: '#2563eb' },
    { id: '2', name: 'Customs Clearance',  color: '#16a34a' },
    { id: '3', name: 'Transport & Haulage',color: '#d97706' },
    { id: '4', name: 'Agency Fees',        color: '#7c3aed' },
    { id: '5', name: 'Demurrage',          color: '#dc2626' },
    { id: '6', name: 'Office & Admin',     color: '#0891b2' },
    { id: '7', name: 'Staff & Salaries',   color: '#059669' },
    { id: '8', name: 'Miscellaneous',      color: '#6b7280' },
  ]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');
  const doAdd = () => { if (newName) { setCats(cs => [...cs, { id: Date.now().toString(), name: newName, color: newColor }]); setNewName(''); setAdding(false); } };
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Expense Categories</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Categories used to classify business expenses.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 10 }}>
        {cats.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</div>
            <button type="button" onClick={() => setCats(cs => cs.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
          </div>
        ))}
        {adding && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: '2px solid var(--teal)', background: 'var(--bg)' }}>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }} />
            <input className="input-field" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAdd()} style={{ flex: 1, fontSize: 12 }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={doAdd}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── section: Configure Features — Customers ─────────────────────────────────
const FeatCustomersSection: React.FC = () => {
  const [portal, setPortal] = useState(true);
  const [selfReg, setSelfReg] = useState(false);
  const [vat, setVat] = useState(true);
  const [groups, setGroups] = useState(true);
  const [defaultGroup, setDefaultGroup] = useState('none');
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('feat-customers', { portal, selfReg, vat, groups, defaultGroup }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Customer Portal">
        <ToggleRow label="Enable Customer Portal" hint="Customers can log in to view invoices, shipments, and tickets" value={portal} onChange={setPortal} />
        <ToggleRow label="Allow Self-Registration" hint="New customers can sign up without an admin invitation" value={selfReg} onChange={setSelfReg} />
      </Card>
      <Card title="Customer Profile">
        <ToggleRow label="Show VAT / Tax Number Field" value={vat} onChange={setVat} />
        <ToggleRow label="Enable Customer Groups" hint="Segment customers and apply group-level discounts" value={groups} onChange={setGroups} />
        {groups && (
          <Field label="Default Group for New Customers">
            <select className="input-field" value={defaultGroup} onChange={e => setDefaultGroup(e.target.value)}>
              <option value="none">— None —</option>
              <option value="enterprise">Enterprise Importers</option>
              <option value="sme">SME Importers</option>
              <option value="individual">Individual</option>
            </select>
          </Field>
        )}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Google ─────────────────────────────────────────────────────────
const GoogleSection: React.FC = () => {
  const [f, set] = useFields({ gaId: '', mapsKey: '', rcSite: '', rcSecret: '', oauthId: '', oauthSecret: '' });
  const [ga, setGa] = useState(false);
  const [maps, setMaps] = useState(false);
  const [rc, setRc] = useState(false);
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('int-google', { ...f, ga, maps, rc }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Google Analytics">
        <ToggleRow label="Enable Google Analytics" hint="Track usage with GA4" value={ga} onChange={setGa} />
        {ga && <Field label="Measurement ID" hint="e.g. G-XXXXXXXXXX"><input className="input-field" placeholder="G-XXXXXXXXXX" value={f.gaId} onChange={e => set('gaId', e.target.value)} /></Field>}
      </Card>
      <Card title="Google Maps">
        <ToggleRow label="Enable Google Maps" hint="Show maps on address fields" value={maps} onChange={setMaps} />
        {maps && <Field label="Maps API Key"><input className="input-field" value={f.mapsKey} onChange={e => set('mapsKey', e.target.value)} /></Field>}
      </Card>
      <Card title="reCAPTCHA">
        <ToggleRow label="Enable reCAPTCHA" hint="Protect forms with Google reCAPTCHA" value={rc} onChange={setRc} />
        {rc && <>
          <Field label="Site Key"><input className="input-field" value={f.rcSite} onChange={e => set('rcSite', e.target.value)} /></Field>
          <Field label="Secret Key"><input className="input-field" type="password" value={f.rcSecret} onChange={e => set('rcSecret', e.target.value)} /></Field>
        </>}
      </Card>
      <Card title="Google OAuth (Sign-in)">
        <Field label="OAuth Client ID"><input className="input-field" value={f.oauthId} onChange={e => set('oauthId', e.target.value)} /></Field>
        <Field label="OAuth Client Secret"><input className="input-field" type="password" value={f.oauthSecret} onChange={e => set('oauthSecret', e.target.value)} /></Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: Pusher ─────────────────────────────────────────────────────────
const PusherSection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useFields({ appId: '', key: '', secret: '', cluster: 'ap2' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('int-pusher', { on, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Pusher Real-Time" desc="Live notifications and presence via Pusher Channels.">
        <ToggleRow label="Enable Pusher" value={on} onChange={setOn} />
        {on && <>
          <Field label="App ID"><input className="input-field" value={f.appId} onChange={e => set('appId', e.target.value)} /></Field>
          <Field label="App Key"><input className="input-field" value={f.key} onChange={e => set('key', e.target.value)} /></Field>
          <Field label="App Secret"><input className="input-field" type="password" value={f.secret} onChange={e => set('secret', e.target.value)} /></Field>
          <Field label="Cluster">
            <select className="input-field" value={f.cluster} onChange={e => set('cluster', e.target.value)}>
              {[['ap1','ap1 — Singapore'],['ap2','ap2 — Mumbai'],['ap3','ap3 — Tokyo'],['eu','eu — Ireland'],['mt1','mt1 — US East'],['us2','us2 — US West'],['sa1','sa1 — São Paulo']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </>}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: OpenAI ─────────────────────────────────────────────────────────
const OpenAISection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useFields({ apiKey: '', org: '', model: 'claude-sonnet-4-6', temp: '0.7', maxTokens: '2048' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('int-ai', { on, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="AI Configuration" desc="Power AI-assisted features throughout the app.">
        <ToggleRow label="Enable AI Features" value={on} onChange={setOn} />
        {on && <>
          <Field label="API Key" hint="sk- key for OpenAI, or your Anthropic key" full>
            <input className="input-field" type="password" placeholder="sk-…" value={f.apiKey} onChange={e => set('apiKey', e.target.value)} />
          </Field>
          <Field label="Organization ID (optional)"><input className="input-field" placeholder="org-…" value={f.org} onChange={e => set('org', e.target.value)} /></Field>
          <Field label="Model">
            <select className="input-field" value={f.model} onChange={e => set('model', e.target.value)}>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Recommended)</option>
              <option value="claude-opus-4-8">Claude Opus 4.8</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast)</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </Field>
          <Field label="Temperature" hint="0 = deterministic · 1 = creative">
            <input className="input-field" type="number" step="0.1" min="0" max="2" value={f.temp} onChange={e => set('temp', e.target.value)} />
          </Field>
          <Field label="Max Tokens"><input className="input-field" type="number" value={f.maxTokens} onChange={e => set('maxTokens', e.target.value)} /></Field>
        </>}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: SMS ────────────────────────────────────────────────────────────
const SMSSection: React.FC = () => {
  const [provider, setProvider] = useState('africas_talking');
  const [f, set] = useFields({ atUser: '', atKey: '', atSender: '', twilioSid: '', twilioToken: '', twilioFrom: '' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('int-sms', { provider, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="SMS Provider">
        <Field label="Provider">
          <select className="input-field" value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="africas_talking">Africa's Talking</option>
            <option value="twilio">Twilio</option>
            <option value="nexmo">Vonage / Nexmo</option>
            <option value="bongolive">BongoLive (Tanzania)</option>
            <option value="none">Disabled</option>
          </select>
        </Field>
      </Card>
      {provider === 'africas_talking' && (
        <Card title="Africa's Talking">
          <Field label="Username"><input className="input-field" value={f.atUser} onChange={e => set('atUser', e.target.value)} /></Field>
          <Field label="API Key"><input className="input-field" type="password" value={f.atKey} onChange={e => set('atKey', e.target.value)} /></Field>
          <Field label="Sender ID" hint="Short code or alphanumeric sender"><input className="input-field" value={f.atSender} onChange={e => set('atSender', e.target.value)} /></Field>
        </Card>
      )}
      {provider === 'twilio' && (
        <Card title="Twilio">
          <Field label="Account SID"><input className="input-field" value={f.twilioSid} onChange={e => set('twilioSid', e.target.value)} /></Field>
          <Field label="Auth Token"><input className="input-field" type="password" value={f.twilioToken} onChange={e => set('twilioToken', e.target.value)} /></Field>
          <Field label="From Number"><input className="input-field" placeholder="+1234567890" value={f.twilioFrom} onChange={e => set('twilioFrom', e.target.value)} /></Field>
        </Card>
      )}
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: PDF ────────────────────────────────────────────────────────────
const PDFSection: React.FC = () => {
  const [f, set] = useFields({ engine: 'wkhtmltopdf', paper: 'A4', orient: 'portrait', mTop: '10', mRight: '10', mBottom: '10', mLeft: '10' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('other-pdf', { ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="PDF Engine & Layout">
        <Field label="PDF Generator">
          <select className="input-field" value={f.engine} onChange={e => set('engine', e.target.value)}>
            <option value="wkhtmltopdf">wkhtmltopdf (Recommended)</option>
            <option value="puppeteer">Puppeteer / Chromium</option>
            <option value="dompdf">DomPDF</option>
          </select>
        </Field>
        <Field label="Paper Size">
          <select className="input-field" value={f.paper} onChange={e => set('paper', e.target.value)}>
            <option value="A4">A4 (210×297mm)</option>
            <option value="Letter">Letter (8.5×11in)</option>
            <option value="A3">A3 (297×420mm)</option>
            <option value="Legal">Legal (8.5×14in)</option>
          </select>
        </Field>
        <Field label="Orientation">
          <select className="input-field" value={f.orient} onChange={e => set('orient', e.target.value)}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </Field>
        <div />
        {(['mTop','mRight','mBottom','mLeft'] as const).map(k => (
          <Field key={k} label={`Margin ${k.slice(1)} (mm)`}>
            <input className="input-field" type="number" value={f[k]} onChange={e => set(k, e.target.value)} />
          </Field>
        ))}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// ── section: System Update ──────────────────────────────────────────────────
const UpdateSection: React.FC = () => {
  const [autoCheck, setAutoCheck] = useState(true);
  const [autoInstall, setAutoInstall] = useState(false);
  const [checking, setChecking] = useState(false);
  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 9, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkCircle" size={24} color="var(--green)" strokeWidth={2} />
        </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>ClearOS v2.1.0</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>You are running the latest version.</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={checking} onClick={async () => { setChecking(true); await sleep(1400); setChecking(false); }}>
            {checking ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <ToggleRow label="Auto-check for Updates" hint="Check in the background periodically" value={autoCheck} onChange={setAutoCheck} />
          <ToggleRow label="Auto-install Patch Versions" hint="Security patches only — major updates require manual approval" value={autoInstall} onChange={setAutoInstall} />
        </div>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Changelog — v2.1.0</h3>
        <ul style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.75, paddingLeft: 20, margin: 0 }}>
          <li>Finance module: Sales, Purchases, Bills, Payments pages</li>
          <li>LeftNav redesigned with collapsible expandable groups</li>
          <li>Settings page fully redesigned (Perfex CRM-style)</li>
          <li>MetricCard sparklines added to all major pages</li>
          <li>Dark mode polish and contrast improvements</li>
        </ul>
      </div>
    </>
  );
};

// ── section: Server Info ────────────────────────────────────────────────────
const ServerInfoSection: React.FC = () => {
  const rows: [string, string][] = [
    ['Application Version','2.1.0'],['Node.js','v20.18.0'],['Environment','Production'],
    ['Database','PostgreSQL 16.2'],['Cache','Redis 7.2.4'],['Platform','Linux x64'],
    ['Storage','262 GB free / 500 GB'],['Memory','512 MB / 2 GB'],['CPU','4 vCPUs'],
    ['Server Timezone','UTC'],['Last Deploy','2026-06-10 08:32 UTC'],['License','Commercial'],
  ];
  const mono = new Set(['Node.js','Database','Cache','Memory','CPU','Server Timezone','Last Deploy']);
  return (
    <div className="card">
      <div style={{ paddingBottom: 16, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>System &amp; Server Info</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Read-only environment information.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px' }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: mono.has(label) ? 'var(--mono)' : undefined }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── section: Cron Jobs ──────────────────────────────────────────────────────
const CronSection: React.FC = () => {
  const jobs = [
    { name: 'Send Overdue Invoice Reminders', schedule: 'Daily at 09:00',    last: '2026-06-12 09:00', active: true  },
    { name: 'Auto-Renew Subscriptions',       schedule: 'Daily at 00:00',    last: '2026-06-12 00:00', active: true  },
    { name: 'Sync Exchange Rates',             schedule: 'Every 6 hours',     last: '2026-06-12 06:00', active: true  },
    { name: 'Clean Temporary Files',           schedule: 'Sundays at 02:00',  last: '2026-06-08 02:00', active: true  },
    { name: 'Database Backup',                 schedule: 'Daily at 03:00',    last: '2026-06-12 03:00', active: true  },
    { name: 'Send Weekly Reports',             schedule: 'Mondays at 08:00',  last: '2026-06-09 08:00', active: false },
  ];
  return (
    <div className="card">
      <div style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Cron Jobs</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Scheduled background tasks.</p>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, marginBottom: 16, wordBreak: 'break-all' }}>
        Cron URL: <span style={{ color: 'var(--teal)', userSelect: 'all' }}>{window.location.origin}/api/cron/run?key=CRON_SECRET_KEY</span>
      </div>
      <div className="rtbl-wrap">
      <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Job</th>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Schedule</th>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Last Run</th>
            <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px' }}>{j.name}</td>
              <td style={{ padding: '10px 12px', color: 'var(--ink3)', fontSize: 12 }}>{j.schedule}</td>
              <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)' }}>{j.last}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: j.active ? 'var(--green-l)' : 'var(--border)', color: j.active ? 'var(--green)' : 'var(--ink3)' }}>
                  {j.active ? 'active' : 'inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
};

// ── section: Modules ────────────────────────────────────────────────────────
const MODULE_LIST: { name: string; desc: string; icon: IconName; on: boolean }[] = [
  { name: 'CRM & Leads',     desc: 'Lead management, pipeline, and customer tracking',  icon: 'target',       on: true  },
  { name: 'Support Tickets', desc: 'Help desk and customer support ticket system',       icon: 'headphones',   on: true  },
  { name: 'Project Tasks',   desc: 'Task management and project tracking',               icon: 'tasks',        on: false },
  { name: 'Contracts',       desc: 'Contract management and e-signature workflows',      icon: 'contracts',    on: true  },
  { name: 'Subscriptions',   desc: 'Recurring billing and subscription management',      icon: 'refresh',      on: false },
  { name: 'Inventory',       desc: 'Stock management and warehousing',                   icon: 'package',      on: false },
  { name: 'HR & Payroll',    desc: 'Employee management, leave, and payroll',            icon: 'briefcase',    on: false },
  { name: 'E-Commerce',      desc: 'Product catalog and online storefront',              icon: 'shoppingCart', on: false },
];

const ModulesSection: React.FC = () => {
  const [mods, setMods] = useState(MODULE_LIST);
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 0, marginBottom: 20 }}>Enable or disable application modules to match your workflow.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 16 }}>
        {mods.map((m, i) => (
          <div key={i} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 18, border: m.on ? '1.5px solid var(--teal)' : '1px solid var(--border)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 9, background: m.on ? 'var(--teal-l)' : 'var(--bg)', border: `1px solid ${m.on ? 'var(--teal-m)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={m.icon} size={20} strokeWidth={1.8} color={m.on ? 'var(--teal)' : 'var(--ink3)'} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3, marginBottom: 10 }}>{m.desc}</div>
              <Toggle value={m.on} onChange={v => setMods(ms => ms.map((x, j) => j === i ? { ...x, on: v } : x))} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── generic fallback ────────────────────────────────────────────────────────
const GenericSection: React.FC<{ title: string }> = ({ title }) => (
  <div className="card">
    <div style={{ paddingBottom: 16, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h3>
    </div>
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="settings" size={26} strokeWidth={1.6} color="var(--ink3)" />
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Configuration pending</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>This section will be available in an upcoming release.</div>
    </div>
  </div>
);

// ── section routing ─────────────────────────────────────────────────────────
function renderSection(key: string): React.ReactNode {
  switch (key) {
    case 'company':             return <CompanySection />;
    case 'localization':        return <LocalizationSection />;
    case 'email':               return <EmailSection />;
    case 'update':              return <UpdateSection />;
    case 'server':              return <ServerInfoSection />;
    case 'finance-general':     return <FinanceGeneralSection />;
    case 'invoices':            return <InvoicesSection />;
    case 'quotations':          return <QuotationsSection />;
    case 'purchase-orders':     return <PurchaseOrdersSection />;
    case 'tax-rates':           return <TaxRatesSection />;
    case 'currencies':          return <CurrenciesSection />;
    case 'payment-gateways':    return <PaymentGatewaysSection />;
    case 'expenses-categories': return <ExpensesCategoriesSection />;
    case 'feat-customers':      return <FeatCustomersSection />;
    case 'int-google':          return <GoogleSection />;
    case 'int-pusher':          return <PusherSection />;
    case 'int-ai':
    case 'int-openai':          return <OpenAISection />;
    case 'int-sms':             return <SMSSection />;
    case 'other-pdf':           return <PDFSection />;
    case 'misc-cron':           return <CronSection />;
    case 'modules':             return <ModulesSection />;
    default: {
      const label = NAV.flatMap(g => g.items).find(i => i.key === key)?.label ?? key;
      return <GenericSection title={label} />;
    }
  }
}

function getSectionTitle(key: string): string {
  if (key === 'modules') return 'Modules & Extensions';
  return NAV.flatMap(g => g.items).find(i => i.key === key)?.label ?? 'Settings';
}

// ── main export ─────────────────────────────────────────────────────────────
export const Settings: React.FC = () => {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get('s') ?? 'company';
  const go = (key: string) => setSearchParams({ s: key });
  const [globalSettings, setGlobalSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    apiFetch('/v1/settings')
      .then((d: any) => { if (d?.settings) setGlobalSettings(d.settings); })
      .catch(() => {});
  }, []);

  const saveSection = async (key: string, data: Record<string, any>) => {
    await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ [key]: data }) });
    setGlobalSettings(prev => ({ ...prev, [key]: data }));
  };

  return (
    <SettingsCtx.Provider value={{ s: globalSettings, save: saveSection }}>
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%', overflow: 'hidden' }}>

      {/* ── inner sidebar ── */}
      <div style={{ width: isMobile ? '100%' : 216, flexShrink: 0, borderRight: isMobile ? 'none' : '1px solid var(--border)', borderBottom: isMobile ? '1px solid var(--border)' : 'none', overflowY: 'auto', overflowX: isMobile ? 'auto' : undefined, background: 'var(--white)', paddingBottom: isMobile ? 0 : 24, maxHeight: isMobile ? 180 : undefined }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Settings
        </div>

        {NAV.map(g => (
          <div key={g.group} style={{ paddingTop: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.7px', padding: '6px 16px 3px' }}>
              {g.group}
            </div>
            {g.items.map(item => {
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => go(item.key)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    padding: '9px 16px', fontSize: 13, fontFamily: 'var(--font)',
                    fontWeight: active ? 600 : 400,
                    background: active ? 'var(--teal)' : 'transparent',
                    color: active ? '#fff' : 'var(--ink2)',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {(() => {
            const active = current === 'modules';
            return (
              <button
                type="button"
                onClick={() => go('modules')}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: '7px 16px', fontSize: 13, fontFamily: 'var(--font)',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'var(--teal)' : 'transparent',
                  color: active ? '#fff' : 'var(--ink2)',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                Modules / Extensions
              </button>
            );
          })()}
        </div>
      </div>

      {/* ── right content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '28px 32px', background: 'var(--bg)' }}>

        {/* Breadcrumb */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 8px', borderRadius: 6, background: 'var(--white)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--ink2)', fontWeight: 500 }}>
              <Icon name="settings" size={12} color="var(--ink3)" />
              Settings
            </div>
            <Icon name="chevronRight" size={12} color="var(--ink3)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)', fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
              {getSectionTitle(current)}
            </div>
          </div>
        )}

        {/* System overview strip */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 22, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {([
            { label: 'Version',        value: 'v2.1.0',  icon: 'checkCircle' as IconName, color: 'var(--green)', bg: 'rgba(16,185,129,0.08)' },
            { label: 'Active Modules', value: '4 / 8',   icon: 'grid'        as IconName, color: 'var(--teal)',  bg: 'rgba(20,184,166,0.08)' },
            { label: 'Integrations',   value: '0 live',  icon: 'zap'         as IconName, color: 'var(--ink3)', bg: 'var(--bg)'              },
            { label: 'System Status',  value: 'Healthy', icon: 'activity'    as IconName, color: 'var(--green)', bg: 'rgba(16,185,129,0.08)' },
            { label: 'Last Backup',    value: 'Today',   icon: 'clock'       as IconName, color: 'var(--ink2)', bg: 'var(--bg)'              },
          ] as const).map((s, i, arr) => (
            <div key={s.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon} size={14} color={s.color} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap' }}>{s.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.3px' }}>
            {getSectionTitle(current)}
          </h1>
        </div>
        {renderSection(current)}
      </div>

    </div>
    </SettingsCtx.Provider>
  );
};
