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

export const GoogleSection: React.FC = () => {
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

// -- section: Microsoft -------------------------------------------------------
/** Backs contacts-sync.routes.ts's Outlook/Microsoft 365 contact sync
 * (getMicrosoftCreds reads oauthId/oauthSecret from this same 'int-microsoft'
 * key). Deliberately its own settings section rather than folded into
 * GoogleSection — mail-oauth.routes.ts and calendar-sync.routes.ts each
 * already register their own separate Azure AD app under their own keys for
 * the same reason (different scopes/consent screens per feature). */
export const MicrosoftSection: React.FC = () => {
  const [f, set] = useSettingsFields('int-microsoft', { oauthId: '', oauthSecret: '' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() { setSaving(true); try { await save('int-microsoft', { ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }
  return (
    <>
      <Card title="Microsoft OAuth (Outlook contact sync)" desc="A real Azure AD app registration — create one at portal.azure.com and grant it the Contacts.Read and User.Read delegated permissions.">
        <Field label="Application (Client) ID"><input className="input-field" value={f.oauthId} onChange={e => set('oauthId', e.target.value)} /></Field>
        <Field label="Client Secret"><input className="input-field" type="password" value={f.oauthSecret} onChange={e => set('oauthSecret', e.target.value)} /></Field>
      </Card>
      <p className="s-fld-hint" style={{ margin: '4px 2px 0' }}>Until both are saved here, "Connect Outlook Account" in Contacts ▸ Outlook sync stays disabled.</p>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: ShipsGo / Ship24 -----------------------------------------------
export const ShipsGoSection: React.FC = () => {
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
export const GpswoxSection: React.FC = () => {
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
          <button type="button" className="btn btn-outline btn-sm" onClick={handleTest} disabled={testing || !f.base_url || !f.email || !f.password} data-ui-native-button="">
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult === 'ok' && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Connected</span>}
          {testResult === 'fail' && <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Connection failed · check URL/credentials</span>}
        </div>
      </Card>
      <p className="s-fld-hint" style={{ margin: '4px 2px 0' }}>Until credentials are saved and valid, vehicle positions must be entered manually · no simulated fleet data is shown.</p>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// Shared with SuperAdmin.tsx's platform-default AI key section — see
// apps/web/src/lib/aiProviders.ts (mirrors apps/api/src/lib/ai-providers.ts's
// AI_PROVIDER_CONFIG) so the tenant BYOK picker and the SuperAdmin
// platform-key picker can't drift on which models exist for which provider.

// -- section: OpenAI ---------------------------------------------------------
export const OpenAISection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useSettingsFields('int-ai', { apiKey: '', org: '', provider: 'anthropic', model: 'claude-sonnet-5', temp: '0.7', maxTokens: '2048' });
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);
  const entitlements = useEntitlements();
  const byokAllowed = entitlements?.byokAllowed ?? false;
  const aiCredits = entitlements?.aiCredits;

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s['int-ai']) { setOn(s['int-ai'].on ?? false); hydratedExtra.current = true; }
  }, [s]);

  const activeProvider = AI_PROVIDERS.find(p => p.value === f.provider) ?? AI_PROVIDERS[0];

  function changeProvider(value: string) {
    set('provider', value);
    // Switching provider without also switching the model would silently
    // send e.g. "gpt-4o" to Groq's endpoint — always land on that
    // provider's own recommended model instead.
    const next = AI_PROVIDERS.find(p => p.value === value);
    if (next) set('model', next.models[0].value);
  }

  async function handleSave() { setSaving(true); try { await save('int-ai', { on, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {} finally { setSaving(false); } }

  // Credits/limit come from GET /v1/entitlements (packages.monthly_ai_credits
  // minus this month's agent_credit_ledger debits) — a plan with no
  // platform-AI allowance at all (limit === 0) has nothing informative to
  // show here, so the line is skipped rather than showing "0 of 0 used".
  const creditsLine = aiCredits && aiCredits.limit > 0
    ? `${aiCredits.used} of ${aiCredits.limit} platform AI credits used this month — resets at the start of next month.`
    : null;

  return (
    <>
      <Card title="AI Configuration" desc="Power AI-assisted features throughout the app.">
        {creditsLine && <div className="s-fld-hint" style={{ margin: '0 0 14px' }}>{creditsLine}</div>}
        {byokAllowed ? (
          <>
            <ToggleRow label="Enable AI Features" value={on} onChange={setOn} />
            {on && <>
              <Field label="Provider" hint="Groq and Google Gemini both offer a free API key — no credit card needed.">
                <Select value={f.provider} onValueChange={changeProvider}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="API Key" hint={`Your ${activeProvider.label.split(' — ')[0]} API key`} full>
                <input className="input-field" type="password" placeholder="sk-…" value={f.apiKey} onChange={e => set('apiKey', e.target.value)} />
              </Field>
              {activeProvider.value === 'openai' &&
                <Field label="Organization ID (optional)"><input className="input-field" placeholder="org-…" value={f.org} onChange={e => set('org', e.target.value)} /></Field>}
              <Field label="Model">
                <Select value={f.model} onValueChange={v => set('model', v)}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeProvider.models.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Temperature" hint="0 = deterministic · 1 = creative">
                <input className="input-field" type="number" step="0.1" min="0" max="2" value={f.temp} onChange={e => set('temp', e.target.value)} />
              </Field>
              <Field label="Max Tokens"><input className="input-field" type="number" value={f.maxTokens} onChange={e => set('maxTokens', e.target.value)} /></Field>
            </>}
          </>
        ) : (
          // Not eligible to bring an own key on this plan — a key typed here
          // would silently be ignored server-side (resolveAiCredentials()),
          // so there's nothing to save; show why instead of a dead form.
          <div className="s-fld-hint" style={{ margin: 0 }}>
            AI is already available on your plan through Hudumika's shared assistant, billed to your workspace's monthly credits above — no setup needed.
            Bringing your own provider key (unlimited, billed directly to you instead) is available on the <b>Hudu Advanced</b> plan.
          </div>
        )}
      </Card>
      {byokAllowed && <SaveRow saving={saving} saved={saved} onSave={handleSave} />}
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
export const SMSSection: React.FC = () => (
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
export const TRASection: React.FC = () => {
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
    return <Card title="TRA VFD / EFDMS"><div className="s-fld--full"><SectionLoading /></div></Card>;
  }

  if (config?.isRegistered) {
    return (
      <>
        <Card title="TRA VFD · Registered" desc="Fiscal receipts are signed and submitted to TRA through this registration. Invoices can now be submitted to TRA from Finance → Sales Invoices.">
          <Field label="Status"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontWeight: 700 }}><Icon name="checkCircle" size={14} color="var(--green)" /> Registered</span></Field>
          <Field label="Environment"><span style={{ textTransform: 'uppercase', fontWeight: 700, color: config.environment === 'production' ? 'var(--red)' : 'var(--ink2)' }}>{config.environment}</span></Field>
          <Field label="REGID"><span style={{ fontFamily: 'var(--font)' }}>{config.reg_id}</span></Field>
          <Field label="Receipt Code"><span style={{ fontFamily: 'var(--font)' }}>{config.receipt_code}</span></Field>
          <Field label="VRN"><span style={{ fontFamily: 'var(--font)' }}>{config.vrn || '—'}</span></Field>
          <Field label="Tax Office">{config.tax_office || '—'}</Field>
          <Field label="Receipts Issued (GC)">{config.gc ?? 0}</Field>
          <Field label="Bearer Token"><span style={{ color: config.hasValidToken ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{config.hasValidToken ? 'Valid' : 'Expired · will auto-refresh on next submission'}</span></Field>
          <Field label="Last Z-Report">{config.last_zreport_date ? new Date(config.last_zreport_date).toLocaleDateString() : 'Never'}</Field>
        </Card>
        <Card title="Manual Actions" desc="Z-reports submit automatically every night. Use these only to test the connection or recover from a missed run.">
          <div className="s-fld--full" style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={refreshToken} disabled={tokenRefreshing} data-ui-native-button="">{tokenRefreshing ? 'Refreshing…' : 'Refresh Token'}</button>
            <button type="button" className="btn btn-secondary" onClick={runZReport} disabled={zReporting} data-ui-native-button="">{zReporting ? 'Submitting…' : 'Submit Z-Report Now'}</button>
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
          <button type="button" className="btn btn-secondary" onClick={uploadCert} disabled={!pfxFile || uploading} data-ui-native-button="">
            {uploading ? 'Uploading…' : pfxPath ? 'Re-upload Certificate' : 'Upload Certificate'}
          </button>
          {pfxPath && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}><Icon name="check" size={12} color="var(--green)" /> Uploaded</span>}
        </div>
      </Card>
      {error && <div className="s-fld--full" style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 4 }}>{error}</div>}
      <div className="s-save-row">
        <button type="button" className="btn btn-primary" onClick={register} disabled={registering || !pfxPath} data-ui-native-button="">
          {registering ? 'Registering…' : 'Register with TRA'}
        </button>
      </div>
    </>
  );
};