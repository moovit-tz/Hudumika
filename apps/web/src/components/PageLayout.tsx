import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useActiveApp } from '../shells/WorkspaceApp.js';
export const PageLayout: React.FC = () => {
  const location = useLocation();
  const activeAppId = useActiveApp();
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
      {/* Grows to push the footer to the bottom of a short page and never
          shrinks below its own content on a tall one — see its own CSS
          comment (index.css) for why this replaced margin-top:auto on the
          footer itself. */}
      <div className="page-layout-content">
        <Outlet />
      </div>
      <footer className="page-footer">
        {/* Left Aligned Copyrights */}
        <div className="page-footer-copyright">
          Copyrights © {year} by <strong>Hudumika LLC</strong>. All rights reserved.
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
