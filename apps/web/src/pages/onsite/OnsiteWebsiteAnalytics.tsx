import React from 'react';
import { Link } from 'react-router-dom';
import { NotProvisioned } from './NotProvisioned.js';
import './Onsite.css';

/**
 * This page previously showed a bandwidth figure, a request count and a country breakdown copied from a screenshot.
 *
 * See NotProvisioned for why an honest empty state replaced it.
 */
export function OnsiteWebsiteAnalytics() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="onsite-bc">
        <Link to="/onsite/websites" className="onsite-bc-link">Websites</Link>
        <span>›</span>
        <span>No traffic has been measured yet</span>
      </div>

      <NotProvisioned
        icon="barChart"
        title="No traffic has been measured yet"
        what="Once a hosting or CDN provider is connected, this shows bandwidth, requests, top countries and error rates for this website."
        needs="These figures come from a provider access log. None is connected, so nothing has been measured."
      />
    </div>
  );
}
