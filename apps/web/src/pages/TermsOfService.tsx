import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCMSPage } from '../hooks/useCMSPage.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './LegalPages.css';

/** Parses `<h2 id="...">Label</h2>` out of CMS HTML to build the sidebar TOC — no hand-maintained list to fall out of sync with the actual content. */
function extractTOC(html: string): [string, string][] {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll('h2[id]')).map(h => [h.id, h.textContent || '']);
}

export const TermsOfService: React.FC = () => {
  const navigate = useNavigate();
  const { page, loading, error } = useCMSPage('terms');
  const toc = useMemo(() => (page ? extractTOC(page.content) : []), [page]);
  usePageSEO(page?.title || 'Terms of Service', page?.seo_description || 'Hudumika’s Terms of Service — the terms governing use of the Hudumika platform.');

  return (
    <div className="lp-page">
      <header className="lp-topbar">
        <div className="lp-topbar-inner">
          <button type="button" className="lp-back-btn" onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span className="lp-topbar-brand">Hudumika · Legal</span>
          <nav className="lp-topbar-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/support-ticket">Support</Link>
          </nav>
        </div>
      </header>

      <div className="lp-body">
        <aside className="lp-sidebar">
          <div className="lp-sidebar-sticky">
            <div className="lp-toc-label">Contents</div>
            <ul className="lp-toc-list">
              {toc.map(([id, label]) => (
                <li key={id}><a href={`#${id}`}>{label}</a></li>
              ))}
            </ul>
          </div>
        </aside>

        <article className="lp-article">
          <div className="lp-article-header">
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              Legal · Terms
            </div>
            <h1 className="lp-h1">Terms of Service</h1>
            <div className="lp-article-meta">
              {page && <span>Last updated: <strong>{new Date(page.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></span>}
            </div>
            <div className="lp-notice">
              Please read these Terms carefully before using Hudumika. By accessing or using our platform you agree to be bound by these Terms and our <Link to="/privacy" style={{ color: '#7A5A1E', fontWeight: 700 }}>Privacy Policy</Link>. If you do not agree, do not use the service.
            </div>
          </div>

          {loading && <div className="lp-body-text">Loading…</div>}
          {error && <div className="lp-body-text">Couldn't load this page right now ({error}). Please try again shortly.</div>}
          {page && (
            <div className="lp-cms-body" dangerouslySetInnerHTML={{ __html: page.content }} />
          )}
        </article>
      </div>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span>Copyrights © {new Date().getFullYear()} by <strong>Hudumika LLC</strong>. All rights reserved.</span>
          <nav className="lp-footer-links">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/support-ticket">Support</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};
