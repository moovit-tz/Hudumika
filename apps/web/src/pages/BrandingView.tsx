import React, { useState, useEffect } from 'react';
import { APP_REGISTRY } from '../lib/appRegistry.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Icon } from '../components/Icon.js';
import { pushBranding } from '../hooks/useBranding.js';
import { LauncherAppSvg } from '../components/LauncherApps.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

// ── Branding — three independent panels, embedded as Design System's
// "Identity" / "Apps" / "Login screen" sections (see DesignSystemView.tsx).
// This file used to be one page with its own PageHeader + Tabs; that chrome
// moved to DesignSystemView's rail once /admin/branding, /admin/design-system
// and /admin/components were consolidated into one page (they were editing
// the same underlying per-app color data from two separate UIs — Design
// System's old "Per-App Colors" tab and this file's "App Configurator" tab).
// Each section below still owns its own state/save calls independently, so
// this split cost nothing functionally — it's the exact same three panels,
// just without a shared page shell around them.

// Every app defaults to the single brand accent (matches WorkspaceApp.tsx's
// APP_COLORS / index.css's --teal) rather than its own hue by default — the
// color picker below still lets a SuperAdmin recolor individual apps.
const DEFAULT_APP_COLOR = '#0b1e3a';

/** Derived from APP_REGISTRY, which is itself derived from ALL_APP_IDS, so an
 *  app added to the platform gets a branding row here without touching this
 *  file. This used to be a 20-entry array that had drifted three apps behind. */
const APP_META_BRAND_LIST = APP_REGISTRY.map(a => ({ ...a, defaultColor: DEFAULT_APP_COLOR }));

function readFile(file: File): Promise<string> {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════
// Identity — platform name/tagline/support links + logos/favicon
// ═══════════════════════════════════════════════════════════════

export function BrandingIdentitySection() {
  const [identity, setIdentity] = useState({
    name:         localStorage.getItem('hudumika_platform_name')     ?? 'Hudumika',
    tagline:      localStorage.getItem('hudumika_platform_tagline')  ?? 'Smart Business, Simplified.',
    supportEmail: localStorage.getItem('hudumika_support_email')     ?? 'support@hudumika.tz',
    supportUrl:   localStorage.getItem('hudumika_support_url')       ?? 'https://support.hudumika.tz',
    websiteUrl:   localStorage.getItem('hudumika_website_url')       ?? 'https://hudumika.tz',
    accentColor:  localStorage.getItem('hudumika_email_accent')      ?? '#0d7a6b',
  });
  const [logoLight, setLogoLight] = useState<string>(localStorage.getItem('hudumika_brand_logo_light') ?? '');
  const [logoDark,  setLogoDark]  = useState<string>(localStorage.getItem('hudumika_brand_logo_dark')  ?? '');
  const [favicon,   setFavicon]   = useState<string>(localStorage.getItem('hudumika_brand_favicon')    ?? '');
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    const resync = () => {
      setIdentity({
        name:         localStorage.getItem('hudumika_platform_name')     ?? 'Hudumika',
        tagline:      localStorage.getItem('hudumika_platform_tagline')  ?? 'Smart Business, Simplified.',
        supportEmail: localStorage.getItem('hudumika_support_email')     ?? 'support@hudumika.tz',
        supportUrl:   localStorage.getItem('hudumika_support_url')       ?? 'https://support.hudumika.tz',
        websiteUrl:   localStorage.getItem('hudumika_website_url')       ?? 'https://hudumika.tz',
        accentColor:  localStorage.getItem('hudumika_email_accent')      ?? '#0d7a6b',
      });
      setLogoLight(localStorage.getItem('hudumika_brand_logo_light') ?? '');
      setLogoDark(localStorage.getItem('hudumika_brand_logo_dark') ?? '');
      setFavicon(localStorage.getItem('hudumika_brand_favicon') ?? '');
    };
    window.addEventListener('hudumika-brand-updated', resync);
    return () => window.removeEventListener('hudumika-brand-updated', resync);
  }, []);

  const flashSaved = (section: string) => {
    setSaveErrors(p => ({ ...p, [section]: undefined }));
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };
  const flashError = (section: string, err: any) => {
    setSaveErrors(p => ({ ...p, [section]: err?.message || 'Save failed — check your connection and try again.' }));
  };

  const saveIdentity = async () => {
    localStorage.setItem('hudumika_platform_name',    identity.name);
    localStorage.setItem('hudumika_platform_tagline', identity.tagline);
    localStorage.setItem('hudumika_support_email',    identity.supportEmail);
    localStorage.setItem('hudumika_support_url',      identity.supportUrl);
    localStorage.setItem('hudumika_website_url',      identity.websiteUrl);
    localStorage.setItem('hudumika_email_accent',     identity.accentColor);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    try {
      await pushBranding({ platformName: identity.name, platformTagline: identity.tagline, supportEmail: identity.supportEmail, accentColor: identity.accentColor });
      flashSaved('identity');
    } catch (err: any) {
      flashError('identity', err);
    }
  };

  const handleLogoUpload = async (which: 'light' | 'dark' | 'favicon', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await readFile(file);
    if (which === 'light') {
      localStorage.setItem('hudumika_brand_logo_light', data);
      setLogoLight(data);
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
      try { await pushBranding({ logoLight: data }); flashSaved('logos'); } catch (err: any) { flashError('logos', err); }
    } else if (which === 'dark') {
      localStorage.setItem('hudumika_brand_logo_dark', data);
      setLogoDark(data);
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
      try { await pushBranding({ logoDark: data }); flashSaved('logos'); } catch (err: any) { flashError('logos', err); }
    } else {
      localStorage.setItem('hudumika_brand_favicon', data);
      setFavicon(data);
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
      try { await pushBranding({ favicon: data }); flashSaved('logos'); } catch (err: any) { flashError('logos', err); }
    }
  };

  const clearLogo = (which: 'light' | 'dark' | 'favicon') => {
    if (which === 'light') { localStorage.removeItem('hudumika_brand_logo_light'); setLogoLight(''); }
    else if (which === 'dark') { localStorage.removeItem('hudumika_brand_logo_dark'); setLogoDark(''); }
    else { localStorage.removeItem('hudumika_brand_favicon'); setFavicon(''); }
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Platform Nomenclature</CardTitle>
          <CardDescription>Global names and taglines applied across the document title and headers.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Platform Name</Label>
            <Input value={identity.name} onChange={e => setIdentity({...identity, name: e.target.value})} placeholder="e.g. Hudumika" />
          </div>
          <div className="space-y-2">
            <Label>Global Tagline</Label>
            <Input value={identity.tagline} onChange={e => setIdentity({...identity, tagline: e.target.value})} placeholder="e.g. Smart Business, Simplified." />
          </div>
          <div className="space-y-2">
            <Label>Support Email</Label>
            <Input value={identity.supportEmail} onChange={e => setIdentity({...identity, supportEmail: e.target.value})} type="email" />
          </div>
          <div className="space-y-2">
            <Label>Documentation URL</Label>
            <Input value={identity.supportUrl} onChange={e => setIdentity({...identity, supportUrl: e.target.value})} type="url" />
          </div>
          <div className="space-y-2">
            <Label>Accent Color</Label>
            <div className="flex items-center gap-2">
              <Input type="color" className="w-12 p-1 h-9" value={identity.accentColor} onChange={e => setIdentity({...identity, accentColor: e.target.value})} />
              <span className="text-sm text-muted-foreground font-mono">{identity.accentColor}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Used on documents and the login screen. Defaults to whatever theme is active on the Theme tab —
              set it here to override that default independently.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          <Button onClick={saveIdentity}>{savedSection === 'identity' ? 'Saved!' : 'Save Identity'}</Button>
          {saveErrors.identity && <p className="text-sm text-red-600">{saveErrors.identity}</p>}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logos & Favicon</CardTitle>
          <CardDescription>Brand marks used in headers, sidebars, and the browser tab.</CardDescription>
          {saveErrors.logos && <p className="text-sm text-red-600 mt-2">{saveErrors.logos}</p>}
          {savedSection === 'logos' && <p className="text-sm text-green-600 mt-2">Saved.</p>}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="flex flex-col gap-2">
            <Label>Favicon (Browser Tab)</Label>
            <div className="h-32 border rounded-md flex items-center justify-center bg-muted/30 overflow-hidden relative">
              {favicon ? (
                <img src={favicon} alt="Favicon" className="w-8 h-8 object-contain" />
              ) : <span className="text-muted-foreground text-sm">No Favicon</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full relative overflow-hidden">
                Upload
                <input type="file" accept="image/x-icon,image/png,image/svg+xml" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleLogoUpload('favicon', e)} />
              </Button>
              {favicon && <Button variant="ghost" onClick={() => clearLogo('favicon')}><Icon name="x" size={16} /></Button>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Primary Logo (Light Mode)</Label>
            <div className="h-32 border rounded-md flex items-center justify-center bg-white overflow-hidden p-4">
              {logoLight ? (
                <img src={logoLight} alt="Light Logo" className="max-h-full max-w-full object-contain" />
              ) : <span className="text-gray-400 text-sm">No Light Logo</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full relative overflow-hidden">
                Upload
                <input type="file" accept="image/*,image/svg+xml" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleLogoUpload('light', e)} />
              </Button>
              {logoLight && <Button variant="ghost" onClick={() => clearLogo('light')}><Icon name="x" size={16} /></Button>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Inverse Logo (Dark Mode)</Label>
            <div className="h-32 border rounded-md flex items-center justify-center bg-slate-900 overflow-hidden p-4">
              {logoDark ? (
                <img src={logoDark} alt="Dark Logo" className="max-h-full max-w-full object-contain" />
              ) : <span className="text-slate-500 text-sm">No Dark Logo</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full relative overflow-hidden">
                Upload
                <input type="file" accept="image/*,image/svg+xml" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleLogoUpload('dark', e)} />
              </Button>
              {logoDark && <Button variant="ghost" onClick={() => clearLogo('dark')}><Icon name="x" size={16} /></Button>}
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Apps — per-app name/color/slogan/icon, grid or list
// ═══════════════════════════════════════════════════════════════

export function BrandingAppsSection() {
  const [appNames, setAppNames] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_name_${a.id}`) ?? a.name]))
  );
  const [appSlogans, setAppSlogans] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_slogan_${a.id}`) ?? a.slogan]))
  );
  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_color_${a.id}`) ?? a.defaultColor]))
  );
  const [appLogos, setAppLogos] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_logo_${a.id}`) ?? '']))
  );
  const [appView, setAppView] = useState<'grid' | 'list'>('grid');
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    const resync = () => {
      setAppNames(Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_name_${a.id}`) ?? a.name])));
      setAppSlogans(Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_slogan_${a.id}`) ?? a.slogan])));
      setColors(Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_color_${a.id}`) ?? a.defaultColor])));
      setAppLogos(Object.fromEntries(APP_META_BRAND_LIST.map(a => [a.id, localStorage.getItem(`hudumika_app_logo_${a.id}`) ?? ''])));
    };
    window.addEventListener('hudumika-brand-updated', resync);
    return () => window.removeEventListener('hudumika-brand-updated', resync);
  }, []);

  const flashSaved = (section: string) => {
    setSaveErrors(p => ({ ...p, [section]: undefined }));
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };
  const flashError = (section: string, err: any) => {
    setSaveErrors(p => ({ ...p, [section]: err?.message || 'Save failed — check your connection and try again.' }));
  };

  const saveApp = async (appId: string) => {
    localStorage.setItem(`hudumika_app_name_${appId}`, appNames[appId]);
    localStorage.setItem(`hudumika_app_slogan_${appId}`, appSlogans[appId]);
    localStorage.setItem(`hudumika_app_color_${appId}`, colors[appId]);
    if (appLogos[appId]) localStorage.setItem(`hudumika_app_logo_${appId}`, appLogos[appId]);
    else localStorage.removeItem(`hudumika_app_logo_${appId}`);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    try {
      await pushBranding({ apps: { [appId]: { name: appNames[appId], slogan: appSlogans[appId], color: colors[appId], logo: appLogos[appId] || undefined } } });
      flashSaved(appId);
    } catch (err: any) {
      flashError(appId, err);
    }
  };

  // Shared by both the grid card and the list accordion row so the two
  // layouts stay in sync automatically rather than carrying two copies of
  // the same form that could drift.
  const renderAppFields = (app: (typeof APP_META_BRAND_LIST)[number]) => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>App Name</Label>
          <Input value={appNames[app.id]} onChange={e => setAppNames({...appNames, [app.id]: e.target.value})} />
        </div>
        <div className="space-y-2">
          <Label>Accent Color</Label>
          <div className="flex items-center gap-2">
            <div
              className="relative w-9 h-9 rounded-lg border border-input shrink-0 overflow-hidden cursor-pointer shadow-sm transition-transform hover:scale-105"
              style={{ backgroundColor: colors[app.id] }}
              title="Click to change accent color"
            >
              <input
                type="color"
                value={colors[app.id]}
                onChange={e => setColors({...colors, [app.id]: e.target.value})}
                className="absolute -inset-2 opacity-0 cursor-pointer"
              />
            </div>
            <Input
              value={colors[app.id]}
              onChange={e => setColors({...colors, [app.id]: e.target.value})}
              className="font-mono text-sm h-9"
            />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Slogan / Tagline</Label>
        <Input value={appSlogans[app.id]} onChange={e => setAppSlogans({...appSlogans, [app.id]: e.target.value})} />
      </div>
      <div className="space-y-2">
        <Label>App Icon</Label>
        <div className="flex items-center gap-3">
          <LauncherAppSvg id={app.id} color={colors[app.id]} logoUrl={appLogos[app.id] || undefined} size={56} />
          <div className="flex flex-col gap-2 flex-1">
            <Button variant="outline" size="sm" className="relative overflow-hidden w-full">
              Upload custom icon
              <input type="file" accept="image/*,image/svg+xml" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                const data = await readFile(file);
                setAppLogos({...appLogos, [app.id]: data});
              }} />
            </Button>
            {appLogos[app.id] && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setAppLogos({...appLogos, [app.id]: ''})}>
                <Icon name="x" size={14} /> Remove, use default icon
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button variant="secondary" className="w-full" onClick={() => saveApp(app.id)}>
          {savedSection === app.id ? 'Saved!' : 'Save App Config'}
        </Button>
        {saveErrors[app.id] && <p className="text-sm text-red-600">{saveErrors[app.id]}</p>}
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-prose">
          Per-app name, accent colour, slogan and icon — the same identity shown in that app's sidebar, the launcher and the login screen.
          Pick a theme on the Theme tab to prefill every app's color at once, or edit any app individually here.
        </p>
        <div className="flex items-center gap-1 bg-muted/60 border border-border rounded-full p-1 shrink-0" role="group" aria-label="Layout">
          <button type="button" onClick={() => setAppView('grid')} title="Grid view" aria-pressed={appView === 'grid'}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors cursor-pointer ${appView === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="grid" size={15} />
          </button>
          <button type="button" onClick={() => setAppView('list')} title="List view" aria-pressed={appView === 'list'}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors cursor-pointer ${appView === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="list" size={15} />
          </button>
        </div>
      </div>

      {appView === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {APP_META_BRAND_LIST.map(app => (
            <Card key={app.id}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2.5">
                  <LauncherAppSvg id={app.id} color={colors[app.id]} logoUrl={appLogos[app.id] || undefined} size={26} />
                  {appNames[app.id]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderAppFields(app)}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Accordion type="multiple" className="flex flex-col gap-2">
          {APP_META_BRAND_LIST.map(app => (
            <AccordionItem key={app.id} value={app.id}>
              <AccordionTrigger>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <LauncherAppSvg id={app.id} color={colors[app.id]} logoUrl={appLogos[app.id] || undefined} size={32} />
                  <div className="min-w-0 text-left">
                    <div className="text-sm">{appNames[app.id]}</div>
                    {appSlogans[app.id] && <div className="text-xs text-muted-foreground truncate font-normal">{appSlogans[app.id]}</div>}
                  </div>
                  <span className="ml-auto mr-2 shrink-0 font-mono text-xs text-muted-foreground hidden sm:inline">{colors[app.id]}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-1">
                {renderAppFields(app)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Login screen — headline/subtext/background style
// ═══════════════════════════════════════════════════════════════

export function BrandingLoginSection() {
  const [login, setLogin] = useState({
    headline: localStorage.getItem('hudumika_login_headline') ?? 'Welcome back',
    subtext:  localStorage.getItem('hudumika_login_subtext')  ?? 'Sign in to your Hudumika workspace',
    bgStyle:  (localStorage.getItem('hudumika_login_bg') ?? 'navy') as 'navy'|'teal'|'gradient'|'white',
  });
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    const resync = () => {
      setLogin({
        headline: localStorage.getItem('hudumika_login_headline') ?? 'Welcome back',
        subtext:  localStorage.getItem('hudumika_login_subtext')  ?? 'Sign in to your Hudumika workspace',
        bgStyle:  (localStorage.getItem('hudumika_login_bg') ?? 'navy') as 'navy'|'teal'|'gradient'|'white',
      });
    };
    window.addEventListener('hudumika-brand-updated', resync);
    return () => window.removeEventListener('hudumika-brand-updated', resync);
  }, []);

  const saveLogin = async () => {
    localStorage.setItem('hudumika_login_headline', login.headline);
    localStorage.setItem('hudumika_login_subtext',  login.subtext);
    localStorage.setItem('hudumika_login_bg',       login.bgStyle);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    try {
      await pushBranding({ loginHeadline: login.headline, loginSubtext: login.subtext, loginBgStyle: login.bgStyle as any });
      setSaveErrors(p => ({ ...p, login: undefined }));
      setSavedSection('login');
      setTimeout(() => setSavedSection(null), 2000);
    } catch (err: any) {
      setSaveErrors(p => ({ ...p, login: err?.message || 'Save failed — check your connection and try again.' }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login Screen</CardTitle>
        <CardDescription>Customize the text and background of the sign-in page.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Headline</Label>
            <Input value={login.headline} onChange={e => setLogin({...login, headline: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Subtext</Label>
            <Input value={login.subtext} onChange={e => setLogin({...login, subtext: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Background Style</Label>
            <div className="flex gap-2">
              {['navy', 'teal', 'gradient', 'white'].map(bg => (
                <div
                  key={bg}
                  onClick={() => setLogin({...login, bgStyle: bg as any})}
                  className={`capitalize text-xs cursor-pointer px-3 py-2 border rounded-md ${login.bgStyle === bg ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted'}`}
                >
                  {bg}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border rounded-md bg-muted/30 flex items-center justify-center min-h-50">
          <div className="text-center">
            <div className="font-bold text-lg">{login.headline || 'Welcome back'}</div>
            <div className="text-muted-foreground text-sm">{login.subtext || 'Sign in to your workspace'}</div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2">
        <Button onClick={saveLogin}>{savedSection === 'login' ? 'Saved!' : 'Save Login Theme'}</Button>
        {saveErrors.login && <p className="text-sm text-red-600">{saveErrors.login}</p>}
      </CardFooter>
    </Card>
  );
}
