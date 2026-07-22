import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useBranding } from '../hooks/useBranding.js';
import { useActiveApp, APP_LABELS } from '../shells/WorkspaceApp.js';
import { PoweredByHudumika } from './PoweredByHudumika.js';

export const PageLayout: React.FC = () => {
  const branding = useBranding();
  const location = useLocation();
  const activeAppId = useActiveApp();
  // Same resolution AppSidebar uses for the brand label: a SuperAdmin-set
  // override (BrandingView) wins, falling back to the built-in app name —
  // so the footer always matches what the sidebar actually calls this app,
  // instead of guessing an app name from the URL path.
  const appName = activeAppId ? branding.getAppName(activeAppId, APP_LABELS[activeAppId] ?? activeAppId) : 'Hudumika';
  const year = new Date().getFullYear();

  // Track app navigation into recently viewed history
  useEffect(() => {
    if (!activeAppId) return;
    try {
      const saved = localStorage.getItem('hudumika_recently_viewed');
      const prev: string[] = saved ? JSON.parse(saved) : ['clearos', 'finops', 'nexushr', 'bliss', 'complyos'];
      const filtered = prev.filter(x => x !== activeAppId);
      const next = [activeAppId, ...filtered].slice(0, 5);
      localStorage.setItem('hudumika_recently_viewed', JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [activeAppId, location.pathname]);

  return (
    <div className="page-layout">
      <Outlet />
      <footer className="page-footer">
        {/* Left Aligned Copyrights */}
        <div className="page-footer-copyright">
          Copyrights © {year} by <strong>Hudumika LLC</strong>. All rights reserved.
        </div>

        {/* Center Aligned App Name Powered by Hudumika Logo */}
        <div className="page-footer-powered">
          <PoweredByHudumika appName={appName} />
        </div>

        {/* Right Aligned Links */}
        <nav className="page-footer-links">
          <Link to="/terms"           className="page-footer-link">Terms of Service</Link>
          <Link to="/privacy"         className="page-footer-link">Privacy Policy</Link>
          <Link to="/support/tickets" className="page-footer-link">Support</Link>
        </nav>
      </footer>
    </div>
  );
};
