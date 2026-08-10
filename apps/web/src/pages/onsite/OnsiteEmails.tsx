import React from 'react';
import { Link } from 'react-router-dom';
import { NotProvisioned } from './NotProvisioned.js';
import './Onsite.css';

/**
 * This page previously listed mailboxes that do not exist.
 *
 * See NotProvisioned for why an honest empty state replaced it.
 */
export function OnsiteEmails() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="onsite-bc">
        <Link to="/onsite/websites" className="onsite-bc-link">Websites</Link>
        <span>›</span>
        <span>Email hosting</span>
      </div>

      <NotProvisioned
        icon="mail"
        title="Email hosting is not connected"
        what="Once an email provider is connected, this lists each mailbox on this domain with its plan and usage."
        needs="Hudumika has its own Email app for a team inbox. This screen is for mailboxes hosted against a domain Onsite manages, which needs a provider."
      />
    </div>
  );
}
