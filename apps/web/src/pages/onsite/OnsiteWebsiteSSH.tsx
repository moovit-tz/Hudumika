import React from 'react';
import { Link } from 'react-router-dom';
import { NotProvisioned } from './NotProvisioned.js';
import './Onsite.css';

/**
 * This page previously displayed a real server IP, SSH port and hosting username transcribed from a screenshot — the same values for every tenant who opened it.
 *
 * See NotProvisioned for why an honest empty state replaced it.
 */
export function OnsiteWebsiteSSH() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="onsite-bc">
        <Link to="/onsite/websites" className="onsite-bc-link">Websites</Link>
        <span>›</span>
        <span>SSH access</span>
      </div>

      <NotProvisioned
        icon="terminal"
        title="SSH access is not available yet"
        what="Once a hosting provider is connected, this shows the host, port and username for this website, and the command to connect."
        needs="Onsite reports what a provider tells it. No hosting provider is connected to this workspace, so there is no host to report."
      />
    </div>
  );
}
