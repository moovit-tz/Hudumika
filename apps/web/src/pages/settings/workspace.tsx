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
import { Tip } from '../../components/ui/tooltip.js';
import { UpgradeNotice } from '../../components/UpgradeNotice.js';
import { showConfirm } from '../../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../../hooks/useEntitlements.js';
import { useAuth } from '../../hooks/useAuth.js';
import { APP_META } from '../Utilities.js';
import { AI_PROVIDERS } from '../../lib/aiProviders.js';
import { SettingsCtx, Toggle, Field, ToggleRow, Card, SaveRow, useFields, useSettingsFields } from './shared.js';

// -- section: Company --------------------------------------------------------
export const CompanySection: React.FC = () => {
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
            <ColorSwatchPicker
              value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#0f766e'}
              onChange={setAccentColor}
            />
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
              <Tip label="Remove logo"><button type="button" aria-label="Remove logo" onClick={e => { e.preventDefault(); setLogoUrl(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="var(--red)" />
              </button></Tip>
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
              <Tip label="Remove dark-mode logo"><button type="button" aria-label="Remove dark-mode logo" onClick={e => { e.preventDefault(); setLogoUrlDark(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="var(--red)" />
              </button></Tip>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoDarkChange} />
          </label>
        </Field>
        {co.logoHistory.length > 0 && (
          <Field label="Previous Logos" hint="Click to restore" full>
            <div className="s-logo-hist">
              {co.logoHistory.map((src, i) => (
                <Tip key={i} label={`Restore logo ${i + 1}`}><button type="button" aria-label={`Restore logo ${i + 1}`} onClick={() => setLogoUrl(src)}
                  className={`s-logo-thumb${logoUrl === src ? ' s-logo-thumb--on' : ''}`}><img src={src} alt={`Previous logo ${i + 1}`} className="s-logo-thumb-img" /></button></Tip>
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
              <Tip label="Remove favicon"><button type="button" aria-label="Remove favicon" onClick={e => { e.preventDefault(); setFaviconUrl(null); }} className="s-upload-rm">
                <Icon name="x" size={13} color="var(--red)" />
              </button></Tip>
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
export const LocalizationSection: React.FC = () => {
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
export const LandingExperienceSection: React.FC = () => {
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
export const SiemExportSection: React.FC = () => {
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
export const OAUTH_PROVIDER_LABEL: Record<string, string> = { outlook: 'Microsoft Outlook', gmail: 'Gmail' };

export const EmailSection: React.FC = () => {
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
  const [testTo, setTestTo] = useState('');
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
      if (protocol === 'smtp') {
        // SMTP: verify connection + send using the form fields directly (before saving)
        await apiFetch('/v1/settings/email/test', {
          method: 'POST',
          body: JSON.stringify({ host: f.host, port: Number(f.port), user: f.user, pass: f.pass, enc: f.enc, fromName: f.fromName, fromEmail: f.fromEmail }),
        });
      } else {
        // Mail / Outlook / Gmail: use the saved tenant config
        await apiFetch('/v1/settings/email/send-test', {
          method: 'POST',
          body: JSON.stringify({ to: testTo || undefined }),
        });
      }
      setTestResult({ ok: true, msg: 'Test email sent successfully.' });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || 'Failed to send test email.' });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 6000);
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
          background: oauthNotice.ok ? 'var(--green-l)' : 'var(--red-l)',
          color: oauthNotice.ok ? 'var(--green)' : 'var(--red)',
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
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>
            Sends through Hudumika's own outgoing mail server — no extra setup needed here. Your platform administrator configures the server credentials once in the SuperAdmin panel.
            Switch to <strong>SMTP</strong>, <strong>Outlook</strong> or <strong>Gmail</strong> above if you'd rather send from your own domain or mailbox.<br />
            <span style={{ color: 'var(--ink2)' }}>Use "Send Test Email" below (after saving) to confirm mail is working.</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {protocol !== 'smtp' && (
              <input
                className="input-field"
                type="email"
                placeholder="Send test to (optional)"
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                style={{ width: 220 }}
              />
            )}
            <button type="button" className="btn btn-secondary" onClick={handleTestEmail} disabled={testing}>
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>
            {testResult && (
              <span style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                {testResult.ok ? '✓ Sent' : testResult.msg}
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
