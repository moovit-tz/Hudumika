import React from 'react';
import { Outlet, Link } from 'react-router-dom';
export const PageLayout: React.FC = () => {
  const year = new Date().getFullYear();

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
