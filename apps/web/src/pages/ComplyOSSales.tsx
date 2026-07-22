import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PoweredByHudumika } from '../components/PoweredByHudumika.js';
import { useCMSPage } from '../hooks/useCMSPage.js';
import './LegalPages.css';

/**
 * why-complyos, fully converted to CMS content (same pattern as
 * PrivacyPolicy.tsx/TermsOfService.tsx) — editable from
 * /admin/cms-pages instead of requiring a code change. This replaces
 * the previous 821-line bespoke marketing page (pricing cards, ROI
 * calculator, live BRELA search demo, phase tabs); those interactive
 * elements don't survive the conversion to rich-text content, only
 * their real informational content does — a deliberate, confirmed
 * trade-off in exchange for full editability.
 */
function extractTOC(html: string): [string, string][] {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll('h2[id]')).map(h => [h.id, h.textContent || '']);
}

export function ComplyOSSales() {
  const navigate = useNavigate();
  const { page, loading, error } = useCMSPage('why-complyos');
  const toc = useMemo(() => (page ? extractTOC(page.content) : []), [page]);

  return (
    <div className="lp-page">
      <header className="lp-topbar">
        <div className="lp-topbar-inner">
          <button type="button" className="lp-back-btn" onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span className="lp-topbar-brand">ComplyOS · by Hudumika</span>
          <nav className="lp-topbar-links">
            <Link to="/login">Sign In</Link>
            <Link to="/signup">Start Free Trial</Link>
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
              Compliance Platform · Tanzania &amp; East Africa
            </div>
            <h1 className="lp-h1">{page?.title || 'Why ComplyOS'}</h1>
            <div className="lp-notice">
              ComplyOS automates BRELA, TRA, NSSF and other Tanzanian regulatory filings — tracking deadlines, auto-filling filings, and managing renewals before penalties occur.
              <Link to="/signup" style={{ marginLeft: 6, color: '#7A5A1E', fontWeight: 700 }}>Start your free 14-day trial →</Link>
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
          <span><PoweredByHudumika appName="ComplyOS" theme="light" /></span>
          <nav className="lp-footer-links">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/support-ticket">Support</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
