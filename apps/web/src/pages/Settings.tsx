import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { getCompany, setCompany } from '../data/companyStore.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import type { MetricCardProps } from '../components/MetricCard.js';
import { refreshTenantLocale } from '../lib/tenantLocale.js';
import { pushTenantBranding, useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import type { SupportedLocale } from '../i18n/index.js';
import './Settings.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { Badge } from '../components/ui/badge.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeatureToggleRow } from '../components/ui/list-item-row.js';
import { SectionCard } from '../components/SectionCard.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { Button } from '../components/ui/button.js';
import { Switch } from '../components/ui/switch.js';
import { LauncherAppSvg, LAUNCHER_APPS } from '../components/LauncherApps.js';
import { SignaturePad } from '../components/SignaturePad.js';
import { showAlert } from '../lib/alert.js';
import { UpgradeNotice } from '../components/UpgradeNotice.js';
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

// -- nav structure ------------------------------------------------------------
// Exported: AdminShell.tsx builds the main app sidebar's Settings entries
// straight from this array (one expandable top-level item per group) rather
// than hand-duplicating the same list in two places. This used to be 8
// groups, several down to a single item after the DEAD/STUB cleanup below —
// regrouped into 5 properly populated categories instead of leaving
// one-item groups (Platform, Sales, App Settings, Other) standing alone.
export const NAV: Array<{ group: string; icon: IconName; items: Array<{ key: string; label: string; icon: IconName }> }> = [
  { group: 'General', icon: 'settings', items: [
    { key: 'company',            label: 'Company Information',  icon: 'building'      },
    { key: 'localization',       label: 'Localization',         icon: 'globe'         },
    { key: 'landing-experience', label: 'Landing Experience',   icon: 'layoutDashboard' },
    // 'branding' removed as its own nav entry — merged into Company
    // Information's "Company Branding" card (workspace name/colour/logo/
    // favicon, all in one place; see CompanySection). ?s=branding still
    // resolves, via renderSection's redirect below, so old links don't 404.
    { key: 'modules',            label: 'Modules & Extensions', icon: 'grid'          },
    { key: 'email',              label: 'Email',                icon: 'mail'          },
    { key: 'notifications',      label: 'Notifications',        icon: 'bell'          },
  ]},
  { group: 'Finance', icon: 'dollarSign', items: [
    { key: 'finance-general',    label: 'General',              icon: 'dollarSign'    },
    // Now the real source of truth for Petti's wallet gateway and the
    // onboarding charge flow — see lib/payment-gateway.ts. Payment Modes
    // and e-Invoice were removed: no component, no backend, gated nothing.
    { key: 'payment-gateways',   label: 'Payment Gateways',     icon: 'creditCard'    },
    { key: 'invoices',           label: 'Invoices',             icon: 'fileText'      },
    // Tax rates, quotations, purchase orders and currencies each had a panel
    // here that saved to a key nothing read, while the real implementations
    // live in FinOps. One control per thing; this one points at it.
    // Expense Categories used to be its own entry too — unlike its siblings
    // it was genuinely live (FinanceExpenseNew.tsx really reads this key),
    // so it moved rather than got deleted: FinOps ▸ Expenses ▸ Manage
    // Categories (/finance/expenses/categories), same underlying data,
    // reachable from where it's actually used. The row below still points
    // there for anyone who lands here first.
    { key: 'elsewhere',          label: 'Finance setup',        icon: 'externalLink' },
    // Credit Notes and Subscriptions removed: no component, no backend —
    // real credit-note/subscription concepts live elsewhere (Customers,
    // seal-billing, SuperAdmin's Company Subscriptions), not this key.
  ]},
  // "Configure Features" (Customers/Tasks/Support/Leads) removed. Tasks,
  // Support and Leads had no component or backend at all. Customers' one
  // real, enforced toggle (Enable Customer Portal) moved to NexusHR ▸ Team
  // ▸ People, per the "control access from Team" decision — the rest of
  // that panel (self-registration, VAT field, groups) either gated a
  // feature that doesn't exist (no customer self-signup route anywhere) or
  // was write-only with no consumer, so it didn't move with it.
  { group: 'Apps', icon: 'package', items: [
    { key: 'app-freight',        label: 'ClearOS / Freight',    icon: 'package'       },
    // Calendar, PDF and Tags removed: no component, no backend (PDF's
    // "engine: wkhtmltopdf" option didn't even match how this platform
    // actually generates PDFs — pdfkit, everywhere).
    { key: 'other-esign',        label: 'E-Sign',               icon: 'stamp'         },
  ]},
  { group: 'Integrations', icon: 'globe', items: [
    { key: 'int-google',         label: 'Google',               icon: 'globe'         },
    // 'int-ai' and 'int-openai' were two NAV rows pointing at the exact same
    // component and the exact same settings key (OpenAISection / 'int-ai')
    // — not two settings, one form shown twice. Kept the one label that
    // doesn't imply a specific provider, since the model picker inside
    // isn't OpenAI-only.
    { key: 'int-ai',             label: 'AI Integration',       icon: 'sparkle'       },
    // SMS only: no tenant-level WhatsApp credential exists anywhere in the
    // platform — whatsapp.ts always uses the platform-wide META_* env vars,
    // and the tenant-override params it accepts have no caller. This label
    // used to claim a WhatsApp config that didn't exist here or anywhere.
    { key: 'int-sms',            label: 'SMS',                  icon: 'messageSquare' },
    { key: 'int-tancis',         label: 'TRA VFD / EFDMS',      icon: 'anchor'        },
    // 'int-tpa' (TPA Port Authority) removed: no component (fell through to
    // the "Configuration pending" placeholder), no backend, and no real TPA
    // API integration anywhere in the platform to eventually back it with —
    // same category as the other dead placeholders already removed.
    { key: 'int-shipsgo',        label: 'ShipsGo / Ship24',     icon: 'compass'       },
    { key: 'int-gpswox',         label: 'GPSWOX Fleet Tracking', icon: 'mapPin'       },
    // MinIO, Redis/BullMQ and the vague "General" tab are removed. They are
    // platform infrastructure — the object store and the queue backend the
    // operator configures with REDIS_URL and S3 env vars — not tenant settings.
    // Nothing read them from a tenant's settings, and a tenant admin has no
    // business configuring the platform's message queue; a settings tab for it
    // is a category error, not just a dead stub.
  ]},
  { group: 'Developer', icon: 'key', items: [
    { key: 'developer-api',      label: 'API Keys',             icon: 'key'           },
    // SIEM Export moved off this sidebar — it streams Ondi's own security
    // audit chain (ondi_auth_events), so Ondi's own nav is where a security
    // engineer configuring it actually looks, not tenant billing settings.
    // The section itself (SiemExportSection below) didn't move — same
    // /v1/settings-backed key, still reachable at ?s=siem-export — only the
    // sidebar entry did. See OndiShell.tsx's Business nav.
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
      {saving ? 'Saving…' : 'Save Changes'}
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
    businessType: co.businessType, contactPerson: co.contactPerson,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(co.logoUrl);
  const [logoUrlDark, setLogoUrlDark] = useState<string | null>(co.logoUrlDark);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(co.faviconUrl);
  const [saved, setSaved] = useState(false);

  // organization_id lives on the real tenants row, not the tenant_settings
  // JSONB blob SettingsCtx carries — fetched independently here rather than
  // threading a new field through the shared context, same as WorkspaceFacts
  // below does its own GET /v1/settings for what it needs.
  const [linkedOrg, setLinkedOrg] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    apiFetch('/v1/settings').then((r: any) => {
      const t = r?.tenant;
      if (t?.organization_id) setLinkedOrg({ id: t.organization_id, label: t.organization_name || 'Linked organization' });
    }).catch(() => {});
  }, []);

  // Workspace name + accent colour used to live in a separate "Branding"
  // section (pushTenantBranding/useBranding — feeds the in-app UI: sidebar,
  // browser tab, per-app accent) while this card only ever covered the logo
  // used on PDF documents. Two places to upload the same logo, easy to drift
  // — folded here instead, so this one card is the actual single source and
  // one Save writes both the document-branding store and the in-app one.
  const [workspaceName, setWorkspaceName] = useState('');
  const [accentColor, setAccentColor] = useState('');
  useEffect(() => {
    apiFetch('/v1/settings/branding').then((t: any) => {
      setWorkspaceName(t?.workspaceName ?? '');
      setAccentColor(t?.accentColor ?? '');
    }).catch(() => { /* no workspace override yet is the norm */ });
  }, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setLogoUrl(ev.target.result); };
    reader.readAsDataURL(file);
  }

  function handleLogoDarkChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setLogoUrlDark(ev.target.result); };
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
    setCompany({ name: f.name, email: f.email, phone: f.phone, website: f.website, taxId: f.vat, address: f.address, city: f.city, tagline: f.desc, businessType: f.businessType, contactPerson: f.contactPerson, logoUrl, logoUrlDark, faviconUrl });
    try { await apiSave('company', { name: f.name, email: f.email, phone: f.phone, website: f.website, vat: f.vat, address: f.address, city: f.city, state: f.state, zip: f.zip, country: f.country, desc: f.desc, businessType: f.businessType, contactPerson: f.contactPerson, logoUrl, logoUrlDark, faviconUrl, organizationId: linkedOrg?.id ?? null }); } catch {}
    // Same logo/favicon, pushed to the in-app UI branding store too — one
    // upload here is now the only place either gets set. Empty string clears
    // an override and falls back to the platform default, same as
    // pushTenantBranding's own contract, which is why logoUrl/faviconUrl are
    // coerced to '' rather than omitted when unset. logoDark was already a
    // supported field on that endpoint (TENANT_BRANDING_FIELDS in
    // settings.routes.ts) — nothing on this page ever sent it until now.
    try { await pushTenantBranding({ workspaceName: workspaceName.trim(), logoLight: logoUrl ?? '', logoDark: logoUrlDark ?? '', favicon: faviconUrl ?? '', accentColor: accentColor.trim() }); } catch {}
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
        <Field label="Business Type"><input className="input-field" value={f.businessType} onChange={e => set('businessType', e.target.value)} placeholder="e.g. Customs Clearing Agent" /></Field>
        <Field label="Contact Person"><input className="input-field" value={f.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></Field>
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
          <textarea className="input-field s-resize-v" rows={3} value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Short description of your company…" />
        </Field>
        <Field label="Linked Organization" full hint="If this workspace also serves as a customer of another clearing agent on Hudumika, link the same shared identity here so your team's own portal usage and your customer-portal usage (if any) are traceable to one company.">
          <EntityPicker
            value={linkedOrg}
            onChange={setLinkedOrg}
            search={async q => {
              const res = await apiFetch(`/v1/organizations?q=${encodeURIComponent(q)}`).catch(() => []);
              return (Array.isArray(res) ? res : []).map((o: any) => ({ id: o.id, label: o.name, sublabel: o.tax_id ? `TIN ${o.tax_id}` : undefined }));
            }}
            onCreate={async name => {
              const created = await apiFetch('/v1/organizations', { method: 'POST', body: JSON.stringify({ name }) });
              return { id: created.id, label: created.name };
            }}
            placeholder="Search or create an organization…"
          />
        </Field>
      </Card>
      <Card title="Company Branding" desc="Your workspace's name, colour, logo and favicon — used on PDF invoices, quotes and portal documents, and everywhere in the app your team signs into. The pre-authentication sign-in screen is shared by every workspace on the platform, so it isn't set here.">
        <Field label="Workspace Name" hint="Shown in the browser tab and beside your logo in the app.">
          <input className="input-field" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder={f.name || 'Your company name'} />
        </Field>
        <Field label="Brand Colour" hint="Used by apps that have no colour of their own — each app keeps its own by design.">
          <div className="s-brand-colour">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#0f766e'}
              onChange={e => setAccentColor(e.target.value)} aria-label="Brand colour" />
            <input className="input-field" value={accentColor} onChange={e => setAccentColor(e.target.value)} placeholder="#0f766e" />
            {accentColor && <button type="button" className="s-brand-clear" onClick={() => setAccentColor('')}>Clear</button>}
          </div>
        </Field>
        <Field label="Company Logo" hint="Recommended: 400×100px PNG or SVG" full>
          <label className={`s-upload${logoUrl ? ' s-upload--on' : ''}`}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo preview" className="s-upload-preview" />
              : <div className="s-upload-ph s-upload-ph--lg">LOGO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${logoUrl ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{logoUrl ? 'Logo uploaded · click to change' : 'Click to upload logo'}</div>
              <div className="s-upload-hint">PNG, SVG or JPG · max 2 MB</div>
            </div>
            {logoUrl && (
              <button type="button" title="Remove logo" onClick={e => { e.preventDefault(); setLogoUrl(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="#dc2626" />
              </button>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
        </Field>
        <Field label="Dark Mode Logo" hint="Shown wherever this logo renders on a dark background — invoices, quotes and purchase orders viewed in dark mode, and the in-app header when dark mode is on. Optional: falls back to the logo above if not set." full>
          <label className={`s-upload${logoUrlDark ? ' s-upload--on' : ''}`}>
            {logoUrlDark
              ? <div className="s-upload-preview-dark-wrap"><img src={logoUrlDark} alt="Dark mode logo preview" className="s-upload-preview" /></div>
              : <div className="s-upload-ph s-upload-ph--lg">LOGO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${logoUrlDark ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{logoUrlDark ? 'Dark-mode logo uploaded · click to change' : 'Click to upload a dark-mode variant'}</div>
              <div className="s-upload-hint">PNG or SVG, ideally with a transparent background · max 2 MB</div>
            </div>
            {logoUrlDark && (
              <button type="button" title="Remove dark-mode logo" onClick={e => { e.preventDefault(); setLogoUrlDark(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="#dc2626" />
              </button>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoDarkChange} />
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
        <Field label="Favicon" hint="512×512px · PNG, JPG, SVG or ICO">
          <label className={`s-upload s-upload--sm${faviconUrl ? ' s-upload--on' : ''}`}>
            {faviconUrl
              ? <img src={faviconUrl} alt="Favicon preview" className="s-upload-preview--sq" />
              : <div className="s-upload-ph s-upload-ph--sq">ICO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${faviconUrl ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{faviconUrl ? 'Favicon uploaded · click to change' : 'Upload favicon'}</div>
              <div className="s-upload-hint">512×512px · PNG, JPG, SVG or ICO</div>
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

// -- section: Landing Experience ---------------------------------------------
// The tenant's default for Basic (Agentic) vs Advanced at "/" — a user's own
// choice (the header toggle, PATCH /auth/me's profile.landing_style) always
// overrides this for their own account; this is only the fallback everyone
// else gets. Same useSettingsFields/save('landingStyle', ...) shape as
// LocalizationSection above, ADMIN+ only (settings.routes.ts's
// MANAGER_WRITABLE allowlist deliberately does not include this key).
const LandingExperienceSection: React.FC = () => {
  const [f, set] = useSettingsFields('landingStyle', { mode: 'advanced' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      await save('landingStyle', { ...f });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Landing Experience" desc="What everyone in this workspace sees at sign-in by default.">
        <Field label="Default landing page">
          <Select value={f.mode} onValueChange={v => set('mode', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="advanced">Advanced — the app launcher</SelectItem>
              <SelectItem value="basic">Basic — the agentic cockpit</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: SIEM Export -----------------------------------------------------
// Fans Ondi's audit chain (ondi_auth_events — every login, KYC decision,
// role grant/revoke, password/email change) out to a tenant-configured
// webhook, signed the way Stripe/GitHub sign theirs: HMAC-SHA256 over the
// raw JSON body, sent as X-Ondi-Signature. Any SIEM that can ingest a
// signed HTTPS POST works — Splunk HEC, Sentinel, Datadog, or a tenant's
// own collector — rather than one bespoke vendor integration. Dispatch
// itself lives in siem-export.ts, fired (unawaited) from recordAuthEvent.
const SiemExportSection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useSettingsFields('siemExport', { webhookUrl: '', secret: '' });
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);
  const entitlements = useEntitlements();
  // undefined while loading — default to entitled so this doesn't flash an
  // upgrade prompt before /v1/entitlements resolves.
  const governanceEntitled = entitlements ? entitlements.features['ondi.governance'] !== false : true;

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.siemExport) { setOn(s.siemExport.enabled ?? false); hydratedExtra.current = true; }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('siemExport', { enabled: on, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch {} finally { setSaving(false); }
  }

  return (
    <>
      <Card title="SIEM Export" desc="Send every Ondi security event (logins, KYC decisions, role grants, credential changes) to your own SIEM or log collector as a signed webhook, in real time.">
        {!governanceEntitled ? (
          <UpgradeNotice
            title="Enterprise Identity & Governance"
            message="SIEM/webhook export needs this add-on, alongside SAML SSO and time-boxed role grants."
          />
        ) : (
          <>
            <ToggleRow label="Enable SIEM export" value={on} onChange={setOn} />
            {on && <>
              <Field label="Webhook URL" full hint="Ondi POSTs a JSON event here as it happens.">
                <input className="input-field" type="url" placeholder="https://your-siem.example.com/ingest" value={f.webhookUrl} onChange={e => set('webhookUrl', e.target.value)} />
              </Field>
              <Field label="Signing Secret" full hint="Verify the X-Ondi-Signature header: HMAC-SHA256 of the raw request body, hex-encoded, using this secret.">
                <input className="input-field" type="password" value={f.secret} onChange={e => set('secret', e.target.value)} />
              </Field>
            </>}
          </>
        )}
      </Card>
      {governanceEntitled && <SaveRow saving={saving} saved={saved} onSave={handleSave} />}
    </>
  );
};

// -- section: Email ----------------------------------------------------------
const OAUTH_PROVIDER_LABEL: Record<string, string> = { outlook: 'Microsoft Outlook', gmail: 'Gmail' };

const EmailSection: React.FC = () => {
  const [protocol, setProtocol] = useState('smtp');
  const [f, set] = useSettingsFields('email', {
    host: '', port: '587', user: '', pass: '', enc: 'tls', fromName: 'Hudumika', fromEmail: '', sig: '',
    outlookClientId: '', outlookClientSecret: '', outlookStatus: '',
    gmailClientId: '', gmailClientSecret: '', gmailStatus: '',
  });
  const [imap, setImap] = useSettingsFields('ticketImap', {
    host: '', port: '993', encryption: 'ssl', user: '', pass: '', targetDepartment: '', ticketType: 'general',
  });
  const [imapEnabled, setImapEnabled] = useState(false);
  const [imapMarkAsRead, setImapMarkAsRead] = useState(true);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [oauthNotice, setOauthNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const hydratedExtra = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.email) {
      setProtocol(s.email.protocol ?? 'smtp');
      hydratedExtra.current = true;
    }
    if (s.ticketImap) {
      setImapEnabled(!!s.ticketImap.enabled);
      setImapMarkAsRead(s.ticketImap.markAsRead ?? true);
    }
  }, [s]);

  // Landed here fresh off an OAuth callback redirect (mail-oauth.routes.ts)
  // — show what happened once, then strip the query params so a page
  // refresh doesn't re-show a stale result.
  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (!oauth) return;
    const provider = searchParams.get('provider') ?? '';
    const msg = searchParams.get('msg');
    const label = OAUTH_PROVIDER_LABEL[provider] ?? provider;
    setOauthNotice({
      ok: oauth === 'success',
      msg: oauth === 'success' ? `${label} connected successfully.` : (msg || `Failed to connect ${label}.`),
    });
    const next = new URLSearchParams(searchParams);
    next.delete('oauth'); next.delete('provider'); next.delete('msg');
    setSearchParams(next, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      await save('email', { protocol, ...f });
      await save('ticketImap', { ...imap, enabled: imapEnabled, markAsRead: imapMarkAsRead });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }

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

  // Save first (so the Client ID/Secret the user just typed actually exist
  // server-side), then fetch the real authorize URL via an authenticated
  // apiFetch call, and only then navigate the browser there — a plain
  // window.location.href straight to our own API would carry no
  // Authorization header (this app's JWT lives in localStorage, not a
  // cookie) and 401 before ever reaching Microsoft/Google.
  async function handleConnect(provider: 'outlook' | 'gmail') {
    setConnecting(provider);
    try {
      await save('email', { protocol, ...f });
      const { url } = await apiFetch(`/v1/settings/email/${provider}/authorize`);
      window.location.href = url;
    } catch (err: any) {
      setOauthNotice({ ok: false, msg: err?.message || `Failed to start ${OAUTH_PROVIDER_LABEL[provider]} authorization.` });
      setConnecting(null);
    }
  }

  return (
    <>
      {oauthNotice && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: oauthNotice.ok ? 'var(--green-l, #ecfdf5)' : 'var(--red-l, #fef2f2)',
          color: oauthNotice.ok ? 'var(--green, #059669)' : 'var(--red, #dc2626)',
        }}>
          {oauthNotice.msg}
        </div>
      )}
      <Card title="Email Protocol">
        <Field label="Protocol">
          <Select value={protocol} onValueChange={setProtocol}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="smtp">SMTP</SelectItem>
              <SelectItem value="mail">Mail (Hudumika's own server)</SelectItem>
              <SelectItem value="outlook">Microsoft Outlook</SelectItem>
              <SelectItem value="gmail">Gmail</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>
      {protocol === 'smtp' && (
        <Card title="SMTP Configuration">
          <Field label="SMTP Host"><input className="input-field" placeholder="mail.example.com" value={f.host} onChange={e => set('host', e.target.value)} /></Field>
          <Field label="Port"><input className="input-field" type="number" value={f.port} onChange={e => set('port', e.target.value)} /></Field>
          <Field label="Username"><input className="input-field" placeholder="your@email.com" value={f.user} onChange={e => set('user', e.target.value)} /></Field>
          <Field label="Password" hint={f.pass === '••••••••' ? 'A password is already saved — re-enter it only if you want to change it.' : undefined}>
            <input className="input-field" type="password" value={f.pass} onChange={e => set('pass', e.target.value)} />
          </Field>
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
      {protocol === 'mail' && (
        <Card title="Mail (system default)">
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>
            Sends through Hudumika's own outgoing mail server — no setup needed. Switch to SMTP, Outlook or Gmail above if you'd rather send from your own domain/mailbox.
          </p>
        </Card>
      )}
      {(protocol === 'outlook' || protocol === 'gmail') && (
        <Card title={`${OAUTH_PROVIDER_LABEL[protocol]} Connection`}>
          <Field label="Client ID">
            <input className="input-field" value={protocol === 'outlook' ? f.outlookClientId : f.gmailClientId}
              onChange={e => set(protocol === 'outlook' ? 'outlookClientId' : 'gmailClientId', e.target.value)} />
          </Field>
          <Field label="Client Secret"
            hint={(protocol === 'outlook' ? f.outlookClientSecret : f.gmailClientSecret) === '••••••••' ? 'A secret is already saved — re-enter it only if you want to change it.' : undefined}>
            <input className="input-field" type="password" value={protocol === 'outlook' ? f.outlookClientSecret : f.gmailClientSecret}
              onChange={e => set(protocol === 'outlook' ? 'outlookClientSecret' : 'gmailClientSecret', e.target.value)} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Badge variant={(protocol === 'outlook' ? f.outlookStatus : f.gmailStatus) === 'authorized' ? 'success' : 'gray'}>
              {(protocol === 'outlook' ? f.outlookStatus : f.gmailStatus) === 'authorized' ? 'Authorized' : 'Unauthorized'}
            </Badge>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleConnect(protocol as 'outlook' | 'gmail')} disabled={connecting === protocol}>
              {connecting === protocol ? 'Connecting…' : 'Save & Authorize'}
            </button>
          </div>
        </Card>
      )}
      <Card title="Sender Identity">
        <Field label="From Name"><input className="input-field" value={f.fromName} onChange={e => set('fromName', e.target.value)} /></Field>
        <Field label="From Email"><input className="input-field" type="email" value={f.fromEmail} onChange={e => set('fromEmail', e.target.value)} /></Field>
        <Field label="Email Signature" full>
          <textarea className="input-field s-resize-v s-font-mono" rows={4} value={f.sig} onChange={e => set('sig', e.target.value)} placeholder="HTML signature appended to outgoing emails" />
        </Field>
      </Card>
      <Card title="Inbound Mail (Support Tickets)">
        <ToggleRow
          label="Convert incoming email into support tickets"
          hint="Polls this mailbox every few minutes — a reply referencing an existing ticket is appended to it; anything else from a known customer opens a new one."
          value={imapEnabled} onChange={setImapEnabled}
        />
        {imapEnabled && (
          <>
            <Field label="IMAP Host"><input className="input-field" placeholder="imap.example.com" value={imap.host} onChange={e => setImap('host', e.target.value)} /></Field>
            <Field label="Port"><input className="input-field" type="number" value={imap.port} onChange={e => setImap('port', e.target.value)} /></Field>
            <Field label="Encryption">
              <Select value={imap.encryption || '__none__'} onValueChange={v => setImap('encryption', v === '__none__' ? '' : v)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (Recommended)</SelectItem>
                  <SelectItem value="tls">STARTTLS</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Username"><input className="input-field" placeholder="tickets@example.com" value={imap.user} onChange={e => setImap('user', e.target.value)} /></Field>
            <Field label="Password" hint={imap.pass === '••••••••' ? 'A password is already saved — re-enter it only if you want to change it.' : undefined}>
              <input className="input-field" type="password" value={imap.pass} onChange={e => setImap('pass', e.target.value)} />
            </Field>
            <Field label="Default Department" hint="Free text — matched against whatever department names this tenant already uses.">
              <input className="input-field" value={imap.targetDepartment} onChange={e => setImap('targetDepartment', e.target.value)} />
            </Field>
            <Field label="Default Ticket Category"><input className="input-field" value={imap.ticketType} onChange={e => setImap('ticketType', e.target.value)} /></Field>
            <ToggleRow label="Mark imported emails as read" value={imapMarkAsRead} onChange={setImapMarkAsRead} />
          </>
        )}
      </Card>
      <SaveRow
        extra={
          protocol === 'smtp' ? (
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
          ) : undefined
        }
        saving={saving} saved={saved} onSave={handleSave}
      />
    </>
  );
};

// -- section: Finance General ------------------------------------------------
/**
 * Used to also carry a "Tax & Pricing" card (a second, competing Default Tax
 * Rate select, plus "Show Tax Per Item"/"Show Quantity Field" toggles) that
 * saved to a `finance-general` key nothing in the platform ever reads —
 * grepped the whole repo, zero hits outside this file. Real per-transaction
 * tax rates are configured once, for real, in FinOps ▸ Tax codes & rates
 * (linked from the "Finance setup" card below) — this used to be a second,
 * dead surface for the exact same concern. Currency and Fiscal Year Start
 * are real (they write into the `company` key, read by tax-code seeding and
 * the invoice PDF header), so those stay.
 */
const FinanceGeneralSection: React.FC = () => {
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
const InvoicesSection: React.FC = () => {
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
const QuotationsSection: React.FC = () => {
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
const PurchaseOrdersSection: React.FC = () => {
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

type GWField = { key: string; label: string; type?: string; placeholder?: string; hint?: string };

interface GatewayDef {
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

const GATEWAYS: GatewayDef[] = [
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
          {enabledCount} of {GATEWAYS.length} gateways active · customers will see enabled gateways at checkout.
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} title="Save all gateway settings" onClick={async () => {
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
const GoogleSection: React.FC = () => {
  const [f, set] = useSettingsFields('int-google', { rcSite: '', rcSecret: '', oauthId: '', oauthSecret: '' });
  const [rc, setRc] = useState(false);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['int-google']) {
      const d = s['int-google'];
      setRc(d.rc ?? false);
      hydratedExtra.current = true;
    }
  }, [s]);

  async function handleSave() { setSaving(true); try { await save('int-google', { ...f, rc }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
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
        <Field label="Ship24 API Key" hint="From your Ship24 account under Developers → API Keys.">
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
      <Card title="GPSWOX Fleet Tracking" desc="Pulls real GPS device positions into HuduFreight's vehicle map, history, and geofence alerts. GPSWOX is typically self-hosted, so the base URL is specific to your instance · save credentials here first.">
        <Field label="Base URL" hint="Your GPSWOX instance root, e.g. https://fleet.yourcompany.com · do not include /api.">
          <input className="input-field" placeholder="https://fleet.yourcompany.com" value={f.base_url} onChange={e => set('base_url', e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input-field" type="email" placeholder="fleet-account@yourcompany.com" value={f.email} onChange={e => set('email', e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input-field" type="password" placeholder="••••••••" value={f.password} onChange={e => set('password', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={handleTest} disabled={testing || !f.base_url || !f.email || !f.password}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult === 'ok' && <span style={{ fontSize: 12, color: 'var(--green, #059669)', fontWeight: 600 }}>Connected</span>}
          {testResult === 'fail' && <span style={{ fontSize: 12, color: 'var(--red, #dc2626)', fontWeight: 600 }}>Connection failed · check URL/credentials</span>}
        </div>
      </Card>
      <p className="s-fld-hint" style={{ margin: '4px 2px 0' }}>Until credentials are saved and valid, vehicle positions must be entered manually · no simulated fleet data is shown.</p>
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
            <input className="input-field" type="password" placeholder="sk-…" value={f.apiKey} onChange={e => set('apiKey', e.target.value)} />
          </Field>
          <Field label="Organization ID (optional)"><input className="input-field" placeholder="org-…" value={f.org} onChange={e => set('org', e.target.value)} /></Field>
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

// -- section: SMS ------------------------------------------------------------
// Used to save a single provider's credentials straight to tenant_settings
// (in plaintext — 'int-sms' was never registered in SECRET_FIELDS_BY_KEY).
// The SMS app now owns gateway config for real: multiple gateways with
// priority fallback, named sender IDs, encrypted credentials, and a live
// test-send — one control here just points at it, same pattern as Finance
// setup's own ElsewhereSection above.
const SMSSection: React.FC = () => (
  <Card title="SMS" desc="Gateways, sender IDs, opt-outs and campaigns are managed in the SMS app.">
    <div className="s-elsewhere">
      <Link to="/sms/gateways" className="s-elsewhere-row">
        <div>
          <div className="s-elsewhere-label">SMS gateways</div>
          <div className="s-elsewhere-desc">Africa's Talking, Twilio and other providers — credentials, sender IDs, priority order and a live test-send.</div>
        </div>
        <Icon name="chevronRight" size={16} color="var(--ink3)" />
      </Link>
      <Link to="/sms/opt-outs" className="s-elsewhere-row">
        <div>
          <div className="s-elsewhere-label">Opt-outs & blacklist</div>
          <div className="s-elsewhere-desc">Numbers that must never be sent to, whether self-opted-out via a STOP reply or manually blocked.</div>
        </div>
        <Icon name="chevronRight" size={16} color="var(--ink3)" />
      </Link>
    </div>
  </Card>
);

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
    return <Card title="TRA VFD / EFDMS"><div className="s-fld--full s-gen-sub">Loading…</div></Card>;
  }

  if (config?.isRegistered) {
    return (
      <>
        <Card title="TRA VFD · Registered" desc="Fiscal receipts are signed and submitted to TRA through this registration. Invoices can now be submitted to TRA from Finance → Sales Invoices.">
          <Field label="Status"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700 }}><Icon name="checkCircle" size={14} color="#059669" /> Registered</span></Field>
          <Field label="Environment"><span style={{ textTransform: 'uppercase', fontWeight: 700, color: config.environment === 'production' ? 'var(--red)' : 'var(--ink2)' }}>{config.environment}</span></Field>
          <Field label="REGID"><span style={{ fontFamily: 'var(--mono)' }}>{config.reg_id}</span></Field>
          <Field label="Receipt Code"><span style={{ fontFamily: 'var(--mono)' }}>{config.receipt_code}</span></Field>
          <Field label="VRN"><span style={{ fontFamily: 'var(--mono)' }}>{config.vrn || '—'}</span></Field>
          <Field label="Tax Office">{config.tax_office || '—'}</Field>
          <Field label="Receipts Issued (GC)">{config.gc ?? 0}</Field>
          <Field label="Bearer Token"><span style={{ color: config.hasValidToken ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{config.hasValidToken ? 'Valid' : 'Expired · will auto-refresh on next submission'}</span></Field>
          <Field label="Last Z-Report">{config.last_zreport_date ? new Date(config.last_zreport_date).toLocaleDateString() : 'Never'}</Field>
        </Card>
        <Card title="Manual Actions" desc="Z-reports submit automatically every night. Use these only to test the connection or recover from a missed run.">
          <div className="s-fld--full" style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={refreshToken} disabled={tokenRefreshing}>{tokenRefreshing ? 'Refreshing…' : 'Refresh Token'}</button>
            <button type="button" className="btn btn-secondary" onClick={runZReport} disabled={zReporting}>{zReporting ? 'Submitting…' : 'Submit Z-Report Now'}</button>
          </div>
          {actionMsg && <div className="s-fld--full" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink2)' }}>{actionMsg}</div>}
        </Card>
      </>
    );
  }

  return (
    <>
      <Card title="TRA VFD Registration" desc="One-time registration with the Tanzania Revenue Authority's Virtual Fiscal Device (EFDMS) API. You'll need the TIN, the device certificate key/serial TRA issued you, and the .pfx certificate file TRA provided. Once registered, invoices can be submitted for fiscalization from Finance → Sales Invoices.">
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
            {uploading ? 'Uploading…' : pfxPath ? 'Re-upload Certificate' : 'Upload Certificate'}
          </button>
          {pfxPath && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}><Icon name="check" size={12} color="var(--green)" /> Uploaded</span>}
        </div>
      </Card>
      {error && <div className="s-fld--full" style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 4 }}>{error}</div>}
      <div className="s-save-row">
        <button type="button" className="btn btn-primary" onClick={register} disabled={registering || !pfxPath}>
          {registering ? 'Registering…' : 'Register with TRA'}
        </button>
      </div>
    </>
  );
};

// -- section: Modules & Extensions -------------------------------------------
interface ModuleCatalogEntry {
  name: string;
  desc: string;
  category: string;
  color: string;
  status: 'Live' | 'Beta';
}

const MODULE_CATALOG: Record<string, ModuleCatalogEntry> = {
  clearos:      { name: 'ClearOS',       desc: 'Customs clearance platform, declarations & TANCIS integration.', category: 'Logistics & Trade', color: '#ea580c', status: 'Live' },
  tracking:     { name: 'HuduFreight',   desc: 'Fleet, vehicle and driver tracking — live GPS positions & trips.', category: 'Logistics & Trade', color: '#0891b2', status: 'Live' },
  cargotracker: { name: 'CargoTracker',  desc: 'AWB & Bill of Lading shipment tracking across sea & air carriers.', category: 'Logistics & Trade', color: '#4f46e5', status: 'Live' },
  seal:         { name: 'SEAL',          desc: 'Bonded warehousing ledger, customs examination & storage clock.', category: 'Logistics & Trade', color: '#0f766e', status: 'Beta' },
  inventory:    { name: 'Inventory',     desc: 'Stock control, multi-warehouse counts, batches & reorder alerts.', category: 'Logistics & Trade', color: '#0f766e', status: 'Beta' },
  demurrage:    { name: 'Demurrage',     desc: 'Container dwell time and demurrage cost tracking.',               category: 'Logistics & Trade', color: '#f59e0b', status: 'Live' },
  finops:       { name: 'FinOps',        desc: 'Financial accounts, TRA EFDMS integration, bills & ledgers.',     category: 'Finance & Accounts', color: '#0284c7', status: 'Live' },
  petti:        { name: 'Petti',         desc: 'Tenant petty-cash wallets — deposit, request, approve & disburse.', category: 'Finance & Accounts', color: '#16a34a', status: 'Beta' },
  complyos:     { name: 'ComplyOS',      desc: 'Compliance tracking, BRELA business search, permits & audits.',   category: 'Compliance & Legal', color: '#059669', status: 'Live' },
  sign:         { name: 'eSign',         desc: 'Secure electronic document signatures, approvals & audit logs.',  category: 'Compliance & Legal', color: '#2563eb', status: 'Beta' },
  nexushr:      { name: 'NexusHR',       desc: 'People operations, payroll, attendance & shift rosters.',         category: 'People & HR', color: '#0d9488', status: 'Live' },
  contacts:     { name: 'Contacts',      desc: 'Shared customer, vendor and partner contact directory.',          category: 'People & HR', color: '#1a73e8', status: 'Live' },
  crm:          { name: 'CRM',           desc: 'Customer relationships, sales pipeline & lead tracking.',         category: 'Communication & CRM', color: '#059669', status: 'Live' },
  bliss:        { name: 'Bliss',         desc: 'Omnichannel customer helpdesk, ticketing & SLA reminders.',       category: 'Communication & CRM', color: '#7c3aed', status: 'Live' },
  email:        { name: 'Email',         desc: 'Unified team inbox, webmail & shared email workspace.',           category: 'Communication & CRM', color: '#0078d4', status: 'Live' },
  sms:          { name: 'SMS',           desc: 'Bulk and transactional SMS messaging campaigns & gateways.',      category: 'Communication & CRM', color: '#dc2626', status: 'Beta' },
  ai:           { name: 'AI',            desc: 'Automated intelligence, document OCR & predictive insights.',     category: 'AI & Automation', color: '#6d28d9', status: 'Live' },
  studio:       { name: 'Studio',        desc: 'Visual workflow builder and cross-app automations.',              category: 'AI & Automation', color: '#4361ee', status: 'Live' },
  hudubi:       { name: 'HuduBI',        desc: 'Executive business intelligence, board KPIs & reports.',          category: 'AI & Automation', color: '#18181b', status: 'Live' },
  cloud:        { name: 'Cloud',         desc: 'Enterprise cloud drive, file manager & secure storage.',          category: 'Productivity & Cloud', color: '#0369a1', status: 'Live' },
  calendar:     { name: 'Calendar',      desc: 'Shared scheduling, video meetings & team calendars.',             category: 'Productivity & Cloud', color: '#db2777', status: 'Live' },
  tasks:        { name: 'Tasks',         desc: 'Team task tracking, assignments & to-dos across apps.',           category: 'Productivity & Cloud', color: '#0f766e', status: 'Live' },
  notes:        { name: 'Notes',         desc: 'Shared team notes, checklists, documents & sketches.',            category: 'Productivity & Cloud', color: '#fbbc04', status: 'Beta' },
  store:        { name: 'Store',         desc: 'B2B procurement, equipment marketplace & catalog.',              category: 'Productivity & Cloud', color: '#8b5cf6', status: 'Live' },
  onsite:       { name: 'Onsite',        desc: 'Domains, DNS, hosting, deployments & cloud infra.',               category: 'Infrastructure & Admin', color: '#0f172a', status: 'Live' },
  onesite:      { name: 'oneSite',       desc: 'Content management, landing page & company intranet.',            category: 'Infrastructure & Admin', color: '#06b6d4', status: 'Live' },
  ondi:         { name: 'Ondi',          desc: 'Single sign-on, identity verification & biometric security.',     category: 'Infrastructure & Admin', color: '#4253d1', status: 'Live' },
  workspace:    { name: 'Workspace Admin', desc: 'Organization settings, branding & platform configuration.',      category: 'Infrastructure & Admin', color: '#64748b', status: 'Live' },
};

const MODULE_CATEGORIES = [
  'All',
  'Logistics & Trade',
  'Finance & Accounts',
  'Compliance & Legal',
  'People & HR',
  'Communication & CRM',
  'AI & Automation',
  'Productivity & Cloud',
  'Infrastructure & Admin',
] as const;

const ModulesSection: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();
  const canManageModules = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role);
  const entitlements = useEntitlements();
  const [overrides, setOverrides] = useState<Record<string, boolean> | null>(null);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);
  const [savingBulk, setSavingBulk] = useState(false);
  const [licenseAppId, setLicenseAppId] = useState<string | null>(null);
  const [licenseData, setLicenseData] = useState<{ restricted?: Record<string, boolean>; grants?: Array<{ app_id: string; user_id: string; user_name: string; user_email: string }> } | null>(null);

  // Search, filter & layout preferences
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'enabled' | 'disabled' | 'restricted'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('hudumika_settings_modules_view') as 'grid' | 'list') || 'grid';
  });

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_settings_modules_view', mode);
  };

  const refreshLicenses = useCallback(() => {
    apiFetch('/v1/settings/app-licenses')
      .then((lic: any) => setLicenseData(lic || {}))
      .catch(() => setLicenseData({ restricted: {}, grants: [] }));
  }, []);

  useEffect(() => {
    apiFetch('/v1/settings')
      .then(res => setOverrides(res.settings?.['enabled-apps'] || {}))
      .catch(() => setOverrides({}));
    refreshLicenses();
  }, [refreshLicenses]);

  const moduleKeys = entitlements
    ? Object.keys(entitlements.features).filter(k => k in APP_META || k in MODULE_CATALOG)
    : [];

  async function toggleModule(key: string, nextOn: boolean) {
    const nextOverrides = { ...(overrides ?? {}), [key]: nextOn };
    const prevOverrides = overrides;
    setOverrides(nextOverrides);
    setModuleSaving(key);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': nextOverrides }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      showAlert(err.message || 'That module could not be changed.', {
        title: /plan/i.test(err.message || '') ? 'Not in your plan' : 'Could not update module',
        variant: /plan/i.test(err.message || '') ? 'warning' : 'error',
      });
    } finally {
      setModuleSaving(null);
    }
  }

  async function enableAllModules() {
    if (!entitlements) return;
    const nextOverrides: Record<string, boolean> = {};
    moduleKeys.forEach(k => { nextOverrides[k] = true; });
    const prevOverrides = overrides;
    setOverrides(nextOverrides);
    setSavingBulk(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': nextOverrides }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      showAlert(err.message || 'Failed to update modules.', { variant: 'error' });
    } finally {
      setSavingBulk(false);
    }
  }

  async function resetModulesToDefault() {
    const confirmed = await showConfirm(
      'This will reset all module switches to match your subscription package entitlements.',
      {
        title: 'Reset Module Overrides?',
        confirmLabel: 'Reset Defaults',
      }
    );
    if (!confirmed) return;
    const prevOverrides = overrides;
    setOverrides({});
    setSavingBulk(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': {} }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      showAlert(err.message || 'Failed to reset module settings.', { variant: 'error' });
    } finally {
      setSavingBulk(false);
    }
  }

  // Filtered keys
  const filteredKeys = useMemo(() => {
    return moduleKeys.filter(key => {
      const meta = MODULE_CATALOG[key] || APP_META[key] || { name: key, desc: '', category: 'Other', color: '#64748b', status: 'Live' };
      const name = meta.name.toLowerCase();
      const desc = (meta.desc || '').toLowerCase();
      const cat = (meta.category || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      const matchesSearch = !q || name.includes(q) || desc.includes(q) || cat.includes(q) || key.includes(q);
      if (!matchesSearch) return false;

      if (selectedCategory !== 'All' && meta.category !== selectedCategory) return false;

      const isOn = overrides ? (overrides[key] ?? entitlements?.features[key] ?? true) : (entitlements?.features[key] ?? true);
      const isRestricted = !!licenseData?.restricted?.[key];

      if (selectedStatus === 'enabled' && !isOn) return false;
      if (selectedStatus === 'disabled' && isOn) return false;
      if (selectedStatus === 'restricted' && (!isOn || !isRestricted)) return false;

      return true;
    });
  }, [moduleKeys, overrides, entitlements, licenseData, searchQuery, selectedCategory, selectedStatus]);

  // Statistics
  const totalCount = moduleKeys.length;
  const enabledCount = moduleKeys.filter(k => (overrides ? (overrides[k] ?? entitlements?.features[k] ?? true) : (entitlements?.features[k] ?? true))).length;
  const restrictedCount = moduleKeys.filter(k => !!licenseData?.restricted?.[k]).length;

  // Statistics cards matching ClearOS design system
  const statCards: MetricCardProps[] = [
    {
      title: 'TOTAL APPLICATIONS',
      value: totalCount > 0 ? String(totalCount) : '—',
      sub1Label: 'IN PLATFORM',
      sub1Value: `${totalCount} Available`,
      sub2Label: 'SUITE STATUS',
      sub2Value: 'Enterprise Ready',
      barHighlight: 'var(--teal)',
      icon: 'grid',
    },
    {
      title: 'ACTIVE MODULES',
      value: String(enabledCount),
      sub1Label: 'WORKSPACE STATUS',
      sub1Value: 'Live & Operational',
      sub2Label: 'COVERAGE',
      sub2Value: totalCount > 0 ? `${Math.round((enabledCount / totalCount) * 100)}% Active` : '100%',
      barHighlight: 'var(--green)',
      icon: 'checkCircle',
    },
    {
      title: 'SEAT RESTRICTIONS',
      value: String(restrictedCount),
      sub1Label: 'PER-SEAT ACCESS',
      sub1Value: restrictedCount > 0 ? `${restrictedCount} Restricted` : 'Open Access',
      sub2Label: 'POLICY',
      sub2Value: restrictedCount > 0 ? 'Managed by Seat' : 'All Workspace Members',
      barHighlight: 'var(--gold)',
      icon: 'lock',
    },
  ];

  return (
    <div className="s-mods-root">
      {/* ── Overview Metrics Row ── */}
      <MetricsRow cards={statCards} />

      {/* ── Search, Filters, Category Tabs & Layout Controls ── */}
      <div className="s-mods-toolbar">
        <div className="s-mods-toolbar-top">
          {/* Search Input */}
          <div className="s-mods-search-wrap">
            <div className="s-mods-search-icon">
              <Icon name="search" size={15} />
            </div>
            <input
              type="text"
              placeholder="Search modules by name, category, or features…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="s-mods-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="s-mods-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="s-mods-toolbar-actions">
            {/* Status Dropdown */}
            <Select value={selectedStatus} onValueChange={v => setSelectedStatus(v as any)}>
              <SelectTrigger style={{ width: 145, height: 38 }}>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="enabled">Enabled Only</SelectItem>
                <SelectItem value="disabled">Disabled Only</SelectItem>
                <SelectItem value="restricted">Restricted Access</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode Toggle */}
            <div className="s-mods-view-toggle">
              <button
                type="button"
                className={`s-mods-view-btn ${viewMode === 'grid' ? 's-mods-view-btn--active' : ''}`}
                onClick={() => handleViewChange('grid')}
                title="Card Grid View"
              >
                <Icon name="grid" size={16} />
              </button>
              <button
                type="button"
                className={`s-mods-view-btn ${viewMode === 'list' ? 's-mods-view-btn--active' : ''}`}
                onClick={() => handleViewChange('list')}
                title="Table List View"
              >
                <Icon name="list" size={16} />
              </button>
            </div>

            {/* Bulk Actions (Admin only) */}
            {canManageModules && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={enableAllModules}
                  disabled={savingBulk}
                  style={{ height: 38 }}
                >
                  <Icon name="check" size={13} style={{ marginRight: 5 }} />
                  Enable All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetModulesToDefault}
                  disabled={savingBulk}
                  style={{ height: 38, color: 'var(--ink3)' }}
                >
                  Reset Defaults
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="s-mods-cats-scroll">
          {MODULE_CATEGORIES.map(cat => {
            const count = cat === 'All'
              ? moduleKeys.length
              : moduleKeys.filter(k => (MODULE_CATALOG[k]?.category || 'Other') === cat).length;
            if (count === 0 && cat !== 'All') return null;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                className={`s-mods-cat-chip ${isActive ? 's-mods-cat-chip--active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <span>{cat}</span>
                <span className="s-mods-cat-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Content Area: Grid or List ── */}
      {!entitlements || overrides === null ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink3)' }}>
          <Icon name="refresh" size={24} className="animate-spin" />
          <div style={{ fontSize: 13, marginTop: 10, fontWeight: 500 }}>Loading workspace modules & entitlements…</div>
        </div>
      ) : filteredKeys.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--white)', borderRadius: 14, border: '1px dashed var(--border)' }}>
          <Icon name="search" size={32} color="var(--ink3)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No matching modules found</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
            Try adjusting your search query, status filter, or category selection.
          </div>
          {(searchQuery || selectedCategory !== 'All' || selectedStatus !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              style={{ marginTop: 14 }}
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedStatus('all');
              }}
            >
              Clear all filters
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <div className="s-mods-grid">
          {filteredKeys.map(key => {
            const catalog = MODULE_CATALOG[key];
            const meta = catalog || APP_META[key] || { name: key, desc: '', category: 'Other', color: '#0d9488', status: 'Live' };
            const on = overrides[key] ?? entitlements.features[key] ?? true;
            const maintenance = entitlements.appStatus[key] === 'maintenance';
            const isRestricted = !!licenseData?.restricted?.[key];
            const grantCount = licenseData?.grants?.filter(g => g.app_id === key).length ?? 0;
            const appColor = branding.getAppColor(key, catalog?.color || '#0d9488');
            const logoUrl = branding.getAppLogo(key);
            const isSaving = moduleSaving === key;

            return (
              <div key={key} className={`s-mod-card ${!on ? 's-mod-card--disabled' : ''}`}>
                <div>
                  <div className="s-mod-card-top">
                    <div className="s-mod-card-ident">
                      <div className="s-mod-icon-box" style={{ background: `${appColor}15`, border: `1px solid ${appColor}30` }}>
                        <LauncherAppSvg id={key} color={appColor} logoUrl={logoUrl} size={36} />
                      </div>
                      <div className="s-mod-card-meta">
                        <div className="s-mod-title-row">
                          <span className="s-mod-title">{branding.getAppName(key, meta.name)}</span>
                          {meta.status === 'Beta' && <span className="s-mod-badge-beta">Beta</span>}
                        </div>
                        <div className="s-mod-category">{meta.category}</div>
                      </div>
                    </div>

                    {/* Master Switch */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSaving && <Icon name="refresh" size={14} className="animate-spin" color="var(--teal)" />}
                      <Switch
                        checked={on}
                        disabled={!canManageModules || maintenance || isSaving}
                        onCheckedChange={v => toggleModule(key, v)}
                      />
                    </div>
                  </div>

                  <p className="s-mod-card-desc">
                    {maintenance ? 'Application currently undergoing scheduled maintenance.' : (branding.getAppSlogan(key, meta.desc) || meta.desc)}
                  </p>
                </div>

                <div className="s-mod-card-footer">
                  {on ? (
                    <button
                      type="button"
                      className={`s-mod-access-tag ${isRestricted ? 's-mod-access-tag--locked' : 's-mod-access-tag--open'}`}
                      onClick={() => canManageModules && setLicenseAppId(key)}
                      disabled={!canManageModules}
                    >
                      <Icon name={isRestricted ? 'lock' : 'globe'} size={12} />
                      {isRestricted ? `Restricted (${grantCount} ${grantCount === 1 ? 'user' : 'users'})` : 'Open to Everyone'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 500 }}>
                      Disabled in workspace
                    </span>
                  )}

                  {canManageModules && on && (
                    <button
                      type="button"
                      className="s-mod-access-btn"
                      onClick={() => setLicenseAppId(key)}
                    >
                      <Icon name="users" size={13} />
                      Manage Access
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Table List View ── */
        <div className="s-mods-table-wrap">
          <table className="s-mods-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Application</th>
                <th style={{ width: '18%' }}>Category</th>
                <th style={{ width: '30%' }}>Description</th>
                <th style={{ width: '16%' }}>Access Permission</th>
                <th style={{ width: '8%', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map(key => {
                const catalog = MODULE_CATALOG[key];
                const meta = catalog || APP_META[key] || { name: key, desc: '', category: 'Other', color: '#0d9488', status: 'Live' };
                const on = overrides[key] ?? entitlements.features[key] ?? true;
                const maintenance = entitlements.appStatus[key] === 'maintenance';
                const isRestricted = !!licenseData?.restricted?.[key];
                const grantCount = licenseData?.grants?.filter(g => g.app_id === key).length ?? 0;
                const appColor = branding.getAppColor(key, catalog?.color || '#0d9488');
                const logoUrl = branding.getAppLogo(key);
                const isSaving = moduleSaving === key;

                return (
                  <tr key={key} style={{ opacity: on ? 1 : 0.65 }}>
                    <td>
                      <div className="s-mods-table-app">
                        <div className="s-mods-table-icon" style={{ background: `${appColor}15`, border: `1px solid ${appColor}30` }}>
                          <LauncherAppSvg id={key} color={appColor} logoUrl={logoUrl} size={28} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="s-mods-table-name">{branding.getAppName(key, meta.name)}</span>
                            {meta.status === 'Beta' && <span className="s-mod-badge-beta">Beta</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="s-mods-table-cat">{meta.category}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
                        {maintenance ? 'Under maintenance' : (branding.getAppSlogan(key, meta.desc) || meta.desc)}
                      </div>
                    </td>
                    <td>
                      {on ? (
                        <button
                          type="button"
                          className={`s-mod-access-tag ${isRestricted ? 's-mod-access-tag--locked' : 's-mod-access-tag--open'}`}
                          onClick={() => canManageModules && setLicenseAppId(key)}
                          disabled={!canManageModules}
                        >
                          <Icon name={isRestricted ? 'lock' : 'globe'} size={12} />
                          {isRestricted ? `Restricted (${grantCount})` : 'Open to All'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Disabled</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isSaving && <Icon name="refresh" size={13} className="animate-spin" color="var(--teal)" />}
                        <Switch
                          checked={on}
                          disabled={!canManageModules || maintenance || isSaving}
                          onCheckedChange={v => toggleModule(key, v)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Executive "Who Has Access" License Modal ── */}
      {licenseAppId && (
        <AppLicensePanel
          appId={licenseAppId}
          appName={MODULE_CATALOG[licenseAppId]?.name ?? APP_META[licenseAppId]?.name ?? licenseAppId}
          appColor={branding.getAppColor(licenseAppId, MODULE_CATALOG[licenseAppId]?.color ?? '#0d9488')}
          onClose={() => setLicenseAppId(null)}
          onUpdated={refreshLicenses}
        />
      )}
    </div>
  );
};

/**
 * Redesigned Executive App License Panel Modal
 */
function AppLicensePanel({
  appId,
  appName,
  appColor = 'var(--teal)',
  onClose,
  onUpdated,
}: {
  appId: string;
  appName: string;
  appColor?: string;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [restricted, setRestricted] = useState(false);
  const [grants, setGrants] = useState<{ user_id: string; user_name: string; user_email: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchGrantQuery, setSearchGrantQuery] = useState('');
  const branding = useBranding();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/settings/app-licenses'),
      apiFetch('/v1/hr/staff').catch(() => []),
    ]).then(([lic, s]) => {
      setRestricted(!!lic.restricted?.[appId]);
      setGrants((lic.grants ?? []).filter((g: any) => g.app_id === appId).map((g: any) => ({ user_id: g.user_id, user_name: g.user_name, user_email: g.user_email })));
      setStaff(Array.isArray(s) ? s : (s?.data ?? []));
    }).finally(() => setLoading(false));
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function toggleRestricted(next: boolean) {
    setSaving(true);
    try {
      await apiFetch(`/v1/settings/app-licenses/${appId}`, { method: 'PATCH', body: JSON.stringify({ restricted: next }) });
      setRestricted(next);
      onUpdated?.();
    } catch (err: any) {
      showAlert(err.message || 'Could not update license restriction.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function addPerson() {
    if (!addUserId) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/settings/app-licenses/${appId}/grant`, { method: 'POST', body: JSON.stringify({ user_id: addUserId }) });
      setAddUserId('');
      load();
      onUpdated?.();
    } catch (err: any) {
      showAlert(err.message || 'Could not grant access.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function removePerson(userId: string) {
    setSaving(true);
    try {
      await apiFetch(`/v1/settings/app-licenses/${appId}/grant/${userId}`, { method: 'DELETE' });
      load();
      onUpdated?.();
    } catch (err: any) {
      showAlert(err.message || 'Could not remove access.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const unlicensedStaff = staff.filter(s => !grants.some(g => g.user_id === s.id));
  const filteredGrants = grants.filter(g => {
    if (!searchGrantQuery.trim()) return true;
    const q = searchGrantQuery.toLowerCase();
    return g.user_name.toLowerCase().includes(q) || g.user_email.toLowerCase().includes(q);
  });

  return (
    <div className="s-lic-backdrop" onClick={onClose}>
      <div className="s-lic-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="s-lic-header">
          <div className="s-lic-hdr-left">
            <div className="s-lic-hdr-icon">
              <LauncherAppSvg id={appId} color={appColor} logoUrl={branding.getAppLogo(appId)} size={38} />
            </div>
            <div>
              <h3 className="s-lic-hdr-title">{appName} · Access Control</h3>
              <p className="s-lic-hdr-desc">Manage workspace permissions and per-seat license assignments</p>
            </div>
          </div>
          <button type="button" className="s-lic-close-btn" onClick={onClose} title="Close (Esc)">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="s-lic-body">
          {loading ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink3)' }}>
              <Icon name="refresh" size={20} className="animate-spin" />
              <div style={{ fontSize: 13, marginTop: 8 }}>Loading access privileges…</div>
            </div>
          ) : (
            <>
              {/* Access Mode Card */}
              <div className="s-lic-restrict-card">
                <div className="s-lic-restrict-info">
                  <h4 className="s-lic-restrict-title">
                    {restricted ? 'Restricted Access (Per-seat License)' : 'Open to All Members (Default)'}
                  </h4>
                  <p className="s-lic-restrict-desc">
                    {restricted
                      ? 'Only explicitly granted team members below can view, launch, and use this module.'
                      : 'Every active member in this workspace can access this module without restrictions.'}
                  </p>
                </div>
                <Switch
                  checked={restricted}
                  disabled={saving}
                  onCheckedChange={toggleRestricted}
                />
              </div>

              {restricted && (
                <>
                  {/* Add Member Row */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                      Grant Access to Team Member
                    </div>
                    <div className="s-lic-add-wrap">
                      <Combobox
                        triggerClassName="flex-1"
                        value={addUserId}
                        onChange={setAddUserId}
                        placeholder={unlicensedStaff.length === 0 ? 'All staff members granted' : 'Select a team member…'}
                        searchPlaceholder="Search staff by name or email…"
                        emptyText="No matching staff."
                        disabled={unlicensedStaff.length === 0}
                        options={unlicensedStaff.map(s => ({ value: s.id, label: s.name, sublabel: s.email }))}
                      />
                      <Button
                        size="sm"
                        onClick={addPerson}
                        disabled={!addUserId || saving}
                      >
                        <Icon name="plus" size={14} style={{ marginRight: 4 }} />
                        Grant Access
                      </Button>
                    </div>
                  </div>

                  {/* Granted Members List */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Granted Members ({grants.length})
                      </div>
                      {grants.length > 3 && (
                        <input
                          type="text"
                          placeholder="Filter members…"
                          value={searchGrantQuery}
                          onChange={e => setSearchGrantQuery(e.target.value)}
                          style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', width: 140 }}
                        />
                      )}
                    </div>

                    {grants.length === 0 ? (
                      <div className="s-lic-empty-state">
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🔒</div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>No members granted access yet</div>
                        <div style={{ fontSize: 11.5, marginTop: 2 }}>With restricted access active and no members added, this app will remain hidden for everyone. Select a member above to grant access.</div>
                      </div>
                    ) : (
                      <div className="s-lic-grant-list">
                        {filteredGrants.map(g => {
                          return (
                            <div key={g.user_id} className="s-lic-grant-row">
                              <div className="s-lic-user-meta">
                                <PersonAvatar userId={g.user_id} name={g.user_name} size={32} />
                                <div>
                                  <div className="s-lic-user-name">{g.user_name}</div>
                                  <div className="s-lic-user-email">{g.user_email}</div>
                                </div>
                              </div>
                                <button
                                  type="button"
                                  className="s-lic-remove-btn"
                                  onClick={() => removePerson(g.user_id)}
                                  disabled={saving}
                                  title="Revoke access"
                                >
                                  Revoke
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="s-lic-footer">
          <span className="s-lic-footer-hint">
            {restricted ? `${grants.length} members with licensed access` : 'Shared workspace module'}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}


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
        <ToggleRow label="WhatsApp Notifications" hint="Send stage updates via WhatsApp Business API · configure credentials in Integrations → SMS / WhatsApp" value={whatsapp} onChange={setWhatsapp} />
        <ToggleRow label="Email Notifications" hint="Send update emails · requires SMTP configured in General → Email" value={emailNotifs} onChange={setEmailNotifs} />
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
const FreightSection: React.FC = () => {
  const { s, save } = useContext(SettingsCtx);
  const [freeTime, setFreeTime] = useState(7);
  const [autoRisk, setAutoRisk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s.freight) {
      const d = s.freight;
      setFreeTime(d.free_time_days ?? 7);
      setAutoRisk(d.auto_risk_flags ?? true);
      hydrated.current = true;
    }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('freight', { free_time_days: freeTime, auto_risk_flags: autoRisk }); } catch {}
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
      <Card title="Per-stage SLA" desc="Real, enforced SLA targets are set per clearance stage on each Workflow, not here.">
        <Link to="/studio/clearance" className="s-elsewhere-row">
          <div>
            <div className="s-elsewhere-label">ClearOS ▸ Workflow Builder</div>
            <div className="s-elsewhere-desc">Configure per-stage SLA hours on the workflow a shipment is actually assigned — this used to be a second, non-binding "reference" grid here that duplicated it.</div>
          </div>
          <Icon name="chevronRight" size={16} color="var(--ink3)" />
        </Link>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- API Keys (developer / partner access) -----------------------------------
const API_SCOPE_OPTIONS = [
  'ai', 'clearos', 'cloud', 'complyos', 'contacts', 'email', 'finops', 'ondi', 'nexushr', 'tracking',
];

interface ApiKeyRow {
  id: string; name: string; key_prefix: string; scopes: string[];
  last_used_at: string | null; revoked_at: string | null; created_at: string;
}

// -- section: E-Sign (company stamp) -----------------------------------------
// The 'other-esign' nav entry existed with no case in renderSection below —
// it fell through to a placeholder GenericSection. This is the tenant's one
// company stamp (sign_stamps, owner_type='tenant' — migration 277), applied
// to documents by whoever has stamp access (role gate: M5) or via the
// generic cross-app stamp API (M6). A person's own personal signature is a
// separate, self-managed thing under their own NexusHR profile, not here.
const EsignSection: React.FC = () => {
  const [stamp, setStamp] = useState<{ id: string; image_data: string; label: string | null } | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPad, setShowPad] = useState(false);

  useEffect(() => {
    apiFetch('/v1/sign/stamps/tenant').then(setStamp).catch(() => setStamp(null));
  }, []);

  async function handleCapture(dataUrl: string) {
    setSaving(true);
    try {
      const row = await apiFetch('/v1/sign/stamps/tenant', { method: 'PUT', body: JSON.stringify({ image_data: dataUrl }) });
      setStamp(row);
      setShowPad(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Remove the company stamp? Anyone applying a tenant stamp to a document will no longer have one until a new one is saved.')) return;
    await apiFetch('/v1/sign/stamps/tenant', { method: 'DELETE' });
    setStamp(null);
  }

  return (
    <>
      <Card title="Company Stamp" desc="The one official stamp your team applies to documents through Hudumika eSign — visible on any envelope or cross-app document a person with stamp access signs on the company's behalf.">
        {stamp === undefined ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
        ) : stamp && !showPad ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Square, not the old 160×90 letterbox — a round or circular
                stamp (the common case) needs equal width and height to show
                at a legible size instead of being shrunk to fit a short box. */}
            <div style={{ width: 160, height: 160, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <img src={stamp.image_data} alt="Company stamp" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => setShowPad(true)}>Replace</Button>
              <Button variant="outline" size="sm" onClick={handleRemove} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>Remove</Button>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <SignaturePad onCapture={handleCapture} kind="stamp" />
            {stamp && <Button variant="ghost" size="sm" onClick={() => setShowPad(false)} style={{ marginTop: 8 }}>Cancel</Button>}
          </div>
        )}
      </Card>
      {saving && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 8 }}>Saving…</div>}
      {saved && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 8 }}>Saved.</div>}
      <Card title="Who can apply the stamp">
        <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
          Managed from NexusHR ▸ <Link to="/nexushr/roles" style={{ color: 'var(--blue)' }}>Roles &amp; Permissions</Link> — the platform's real access-control page, not a second copy of it here.
        </div>
      </Card>
    </>
  );
};

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
            <p style={{ color: 'var(--ink3)' }}>Loading…</p>
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
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{k.key_prefix}…</td>
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
                <p style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>Copy this now · it won't be shown again.</p>
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
                    {creating ? 'Creating…' : 'Create Key'}
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
        { to: '/finance/expenses/categories', label: 'Expense categories', desc: 'The categories expenses are booked against.' },
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
 * Workspace branding — logo, name, colour, favicon — used to live in its own
 * section here (key 'branding'), separate from "Document Branding" (Company
 * Information's own logo/favicon card, used on PDFs). Two upload flows for
 * what most tenants want to be one identity, easy to let drift. Merged into
 * CompanySection's now-renamed "Company Branding" card — one upload, one
 * Save, writing both the document-branding store and pushTenantBranding()
 * (the in-app UI: sidebar, browser tab, per-app accent) together. See that
 * component. The pre-auth sign-in screen still isn't covered by either —
 * it's shared by every workspace on the platform, so it's set by Hudumika,
 * not here.
 */


/**
 * Split a section title so the last word carries the house emphasis.
 *
 * "Company Information" becomes Company *Information*. A single-word title
 * keeps the whole word emphasised rather than rendering an empty plain half.
 */
function splitTitle(title: string): { plain: string; em: string } {
  const words = title.trim().split(/\s+/);
  if (words.length <= 1) return { plain: '', em: title.trim() };
  return { plain: words.slice(0, -1).join(' '), em: words[words.length - 1] };
}

/**
 * Two facts about this workspace, both counted.
 *
 * Replaces a five-tile strip of hardcoded values. Only what can be derived
 * appears — a figure nobody can check is worse than no figure.
 */
const WorkspaceFacts: React.FC = () => {
  const entitlements = useEntitlements();
  const [integrations, setIntegrations] = useState<number | null>(null);

  useEffect(() => {
    apiFetch('/v1/settings')
      .then((r: any) => {
        const st = r?.settings ?? {};
        // An integration counts as configured when its section holds anything
        // beyond an off switch.
        const configured = Object.keys(st)
          .filter(k => k.startsWith('int-'))
          .filter(k => Object.keys(st[k] ?? {}).some(f => f !== 'on' && st[k][f]));
        setIntegrations(configured.length);
      })
      .catch(() => setIntegrations(null));
  }, []);

  const features = entitlements?.features ?? null;
  const enabled = features ? Object.values(features).filter(Boolean).length : null;
  const total = features ? Object.keys(features).length : null;

  return (
    <div className="sett-strip">
      <div className="sett-strip-item">
        <div className="sett-strip-icon sett-strip-icon--t">
          <Icon name="grid" size={14} color="var(--teal)" />
        </div>
        <div className="sett-strip-info">
          <div className="sett-strip-val">{enabled === null ? '—' : `${enabled} / ${total}`}</div>
          <div className="sett-strip-label">Modules enabled</div>
        </div>
      </div>
      <div className="sett-strip-item">
        <div className="sett-strip-icon sett-strip-icon--bg">
          <Icon name="zap" size={14} color="var(--ink2)" />
        </div>
        <div className="sett-strip-info">
          <div className="sett-strip-val">{integrations === null ? '—' : integrations}</div>
          <div className="sett-strip-label">Integrations configured</div>
        </div>
      </div>
    </div>
  );
};

// -- section routing ---------------------------------------------------------
function renderSection(key: string): React.ReactNode {
  switch (key) {
    case 'company':             return <CompanySection />;
    case 'elsewhere':           return <ElsewhereSection />;
    // Merged into Company Information's own "Company Branding" card.
    case 'branding':            return <CompanySection />;
    case 'localization':        return <LocalizationSection />;
    case 'landing-experience':  return <LandingExperienceSection />;
    case 'email':               return <EmailSection />;
    case 'notifications':       return <NotificationsSection />;
    case 'app-freight':         return <FreightSection />;
    case 'finance-general':     return <FinanceGeneralSection />;
    case 'invoices':            return <InvoicesSection />;
    case 'quotations':          return <QuotationsSection />;
    case 'purchase-orders':     return <PurchaseOrdersSection />;
    // Both superseded by real FinOps features (tax codes/rates now live at
    // /finance/tax-codes; currency display used a hardcoded, never-updated
    // exchange-rate table where fx_rates.service.ts's real synced rates now
    // apply) — removed from NAV for that reason, but the switch case here
    // still rendered the old editable form to anyone who kept the ?s= link
    // or typed it in, letting them "save" numbers nothing downstream reads.
    case 'tax-rates':           return <ElsewhereSection />;
    case 'payment-gateways':    return <PaymentGatewaysSection />;
    // Moved to FinOps ▸ Expenses ▸ Manage Categories (/finance/expenses/
    // categories) — same underlying tenant_settings key, real page now.
    case 'expenses-categories': return <ElsewhereSection />;
    case 'int-google':          return <GoogleSection />;
    // No Pusher integration exists anywhere in the backend — never had a
    // real reader, removed from NAV, but the switch case kept rendering the
    // editable App ID/Key/Secret form to anyone who reached it by URL.
    case 'int-shipsgo':         return <ShipsGoSection />;
    case 'int-gpswox':          return <GpswoxSection />;
    case 'int-ai':               return <OpenAISection />;
    case 'int-sms':             return <SMSSection />;
    case 'int-tancis':          return <TRASection />;
    case 'other-esign':         return <EsignSection />;
    case 'modules':             return <ModulesSection />;
    case 'developer-api':       return <ApiKeysSection />;
    case 'siem-export':         return <SiemExportSection />;
    default: {
      const label = NAV.flatMap(g => g.items).find(i => i.key === key)?.label ?? key;
      return <GenericSection title={label} />;
    }
  }
}

function getSectionTitle(key: string): string {
  if (key === 'modules') return 'Modules & Extensions';
  // No longer its own NAV entry — see renderSection's redirects.
  if (key === 'branding') return 'Company Information';
  if (key === 'expenses-categories') return 'Finance setup';
  return NAV.flatMap(g => g.items).find(i => i.key === key)?.label ?? 'Settings';
}

// -- main export -------------------------------------------------------------
export const Settings: React.FC = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const current = searchParams.get('s') ?? 'company';
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

  const sectionTitle = getSectionTitle(current);
  const { plain, em } = splitTitle(sectionTitle);

  const getSubtitle = (key: string): string => {
    switch (key) {
      case 'modules':
        return 'Manage active applications, license assignments, and access policies for this workspace.';
      case 'company':
      case 'branding':
        return 'Organization identity, profile, and branding configuration.';
      case 'localization':
        return 'Configure workspace timezone, language, and regional preferences.';
      case 'landing-experience':
        return 'Customize default landing app and initial workspace overview.';
      case 'email':
        return 'SMTP credentials and outbound email dispatch settings.';
      case 'notifications':
        return 'Alert rules, notification channels, and operational thresholds.';
      case 'finance-general':
        return 'Finance defaults, fiscal calendar, and accounting preferences.';
      case 'payment-gateways':
        return 'Online payment providers and direct gateway integrations.';
      case 'invoices':
        return 'Invoice prefixing, numbering sequences, and payment terms.';
      case 'developer-api':
        return 'API keys, webhooks, and developer authorization credentials.';
      default:
        return 'Configure organization preferences and workspace controls.';
    }
  };

  return (
    <SettingsCtx.Provider value={{ s: globalSettings, save: saveSection }}>
      <div className="sett-page">
        {/* The house header, driven by the selected section */}
        <PageHeader
          crumbs={['Workspace', 'Settings']}
          titlePlain={plain}
          titleEm={em}
          subtitle={getSubtitle(current)}
        />

        {current === 'company' && <WorkspaceFacts />}

        {renderSection(current)}
      </div>
    </SettingsCtx.Provider>
  );
};
