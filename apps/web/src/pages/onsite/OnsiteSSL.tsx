import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import type { OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { Link } from 'react-router-dom';
import './Onsite.css';

/**
 * What each domain is actually serving.
 *
 * This page used to list domains and describe them as certificates: every row
 * claimed an issuer of "Let's Encrypt Authority X3 / R3" regardless of who had
 * issued anything, and every row claimed "Managed (Auto-renews 30d prior to
 * expiry)" — a renewal service that exists nowhere in this codebase. The page
 * header promised ACME issuance; `acme_order_id` has never been written to.
 *
 * Every field below is read off the live TLS handshake, so a certificate
 * somebody else installed is reported as accurately as one Onsite provisioned.
 */
interface Certificate {
  id: string;
  domain_id: string;
  domain: string | null;
  provider: string | null;
  issuer: string | null;
  subject: string | null;
  sans: string[] | string | null;
  issued_at: string | null;
  expires_at: string | null;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function OnsiteSSL() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/onsite/ssl').catch(() => []),
      apiFetch('/v1/onsite/domains').catch(() => []),
    ])
      .then(([c, d]) => { setCerts(c || []); setDomains(d || []); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const inspect = async (domainId: string) => {
    setChecking(domainId);
    try {
      const res = await apiFetch(`/v1/onsite/domains/${domainId}/ssl/inspect`, { method: 'POST' });
      if (!res.ok) {
        // The check ran and found no usable certificate. That is a finding, so
        // it is reported as one rather than swallowed.
        showAlert(res.error || 'No certificate could be read from that host.', {
          title: `${res.domain}`, variant: 'warning',
        });
      }
      load();
    } catch (err: any) {
      showAlert(err.message || 'The certificate check could not be run.', { variant: 'error' });
    } finally {
      setChecking(null);
    }
  };

  // Domains with no certificate row yet — never checked, rather than "no SSL".
  const unchecked = domains.filter(d => !certs.some(c => c.domain_id === d.id));

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'SSL']}
        titlePlain="SSL"
        titleEm="certificates"
        subtitle="Read from each domain's live TLS handshake — issuer, validity and expiry as the host actually presents them."
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink3)' }}>Loading certificates…</p>
        </div>
      ) : certs.length === 0 && unchecked.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="shield" size={48} style={{ color: 'var(--ink3)', margin: '0 auto 1rem auto' }} />
          <h3>No domains configured yet</h3>
          <p style={{ color: 'var(--ink3)', marginBottom: '1.5rem' }}>
            Add a domain under Domains to start tracking its TLS certificate.
          </p>
          <Link to="/onsite/domains">
            <Button variant="outline">
              <Icon name="globe" size={16} /> View Domains
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="onsite-card">
            <div className="onsite-table-wrapper">
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Issued by</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Last checked</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <>
                    {certs.map((c) => {
                      const days = daysUntil(c.expires_at);
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>{c.domain ?? c.subject ?? '—'}</td>
                          <td>
                            {c.issuer ?? <span style={{ color: 'var(--ink3)' }}>Unknown</span>}
                            {c.provider === 'self_signed' && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>Self-signed</div>
                            )}
                          </td>
                          <td>
                            <Badge variant={c.status === 'valid' || c.status === 'active' ? 'success' : c.status === 'expiring' ? 'warning' : 'error'}>
                              {c.status}
                            </Badge>
                            {c.last_error && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--red)', maxWidth: 320 }}>{c.last_error}</div>
                            )}
                          </td>
                          <td>
                            {c.expires_at ? (
                              <>
                                {new Date(c.expires_at).toLocaleDateString()}
                                {days !== null && (
                                  <div style={{ fontSize: '0.75rem', color: days <= 30 ? 'var(--red)' : 'var(--ink3)' }}>
                                    {days < 0 ? `${Math.abs(days)} days ago` : `in ${days} days`}
                                  </div>
                                )}
                              </>
                            ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                          </td>
                          <td style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>
                            {c.last_checked_at ? new Date(c.last_checked_at).toLocaleString() : 'Never'}
                          </td>
                          <td>
                            <Button variant="ghost" size="sm" disabled={checking === c.domain_id}
                              onClick={() => inspect(c.domain_id)}>
                              {checking === c.domain_id ? <ButtonSpinner /> : <Icon name="refresh" size={14} />} {checking === c.domain_id ? 'Checking…' : 'Re-check'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {unchecked.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 600 }}>{d.domain}</td>
                        <td colSpan={4} style={{ color: 'var(--ink3)' }}>
                          Not checked yet — no certificate has been read from this host.
                        </td>
                        <td>
                          <Button variant="outline" size="sm" disabled={checking === d.id}
                            onClick={() => inspect(d.id)}>
                            {checking === d.id ? <ButtonSpinner /> : <Icon name="shield" size={14} />} {checking === d.id ? 'Checking…' : 'Check now'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </>
                </tbody>
              </table>
            </div>
          </div>

          <div className="onsite-card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--ink3)', fontSize: '0.8125rem', margin: 0 }}>
              Certificates are re-read automatically every six hours, and workspace
              administrators are notified when one moves within 30 days of expiry.
              Onsite reports certificates; it does not issue or renew them yet.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
