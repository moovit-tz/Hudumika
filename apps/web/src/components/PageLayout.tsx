import React from 'react';
import { Outlet, Link } from 'react-router-dom';
export const PageLayout: React.FC = () => {

  return (
    <div className="page-layout">
      {/* Grows to push the footer to the bottom of a short page and never
          shrinks below its own content on a tall one */}
      <div className="page-layout-content">
        <Outlet />
      </div>
      <PageFooter />
    </div>
  );
};

export const PageFooter: React.FC = () => {
  const year = new Date().getFullYear();
  return <footer className="page-footer">
        {/* Left: brand + legal */}
        <div className="page-footer-copyright">
          <span className="page-footer-identity"><strong>Hudumika Workspace</strong> &copy; {year} <strong>Moovit Mobility Limited</strong>.</span>{' '}
          <span className="page-footer-rights">All rights reserved.</span>
        </div>

        {/* Right: links */}
        <nav className="page-footer-links">
          <Link to="/terms" className="page-footer-link">Terms</Link>
          <span className="page-footer-link-sep">·</span>
          <Link to="/privacy" className="page-footer-link">Privacy</Link>
          <span className="page-footer-link-sep">·</span>
          <Link to="/support/tickets" className="page-footer-link">Support</Link>
        </nav>
      </footer>;
};
