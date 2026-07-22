import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
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

  if (loading) return <div className="onesite-pub-loading">Loading…</div>;
  if (error || !site) return <div className="onesite-pub-loading">This site isn't available.</div>;

  const accent = site.settings.accentColor || '#0d7a6b';

  return (
    <div className="onesite-pub-page lp-page" style={{ ['--onesite-accent' as any]: accent }}>
      <header className="onesite-pub-header">
        <div className="onesite-pub-header-inner">
          <Link to={`/site/${tenantSlug}`} className="onesite-pub-brand">
            {site.settings.logoUrl && <img src={site.settings.logoUrl} alt={site.tenantName} />}
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
