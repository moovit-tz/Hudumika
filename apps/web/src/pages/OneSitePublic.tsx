import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { PageLoading } from '../components/ui/spinner.js';
import type { CmsPublicSite, CmsPage } from '@hudumika/types';
import '../pages/LegalPages.css';
import './OneSitePublic.css';

/**
 * Minimal public rendering surface for a tenant's OneSite content — the
 * piece that was missing before (Pages/Posts existed but nothing served
 * them to an actual visitor). Deliberately small: a header (tenant name/
 * logo/accent from Customize → Site Identity), a page list, and a page
 * view — no themes, no widgets, no menus, matching what's actually real.
 */
export function OneSitePublic() {
  const { tenantSlug, pageSlug } = useParams<{ tenantSlug: string; pageSlug?: string }>();
  const [site, setSite] = useState<CmsPublicSite | null>(null);
  const [page, setPage] = useState<CmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    apiFetch(`/v1/cms/public/${tenantSlug}`)
      .then(setSite)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantSlug || !pageSlug) { setPage(null); return; }
    setLoading(true);
    setError(null);
    apiFetch(`/v1/cms/public/${tenantSlug}/pages/${pageSlug}`)
      .then(setPage)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantSlug, pageSlug]);

  // This tenant's own public business site never carried its own tab
  // title/description at all — every visitor page showed the same generic
  // platform fallback. siteTitle/tagline (Customize → Site Identity) and a
  // page's own seo_description already exist for exactly this; they just
  // weren't applied.
  const siteName = site?.settings.siteTitle || site?.tenantName;
  usePageSEO(
    page ? (siteName ? `${page.title} · ${siteName}` : page.title) : (siteName || 'Site'),
    page ? (page.seo_description || site?.settings.tagline || undefined) : (site?.settings.tagline || undefined)
  );

  // Same idea for the browser-tab icon — a tenant's own OneSite visitors
  // should see their favicon, not Hudumika's, while on their site. Restored
  // on unmount so navigating elsewhere in the SPA (no full reload) doesn't
  // leave a stray tenant favicon behind.
  //
  // useBranding.ts (mounted ambiently via AutoSEO, active on this public
  // route too) independently overwrites the same <link rel="icon"> once its
  // own async /v1/platform/branding fetch resolves — a real race confirmed
  // live (the platform favicon won on a cold load, the OneSite one won on a
  // warm one, depending purely on which fetch settled last). A MutationObserver
  // re-asserts the OneSite favicon instead of relying on effect ordering, so
  // it wins deterministically for as long as this page is mounted.
  useEffect(() => {
    const faviconUrl = site?.settings.faviconUrl;
    if (!faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevHref = link?.getAttribute('href') ?? null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    const enforce = () => { if (link && link.getAttribute('href') !== faviconUrl) link.setAttribute('href', faviconUrl); };
    enforce();
    const observer = new MutationObserver(enforce);
    observer.observe(link, { attributes: true, attributeFilter: ['href'] });
    return () => {
      observer.disconnect();
      if (!link) return;
      if (prevHref) link.setAttribute('href', prevHref);
      else link.removeAttribute('href');
    };
  }, [site?.settings.faviconUrl]);

  if (loading) return <div className="onesite-pub-loading"><PageLoading /></div>;
  if (error || !site) return <div className="onesite-pub-loading">This site isn't available.</div>;

  const accent = site.settings.accentColor || '#0d7a6b';

  return (
    <div className="onesite-pub-page lp-page" style={{ ['--onesite-accent' as any]: accent }}>
      <header className="onesite-pub-header">
        <div className="onesite-pub-header-inner">
          <Link to={`/site/${tenantSlug}`} className="onesite-pub-brand">
            <CompanyAvatar name={site.tenantName} logoUrl={site.settings.logoUrl} size={28} shape="square" />
            <span>{site.tenantName}</span>
          </Link>
          {site.settings.tagline && <span className="onesite-pub-tagline">{site.settings.tagline}</span>}
        </div>
      </header>

      <main className="onesite-pub-body">
        {pageSlug ? (
          page ? (
            <article className="onesite-pub-article">
              <h1>{page.title}</h1>
              <div className="lp-cms-body" dangerouslySetInnerHTML={{ __html: page.content }} />
            </article>
          ) : (
            <div className="onesite-pub-loading">Page not found.</div>
          )
        ) : (
          <div className="onesite-pub-list">
            <h1>{site.tenantName}</h1>
            {site.pages.length === 0 && <p className="onesite-pub-empty">No published pages yet.</p>}
            <ul>
              {site.pages.map(p => (
                <li key={p.slug}>
                  <Link to={`/site/${tenantSlug}/${p.slug}`}>{p.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <footer className="onesite-pub-footer">
        Powered by Hudumika OneSite
      </footer>
    </div>
  );
}
