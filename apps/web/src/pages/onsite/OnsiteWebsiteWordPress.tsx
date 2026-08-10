import React from 'react';
import { Link } from 'react-router-dom';
import { NotProvisioned } from './NotProvisioned.js';
import './Onsite.css';

/**
 * The Install button previously waited 1.5 seconds and then announced "WordPress 6.7 installed successfully" — nothing was installed.
 *
 * See NotProvisioned for why an honest empty state replaced it.
 */
export function OnsiteWebsiteWordPress() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="onsite-bc">
        <Link to="/onsite/websites" className="onsite-bc-link">Websites</Link>
        <span>›</span>
        <span>WordPress</span>
      </div>

      <NotProvisioned
        icon="globe"
        title="WordPress cannot be installed from here yet"
        what="Once a hosting provider is connected, this detects an existing WordPress installation or installs a new one."
        needs="An install writes files to a real server. No hosting provider is connected, so there is nowhere to write them."
      />
    </div>
  );
}
