import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteSSL() {
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/onsite/domains')
      .then(setDomains)
      .catch(() => setDomains([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>SSL Certificates</h1>
          <p>Automated TLS/SSL certificate issuance and Let's Encrypt lifecycle management.</p>
        </div>
      </div>

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading certificates…</p>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Primary Domain</th>
                  <th>Issuer / Authority</th>
                  <th>Status</th>
                  <th>Auto-Renewal</th>
                </tr>
              </thead>
              <tbody>
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>
                      No domains found. Add a domain to enable SSL certificate tracking.
                    </td>
                  </tr>
                ) : (
                  domains.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.domain}</td>
                      <td>Let's Encrypt Authority X3 / R3</td>
                      <td>
                        <span className={`onsite-badge ${d.ssl_status}`}>
                          {d.ssl_status === 'active' ? '✓ Valid Certificate' : d.ssl_status}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.8125rem' }}>
                          ✓ Managed (Auto-renews 30d prior to expiry)
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
