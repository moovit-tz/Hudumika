import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ColorSwatchPicker, PLATFORM_SWATCHES } from '@/components/ui/color-swatch-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type TableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { LauncherAppSvg } from '../../components/LauncherApps.js';
import { useAuth } from '../../hooks/useAuth.js';
import { pushBranding, pushTenantBranding, useBranding } from '../../hooks/useBranding.js';
import { useDesignSystem } from '../../hooks/useDesignSystem.js';
import { BASE_URL } from '../../lib/api.js';
import {
  CONFIGURABLE_APP_REGISTRY,
  resolveAppColorDetails,
  type ConfigurableAppMeta,
} from '../../lib/appRegistry.js';
import { contrastRatio, enforceContrastFloor, lightenHex } from '../../lib/color.js';
import { PreviewStage } from './PreviewStage.js';
import { BrandingIdentitySection, BrandingLoginSection } from '../BrandingView.js';
import {
  DesignSystemStudioBar,
  ThemePresetsAndEngineSection,
  useDesignStudioController,
} from './helpers.js';
import './DesignSystemApp.css';

interface ConfigHistoryEntry {
  id: string;
  at: string;
  actor: string;
  scope: 'platform' | 'workspace' | 'reset';
  appId: string;
  appName: string;
  color: string;
}

const HISTORY_STORAGE_KEY = 'hudumika_ds_config_history';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected icon file.'));
    reader.readAsDataURL(file);
  });
}

function readHistory(): ConfigHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface PreviewInvoiceRow {
  id: string;
  ref: string;
  party: string;
  amount: string;
}

const PREVIEW_TABLE_ROWS: PreviewInvoiceRow[] = [
  { id: 'r1', ref: 'DOC-1041', party: 'Tanga Terminal Authority', amount: 'TZS 2,400,000' },
  { id: 'r2', ref: 'DOC-1042', party: 'Mombasa Corridor Freight', amount: 'TZS 980,000' },
];

export function AppConfiguratorPage() {
  const { appId: paramAppId } = useParams<{ appId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const branding = useBranding();
  const { designSystemVersion } = useDesignSystem();
  const studio = useDesignStudioController();

  const rawTab = searchParams.get('tab');
  const activeTab: 'per-app' | 'themes' | 'identity' | 'login' =
    rawTab === 'themes' || rawTab === 'identity' || rawTab === 'login' ? rawTab : 'per-app';

  function setActiveTab(nextTab: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (nextTab === 'per-app') next.delete('tab');
      else next.set('tab', nextTab);
      return next;
    });
  }

  const [search, setSearch] = useState('');
  const [resolutionTick, setResolutionTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedMeta: ConfigurableAppMeta =
    CONFIGURABLE_APP_REGISTRY.find(a => a.id === paramAppId) ??
    CONFIGURABLE_APP_REGISTRY.find(a => a.id === 'finops') ??
    CONFIGURABLE_APP_REGISTRY[0]!;

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isWorkspaceAdmin = isSuperAdmin || ['ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');

  // Effective live persisted values + inheritance waterfall
  const resolution = useMemo(() => {
    void resolutionTick;
    return resolveAppColorDetails(selectedMeta.id);
  }, [selectedMeta.id, resolutionTick]);

  const effectiveName = branding.getAppName(selectedMeta.id, selectedMeta.name);
  const effectiveSlogan = branding.getAppSlogan(selectedMeta.id, selectedMeta.slogan);
  const existingLogoTs = typeof localStorage !== 'undefined' ? localStorage.getItem(`hudumika_app_logo_ts_${selectedMeta.id}`) : null;
  const effectiveLogo = existingLogoTs ? `${BASE_URL}/v1/platform/branding/app-icon/${selectedMeta.id}?t=${existingLogoTs}` : '';

  // Strictly isolated draft state — editing these fields never touches localStorage or document root.
  const [draftName, setDraftName] = useState(effectiveName);
  const [draftSlogan, setDraftSlogan] = useState(effectiveSlogan);
  const [draftColor, setDraftColor] = useState(resolution.effective);
  const [draftLogo, setDraftLogo] = useState(effectiveLogo);
  const [publishing, setPublishing] = useState<'platform' | 'workspace' | 'reset' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<ConfigHistoryEntry[]>(readHistory);
  const [previewSelectedRows, setPreviewSelectedRows] = useState<Set<string>>(() => new Set(['r1']));
  const [previewSwitch, setPreviewSwitch] = useState(true);

  useEffect(() => {
    setDraftName(branding.getAppName(selectedMeta.id, selectedMeta.name));
    setDraftSlogan(branding.getAppSlogan(selectedMeta.id, selectedMeta.slogan));
    setDraftColor(resolveAppColorDetails(selectedMeta.id).effective);
    const ts = localStorage.getItem(`hudumika_app_logo_ts_${selectedMeta.id}`);
    setDraftLogo(ts ? `${BASE_URL}/v1/platform/branding/app-icon/${selectedMeta.id}?t=${ts}` : '');
    setStatusMessage(null);
  }, [selectedMeta.id]);

  useEffect(() => {
    const sync = () => setResolutionTick(t => t + 1);
    window.addEventListener('hudumika-brand-updated', sync);
    window.addEventListener('hudumika-ds-updated', sync);
    return () => {
      window.removeEventListener('hudumika-brand-updated', sync);
      window.removeEventListener('hudumika-ds-updated', sync);
    };
  }, []);

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CONFIGURABLE_APP_REGISTRY;
    return CONFIGURABLE_APP_REGISTRY.filter(
      a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.slogan.toLowerCase().includes(q),
    );
  }, [search]);

  const hexIsValid = /^#[0-9a-fA-F]{6}$/.test(draftColor.trim());
  const normalizedDraftHex = hexIsValid ? draftColor.trim().toLowerCase() : resolution.effective;

  const isDirty =
    draftName.trim() !== effectiveName ||
    draftSlogan.trim() !== effectiveSlogan ||
    normalizedDraftHex !== resolution.effective.toLowerCase() ||
    draftLogo !== effectiveLogo;

  const contrastInfo = useMemo(() => {
    const floored = enforceContrastFloor(normalizedDraftHex);
    const darkText = lightenHex(normalizedDraftHex, 0.45);
    const darkSurfaceRatio = contrastRatio(darkText, '#0f172a');
    return { floored, darkText, darkSurfaceRatio };
  }, [normalizedDraftHex]);

  function recordHistoryEntry(scope: ConfigHistoryEntry['scope'], color: string) {
    const next: ConfigHistoryEntry[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        at: new Date().toLocaleTimeString(),
        actor: user?.email ?? user?.name ?? 'Admin',
        scope,
        appId: selectedMeta.id,
        appName: draftName.trim() || selectedMeta.name,
        color,
      },
      ...history,
    ].slice(0, 15);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  async function publishPlatform() {
    if (!isSuperAdmin) {
      setStatusMessage({ kind: 'error', text: 'Only SuperAdmins can publish platform-wide app defaults.' });
      return;
    }
    if (!hexIsValid) {
      setStatusMessage({ kind: 'error', text: 'Enter a valid 6-digit hex color (e.g. #0284c7) before publishing.' });
      return;
    }
    const cleanName = draftName.trim() || selectedMeta.name;
    const cleanSlogan = draftSlogan.trim();
    const logoPayload = draftLogo.startsWith('data:') ? draftLogo : undefined;
    const logoField = !draftLogo ? '' : logoPayload;

    setPublishing('platform');
    setStatusMessage(null);
    try {
      await pushBranding({
        apps: {
          [selectedMeta.id]: {
            name: cleanName,
            slogan: cleanSlogan,
            color: normalizedDraftHex,
            logo: logoField,
          },
        },
      });
      localStorage.setItem(`hudumika_app_name_${selectedMeta.id}`, cleanName);
      localStorage.setItem(`hudumika_app_slogan_${selectedMeta.id}`, cleanSlogan);
      localStorage.setItem(`hudumika_app_color_${selectedMeta.id}`, normalizedDraftHex);
      if (draftLogo) {
        localStorage.setItem(`hudumika_app_logo_ts_${selectedMeta.id}`, String(Date.now()));
      } else {
        localStorage.removeItem(`hudumika_app_logo_ts_${selectedMeta.id}`);
      }
      window.dispatchEvent(new Event('hudumika-brand-updated'));
      recordHistoryEntry('platform', normalizedDraftHex);
      setResolutionTick(t => t + 1);
      setStatusMessage({ kind: 'success', text: `Published platform configuration for ${cleanName} (${normalizedDraftHex}).` });
    } catch (err: any) {
      setStatusMessage({ kind: 'error', text: err?.message || 'Failed to publish platform configuration.' });
    } finally {
      setPublishing(null);
    }
  }

  async function publishWorkspaceOverride() {
    if (!isWorkspaceAdmin) {
      setStatusMessage({ kind: 'error', text: 'Workspace Admin permission is required to publish workspace overrides.' });
      return;
    }
    if (!hexIsValid) {
      setStatusMessage({ kind: 'error', text: 'Enter a valid 6-digit hex color (e.g. #7c3aed) before publishing.' });
      return;
    }

    setPublishing('workspace');
    setStatusMessage(null);
    try {
      await pushTenantBranding({
        apps: {
          [selectedMeta.id]: { color: normalizedDraftHex },
        },
      });
      if (!isSuperAdmin) {
        localStorage.setItem(`hudumika_tenant_app_color_${selectedMeta.id}`, normalizedDraftHex);
      } else {
        // SuperAdmin runs in platformOnly read mode on useBranding(), so test both cleanly
        localStorage.setItem(`hudumika_tenant_app_color_${selectedMeta.id}`, normalizedDraftHex);
      }
      window.dispatchEvent(new Event('hudumika-brand-updated'));
      recordHistoryEntry('workspace', normalizedDraftHex);
      setResolutionTick(t => t + 1);
      setStatusMessage({ kind: 'success', text: `Published workspace accent override for ${selectedMeta.name} (${normalizedDraftHex}).` });
    } catch (err: any) {
      setStatusMessage({ kind: 'error', text: err?.message || 'Failed to save workspace override.' });
    } finally {
      setPublishing(null);
    }
  }

  async function resetToCanonicalDefault() {
    setPublishing('reset');
    setStatusMessage(null);
    try {
      if (isSuperAdmin) {
        await pushBranding({
          apps: {
            [selectedMeta.id]: {
              name: selectedMeta.name,
              slogan: selectedMeta.slogan,
              color: selectedMeta.defaultColor,
              logo: '',
            },
          },
        });
        localStorage.removeItem(`hudumika_app_name_${selectedMeta.id}`);
        localStorage.removeItem(`hudumika_app_slogan_${selectedMeta.id}`);
        localStorage.removeItem(`hudumika_app_color_${selectedMeta.id}`);
        localStorage.removeItem(`hudumika_app_logo_ts_${selectedMeta.id}`);
        localStorage.removeItem(`hudumika_tenant_app_color_${selectedMeta.id}`);
      } else if (isWorkspaceAdmin) {
        await pushTenantBranding({
          apps: {
            [selectedMeta.id]: { color: selectedMeta.defaultColor },
          },
        });
        localStorage.removeItem(`hudumika_tenant_app_color_${selectedMeta.id}`);
      }
      window.dispatchEvent(new Event('hudumika-brand-updated'));
      setDraftName(branding.getAppName(selectedMeta.id, selectedMeta.name));
      setDraftSlogan(branding.getAppSlogan(selectedMeta.id, selectedMeta.slogan));
      setDraftColor(resolveAppColorDetails(selectedMeta.id).effective);
      const ts = localStorage.getItem(`hudumika_app_logo_ts_${selectedMeta.id}`);
      setDraftLogo(ts ? `${BASE_URL}/v1/platform/branding/app-icon/${selectedMeta.id}?t=${ts}` : '');
      recordHistoryEntry('reset', selectedMeta.defaultColor);
      setResolutionTick(t => t + 1);
      setStatusMessage({ kind: 'success', text: `Reset ${selectedMeta.name} back to canonical default (${selectedMeta.defaultColor}).` });
    } catch (err: any) {
      setStatusMessage({ kind: 'error', text: err?.message || 'Could not reset configuration.' });
    } finally {
      setPublishing(null);
    }
  }

  function discardDraft() {
    setDraftName(effectiveName);
    setDraftSlogan(effectiveSlogan);
    setDraftColor(resolution.effective);
    setDraftLogo(effectiveLogo);
    setStatusMessage(null);
  }

  const previewColumns: TableColumn<PreviewInvoiceRow>[] = [
    { key: 'ref', header: 'Document' },
    { key: 'party', header: 'Entity' },
    { key: 'amount', header: 'Amount', align: 'right' },
  ];

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Design System', 'App Configurator']}
        titlePlain="App"
        titleEm="configurator"
        subtitle="Single source of truth for per-app accent defaults, workspace overrides, inheritance resolution, and isolated multi-surface previews."
        actions={
          <div className="flex flex-wrap gap-2">
            <Tip label="Edit platform theme presets, engine modes & tokens inline">
              <Button variant="outline" size="sm" type="button" onClick={() => setActiveTab('themes')}>
                Platform Tokens &amp; Engine
              </Button>
            </Tip>
            <Tip label="Current active system architecture mode">
              <Badge variant={designSystemVersion.version === 'v2' ? 'warning' : 'brand'}>
                {designSystemVersion.version === 'v2' ? `Mellon v2 Active (${designSystemVersion.v2Color})` : 'v1 Per-App Identity Mode'}
              </Badge>
            </Tip>
          </div>
        }
      />

      <DesignSystemStudioBar studio={studio} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="per-app">Per-App Configurator</TabsTrigger>
          <TabsTrigger value="themes">Platform Themes &amp; Engine</TabsTrigger>
          <TabsTrigger value="identity">Platform Identity &amp; Logos</TabsTrigger>
          <TabsTrigger value="login">Login Screen</TabsTrigger>
        </TabsList>

        <TabsContent value="per-app" className="space-y-4 mt-2">
          {!isWorkspaceAdmin && (
        <Alert>
          <Icon name="lock" size={14} />
          <AlertTitle>Read-only exploration mode ({user?.role ?? 'Staff'})</AlertTitle>
          <AlertDescription>
            You can inspect every app&apos;s active override chain and test isolated light/dark drafts safely below. Publishing platform or workspace changes requires an Admin or SuperAdmin role.
          </AlertDescription>
        </Alert>
      )}

      {designSystemVersion.version === 'v2' && (
        <Alert>
          <Icon name="info" size={14} />
          <AlertTitle>Mellon v2 uniform lock is currently overriding per-app colors</AlertTitle>
          <AlertDescription>
            Because engine mode is set to <code>v2</code>, every app renders {designSystemVersion.v2Color} live. Switch to <code>v1 Standard</code> in{' '}
            <button
              type="button"
              onClick={() => setActiveTab('themes')}
              className="underline font-medium bg-transparent border-0 p-0 cursor-pointer text-inherit"
              data-ui-native-button=""
            >
              Platform Themes &amp; Engine
            </button>{' '}
            to let per-app accents apply.
          </AlertDescription>
        </Alert>
      )}

      <div className="dsa-split-workspace">
        <aside className="dsa-list-rail" aria-label="Registered platform apps">
          <div className="space-y-2">
            <Label htmlFor="cfg-app-search">Find registered app ({CONFIGURABLE_APP_REGISTRY.length})</Label>
            <Input
              id="cfg-app-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="e.g. FinOps, Axis, ClearOS..."
            />
          </div>

          <div className="dsa-list-scroll pt-1">
            {filteredApps.map(app => {
              const res = resolveAppColorDetails(app.id);
              const active = app.id === selectedMeta.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => navigate(`/design-system/configurator/${app.id}`)}
                  aria-current={active ? 'true' : undefined}
                  className={`dsa-rail-item ${active ? 'dsa-rail-item--active' : ''}`}
                  data-ui-native-button=""
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0 border border-border" style={{ background: res.effective }} />
                    <span className="truncate">{branding.getAppName(app.id, app.name)}</span>
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">{res.effective}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <LauncherAppSvg
                    id={selectedMeta.id}
                    color={normalizedDraftHex}
                    logoUrl={draftLogo || undefined}
                    size={44}
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-lg">{draftName || selectedMeta.name}</CardTitle>
                      <Badge variant="outline" className="font-mono">{selectedMeta.id}</Badge>
                      {isDirty && <Badge variant="warning">Unsaved Isolated Draft</Badge>}
                    </div>
                    <CardDescription className="mt-0.5">
                      Live effective source: <strong>{resolution.sourceLabel}</strong> ({resolution.effective}) · Code default: <code>{selectedMeta.defaultColor}</code>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isDirty && (
                    <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
                      Discard Draft
                    </Button>
                  )}
                  {isWorkspaceAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={publishing !== null}
                      onClick={resetToCanonicalDefault}
                    >
                      Reset to Canonical Default
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {statusMessage && (
                <Alert variant={statusMessage.kind === 'error' ? 'destructive' : 'default'}>
                  <AlertTitle>{statusMessage.kind === 'error' ? 'Configuration Error' : 'Saved'}</AlertTitle>
                  <AlertDescription>{statusMessage.text}</AlertDescription>
                </Alert>
              )}

              <div className="dsa-grid-2">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-app-name">Display Name (Platform Branding)</Label>
                    <Input
                      id="cfg-app-name"
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      disabled={!isWorkspaceAdmin}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-app-slogan">Tagline / Launcher Description</Label>
                    <Input
                      id="cfg-app-slogan"
                      value={draftSlogan}
                      onChange={e => setDraftSlogan(e.target.value)}
                      disabled={!isWorkspaceAdmin}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-app-hex">Draft Accent Hex (#RRGGBB)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="cfg-app-hex"
                        value={draftColor}
                        onChange={e => setDraftColor(e.target.value)}
                        className="font-mono max-w-[150px]"
                        aria-invalid={!hexIsValid}
                      />
                      <span className="dsa-swatch-chip" style={{ background: normalizedDraftHex }} aria-hidden="true" />
                      {!hexIsValid && <span className="text-xs text-destructive">Use #RRGGBB</span>}
                    </div>
                    <div className="pt-1">
                      <ColorSwatchPicker
                        value={normalizedDraftHex}
                        onChange={hex => setDraftColor(hex)}
                        swatches={PLATFORM_SWATCHES}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cfg-logo-upload">Custom Squircle Icon (Optional PNG/SVG &lt;= 1.5 MB)</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        ref={fileInputRef}
                        id="cfg-logo-upload"
                        type="file"
                        accept="image/*,image/svg+xml"
                        aria-label="Upload custom app icon"
                        disabled={!isSuperAdmin}
                        className="sr-only"
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 1_500_000) {
                            setStatusMessage({ kind: 'error', text: 'Custom icon must be under 1.5 MB.' });
                            return;
                          }
                          const data = await readFileAsDataUrl(file);
                          setDraftLogo(data);
                          e.target.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!isSuperAdmin}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Icon name="upload" size={13} />
                        Upload Custom Icon
                      </Button>
                      {draftLogo && isSuperAdmin && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDraftLogo('')}>
                          Remove Custom Icon
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    5-Layer Inheritance & Resolution Waterfall
                  </div>
                  {resolution.layers.map(layer => (
                    <div
                      key={layer.source}
                      className={`dsa-waterfall-step ${layer.active ? 'dsa-waterfall-step--active' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{layer.label}</span>
                          {layer.active && <Badge variant="success">Active</Badge>}
                        </div>
                        <code className="text-[11px] font-mono text-muted-foreground">{layer.key}</code>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {layer.value ? (
                          <>
                            <span className="dsa-swatch-chip" style={{ background: layer.value }} />
                            <code className="text-xs font-mono">{layer.value}</code>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">unset</span>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
                    <div className="font-semibold text-foreground">Draft Accessibility & Dark Mode Adaptation</div>
                    <div className="text-muted-foreground">
                      Button fill resolves to <code>{contrastInfo.floored.hex}</code> ({contrastInfo.floored.to.toFixed(2)}:1 AA{contrastInfo.floored.adjusted ? ', auto-floored' : ''}). Dark text shifts +45% to <code>{contrastInfo.darkText}</code> ({contrastInfo.darkSurfaceRatio.toFixed(2)}:1 vs dark card).
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-border">
                <Tip label="Persist tenant-scoped accent override via PUT /v1/settings/branding (Layer 2)">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isWorkspaceAdmin || !hexIsValid || publishing !== null}
                    onClick={publishWorkspaceOverride}
                  >
                    {publishing === 'workspace' ? 'Saving...' : 'Publish Workspace Color'}
                  </Button>
                </Tip>
                <Tip label="Publish platform-wide default app name, slogan, icon & accent via PUT /v1/platform/branding (SuperAdmin · Layer 3)">
                  <Button
                    type="button"
                    disabled={!isSuperAdmin || !hexIsValid || publishing !== null}
                    onClick={publishPlatform}
                  >
                    {publishing === 'platform' ? 'Publishing...' : 'Publish Platform Default'}
                  </Button>
                </Tip>
              </div>
            </CardContent>
          </Card>

          <PreviewStage
            title={`Isolated Draft Preview — ${draftName || selectedMeta.name} (${normalizedDraftHex})`}
            subtitle="Changes above preview across Shell, Primary CTA, Nav, Form, Table, and Dialog here without mutating any saved workspace until Publish."
            initialAppId={selectedMeta.id}
            accentOverride={normalizedDraftHex}
            hideAppPicker
            hideStatePicker
          >
            {() => (
              <div className="dsa-mini-shell">
                <aside className="dsa-mini-sidebar">
                  <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border">
                    <LauncherAppSvg id={selectedMeta.id} color={normalizedDraftHex} logoUrl={draftLogo || undefined} size={26} />
                    <span className="text-xs font-bold truncate">{draftName || selectedMeta.name}</span>
                  </div>
                  <div className="dsa-mini-nav-item dsa-mini-nav-item--active">
                    <Icon name="layoutDashboard" size={13} />
                    <span>Overview</span>
                  </div>
                  <div className="dsa-mini-nav-item">
                    <Icon name="list" size={13} />
                    <span>Operations Register</span>
                  </div>
                  <div className="dsa-mini-nav-item">
                    <Icon name="settings" size={13} />
                    <span>Module Settings</span>
                  </div>
                </aside>

                <div className="p-4 space-y-4 min-w-0">
                  <PageHeader
                    crumbs={[draftName || selectedMeta.name, 'Preview']}
                    titlePlain="Sample"
                    titleEm="workspace"
                    subtitle="Live verification across navigation, CTA buttons, form fields, tables & dialogs."
                    actions={
                      <div className="flex flex-wrap gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">Open Dialog</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Confirm Action in {draftName}</DialogTitle>
                              <DialogDescription>Portalled dialog controls inherit the same accent & focus ring.</DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button size="sm">Primary Confirm</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button size="sm">Primary Action</Button>
                      </div>
                    }
                  />

                  <Tabs defaultValue="register" variant="segmented">
                    <TabsList>
                      <TabsTrigger value="register">Table & Form</TabsTrigger>
                      <TabsTrigger value="alerts">Focus & States</TabsTrigger>
                    </TabsList>
                    <TabsContent value="register" className="space-y-3 pt-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1 flex-1 min-w-[180px]">
                          <Label htmlFor="cfg-preview-input">Reference Filter</Label>
                          <Input id="cfg-preview-input" placeholder="DOC-104..." />
                        </div>
                        <div className="flex items-center gap-2 pb-2">
                          <Switch id="cfg-preview-switch" checked={previewSwitch} onCheckedChange={setPreviewSwitch} />
                          <Label htmlFor="cfg-preview-switch">Auto-apply</Label>
                        </div>
                      </div>
                      <DataTable
                        columns={previewColumns}
                        rows={PREVIEW_TABLE_ROWS}
                        selectedIds={previewSelectedRows}
                        onSelectionChange={setPreviewSelectedRows}
                        pageSize={5}
                      />
                    </TabsContent>
                    <TabsContent value="alerts" className="pt-3">
                      <Alert>
                        <AlertTitle>Theme & Focus Parity</AlertTitle>
                        <AlertDescription>
                          Buttons, active tabs, selected table rows, and focus rings respond directly to <strong>{normalizedDraftHex}</strong> in both Light and Dark preview modes.
                        </AlertDescription>
                      </Alert>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}
          </PreviewStage>

          <SectionCard title="Recent Publish & Reset Log (Browser Session Audit)">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No changes published from this configurator yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(item => (
                  <div key={item.id} className="dsa-waterfall-step text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="dsa-swatch-chip" style={{ background: item.color }} />
                      <span className="font-semibold truncate">{item.appName}</span>
                      <Badge variant="outline" className="capitalize">{item.scope}</Badge>
                      <span className="text-muted-foreground truncate">by {item.actor}</span>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0">{item.color} · {item.at}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </main>
      </div>
        </TabsContent>

        <TabsContent value="themes" className="mt-2">
          <SectionCard title="Platform Theme Presets &amp; Engine Mode">
            <ThemePresetsAndEngineSection studio={studio} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="identity" className="space-y-4 mt-2">
          {!isSuperAdmin ? (
            <Alert>
              <Icon name="lock" size={14} />
              <AlertTitle>SuperAdmin permission required</AlertTitle>
              <AlertDescription>
                Updating global platform identity, company nomenclature, logos, and favicons requires a SuperAdmin account.
              </AlertDescription>
            </Alert>
          ) : (
            <BrandingIdentitySection />
          )}
        </TabsContent>

        <TabsContent value="login" className="space-y-4 mt-2">
          {!isSuperAdmin ? (
            <Alert>
              <Icon name="lock" size={14} />
              <AlertTitle>SuperAdmin permission required</AlertTitle>
              <AlertDescription>
                Customizing the authentication &amp; login screen theme requires a SuperAdmin account.
              </AlertDescription>
            </Alert>
          ) : (
            <BrandingLoginSection />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
