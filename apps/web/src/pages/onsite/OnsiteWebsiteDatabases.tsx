import React from 'react';
import { Link } from 'react-router-dom';
import { NotProvisioned } from './NotProvisioned.js';
import './Onsite.css';

/**
 * This page previously listed a real database name, user and size, and its "Create" button reported success without contacting anything.
 *
 * See NotProvisioned for why an honest empty state replaced it.
 */
export function OnsiteWebsiteDatabases() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="onsite-bc">
        <Link to="/onsite/websites" className="onsite-bc-link">Websites</Link>
        <span>›</span>
        <span>No databases</span>
      </div>

      <NotProvisioned
        icon="layers"
        title="No databases are managed here yet"
        what="Once a database provider is connected, this lists each database with its user, size and connection details, and can create new ones."
        needs="Creating a database means asking a provider to provision one. None is connected, so there is nothing to create it on."
      />
    </div>
  );
}
