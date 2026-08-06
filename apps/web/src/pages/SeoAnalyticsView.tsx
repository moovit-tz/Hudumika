import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SwitchRow } from '../components/ui/list-item-row.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { readSeoSettings, pushSeoSettings, type SeoSettings } from '../hooks/useSeoAnalytics.js';

export function SeoAnalyticsView() {
  const [settings, setSettings] = useState<SeoSettings>(readSeoSettings);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    const resync = () => setSettings(readSeoSettings());
    window.addEventListener('hudumika-seo-updated', resync);
    return () => window.removeEventListener('hudumika-seo-updated', resync);
  }, []);

  const flashSaved = (section: string) => {
    setSaveErrors(p => ({ ...p, [section]: undefined }));
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };
  const flashError = (section: string, err: any) => {
    setSaveErrors(p => ({ ...p, [section]: err?.message || 'Save failed — check your connection and try again.' }));
  };

  const save = async (section: string, patch: Partial<SeoSettings>) => {
    try {
      const merged = await pushSeoSettings(patch);
      setSettings(prev => ({ ...prev, ...merged }));
      flashSaved(section);
    } catch (err: any) {
      flashError(section, err);
    }
  };

  return (
    /* No max-w / mx-auto / p-6 here: .app-shell-content and .page-layout own
       the page gutter, and re-centring inside them put this page's content at
       a different left edge from every other Admin screen. */
    <div className="flex flex-col w-full gap-6">
      <PageHeader
        crumbs={['Admin', 'SEO & Analytics']}
        titlePlain="SEO &"
        titleEm="analytics"
        subtitle="Configure tracking and search-verification tags for the whole platform — applied on every page, including pre-login screens."
      />

      <Card>
        <CardContent className="pt-6">
          <SwitchRow
            title="Enable tracking"
            description="Master switch — when off, no tags below are injected anywhere, regardless of what's configured."
            checked={settings.enabled}
            onCheckedChange={(checked: boolean) => {
              setSettings(prev => ({ ...prev, enabled: checked }));
              save('enabled', { enabled: checked });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Analytics 4</CardTitle>
          <CardDescription>Measurement ID from your GA4 property (Admin → Data Streams).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-w-sm">
          <Label>Measurement ID</Label>
          <Input
            value={settings.ga4MeasurementId ?? ''}
            onChange={e => setSettings(prev => ({ ...prev, ga4MeasurementId: e.target.value }))}
            placeholder="G-XXXXXXXXXX"
          />
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          <Button onClick={() => save('ga4', { ga4MeasurementId: settings.ga4MeasurementId })}>
            {savedSection === 'ga4' ? 'Saved!' : 'Save'}
          </Button>
          {saveErrors.ga4 && <p className="text-sm text-red-600">{saveErrors.ga4}</p>}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Tag Manager</CardTitle>
          <CardDescription>Container ID from your GTM workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-w-sm">
          <Label>Container ID</Label>
          <Input
            value={settings.gtmContainerId ?? ''}
            onChange={e => setSettings(prev => ({ ...prev, gtmContainerId: e.target.value }))}
            placeholder="GTM-XXXXXXX"
          />
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          <Button onClick={() => save('gtm', { gtmContainerId: settings.gtmContainerId })}>
            {savedSection === 'gtm' ? 'Saved!' : 'Save'}
          </Button>
          {saveErrors.gtm && <p className="text-sm text-red-600">{saveErrors.gtm}</p>}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meta Pixel</CardTitle>
          <CardDescription>Pixel ID from Meta Events Manager.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-w-sm">
          <Label>Pixel ID</Label>
          <Input
            value={settings.metaPixelId ?? ''}
            onChange={e => setSettings(prev => ({ ...prev, metaPixelId: e.target.value }))}
            placeholder="123456789012345"
          />
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          <Button onClick={() => save('pixel', { metaPixelId: settings.metaPixelId })}>
            {savedSection === 'pixel' ? 'Saved!' : 'Save'}
          </Button>
          {saveErrors.pixel && <p className="text-sm text-red-600">{saveErrors.pixel}</p>}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search Engine Verification</CardTitle>
          <CardDescription>Paste just the content value from the verification meta tag Google/Bing give you.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Google Search Console</Label>
            <Input
              value={settings.googleSiteVerification ?? ''}
              onChange={e => setSettings(prev => ({ ...prev, googleSiteVerification: e.target.value }))}
              placeholder="verification content value"
            />
          </div>
          <div className="space-y-2">
            <Label>Bing Webmaster Tools</Label>
            <Input
              value={settings.bingSiteVerification ?? ''}
              onChange={e => setSettings(prev => ({ ...prev, bingSiteVerification: e.target.value }))}
              placeholder="verification content value"
            />
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          <Button onClick={() => save('verify', {
            googleSiteVerification: settings.googleSiteVerification,
            bingSiteVerification: settings.bingSiteVerification,
          })}>
            {savedSection === 'verify' ? 'Saved!' : 'Save'}
          </Button>
          {saveErrors.verify && <p className="text-sm text-red-600">{saveErrors.verify}</p>}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <FeaturedIcon variant="warning" size="sm">
              <Icon name="alertTriangle" size={16} />
            </FeaturedIcon>
            <div>
              <CardTitle>Custom Scripts</CardTitle>
              <CardDescription>
                Raw HTML/script snippets, injected as-is into every page platform-wide (including pre-login screens).
                This executes arbitrary code — only paste snippets from sources you trust.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Head scripts</Label>
            <Textarea
              value={settings.customHeadScripts ?? ''}
              onChange={e => setSettings(prev => ({ ...prev, customHeadScripts: e.target.value }))}
              placeholder="<script>...</script>"
              className="font-mono text-xs min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Body scripts</Label>
            <Textarea
              value={settings.customBodyScripts ?? ''}
              onChange={e => setSettings(prev => ({ ...prev, customBodyScripts: e.target.value }))}
              placeholder="<script>...</script>"
              className="font-mono text-xs min-h-[100px]"
            />
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          <Button onClick={() => save('custom', {
            customHeadScripts: settings.customHeadScripts,
            customBodyScripts: settings.customBodyScripts,
          })}>
            {savedSection === 'custom' ? 'Saved!' : 'Save'}
          </Button>
          {saveErrors.custom && <p className="text-sm text-red-600">{saveErrors.custom}</p>}
        </CardFooter>
      </Card>

      <p className="text-xs text-muted-foreground">
        Coming later: per-page meta title/description editor, sitemap.xml / robots.txt generation, and AI-generated
        page copy — once the platform has real public marketing pages to attach them to.
      </p>
    </div>
  );
}
