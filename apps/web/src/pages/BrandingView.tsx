import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Icon } from '../components/Icon.js';
import { pushBranding } from '../hooks/useBranding.js';

// Every app defaults to the single brand accent (matches WorkspaceApp.tsx's
// APP_COLORS / index.css's --teal) rather than its own hue by default — the
// color picker below still lets a SuperAdmin recolor individual apps.
const DEFAULT_APP_COLOR = '#0b1e3a';
const APP_META_BRAND = [
  { id: 'clearos',   name: 'ClearOS',        slogan: 'Customs & Freight clearance platform', defaultColor: DEFAULT_APP_COLOR },
  { id: 'finops',    name: 'FinOps',         slogan: 'Financial accounts and payroll ledger', defaultColor: DEFAULT_APP_COLOR },
  { id: 'onepi',     name: 'NexusHR',        slogan: 'People operations and shift rosters', defaultColor: DEFAULT_APP_COLOR },
  { id: 'bliss',     name: 'Bliss',          slogan: 'Omnichannel customer helpdesk & ticketing', defaultColor: DEFAULT_APP_COLOR },
  { id: 'complyos',  name: 'ComplyOS',       slogan: 'Compliance tracking, BRELA search & permits', defaultColor: DEFAULT_APP_COLOR },
  { id: 'crm',       name: 'CRM',            slogan: 'Customer relationships and sales deals', defaultColor: DEFAULT_APP_COLOR },
  { id: 'cloud',     name: 'CloudOS',        slogan: 'Enterprise document storage & cloud drive', defaultColor: DEFAULT_APP_COLOR },
  { id: 'email',     name: 'Email',          slogan: 'Internal corporate messaging center', defaultColor: DEFAULT_APP_COLOR },
  { id: 'contacts',  name: 'Contacts',       slogan: 'Stakeholder and client phone book', defaultColor: DEFAULT_APP_COLOR },
  { id: 'ai',        name: 'AI Automations', slogan: 'Document OCR, copilot & predictive analytics', defaultColor: DEFAULT_APP_COLOR },
  { id: 'store',     name: 'Hudumika Store', slogan: 'B2B procurement & equipment marketplace', defaultColor: DEFAULT_APP_COLOR },
  { id: 'workspace', name: 'Admin',          slogan: 'Organization settings and configuration', defaultColor: DEFAULT_APP_COLOR },
  { id: 'admin',     name: 'SuperAdmin',     slogan: 'Platform governance, tenants & query builder', defaultColor: DEFAULT_APP_COLOR },
  { id: 'oneid',     name: 'OneID',          slogan: 'SSO, identity verification & biometrics', defaultColor: DEFAULT_APP_COLOR },
  { id: 'onesite',   name: 'CMS',            slogan: 'Content management & company intranet', defaultColor: DEFAULT_APP_COLOR },
  { id: 'tracking',  name: 'CargoTracker',   slogan: 'GPS fleet tracking, telemetry & live map', defaultColor: DEFAULT_APP_COLOR },
  { id: 'demurrage',     name: 'Demurrage',    slogan: 'Container demurrage tariffs and cost tracking', defaultColor: DEFAULT_APP_COLOR },
  { id: 'cargotracker',  name: 'AWB Tracker',  slogan: 'AWB and Bill of Lading shipment tracking', defaultColor: DEFAULT_APP_COLOR },
  { id: 'calendar',  name: 'Calendar',       slogan: 'Scheduling & team calendar', defaultColor: DEFAULT_APP_COLOR },
  { id: 'tasks',     name: 'Tasks',          slogan: 'To-dos & team task tracking', defaultColor: DEFAULT_APP_COLOR },
];

function readFile(file: File): Promise<string> {
  return new Promise(res => { 
    const r = new FileReader(); 
    r.onload = () => res(r.result as string); 
    r.readAsDataURL(file); 
  });
}

export function BrandingView() {
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

  const [login, setLogin] = useState({
    headline: localStorage.getItem('hudumika_login_headline') ?? 'Welcome back',
    subtext:  localStorage.getItem('hudumika_login_subtext')  ?? 'Sign in to your Hudumika workspace',
    bgStyle:  (localStorage.getItem('hudumika_login_bg') ?? 'navy') as 'navy'|'teal'|'gradient'|'white',
  });

  const [appNames, setAppNames] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_name_${a.id}`) ?? a.name]))
  );
  
  const [appSlogans, setAppSlogans] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_slogan_${a.id}`) ?? a.slogan]))
  );

  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_color_${a.id}`) ?? a.defaultColor]))
  );

  const [appLogos, setAppLogos] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_logo_${a.id}`) ?? '']))
  );
  
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});

  // useBranding()'s fetch-from-backend hydration (triggered by any page that mounts
  // WorkspaceApp) runs async and lands in localStorage after this component's initial
  // render — re-sync from localStorage once it fires so this form reflects real saved
  // values instead of stale/default ones on first load.
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
      setLogin({
        headline: localStorage.getItem('hudumika_login_headline') ?? 'Welcome back',
        subtext:  localStorage.getItem('hudumika_login_subtext')  ?? 'Sign in to your Hudumika workspace',
        bgStyle:  (localStorage.getItem('hudumika_login_bg') ?? 'navy') as 'navy'|'teal'|'gradient'|'white',
      });
      setAppNames(Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_name_${a.id}`) ?? a.name])));
      setAppSlogans(Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_slogan_${a.id}`) ?? a.slogan])));
      setColors(Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_color_${a.id}`) ?? a.defaultColor])));
      setAppLogos(Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_logo_${a.id}`) ?? ''])));
    };
    window.addEventListener('hudumika-brand-updated', resync);
    return () => window.removeEventListener('hudumika-brand-updated', resync);
  }, []);

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

  const saveLogin = async () => {
    localStorage.setItem('hudumika_login_headline', login.headline);
    localStorage.setItem('hudumika_login_subtext',  login.subtext);
    localStorage.setItem('hudumika_login_bg',       login.bgStyle);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    try {
      await pushBranding({ loginHeadline: login.headline, loginSubtext: login.subtext, loginBgStyle: login.bgStyle as any });
      flashSaved('login');
    } catch (err: any) {
      flashError('login', err);
    }
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

  const flashSaved = (section: string) => {
    setSaveErrors(p => ({ ...p, [section]: undefined }));
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const flashError = (section: string, err: any) => {
    setSaveErrors(p => ({ ...p, [section]: err?.message || 'Save failed — check your connection and try again.' }));
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
    <div className="flex flex-col w-full max-w-6xl mx-auto p-6 gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Branding</h1>
        <p className="text-muted-foreground mt-2">Manage the visual identity and nomenclature for your entire workspace.</p>
      </div>

      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="mb-6 h-12 p-1.5 gap-2 bg-muted/60 rounded-xl border border-border">
          <TabsTrigger value="identity" className="h-9 px-6 text-sm font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">Global Identity</TabsTrigger>
          <TabsTrigger value="apps" className="h-9 px-6 text-sm font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">App Configurator</TabsTrigger>
          <TabsTrigger value="login" className="h-9 px-6 text-sm font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">Login Screen</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-6">
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
                  Used on documents and the login screen. Defaults to whatever theme is active on Design System —
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
        </TabsContent>

        <TabsContent value="apps" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {APP_META_BRAND.map(app => (
              <Card key={app.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-white" style={{ backgroundColor: colors[app.id] }}>
                      {appLogos[app.id] ? <img src={appLogos[app.id]} alt="" className="w-4 h-4" /> : <span className="text-xs">{appNames[app.id].charAt(0)}</span>}
                    </div>
                    {appNames[app.id]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      <div
                        className="w-14 h-14 rounded-xl border border-input shrink-0 flex items-center justify-center overflow-hidden shadow-sm"
                        style={{ backgroundColor: appLogos[app.id] ? 'var(--bg)' : colors[app.id] }}
                      >
                        {appLogos[app.id]
                          ? <img src={appLogos[app.id]} alt="" className="w-9 h-9 object-contain" />
                          : <span className="text-white text-lg font-bold">{appNames[app.id].charAt(0)}</span>}
                      </div>
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
                            <Icon name="x" size={14} /> Remove, use initial
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex-col items-start gap-2">
                  <Button variant="secondary" className="w-full" onClick={() => saveApp(app.id)}>
                    {savedSection === app.id ? 'Saved!' : 'Save App Config'}
                  </Button>
                  {saveErrors[app.id] && <p className="text-sm text-red-600">{saveErrors[app.id]}</p>}
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="login">
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
              <div className="border rounded-md bg-muted/30 flex items-center justify-center min-h-[200px]">
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
        </TabsContent>
      </Tabs>

    </div>
  );
}
