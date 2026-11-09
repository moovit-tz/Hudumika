import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { FeatureToggleRow } from '../../components/ui/list-item-row.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Switch } from '../../components/ui/switch.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Badge as UiBadge } from '../../components/ui/badge.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { AI_PROVIDERS } from '../../lib/aiProviders.js';
import { ALL_FEATURE_KEYS } from '@hudumika/types';
import { CarVehicleImage } from '../../components/CarVehicleImage.js';
import { CarVehicle3DViewer } from '../../components/CarVehicle3DViewer.js';
import {
  Badge, type Company, type Subscription, type Package,
  Spark, BarChart, PageHdr,
  TR, TD,
} from './shared.js';

const SETTINGS_SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'security', label: 'Security & Sessions', icon: 'lock' },
  { id: 'smtp',      label: 'Email / SMTP',        icon: 'mail' },
  { id: 'ai',        label: 'AI Providers',         icon: 'sparkle' },
  { id: 'ocr',       label: 'OCR',                 icon: 'zap' },
  { id: 'ondiSso',   label: 'Ondi SSO',             icon: 'key' },
  { id: 'carimages', label: 'CarImages & Maps APIs', icon: 'truck' },
  { id: 'api',       label: 'API & Webhooks',       icon: 'terminal' },
  { id: 'modules-pointer', label: 'Modules & Plan Features', icon: 'package' },
  { id: 'cron',      label: 'Cron Jobs',            icon: 'clock' },
  { id: 'server',    label: 'System & Server Info', icon: 'monitor' },
];

// Third-party brand marks for the AI provider cards -- literal brand identity,
// not the app's own --teal accent, so these stay hardcoded on purpose.
const AI_PROVIDER_BRAND: Record<string, { icon: IconName; color: string }> = {
  anthropic: { icon: 'sparkle', color: '#D97757' },
  openai:    { icon: 'layers',  color: '#10A37F' },
  groq:      { icon: 'zap',     color: '#F55036' },
  google:    { icon: 'gemini',  color: '#4285F4' },
};

export function SettingsView() {
  const [saved, setSaved] = useState<string|null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [smtp, setSmtp] = useState({ host:'smtp.mailgun.org', port:'587', user:'no-reply@clearos.io', pass:'', from:'Hudumika Platform <no-reply@clearos.io>', tls:true });
  const [security, setSecurity] = useState({ minPasswordLength:'8', sessionTimeoutHours:'8', maxLoginAttempts:'5', lockoutMinutes:'15', twoFaPolicy:'optional' as 'off'|'optional'|'required', ipAllowlist:'' });
  const [api, setApi] = useState({ rateLimit:'120', corsOrigins:'*', webhookSecret:'whs_live_••••••••••••••••', keyRotationDays:'90' });
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [ocr, setOcr] = useState({ geminiApiKey:'' });
  // Platform-wide fallback AI key (apps/api/src/lib/platform-settings.ts's
  // resolveAiCredentials()) — used by every tenant that hasn't configured
  // its own key in Settings > Integrations > AI Integration. A tenant's own
  // key always wins over this one; this only fills the gap for tenants
  // that never set one up, billed to the platform rather than the tenant.
  // One key + model per provider; `provider` is the platform DEFAULT. Keys arrive
  // masked from the server and are only ever replaced by something typed here.
  const [ai, setAi] = useState<{ enabled: boolean; provider: string; providers: Record<string, { apiKey: string; model: string }> }>({ enabled: false, provider: 'anthropic', providers: {} });
  // True only once GET /v1/superadmin/settings has succeeded. Every save posts the WHOLE page's
  // state, so saving before that (a failed fetch, then a click) would overwrite stored SMTP,
  // security (lockout / 2FA / IP allowlist), API, OCR, SSO and AI-key settings with this page's
  // built-in defaults. Saves are refused until it is true.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  // Per-provider result of the "Test" button (POST /v1/superadmin/ai/test).
  const [aiTest, setAiTest] = useState<Record<string, { busy: boolean; ok?: boolean; message?: string }>>({});
  async function testAiProvider(provider: string) {
    const row = ai.providers[provider];
    const def = AI_PROVIDERS.find(x => x.value === provider);
    setAiTest(prev => ({ ...prev, [provider]: { busy: true } }));
    try {
      // A typed (unsaved) key is tested as typed; the mask means "use the stored key" — the server resolves it.
      const r = await apiFetch('/v1/superadmin/ai/test', { method: 'POST', body: JSON.stringify({ provider, model: row?.model || def?.models[0].value, apiKey: row?.apiKey || undefined }) });
      setAiTest(prev => ({ ...prev, [provider]: { busy: false, ok: !!r.ok, message: r.ok ? `Working — ${r.model} answered in ${r.latencyMs} ms.` : (r.error || 'The provider rejected the request.') } }));
    } catch (err: any) {
      setAiTest(prev => ({ ...prev, [provider]: { busy: false, ok: false, message: err?.message || 'Test failed' } }));
    }
  }
  const setAiRow = (provider: string, patch: Partial<{ apiKey: string; model: string }>) =>
    setAi(prev => ({ ...prev, providers: { ...prev.providers, [provider]: { ...(prev.providers[provider] ?? { apiKey: '', model: '' }), ...patch } } }));
  const [ondiSso, setOndiSso] = useState<{ enabled: boolean; googleClientId?: string; microsoftClientId?: string; appleClientId?: string }>({ enabled: false });

  // ── CarImages & Maps API Integration ──
  const [carimages, setCarimages] = useState({
    enabled: true,
    apiKey: 'ci_a723d0e11a412579a5440a33bf4d55b0e2b51a56bce1bb4ce70d6290',
    secret: 'c0c395cf7a6010c8801d7da31fff5b70e237b719d2b44b02de0ed6cb6710eb9e',
    baseUrl: 'https://carimagesapi.com',
  });
  const [showCarimagesSecret, setShowCarimagesSecret] = useState(false);
  const [testingCarimages, setTestingCarimages] = useState(false);
  const [carimagesTested, setCarimagesTested] = useState<boolean | null>(null);
  const [carimagesTestMsg, setCarimagesTestMsg] = useState<string>('');

  const [mapbox, setMapbox] = useState({
    enabled: true,
    accessToken: typeof localStorage !== 'undefined' ? localStorage.getItem('hudumika_mapbox_token') || '' : '',
    defaultStyle: 'mapbox/streets-v12',
  });
  const [testingMapbox, setTestingMapbox] = useState(false);
  const [mapboxTested, setMapboxTested] = useState<boolean | null>(null);
  const [mapboxTestMsg, setMapboxTestMsg] = useState<string>('');

  // Sample runner & playground
  const [sampleMake, setSampleMake] = useState('BMW');
  const [sampleModel, setSampleModel] = useState('3 Series');
  const [sampleYear, setSampleYear] = useState('2022');
  const [sampleMode, setSampleMode] = useState<'2d' | '3d'>('2d');
  const [sampleView, setSampleView] = useState<'3-4' | 'side' | 'front' | 'rear' | 'top'>('3-4');
  const [sampleBackdrop, setSampleBackdrop] = useState<'light' | 'graphite' | 'dark' | 'slate' | 'sand' | 'sky' | 'mint' | 'black'>('graphite');
  const [runningSample, setRunningSample] = useState(false);
  const [sampleOutputUrl, setSampleOutputUrl] = useState<string | null>('https://carimagesapi.com/image?make=BMW&model=3+Series&api_key=ci_a723d0e11a412579a5440a33bf4d55b0e2b51a56bce1bb4ce70d6290&format=webp');
  const [sampleModelUrl, setSampleModelUrl] = useState<string | null>(null);
  const [activeSnippetTab, setActiveSnippetTab] = useState<'loader' | '2d' | '3d' | 'rest'>('loader');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const [syncingFleet, setSyncingFleet] = useState(false);
  const [syncFleetResult, setSyncFleetResult] = useState<{ totalScanned?: number; updatedCount?: number } | null>(null);
  const [seedingAssets, setSeedingAssets] = useState(false);
  const [seedingResult, setSeedingResult] = useState<{ createdCount?: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);
  const [testingOcr, setTestingOcr] = useState(false);
  const [ocrTested, setOcrTested] = useState(false);
  const [jobs, setJobs] = useState<{ connected: boolean; jobs: { name: string; schedule: string; fallbackOnly?: boolean }[] }>({ connected: false, jobs: [] });
  const [cronPage, setCronPage] = useState(1);
  const [cronPageSize, setCronPageSize] = useState(10);
  const [serverInfo, setServerInfo] = useState<Record<string, string | number> | null>(null);

  const pagedCronJobs = useMemo(
    () => jobs.jobs.slice((cronPage - 1) * cronPageSize, cronPage * cronPageSize),
    [jobs.jobs, cronPage, cronPageSize],
  );

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(jobs.jobs.length / cronPageSize));
    if (cronPage > lastPage) setCronPage(lastPage);
  }, [jobs.jobs.length, cronPage, cronPageSize]);

  // 8 sections in one long scroll with no way to jump to one — tabbed instead,
  // same ?section= deep-link convention DesignSystemView already established
  // (Navigate to="/admin/design-system?section=identity" etc. in
  // SuperAdminShell.tsx) so a bookmark/link to one settings section works the
  // same way a link to one design-system section already does.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = SETTINGS_SECTIONS.some(s => s.id === searchParams.get('section'))
    ? searchParams.get('section')!
    : SETTINGS_SECTIONS[0].id;
  const [activeTab, setActiveTabState] = useState(initialTab);
  const setActiveTab = (id: string) => {
    setActiveTabState(id);
    setSearchParams(prev => { prev.set('section', id); return prev; }, { replace: true });
  };

  useEffect(() => {
    apiFetch('/v1/superadmin/settings')
      .then(res => {
        const s = res.settings || {};
        if (s.maintenance !== undefined) setMaintenance(s.maintenance);
        if (s.smtp) setSmtp(prev => ({ ...prev, ...s.smtp }));
        if (s.security) setSecurity(prev => ({ ...prev, ...s.security }));
        if (s.api) setApi(prev => ({ ...prev, ...s.api }));
        if (s.ocr) setOcr(prev => ({ ...prev, ...s.ocr }));
        if (s.ai) {
          setAi(prev => ({
            enabled: !!s.ai.enabled,
            provider: s.ai.provider || prev.provider,
            providers: Object.fromEntries(Object.entries((s.ai.providers ?? {}) as Record<string, { apiKey?: string; model?: string }>)
              .map(([name, v]) => [name, { apiKey: v.apiKey ?? '', model: v.model ?? '' }])),
          }));
        }
        setSettingsLoaded(true);
        if (s.ondiSso) setOndiSso(prev => ({ ...prev, ...s.ondiSso }));
        if (s.carimages) setCarimages(prev => ({ ...prev, ...s.carimages }));
        if (s.mapbox) {
          setMapbox(prev => ({ ...prev, ...s.mapbox }));
          if (s.mapbox.accessToken) {
            localStorage.setItem('hudumika_mapbox_token', s.mapbox.accessToken);
          }
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setSettingsLoadError(err instanceof Error ? err.message : 'Could not load platform settings.');
        setLoading(false);
      });
    apiFetch('/v1/superadmin/jobs').then(setJobs).catch(() => {});
    apiFetch('/v1/superadmin/server-info').then(setServerInfo).catch(() => {});
  }, []);

  async function save(section: string) {
    if (!settingsLoaded) { showAlert(settingsLoadError || 'Settings did not load, so saving is disabled to protect what is stored. Reload the page and try again.'); return; }
    const payload = {
      maintenance,
      smtp,
      security,
      api,
      ocr,
      carimages,
      mapbox,
      ...(settingsLoaded ? { ai: {
        enabled: ai.enabled,
        provider: ai.provider,
        model: ai.providers[ai.provider]?.model || AI_PROVIDERS.find(x => x.value === ai.provider)?.models[0].value,
        providers: Object.fromEntries(AI_PROVIDERS
          .filter(x => ai.providers[x.value]?.apiKey || ai.providers[x.value]?.model)
          .map(x => [x.value, { apiKey: ai.providers[x.value].apiKey, model: ai.providers[x.value].model || x.models[0].value }])),
      } } : {}),
      ondiSso
    };

    if (mapbox.accessToken?.trim()) {
      localStorage.setItem('hudumika_mapbox_token', mapbox.accessToken.trim());
    }

    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } catch (err: any) {
      showAlert(`Failed to save settings: ${err?.message ?? 'Unknown error'}`);
    }
  }

  // Used to just re-save whatever was already sitting in the field — clicking
  // "Regenerate" changed nothing at all. Generates a real random secret
  // client-side (crypto.getRandomValues, not Math.random) and saves it
  // immediately, same shape as an API key's own secret generation.
  async function regenerateWebhookSecret() {
    if (!settingsLoaded) { showAlert('Settings did not load, so saving is disabled to protect what is stored. Reload the page and try again.'); return; }
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const nextApi = { ...api, webhookSecret: `whs_live_${hex}` };
    setApi(nextApi);
    setShowWebhookSecret(true);
    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify({ maintenance, smtp, security, api: nextApi, ocr, ondiSso }),
      });
      setSaved('api-regen');
      setTimeout(() => setSaved(null), 2000);
    } catch (err: any) {
      showAlert(`Failed to save the new secret: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function toggleMaintenance() {
    if (!settingsLoaded) { showAlert('Settings did not load, so saving is disabled to protect what is stored. Reload the page and try again.'); return; }
    const next = !maintenance;
    setMaintenance(next);
    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify({
          maintenance: next,
          smtp,
          security,
          api
        })
      });
    } catch (err: any) {
      setMaintenance(maintenance); // revert
      showAlert(`Failed to toggle maintenance mode: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function testSmtp() {
    setTestingSmtp(true);
    try {
      await apiFetch('/v1/superadmin/smtp-test', {
        method: 'POST',
        body: JSON.stringify(smtp)
      });
      setSmtpTested(true);
      setTimeout(() => setSmtpTested(false), 2000);
    } catch (err: any) {
      showAlert(`SMTP Test Failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setTestingSmtp(false);
    }
  }

  async function testOcr() {
    if (!ocr.geminiApiKey) {
      showAlert('Enter a Gemini API key first.');
      return;
    }
    setTestingOcr(true);
    try {
      await apiFetch('/v1/superadmin/ocr-test', {
        method: 'POST',
        body: JSON.stringify({ geminiApiKey: ocr.geminiApiKey })
      });
      setOcrTested(true);
      setTimeout(() => setOcrTested(false), 2000);
    } catch (err: any) {
      showAlert(`Gemini Test Failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setTestingOcr(false);
    }
  }

  async function testCarimages() {
    setTestingCarimages(true);
    setCarimagesTested(null);
    try {
      const res = await apiFetch('/v1/superadmin/carimages/test', {
        method: 'POST',
        body: JSON.stringify({ apiKey: carimages.apiKey, secret: carimages.secret }),
      });
      setCarimagesTested(true);
      setCarimagesTestMsg(`Connected! ${res.totalMakes ?? 206} vehicle makes available (${res.latencyMs ?? 180} ms).`);
    } catch (err: any) {
      setCarimagesTested(false);
      setCarimagesTestMsg(err?.message || 'Connection failed');
    } finally {
      setTestingCarimages(false);
    }
  }

  async function testMapbox() {
    if (!mapbox.accessToken?.trim()) {
      showAlert('Enter a Mapbox Access Token first.');
      return;
    }
    setTestingMapbox(true);
    setMapboxTested(null);
    try {
      const res = await apiFetch('/v1/superadmin/mapbox/test', {
        method: 'POST',
        body: JSON.stringify({ accessToken: mapbox.accessToken.trim() }),
      });
      setMapboxTested(true);
      setMapboxTestMsg(`Mapbox token is valid (${res.code || 'TokenValid'}). Saved for live map tile rendering.`);
      localStorage.setItem('hudumika_mapbox_token', mapbox.accessToken.trim());
    } catch (err: any) {
      setMapboxTested(false);
      setMapboxTestMsg(err?.message || 'Mapbox token validation failed');
    } finally {
      setTestingMapbox(false);
    }
  }

  async function runCarimagesSample() {
    setRunningSample(true);
    try {
      if (sampleMode === '2d') {
        const res = await apiFetch('/v1/superadmin/carimages/signed-url', {
          method: 'POST',
          body: JSON.stringify({
            make: sampleMake,
            model: sampleModel,
            year: sampleYear ? Number(sampleYear) : undefined,
            view: sampleView,
            format: 'webp',
          }),
        });
        setSampleOutputUrl(res.url);
      } else {
        const res = await apiFetch('/v1/superadmin/carimages/signed-model-url', {
          method: 'POST',
          body: JSON.stringify({
            make: sampleMake,
            model: sampleModel,
            year: sampleYear ? Number(sampleYear) : undefined,
          }),
        });
        setSampleModelUrl(res.url);
      }
    } catch (err: any) {
      showAlert(`Sample runner failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setRunningSample(false);
    }
  }

  async function syncFleetAssets() {
    setSyncingFleet(true);
    try {
      const res = await apiFetch('/v1/superadmin/carimages/sync-fleet', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSyncFleetResult(res);
      showAlert(`Successfully enriched ${res.updatedCount} fleet vehicles with realistic CarImages studio photos!`);
    } catch (err: any) {
      showAlert(`Fleet sync failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setSyncingFleet(false);
    }
  }

  async function createRealisticFleetAssets() {
    setSeedingAssets(true);
    try {
      const res = await apiFetch('/v1/superadmin/carimages/create-sample-assets', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSeedingResult(res);
      showAlert(`Created and updated ${res.createdCount} realistic commercial fleet assets with verified CarImages specs!`);
    } catch (err: any) {
      showAlert(`Failed to seed fleet assets: ${err?.message || 'Unknown error'}`);
    } finally {
      setSeedingAssets(false);
    }
  }

  function copySnippet(text: string, id: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedSnippet(id);
      setTimeout(() => setCopiedSnippet(null), 2200);
    }
  }

  const SectionCard = ({ title, sub, children, section, readOnly }: { title:string; sub:string; children:React.ReactNode; section:string; readOnly?:boolean }) => (
    <div className="sa-settings-card">
      <div className="sa-settings-card-hdr">
        <div>
          <div className="sa-settings-card-title">{title}</div>
          <div className="sa-settings-card-sub">{sub}</div>
        </div>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="default"
            title={`Save ${title}`}
            onClick={() => save(section)}
            className="sa-app-save-btn"
          >
            {saved === section ? <><Icon name="check" size={13} /> Saved</> : <><Icon name="save" size={13} /> Save</>}
          </Button>
        )}
      </div>
      {children}
    </div>
  );

  const Field = ({ label, hint, children, half }: { label:string; hint?:string; children:React.ReactNode; half?:boolean }) => (
    <div style={{ gridColumn: half ? 'span 1' : undefined, marginBottom: 0 }}>
      <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--ink3)', marginTop:3 }}>{hint}</div>}
    </div>
  );

  const SAToggle = ({ value, onChange, label }: { value:boolean; onChange:(v:boolean)=>void; label:string }) => (
    <Switch
      checked={value}
      onCheckedChange={onChange}
      aria-label={label}
    />
  );

  if (loading) return <SectionLoading label="Loading platform settings" />;

  return (
    <div className="sa-settings-page">
      <PageHdr title="Platform Settings" sub="Platform-wide configuration applied across all tenants" />
      {settingsLoadError && <Banner variant="error" role="alert">Platform settings could not be loaded: {settingsLoadError}</Banner>}

      {/* ── Maintenance Mode ── */}
      <div className={`sa-settings-card sa-maintenance-card${maintenance ? ' is-active' : ''}`}>
        <div className="sa-maintenance-card-inner">
          <div className="sa-maintenance-copy">
            <div className="sa-maintenance-title">
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Maintenance Mode</span>
              <UiBadge variant={maintenance ? 'error' : 'success'}>
                {maintenance ? 'Active — Platform Offline' : 'Operational'}
              </UiBadge>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.45 }}>
              {maintenance
                ? 'Platform is in maintenance mode — all tenants see a maintenance page. API endpoints return 503.'
                : 'Platform is live and fully accessible to all tenants and staff.'}
            </div>
          </div>
          <Button
            type="button"
            variant={maintenance ? 'destructive' : 'default'}
            onClick={toggleMaintenance}
            style={{ fontWeight: 700, minHeight: 'var(--ctl-h)' }}
          >
            {maintenance ? 'Disable Maintenance' : 'Enable Maintenance'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="sa-settings-layout">
        <aside className="sa-settings-sidebar">
          <div className="sa-settings-nav-label">Configuration</div>
          <TabsList className="sa-settings-nav">
            {SETTINGS_SECTIONS.map(s => (
              <TabsTrigger key={s.id} value={s.id}>
                <Icon name={s.icon} size={14} />
                <span>{s.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <div className="sa-settings-content">
        <TabsContent value="security">
      {/* ── Security & Sessions ── */}
      <SectionCard title="Security & Sessions" sub="Password policy, session management, and access controls" section="security">
        <Banner variant="brand" icon="shield" className="sa-settings-banner">Enforced platform-wide on every login and request. SUPER_ADMIN accounts are exempt from the IP allowlist so a misconfiguration here can never lock the console itself out.</Banner>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="Minimum Password Length" hint="Characters required for all user passwords">
            <input data-ui-field="input" title="Min password length" type="number" min={6} max={32} value={security.minPasswordLength}
              onChange={e => setSecurity(p=>({...p,minPasswordLength:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Session Timeout" hint="Hours before an idle session is automatically signed out">
            <input data-ui-field="input" title="Session timeout hours" type="number" min={1} max={168} value={security.sessionTimeoutHours}
              onChange={e => setSecurity(p=>({...p,sessionTimeoutHours:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Max Login Attempts" hint="Failed attempts before account lockout is triggered">
            <input data-ui-field="input" title="Max login attempts" type="number" min={3} max={20} value={security.maxLoginAttempts}
              onChange={e => setSecurity(p=>({...p,maxLoginAttempts:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Lockout Duration (minutes)" hint="How long an account stays locked after max attempts">
            <input data-ui-field="input" title="Lockout duration" type="number" min={5} max={1440} value={security.lockoutMinutes}
              onChange={e => setSecurity(p=>({...p,lockoutMinutes:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Two-Factor Authentication Policy" hint="Applies to all tenant admin and staff accounts">
            <Select value={security.twoFaPolicy} onValueChange={v => setSecurity(p=>({...p,twoFaPolicy:v as any}))}>
              <SelectTrigger className="input-field" style={{ width:'100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off — not offered</SelectItem>
                <SelectItem value="optional">Optional — users can enable it</SelectItem>
                <SelectItem value="required">Required — all users must enable it</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="IP Allowlist" hint="Comma-separated CIDRs. Leave blank to allow all IPs.">
            <input data-ui-field="input" title="IP allowlist" placeholder="e.g. 196.0.0.0/8, 10.0.0.1" value={security.ipAllowlist}
              onChange={e => setSecurity(p=>({...p,ipAllowlist:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="smtp">
      {/* ── Email / SMTP ── */}
      <SectionCard title="Email / SMTP" sub="Outgoing email server configuration for notifications, alerts, and billing" section="smtp">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="SMTP Host">
            <input data-ui-field="input" title="SMTP Host" placeholder="smtp.mailgun.org" value={smtp.host}
              onChange={e => setSmtp(p=>({...p,host:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Port">
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <input data-ui-field="input" title="SMTP Port" placeholder="587" value={smtp.port}
                onChange={e => setSmtp(p=>({...p,port:e.target.value}))} className="input-field" style={{ flex:1 }} />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink2)', whiteSpace:'nowrap', cursor:'pointer' }}>
                <Switch checked={smtp.tls} onCheckedChange={v => setSmtp(p=>({...p,tls:v}))} aria-label="TLS" />
                TLS
              </label>
            </div>
          </Field>
          <Field label="Username">
            <input data-ui-field="input" title="SMTP Username" placeholder="no-reply@clearos.io" value={smtp.user}
              onChange={e => setSmtp(p=>({...p,user:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Password">
            <input data-ui-field="input" title="SMTP Password" type="password" placeholder="••••••••" value={smtp.pass}
              onChange={e => setSmtp(p=>({...p,pass:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="From Address" hint="Displayed as the sender name in all platform emails">
            <input data-ui-field="input" title="From address" placeholder="Hudumika <no-reply@clearos.io>" value={smtp.from}
              onChange={e => setSmtp(p=>({...p,from:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <Button type="button" variant="outline" size="sm" onClick={testSmtp} disabled={testingSmtp} style={{ gap:6 }}>
              {testingSmtp ? 'Testing...' : smtpTested ? <><Icon name="check" size={12}/>Connection OK</> : <><Icon name="mail" size={12}/>Send Test Email</>}
            </Button>
          </div>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="ai">
      {/* ── AI Providers (platform-wide fallback): one key per provider ── */}
      <SectionCard title="AI Providers" sub="Add a key for each provider you want available, then choose which one is the platform default. Billed to the platform — a tenant's own key (Hudu Advanced plan) always wins over these." section="ai">
        <div className="sa-setting-row" style={{ paddingTop: 0 }}>
          <div className="sa-setting-row-main">
            <div className="sa-setting-row-title">
              <span>Enable platform-default AI</span>
              <UiBadge variant={ai.enabled ? 'brand' : 'gray'}>
                {ai.enabled ? 'Enabled' : 'Disabled'}
              </UiBadge>
            </div>
            <div className="sa-setting-row-desc">
              {ai.enabled
                ? 'On — tenants with no key of their own get a working agent, billed to the platform.'
                : 'Off — a tenant without their own key sees "AI is not configured" until they add one.'}
            </div>
          </div>
          <Switch checked={ai.enabled} onCheckedChange={v => setAi(p=>({...p, enabled: v}))} size="lg" aria-label="Enable platform-default AI" />
        </div>

        {ai.enabled && !ai.providers[ai.provider]?.apiKey && (
          <Banner variant="warning" className="sa-settings-banner">The default provider ({AI_PROVIDERS.find(x => x.value === ai.provider)?.label.split(' — ')[0]}) has no key yet, so AI stays off until you add one or make another provider the default.</Banner>
        )}

        <div className="sa-ai-provider-grid">
          {AI_PROVIDERS.map(prov => {
            const row = ai.providers[prov.value] ?? { apiKey: '', model: '' };
            const hasKey = !!row.apiKey;
            const isDefault = ai.provider === prov.value;
            const [name, freeNote] = prov.label.split(' — ');
            const brand = AI_PROVIDER_BRAND[prov.value] ?? { icon: 'sparkle' as IconName, color: 'var(--teal)' };
            const saveKey = `ai-${prov.value}`;
            return (
              <div key={prov.value} data-testid={`ai-provider-${prov.value}`} className={`sa-ai-provider-card${isDefault ? ' is-active' : ''}`}>
                <div className="sa-sso-provider-hdr">
                  <div className="sa-sso-provider-info">
                    <div className="sa-sso-provider-icon" style={{ color: brand.color }}>
                      <Icon name={brand.icon} size={16} />
                    </div>
                    <div>
                      <div className="sa-sso-provider-name">{name}</div>
                      <div className="sa-sso-provider-type">{freeNote || 'Paid API'}</div>
                    </div>
                  </div>
                  <div className="sa-ai-provider-badges">
                    {isDefault && <UiBadge variant="brand">Default</UiBadge>}
                    {hasKey
                      ? <UiBadge variant="success">Key saved</UiBadge>
                      : <UiBadge variant="gray">No key</UiBadge>}
                  </div>
                </div>

                <div className="sa-ai-provider-fields">
                  <Field label="API key" hint={freeNote ? `Free — ${freeNote}. Shown masked once saved.` : 'Shown masked once saved.'}>
                    <input data-ui-field="input" title={`${name} API key`} type="password" placeholder="Paste API key" autoComplete="off" value={row.apiKey}
                      onChange={e => setAiRow(prov.value, { apiKey: e.target.value })} className="input-field" style={{ width:'100%' }} />
                  </Field>
                  <Field label="Model">
                    <Select value={row.model || prov.models[0].value} onValueChange={v => setAiRow(prov.value, { model: v })}>
                      <SelectTrigger className="input-field" style={{ width:'100%' }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {prov.models.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {aiTest[prov.value]?.message && (
                  <Banner role="status" variant={aiTest[prov.value].ok ? 'success' : 'error'} className="sa-ai-provider-result">
                    {aiTest[prov.value].message}
                  </Banner>
                )}

                <div className="sa-provider-card-footer">
                  <div className="sa-ai-provider-actions">
                    <Tip label={hasKey ? 'Test this provider with its saved key and current model' : 'Add and save an API key first'}>
                      <span><Button type="button" size="xs" variant="outline" disabled={!hasKey || aiTest[prov.value]?.busy}
                        onClick={() => testAiProvider(prov.value)}>{aiTest[prov.value]?.busy ? 'Testing…' : 'Test'}</Button></span>
                    </Tip>
                    {hasKey && <Button type="button" size="xs" variant="outline" onClick={() => { setAiRow(prov.value, { apiKey: '' }); setAiTest(prev => ({ ...prev, [prov.value]: { busy: false } })); }}>Remove key</Button>}
                    <Tip label={isDefault ? 'Current platform-default provider' : hasKey ? `Use ${name} as the platform default` : 'Add and save an API key first'}>
                      <span><Button type="button" size="xs" variant={isDefault ? 'default' : 'outline'} disabled={!hasKey || isDefault}
                        onClick={() => setAi(p => ({ ...p, provider: prov.value }))}>
                        {isDefault ? 'Default' : 'Make default'}
                      </Button></span>
                    </Tip>
                  </div>
                  <Button type="button" size="xs" variant="default"
                    onClick={() => save(saveKey)} className="sa-app-save-btn">
                    {saved === saveKey ? <><Icon name="check" size={12} /> Saved</> : <><Icon name="save" size={12} /> Save</>}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="ocr">
      {/* ── OCR / Document Scanning ── */}
      <SectionCard title="OCR / Document Scanning" sub="Google Gemini API key used to extract structured data from scanned BLs, invoices, and TANSAD documents in ClearOS" section="ocr">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="Gemini API Key" hint="From aistudio.google.com/apikey. Leave blank to keep OCR running on simulated demo data.">
            <input data-ui-field="input" title="Gemini API Key" type="password" placeholder="AIza••••••••••••••••" value={ocr.geminiApiKey}
              onChange={e => setOcr(p=>({...p,geminiApiKey:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <Button type="button" variant="outline" size="sm" onClick={testOcr} disabled={testingOcr} style={{ gap:6 }}>
              {testingOcr ? 'Testing...' : ocrTested ? <><Icon name="check" size={12}/>Connection OK</> : <><Icon name="zap" size={12}/>Test Connection</>}
            </Button>
          </div>
        </div>
        <div style={{ fontSize:11, color:'var(--ink3)', marginTop:6, display:'flex', alignItems:'center', gap:8 }}>
          {ocr.geminiApiKey ? <UiBadge variant="success">Live — Gemini Vision Extraction Active</UiBadge> : <UiBadge variant="gray">Simulated — No API Key Configured</UiBadge>}
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="ondiSso">
      {/* ── Ondi SSO (Dark-launch flag & Social Auth) ── */}
      <SectionCard
        title="Ondi SSO & Social Authentication"
        sub="Default sign-in experience and OAuth 2.0 social identity providers for all tenant accounts"
        section="ondiSso"
      >
        {/* Primary default sign-in toggle */}
        <div className="sa-setting-row" style={{ paddingTop: 0 }}>
          <div className="sa-setting-row-main">
            <div className="sa-setting-row-title">
              <span>Make Ondi the default sign-in page</span>
              <UiBadge variant={ondiSso.enabled ? 'brand' : 'gray'}>
                {ondiSso.enabled ? 'Ondi First' : 'Standard Password'}
              </UiBadge>
            </div>
            <div className="sa-setting-row-desc">
              {ondiSso.enabled
                ? 'Visitors land on Ondi (phone OTP, authenticator app, passkey, Google, Microsoft, Apple) first. Standard password login remains reachable via direct link.'
                : 'Visitors land on the traditional password sign-in page first. Ondi is accessible via direct link, but is not the default landing flow.'}
            </div>
          </div>
          <Switch
            checked={ondiSso.enabled}
            onCheckedChange={v => setOndiSso(p => ({ ...p, enabled: v }))}
            size="lg"
            aria-label="Make Ondi the default sign-in page"
          />
        </div>

        {/* Social sign-in providers */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Social Sign-in Providers</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
              {[ondiSso.googleClientId, ondiSso.microsoftClientId, ondiSso.appleClientId].filter(x => x?.trim()).length} of 3 configured
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16, lineHeight: 1.5 }}>
            Provide Client IDs to activate one-click social authentication platform-wide. Leave blank to hide a provider from the sign-in screen.
          </div>

          <div className="sa-sso-provider-grid">
            {/* Google Provider Card */}
            <div className={`sa-sso-provider-card${ondiSso.googleClientId?.trim() ? ' is-active' : ''}`}>
              <div className="sa-sso-provider-hdr">
                <div className="sa-sso-provider-info">
                  <div className="sa-sso-provider-icon" style={{ color: '#4285F4' }}>
                    <Icon name="globe" size={16} />
                  </div>
                  <div>
                    <div className="sa-sso-provider-name">Google OAuth 2.0</div>
                    <div className="sa-sso-provider-type">Google Accounts / Workspace</div>
                  </div>
                </div>
                <UiBadge variant={ondiSso.googleClientId?.trim() ? 'success' : 'gray'}>
                  {ondiSso.googleClientId?.trim() ? 'Live' : 'Not configured'}
                </UiBadge>
              </div>
              <div className="sa-sso-provider-field">
                <label htmlFor="google-client-id">Google Client ID</label>
                <Input
                  id="google-client-id"
                  placeholder="1234567890-abc.apps.googleusercontent.com"
                  value={ondiSso.googleClientId ?? ''}
                  onChange={e => setOndiSso(p => ({ ...p, googleClientId: e.target.value }))}
                  style={{ fontFamily: 'var(--font)', fontSize: "var(--text-base)" }}
                />
                <span className="sa-sso-provider-hint">
                  From Google Cloud Console ▸ Credentials (ends in .apps.googleusercontent.com)
                </span>
              </div>
              <div className="sa-provider-card-footer sa-provider-card-footer--end">
                <Button type="button" size="xs" variant="default"
                  onClick={() => save('ondi-google')} className="sa-app-save-btn">
                  {saved === 'ondi-google' ? <><Icon name="check" size={12} /> Saved</> : <><Icon name="save" size={12} /> Save</>}
                </Button>
              </div>
            </div>

            {/* Microsoft Provider Card */}
            <div className={`sa-sso-provider-card${ondiSso.microsoftClientId?.trim() ? ' is-active' : ''}`}>
              <div className="sa-sso-provider-hdr">
                <div className="sa-sso-provider-info">
                  <div className="sa-sso-provider-icon" style={{ color: '#00A4EF' }}>
                    <Icon name="monitor" size={16} />
                  </div>
                  <div>
                    <div className="sa-sso-provider-name">Microsoft Entra ID</div>
                    <div className="sa-sso-provider-type">Azure AD / Office 365</div>
                  </div>
                </div>
                <UiBadge variant={ondiSso.microsoftClientId?.trim() ? 'success' : 'gray'}>
                  {ondiSso.microsoftClientId?.trim() ? 'Live' : 'Not configured'}
                </UiBadge>
              </div>
              <div className="sa-sso-provider-field">
                <label htmlFor="microsoft-client-id">Application (Client) ID</label>
                <Input
                  id="microsoft-client-id"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={ondiSso.microsoftClientId ?? ''}
                  onChange={e => setOndiSso(p => ({ ...p, microsoftClientId: e.target.value }))}
                  style={{ fontFamily: 'var(--font)', fontSize: "var(--text-base)" }}
                />
                <span className="sa-sso-provider-hint">
                  From Azure Portal ▸ App registrations ▸ Application (client) ID
                </span>
              </div>
              <div className="sa-provider-card-footer sa-provider-card-footer--end">
                <Button type="button" size="xs" variant="default"
                  onClick={() => save('ondi-microsoft')} className="sa-app-save-btn">
                  {saved === 'ondi-microsoft' ? <><Icon name="check" size={12} /> Saved</> : <><Icon name="save" size={12} /> Save</>}
                </Button>
              </div>
            </div>

            {/* Apple Provider Card */}
            <div className={`sa-sso-provider-card${ondiSso.appleClientId?.trim() ? ' is-active' : ''}`}>
              <div className="sa-sso-provider-hdr">
                <div className="sa-sso-provider-info">
                  <div className="sa-sso-provider-icon" style={{ color: 'var(--ink)' }}>
                    <Icon name="shield" size={16} />
                  </div>
                  <div>
                    <div className="sa-sso-provider-name">Sign in with Apple</div>
                    <div className="sa-sso-provider-type">Apple ID / Web Auth</div>
                  </div>
                </div>
                <UiBadge variant={ondiSso.appleClientId?.trim() ? 'success' : 'gray'}>
                  {ondiSso.appleClientId?.trim() ? 'Live' : 'Not configured'}
                </UiBadge>
              </div>
              <div className="sa-sso-provider-field">
                <label htmlFor="apple-client-id">Apple Services ID</label>
                <Input
                  id="apple-client-id"
                  placeholder="com.yourcompany.web"
                  value={ondiSso.appleClientId ?? ''}
                  onChange={e => setOndiSso(p => ({ ...p, appleClientId: e.target.value }))}
                  style={{ fontFamily: 'var(--font)', fontSize: "var(--text-base)" }}
                />
                <span className="sa-sso-provider-hint">
                  From developer.apple.com ▸ Identifiers ▸ Services ID (not Bundle ID)
                </span>
              </div>
              <div className="sa-provider-card-footer sa-provider-card-footer--end">
                <Button type="button" size="xs" variant="default"
                  onClick={() => save('ondi-apple')} className="sa-app-save-btn">
                  {saved === 'ondi-apple' ? <><Icon name="check" size={12} /> Saved</> : <><Icon name="save" size={12} /> Save</>}
                </Button>
              </div>
            </div>
          </div>

          {/* Informational Guidance */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--card-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--ink3)' }}>
            <Icon name="info" size={15} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ lineHeight: 1.5 }}>
              Add this platform's origin as an authorized JavaScript origin (Google/Microsoft) or Return URL (Apple) in the respective provider's console.
            </div>
          </div>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="carimages">
      {/* ── CarImages API & Vehicle Data Integration ── */}
      <SectionCard
        title="Vehicle Realistic Images & Fleet Assets (CarImages API)"
        sub="Automated 2D studio photography, 3D interactive models, and fleet data enrichment across Hudumika Workspaces"
        section="carimages"
      >
        <div style={{ marginBottom: 20 }}>
          <Banner variant="info">
            CarImages API provides authentic high-resolution studio photography and interactive 3D models for passenger cars, commercial haul trucks, pickups, and vans. Assets are served with fast edge caching and signed URLs.
          </Banner>
        </div>

        {/* Credentials and Connection Testing */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
          <Field label="CarImages API Key" hint="Public identifier used by client loader and signed-url requests">
            <div style={{ display: 'flex', gap: 6 }}>
              <input data-ui-field="input"
                title="CarImages API Key"
                type="text"
                value={carimages.apiKey}
                onChange={e => setCarimages(p => ({ ...p, apiKey: e.target.value }))}
                className="input-field"
                style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: "var(--text-base)" }}
              />
              <Tip label={copiedSnippet === 'api-key' ? 'Copied!' : 'Copy API Key'}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => copySnippet(carimages.apiKey, 'api-key')}
                >
                  <Icon name={copiedSnippet === 'api-key' ? 'check' : 'clipboard'} size={13} />
                </Button>
              </Tip>
            </div>
          </Field>

          <Field label="CarImages API Secret" hint="Server-side secret used for administrative REST calls and make catalogs">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                title="CarImages API Secret"
                type={showCarimagesSecret ? 'text' : 'password'}
                value={carimages.secret}
                onChange={e => setCarimages(p => ({ ...p, secret: e.target.value }))}
                className="input-field"
                style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
              />
              <Tip label={showCarimagesSecret ? 'Hide secret' : 'Show secret'}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setShowCarimagesSecret(s => !s)}
                >
                  <Icon name={showCarimagesSecret ? 'eyeOff' : 'eye'} size={13} />
                </Button>
              </Tip>
              <Tip label={copiedSnippet === 'api-secret' ? 'Copied!' : 'Copy API Secret'}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => copySnippet(carimages.secret, 'api-secret')}
                >
                  <Icon name={copiedSnippet === 'api-secret' ? 'check' : 'clipboard'} size={13} />
                </Button>
              </Tip>
            </div>
          </Field>
        </div>

        {/* Test Connection Button & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={testCarimages}
            disabled={testingCarimages}
            style={{ gap: 6 }}
          >
            {testingCarimages ? 'Testing Connection...' : <><Icon name="zap" size={13} /> Test Connection</>}
          </Button>

          {carimagesTested === true && (
            <UiBadge variant="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={12} /> {carimagesTestMsg || 'Live — Connected to CarImages API'}
            </UiBadge>
          )}

          {carimagesTested === false && (
            <UiBadge variant="error" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alertCircle" size={12} /> {carimagesTestMsg || 'Connection failed'}
            </UiBadge>
          )}
        </div>

        {/* ── Step 1: Copy your API Key & Script Loader ── */}
        <div className="sa-api-step-card">
          <div className="sa-api-step-header">
            <div className="sa-api-step-title-wrap">
              <span className="sa-api-step-num">1</span>
              <div>
                <div className="sa-api-step-title">Add the Loader to your site</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  One line script tag in &lt;head&gt; with your API key pre-filled
                </div>
              </div>
            </div>
            <Tip label={copiedSnippet === 'loader-tag' ? 'Copied!' : 'Copy Script Tag'}>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  copySnippet(
                    `<script src="https://carimagesapi.com/assets/js/carimages.js"\n        data-api-key="${carimages.apiKey}" async></script>`,
                    'loader-tag'
                  )
                }
                style={{ gap: 5 }}
              >
                <Icon name={copiedSnippet === 'loader-tag' ? 'check' : 'clipboard'} size={13} />
                {copiedSnippet === 'loader-tag' ? 'Copied' : 'Copy Snippet'}
              </Button>
            </Tip>
          </div>

          <pre className="sa-api-code-snippet">
{`<script src="https://carimagesapi.com/assets/js/carimages.js"
        data-api-key="${carimages.apiKey}" async></script>`}
          </pre>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)' }}>
            <UiBadge variant="brand">Tip</UiBadge>
            <span>Serving motorcycles and commercial trucks too? Add <code>data-ci-type="any"</code> to your image tags.</span>
          </div>
        </div>

        {/* ── Step 2: Run a Sample Below (Interactive Playground) ── */}
        <div className="sa-api-step-card">
          <div className="sa-api-step-header">
            <div className="sa-api-step-title-wrap">
              <span className="sa-api-step-num">2</span>
              <div>
                <div className="sa-api-step-title">Run a sample below</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Test 2D studio photography and interactive 3D models live
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={runCarimagesSample}
              disabled={runningSample}
              style={{ gap: 6 }}
            >
              <Icon name="play" size={13} />
              {runningSample ? 'Fetching Asset...' : '▶ Run Sample'}
            </Button>
          </div>

          {/* Playground Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <Field label="Make">
              <input data-ui-field="input"
                type="text"
                value={sampleMake}
                onChange={e => setSampleMake(e.target.value)}
                placeholder="e.g. BMW, Toyota, Scania"
                className="input-field"
                style={{ width: '100%', fontSize: "var(--text-base)" }}
              />
            </Field>

            <Field label="Model">
              <input data-ui-field="input"
                type="text"
                value={sampleModel}
                onChange={e => setSampleModel(e.target.value)}
                placeholder="e.g. 3 Series, X5, Hilux"
                className="input-field"
                style={{ width: '100%', fontSize: "var(--text-base)" }}
              />
            </Field>

            <Field label="Year">
              <input data-ui-field="input"
                type="text"
                value={sampleYear}
                onChange={e => setSampleYear(e.target.value)}
                placeholder="2022"
                className="input-field"
                style={{ width: '100%', fontSize: "var(--text-base)" }}
              />
            </Field>

            <Field label="Display Mode">
              <div style={{ display: 'flex', gap: 4 }}>
                <Button
                  type="button"
                  size="xs"
                  variant={sampleMode === '2d' ? 'default' : 'outline'}
                  onClick={() => setSampleMode('2d')}
                  style={{ flex: 1 }}
                >
                  2D Studio
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={sampleMode === '3d' ? 'default' : 'outline'}
                  onClick={() => setSampleMode('3d')}
                  style={{ flex: 1 }}
                >
                  3D Model
                </Button>
              </div>
            </Field>

            {sampleMode === '2d' ? (
              <Field label="Camera Angle">
                <select data-ui-field="select"
                  value={sampleView}
                  onChange={e => setSampleView(e.target.value as any)}
                  className="input-field"
                  style={{ width: '100%', fontSize: "var(--text-base)" }}
                >
                  <option value="3-4">3/4 Front Studio</option>
                  <option value="side">Direct Side</option>
                  <option value="front">Direct Front</option>
                  <option value="rear">Direct Rear</option>
                  <option value="top">Top Down</option>
                </select>
              </Field>
            ) : (
              <Field label="Backdrop Studio">
                <select data-ui-field="select"
                  value={sampleBackdrop}
                  onChange={e => setSampleBackdrop(e.target.value as any)}
                  className="input-field"
                  style={{ width: '100%', fontSize: "var(--text-base)" }}
                >
                  <option value="graphite">Graphite Studio</option>
                  <option value="dark">Dark Minimal</option>
                  <option value="slate">Slate Industrial</option>
                  <option value="sand">Sand Warm</option>
                  <option value="mint">Mint Clean</option>
                  <option value="light">Light Crisp</option>
                </select>
              </Field>
            )}
          </div>

          {/* Playground Visual Stage */}
          <div className="sa-api-playground-stage">
            {sampleMode === '2d' ? (
              sampleOutputUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
                  <img
                    src={sampleOutputUrl}
                    alt={`${sampleMake} ${sampleModel}`}
                    className="sa-api-playground-img"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink3)' }}>
                    <UiBadge variant="success">2D Studio Output Verified</UiBadge>
                    <span>{sampleMake} {sampleModel} ({sampleYear})</span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>
                  <Icon name="image" size={32} style={{ marginBottom: 6, opacity: 0.5 }} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Click &quot;▶ Run Sample&quot; to fetch realistic studio image</div>
                </div>
              )
            ) : (
              <div style={{ width: '100%' }}>
                <CarVehicle3DViewer
                  make={sampleMake}
                  model={sampleModel}
                  year={sampleYear}
                  modelUrl={sampleModelUrl}
                  backdrop={sampleBackdrop}
                  height={280}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Step 3: Paste the Snippet into your site ── */}
        <div className="sa-api-step-card">
          <div className="sa-api-step-header">
            <div className="sa-api-step-title-wrap">
              <span className="sa-api-step-num">3</span>
              <div>
                <div className="sa-api-step-title">Paste the snippet into your site</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Drop-in 2D studio images, interactive 3D models, or server-side cURL commands
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <Button
                type="button"
                size="xs"
                variant={activeSnippetTab === 'loader' ? 'default' : 'outline'}
                onClick={() => setActiveSnippetTab('loader')}
              >
                Loader
              </Button>
              <Button
                type="button"
                size="xs"
                variant={activeSnippetTab === '2d' ? 'default' : 'outline'}
                onClick={() => setActiveSnippetTab('2d')}
              >
                2D Image Tag
              </Button>
              <Button
                type="button"
                size="xs"
                variant={activeSnippetTab === '3d' ? 'default' : 'outline'}
                onClick={() => setActiveSnippetTab('3d')}
              >
                3D &lt;model-viewer&gt;
              </Button>
              <Button
                type="button"
                size="xs"
                variant={activeSnippetTab === 'rest' ? 'default' : 'outline'}
                onClick={() => setActiveSnippetTab('rest')}
              >
                REST API (cURL)
              </Button>
            </div>
          </div>

          {activeSnippetTab === 'loader' && (
            <div>
              <pre className="sa-api-code-snippet">
{`<script src="https://carimagesapi.com/assets/js/carimages.js"
        data-api-key="${carimages.apiKey}" async></script>`}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    copySnippet(
                      `<script src="https://carimagesapi.com/assets/js/carimages.js"\n        data-api-key="${carimages.apiKey}" async></script>`,
                      'loader-snippet'
                    )
                  }
                  style={{ gap: 5 }}
                >
                  <Icon name={copiedSnippet === 'loader-snippet' ? 'check' : 'clipboard'} size={13} />
                  {copiedSnippet === 'loader-snippet' ? 'Copied' : 'Copy Loader Script'}
                </Button>
              </div>
            </div>
          )}

          {activeSnippetTab === '2d' && (
            <div>
              <pre className="sa-api-code-snippet">
{`<img data-ci-make="${sampleMake}" data-ci-model="${sampleModel}" data-ci-year="${sampleYear}" data-ci-type="any" alt="${sampleMake} ${sampleModel}">`}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    copySnippet(
                      `<img data-ci-make="${sampleMake}" data-ci-model="${sampleModel}" data-ci-year="${sampleYear}" data-ci-type="any" alt="${sampleMake} ${sampleModel}">`,
                      '2d-snippet'
                    )
                  }
                  style={{ gap: 5 }}
                >
                  <Icon name={copiedSnippet === '2d-snippet' ? 'check' : 'clipboard'} size={13} />
                  {copiedSnippet === '2d-snippet' ? 'Copied' : 'Copy 2D &lt;img&gt; Tag'}
                </Button>
              </div>
            </div>
          )}

          {activeSnippetTab === '3d' && (
            <div>
              <pre className="sa-api-code-snippet">
{`<model-viewer data-ci-make="${sampleMake}" data-ci-model="${sampleModel}" data-ci-year="${sampleYear}"
              camera-controls auto-rotate></model-viewer>`}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    copySnippet(
                      `<model-viewer data-ci-make="${sampleMake}" data-ci-model="${sampleModel}" data-ci-year="${sampleYear}"\n              camera-controls auto-rotate></model-viewer>`,
                      '3d-snippet'
                    )
                  }
                  style={{ gap: 5 }}
                >
                  <Icon name={copiedSnippet === '3d-snippet' ? 'check' : 'clipboard'} size={13} />
                  {copiedSnippet === '3d-snippet' ? 'Copied' : 'Copy 3D &lt;model-viewer&gt; Tag'}
                </Button>
              </div>
            </div>
          )}

          {activeSnippetTab === 'rest' && (
            <div>
              <pre className="sa-api-code-snippet">
{`# 1. List all makes — server-side needs your key and secret
curl -H "Authorization: Bearer ${carimages.apiKey}" \\
     -H "X-Api-Secret: ${carimages.secret}" \\
  https://carimagesapi.com/api/v1/makes

# 2. Signed URL for browser — API key only (image or 3D model)
curl "https://carimagesapi.com/api/v1/signed-url?api_key=${carimages.apiKey}&make=${encodeURIComponent(sampleMake)}&model=${encodeURIComponent(sampleModel)}"`}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    copySnippet(
                      `curl -H "Authorization: Bearer ${carimages.apiKey}" -H "X-Api-Secret: ${carimages.secret}" https://carimagesapi.com/api/v1/makes`,
                      'rest-snippet'
                    )
                  }
                  style={{ gap: 5 }}
                >
                  <Icon name={copiedSnippet === 'rest-snippet' ? 'check' : 'clipboard'} size={13} />
                  {copiedSnippet === 'rest-snippet' ? 'Copied' : 'Copy cURL Command'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Fleet Asset Data & Image Creation ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
            Hudumika Fleet Data &amp; Realistic Asset Generation
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>
            Use the CarImages API to populate realistic studio photos across all fleet assets and create commercial heavy vehicles.
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={syncFleetAssets}
              disabled={syncingFleet}
              style={{ gap: 6 }}
            >
              <Icon name="refresh" size={13} />
              {syncingFleet ? 'Enriching Fleet Vehicles...' : 'Sync & Enrich Live Fleet Assets'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={createRealisticFleetAssets}
              disabled={seedingAssets}
              style={{ gap: 6 }}
            >
              <Icon name="truck" size={13} />
              {seedingAssets ? 'Creating Assets...' : 'Generate Realistic Fleet Samples'}
            </Button>
          </div>

          {syncFleetResult && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--teal)' }}>
              ✓ Scanned {syncFleetResult.totalScanned} vehicles; updated {syncFleetResult.updatedCount} with realistic CarImages photography!
            </div>
          )}

          {seedingResult && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--teal)' }}>
              ✓ Successfully created/updated {seedingResult.createdCount} commercial vehicles with verified specifications and photo URLs!
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Mapbox Maps API Setup ── */}
      <SectionCard
        title="Mapbox Maps Integration"
        sub="High-resolution vector maps, dark basemaps, and satellite terrain for live vehicle tracking and route planning"
        section="mapbox"
      >
        <div style={{ marginBottom: 16 }}>
          <Banner variant="info">
            Hudumika uses Mapbox vector and raster tiles for live freight GPS tracking, geofence radius monitoring, and corridor route maps. See{' '}
            <a
              href="https://docs.mapbox.com/help/getting-started/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'underline' }}
            >
              Getting Started | Help | Mapbox
            </a>{' '}
            for token creation.
          </Banner>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
          <Field label="Mapbox Public Access Token" hint="Format: pk.eyJ1Ijo... (from account.mapbox.com/access-tokens)">
            <input data-ui-field="input"
              title="Mapbox Access Token"
              type="text"
              placeholder="pk.eyJ1IjoiaHVkdW1pa2EiLCJhIjoi..."
              value={mapbox.accessToken}
              onChange={e => setMapbox(p => ({ ...p, accessToken: e.target.value }))}
              className="input-field"
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: "var(--text-base)" }}
            />
          </Field>

          <Field label="Default Map Style" hint="Basemap style preset for tracking and vehicle routes">
            <select data-ui-field="select"
              value={mapbox.defaultStyle}
              onChange={e => setMapbox(p => ({ ...p, defaultStyle: e.target.value }))}
              className="input-field"
              style={{ width: '100%', fontSize: "var(--text-base)" }}
            >
              <option value="mapbox/streets-v12">Mapbox Streets (streets-v12)</option>
              <option value="mapbox/dark-v11">Mapbox Dark (dark-v11)</option>
              <option value="mapbox/satellite-streets-v12">Mapbox Satellite Streets (satellite-streets-v12)</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={testMapbox}
            disabled={testingMapbox}
            style={{ gap: 6 }}
          >
            {testingMapbox ? 'Validating Token...' : <><Icon name="checkCircle" size={13} /> Test Mapbox Token</>}
          </Button>

          {mapboxTested === true && (
            <UiBadge variant="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={12} /> {mapboxTestMsg || 'Mapbox Token Active'}
            </UiBadge>
          )}

          {mapboxTested === false && (
            <UiBadge variant="error" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alertCircle" size={12} /> {mapboxTestMsg || 'Invalid Mapbox Token'}
            </UiBadge>
          )}

          {!mapboxTested && (
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
              {mapbox.accessToken ? 'Token entered — click Test to verify' : 'When no token is provided, maps gracefully use OpenStreetMap and Esri tiles'}
            </div>
          )}
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="api">
      {/* ── API & Webhooks ── */}
      <SectionCard title="API & Webhooks" sub="Rate limiting, CORS, and webhook security for platform APIs" section="api">
        <div style={{ marginBottom:16 }}>
          <Banner variant="warning">Rate limit and CORS origins are enforced platform-wide. Key rotation and the webhook secret below are saved but not yet acted on anywhere.</Banner>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="API Rate Limit" hint="Maximum requests per minute for a normal app session (partner API keys keep their own fixed 300/min)">
            <input data-ui-field="input" title="Rate limit" type="number" min={10} max={10000} value={api.rateLimit}
              onChange={e => setApi(p=>({...p,rateLimit:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="API Key Rotation" hint="Days before API keys are flagged for rotation">
            <input data-ui-field="input" title="Key rotation days" type="number" min={30} max={365} value={api.keyRotationDays}
              onChange={e => setApi(p=>({...p,keyRotationDays:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="CORS Allowed Origins" hint="Comma-separated extra origins, layered on top of the server's own configured origin — this can only add access, never remove the app's own.">
            <input data-ui-field="input" title="CORS origins" placeholder="https://app.yourcompany.com" value={api.corsOrigins}
              onChange={e => setApi(p=>({...p,corsOrigins:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Webhook Signing Secret" hint="Not yet used to sign anything — saved for a future outbound webhook feature">
            <div style={{ display:'flex', gap:8 }}>
              <input data-ui-field="input" title="Webhook secret" type={showWebhookSecret ? 'text' : 'password'} value={api.webhookSecret}
                onChange={e => setApi(p=>({...p,webhookSecret:e.target.value}))} className="input-field" style={{ flex:1 }} />
              <Tip label={showWebhookSecret ? 'Hide webhook secret' : 'Show webhook secret'}>
                <Button type="button" variant="outline" size="xs" aria-label={showWebhookSecret ? 'Hide webhook secret' : 'Show webhook secret'}
                  onClick={() => setShowWebhookSecret(s => !s)} style={{ flexShrink:0 }}>
                  <Icon name={showWebhookSecret ? 'eyeOff' : 'eye'} size={14} />
                </Button>
              </Tip>
              <Tip label="Generate a new webhook signing secret">
                <Button type="button" variant="outline" size="xs" onClick={() => regenerateWebhookSecret()} style={{ flexShrink:0, gap:5 }}>
                  <Icon name="refresh" size={13} />{saved==='api-regen'?'Done':'Regen'}
                </Button>
              </Tip>
            </div>
          </Field>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="modules-pointer">
      {/* ── Modules & Plan Features ── */}
      {/* This used to be two separate panels (Feature Flags, Storage Quotas)
          whose toggles/fields saved to a settings key nothing ever read —
          real writes, but a dead end. App Status and Packages already own
          this for real (app_status/package_features/package_app_quotas,
          actually enforced), so this card points there instead of running a
          second, disconnected copy of the same controls. */}
      <SectionCard title="Modules & Plan Features" sub="Per-app availability and per-plan feature/storage grants" section="modules-pointer" readOnly>
        <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.6, marginBottom:16 }}>
          Enabling or disabling an app platform-wide (or per tenant), and what each subscription plan includes — feature grants, storage limits, monthly item caps — are configured on their own real, enforced pages rather than duplicated here.
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <Link to="/admin/app-status" className="btn btn-outline btn-sm" style={{ gap:6 }}>
            <Icon name="shield" size={13} /> Open App Status
          </Link>
          <Link to="/admin/packages" className="btn btn-outline btn-sm" style={{ gap:6 }}>
            <Icon name="package" size={13} /> Open Packages
          </Link>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="cron">
      {/* ── Cron Jobs ── */}
      <SectionCard title="Cron Jobs" sub="Every background job actually registered by this server — name and schedule, read live" section="cron" readOnly>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: jobs.connected ? 'var(--green)' : 'var(--gold)', background: jobs.connected ? 'var(--green-l)' : 'var(--gold-l)', border: `1px solid ${jobs.connected ? 'var(--green)' : 'var(--gold)'}`, borderRadius: 'var(--r)', padding:'8px 12px', marginBottom:16 }}>
          <Icon name={jobs.connected ? 'checkCircle' : 'alertTriangle'} size={13} />
          {jobs.connected ? 'BullMQ (Redis) connected — schedules below are persistent and distributed.' : 'Redis unavailable — running on an in-process interval fallback (no persisted run history).'}
        </div>
        <div className="rtbl-wrap">
          <table className="rtbl">
            <thead>
              <tr className="sa-cron-hdr-row">
                <th className="sa-cron-th">Job</th>
                <th className="sa-cron-th">Schedule</th>
                <th className="sa-cron-th--center">Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedCronJobs.map(j => {
                const runs = !j.fallbackOnly || !jobs.connected;
                return (
                  <tr key={`${j.name}-${j.schedule}`} className="sa-cron-row">
                    <td className="sa-cron-td">{j.name}</td>
                    <td className="sa-cron-td--sched">{j.schedule}</td>
                    <td className="sa-cron-td--status">
                      <span className={`sa-cron-badge sa-cron-badge--${runs ? 'active' : 'inactive'}`} title={j.fallbackOnly ? 'Only scheduled by the interval fallback — no BullMQ repeat registration exists for this job yet.' : undefined}>
                        {runs ? 'scheduled' : 'not scheduled'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {jobs.jobs.length === 0 && (
                <tr><td colSpan={3}><SectionLoading /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {jobs.jobs.length > 0 && (
          <PaginationBar
            page={cronPage}
            pageSize={cronPageSize}
            total={jobs.jobs.length}
            onPageChange={setCronPage}
            onPageSizeChange={size => { setCronPageSize(size); setCronPage(1); }}
            pageSizeOptions={[10, 20, 50, 100]}
            itemLabel="cron jobs"
          />
        )}
      </SectionCard>
        </TabsContent>

        <TabsContent value="server">
      {/* ── System & Server Info ── */}
      <SectionCard title="System & Server Info" sub="Read-only platform infrastructure and runtime details, read live from the running process" section="server" readOnly>
        <div className="sa-server-grid">
          {serverInfo ? ([
            ['Node.js Runtime', String(serverInfo.nodeVersion)],
            ['Environment', String(serverInfo.environment)],
            ['Database', String(serverInfo.database)],
            ['Job Scheduling', String(serverInfo.jobScheduling)],
            ['Platform', String(serverInfo.platform)],
            ['CPU', `${serverInfo.cpuCount} × ${serverInfo.cpuModel}`],
            ['System Memory', `${serverInfo.freeMemoryMb} MB free / ${serverInfo.totalMemoryMb} MB`],
            ['Process Heap', `${serverInfo.heapUsedMb} MB used / ${serverInfo.heapTotalMb} MB`],
            ['Server Timezone', String(serverInfo.timezone)],
            ['App Uptime', String(serverInfo.appUptime)],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <div className="sa-server-label">{label}</div>
              <div className="sa-server-value sa-server-value--mono">{value}</div>
            </div>
          )) : (
            <SectionLoading />
          )}
        </div>
      </SectionCard>
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   APP STATUS VIEW — per-app maintenance kill switch
══════════════════════════════════════════════════ */
const APP_LABELS: Record<string, string> = {
  ai: 'AI', clearos: 'ClearOS', cloud: 'Cloud', complyos: 'ComplyOS',
  contacts: 'Contacts', email: 'Email', finops: 'FinOps', ondi: 'Ondi',
  nexushr: 'NexusHR', tracking: 'Tracking', demurrage: 'Demurrage', cargotracker: 'CargoTracker',
  petti: 'Petti', notes: 'Notes', sign: 'eSign', sms: 'SMS', onsite: 'Onsite', onesite: 'CMS',
  inventory: 'Inventory',
  // Backfilled by migration 395 — these had real feature keys and
  // package_features grants (see ALL_FEATURE_KEYS) but never got an
  // app_status row at all, so this console had nothing to toggle for them,
  // for maintenance or Beta either one.
  seal: 'SEAL', studio: 'Studio', crm: 'CRM', bliss: 'Bliss', calendar: 'Calendar',
  tasks: 'Tasks', projects: 'Projects', store: 'Store', hudubi: 'HuduBI',
};

const APP_CATEGORIES: Record<string, string> = {
  clearos: 'Logistics', cargotracker: 'Logistics', tracking: 'Logistics', demurrage: 'Logistics', seal: 'Logistics',
  finops: 'Finance', petti: 'Finance',
  nexushr: 'HR & People',
  crm: 'Sales & CRM',
  bliss: 'Support',
  complyos: 'Compliance',
  cloud: 'Storage',
  email: 'Communication', sms: 'Communication',
  contacts: 'Productivity', notes: 'Productivity', tasks: 'Productivity', calendar: 'Productivity', sign: 'Productivity', projects: 'Productivity',
  studio: 'Workflow',
  onesite: 'Content',
  onsite: 'Infrastructure',
  hudubi: 'Analytics',
  store: 'Commerce',
  ondi: 'Identity & Auth',
  ai: 'AI & Automation',
  lens: 'System & Debug',
  developer: 'Developer',
  inventory: 'Operations',
};

const APP_BRAND_COLORS: Record<string, string> = {
  clearos: '#ea580c', cargotracker: '#4f46e5', tracking: '#0891b2', demurrage: '#d97706', seal: '#0f766e',
  finops: '#0284c7', petti: '#16a34a',
  nexushr: '#0d9488',
  crm: '#059669',
  bliss: '#7c3aed',
  complyos: '#059669',
  cloud: '#0369a1',
  email: '#0078d4', sms: '#1257c6',
  contacts: '#1a73e8', notes: '#fbbc04', tasks: '#0f766e', calendar: '#db2777', sign: '#2563eb', projects: '#f59e0b',
  studio: '#4361ee',
  onesite: '#06b6d4',
  onsite: '#0f172a',
  hudubi: '#18181b',
  store: '#8b5cf6',
  ondi: '#4253d1',
  ai: '#8b5cf6',
  lens: '#475569',
  developer: '#0f766e',
  inventory: '#64748b',
};

const APP_ICONS: Record<string, IconName> = {
  ai: 'sparkle', clearos: 'ship', cloud: 'folder', complyos: 'shield',
  contacts: 'contact', email: 'mail', finops: 'dollarSign', ondi: 'key',
  nexushr: 'users', tracking: 'truck', demurrage: 'timer', cargotracker: 'container',
  petti: 'wallet', notes: 'fileText', sign: 'stamp', sms: 'messageSquare', onsite: 'globe', onesite: 'layoutDashboard',
  inventory: 'package',
  seal: 'lock', studio: 'gitBranch', crm: 'briefcase', bliss: 'headphones', calendar: 'calendar',
  tasks: 'checkCircle', projects: 'columns', store: 'shoppingCart', hudubi: 'barChart2',
};

interface AppStatusRow { app_id: string; status: 'active' | 'maintenance'; message: string | null; is_beta: boolean; updated_at: string; }

type ReadinessState = 'internal' | 'pilot' | 'sellable' | 'limited_availability' | 'general_availability' | 'suspended' | 'retired';
interface CommercialProductRow { product_key: string; name: string; standalone_purchasable: boolean; readiness_state: ReadinessState; }
const READINESS_OPTIONS: { value: ReadinessState; label: string }[] = [
  { value: 'internal', label: 'Internal' },
  { value: 'pilot', label: 'Pilot' },
  { value: 'sellable', label: 'Sellable' },
  { value: 'limited_availability', label: 'Limited availability' },
  { value: 'general_availability', label: 'General availability' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'retired', label: 'Retired' },
];

type AppStatusSort = 'name' | 'status' | 'updated';

function timeAgo(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return 'Recently';
  }
}

const FREIGHT_PREVIEW_PRODUCTS = [
  { key: 'clearos', label: 'ClearOS', unit: 'Clearance cases' },
  { key: 'hudufreight', label: 'HuduFreight', unit: 'Departed trips' },
  { key: 'cargotracker', label: 'CargoTracker', unit: 'Tracking activations' },
] as const;

interface FreightPricingDraft {
  revision: number;
  tested: boolean;
  configuration: {
    discount_percent: number;
    rates: Record<(typeof FREIGHT_PREVIEW_PRODUCTS)[number]['key'], number>;
  } | null;
  updated_at: string | null;
}

function FreightTenantPreview({ revision, onTested }: { revision: number; onTested: () => void }) {
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [invitationNotice, setInvitationNotice] = useState('');
  const [quote, setQuote] = useState<{
    lines: { product_key: string; quantity: number; total_tzs: number }[];
    total_tzs: number;
  } | null>(null);
  const format = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });

  useEffect(() => {
    apiFetch<typeof tenants>('/v1/superadmin/tenants')
      .then(rows => setTenants(rows.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load tenants.'));
  }, []);

  async function inviteTenant() {
    const tenant = tenants.find(item => item.id === tenantId);
    if (!tenant || !await showConfirm(`Invite ${tenant.name} to the freight usage pilot? Their billing manager can accept from Workspace Billing.`, {
      title: 'Invite workspace to freight usage pilot',
      confirmLabel: 'Invite workspace',
    })) return;
    setPending(true);
    setError('');
    setInvitationNotice('');
    try {
      const { data } = await apiFetch<{ data: { accepted_at: string | null } }>('/v1/superadmin/commercial-products/freight-forwarder/pilot-invitations', {
        method: 'POST', body: JSON.stringify({ tenant_id: tenant.id }),
      });
      setInvitationNotice(data.accepted_at ? `${tenant.name} has already enrolled.` : `${tenant.name} can now accept the invitation from Workspace Billing.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite this workspace.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-3 border-t p-4" onChange={() => setQuote(null)} onSubmit={async event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      setPending(true);
      setError('');
      setQuote(null);
      try {
        setQuote(await apiFetch('/v1/superadmin/commercial-products/freight-forwarder/tenant-preview', {
          method: 'POST',
          body: JSON.stringify({ tenant_id: tenantId, revision, period: { from: fields.get('from'), to: fields.get('to') } }),
        }));
        onTested();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not preview tenant usage.');
      } finally {
        setPending(false);
      }
    }}>
      <h3 className="font-medium">Test saved draft against tenant usage</h3>
      <p className="text-sm">Uses saved revision {revision}. Dates are UTC. CargoTracker counts new verified tracking activations after metering began.</p>
      <fieldset disabled={pending} className="space-y-3">
        <Select value={tenantId} disabled={pending} onValueChange={value => { setTenantId(value); setQuote(null); setInvitationNotice(''); }}>
          <SelectTrigger aria-label="Tenant"><SelectValue placeholder="Select a tenant" /></SelectTrigger>
          <SelectContent>
            {tenants.map(tenant => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">From, inclusive<Input type="date" name="from" required /></label>
          <label className="text-sm">To, exclusive<Input type="date" name="to" required /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!tenantId || pending}>Test tenant usage</Button>
          <Button type="button" variant="outline" disabled={!tenantId || pending} onClick={inviteTenant}>Invite to usage pilot</Button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {invitationNotice && <p role="status">{invitationNotice}</p>}
      {quote && <div aria-live="polite" className="space-y-1 text-sm">
        {quote.lines.map(line => {
          const product = FREIGHT_PREVIEW_PRODUCTS.find(item => item.key === line.product_key);
          return <p key={line.product_key}>
            {product?.label}{' · '}{line.quantity.toLocaleString('en-TZ')}{' '}{product?.unit.toLowerCase()}
            {' · '}{format.format(line.total_tzs)}
          </p>;
        })}
        <p className="font-semibold">Estimated total before tax {format.format(quote.total_tzs)}</p>
      </div>}
      {tenantId && <FreightPilotDraftReview key={tenantId} tenantId={tenantId} />}
    </form>
  );
}

function FreightPilotDraftReview({ tenantId }: { tenantId: string }) {
  const [drafts, setDrafts] = useState<{ id: string; period_start: string; period_end: string }[] | null>(null);
  const [selected, setSelected] = useState<{
    id: string;
    snapshot: {
      total_tzs: number;
      segments: {
        from_inclusive: string; to_exclusive: string; revision: number | null;
        lines: {
          product_key: string; quantity: number;
          quote: { unit_price_tzs: number; discount_tzs: number; total_tzs: number } | null;
        }[];
      }[];
    };
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const path = `/v1/superadmin/commercial-products/freight-forwarder/pilot-drafts/${encodeURIComponent(tenantId)}`;
  const format = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });

  async function load(id?: string) {
    setPending(true);
    setError('');
    setSelected(null);
    try {
      if (id) {
        setSelected(await apiFetch(`${path}/${encodeURIComponent(id)}`));
      } else {
        const { data } = await apiFetch<{ data: NonNullable<typeof drafts> }>(path);
        setDrafts(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pilot drafts.');
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-3 border-t pt-3 text-sm">
    <h4 className="font-semibold">Saved pilot drafts</h4>
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => load()}>
      {drafts ? 'Refresh draft list' : 'Review pilot drafts'}
    </Button>
    {pending && <p role="status">Loading pilot drafts…</p>}
    {error && <p role="alert">{error}</p>}
    {drafts?.length === 0 && <p>No pilot drafts saved for this workspace.</p>}
    {drafts && drafts.length > 0 && <ul className="space-y-2">
      {drafts.map(draft => <li key={draft.id} className="flex flex-wrap items-center gap-2">
        <span>{draft.period_start} to {draft.period_end} (exclusive, UTC)</span>
        <Button type="button" variant="outline" size="sm" disabled={pending || selected?.id === draft.id} onClick={() => load(draft.id)}>
          {selected?.id === draft.id ? 'Open' : 'Open saved draft'}
        </Button>
      </li>)}
    </ul>}
    {selected && <div className="space-y-3 rounded-md border p-3" aria-live="polite">
      <p className="font-semibold">Saved snapshot · For review only</p>
      {selected.snapshot.segments.map(segment => <div key={segment.from_inclusive}>
        <p className="font-medium">{segment.from_inclusive} to {segment.to_exclusive} (exclusive) · Revision {segment.revision}</p>
        <ul className="space-y-1">
          {segment.lines.map(line => <li key={line.product_key}>
            {FREIGHT_PREVIEW_PRODUCTS.find(product => product.key === line.product_key)?.label ?? line.product_key}
            {' · '}{line.quantity.toLocaleString('en-TZ')}
            {line.quote && <> × {format.format(line.quote.unit_price_tzs)} · Savings {format.format(line.quote.discount_tzs)} · {format.format(line.quote.total_tzs)}</>}
          </li>)}
        </ul>
      </div>)}
      <p className="font-semibold">Saved total before tax {format.format(selected.snapshot.total_tzs)}</p>
    </div>}
  </div>;
}

function FreightPublish({ draft }: { draft: FreightPricingDraft }) {
  const [versions, setVersions] = useState<{ revision: number; effective_on: string; status: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const path = '/v1/superadmin/commercial-products/freight-forwarder';
  const scheduled = versions.some(version => version.status === 'scheduled');
  const published = versions.some(version => version.revision === draft.revision);

  async function loadVersions() {
    try {
      setVersions((await apiFetch(`${path}/versions`)).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load published versions.');
    }
  }

  useEffect(() => { void loadVersions(); }, []);

  return <form className="space-y-3 border-t p-4" onSubmit={async event => {
    event.preventDefault();
    const effective_on = new FormData(event.currentTarget).get('effective_on');
    setPending(true);
    setError('');
    try {
      if (!await showConfirm(`Show revision ${draft.revision} to all tenant billing managers from ${effective_on} UTC? This publishes a rate card for reference.`, {
        title: 'Schedule platform-wide rate card',
        confirmLabel: 'Schedule publication',
      })) return;
      await apiFetch(`${path}/publish`, { method: 'POST', body: JSON.stringify({ revision: draft.revision, effective_on }) });
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule publication.');
    } finally {
      setPending(false);
    }
  }}>
    <h3 className="font-medium">Publish rate card</h3>
    <p className="text-sm">The rate card is for reference. Tenant subscriptions and invoices continue using their existing rates.</p>
    {!draft.tested && <p className="text-sm">Test this saved revision against a tenant before publishing.</p>}
    {scheduled && <p className="text-sm">One rate card is already scheduled.</p>}
    <fieldset disabled={!draft.tested || scheduled || published || pending} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Effective date (UTC)<Input type="date" name="effective_on" required /></label>
      <Button type="submit">{pending ? 'Scheduling…' : 'Schedule publication'}</Button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {versions.length > 0 && <ul aria-label="Published rate card versions" className="space-y-1 text-sm">
      {versions.map(version => <li key={version.revision}>
        Revision {version.revision} · {version.effective_on} UTC · {version.status}
      </li>)}
    </ul>}
  </form>;
}

function FreightPricingPreview() {
  const [draft, setDraft] = useState<FreightPricingDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [quote, setQuote] = useState<{
    lines: { product_key: string; subtotal_tzs: number; discount_tzs: number; total_tzs: number }[];
    total_tzs: number;
  } | null>(null);
  const format = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
  const draftPath = '/v1/superadmin/commercial-products/freight-forwarder/draft';

  async function loadDraft() {
    setLoadingDraft(true);
    setDraft(null);
    setError('');
    setNotice('');
    setQuote(null);
    try {
      setDraft(await apiFetch<FreightPricingDraft>(draftPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the saved draft.');
    } finally {
      setLoadingDraft(false);
    }
  }

  useEffect(() => { void loadDraft(); }, []);

  return (
    <SectionCard title="Freight Forwarder Pricing Preview">
      {loadingDraft && <p className="p-4 text-sm">Loading pricing draft…</p>}
      {!loadingDraft && !draft && <div className="space-y-2 p-4">
        <p role="alert">{error}</p>
        <Button type="button" variant="outline" onClick={loadDraft}>Retry loading draft</Button>
      </div>}
      {draft && <form className="space-y-4 p-4" onChange={() => { setQuote(null); setError(''); setNotice(''); }} onSubmit={async event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const save = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'save';
        const discount_percent = Number(fields.get('discount'));
        const products = Object.fromEntries(FREIGHT_PREVIEW_PRODUCTS.map(({ key }) => [key, {
          quantity: Number(fields.get(`${key}-quantity`)),
          unit_price_tzs: Number(fields.get(`${key}-rate`)),
        }]));
        setPending(true);
        setError('');
        setQuote(null);
        setNotice('');
        try {
          if (save) {
            const rates = Object.fromEntries(Object.entries(products).map(([key, line]) => [key, line.unit_price_tzs]));
            setDraft(await apiFetch<FreightPricingDraft>(draftPath, {
              method: 'PUT',
              body: JSON.stringify({ revision: draft.revision, configuration: { discount_percent, rates } }),
            }));
            setNotice('Pricing draft saved.');
          } else {
            setQuote(await apiFetch('/v1/superadmin/commercial-products/freight-forwarder/preview', {
              method: 'POST',
              body: JSON.stringify({ discount_percent, products }),
            }));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not calculate the preview.');
        } finally {
          setPending(false);
        }
      }}>
        <p className="text-sm">Test sample quantities and rates before proposing a bundle. Preview calculations have no billing effect.</p>
        <fieldset disabled={pending} className="space-y-3">
          {FREIGHT_PREVIEW_PRODUCTS.map(({ key, label, unit }) => (
            <fieldset key={key} className="grid gap-2 sm:grid-cols-2">
              <legend className="font-medium">{label}</legend>
              <label className="text-sm">{unit}
                <Input name={`${key}-quantity`} type="number" required min={0} max={1000000} defaultValue={0} />
              </label>
              <label className="text-sm">Unit rate (TZS)
                <Input name={`${key}-rate`} type="number" required min={0} max={1000000000} defaultValue={draft.configuration?.rates[key] ?? 0} />
              </label>
            </fieldset>
          ))}
          <label className="block max-w-48 text-sm">Bundle discount (%)
            <Input name="discount" type="number" required min={0} max={100} defaultValue={draft.configuration?.discount_percent ?? 0} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Preview quote</Button>
            <Button type="submit" value="save" variant="outline">Save draft</Button>
            <Button type="button" variant="ghost" onClick={loadDraft}>Reload saved draft</Button>
          </div>
        </fieldset>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        {quote && <div aria-live="polite" className="space-y-1 text-sm">
          {quote.lines.map(line => <p key={line.product_key}>
            {FREIGHT_PREVIEW_PRODUCTS.find(product => product.key === line.product_key)?.label}
            {' · '}{format.format(line.total_tzs)}{' · Savings '}{format.format(line.discount_tzs)}
          </p>)}
          <p className="font-semibold">Estimated total before tax {format.format(quote.total_tzs)}</p>
        </div>}
      </form>}
      {draft && draft.revision > 0 && <>
        <FreightTenantPreview key={draft.revision} revision={draft.revision} onTested={() => {
          setDraft(current => current?.revision === draft.revision ? { ...current, tested: true } : current);
        }} />
        <FreightPublish draft={draft} />
      </>}
    </SectionCard>
  );
}

export function AppStatusView() {
  const [rows, setRows] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'maintenance'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [betaOnly, setBetaOnly] = useState(false);
  const [betaSavingId, setBetaSavingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<AppStatusSort>('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('hudumika_appstatus_view_mode') as 'list' | 'grid') || 'grid');
  const [products, setProducts] = useState<CommercialProductRow[]>([]);
  const [productSavingKey, setProductSavingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'apps' | 'commercial' | 'pricing'>('apps');

  const loadData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const [statusRes, prodRes] = await Promise.all([
        apiFetch('/v1/superadmin/app-status'),
        apiFetch('/v1/superadmin/commercial-products').catch(() => ({ commercialProducts: [] })),
      ]);
      setRows(statusRes.appStatus || []);
      setProducts(prodRes.commercialProducts || []);
    } catch (err: any) {
      showAlert(`Failed to load app status: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  async function updateReadiness(productKey: string, readiness_state: ReadinessState) {
    setProductSavingKey(productKey);
    try {
      const res = await apiFetch(`/v1/superadmin/commercial-products/${productKey}`, {
        method: 'PATCH',
        body: JSON.stringify({ readiness_state }),
      });
      setProducts(prev => prev.map(p => p.product_key === productKey ? res.commercialProduct : p));
      showAlert(`Updated ${productKey} readiness to ${readiness_state.replace('_', ' ')}.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(`Failed to update ${productKey}: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setProductSavingKey(null);
    }
  }

  const handleViewChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_appstatus_view_mode', mode);
  };

  async function toggleBeta(row: AppStatusRow) {
    const nextBeta = !row.is_beta;
    setBetaSavingId(row.app_id);
    try {
      const res = await apiFetch(`/v1/superadmin/app-status/${row.app_id}/beta`, {
        method: 'PATCH',
        body: JSON.stringify({ is_beta: nextBeta }),
      });
      setRows(prev => prev.map(r => r.app_id === row.app_id ? res.appStatus : r));
    } catch (err: any) {
      showAlert(`Failed to update ${APP_LABELS[row.app_id] ?? row.app_id}: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setBetaSavingId(null);
    }
  }

  async function toggle(row: AppStatusRow) {
    const nextStatus = row.status === 'active' ? 'maintenance' : 'active';
    setSavingId(row.app_id);
    try {
      const res = await apiFetch(`/v1/superadmin/app-status/${row.app_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, message: drafts[row.app_id] ?? row.message ?? undefined }),
      });
      setRows(prev => prev.map(r => r.app_id === row.app_id ? res.appStatus : r));
    } catch (err: any) {
      showAlert(`Failed to update ${APP_LABELS[row.app_id] ?? row.app_id}: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSavingId(null);
    }
  }

  async function saveMaintenanceMessage(appId: string) {
    const current = rows.find(r => r.app_id === appId);
    if (!current) return;
    setSavingMessageId(appId);
    try {
      const res = await apiFetch(`/v1/superadmin/app-status/${appId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: current.status, message: drafts[appId] ?? current.message ?? null }),
      });
      setRows(prev => prev.map(r => r.app_id === appId ? res.appStatus : r));
      setSavedMessageId(appId);
      setTimeout(() => setSavedMessageId(id => id === appId ? null : id), 2000);
    } catch (err: any) {
      showAlert(`Failed to save notice for ${APP_LABELS[appId] ?? appId}: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSavingMessageId(null);
    }
  }

  const liveCount = rows.filter(r => r.status === 'active').length;
  const maintenanceCount = rows.filter(r => r.status === 'maintenance').length;
  const betaCount = rows.filter(r => r.is_beta).length;

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => {
      const cat = APP_CATEGORIES[r.app_id] || 'Operations';
      set.add(cat);
    });
    return Array.from(set).sort();
  }, [rows]);

  const visibleRows = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        (APP_LABELS[r.app_id] ?? r.app_id).toLowerCase().includes(q) ||
        r.app_id.toLowerCase().includes(q) ||
        (APP_CATEGORIES[r.app_id] ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(r => r.status === statusFilter);
    }
    if (betaOnly) {
      list = list.filter(r => r.is_beta);
    }
    if (categoryFilter !== 'all') {
      list = list.filter(r => (APP_CATEGORIES[r.app_id] || 'Operations') === categoryFilter);
    }
    const sorted = [...list];
    if (sortBy === 'name') {
      sorted.sort((a, b) => (APP_LABELS[a.app_id] ?? a.app_id).localeCompare(APP_LABELS[b.app_id] ?? b.app_id));
    } else if (sortBy === 'status') {
      sorted.sort((a, b) => (a.status === b.status ? 0 : a.status === 'maintenance' ? -1 : 1));
    } else {
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return sorted;
  }, [rows, search, statusFilter, betaOnly, categoryFilter, sortBy]);

  const SORT_OPTIONS: { value: AppStatusSort; label: string }[] = [
    { value: 'name',    label: 'Name A—Z' },
    { value: 'status',  label: 'Maintenance First' },
    { value: 'updated', label: 'Recently Updated' },
  ];

  const PRESET_MESSAGES = [
    'Routine maintenance in progress. Access will resume shortly.',
    'Deploying new performance updates and features.',
    'Scheduled database optimization in progress.',
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink3)' }}>
        <SectionLoading />
        <p style={{ marginTop: 12, fontSize: 13, fontWeight: 500 }}>Loading platform runtime status…</p>
      </div>
    );
  }

  return (
    <div className="as-container">
      {/* ── Executive Page Header ── */}
      <PageHdr
        title="App Status & Availability"
        sub="Runtime kill-switches, tenant announcement banners, global beta badges, and commercial product release readiness across the platform."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {maintenanceCount === 0 ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 'var(--r-sm)', background: 'var(--green-l)', border: '1px solid rgba(26, 127, 55, 0.25)', fontSize: 12.5, fontWeight: 700, color: 'var(--green)' }}>
                <span className="as-live-pulse-dot" />
                <span>All Systems Operational</span>
              </div>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 'var(--r-sm)', background: '#fee2e2', border: '1px solid rgba(220, 38, 38, 0.3)', fontSize: 12.5, fontWeight: 700, color: '#dc2626' }}>
                <span className="as-maint-pulse-dot" />
                <span>{maintenanceCount} App(s) In Maintenance</span>
              </div>
            )}

            <Tip label="Refresh runtime data" side="bottom">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={() => void loadData(true)}
              >
                <Icon name="refresh" size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </Button>
            </Tip>
          </div>
        }
      />

      {/* ── 5 Key Executive KPI Summary Tiles ── */}
      <div className="as-kpi-grid">
        <div className="as-kpi-card as-kpi-card--blue">
          <div className="as-kpi-icon-wrap"><Icon name="layers" size={18} /></div>
          <div className="as-kpi-info">
            <span className="as-kpi-num">{rows.length}</span>
            <span className="as-kpi-label">Platform Apps</span>
            <span className="as-kpi-sub">Total Registered Modules</span>
          </div>
        </div>

        <div className="as-kpi-card as-kpi-card--green">
          <div className="as-kpi-icon-wrap"><Icon name="checkCircle" size={18} /></div>
          <div className="as-kpi-info">
            <div className="as-kpi-val-row">
              <span className="as-kpi-num text-emerald-600">{liveCount}</span>
              <span className="as-live-pulse-dot" />
            </div>
            <span className="as-kpi-label">Active &amp; Live</span>
            <span className="as-kpi-sub">Tenant Accessible</span>
          </div>
        </div>

        <div className={`as-kpi-card ${maintenanceCount > 0 ? 'as-kpi-card--amber' : 'as-kpi-card--gray'}`}>
          <div className="as-kpi-icon-wrap"><Icon name="alertTriangle" size={18} /></div>
          <div className="as-kpi-info">
            <span className={`as-kpi-num ${maintenanceCount > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{maintenanceCount}</span>
            <span className="as-kpi-label">In Maintenance</span>
            <span className="as-kpi-sub">{maintenanceCount > 0 ? 'All Tenants Blocked' : 'Zero Active Outages'}</span>
          </div>
        </div>

        <div className="as-kpi-card as-kpi-card--gold">
          <div className="as-kpi-icon-wrap"><Icon name="sparkle" size={18} /></div>
          <div className="as-kpi-info">
            <span className="as-kpi-num text-amber-500">{betaCount}</span>
            <span className="as-kpi-label">Beta Programs</span>
            <span className="as-kpi-sub">Global Pill Enabled</span>
          </div>
        </div>

        <div className="as-kpi-card as-kpi-card--teal">
          <div className="as-kpi-icon-wrap"><Icon name="package" size={18} /></div>
          <div className="as-kpi-info">
            <span className="as-kpi-num text-teal-600">{products.length}</span>
            <span className="as-kpi-label">Commercial SKUs</span>
            <span className="as-kpi-sub">GTM Lifecycle Tracked</span>
          </div>
        </div>
      </div>

      {/* ── Section Navigation Tabs ── */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} variant="segmented" className="as-section-tabs">
        <TabsList aria-label="App Status Sections">
          <TabsTrigger value="apps" className="gap-2">
            <Icon name="grid" size={14} />
            <span>Platform Apps</span>
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 700 }}>
              {rows.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="commercial" className="gap-2">
            <Icon name="package" size={14} />
            <span>Commercial Readiness</span>
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 700 }}>
              {products.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-2">
            <Icon name="dollarSign" size={14} />
            <span>Freight Pricing Simulator</span>
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: PLATFORM APPS ── */}
        <TabsContent value="apps" style={{ marginTop: 16 }}>
          {/* Controls & Filter Toolbar */}
          <div className="sa-app-status-toolbar">
            {/* Search Box */}
            <div className="sa-app-status-search">
              <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
              <input data-ui-field="input"
                className="input-field"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by app name, key, or category…"
                style={{ width:'100%', boxSizing:'border-box', paddingLeft: 34, paddingRight: search ? 30 : 12, height:"var(--ctl-h)" }}
              />
              {search && (
                <button data-ui-native-button=""
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: "var(--action-py) var(--space-md)" }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Status Filter Pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              <Button
                type="button"
                variant={statusFilter === 'all' && !betaOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setStatusFilter('all'); setBetaOnly(false); }}
                style={{ height: "var(--ctl-h)" }}
              >
                All ({rows.length})
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setStatusFilter('active'); setBetaOnly(false); }}
                style={{ height: "var(--ctl-h)", color: statusFilter === 'active' ? '#fff' : 'var(--green)' }}
              >
                <span className="as-live-pulse-dot" style={{ marginRight: 6 }} />
                Live ({liveCount})
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'maintenance' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setStatusFilter('maintenance'); setBetaOnly(false); }}
                style={{ height: "var(--ctl-h)", color: statusFilter === 'maintenance' ? '#fff' : '#dc2626' }}
              >
                <Icon name="alertTriangle" size={13} style={{ marginRight: 6 }} />
                Maintenance ({maintenanceCount})
              </Button>
              <Button
                type="button"
                variant={betaOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBetaOnly(v => !v)}
                style={{ height: "var(--ctl-h)", color: betaOnly ? '#fff' : 'var(--gold)' }}
              >
                <Icon name="sparkle" size={13} style={{ marginRight: 6 }} />
                Beta Only ({betaCount})
              </Button>
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-auto shrink-0" style={{ width: 'auto', minWidth: 145, height: "var(--ctl-h)" }}>
                <Icon name="folder" size={13} color="var(--ink3)" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort Select */}
            <Select value={sortBy} onValueChange={v => setSortBy(v as AppStatusSort)}>
              <SelectTrigger className="w-auto shrink-0" style={{ width:'auto', minWidth:140, height:"var(--ctl-h)", flexShrink:0 }}>
                <Icon name="sliders" size={13} color="var(--ink3)" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* List vs Grid Switcher */}
            <div className="sa-app-status-view-toggle">
              <Tip label="Grid Card View" side="bottom">
                <button data-ui-native-button=""
                  type="button"
                  onClick={() => handleViewChange('grid')}
                  className={`sa-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  aria-label="Grid view"
                >
                  <Icon name="grid" size={14} />
                </button>
              </Tip>
              <Tip label="Compact List View" side="bottom">
                <button data-ui-native-button=""
                  type="button"
                  onClick={() => handleViewChange('list')}
                  className={`sa-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  aria-label="List view"
                >
                  <Icon name="list" size={14} />
                </button>
              </Tip>
            </div>
          </div>

          {/* Active Filter Indicators */}
          {(search || statusFilter !== 'all' || betaOnly || categoryFilter !== 'all') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: 'var(--ink3)' }}>
              <span>Filtering {visibleRows.length} of {rows.length} apps</span>
              <button data-ui-native-button=""
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all'); setBetaOnly(false); setCategoryFilter('all'); }}
                style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Reset filters
              </button>
            </div>
          )}

          {/* Apps Body: Empty State / Grid / List */}
          {visibleRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '54px 0', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--ink3)' }}>
              <Icon name="search" size={28} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No applications match your filter</div>
              <p style={{ fontSize: 13, marginTop: 4 }}>Try clearing the search query or adjusting your category/status filters.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setStatusFilter('all'); setBetaOnly(false); setCategoryFilter('all'); }}
                style={{ marginTop: 14 }}
              >
                Clear all filters
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="as-app-grid">
              {visibleRows.map(row => {
                const inMaintenance = row.status === 'maintenance';
                const label = APP_LABELS[row.app_id] ?? row.app_id;
                const brandColor = APP_BRAND_COLORS[row.app_id] || '#0d9488';
                const category = APP_CATEGORIES[row.app_id] || 'Operations';
                const busy = savingId === row.app_id;
                const betaBusy = betaSavingId === row.app_id;
                const msgBusy = savingMessageId === row.app_id;
                const msgSaved = savedMessageId === row.app_id;
                const currentDraft = drafts[row.app_id] ?? row.message ?? '';

                return (
                  <div
                    key={row.app_id}
                    className={`as-app-card${inMaintenance ? ' as-app-card--maintenance' : ''}`}
                    style={{ opacity: busy ? 0.7 : 1 }}
                  >
                    {/* Header: App Identity & Category */}
                    <div className="as-app-card-hdr">
                      <div className="as-app-identity">
                        <div className="as-app-icon-squircle" style={{ background: brandColor }}>
                          <Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={20} color="#fff" />
                        </div>
                        <div className="as-app-titles">
                          <div className="as-app-name-row">
                            <span className="as-app-name">{label}</span>
                            <span className="as-app-key-badge">{row.app_id}</span>
                          </div>
                          <span className="as-app-cat-badge">{category}</span>
                        </div>
                      </div>

                      {/* Operational Status Dot */}
                      <Tip label={inMaintenance ? 'Application is in maintenance (Blocked)' : 'Application is live and operational'} side="bottom">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={inMaintenance ? 'as-maint-pulse-dot' : 'as-live-pulse-dot'} />
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: inMaintenance ? '#dc2626' : 'var(--green)' }}>
                            {inMaintenance ? 'Offline' : 'Online'}
                          </span>
                        </div>
                      </Tip>
                    </div>

                    {/* Controls Row: Live Switch & Beta Toggle */}
                    <div className="as-app-controls-row">
                      {/* Operational Switch */}
                      <div className="as-switch-unit">
                        <Switch
                          size="lg"
                          showCheckIcon
                          checked={!inMaintenance}
                          disabled={busy}
                          onCheckedChange={() => toggle(row)}
                          title={`Toggle ${label} operational status`}
                        />
                        <span className="as-switch-label" style={{ color: inMaintenance ? 'var(--ink3)' : 'var(--ink)' }}>
                          {inMaintenance ? 'Maintenance' : 'Live'}
                        </span>
                      </div>

                      {/* Beta Program Toggle */}
                      <Tip label="Show this app's Beta pill to every tenant across the platform" side="bottom">
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: betaBusy ? 'default' : 'pointer',
                            opacity: betaBusy ? 0.6 : 1,
                            padding: '3px 8px',
                            borderRadius: 'var(--r-sm)',
                            background: row.is_beta ? 'var(--gold-l)' : 'transparent',
                            border: `1px solid ${row.is_beta ? 'var(--gold)' : 'var(--border)'}`,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: row.is_beta ? 'var(--gold)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            ★ Beta
                          </span>
                          <Switch checked={row.is_beta} disabled={betaBusy} onCheckedChange={() => toggleBeta(row)} />
                        </label>
                      </Tip>
                    </div>

                    {/* Tenant Status Notification Box */}
                    {inMaintenance ? (
                      <div className="as-status-box as-status-box--maint">
                        <div className="as-maint-banner-hdr">
                          <Icon name="alertTriangle" size={14} color="#dc2626" />
                          <span>Tenant Access Blocked</span>
                        </div>
                        <p style={{ fontSize: 11.5, color: 'var(--ink2)', margin: 0 }}>
                          Tenants attempting to launch or visit this app will see the maintenance announcement below:
                        </p>
                        <div className="as-maint-input-wrap">
                          <Input
                            placeholder="Reason shown to tenants (e.g. Upgrading database…)"
                            value={currentDraft}
                            onChange={e => setDrafts(prev => ({ ...prev, [row.app_id]: e.target.value }))}
                            style={{ height: "var(--ctl-h)", fontSize: "var(--text-base)" }}
                          />
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            disabled={msgBusy || (currentDraft === (row.message ?? ''))}
                            onClick={() => saveMaintenanceMessage(row.app_id)}
                            style={{ height: "var(--ctl-h)", flexShrink: 0 }}
                          >
                            <Icon name={msgSaved ? 'check' : 'save'} size={12} />
                            <span>{msgSaved ? 'Saved' : msgBusy ? 'Saving…' : 'Save'}</span>
                          </Button>
                        </div>
                        {/* Quick Presets */}
                        <div className="as-preset-chips">
                          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Quick presets:</span>
                          {PRESET_MESSAGES.map((msg, idx) => (
                            <button data-ui-native-button=""
                              key={idx}
                              type="button"
                              className="as-preset-btn"
                              onClick={() => {
                                setDrafts(prev => ({ ...prev, [row.app_id]: msg }));
                              }}
                            >
                              Preset {idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="as-status-box as-status-box--live">
                        <Icon name="checkCircle" size={14} color="var(--green)" />
                        <span>Accessible to tenants according to active subscription plan.</span>
                      </div>
                    )}

                    {/* Card Footer: Metadata & Last Updated */}
                    <div className="as-app-card-footer">
                      <span>Updated {timeAgo(row.updated_at)}</span>
                      {row.is_beta && <span style={{ color: 'var(--gold)', fontWeight: 600 }}>Beta Flagged</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <SectionCard padded={false}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Application</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Operational Status</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Beta Program</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Tenant Notice / Access</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(row => {
                      const inMaintenance = row.status === 'maintenance';
                      const label = APP_LABELS[row.app_id] ?? row.app_id;
                      const brandColor = APP_BRAND_COLORS[row.app_id] || '#0d9488';
                      const category = APP_CATEGORIES[row.app_id] || 'Operations';
                      const busy = savingId === row.app_id;
                      const betaBusy = betaSavingId === row.app_id;

                      return (
                        <tr key={row.app_id} style={{ borderBottom: '1px solid var(--border)', background: inMaintenance ? 'rgba(254, 243, 199, 0.08)' : undefined }}>
                          {/* App Identity */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: brandColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                <Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={16} color="#fff" />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <strong style={{ color: 'var(--ink)' }}>{label}</strong>
                                  <span className="as-app-key-badge">{row.app_id}</span>
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{category}</span>
                              </div>
                            </div>
                          </td>

                          {/* Operational Status */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Switch
                                checked={!inMaintenance}
                                disabled={busy}
                                onCheckedChange={() => toggle(row)}
                              />
                              <span style={{ fontSize: 12, fontWeight: 700, color: inMaintenance ? '#dc2626' : 'var(--green)' }}>
                                {inMaintenance ? 'Maintenance' : 'Live'}
                              </span>
                            </div>
                          </td>

                          {/* Beta Status */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Switch
                                size="sm"
                                checked={row.is_beta}
                                disabled={betaBusy}
                                onCheckedChange={() => toggleBeta(row)}
                              />
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: row.is_beta ? 'var(--gold)' : 'var(--ink3)' }}>
                                {row.is_beta ? '★ Beta' : 'Standard'}
                              </span>
                            </div>
                          </td>

                          {/* Tenant Notice / Access */}
                          <td style={{ padding: '12px 16px', maxWidth: 380 }}>
                            {inMaintenance ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>Notice:</span>
                                <span style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.message || 'Standard maintenance notice'}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Accessible to subscribed tenants</span>
                            )}
                          </td>

                          {/* Last Updated */}
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11.5, color: 'var(--ink3)' }}>
                            {timeAgo(row.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </TabsContent>

        {/* ── TAB 2: COMMERCIAL PRODUCT READINESS ── */}
        <TabsContent value="commercial" style={{ marginTop: 16 }}>
          <SectionCard title="Commercial Product Lifecycle &amp; GTM Readiness">
            <div style={{ padding: '12px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
              Defines where each independently-subscribable commercial product sits in the lifecycle:
              <strong> Internal &rarr; Pilot &rarr; Sellable &rarr; Limited GA &rarr; General Availability</strong>.
              This governs packaging recommendations and storefront visibility without modifying tenant database entitlements directly.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {products.map(p => {
                const readinessOpt = READINESS_OPTIONS.find(o => o.value === p.readiness_state) || READINESS_OPTIONS[0];
                const isSaving = productSavingKey === p.product_key;

                return (
                  <div
                    key={p.product_key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--border)',
                      opacity: isSaving ? 0.6 : 1,
                      background: 'var(--white)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: APP_BRAND_COLORS[p.product_key] || 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                          <Icon name="package" size={18} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</span>
                            <span className="as-app-key-badge">{p.product_key}</span>
                            {p.standalone_purchasable && (
                              <UiBadge variant="brand">Standalone Purchasable</UiBadge>
                            )}
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                            Commercial SKU &bull; Platform Subscribable
                          </span>
                        </div>
                      </div>

                      {/* State Dropdown Selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Readiness Status:</span>
                        <Select
                          value={p.readiness_state}
                          onValueChange={v => updateReadiness(p.product_key, v as ReadinessState)}
                        >
                          <SelectTrigger className="w-auto shrink-0" style={{ width: 'auto', minWidth: 190, height: "var(--ctl-h)" }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {READINESS_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Visual 5-Stage Stepper Breadcrumb */}
                    <div className="as-readiness-pipeline">
                      {[
                        { key: 'internal', label: '1. Internal' },
                        { key: 'pilot', label: '2. Pilot' },
                        { key: 'sellable', label: '3. Sellable' },
                        { key: 'limited_availability', label: '4. Limited GA' },
                        { key: 'general_availability', label: '5. General Availability' },
                      ].map((step, idx) => {
                        const stageOrder = ['internal', 'pilot', 'sellable', 'limited_availability', 'general_availability'];
                        const currentIdx = stageOrder.indexOf(p.readiness_state);
                        const stepIdx = stageOrder.indexOf(step.key);
                        const isCurrent = p.readiness_state === step.key;
                        const isPast = currentIdx > stepIdx;

                        return (
                          <div
                            key={step.key}
                            className={`as-pipeline-step${isCurrent ? ' active' : isPast ? ' completed' : ''}`}
                          >
                            {isPast && <Icon name="check" size={10} />}
                            {isCurrent && <span className="as-live-pulse-dot" style={{ width: 6, height: 6 }} />}
                            <span>{step.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── TAB 3: FREIGHT PRICING SIMULATOR ── */}
        <TabsContent value="pricing" style={{ marginTop: 16 }}>
          <FreightPricingPreview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DEVICES — cross-tenant Device Management oversight
   (379_attendance_devices.sql). Read-only: "monitor,
   troubleshoot, audit", same stance this console already
   takes toward tenant attendance/leave data — never a
   write action on another tenant's device from here.
══════════════════════════════════════════════════ */

