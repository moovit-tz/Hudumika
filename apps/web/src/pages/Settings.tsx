import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { getCompany, setCompany } from '../data/companyStore.js';
import { apiFetch } from '../lib/api.js';
import { refreshTenantLocale } from '../lib/tenantLocale.js';
import { useBranding, pushTenantBranding } from '../hooks/useBranding.js';
import { squareAvatarDataUrl } from '../lib/identity.js';
import { useLocale } from '../hooks/useLocale.js';
import type { SupportedLocale } from '../i18n/index.js';
import './Settings.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../hooks/useEntitlements.js';
import { useAuth } from '../hooks/useAuth.js';
import { APP_META } from './Utilities.js';

// -- Settings API context ---------------------------------------------------
interface SettingsCtxType {
  s: Record<string, any>;
  /** `replace` sends $replace for sections whose payload is the complete set. */
  save: (key: string, data: Record<string, any>, opts?: { replace?: boolean }) => Promise<void>;
}
const SettingsCtx = createContext<SettingsCtxType>({ s: {}, save: async () => {} });

// -- nav structure ----------------------------------------------------------
const NAV: Array<{ group: string; items: Array<{ key: string; label: string; icon: IconName }> }> = [
  { group: 'Platform', items: [
    { key: 'modules',            label: 'Modules & Extensions', icon: 'grid'          },
  ]},
  { group: 'General', items: [
    { key: 'company',            label: 'Company Information',  icon: 'building'      },
    { key: 'localization',       label: 'Localization',         icon: 'globe'         },
    // Branding was mounted only in the platform console, so a tenant could not
    // put their own logo or colour on the workspace they pay for.
    { key: 'branding',           label: 'Branding',             icon: 'sparkle'       },
    // Tax rates, quotations, purchase orders and currencies each had a panel
    // here that saved to a key nothing read, while the real implementations
    // live in FinOps. One control per thing; this one points at it.
    { key: 'elsewhere',          label: 'Finance setup',        icon: 'externalLink' },
    { key: 'email',              label: 'Email',                icon: 'mail'          },
    { key: 'notifications',      label: 'Notifications',        icon: 'bell'          },
  ]},
  { group: 'Finance', items: [
    { key: 'finance-general',    label: 'General',              icon: 'dollarSign'    },
    { key: 'payment-gateways',   label: 'Payment Gateways',     icon: 'creditCard'    },
    { key: 'payment-modes',      label: 'Payment Modes',        icon: 'wallet'        },
    { key: 'einvoice',           label: 'e-Invoice',            icon: 'invoice'       },
    { key: 'expenses-categories',label: 'Expenses Categories',  icon: 'tag'           },
  ]},
  { group: 'Sales', items: [
    { key: 'invoices',           label: 'Invoices',             icon: 'fileText'      },
    { key: 'credit-notes',       label: 'Credit Notes',         icon: 'receipt'       },
    { key: 'subscriptions',      label: 'Subscriptions',        icon: 'refresh'       },
  ]},
  { group: 'Configure Features', items: [
    { key: 'feat-customers',     label: 'Customers',            icon: 'users'         },
    { key: 'feat-tasks',         label: 'Tasks',                icon: 'tasks'         },
    { key: 'feat-support',       label: 'Support',              icon: 'headphones'    },
    { key: 'feat-leads',         label: 'Leads',                icon: 'target'        },
  ]},
  { group: 'App Settings', items: [
    { key: 'app-freight',        label: 'ClearOS / Freight',    icon: 'package'       },
  ]},
  { group: 'Integrations', items: [
    { key: 'int-google',         label: 'Google',               icon: 'globe'         },
    { key: 'int-ai',             label: 'AI Integration',       icon: 'sparkle'       },
    { key: 'int-openai',         label: 'OpenAI',               icon: 'sparkle'       },
    { key: 'int-sms',            label: 'SMS / WhatsApp',       icon: 'messageSquare' },
    { key: 'int-tancis',         label: 'TRA VFD / EFDMS',      icon: 'anchor'        },
    { key: 'int-tpa',            label: 'TPA Port Authority',   icon: 'ship'          },
    { key: 'int-shipsgo',        label: 'ShipsGo / Ship24',     icon: 'compass'       },
    { key: 'int-gpswox',         label: 'GPSWOX Fleet Tracking', icon: 'mapPin'       },
    { key: 'int-minio',          label: 'MinIO Storage',        icon: 'layers'        },
    { key: 'int-redis',          label: 'Redis / BullMQ',       icon: 'terminal'      },
    { key: 'int-general',        label: 'General',              icon: 'settings'      },
  ]},
  { group: 'Other', items: [
    { key: 'other-calendar',     label: 'Calendar',             icon: 'calendar'      },
    { key: 'other-pdf',          label: 'PDF',                  icon: 'file'          },
    { key: 'other-esign',        label: 'E-Sign',               icon: 'stamp'         },
    { key: 'other-tags',         label: 'Tags',                 icon: 'tag'           },
  ]},
  { group: 'Developer', items: [
    { key: 'developer-api',      label: 'API Keys',             icon: 'key'           },
  ]},
];

// -- primitives -------------------------------------------------------------
const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`s-tog${value ? ' s-tog--on' : ''}`}
    title={value ? 'Disable' : 'Enable'}
    disabled={disabled}
  >
    <span className="s-tog-thumb" />
  </button>
);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; full?: boolean }> = ({ label, hint, children, full }) => (
  <div className={full ? 's-fld s-fld--full' : 's-fld'}>
    <label className="s-fld-lbl">{label}</label>
    {children}
    {hint && <p className="s-fld-hint">{hint}</p>}
  </div>
);

const ToggleRow: React.FC<{ label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, hint, value, onChange }) => (
  <div className="s-tog-row">
    <div>
      <div className="s-tog-row-lbl">{label}</div>
      {hint && <div className="s-tog-row-hint">{hint}</div>}
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

const Card: React.FC<{ title: string; desc?: string; children: React.ReactNode; twoCol?: boolean; action?: React.ReactNode }> = ({ title, desc, children, twoCol, action }) => (
  <div className="s-card">
    <div className={`s-card-hdr${action ? ' s-card-hdr--row' : ''}`}>
      <div>
        <h3 className="s-card-title">{title}</h3>
        {desc && <p className="s-card-desc">{desc}</p>}
      </div>
      {action}
    </div>
    <div className={`s-card-grid${twoCol ? ' s-card-grid--2' : ''}`}>
      {children}
    </div>
  </div>
);

const SaveRow: React.FC<{ extra?: React.ReactNode; onSave?: () => void; saving?: boolean; saved?: boolean }> = ({ extra, onSave, saving, saved }) => (
  <div className="s-save-row">
    {saved && <span className="s-save-ok"><Icon name="check" size={13} color="var(--green)" /> Saved</span>}
    {extra}
    <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
      {saving ? 'Saving�' : 'Save Changes'}
    </button>
  </div>
);

// -- helpers -----------------------------------------------------------------
function useFields<T extends Record<string, string>>(init: T): [T, (k: keyof T, v: string) => void] {
  const [f, setF] = useState<T>(init);
  const set = (k: keyof T, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return [f, set];
}

/** Like useFields, but re-syncs its initial values from the already-saved
 * settings blob (SettingsCtx's `s[key]`) the first time it becomes available —
 * fixes every section that "saves successfully" but always shows hardcoded
 * defaults again on reload, because plain useState(init) only reads its
 * initializer once and `s` arrives asynchronously after GET /v1/settings resolves. */
function useSettingsFields<T extends Record<string, string>>(key: string, defaults: T): [T, (k: keyof T, v: string) => void] {
  const { s } = useContext(SettingsCtx);
  const [f, setF] = useState<T>(defaults);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    if (s[key]) { setF(prev => ({ ...prev, ...s[key] })); hydrated.current = true; }
  }, [s, key]);
  const set = (k: keyof T, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return [f, set];
}

// -- section: Company --------------------------------------------------------
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
          <Select value={f.country} onValueChange={v => set('country', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['TZ','Tanzania'],['KE','Kenya'],['UG','Uganda'],['RW','Rwanda'],['ZA','South Africa'],['NG','Nigeria'],['GH','Ghana'],['US','United States'],['GB','United Kingdom'],['DE','Germany'],['AE','UAE'],['IN','India'],['CN','China']].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Company Description" full>
          <textarea className="input-field s-resize-v" rows={3} value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Short description of your company�" />
        </Field>
      </Card>
      <Card title="Document Branding" desc="Logo and favicon used on PDF invoices, quotes, and portal documents. Platform login and UI branding is managed separately by your platform administrator.">
        <Field label="Company Logo" hint="Recommended: 400�100px PNG or SVG" full>
          <label className={`s-upload${logoUrl ? ' s-upload--on' : ''}`}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo preview" className="s-upload-preview" />
              : <div className="s-upload-ph s-upload-ph--lg">LOGO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${logoUrl ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{logoUrl ? 'Logo uploaded � click to change' : 'Click to upload logo'}</div>
              <div className="s-upload-hint">PNG, SVG or JPG � max 2 MB</div>
            </div>
            {logoUrl && (
              <button type="button" title="Remove logo" onClick={e => { e.preventDefault(); setLogoUrl(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="#dc2626" />
              </button>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
        </Field>
        {co.logoHistory.length > 0 && (
          <Field label="Previous Logos" hint="Click to restore" full>
            <div className="s-logo-hist">
              {co.logoHistory.map((src, i) => (
                <button key={i} type="button" title={`Restore logo ${i + 1}`} onClick={() => setLogoUrl(src)}
                  className={`s-logo-thumb${logoUrl === src ? ' s-logo-thumb--on' : ''}`}>
                  <img src={src} alt={`Previous logo ${i + 1}`} className="s-logo-thumb-img" />
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Favicon" hint="512�512px � PNG, JPG, SVG or ICO">
          <label className={`s-upload s-upload--sm${faviconUrl ? ' s-upload--on' : ''}`}>
            {faviconUrl
              ? <img src={faviconUrl} alt="Favicon preview" className="s-upload-preview--sq" />
              : <div className="s-upload-ph s-upload-ph--sq">ICO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${faviconUrl ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{faviconUrl ? 'Favicon uploaded � click to change' : 'Upload favicon'}</div>
              <div className="s-upload-hint">512�512px � PNG, JPG, SVG or ICO</div>
            </div>
            {faviconUrl && (
              <button type="button" title="Remove favicon" onClick={e => { e.preventDefault(); setFaviconUrl(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="#dc2626" />
              </button>
            )}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.svg,.ico" className="hidden" onChange={handleFaviconChange} />
          </label>
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Localization ---------------------------------------------------
const LocalizationSection: React.FC = () => {
  const { language, setLanguage, LANGUAGES } = useLocale();
  // Language and timezone only. The number/date-pattern fields that used to sit
  // here (decimals, separators, currency position, week start) were stored and
  // honoured by nothing — the app formats through Intl, which derives those from
  // the locale itself. Fields that cannot change anything do not belong on a
  // settings screen.
  const [f, set] = useSettingsFields('localization', { lang: language, tz: 'Africa/Dar_es_Salaam' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      // The person doing the saving gets it applied immediately; everyone else
      // picks it up from /identity/me on their next load.
      setLanguage(f.lang as SupportedLocale);
      await save('localization', { ...f });
      await refreshTenantLocale();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Language & Region">
        <Field label="Default Language">
          <Select value={f.lang} onValueChange={v => set('lang', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.nativeLabel}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={f.tz} onValueChange={v => set('tz', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['Africa/Dar_es_Salaam','Africa/Dar es Salaam (EAT +3)'],['Africa/Nairobi','Africa/Nairobi (EAT +3)'],['Africa/Kampala','Africa/Kampala (EAT +3)'],['Africa/Johannesburg','Africa/Johannesburg (SAST +2)'],['Africa/Lagos','Africa/Lagos (WAT +1)'],['Europe/London','Europe/London (GMT)'],['Europe/Paris','Europe/Paris (CET +1)'],['Asia/Dubai','Asia/Dubai (GST +4)'],['America/New_York','America/New York (EST -5)'],['UTC','UTC']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {/* Week start, date/time pattern, currency position and the separator
            pickers used to sit here. Every one was stored and honoured by
            nothing: dates are formatted through Intl, which derives all of it
            from the locale and timezone above. Keeping a control that cannot
            change anything is worse than not offering it. */}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Email ----------------------------------------------------------
const EmailSection: React.FC = () => {
  const [protocol, setProtocol] = useState('smtp');
  const [f, set] = useSettingsFields('email', { host: '', port: '587', user: '', pass: '', enc: 'tls', fromName: 'Hudumika', fromEmail: '', sig: '' });
  const [preview, setPreview] = useState(true);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.email) {
      setProtocol(s.email.protocol ?? 'smtp');
      setPreview(s.email.preview ?? true);
      hydratedExtra.current = true;
    }
  }, [s]);

  async function handleSave() { setSaving(true); try { await save('email', { protocol, ...f, preview }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }

  async function handleTestEmail() {
    setTesting(true); setTestResult(null);
    try {
      await apiFetch('/v1/settings/email/test', {
        method: 'POST',
        body: JSON.stringify({ host: f.host, port: Number(f.port), user: f.user, pass: f.pass, enc: f.enc, fromName: f.fromName, fromEmail: f.fromEmail }),
      });
      setTestResult({ ok: true, msg: 'Test email sent successfully.' });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || 'Failed to send test email.' });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  }
  return (
    <>
      <Card title="Email Protocol">
        <Field label="Protocol">
          <Select value={protocol} onValueChange={setProtocol}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="smtp">SMTP</SelectItem>
              <SelectItem value="phpmail">PHP Mail</SelectItem>
              <SelectItem value="sendgrid">SendGrid API</SelectItem>
              <SelectItem value="mailgun">Mailgun API</SelectItem>
              <SelectItem value="ses">Amazon SES</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>
      {protocol === 'smtp' && (
        <Card title="SMTP Configuration">
          <Field label="SMTP Host"><input className="input-field" placeholder="mail.example.com" value={f.host} onChange={e => set('host', e.target.value)} /></Field>
          <Field label="Port"><input className="input-field" type="number" value={f.port} onChange={e => set('port', e.target.value)} /></Field>
          <Field label="Username"><input className="input-field" placeholder="your@email.com" value={f.user} onChange={e => set('user', e.target.value)} /></Field>
          <Field label="Password"><input className="input-field" type="password" value={f.pass} onChange={e => set('pass', e.target.value)} /></Field>
          <Field label="Encryption">
            <Select value={f.enc || '__none__'} onValueChange={v => set('enc', v === '__none__' ? '' : v)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="ssl">SSL</SelectItem>
                <SelectItem value="tls">TLS (Recommended)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Card>
      )}
      <Card title="Sender Identity">
        <Field label="From Name"><input className="input-field" value={f.fromName} onChange={e => set('fromName', e.target.value)} /></Field>
        <Field label="From Email"><input className="input-field" type="email" value={f.fromEmail} onChange={e => set('fromEmail', e.target.value)} /></Field>
        <ToggleRow label="Email Preview" hint="Allow in-browser preview when testing emails" value={preview} onChange={setPreview} />
        <Field label="Email Signature" full>
          <textarea className="input-field s-resize-v s-font-mono" rows={4} value={f.sig} onChange={e => set('sig', e.target.value)} placeholder="HTML signature appended to outgoing emails�" />
        </Field>
      </Card>
      <SaveRow
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={handleTestEmail} disabled={testing}>
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>
            {testResult && (
              <span style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? 'var(--green, #059669)' : 'var(--red, #dc2626)' }}>
                {testResult.ok ? 'Sent' : testResult.msg}
              </span>
            )}
          </div>
        }
        saving={saving} saved={saved} onSave={handleSave}
      />
    </>
  );
};

// -- section: Finance General ------------------------------------------------
const FinanceGeneralSection: React.FC = () => {
  const co = getCompany();
  const { save: apiSave } = useContext(SettingsCtx);
  const [f, set] = useFields({
    currency: co.currency ?? 'TZS',
    fiscalMonth: String(co.fiscalMonth ?? 1),
    defaultTax: String(co.defaultTax ?? 18),
  });
  const [taxPerItem, setTaxPerItem] = useState(false);
  const [showQty, setShowQty] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setCompany({ currency: f.currency, defaultTax: parseFloat(f.defaultTax) || 0, fiscalMonth: parseInt(f.fiscalMonth, 10) || 1 });
    try { await apiSave('finance-general', { ...f, taxPerItem, showQty }); } catch {}
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      <Card title="Currency & Fiscal Year">
        <Field label="Default Currency" hint="Applied to all new bills, expenses, and invoices">
          <Select value={f.currency} onValueChange={v => set('currency', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['TZS','TZS � Tanzanian Shilling'],['USD','USD � US Dollar'],['EUR','EUR � Euro'],['GBP','GBP � British Pound'],['KES','KES � Kenyan Shilling'],['UGX','UGX � Ugandan Shilling'],['ZAR','ZAR � South African Rand'],['AED','AED � UAE Dirham']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
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
      <Card title="Tax & Pricing" desc="Number of decimal places is configured in General ? Localization.">
        <Field label="Default Tax Rate" hint="Pre-filled on new bill and invoice line items � add rates in Finance ? Tax Rates">
          <Select value={f.defaultTax} onValueChange={v => set('defaultTax', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0% � Exempt / Zero-rated</SelectItem>
              <SelectItem value="5">5% � Withholding Tax</SelectItem>
              <SelectItem value="18">18% � VAT Standard</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <ToggleRow label="Show Tax Per Item" hint="Tax breakdown per line item on invoices" value={taxPerItem} onChange={setTaxPerItem} />
        <ToggleRow label="Show Quantity Field" hint="Quantity column in invoice line items" value={showQty} onChange={setShowQty} />
      </Card>
      <SaveRow onSave={handleSave} saving={saving} saved={saved} />
    </>
  );
};

// -- section: Invoices -------------------------------------------------------
const InvoicesSection: React.FC = () => {
  // prefix/pad/nextInv are backed by the real numbering counters (GET/PATCH
  // /v1/settings/numbering/invoice, consumed by invoices.routes.ts POST /) —
  // kept OUT of the generic useSettingsFields blob so a stale copy in the
  // JSONB settings blob can never drift from what the real counter produces.
  const [f, set] = useSettingsFields('invoices', { due: '30', terms: '', footer: '', payInstr: '' });
  const [prefix, setPrefix] = useState('INV-');
  const [pad, setPad] = useState('4');
  const [nextInv, setNextInv] = useState('1');
  const [logo, setLogo] = useState(true);
  const [partial, setPartial] = useState(true);
  const [showPayInstr, setShowPayInstr] = useState(false);
  const [editNo, setEditNo] = useState(false);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.invoices) {
      setLogo(s.invoices.logo ?? true);
      setPartial(s.invoices.partial ?? true);
      setShowPayInstr(s.invoices.showPayInstr ?? false);
      setEditNo(s.invoices.editNo ?? false);
      hydratedExtra.current = true;
    }
  }, [s]);

  useEffect(() => {
    apiFetch('/v1/settings/numbering/invoice')
      .then((d: any) => { setPrefix(d.prefix ?? 'INV-'); setPad(String(d.pad_length ?? 4)); setNextInv(String(d.next_number ?? 1)); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await save('invoices', { ...f, logo, partial, showPayInstr, editNo });
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
      <Card title="Invoice Format">
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
        <Field label="Default Due Days" hint="Days before invoice is overdue"><input className="input-field" type="number" value={f.due} onChange={e => set('due', e.target.value)} /></Field>
      </Card>
      <Card title="Content & Appearance">
        <ToggleRow label="Show Company Logo on Invoice PDF" value={logo} onChange={setLogo} />
        <Field label="Terms & Conditions" full>
          <textarea className="input-field s-resize-v" rows={3} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder="Default payment terms�" />
        </Field>
        <Field label="Footer Note" full>
          <textarea className="input-field s-resize-v" rows={2} value={f.footer} onChange={e => set('footer', e.target.value)} placeholder="Thank you for your business�" />
        </Field>
      </Card>
      <Card title="Payments">
        <ToggleRow label="Allow Partial Payments" hint="Customers can pay in multiple installments" value={partial} onChange={setPartial} />
        <ToggleRow label="Show Payment Instructions on Invoice PDF" value={showPayInstr} onChange={setShowPayInstr} />
        {showPayInstr && (
          <Field label="Payment Instructions" full>
            <textarea className="input-field s-resize-v" rows={3} value={f.payInstr} onChange={e => set('payInstr', e.target.value)} placeholder="e.g. Transfer to Account No: 123-456 CRDB Bank" />
          </Field>
        )}
      </Card>
      <Card title="Numbering" desc="Backed by the real invoice number counter used by ClearOS/FinOps when issuing invoices.">
        <Field label="Next Invoice #" hint="Starting number for the next auto-generated invoice"><input className="input-field" type="number" placeholder="1" value={nextInv} onChange={e => setNextInv(e.target.value)} /></Field>
        <ToggleRow label="Allow Manual Invoice Number Editing" hint="Let users override the auto-generated invoice number" value={editNo} onChange={setEditNo} />
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Quotations -----------------------------------------------------
const QuotationsSection: React.FC = () => {
  // prefix/nextEst are backed by the real numbering counters (GET/PATCH
  // /v1/settings/numbering/quotation) — kept out of the generic settings blob.
  const [f, set] = useSettingsFields('quotations', { validity: '14', terms: '', footer: '' });
  const [prefix, setPrefix] = useState('QT-');
  const [nextEst, setNextEst] = useState('1');
  const [logo, setLogo] = useState(true);
  const [notif, setNotif] = useState(true);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.quotations) {
      setLogo(s.quotations.logo ?? true);
      setNotif(s.quotations.notif ?? true);
      hydratedExtra.current = true;
    }
  }, [s]);

  useEffect(() => {
    apiFetch('/v1/settings/numbering/quotation')
      .then((d: any) => { setPrefix(d.prefix ?? 'QT-'); setNextEst(String(d.next_number ?? 1)); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await save('quotations', { ...f, logo, notif });
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
        <Field label="Validity Days" hint="Days before quote expires"><input className="input-field" type="number" placeholder="14" value={f.validity} onChange={e => set('validity', e.target.value)} /></Field>
        <ToggleRow label="Show Logo on Quote PDF" value={logo} onChange={setLogo} />
        <ToggleRow label="Notify When Quote is Converted to Invoice" value={notif} onChange={setNotif} />
        <Field label="Terms & Conditions" full>
          <textarea className="input-field s-resize-v" rows={3} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder="Default quotation terms�" />
        </Field>
        <Field label="Footer Note" full>
          <textarea className="input-field s-resize-v" rows={2} value={f.footer} onChange={e => set('footer', e.target.value)} placeholder="Thank you for considering our services�" />
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Purchase Orders ------------------------------------------------
const PurchaseOrdersSection: React.FC = () => {
  // prefix is backed by the real numbering counter (GET/PATCH
  // /v1/settings/numbering/purchase_order) — kept out of the generic settings
  // blob. This section has no pad/next-number field in its UI.
  const [f, set] = useSettingsFields('purchase-orders', { threshold: '1000000' });
  const [prefix, setPrefix] = useState('PO-');
  const [autoNo, setAutoNo] = useState(true);
  const [approval, setApproval] = useState(true);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['purchase-orders']) {
      setAutoNo(s['purchase-orders'].autoNo ?? true);
      setApproval(s['purchase-orders'].approval ?? true);
      hydratedExtra.current = true;
    }
  }, [s]);

  useEffect(() => {
    apiFetch('/v1/settings/numbering/purchase_order')
      .then((d: any) => { setPrefix(d.prefix ?? 'PO-'); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await save('purchase-orders', { ...f, autoNo, approval });
      const num = await apiFetch('/v1/settings/numbering/purchase_order', { method: 'PATCH', body: JSON.stringify({ prefix }) });
      setPrefix(num.prefix);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Purchase Order Settings" desc="Prefix is backed by the real PO counter used when issuing purchase orders.">
        <Field label="PO Number Prefix"><input className="input-field" value={prefix} onChange={e => setPrefix(e.target.value)} /></Field>
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

// -- section: Tax Rates ------------------------------------------------------
const TaxRatesSection: React.FC = () => {
  const [rates, setRates] = useState([
    { id: '1', name: 'VAT 18%', rate: 18 },
    { id: '2', name: 'Withholding Tax 5%', rate: 5 },
    { id: '3', name: 'VAT 0% (Exempt)', rate: 0 },
  ]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const { s, save } = useContext(SettingsCtx);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s['tax-rates']?.rates) { setRates(s['tax-rates'].rates); hydrated.current = true; }
  }, [s]);

  return (
    <Card title="Tax Rates" desc="Manage VAT and other tax rates applied to transactions."
      action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Rate</button>}>
      <div className="s-fld--full rtbl-wrap">
        <table className="rtbl">
          <thead>
            <tr>
              <th>Name</th>
              <th className="rtbl-r">Rate</th>
              <th className="rtbl-r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rates.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="rtbl-r rtbl-bold">{r.rate}%</td>
                <td className="rtbl-r">
                  <button type="button" className="rtbl-rm" onClick={() => { const next = rates.filter(x => x.id !== r.id); setRates(next); save('tax-rates', { rates: next }).catch(() => {}); }}>Remove</button>
                </td>
              </tr>
            ))}
            {adding && (
              <tr className="rtbl-add">
                <td><input className="input-field" placeholder="e.g. VAT 18%" value={newName} onChange={e => setNewName(e.target.value)} /></td>
                <td><input className="input-field rtbl-r" type="number" placeholder="18" value={newRate} onChange={e => setNewRate(e.target.value)} /></td>
                <td className="rtbl-r rtbl-nowrap">
                  <button type="button" className="btn btn-primary btn-sm rtbl-mr" title="Add tax rate" onClick={() => { if (newName && newRate) { const newEntry = { id: Date.now().toString(), name: newName, rate: parseFloat(newRate) }; const next = [...rates, newEntry]; setRates(next); save('tax-rates', { rates: next }).catch(() => {}); setNewName(''); setNewRate(''); setAdding(false); } }}>Add</button>
                  <button type="button" className="btn btn-secondary btn-sm" title="Cancel" onClick={() => setAdding(false)}>Cancel</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// -- section: Currencies -----------------------------------------------------
const CurrenciesSection: React.FC = () => {
  const [currencies, setCurrencies] = useState([
    { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', rate: 1, isBase: true },
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.00039, isBase: false },
    { code: 'EUR', name: 'Euro', symbol: '�', rate: 0.00036, isBase: false },
    { code: 'GBP', name: 'British Pound', symbol: '�', rate: 0.00031, isBase: false },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', rate: 0.052, isBase: false },
    { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rate: 0.00143, isBase: false },
  ]);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s.currencies?.currencies) { setCurrencies(s.currencies.currencies); hydrated.current = true; }
  }, [s]);

  async function handleSave() { setSaving(true); try { await save('currencies', { currencies }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Currencies" desc="Set the base currency and manage exchange rates.">
        <div className="s-fld--full rtbl-wrap">
          <table className="rtbl">
            <thead>
              <tr>
                <th>Currency</th>
                <th>Code</th>
                <th>Symbol</th>
                <th className="rtbl-r">Exchange Rate</th>
                <th className="rtbl-c">Base</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map(c => (
                <tr key={c.code}>
                  <td>{c.name}</td>
                  <td className="rtbl-mono">{c.code}</td>
                  <td>{c.symbol}</td>
                  <td className="rtbl-r">
                    {c.isBase ? <span className="s-muted">� base �</span> : (
                      <input className="input-field rtbl-in-r" type="number" step="0.00001" value={c.rate}
                        onChange={e => setCurrencies(cs => cs.map(x => x.code === c.code ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} />
                    )}
                  </td>
                  <td className="rtbl-c">
                    {c.isBase && <span className="s-base-badge">Base</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Payment Gateways -----------------------------------------------

type GWField = { key: string; label: string; type?: string; placeholder?: string; hint?: string };

interface GatewayDef {
  id:      string;
  name:    string;
  desc:    string;
  color:   string;
  bg:      string;
  abbr:    string;       // 2�4 char logo text
  region:  string;
  sandbox: boolean;      // has sandbox toggle
  fields:  GWField[];
}

const GATEWAYS: GatewayDef[] = [
  // -- International ------------------------------------------
  {
    id: 'stripe', name: 'Stripe', desc: 'Global card payments, subscriptions & invoicing.',
    color: '#6772e5', bg: '#f0f0fd', abbr: 'S', region: 'International', sandbox: false,
    fields: [
      { key: 'pub',     label: 'Publishable Key',  placeholder: 'pk_live_�' },
      { key: 'sec',     label: 'Secret Key',        placeholder: 'sk_live_�', type: 'password' },
      { key: 'webhook', label: 'Webhook Secret',    placeholder: 'whsec_�',   type: 'password', hint: 'From Stripe Dashboard ? Webhooks' },
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
    id: 'authorize', name: 'Authorize.net', desc: 'Reliable US card gateway � AIM / SIM APIs.',
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
    id: 'paystack', name: 'Paystack', desc: 'Stripe-backed gateway for Africa � cards & USSD.',
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
    id: 'airtel', name: 'Airtel Money', desc: 'Airtel Africa mobile money � TZ, KE, UG, RW.',
    color: '#e40000', bg: '#fdecea', abbr: 'AM', region: 'East Africa', sandbox: true,
    fields: [
      { key: 'clientId',     label: 'Client ID'   },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
      { key: 'country',      label: 'Country Code', placeholder: 'TZ, KE, UG, RW�' },
      { key: 'currency',     label: 'Currency',     placeholder: 'TZS, KES, UGX�' },
    ],
  },
  {
    id: 'selcom', name: 'Selcom', desc: 'Tanzania payment aggregator � USSD, cards & wallets.',
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
    id: 'bank', name: 'Bank Transfer', desc: 'Manual bank transfers � CRDB, NMB, NBC and others.',
    color: 'var(--ink2)', bg: '#f1f5f9', abbr: 'BK', region: 'Bank / Manual', sandbox: false,
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
          {enabledCount} of {GATEWAYS.length} gateways active � customers will see enabled gateways at checkout.
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} title="Save all gateway settings" onClick={async () => {
          setSaving(true);
          const payload: Record<string, any> = {};
          for (const gw of GATEWAYS) { if (enabled[gw.id]) payload[`gw-${gw.id}`] = { enabled: true, sandbox: !!sandbox[gw.id], ...values[gw.id] }; }
          // $replace: this screen omits disabled gateways rather than sending
          // them as false, so the stored object must be replaced outright. Every
          // other section merges, which is what makes partial saves safe.
          try { await save('payment-gateways', payload, { replace: true }); } catch {}
          setSaving(false);
        }}>
          {saving ? 'Saving�' : 'Save All Changes'}
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
                                {sbx ? 'No real money � use test credentials' : 'Real transactions will be processed'}
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
                          <button type="button" className="btn btn-primary btn-sm" title="Save gateway" onClick={() => save(`gw-${gw.id}`, { enabled: true, sandbox: sbx, ...values[gw.id] }).catch(() => {})}>Save</button>
                          <button type="button" className="btn btn-secondary btn-sm" title="Test Connection" disabled={testing === gw.id} onClick={() => testGateway(gw)}>
                            {testing === gw.id ? 'Testing…' : 'Test Connection'}
                          </button>
                          {testResults[gw.id] && (
                            <span style={{ fontSize: 11.5, marginLeft: 8, fontWeight: 600, color: testResults[gw.id].ok ? 'var(--green, #059669)' : 'var(--red, #dc2626)' }}>
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
const ExpensesCategoriesSection: React.FC = () => {
  const [cats, setCats] = useState([
    { id: '1', name: 'Port Charges',       color: '#2563eb' },
    { id: '2', name: 'Customs Clearance',  color: '#059669' },
    { id: '3', name: 'Transport & Haulage',color: 'var(--gold)' },
    { id: '4', name: 'Agency Fees',        color: '#7c3aed' },
    { id: '5', name: 'Demurrage',          color: 'var(--red)' },
    { id: '6', name: 'Office & Admin',     color: '#0891b2' },
    { id: '7', name: 'Staff & Salaries',   color: '#059669' },
    { id: '8', name: 'Miscellaneous',      color: 'var(--ink2)' },
  ]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');
  const { s, save } = useContext(SettingsCtx);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s['expenses-categories']?.categories) { setCats(s['expenses-categories'].categories); hydrated.current = true; }
  }, [s]);

  const doAdd = () => {
    if (newName) {
      const next = [...cats, { id: Date.now().toString(), name: newName, color: newColor }];
      setCats(next);
      save('expenses-categories', { categories: next }).catch(() => {});
      setNewName(''); setAdding(false);
    }
  };
  return (
    <Card title="Expense Categories" desc="Categories used to classify business expenses."
      action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add</button>}>
      <div className="s-fld--full s-cats-grid">
        {cats.map(c => (
          <div key={c.id} className="s-cat">
            <div className="s-cat-dot" style={{ background: c.color }} />
            <div className="s-cat-name">{c.name}</div>
            <button type="button" title={`Remove ${c.name}`} onClick={() => { const next = cats.filter(x => x.id !== c.id); setCats(next); save('expenses-categories', { categories: next }).catch(() => {}); }} className="s-cat-rm">�</button>
          </div>
        ))}
        {adding && (
          <div className="s-cat-add">
            <input type="color" title="Pick category color" value={newColor} onChange={e => setNewColor(e.target.value)} className="s-color-picker" />
            <input className="input-field s-cat-in" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAdd()} />
            <button type="button" className="btn btn-primary btn-sm" onClick={doAdd}>Add</button>
          </div>
        )}
      </div>
    </Card>
  );
};

// -- section: Configure Features � Customers ---------------------------------
const FeatCustomersSection: React.FC = () => {
  const [portal, setPortal] = useState(true);
  const [selfReg, setSelfReg] = useState(false);
  const [vat, setVat] = useState(true);
  const [groups, setGroups] = useState(true);
  const [defaultGroup, setDefaultGroup] = useState('none');
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s['feat-customers']) {
      const d = s['feat-customers'];
      setPortal(d.portal ?? true);
      setSelfReg(d.selfReg ?? false);
      setVat(d.vat ?? true);
      setGroups(d.groups ?? true);
      setDefaultGroup(d.defaultGroup ?? 'none');
      hydrated.current = true;
    }
  }, [s]);

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
            <Select value={defaultGroup} onValueChange={setDefaultGroup}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">� None �</SelectItem>
                <SelectItem value="enterprise">Enterprise Importers</SelectItem>
                <SelectItem value="sme">SME Importers</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Google ---------------------------------------------------------
const GoogleSection: React.FC = () => {
  const [f, set] = useSettingsFields('int-google', { gaId: '', mapsKey: '', rcSite: '', rcSecret: '', oauthId: '', oauthSecret: '' });
  const [ga, setGa] = useState(false);
  const [maps, setMaps] = useState(false);
  const [rc, setRc] = useState(false);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['int-google']) {
      const d = s['int-google'];
      setGa(d.ga ?? false);
      setMaps(d.maps ?? false);
      setRc(d.rc ?? false);
      hydratedExtra.current = true;
    }
  }, [s]);

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

// -- section: ShipsGo / Ship24 -----------------------------------------------
const ShipsGoSection: React.FC = () => {
  const [f, set] = useSettingsFields('int-shipsgo', { shipsgo_api_key: '', ship24_api_key: '' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('int-shipsgo', { ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Container &amp; BL Tracking (ShipsGo)" desc="Used for ocean bill-of-lading and container tracking on the Tracker page.">
        <Field label="ShipsGo API Key" hint="From your ShipsGo account dashboard under API access.">
          <input className="input-field" type="password" placeholder="Enter ShipsGo API key" value={f.shipsgo_api_key} onChange={e => set('shipsgo_api_key', e.target.value)} />
        </Field>
      </Card>
      <Card title="Air Waybill Tracking (Ship24)" desc="Used for AWB tracking and as a fallback when ShipsGo has no result.">
        <Field label="Ship24 API Key" hint="From your Ship24 account under Developers ? API Keys.">
          <input className="input-field" type="password" placeholder="Enter Ship24 API key" value={f.ship24_api_key} onChange={e => set('ship24_api_key', e.target.value)} />
        </Field>
      </Card>
      <p className="s-fld-hint" style={{ margin: '4px 2px 0' }}>Until a key is saved here, the Tracker page returns demo/mock tracking data.</p>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: GPSWOX ---------------------------------------------------------
const GpswoxSection: React.FC = () => {
  const [f, set] = useSettingsFields('int-gpswox', { base_url: '', email: '', password: '' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  async function handleSave() {
    setSaving(true);
    try { await save('int-gpswox', { ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      await apiFetch('/v1/tracking/gpswox/test', { method: 'POST' });
      setTestResult('ok');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 3000);
    }
  }

  return (
    <>
      <Card title="GPSWOX Fleet Tracking" desc="Pulls real GPS device positions into HuduFreight's vehicle map, history, and geofence alerts. GPSWOX is typically self-hosted, so the base URL is specific to your instance � save credentials here first.">
        <Field label="Base URL" hint="Your GPSWOX instance root, e.g. https://fleet.yourcompany.com � do not include /api.">
          <input className="input-field" placeholder="https://fleet.yourcompany.com" value={f.base_url} onChange={e => set('base_url', e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input-field" type="email" placeholder="fleet-account@yourcompany.com" value={f.email} onChange={e => set('email', e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input-field" type="password" placeholder="��������" value={f.password} onChange={e => set('password', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={handleTest} disabled={testing || !f.base_url || !f.email || !f.password}>
            {testing ? 'Testing�' : 'Test Connection'}
          </button>
          {testResult === 'ok' && <span style={{ fontSize: 12, color: 'var(--green, #059669)', fontWeight: 600 }}>Connected</span>}
          {testResult === 'fail' && <span style={{ fontSize: 12, color: 'var(--red, #dc2626)', fontWeight: 600 }}>Connection failed � check URL/credentials</span>}
        </div>
      </Card>
      <p className="s-fld-hint" style={{ margin: '4px 2px 0' }}>Until credentials are saved and valid, vehicle positions must be entered manually � no simulated fleet data is shown.</p>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Pusher ---------------------------------------------------------
const PusherSection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useSettingsFields('int-pusher', { appId: '', key: '', secret: '', cluster: 'ap2' });
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['int-pusher']) { setOn(s['int-pusher'].on ?? false); hydratedExtra.current = true; }
  }, [s]);

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
            <Select value={f.cluster} onValueChange={v => set('cluster', v)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[['ap1','ap1 � Singapore'],['ap2','ap2 � Mumbai'],['ap3','ap3 � Tokyo'],['eu','eu � Ireland'],['mt1','mt1 � US East'],['us2','us2 � US West'],['sa1','sa1 � S�o Paulo']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </>}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: OpenAI ---------------------------------------------------------
const OpenAISection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useSettingsFields('int-ai', { apiKey: '', org: '', model: 'claude-sonnet-4-6', temp: '0.7', maxTokens: '2048' });
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['int-ai']) { setOn(s['int-ai'].on ?? false); hydratedExtra.current = true; }
  }, [s]);

  async function handleSave() { setSaving(true); try { await save('int-ai', { on, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="AI Configuration" desc="Power AI-assisted features throughout the app.">
        <ToggleRow label="Enable AI Features" value={on} onChange={setOn} />
        {on && <>
          <Field label="API Key" hint="sk- key for OpenAI, or your Anthropic key" full>
            <input className="input-field" type="password" placeholder="sk-�" value={f.apiKey} onChange={e => set('apiKey', e.target.value)} />
          </Field>
          <Field label="Organization ID (optional)"><input className="input-field" placeholder="org-�" value={f.org} onChange={e => set('org', e.target.value)} /></Field>
          <Field label="Model">
            <Select value={f.model} onValueChange={v => set('model', v)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6 (Recommended)</SelectItem>
                <SelectItem value="claude-opus-4-8">Claude Opus 4.8</SelectItem>
                <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast)</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Temperature" hint="0 = deterministic � 1 = creative">
            <input className="input-field" type="number" step="0.1" min="0" max="2" value={f.temp} onChange={e => set('temp', e.target.value)} />
          </Field>
          <Field label="Max Tokens"><input className="input-field" type="number" value={f.maxTokens} onChange={e => set('maxTokens', e.target.value)} /></Field>
        </>}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: SMS ------------------------------------------------------------
const SMSSection: React.FC = () => {
  const [provider, setProvider] = useState('africas_talking');
  const [f, set] = useSettingsFields('int-sms', { atUser: '', atKey: '', atSender: '', twilioSid: '', twilioToken: '', twilioFrom: '' });
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['int-sms']) { setProvider(s['int-sms'].provider ?? 'africas_talking'); hydratedExtra.current = true; }
  }, [s]);

  async function handleSave() { setSaving(true); try { await save('int-sms', { provider, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="SMS Provider">
        <Field label="Provider">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="africas_talking">Africa's Talking</SelectItem>
              <SelectItem value="twilio">Twilio</SelectItem>
              <SelectItem value="nexmo">Vonage / Nexmo</SelectItem>
              <SelectItem value="bongolive">BongoLive (Tanzania)</SelectItem>
              <SelectItem value="none">Disabled</SelectItem>
            </SelectContent>
          </Select>
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

// -- section: TRA VFD (Tax Fiscalization) ------------------------------------
const TRASection: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [tin, setTin] = useState('');
  const [certKey, setCertKey] = useState('');
  const [certSerial, setCertSerial] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'production'>('test');
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [pfxPassword, setPfxPassword] = useState('');
  const [pfxPath, setPfxPath] = useState('');

  const [uploading, setUploading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenRefreshing, setTokenRefreshing] = useState(false);
  const [zReporting, setZReporting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  function loadConfig() {
    setLoading(true);
    apiFetch('/v1/tra/config')
      .then((d: any) => setConfig(d))
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }
  useEffect(() => { loadConfig(); }, []);

  async function uploadCert() {
    if (!pfxFile) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', pfxFile);
      const result = await apiFetch('/v1/tra/upload-cert', { method: 'POST', body: formData });
      setPfxPath(result.pfx_path);
    } catch (err: any) {
      setError(err?.message || 'Certificate upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function register() {
    if (!tin || !certKey || !certSerial || !pfxPath) {
      setError('TIN, cert key, cert serial and an uploaded certificate are all required');
      return;
    }
    setRegistering(true);
    setError(null);
    try {
      await apiFetch('/v1/tra/register', {
        method: 'POST',
        body: JSON.stringify({ tin, cert_key: certKey, cert_serial: certSerial, pfx_path: pfxPath, pfx_password: pfxPassword, environment }),
      });
      loadConfig();
    } catch (err: any) {
      setError(err?.message || 'TRA registration failed');
    } finally {
      setRegistering(false);
    }
  }

  async function refreshToken() {
    setTokenRefreshing(true);
    setActionMsg(null);
    try {
      await apiFetch('/v1/tra/token', { method: 'POST' });
      setActionMsg('Token refreshed successfully.');
      loadConfig();
    } catch (err: any) {
      setActionMsg(err?.message || 'Token refresh failed');
    } finally {
      setTokenRefreshing(false);
    }
  }

  async function runZReport() {
    setZReporting(true);
    setActionMsg(null);
    try {
      const result = await apiFetch('/v1/tra/z-report', { method: 'POST' });
      setActionMsg(result.ackMsg || 'Z-report submitted successfully.');
      loadConfig();
    } catch (err: any) {
      setActionMsg(err?.message || 'Z-report submission failed');
    } finally {
      setZReporting(false);
    }
  }

  if (loading) {
    return <Card title="TRA VFD / EFDMS"><div className="s-fld--full s-gen-sub">Loading�</div></Card>;
  }

  if (config?.isRegistered) {
    return (
      <>
        <Card title="TRA VFD � Registered" desc="Fiscal receipts are signed and submitted to TRA through this registration. Invoices can now be submitted to TRA from Finance ? Sales Invoices.">
          <Field label="Status"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700 }}><Icon name="checkCircle" size={14} color="#059669" /> Registered</span></Field>
          <Field label="Environment"><span style={{ textTransform: 'uppercase', fontWeight: 700, color: config.environment === 'production' ? 'var(--red)' : 'var(--ink2)' }}>{config.environment}</span></Field>
          <Field label="REGID"><span style={{ fontFamily: 'var(--mono)' }}>{config.reg_id}</span></Field>
          <Field label="Receipt Code"><span style={{ fontFamily: 'var(--mono)' }}>{config.receipt_code}</span></Field>
          <Field label="VRN"><span style={{ fontFamily: 'var(--mono)' }}>{config.vrn || '�'}</span></Field>
          <Field label="Tax Office">{config.tax_office || '�'}</Field>
          <Field label="Receipts Issued (GC)">{config.gc ?? 0}</Field>
          <Field label="Bearer Token"><span style={{ color: config.hasValidToken ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{config.hasValidToken ? 'Valid' : 'Expired � will auto-refresh on next submission'}</span></Field>
          <Field label="Last Z-Report">{config.last_zreport_date ? new Date(config.last_zreport_date).toLocaleDateString() : 'Never'}</Field>
        </Card>
        <Card title="Manual Actions" desc="Z-reports submit automatically every night. Use these only to test the connection or recover from a missed run.">
          <div className="s-fld--full" style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={refreshToken} disabled={tokenRefreshing}>{tokenRefreshing ? 'Refreshing�' : 'Refresh Token'}</button>
            <button type="button" className="btn btn-secondary" onClick={runZReport} disabled={zReporting}>{zReporting ? 'Submitting�' : 'Submit Z-Report Now'}</button>
          </div>
          {actionMsg && <div className="s-fld--full" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink2)' }}>{actionMsg}</div>}
        </Card>
      </>
    );
  }

  return (
    <>
      <Card title="TRA VFD Registration" desc="One-time registration with the Tanzania Revenue Authority's Virtual Fiscal Device (EFDMS) API. You'll need the TIN, the device certificate key/serial TRA issued you, and the .pfx certificate file TRA provided. Once registered, invoices can be submitted for fiscalization from Finance ? Sales Invoices.">
        <Field label="Environment">
          <Select value={environment} onValueChange={v => setEnvironment(v as 'test' | 'production')}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="test">Test / Sandbox</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="TIN" hint="Taxpayer Identification Number"><input title="TIN" placeholder="000-000-000" className="input-field" value={tin} onChange={e => setTin(e.target.value)} /></Field>
        <Field label="Cert Key" hint="CERTKEY / EFDSERIAL, e.g. 10TZ0001"><input title="Cert Key" placeholder="10TZ0001" className="input-field" value={certKey} onChange={e => setCertKey(e.target.value)} /></Field>
        <Field label="Cert Serial" hint="Certificate serial number issued by TRA"><input title="Cert Serial" placeholder="Cert serial" className="input-field" value={certSerial} onChange={e => setCertSerial(e.target.value)} /></Field>
        <Field label=".pfx Certificate File" full>
          <input title="Certificate file" className="input-field" type="file" accept=".pfx,.p12" onChange={e => setPfxFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Certificate Password"><input title="Certificate Password" placeholder="Certificate password" className="input-field" type="password" value={pfxPassword} onChange={e => setPfxPassword(e.target.value)} /></Field>
        <div className="s-fld--full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={uploadCert} disabled={!pfxFile || uploading}>
            {uploading ? 'Uploading�' : pfxPath ? 'Re-upload Certificate' : 'Upload Certificate'}
          </button>
          {pfxPath && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}><Icon name="check" size={12} color="var(--green)" /> Uploaded</span>}
        </div>
      </Card>
      {error && <div className="s-fld--full" style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 4 }}>{error}</div>}
      <div className="s-save-row">
        <button type="button" className="btn btn-primary" onClick={register} disabled={registering || !pfxPath}>
          {registering ? 'Registering�' : 'Register with TRA'}
        </button>
      </div>
    </>
  );
};

// -- section: PDF ------------------------------------------------------------
const PDFSection: React.FC = () => {
  const [f, set] = useSettingsFields('other-pdf', { engine: 'wkhtmltopdf', paper: 'A4', orient: 'portrait', mTop: '10', mRight: '10', mBottom: '10', mLeft: '10' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('other-pdf', { ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="PDF Engine & Layout">
        <Field label="PDF Generator">
          <Select value={f.engine} onValueChange={v => set('engine', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="wkhtmltopdf">wkhtmltopdf (Recommended)</SelectItem>
              <SelectItem value="puppeteer">Puppeteer / Chromium</SelectItem>
              <SelectItem value="dompdf">DomPDF</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Paper Size">
          <Select value={f.paper} onValueChange={v => set('paper', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4 (210�297mm)</SelectItem>
              <SelectItem value="Letter">Letter (8.5�11in)</SelectItem>
              <SelectItem value="A3">A3 (297�420mm)</SelectItem>
              <SelectItem value="Legal">Legal (8.5�14in)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Orientation">
          <Select value={f.orient} onValueChange={v => set('orient', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
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


// -- section: Modules --------------------------------------------------------
// Real module-enable system (same data source as Utilities.tsx's Modules
// block): the tenant's actual entitled apps + the `enabled-apps` override map
// fetched via GET /v1/settings, PATCHed back as a full override map and
// followed by resetEntitlementsCache() so the nav picks up the change.
const ModulesSection: React.FC = () => {
  const { user } = useAuth();
  const canManageModules = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role);
  const entitlements = useEntitlements();
  const [overrides, setOverrides] = useState<Record<string, boolean> | null>(null);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/settings').then(res => setOverrides(res.settings?.['enabled-apps'] || {})).catch(() => setOverrides({}));
  }, []);

  const moduleKeys = entitlements ? Object.keys(entitlements.features).filter(k => k in APP_META) : [];

  async function toggleModule(key: string, nextOn: boolean) {
    // The settings PATCH replaces the whole 'enabled-apps' object rather than deep-merging it,
    // so every save must include the full override map, not just the key that changed.
    const nextOverrides = { ...(overrides ?? {}), [key]: nextOn };
    const prevOverrides = overrides;
    setOverrides(nextOverrides);
    setModuleSaving(key);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': nextOverrides }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      // The API now answers 403 naming the feature and the plan when a
      // module is not included, instead of scrubbing it to false behind a
      // 200. That sentence is the whole message.
      showAlert(err.message || 'That module could not be changed.', {
        title: /plan/i.test(err.message || '') ? 'Not in your plan' : 'Could not update module',
        variant: /plan/i.test(err.message || '') ? 'warning' : 'error',
      });
    } finally {
      setModuleSaving(null);
    }
  }

  return (
    <div>
      <p className="s-mods-desc">
        {canManageModules
          // Was 'every plan includes every module'. That stopped being true with
          // migration 213, which gave the eight ungated apps real feature keys —
          // a plan can now genuinely exclude one, and the switch says so.
          ? 'Turn applications on or off for everyone in this workspace. A module your plan does not include cannot be switched on here.'
          : 'Apps enabled for this account. Ask an admin to change these.'}
      </p>
      {!entitlements || overrides === null ? (
        <p style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading modules…</p>
      ) : (
        <div className="s-mods-grid">
          {moduleKeys.map(key => {
            const meta = APP_META[key];
            const on = overrides[key] ?? entitlements.features[key] ?? true;
            const maintenance = entitlements.appStatus[key] === 'maintenance';
            return (
              <div key={key} className={`s-mod-card${on ? ' s-mod-card--on' : ''}`} style={{ opacity: maintenance ? 0.6 : 1 }}>
                <div className={`s-mod-icon${on ? ' s-mod-icon--on' : ''}`}>
                  <Icon name={meta.icon} size={20} strokeWidth={1.8} color={on ? 'var(--teal)' : 'var(--ink3)'} />
                </div>
                <div className="s-mod-body">
                  <div className="s-mod-name">{meta.name}</div>
                  <div className="s-mod-desc">{maintenance ? 'Under maintenance' : meta.desc}</div>
                  <Toggle value={on} onChange={v => toggleModule(key, v)} disabled={!canManageModules || maintenance || moduleSaving === key} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// -- section: Notifications --------------------------------------------------
const NotificationsSection: React.FC = () => {
  const { s, save } = useContext(SettingsCtx);
  const [whatsapp, setWhatsapp] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [demurrageDays, setDemurrageDays] = useState(3);
  const [slaHours, setSlaHours] = useState(24);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s.notifications) {
      const d = s.notifications;
      setWhatsapp(d.whatsapp ?? true);
      setEmailNotifs(d.email ?? false);
      setDemurrageDays(d.demurrage_alert_days ?? 3);
      setSlaHours(d.sla_reminder_hours ?? 24);
      hydrated.current = true;
    }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('notifications', { whatsapp, email: emailNotifs, demurrage_alert_days: demurrageDays, sla_reminder_hours: slaHours }); } catch {}
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Channels" desc="Choose how your team and customers receive notifications">
        <ToggleRow label="WhatsApp Notifications" hint="Send stage updates via WhatsApp Business API � configure credentials in Integrations ? SMS / WhatsApp" value={whatsapp} onChange={setWhatsapp} />
        <ToggleRow label="Email Notifications" hint="Send update emails � requires SMTP configured in General ? Email" value={emailNotifs} onChange={setEmailNotifs} />
      </Card>
      <Card title="Alert Thresholds" desc="When to trigger proactive alerts for time-sensitive events">
        <Field label="Demurrage Alert Lead Time" hint="Days before container free time ends to trigger demurrage alert">
          <input type="number" min={1} max={30} className="input-field s-num-sm" value={demurrageDays} onChange={e => setDemurrageDays(Number(e.target.value))} />
        </Field>
        <Field label="SLA Breach Reminder" hint="Hours before SLA deadline to send reminder to assigned officer">
          <input type="number" min={1} max={168} className="input-field s-num-sm" value={slaHours} onChange={e => setSlaHours(Number(e.target.value))} />
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: ClearOS / Freight app settings ---------------------------------
const FREIGHT_STAGES = [
  'DOCS_RECEIVED','VALIDATION','PERMITS','ENTRY_PREP','TANCIS_REG',
  'ASSESSMENT','TAX_PAYMENT','DO_APPLICATION','INSPECTION_BOOKING','INSPECTION',
  'GOV_REMARKS','RELEASE','ICD_PAYMENT','GATE_PASS','TRANSPORT',
  'DELIVERY','EMPTY_RETURN','INVOICING','CLOSED',
];
const FREIGHT_SLA_DEFAULTS: Record<string, number> = {
  DOCS_RECEIVED:1, VALIDATION:2, PERMITS:3, ENTRY_PREP:1,
  TANCIS_REG:2, ASSESSMENT:3, TAX_PAYMENT:1, DO_APPLICATION:2,
  INSPECTION_BOOKING:1, INSPECTION:2, GOV_REMARKS:3, RELEASE:1,
  ICD_PAYMENT:1, GATE_PASS:1, TRANSPORT:2, DELIVERY:1,
  EMPTY_RETURN:5, INVOICING:3, CLOSED:1,
};

const FreightSection: React.FC = () => {
  const { s, save } = useContext(SettingsCtx);
  const [freeTime, setFreeTime] = useState(7);
  const [autoRisk, setAutoRisk] = useState(true);
  const [sla, setSla] = useState({ ...FREIGHT_SLA_DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s.freight) {
      const d = s.freight;
      setFreeTime(d.free_time_days ?? 7);
      setAutoRisk(d.auto_risk_flags ?? true);
      if (d.sla_days) setSla({ ...FREIGHT_SLA_DEFAULTS, ...d.sla_days });
      hydrated.current = true;
    }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('freight', { free_time_days: freeTime, auto_risk_flags: autoRisk, sla_days: sla }); } catch {}
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Container & Demurrage" desc="Default thresholds for demurrage and risk calculation">
        <Field label="Default Container Free Time" hint="Days before demurrage charges begin">
          <input type="number" min={1} max={60} className="input-field s-num-sm" value={freeTime} onChange={e => setFreeTime(Number(e.target.value))} />
        </Field>
        <ToggleRow label="Auto Risk Flagging" hint="Automatically flag shipments that breach demurrage or SLA thresholds" value={autoRisk} onChange={setAutoRisk} />
      </Card>
      <Card title="SLA Stage Limits" desc="Maximum working days allowed per clearance stage before a breach is flagged" twoCol>
        {FREIGHT_STAGES.map(stage => (
          <div key={stage} className="s-sla-row">
            <span className="s-sla-stage">{stage.replace(/_/g,' ')}</span>
            <div className="s-sla-right">
              <input type="number" min={1} max={30} className="input-field s-sla-in" value={sla[stage] ?? 2} onChange={e => setSla(p => ({ ...p, [stage]: Number(e.target.value) }))} />
              <span className="s-sla-unit">days</span>
            </div>
          </div>
        ))}
      </Card>
      <p className="s-fld-hint" style={{ margin: '4px 2px 12px' }}>
        Per-stage SLA targets shown here are reference/planning values — live enforcement uses each shipment's assigned Workflow (see ClearOS ▸ Workflow Builder).
      </p>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- API Keys (developer / partner access) -----------------------------------
const API_SCOPE_OPTIONS = [
  'ai', 'clearos', 'cloud', 'complyos', 'contacts', 'email', 'finops', 'oneid', 'nexushr', 'tracking',
];

interface ApiKeyRow {
  id: string; name: string; key_prefix: string; scopes: string[];
  last_used_at: string | null; revoked_at: string | null; created_at: string;
}

const ApiKeysSection: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ total_calls: number; error_calls: number; top_endpoints: { endpoint: string; count: number }[] } | null>(null);

  function reload() {
    apiFetch('/v1/api-keys').then(res => setKeys(res.keys || [])).finally(() => setLoading(false));
    apiFetch('/v1/api-keys/usage').then(setUsage).catch(() => {});
  }
  useEffect(() => { reload(); }, []);

  function toggleScope(scope: string) {
    setNewScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  }

  async function createKey() {
    if (!newName.trim() || newScopes.length === 0) return;
    setCreating(true);
    try {
      const res = await apiFetch('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: newName.trim(), scopes: newScopes }) });
      setMintedKey(res.key);
      setNewName(''); setNewScopes([]);
      reload();
    } catch (err: any) {
      showAlert(`Failed to create key: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!(await showConfirm('Revoke this API key? Any application using it will immediately lose access.', { confirmLabel: 'Revoke' }))) return;
    await apiFetch(`/v1/api-keys/${id}`, { method: 'DELETE' });
    setKeys(prev => prev.map(k => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k));
  }

  return (
    <>
      <Card title="API Keys" desc="Programmatic access for partner integrations and scripts. Each key is scoped to specific features and limited by your plan." action={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={13} /> New Key
        </button>
      }>
        <div className="s-fld--full">
          {loading ? (
            <p style={{ color: 'var(--ink3)' }}>Loading�</p>
          ) : keys.length === 0 ? (
            <p style={{ color: 'var(--ink3)' }}>No API keys yet. Create one to get started.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Name', 'Key', 'Scopes', 'Last Used', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: 'var(--ink)' }}>{k.name}</td>
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{k.key_prefix}�</td>
                    <td style={{ padding: '8px', color: 'var(--ink2)' }}>{k.scopes.join(', ')}</td>
                    <td style={{ padding: '8px', color: 'var(--ink3)' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: k.revoked_at ? 'var(--red)' : 'var(--green)', background: k.revoked_at ? '#fef2f2' : '#ecfdf5' }}>
                        {k.revoked_at ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {!k.revoked_at && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => revokeKey(k.id)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {usage && (
        <Card title="Usage (last 30 days)" desc="Calls made across all of this tenant's API keys and sessions.">
          <div className="s-fld--full" style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
            <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{usage.total_calls}</div><div style={{ fontSize: 11, color: 'var(--ink3)' }}>Total calls</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{usage.error_calls}</div><div style={{ fontSize: 11, color: 'var(--ink3)' }}>Errors</div></div>
          </div>
          {usage.top_endpoints.length > 0 && (
            <div className="s-fld--full">
              {usage.top_endpoints.map(e => (
                <div key={e.endpoint} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--ink2)', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{e.endpoint}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setMintedKey(null); }}>
          <div className="card" style={{ width: 440, padding: 26 }} onClick={e => e.stopPropagation()}>
            {mintedKey ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Key created</div>
                <p style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>Copy this now � it won't be shown again.</p>
                <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 12, wordBreak: 'break-all', marginBottom: 16 }}>{mintedKey}</div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setShowCreate(false); setMintedKey(null); }}>Done</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>New API Key</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Name</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Warehouse integration" className="input-field" style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Scopes</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
                    {API_SCOPE_OPTIONS.map(scope => (
                      <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={newScopes.includes(scope)} onChange={() => toggleScope(scope)} />
                        {scope}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={creating || !newName.trim() || newScopes.length === 0} onClick={createKey}>
                    {creating ? 'Creating�' : 'Create Key'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// -- generic fallback --------------------------------------------------------
const GenericSection: React.FC<{ title: string }> = ({ title }) => (
  <Card title={title}>
    <div className="s-fld--full s-gen-body">
      <div className="s-gen-icon-wrap">
        <div className="s-gen-icon">
          <Icon name="settings" size={26} strokeWidth={1.6} color="var(--ink3)" />
        </div>
      </div>
      <div className="s-gen-title">Configuration pending</div>
      <div className="s-gen-sub">This section will be available in an upcoming release.</div>
    </div>
  </Card>
);

/**
 * Where the finance configuration actually lives.
 *
 * This screen used to carry its own Tax Rates, Currencies, Quotations and
 * Purchase Orders panels. All four saved to keys nothing in the platform ever
 * read, while the real implementations sat in FinOps the whole time — so an
 * admin could spend an afternoon configuring tax rates here and change nothing.
 * Four dead panels replaced by four working links.
 */
const ElsewhereSection: React.FC = () => (
  <Card title="Finance setup" desc="These are configured in FinOps, where they take effect.">
    <div className="s-elsewhere">
      {[
        { to: '/finance/tax-codes',       label: 'Tax codes & rates',  desc: 'Duty and VAT codes used by declarations, invoices and landed cost.' },
        { to: '/finance/quotations',      label: 'Quotations',         desc: 'Templates, numbering and validity for customer quotes.' },
        { to: '/finance/purchase-orders', label: 'Purchase orders',    desc: 'Approval flow and numbering for POs.' },
        { to: '/finance/expenses',        label: 'Expense categories', desc: 'The categories expenses are booked against.' },
      ].map(item => (
        <Link key={item.to} to={item.to} className="s-elsewhere-row">
          <div>
            <div className="s-elsewhere-label">{item.label}</div>
            <div className="s-elsewhere-desc">{item.desc}</div>
          </div>
          <Icon name="chevronRight" size={16} color="var(--ink3)" />
        </Link>
      ))}
    </div>
  </Card>
);


/**
 * The workspace's own identity.
 *
 * Branding lived only in the platform console, so a tenant administrator could
 * not put their own logo or colour on the workspace they pay for — even though
 * the theming engine is explicitly built to be overridden per tenant.
 *
 * What is offered here is bounded on purpose. The login screen is not: it is
 * pre-authentication and shared by every tenant, so one workspace rebranding it
 * would rebrand it for everyone.
 */
const BrandingSection: React.FC = () => {
  const branding = useBranding();
  const [workspaceName, setWorkspaceName] = useState('');
  const [logoLight, setLogoLight] = useState('');
  const [favicon, setFavicon] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/v1/settings/branding')
      .then((t: any) => {
        setWorkspaceName(t?.workspaceName ?? '');
        setLogoLight(t?.logoLight ?? '');
        setFavicon(t?.favicon ?? '');
        setAccentColor(t?.accentColor ?? '');
      })
      .catch(() => { /* a workspace with no branding of its own is the norm */ })
      .finally(() => setLoading(false));
  }, []);

  /** Downscaled through the same helper avatars use, so one idea of an image. */
  async function pickImage(file: File, set: (v: string) => void) {
    try {
      set(await squareAvatarDataUrl(file));
    } catch {
      showAlert('That image could not be read.', { variant: 'error' });
    }
  }

  async function save() {
    setSaving(true);
    try {
      // Empty string clears the override and falls back to the platform's,
      // which is why it is sent rather than omitted.
      await pushTenantBranding({
        workspaceName: workspaceName.trim(),
        logoLight,
        favicon,
        accentColor: accentColor.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e: any) {
      showAlert(e?.message || 'That branding could not be saved.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card title="Workspace branding"><p className="s-muted">Loading…</p></Card>;

  return (
    <>
      <Card
        title="Workspace branding"
        desc="Your logo, name and colour, as everyone in this workspace sees them. Leave a field empty to use the platform default."
        action={
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save branding'}
          </button>
        }
      >
        <Field label="Workspace name" hint="Shown in the browser tab and beside the logo.">
          <input
            className="input-field"
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            placeholder={branding.platformName}
          />
        </Field>

        <Field label="Brand colour" hint="Used by apps that have no colour of their own. Apps keep their own colours by design.">
          <div className="s-brand-colour">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#0f766e'}
              onChange={e => setAccentColor(e.target.value)}
              aria-label="Brand colour"
            />
            <input
              className="input-field"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              placeholder="#0f766e"
            />
            {accentColor && (
              <button type="button" className="s-brand-clear" onClick={() => setAccentColor('')}>Clear</button>
            )}
          </div>
        </Field>

        <Field label="Logo" full>
          <div className="s-brand-img">
            {logoLight
              ? <img src={logoLight} alt="Workspace logo" />
              : <div className="s-brand-img-none">Using the platform logo</div>}
            <div className="s-brand-img-actions">
              <label className="btn btn-secondary btn-sm">
                {logoLight ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f, setLogoLight); }} />
              </label>
              {logoLight && (
                <button type="button" className="s-brand-clear" onClick={() => setLogoLight('')}>Remove</button>
              )}
            </div>
          </div>
        </Field>

        <Field label="Favicon" full>
          <div className="s-brand-img">
            {favicon
              ? <img src={favicon} alt="Workspace favicon" className="s-brand-favicon" />
              : <div className="s-brand-img-none">Using the platform favicon</div>}
            <div className="s-brand-img-actions">
              <label className="btn btn-secondary btn-sm">
                {favicon ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f, setFavicon); }} />
              </label>
              {favicon && (
                <button type="button" className="s-brand-clear" onClick={() => setFavicon('')}>Remove</button>
              )}
            </div>
          </div>
        </Field>
      </Card>

      <Card title="What this does not change" desc="So nobody goes looking for a control that is deliberately absent.">
        <p className="s-muted">
          The sign-in screen is shared by every workspace on the platform, so its
          logo and wording are set by Hudumika rather than here. Each app also keeps
          its own colour — ClearOS orange, SEAL green — because telling them apart
          at a glance is what those colours are for; your brand colour applies to
          apps that have none.
        </p>
      </Card>
    </>
  );
};

// -- section routing ---------------------------------------------------------
function renderSection(key: string): React.ReactNode {
  switch (key) {
    case 'company':             return <CompanySection />;
    case 'elsewhere':           return <ElsewhereSection />;
    case 'branding':            return <BrandingSection />;
    case 'localization':        return <LocalizationSection />;
    case 'email':               return <EmailSection />;
    case 'notifications':       return <NotificationsSection />;
    case 'app-freight':         return <FreightSection />;
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
    case 'int-shipsgo':         return <ShipsGoSection />;
    case 'int-gpswox':          return <GpswoxSection />;
    case 'int-ai':
    case 'int-openai':          return <OpenAISection />;
    case 'int-sms':             return <SMSSection />;
    case 'int-tancis':          return <TRASection />;
    case 'other-pdf':           return <PDFSection />;
    case 'modules':             return <ModulesSection />;
    case 'developer-api':       return <ApiKeysSection />;
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

// -- main export -------------------------------------------------------------
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

  /**
   * Save one section.
   *
   * The endpoint merges by default, so a section that sends only the fields it
   * owns no longer wipes the rest of its object. `replace` is for the sections
   * whose payload genuinely is the complete set — payment gateways omits the
   * disabled ones rather than sending false, so merging would leave a
   * switched-off gateway on.
   */
  const saveSection = async (key: string, data: Record<string, any>, opts?: { replace?: boolean }) => {
    await apiFetch('/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify(opts?.replace ? { [key]: data, $replace: [key] } : { [key]: data }),
    });
    setGlobalSettings(prev => ({ ...prev, [key]: data }));
  };

  return (
    <SettingsCtx.Provider value={{ s: globalSettings, save: saveSection }}>
    <div className={isMobile ? 'sett-root sett-root--col' : 'sett-root'}>

      {/* -- inner sidebar -- */}
      <div className={isMobile ? 'sett-side sett-side--mob' : 'sett-side'}>
        <div className="sett-sb-hdr">
          <div className="sett-sb-brand">
            <Icon name="building" size={14} color="var(--ink2)" />
            <span className="sett-sb-name">Organization Settings</span>
          </div>
          <div className="sett-sb-sub">
            <span className="sett-sb-dot" />
            <span className="sett-sb-badge">Tenant configuration</span>
          </div>
        </div>

        {NAV.map(g => (
          <div key={g.group} className="sett-nav-grp">
            <span className="sett-nav-lbl">{g.group}</span>
            {g.items.map(item => {
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  title={item.label}
                  onClick={() => go(item.key)}
                  className={active ? 'sett-nav-btn sett-nav-btn--on' : 'sett-nav-btn'}
                >
                  <Icon name={item.icon} size={14} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* -- right content -- */}
      <div className={isMobile ? 'sett-content sett-content--mob' : 'sett-content'}>

        {/* Breadcrumb */}
        {!isMobile && (
          <div className="sett-bc">
            <div className="sett-bc-root">
              <Icon name="building" size={12} color="var(--ink3)" />
              Organization Settings
            </div>
            <Icon name="chevronRight" size={12} color="var(--ink3)" />
            <div className="sett-bc-cur">
              {getSectionTitle(current)}
            </div>
          </div>
        )}

        {/* System overview strip � only on the main Company tab */}
        {current === 'company' && (
          <div className="sett-strip">
            {([
              { label: 'Version',        value: 'v2.1.0',  icon: 'checkCircle' as IconName, icls: 'sett-strip-icon--g',  iclr: 'var(--green)' },
              { label: 'Active Modules', value: '4 / 8',   icon: 'grid'        as IconName, icls: 'sett-strip-icon--t',  iclr: 'var(--teal)'  },
              { label: 'Integrations',   value: '0 live',  icon: 'zap'         as IconName, icls: 'sett-strip-icon--bg', iclr: 'var(--ink3)'  },
              { label: 'System Status',  value: 'Healthy', icon: 'activity'    as IconName, icls: 'sett-strip-icon--g',  iclr: 'var(--green)' },
              { label: 'Last Backup',    value: 'Today',   icon: 'clock'       as IconName, icls: 'sett-strip-icon--bg', iclr: 'var(--ink2)'  },
            ] as const).map(s => (
              <div key={s.label} className="sett-strip-item">
                <div className={`sett-strip-icon ${s.icls}`}>
                  <Icon name={s.icon} size={14} color={s.iclr} />
                </div>
                <div className="sett-strip-info">
                  <div className="sett-strip-val">{s.value}</div>
                  <div className="sett-strip-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sett-pg-hdr">
          <h1 className="sett-pg-h1">{getSectionTitle(current)}</h1>
        </div>
        {renderSection(current)}
      </div>

    </div>
    </SettingsCtx.Provider>
  );
};
