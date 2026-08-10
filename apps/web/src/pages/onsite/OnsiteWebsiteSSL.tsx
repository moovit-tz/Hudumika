import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

/**
 * The certificates this workspace's domains actually serve.
 *
 * This page shipped with two certificates hardcoded — hudumika.tz and
 * oneid.hudumika.tz, "Lifetime SSL", "Expires: Never" — transcribed from a
 * screenshot, shown to every tenant regardless of what they host. The platform
 * already has real SSL inspection (GET /v1/onsite/ssl, backed by an actual TLS
 * handshake against each host), so this reads that instead of inventing rows.
 * "Never" was wrong even for the operator: a certificate is not the
 * subscription, and the real leaf expires on a date.
 */
interface Certificate {
  id: string;
  domain: string | null;
  issuer: string | null;
  status: string;
  expires_at: string | null;
  last_checked_at: string | null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function OnsiteWebsiteSSL() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiFetch('/v1/onsite/ssl')
      .then((r: any) => setCerts(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setCerts([]))
      .finally(() => setLoading(false));
  }, []);

  const shown = certs.filter(c => (c.domain ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="onsite-bc">
        <Link to="/onsite/websites" className="onsite-bc-link">Websites</Link>
        <span>›</span>
        <span>SSL certificates</span>
      </div>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>SSL certificates</h1>

      {loading ? (
        <div className="onsite-card"><p style={{ color: 'var(--ink3)' }}>Reading certificates…</p></div>
      ) : shown.length === 0 ? (
        <div className="onsite-card onsite-unprovisioned">
          <div className="onsite-unprovisioned-icon"><Icon name="shield" size={22} color="var(--ink3)" /></div>
          <h3 className="onsite-unprovisioned-title">No certificates have been read yet</h3>
          <p className="onsite-unprovisioned-what">
            Add a domain under Domains and check it — Onsite completes a TLS handshake and
            reports the issuer, validity and expiry the host actually presents.
          </p>
          <Link to="/onsite/ssl" className="btn btn-secondary btn-sm">Go to SSL</Link>
        </div>
      ) : (
        <div className="onsite-card" style={{ padding: 0 }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <input
              className="onsite-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter by domain"
              style={{ width: '100%', maxWidth: 260 }}
            />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="onsite-table">
              <thead>
                <tr><th>Domain</th><th>Issued by</th><th>Status</th><th>Expires</th><th>Last checked</th></tr>
              </thead>
              <tbody>
                {shown.map(c => {
                  const days = daysUntil(c.expires_at);
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.domain ?? '—'}</td>
                      <td>{c.issuer ?? <span style={{ color: 'var(--ink3)' }}>Unknown</span>}</td>
                      <td><span className={`onsite-badge ${c.status}`}>{c.status}</span></td>
                      <td>
                        {c.expires_at ? (
                          <>
                            {new Date(c.expires_at).toLocaleDateString()}
                            {days !== null && (
                              <div style={{ fontSize: '0.75rem', color: days <= 30 ? '#ef4444' : 'var(--ink3)' }}>
                                {days < 0 ? `${Math.abs(days)} days ago` : `in ${days} days`}
                              </div>
                            )}
                          </>
                        ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>
                        {c.last_checked_at ? new Date(c.last_checked_at).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
