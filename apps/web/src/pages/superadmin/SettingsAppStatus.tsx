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
      .catch(() => {
        setLoading(false);
      });
    apiFetch('/v1/superadmin/jobs').then(setJobs).catch(() => {});
    apiFetch('/v1/superadmin/server-info').then(setServerInfo).catch(() => {});
  }, []);

  async function save(section: string) {
    if (!settingsLoaded) { showAlert('Settings did not load, so saving is disabled to protect what is stored. Reload the page and try again.'); return; }
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
            <input title="Min password length" type="number" min={6} max={32} value={security.minPasswordLength}
              onChange={e => setSecurity(p=>({...p,minPasswordLength:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Session Timeout" hint="Hours before an idle session is automatically signed out">
            <input title="Session timeout hours" type="number" min={1} max={168} value={security.sessionTimeoutHours}
              onChange={e => setSecurity(p=>({...p,sessionTimeoutHours:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Max Login Attempts" hint="Failed attempts before account lockout is triggered">
            <input title="Max login attempts" type="number" min={3} max={20} value={security.maxLoginAttempts}
              onChange={e => setSecurity(p=>({...p,maxLoginAttempts:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Lockout Duration (minutes)" hint="How long an account stays locked after max attempts">
            <input title="Lockout duration" type="number" min={5} max={1440} value={security.lockoutMinutes}
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
            <input title="IP allowlist" placeholder="e.g. 196.0.0.0/8, 10.0.0.1" value={security.ipAllowlist}
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
            <input title="SMTP Host" placeholder="smtp.mailgun.org" value={smtp.host}
              onChange={e => setSmtp(p=>({...p,host:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Port">
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <input title="SMTP Port" placeholder="587" value={smtp.port}
                onChange={e => setSmtp(p=>({...p,port:e.target.value}))} className="input-field" style={{ flex:1 }} />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink2)', whiteSpace:'nowrap', cursor:'pointer' }}>
                <Switch checked={smtp.tls} onCheckedChange={v => setSmtp(p=>({...p,tls:v}))} aria-label="TLS" />
                TLS
              </label>
            </div>
          </Field>
          <Field label="Username">
            <input title="SMTP Username" placeholder="no-reply@clearos.io" value={smtp.user}
              onChange={e => setSmtp(p=>({...p,user:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Password">
            <input title="SMTP Password" type="password" placeholder="••••••••" value={smtp.pass}
              onChange={e => setSmtp(p=>({...p,pass:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="From Address" hint="Displayed as the sender name in all platform emails">
            <input title="From address" placeholder="Hudumika <no-reply@clearos.io>" value={smtp.from}
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
                    <input title={`${name} API key`} type="password" placeholder="Paste API key" autoComplete="off" value={row.apiKey}
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
            <input title="Gemini API Key" type="password" placeholder="AIza••••••••••••••••" value={ocr.geminiApiKey}
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
                  style={{ fontFamily: 'var(--font)', fontSize: 12 }}
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
                  style={{ fontFamily: 'var(--font)', fontSize: 12 }}
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
                  style={{ fontFamily: 'var(--font)', fontSize: 12 }}
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
              <input
                title="CarImages API Key"
                type="text"
                value={carimages.apiKey}
                onChange={e => setCarimages(p => ({ ...p, apiKey: e.target.value }))}
                className="input-field"
                style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
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
              <input
                type="text"
                value={sampleMake}
                onChange={e => setSampleMake(e.target.value)}
                placeholder="e.g. BMW, Toyota, Scania"
                className="input-field"
                style={{ width: '100%', fontSize: 12 }}
              />
            </Field>

            <Field label="Model">
              <input
                type="text"
                value={sampleModel}
                onChange={e => setSampleModel(e.target.value)}
                placeholder="e.g. 3 Series, X5, Hilux"
                className="input-field"
                style={{ width: '100%', fontSize: 12 }}
              />
            </Field>

            <Field label="Year">
              <input
                type="text"
                value={sampleYear}
                onChange={e => setSampleYear(e.target.value)}
                placeholder="2022"
                className="input-field"
                style={{ width: '100%', fontSize: 12 }}
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
                <select
                  value={sampleView}
                  onChange={e => setSampleView(e.target.value as any)}
                  className="input-field"
                  style={{ width: '100%', fontSize: 12 }}
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
                <select
                  value={sampleBackdrop}
                  onChange={e => setSampleBackdrop(e.target.value as any)}
                  className="input-field"
                  style={{ width: '100%', fontSize: 12 }}
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
            <input
              title="Mapbox Access Token"
              type="text"
              placeholder="pk.eyJ1IjoiaHVkdW1pa2EiLCJhIjoi..."
              value={mapbox.accessToken}
              onChange={e => setMapbox(p => ({ ...p, accessToken: e.target.value }))}
              className="input-field"
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
            />
          </Field>

          <Field label="Default Map Style" hint="Basemap style preset for tracking and vehicle routes">
            <select
              value={mapbox.defaultStyle}
              onChange={e => setMapbox(p => ({ ...p, defaultStyle: e.target.value }))}
              className="input-field"
              style={{ width: '100%', fontSize: 12 }}
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
            <input title="Rate limit" type="number" min={10} max={10000} value={api.rateLimit}
              onChange={e => setApi(p=>({...p,rateLimit:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="API Key Rotation" hint="Days before API keys are flagged for rotation">
            <input title="Key rotation days" type="number" min={30} max={365} value={api.keyRotationDays}
              onChange={e => setApi(p=>({...p,keyRotationDays:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="CORS Allowed Origins" hint="Comma-separated extra origins, layered on top of the server's own configured origin — this can only add access, never remove the app's own.">
            <input title="CORS origins" placeholder="https://app.yourcompany.com" value={api.corsOrigins}
              onChange={e => setApi(p=>({...p,corsOrigins:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Webhook Signing Secret" hint="Not yet used to sign anything — saved for a future outbound webhook feature">
            <div style={{ display:'flex', gap:8 }}>
              <input title="Webhook secret" type={showWebhookSecret ? 'text' : 'password'} value={api.webhookSecret}
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

type AppStatusSort = 'name' | 'status' | 'updated';

export function AppStatusView() {
  const [rows, setRows] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [betaOnly, setBetaOnly] = useState(false);
  const [betaSavingId, setBetaSavingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<AppStatusSort>('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('hudumika_appstatus_view_mode') as 'list' | 'grid') || 'list');

  const handleViewChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_appstatus_view_mode', mode);
  };

  useEffect(() => {
    apiFetch('/v1/superadmin/app-status')
      .then(res => setRows(res.appStatus || []))
      .finally(() => setLoading(false));
  }, []);

  const visibleRows = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => (APP_LABELS[r.app_id] ?? r.app_id).toLowerCase().includes(q) || r.app_id.toLowerCase().includes(q));
    }
    if (statusFilter) list = list.filter(r => r.status === statusFilter);
    if (betaOnly) list = list.filter(r => r.is_beta);
    const sorted = [...list];
    if (sortBy === 'name') {
      sorted.sort((a, b) => (APP_LABELS[a.app_id] ?? a.app_id).localeCompare(APP_LABELS[b.app_id] ?? b.app_id));
    } else if (sortBy === 'status') {
      sorted.sort((a, b) => (a.status === b.status ? 0 : a.status === 'maintenance' ? -1 : 1));
    } else {
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return sorted;
  }, [rows, search, statusFilter, betaOnly, sortBy]);

  /**
   * Platform-wide "Beta" label (migration 395) — independent of the
   * maintenance status toggle() below. Every tenant's GET /v1/entitlements
   * reports the same betaApps list, which is what Settings.tsx's Modules &
   * Extensions grid renders the pill from, so this is the one place that
   * decides it for the whole platform.
   */
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

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading app status…</div>;

  const liveCount = rows.filter(r => r.status === 'active').length;
  const betaCount = rows.filter(r => r.is_beta).length;
  const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'name',    label: 'Name A—Z' },
    { value: 'status',  label: 'Maintenance first' },
    { value: 'updated', label: 'Recently updated' },
  ];

  return (
    <div>
      <PageHdr
        title="App Status"
        sub="Per-app maintenance switch and Beta label — take a single app down for a deploy, or flag it Beta, without affecting the rest of the platform. Both are seen identically by every tenant."
        action={
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Badge cfg={{ label: `${betaCount} Beta`, color:'var(--gold)', bg:'var(--gold-l)' }} />
            <Badge cfg={liveCount === rows.length
              ? { label: `${liveCount} of ${rows.length} apps live`, color:'var(--green)', bg:'var(--green-l)' }
              : { label: `${liveCount} of ${rows.length} apps live`, color:'var(--gold)', bg:'var(--gold-l)' }} />
          </div>
        }
      />

      {/* Toolbar: single-row search + status filter + beta filter + sort + view toggle */}
      <div className="sa-app-status-toolbar">
        <div className="sa-app-status-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
          <input
            className="input-field"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search apps…"
            style={{ width:'100%', boxSizing:'border-box', paddingLeft:34, height:36 }}
          />
        </div>
        <SingleSelectFilter
          label="Status"
          icon={<Icon name="filter" size={13} />}
          options={[{ value:'active', label:'Live' }, { value:'maintenance', label:'Maintenance' }]}
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All statuses"
        />
        <button
          type="button"
          onClick={() => setBetaOnly(v => !v)}
          title="Show only apps flagged Beta"
          style={{
            display:'flex', alignItems:'center', gap:6, height:36, padding:'0 12px', borderRadius:'var(--r)',
            border: `1px solid ${betaOnly ? 'var(--gold)' : 'var(--border)'}`,
            background: betaOnly ? 'var(--gold-l)' : 'var(--white)',
            color: betaOnly ? 'var(--gold)' : 'var(--ink2)',
            fontSize:13, fontWeight:600, fontFamily:'var(--font)', cursor:'pointer', flexShrink:0,
          }}
         data-ui-native-button="">
          <Icon name="sparkle" size={13} />
          Beta only
        </button>
        <Select value={sortBy} onValueChange={v => setSortBy(v as AppStatusSort)}>
          <SelectTrigger className="w-auto shrink-0" style={{ width:'auto', minWidth:140, height:36, flexShrink:0 }}>
            <Icon name="sliders" size={13} color="var(--ink3)" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="sa-app-status-view-toggle">
          <button
            type="button"
            title="List view"
            onClick={() => handleViewChange('list')}
            className={`sa-view-btn ${viewMode === 'list' ? 'active' : ''}`}
           data-ui-native-button="">
            <Icon name="list" size={14} />
          </button>
          <button
            type="button"
            title="Grid view"
            onClick={() => handleViewChange('grid')}
            className={`sa-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
           data-ui-native-button="">
            <Icon name="grid" size={14} />
          </button>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>No apps match your search.</div>
      ) : viewMode === 'list' ? (
        <SectionCard padded={false}>
          {visibleRows.map(row => {
            const inMaintenance = row.status === 'maintenance';
            const label = APP_LABELS[row.app_id] ?? row.app_id;
            const busy = savingId === row.app_id;
            const betaBusy = betaSavingId === row.app_id;
            return (
              <div key={row.app_id} style={{ padding: '0 18px', opacity: busy ? 0.6 : 1 }}>
                <FeatureToggleRow
                  icon={<Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={18} />}
                  title={label}
                  description={inMaintenance ? 'All tenants are blocked from this app.' : "Accessible per each tenant's plan."}
                  checked={!inMaintenance}
                  onCheckedChange={() => toggle(row)}
                  disabled={busy}
                  trailingExtra={
                    <label
                      title="Show this app's Beta pill to every tenant"
                      style={{ display:'flex', alignItems:'center', gap:6, cursor: betaBusy ? 'default' : 'pointer', opacity: betaBusy ? 0.6 : 1, paddingRight:10, borderRight:'1px solid var(--border)' }}
                    >
                      <span style={{ fontSize:11, fontWeight:700, color: row.is_beta ? 'var(--gold)' : 'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Beta</span>
                      <Switch checked={row.is_beta} disabled={betaBusy} onCheckedChange={() => toggleBeta(row)} />
                    </label>
                  }
                  action={inMaintenance && (
                    <input
                      title="Maintenance message shown to tenants"
                      placeholder="Optional message shown to tenants while in maintenance…"
                      value={drafts[row.app_id] ?? row.message ?? ''}
                      onChange={e => setDrafts(prev => ({ ...prev, [row.app_id]: e.target.value }))}
                      className="input-field"
                      style={{ width:'100%', maxWidth: 420, boxSizing:'border-box', fontSize:12 }}
                    />
                  )}
                />
              </div>
            );
          })}
        </SectionCard>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
          {visibleRows.map(row => {
            const inMaintenance = row.status === 'maintenance';
            const label = APP_LABELS[row.app_id] ?? row.app_id;
            const busy = savingId === row.app_id;
            const betaBusy = betaSavingId === row.app_id;
            const muted = busy || inMaintenance;
            return (
              <div
                key={row.app_id}
                style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16, display:'flex', flexDirection:'column', gap:10, opacity: busy ? 0.6 : 1 }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                    <FeaturedIcon variant={muted ? 'gray' : 'brand'} shape="circle" size="md">
                      <Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={18} />
                    </FeaturedIcon>
                    <div style={{ minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:14, fontWeight:700, color: muted ? 'var(--ink3)' : 'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
                        {row.is_beta && (
                          <span style={{ fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius: 'var(--r-sm)', background:'var(--gold-l)', color:'var(--gold)', border:'1px solid var(--gold)', textTransform:'uppercase', letterSpacing:'0.4px', flexShrink:0 }}>
                            Beta
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:11, fontWeight:600, color: inMaintenance ? 'var(--ink3)' : 'var(--teal)' }}>{inMaintenance ? 'Off' : 'On'}</span>
                    <Switch size="lg" showCheckIcon checked={!inMaintenance} disabled={busy} title={`Toggle ${label}`} onCheckedChange={() => toggle(row)} />
                  </div>
                </div>
                <div style={{ fontSize:12, color:'var(--ink3)', opacity: muted ? 0.7 : 1 }}>
                  {inMaintenance ? 'All tenants are blocked from this app.' : "Accessible per each tenant's plan."}
                </div>
                <label
                  title="Show this app's Beta pill to every tenant"
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, paddingTop:10, borderTop:'1px solid var(--border)', cursor: betaBusy ? 'default' : 'pointer', opacity: betaBusy ? 0.6 : 1 }}
                >
                  <span style={{ fontSize:12, fontWeight:600, color: 'var(--ink2)' }}>Beta label</span>
                  <Switch checked={row.is_beta} disabled={betaBusy} onCheckedChange={() => toggleBeta(row)} />
                </label>
                {inMaintenance && (
                  <input
                    title="Maintenance message shown to tenants"
                    placeholder="Optional message shown to tenants while in maintenance…"
                    value={drafts[row.app_id] ?? row.message ?? ''}
                    onChange={e => setDrafts(prev => ({ ...prev, [row.app_id]: e.target.value }))}
                    className="input-field"
                    style={{ width:'100%', boxSizing:'border-box', fontSize:12 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
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

