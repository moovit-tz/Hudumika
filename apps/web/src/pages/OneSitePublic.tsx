import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { PageLoading } from '../components/ui/spinner.js';
import { BlockPreview, getVisitorSegment } from '../components/BlockPreview.js';
import type { CmsPublicSite, CmsPage, CmsPublicPost, CmsPublicContentEntry, CmsPublicContentEntrySummary, CmsBlock, CmsPublicComment, CmsPublicNavItem, CmsPublicSearchResult, CmsPublicArchiveMonth, CmsPublicPostSummary, CmsFontId } from '@hudumika/types';
import { CMS_FONT_STACKS, CMS_FONT_URLS, CMS_RADIUS_PX } from '../lib/cmsDesignTokens.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
import '../pages/LegalPages.css';
import './OneSitePublic.css';

/** Renders a 'blocks' field's real content on the public site — delegates to
 *  the same shared renderer (BlockPreview.tsx) the admin editor's live
 *  preview uses, so this page can never silently drift from what the editor
 *  showed while building it. `components` resolves any 'component' block
 *  (§8) — the server embeds every referenced component's own blocks
 *  alongside the entry (see CMSContentService.getPublicEntry), since this
 *  public route has no session to look one up by id itself. */
function BlockList({ blocks, components, tenantSlug, visitorSegment }: { blocks: CmsBlock[]; components?: Record<string, CmsBlock[]>; tenantSlug: string; visitorSegment: ReturnType<typeof getVisitorSegment> }) {
  // §30-31 — interactive=true here (and only here, never the admin canvas
  // or its own preview toggle) is what turns a 'form' block into a real,
  // submittable form rather than a disabled preview of the same fields.
  // §34 — visitorSegment is computed exactly once by OneSitePublic itself
  // (below), not here: a model with more than one 'blocks' field would
  // otherwise mount BlockList more than once on the very same page view,
  // and getVisitorSegment's own new-vs-returning flag is a one-time-per-
  // page-view marker that a second call would incorrectly flip.
  return <BlockPreview blocks={blocks} components={components} wrapClassName="onesite-pub-blocks" buttonClassName="onesite-pub-btn" tenantSlug={tenantSlug} interactive visitorSegment={visitorSegment} />;
}

/**
 * §37 — the submission surface the comment moderation queue (CMS.tsx's
 * Comments tab) never had. Everything below runs unauthenticated, exactly
 * like the rest of this page — a visitor is never signed in. A submitted
 * comment lands as `status: 'pending'` and only appears here once approved,
 * so this list never shows the one you just posted, on purpose (that's
 * what the "awaiting moderation" line communicates rather than pretending
 * it's live). Comment text renders as a plain React text node (`{c.content}`),
 * never dangerouslySetInnerHTML, the same XSS-safe pattern used for every
 * other piece of visitor/author-authored text on this page.
 */
function CommentSection({ tenantSlug, postSlug }: { tenantSlug: string; postSlug: string }) {
  const [comments, setComments] = useState<CmsPublicComment[] | null>(null);
  const [form, setForm] = useState({ author: '', email: '', content: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/v1/cms/public/${tenantSlug}/posts/${postSlug}/comments`).then(setComments).catch(() => setComments([]));
  }, [tenantSlug, postSlug]);

  function fmtCommentDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.author.trim() || !form.content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/v1/cms/public/${tenantSlug}/posts/${postSlug}/comments`, { method: 'POST', body: JSON.stringify(form) });
      setSubmitted(true);
      setForm({ author: '', email: '', content: '', website: '' });
    } catch (e: any) {
      setError(e.message || 'Failed to submit your comment — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="onesite-pub-comments">
      <h2>Comments{comments?.length ? ` (${comments.length})` : ''}</h2>
      {comments !== null && (
        comments.length === 0 ? (
          <p className="onesite-pub-empty">No comments yet — be the first.</p>
        ) : (
          <ul className="onesite-pub-comment-list">
            {comments.map(c => (
              <li key={c.id}>
                <div className="onesite-pub-comment-meta"><span className="onesite-pub-comment-author">{c.author}</span> · {fmtCommentDate(c.created_at)}</div>
                <div className="onesite-pub-comment-body">{c.content}</div>
              </li>
            ))}
          </ul>
        )
      )}

      {submitted ? (
        <p className="onesite-pub-comment-thanks">Thanks — your comment is awaiting moderation.</p>
      ) : (
        <form className="onesite-pub-comment-form" onSubmit={submit}>
          <h3>Leave a comment</h3>
          {error && <div className="onesite-pub-comment-error">{error}</div>}
          <input placeholder="Name" value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} required />
          <input type="email" placeholder="Email (optional, never shown publicly)" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <textarea placeholder="Your comment" rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} required />
          {/* Honeypot: invisible and unreachable by tab/keyboard for a real
              visitor, so only an automated filler ever populates it. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
          <button type="submit" disabled={submitting}>{submitting ? 'Posting…' : 'Post comment'}</button>
        </form>
      )}
    </div>
  );
}

/** §14 — the real, admin-configured menu (CMSNavigation.tsx). A child item
 *  renders as a plain CSS hover dropdown under its parent — no JS open-state
 *  needed for a one-level menu this small, and it stays keyboard-reachable
 *  since every link is a real, focusable anchor either way. */
function NavMenu({ items, tenantSlug }: { items: CmsPublicNavItem[]; tenantSlug: string }) {
  function hrefFor(target: string) {
    if (/^https?:\/\//.test(target)) return target;
    return target.startsWith('/') ? target : `/site/${tenantSlug}/${target}`;
  }
  return (
    <nav className="onesite-pub-nav">
      {items.map(item => (
        <div key={item.id} className="onesite-pub-nav-item">
          {/^https?:\/\//.test(item.target)
            ? <a href={hrefFor(item.target)} target="_blank" rel="noopener noreferrer">{item.label}</a>
            : <Link to={hrefFor(item.target)}>{item.label}</Link>}
          {item.children.length > 0 && (
            <div className="onesite-pub-nav-dropdown">
              {item.children.map(child => (
                /^https?:\/\//.test(child.target)
                  ? <a key={child.id} href={hrefFor(child.target)} target="_blank" rel="noopener noreferrer">{child.label}</a>
                  : <Link key={child.id} to={hrefFor(child.target)}>{child.label}</Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

/** §32 — a real public search box. Submits to /site/:tenantSlug/search?q=…
 *  rather than filtering client-side, since the actual search (Postgres
 *  full-text via search_vector) only exists server-side. */
function SearchBox({ tenantSlug, initialQuery }: { tenantSlug: string; initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  return (
    <form className="onesite-pub-search" onSubmit={e => { e.preventDefault(); if (q.trim()) window.location.href = `/site/${tenantSlug}/search?q=${encodeURIComponent(q.trim())}`; }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" aria-label="Search this site" />
      <button type="submit" aria-label="Search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      </button>
    </form>
  );
}

/**
 * Minimal public rendering surface for a tenant's OneSite content — the
 * piece that was missing before (Pages/Posts existed but nothing served
 * them to an actual visitor). Deliberately small: a header (tenant name/
 * logo/accent from Customize → Site Identity), a page list, a blog index +
 * post view, and a page view — no themes, no widgets, no menus, matching
 * what's actually real.
 */
export function OneSitePublic() {
  const { tenantSlug, pageSlug, postSlug, modelKey, entrySlug, year, month, authorId } = useParams<{ tenantSlug: string; pageSlug?: string; postSlug?: string; modelKey?: string; entrySlug?: string; year?: string; month?: string; authorId?: string }>();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  // §38 — a valid preview token lets a draft/scheduled Page, Post or Content
  // entry render here even though it isn't published yet; see cms.routes.ts.
  const previewToken = searchParams.get('preview') || '';
  const previewQS = previewToken ? `?preview=${encodeURIComponent(previewToken)}` : '';
  const isBlogRoute = window.location.pathname.includes(`/site/${tenantSlug}/blog`);
  const isSearchRoute = window.location.pathname.includes(`/site/${tenantSlug}/search`);
  const isArchiveRoute = !!(year && month);
  const isAuthorRoute = !!authorId;
  const [site, setSite] = useState<CmsPublicSite | null>(null);
  const [page, setPage] = useState<CmsPage | null>(null);
  const [post, setPost] = useState<CmsPublicPost | null>(null);
  const [modelIndex, setModelIndex] = useState<{ model: { key: string; name: string; name_plural: string }; entries: CmsPublicContentEntrySummary[] } | null>(null);
  const [modelEntry, setModelEntry] = useState<CmsPublicContentEntry | null>(null);
  const [searchResults, setSearchResults] = useState<CmsPublicSearchResult[] | null>(null);
  const [archiveMonths, setArchiveMonths] = useState<CmsPublicArchiveMonth[]>([]);
  const [archivePosts, setArchivePosts] = useState<CmsPublicPostSummary[] | null>(null);
  const [authorPage, setAuthorPage] = useState<{ authorName: string; posts: CmsPublicPostSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // §34 — computed exactly once per mount of this page component, then
  // threaded unchanged into every BlockList this render produces (a model
  // can have more than one 'blocks' field). See BlockList's own comment
  // for why this can't live inside BlockList itself.
  const visitorSegment = useMemo(() => getVisitorSegment(), []);

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
    if (!tenantSlug || !pageSlug || isBlogRoute || isSearchRoute) { setPage(null); return; }
    setLoading(true);
    setError(null);
    apiFetch(`/v1/cms/public/${tenantSlug}/pages/${pageSlug}${previewQS}`)
      .then(setPage)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantSlug, pageSlug, isBlogRoute, isSearchRoute, previewQS]);

  // §32 — real search, submitted from SearchBox.
  useEffect(() => {
    if (!tenantSlug || !isSearchRoute) { setSearchResults(null); return; }
    setSearchResults(null);
    apiFetch(`/v1/cms/public/${tenantSlug}/search?q=${encodeURIComponent(searchQuery)}`)
      .then(setSearchResults)
      .catch(() => setSearchResults([]));
  }, [tenantSlug, isSearchRoute, searchQuery]);

  // §36 — date archives. The month index (for the sidebar) loads once
  // alongside the site itself; a specific month's posts load only when a
  // visitor is actually on an archive route.
  useEffect(() => {
    if (!tenantSlug) return;
    apiFetch(`/v1/cms/public/${tenantSlug}/blog/archive`).then(setArchiveMonths).catch(() => setArchiveMonths([]));
  }, [tenantSlug]);
  useEffect(() => {
    if (!tenantSlug || !isArchiveRoute) { setArchivePosts(null); return; }
    apiFetch(`/v1/cms/public/${tenantSlug}/blog/archive/${year}/${month}`).then(setArchivePosts).catch(() => setArchivePosts([]));
  }, [tenantSlug, isArchiveRoute, year, month]);

  // §36 — author pages.
  useEffect(() => {
    if (!tenantSlug || !authorId) { setAuthorPage(null); return; }
    apiFetch(`/v1/cms/public/${tenantSlug}/blog/author/${authorId}`).then(setAuthorPage).catch(() => setAuthorPage({ authorName: 'Unknown', posts: [] }));
  }, [tenantSlug, authorId]);

  useEffect(() => {
    if (!tenantSlug || !postSlug) { setPost(null); return; }
    setLoading(true);
    setError(null);
    apiFetch(`/v1/cms/public/${tenantSlug}/posts/${postSlug}${previewQS}`)
      .then(setPost)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantSlug, postSlug, previewQS]);

  // Content Model dynamic templates (§12 of the CMS brief) — a generic
  // collection index at /m/:modelKey, a generic entry render at
  // /m/:modelKey/:entrySlug, both driven by whatever fields the tenant
  // defined for that model rather than a hand-built template per type.
  useEffect(() => {
    if (!tenantSlug || !modelKey || entrySlug) { setModelIndex(null); return; }
    setLoading(true);
    setError(null);
    apiFetch(`/v1/cms/public/${tenantSlug}/m/${modelKey}`)
      .then(setModelIndex)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantSlug, modelKey, entrySlug]);

  useEffect(() => {
    if (!tenantSlug || !modelKey || !entrySlug) { setModelEntry(null); return; }
    setLoading(true);
    setError(null);
    apiFetch(`/v1/cms/public/${tenantSlug}/m/${modelKey}/${entrySlug}${previewQS}`)
      .then(setModelEntry)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenantSlug, modelKey, entrySlug, previewQS]);

  // §33 — a real first-party pageview beacon: no IP, no user agent, no
  // cookie, no per-visitor identity, just a count (cms-analytics.service.ts's
  // own recordView). Fires once per resolved resource id, never while
  // previewing a draft/scheduled item (an admin checking their own work
  // shouldn't inflate a real view count). navigator.sendBeacon is
  // fire-and-forget by design — exactly what a pageview counter needs,
  // and it survives the page unloading, which a plain fetch() wouldn't.
  useEffect(() => {
    if (!tenantSlug || previewToken) return;
    const target = page ? { resource_type: 'page' as const, resource_id: page.id }
      : post ? { resource_type: 'post' as const, resource_id: post.id }
      : modelEntry ? { resource_type: 'entry' as const, resource_id: modelEntry.id }
      : null;
    if (!target) return;
    const body = JSON.stringify(target);
    const path = `/v1/cms/public/${tenantSlug}/pageview`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${BASE_URL}${path}`, new Blob([body], { type: 'application/json' }));
    } else {
      apiFetch(path, { method: 'POST', body }).catch(() => {});
    }
  }, [tenantSlug, previewToken, page?.id, post?.id, modelEntry?.id]);

  // This tenant's own public business site never carried its own tab
  // title/description at all — every visitor page showed the same generic
  // platform fallback. siteTitle/tagline (Customize → Site Identity) and a
  // page's own seo_description already exist for exactly this; they just
  // weren't applied.
  const siteName = site?.settings.siteTitle || site?.tenantName;
  const activeTitle = post?.title || page?.title || modelEntry?.title || (modelIndex ? modelIndex.model.name_plural : undefined);
  usePageSEO(
    activeTitle ? (siteName ? `${activeTitle} · ${siteName}` : activeTitle) : (siteName || 'Site'),
    post ? (post.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || site?.settings.tagline || undefined)
      : page ? (page.seo_description || site?.settings.tagline || undefined)
      : (site?.settings.tagline || undefined)
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

  // §10 — Design tokens: loads the real Google Fonts stylesheet(s) for
  // whichever heading/body font this tenant picked (system/georgia need no
  // fetch at all). Two distinct link ids (never the app shell's own
  // 'hudumika-ds-font') so this never collides with useDesignSystem.ts's
  // identical-shaped effect for the authenticated app UI — a genuinely
  // different, unrelated surface from a tenant's own public site. Removed
  // on unmount for the same "don't leak into the next SPA route" reason the
  // favicon effect just above already gives.
  useEffect(() => {
    const headingUrl = CMS_FONT_URLS[site?.settings.headingFont as CmsFontId] ?? null;
    const bodyUrl = CMS_FONT_URLS[site?.settings.bodyFont as CmsFontId] ?? null;
    const links: HTMLLinkElement[] = [];
    ([['onesite-heading-font', headingUrl], ['onesite-body-font', bodyUrl]] as const).forEach(([id, url]) => {
      if (!url) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
      links.push(link);
    });
    return () => { links.forEach(l => l.remove()); };
  }, [site?.settings.headingFont, site?.settings.bodyFont]);

  // §27 SEO extras — canonical URL / noindex / Open Graph image, on a page
  // or post view only. Deliberately separate from usePageSEO/claimSEO above:
  // that hook claims a route's <title>/description platform-wide (every app
  // has one), but canonical/robots/OG tags are a public-site-only concept —
  // giving claimSEO a canonical/noindex param would leak OneSite's schema
  // into every other route's SEO call. Same "remember + restore on unmount"
  // shape as the favicon effect just above, generalized to several tags.
  useEffect(() => {
    if (!page && !post) return;
    const canonicalUrl = post?.canonical_url || page?.canonical_url || null;
    const isNoindex = post?.noindex || page?.noindex || false;
    const ogImage = post?.og_image || page?.og_image || site?.settings.logoUrl || null;
    const ogTitle = activeTitle || siteName || null;
    const ogDescription = post
      ? (post.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || site?.settings.tagline || null)
      : (page?.seo_description || site?.settings.tagline || null);

    const restores: Array<() => void> = [];
    function upsert(selector: string, make: () => HTMLElement, attr: string, value: string | null) {
      if (!value) return;
      const existing = document.querySelector<HTMLElement>(selector);
      const existed = !!existing;
      const prevValue = existing?.getAttribute(attr) ?? null;
      const el = existing || make();
      if (!existing) document.head.appendChild(el);
      el.setAttribute(attr, value);
      restores.push(() => {
        if (existed) { if (prevValue) el.setAttribute(attr, prevValue); else el.removeAttribute(attr); }
        else el.remove();
      });
    }

    upsert('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, 'href', canonicalUrl);
    upsert('meta[name="robots"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'robots'); return m; }, 'content', isNoindex ? 'noindex' : null);
    upsert('meta[property="og:title"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m; }, 'content', ogTitle);
    upsert('meta[property="og:description"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m; }, 'content', ogDescription);
    upsert('meta[property="og:image"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:image'); return m; }, 'content', ogImage);

    // §28-29 — real Schema.org structured data (JSON-LD), scoped to Pages
    // and Posts. A per-Content-Model mapping (the brief's own "an Article
    // model's fields map predictably to schema.org Article properties")
    // stays open — inferring a schema.org @type from an arbitrary tenant-
    // defined model's fields is a real, separate project, not a same-pass
    // extension of this. Never invents a field this data doesn't actually
    // have: `dateModified` is only ever set from a real `updated_at` (Pages
    // carry one; the public Post shape doesn't, so it's honestly omitted
    // there rather than backfilled from `created_at`).
    let jsonLd: Record<string, unknown> | null = null;
    if (post) {
      jsonLd = {
        '@context': 'https://schema.org', '@type': 'BlogPosting',
        headline: post.title,
        datePublished: post.created_at,
        ...(post.author_name ? { author: { '@type': 'Person', name: post.author_name } } : {}),
        ...(ogDescription ? { description: ogDescription } : {}),
        ...(ogImage ? { image: ogImage } : {}),
        publisher: {
          '@type': 'Organization', name: siteName || site?.tenantName,
          ...(site?.settings.logoUrl ? { logo: { '@type': 'ImageObject', url: site.settings.logoUrl } } : {}),
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl || window.location.href },
      };
    } else if (page) {
      jsonLd = {
        '@context': 'https://schema.org', '@type': 'WebPage',
        name: page.title,
        ...(ogDescription ? { description: ogDescription } : {}),
        dateModified: page.updated_at,
        url: canonicalUrl || window.location.href,
      };
    }
    let jsonLdEl: HTMLScriptElement | null = null;
    if (jsonLd) {
      jsonLdEl = document.createElement('script');
      jsonLdEl.type = 'application/ld+json';
      jsonLdEl.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(jsonLdEl);
    }

    return () => { restores.forEach(fn => fn()); jsonLdEl?.remove(); };
  }, [page, post, activeTitle, siteName, site?.settings.logoUrl, site?.settings.tagline, site?.tenantName]);

  if (loading) return <div className="onesite-pub-loading"><PageLoading /></div>;
  if (error || !site) return <div className="onesite-pub-loading">This site isn't available.</div>;

  const accent = site.settings.accentColor || '#0d7a6b';
  // §10 — falls back to the exact same values every tenant's public site
  // already rendered before this row existed (system fonts, the ~8px radius
  // hardcoded throughout OneSitePublic.css), so a tenant who's never opened
  // Customize sees zero visual change.
  const headingFontStack = CMS_FONT_STACKS[site.settings.headingFont as CmsFontId] || CMS_FONT_STACKS.system;
  const bodyFontStack = CMS_FONT_STACKS[site.settings.bodyFont as CmsFontId] || CMS_FONT_STACKS.system;
  const radiusPx = CMS_RADIUS_PX[site.settings.radius] || CMS_RADIUS_PX.rounded;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // §11 — a page's own template controls the site chrome around it. Only
  // meaningful on the actual single-page route (every other route — the
  // page list, blog, search, …) always keeps the standard header/nav.
  const isSinglePage = !!pageSlug && !isBlogRoute && !isSearchRoute;
  const pageTemplate = isSinglePage ? (page?.template ?? 'standard') : 'standard';
  const hideChrome = isSinglePage && pageTemplate === 'landing';
  const fullWidthBody = isSinglePage && pageTemplate !== 'standard';

  return (
    <div className="onesite-pub-page lp-page" style={{
      ['--onesite-accent' as any]: accent,
      ['--onesite-heading-font' as any]: headingFontStack,
      ['--onesite-body-font' as any]: bodyFontStack,
      ['--onesite-radius' as any]: radiusPx,
    }}>
      {previewToken && (page || post || modelEntry) && (
        <div style={{ background: '#111827', color: '#fff', textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '8px 16px', letterSpacing: 0.2 }}>
          Preview mode — this content isn't published yet. This link expires 24 hours after it was created.
        </div>
      )}
      {!hideChrome && (
        <header className="onesite-pub-header">
          <div className="onesite-pub-header-inner">
            <Link to={`/site/${tenantSlug}`} className="onesite-pub-brand">
              <CompanyAvatar name={site.tenantName} logoUrl={site.settings.logoUrl} size={28} shape="square" />
              <span>{site.tenantName}</span>
            </Link>
            {site.settings.tagline && <span className="onesite-pub-tagline">{site.settings.tagline}</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
              {site.navItems.length > 0 ? (
                <NavMenu items={site.navItems} tenantSlug={tenantSlug!} />
              ) : (
                site.posts.length > 0 && <Link to={`/site/${tenantSlug}/blog`} className="onesite-pub-tagline">Blog</Link>
              )}
              {tenantSlug && <SearchBox tenantSlug={tenantSlug} initialQuery={searchQuery} />}
            </div>
          </div>
        </header>
      )}

      <main className={`onesite-pub-body${fullWidthBody ? ' onesite-pub-body-full' : ''}`}>
        {isSearchRoute ? (
          <div className="onesite-pub-list">
            <h1>Search{searchQuery ? `: "${searchQuery}"` : ''}</h1>
            {searchResults === null ? (
              <p className="onesite-pub-empty">Searching…</p>
            ) : searchResults.length === 0 ? (
              <p className="onesite-pub-empty">{searchQuery ? 'No results.' : 'Type something to search.'}</p>
            ) : (
              <ul>
                {searchResults.map(r => (
                  <li key={`${r.type}-${r.slug}`} style={{ marginBottom: 18 }}>
                    <Link to={r.type === 'post' ? `/site/${tenantSlug}/blog/${r.slug}` : `/site/${tenantSlug}/${r.slug.replace(/^\//, '')}`} style={{ fontWeight: 600 }}>{r.title}</Link>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3, #8a8f98)', margin: '3px 0 6px' }}>
                      {r.type === 'post' ? 'Post' : 'Page'}{r.category ? ` · ${r.category}` : ''} · {fmtDate(r.created_at)}
                    </div>
                    {r.excerpt && <p style={{ margin: 0, fontSize: 13.5 }}>{r.excerpt}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : isArchiveRoute ? (
          <div className="onesite-pub-list">
            <h1>{year && month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : 'Archive'}</h1>
            {archivePosts === null ? null : archivePosts.length === 0 ? (
              <p className="onesite-pub-empty">No posts published that month.</p>
            ) : (
              <ul>
                {archivePosts.map(p => (
                  <li key={p.slug} style={{ marginBottom: 18 }}>
                    <Link to={`/site/${tenantSlug}/blog/${p.slug}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3, #8a8f98)', margin: '3px 0 6px' }}>{fmtDate(p.created_at)}{p.category ? ` · ${p.category}` : ''}</div>
                    {p.excerpt && <p style={{ margin: 0, fontSize: 13.5 }}>{p.excerpt}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 24 }}><Link to={`/site/${tenantSlug}/blog`}>← Back to blog</Link></div>
          </div>
        ) : isAuthorRoute ? (
          <div className="onesite-pub-list">
            <h1>Posts by {authorPage?.authorName ?? '…'}</h1>
            {authorPage && authorPage.posts.length === 0 && <p className="onesite-pub-empty">No published posts yet.</p>}
            <ul>
              {(authorPage?.posts ?? []).map(p => (
                <li key={p.slug} style={{ marginBottom: 18 }}>
                  <Link to={`/site/${tenantSlug}/blog/${p.slug}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3, #8a8f98)', margin: '3px 0 6px' }}>{fmtDate(p.created_at)}{p.category ? ` · ${p.category}` : ''}</div>
                  {p.excerpt && <p style={{ margin: 0, fontSize: 13.5 }}>{p.excerpt}</p>}
                </li>
              ))}
            </ul>
          </div>
        ) : modelKey && entrySlug ? (
          modelEntry ? (
            <article className="onesite-pub-article">
              <div style={{ fontSize: 13, color: 'var(--ink3, #8a8f98)', marginBottom: 8 }}>{modelEntry.model.name}</div>
              <h1>{modelEntry.title}</h1>
              <dl style={{ margin: '18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {modelEntry.model.fields.map(f => {
                  const value = modelEntry.data[f.key];
                  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
                  return (
                    <div key={f.key}>
                      <dt style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink3, #8a8f98)', marginBottom: 3 }}>{f.label}</dt>
                      <dd style={{ margin: 0, fontSize: 15 }}>
                        {f.field_type === 'blocks'
                          ? <BlockList blocks={value as CmsBlock[]} components={modelEntry.components} tenantSlug={tenantSlug!} visitorSegment={visitorSegment} />
                          : f.field_type === 'richtext'
                          ? <div className="lp-cms-body" dangerouslySetInnerHTML={{ __html: String(value) }} />
                          : f.field_type === 'boolean' ? (value ? 'Yes' : 'No')
                          : f.field_type === 'image' ? <img src={String(value)} alt={f.label} style={{ maxWidth: '100%', borderRadius: 8 }} />
                          : f.field_type === 'url' ? <a href={String(value)} target="_blank" rel="noopener noreferrer">{String(value)}</a>
                          : f.field_type === 'color'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, border: '1px solid rgba(0,0,0,.15)', background: String(value) }} />
                              {String(value)}
                            </span>
                          : f.field_type === 'coordinates'
                          ? (() => {
                              const { lat, lng } = value as { lat: number; lng: number };
                              return <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">{lat.toFixed(5)}, {lng.toFixed(5)}</a>;
                            })()
                          : f.field_type === 'phone'
                          ? <a href={`tel:${String(value).replace(/[^\d+]/g, '')}`}>{String(value)}</a>
                          : f.field_type === 'currency'
                          ? (() => {
                              const { amount, currency } = value as { amount: number; currency: string };
                              try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
                              // Field values are only format-checked (3 letters), never
                              // validated against the real ISO 4217 list server-side —
                              // Intl.NumberFormat throws a RangeError for a well-formed
                              // but unrecognized code, so this is a real, reachable case,
                              // not defensive-for-its-own-sake.
                              catch { return `${amount} ${currency}`; }
                            })()
                          : f.field_type === 'repeatable'
                          ? <ul style={{ margin: 0, paddingLeft: 20 }}>
                              {(value as unknown[]).map((item, i) => (
                                <li key={i}>{(f.config as any)?.itemType === 'url' ? <a href={String(item)} target="_blank" rel="noopener noreferrer">{String(item)}</a> : String(item)}</li>
                              ))}
                            </ul>
                          : Array.isArray(value) ? value.join(', ')
                          : String(value)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <div style={{ marginTop: 24 }}>
                <Link to={`/site/${tenantSlug}/m/${modelKey}`}>← Back to {modelEntry.model.name}</Link>
              </div>
            </article>
          ) : (
            <div className="onesite-pub-loading">Not found.</div>
          )
        ) : modelKey ? (
          <div className="onesite-pub-list">
            <h1>{modelIndex?.model.name_plural ?? modelKey}</h1>
            {(!modelIndex || modelIndex.entries.length === 0) && <p className="onesite-pub-empty">Nothing published here yet.</p>}
            <ul>
              {modelIndex?.entries.map(e => (
                <li key={e.slug} style={{ marginBottom: 12 }}>
                  <Link to={`/site/${tenantSlug}/m/${modelKey}/${e.slug}`} style={{ fontWeight: 600 }}>{e.title}</Link>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3, #8a8f98)', margin: '3px 0' }}>{fmtDate(e.created_at)}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : postSlug ? (
          post ? (
            <article className="onesite-pub-article">
              <div style={{ fontSize: 13, color: 'var(--ink3, #8a8f98)', marginBottom: 8 }}>
                {fmtDate(post.created_at)}{post.category ? ` · ${post.category}` : ''}
                {post.author_name && post.author_id && <> · by <Link to={`/site/${tenantSlug}/blog/author/${post.author_id}`}>{post.author_name}</Link></>}
              </div>
              <h1>{post.title}</h1>
              <div className="lp-cms-body" dangerouslySetInnerHTML={{ __html: post.content }} />
              <div style={{ marginTop: 24 }}>
                <Link to={`/site/${tenantSlug}/blog`}>← Back to blog</Link>
              </div>
              {tenantSlug && postSlug && <CommentSection tenantSlug={tenantSlug} postSlug={postSlug} />}
            </article>
          ) : (
            <div className="onesite-pub-loading">Post not found.</div>
          )
        ) : isBlogRoute ? (
          <div className="onesite-pub-blog-layout">
            <div className="onesite-pub-list">
              <h1>Blog</h1>
              {site.posts.length === 0 && <p className="onesite-pub-empty">No published posts yet.</p>}
              <ul>
                {site.posts.map(p => (
                  <li key={p.slug} style={{ marginBottom: 18 }}>
                    <Link to={`/site/${tenantSlug}/blog/${p.slug}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3, #8a8f98)', margin: '3px 0 6px' }}>
                      {fmtDate(p.created_at)}{p.category ? ` · ${p.category}` : ''}
                      {p.author_name && p.author_id && <> · by <Link to={`/site/${tenantSlug}/blog/author/${p.author_id}`}>{p.author_name}</Link></>}
                    </div>
                    {p.excerpt && <p style={{ margin: 0, fontSize: 13.5 }}>{p.excerpt}</p>}
                  </li>
                ))}
              </ul>
            </div>
            {archiveMonths.length > 0 && (
              <aside className="onesite-pub-archive-sidebar">
                <div className="onesite-pub-archive-title">Archive</div>
                <ul>
                  {archiveMonths.map(m => (
                    <li key={`${m.year}-${m.month}`}>
                      <Link to={`/site/${tenantSlug}/blog/archive/${m.year}/${m.month}`}>{MONTH_NAMES[m.month - 1]} {m.year}</Link>
                      <span className="onesite-pub-archive-count">{m.count}</span>
                    </li>
                  ))}
                </ul>
                <a href={`/v1/cms/public/${tenantSlug}/feed.xml`} className="onesite-pub-rss-link">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a9 9 0 019 9" /><path d="M4 4a16 16 0 0116 16" /><circle cx="5" cy="19" r="1" /></svg>
                  RSS feed
                </a>
              </aside>
            )}
          </div>
        ) : pageSlug ? (
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
                  <Link to={`/site/${tenantSlug}/${p.slug.replace(/^\//, '')}`}>{p.title}</Link>
                </li>
              ))}
            </ul>
            {site.posts.length > 0 && (
              <>
                <h2 style={{ marginTop: 28 }}>Latest posts</h2>
                <ul>
                  {site.posts.slice(0, 5).map(p => (
                    <li key={p.slug}>
                      <Link to={`/site/${tenantSlug}/blog/${p.slug}`}>{p.title}</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="onesite-pub-footer">
        Powered by Hudumika OneSite
      </footer>
    </div>
  );
}
