import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, csrfToken } from '../lib/api.js';
import { TRUSTED_ONDI_ISSUERS } from '../lib/appEntry.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Icon } from '../components/Icon.js';

type Transaction = { application: string; user: { name: string; email: string }; expires_in: number };

export const OndiSamlAuthorize: React.FC = () => {
  const [params] = useSearchParams();
  const tx = params.get('tx') || '';
  const requestedApiBase = params.get('api_base') || '';
  const apiBase = TRUSTED_ONDI_ISSUERS.has(requestedApiBase) ? requestedApiBase : '';
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!apiBase) return apiFetch<T>(path, init);
    const csrf = csrfToken();
    const response = await fetch(`${apiBase}${path}`, {
      ...init, credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `Request failed (HTTP ${response.status})`);
    return body as T;
  }

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(tx)) { setError('This SAML sign-in link is invalid or expired.'); return; }
    callApi<Transaction>(`/v1/ondi/saml/idp/transactions/${encodeURIComponent(tx)}`)
      .then(setTransaction).catch((reason: Error) => setError(reason.message || 'Unable to verify this sign-in request.'));
    // The transaction is intentionally fetched once; it expires quickly and
    // approving it consumes it server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve() {
    setBusy(true);
    try {
      const result = await callApi<{ destination: string; saml_response: string; relay_state?: string }>(
        `/v1/ondi/saml/idp/transactions/${encodeURIComponent(tx)}/approve`, { method: 'POST', body: '{}' },
      );
      const form = document.createElement('form');
      form.method = 'post';
      form.action = result.destination;
      for (const [name, value] of Object.entries({ SAMLResponse: result.saml_response, ...(result.relay_state ? { RelayState: result.relay_state } : {}) })) {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete this sign-in.');
      setBusy(false);
    }
  }

  return <main style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
    <section style={{ width: 'min(440px, 100%)', padding: 28, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', textAlign: 'center', boxShadow: 'var(--elev)' }}>
      <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 16px' }}><Icon name="fingerprint" size={22} /></FeaturedIcon>
      <h1 style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Continue with Ondi</h1>
      {error ? <p role="alert" style={{ color: 'var(--red)', margin: '18px 0 0' }}>{error}</p> : !transaction ? <p style={{ color: 'var(--ink3)' }}>Checking sign-in request…</p> : <>
        <p style={{ color: 'var(--ink3)', margin: '0 0 20px' }}><strong>{transaction.application}</strong> is requesting access to your identity.</p>
        <div style={{ padding: 14, borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink2)', marginBottom: 20 }}>
          <strong>{transaction.user.name}</strong><br />{transaction.user.email}
        </div>
        <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 20px' }}>Ondi will share your name and work email with this application.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" disabled={busy} onClick={() => { window.location.href = '/ondi'; }}>Cancel</Button>
          <Button disabled={busy} onClick={approve}>{busy ? 'Continuing…' : 'Continue'}</Button>
        </div>
      </>}
    </section>
  </main>;
};

export default OndiSamlAuthorize;
