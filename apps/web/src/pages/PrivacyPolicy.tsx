import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCMSPage } from '../hooks/useCMSPage.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useBranding } from '../hooks/useBranding.js';
import './LegalPages.css';
import { SectionLoading } from '../components/ui/spinner.js';

/** Parses `<h2 id="...">Label</h2>` out of CMS HTML to build the sidebar TOC. */
function extractTOC(html: string): [string, string][] {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll('h2[id]')).map(h => [h.id, h.textContent || '']);
}

export const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const { page, loading, error } = useCMSPage('privacy');
  const toc = useMemo(() => (page ? extractTOC(page.content).filter(([, label]) => !/\bai\b/i.test(label)) : []), [page]);
  usePageSEO(
    page?.title || 'Privacy Policy',
    page?.seo_description || 'Hudumika Workspaces Privacy Policy — how Moovit Mobility Limited collects, uses and protects your data.',
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const branding = useBranding(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !/^#[0-9a-fA-F]{6}$/.test(branding.accentColor)) return;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(branding.accentColor.slice(i, i + 2), 16));
    el.style.setProperty('--teal', branding.accentColor);
    el.style.setProperty('--teal-l', `rgba(${r},${g},${b},0.1)`);
    el.style.setProperty('--teal-m', `rgba(${r},${g},${b},0.18)`);
  }, [branding.accentColor]);

  const [activeSection, setActiveSection] = useState('');
  useEffect(() => {
    if (!page) return;
    const headings = document.querySelectorAll<HTMLElement>('.lp-cms-body h2[id]');
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 },
    );
    headings.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, [page]);

  return (
    <div ref={rootRef} className="lp-page">
      <header className="lp-topbar">
        <div className="lp-topbar-inner">
          <button type="button" className="lp-back-btn" onClick={() => navigate('/')} data-ui-native-button="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <img
            src={branding.logoLight}
            alt={branding.platformName || 'Hudumika'}
            className="lp-topbar-logo"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </header>

      <div className="lp-body">
        <aside className="lp-sidebar">
          <div className="lp-sidebar-sticky">
            <div className="lp-toc-label">Contents</div>
            <ul className="lp-toc-list">
              {toc.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className={activeSection === id ? 'active' : ''}>{label}</a>
                </li>
              ))}
            </ul>
            <div className="lp-toc-copyright">
              &copy; {new Date().getFullYear()} <strong>Moovit Mobility Limited</strong>
            </div>
          </div>
        </aside>

        <article className="lp-article">
          <div className="lp-article-header">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              Legal &middot; Data Protection
            </div>
            <h1 className="lp-h1">Privacy Policy</h1>
            <div className="lp-article-meta">
              {page && (
                <span>Last updated: <strong>{new Date(page.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></span>
              )}
            </div>
            <div className="lp-notice">
              This Privacy Policy describes how <strong>Moovit Mobility Limited</strong> (&ldquo;Hudumika Workspaces&#174;&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and protects your personal information when you use our platform and services. By using Hudumika Workspaces, you agree to the practices described here.
            </div>
          </div>

          {loading && <SectionLoading />}
          {error && <div className="lp-body-text">Couldn&apos;t load this page right now ({error}). Please try again shortly.</div>}
          {page && (
            <div className="lp-cms-body" dangerouslySetInnerHTML={{ __html: page.content }} />
          )}
        </article>
      </div>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <nav className="lp-footer-links">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/support/tickets">Support</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};
