import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, csrfToken } from '../lib/api.js';
import { TRUSTED_ONDI_ISSUERS } from '../lib/appEntry.js';
import { Icon } from '../components/Icon.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';

const SCOPE_LABEL: Record<string, string> = {
  openid: 'Confirm it\'s you',
  profile: 'Your name',
  email: 'Your email address',
};

/**
 * Ondi's OAuth/OIDC consent screen (M6) — reachable at /ondi/authorize,
 * the `authorization_endpoint` the discovery document advertises. Requires
 * an existing Hudumika session (this page renders inside the normal
 * authenticated app shell) — a client redirecting a signed-out browser
 * here lands on the ordinary login screen first, same as any other
 * protected route in this app.
 *
 * Reused as-is for the standalone Ondi issuer (apps/api/src/
 * ondi-standalone-server.ts, port 3010 in dev): that process has no React
 * app of its own to render a consent screen with, so it 302s the browser
 * here with an extra `api_base` query param instead of rebuilding this
 * page. When present AND listed in lib/appEntry.ts's TRUSTED_ONDI_ISSUERS,
 * authorize/info and authorize/approve are called against that origin
 * directly (plain fetch, credentials:'include') rather than through
 * apiFetch's relative path + vite-proxy-to-3001 path — the session cookie
 * is host-scoped (port doesn't factor into cookie matching) and that
 * issuer's own CORS allowlist already permits this web origin with
 * credentials (lib/oidc.ts / ondi-standalone-server.ts), so the same
 * signed-in session authenticates there with no extra login step.
 *
 * api_base is validated against that fixed allowlist, never trusted as
 * given: this call attaches the CSRF token and the approve response's
 * redirect_url goes straight to window.location.href, so an unvalidated
 * value would let any crafted link turn this real, trusted consent page
 * into an open-redirect/phishing proxy pointed at an attacker's server. An
 * untrusted value is treated exactly like no api_base at all (falls back
 * to the normal relative apiFetch path, which only ever talks to the
 * embedded server through the vite proxy), not an error — the common
 * case (no one has tampered with the link) still works.
 */
export const OndiAuthorize: React.FC = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'consent' | 'redirecting' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ client: { name: string; logo_url: string | null }; scopes: string[]; auto_approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const requestedApiBase = params.get('api_base') || '';
  const apiBase = TRUSTED_ONDI_ISSUERS.has(requestedApiBase) ? requestedApiBase : '';
  const query = Object.fromEntries(params.entries());
  delete (query as Record<string, string>).api_base;
  const authorizeParams = new URLSearchParams(query).toString();

  async function callApi<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
    if (!apiBase) return apiFetch<T>(path, opts);
    // apiFetch (lib/api.ts) attaches this same X-CSRF-Token header on every
    // cookie-authenticated write, read from the non-httpOnly hudumika_csrf
    // cookie (double-submit pattern, middleware/csrf.ts) — the standalone
    // issuer's authenticate() preHandler is the exact same shared code, so
    // it enforces the same check; a plain fetch without this header would
    // 403 on authorize/approve.
    const csrf = csrfToken();
    const res = await fetch(`${apiBase}${path}`, {
      ...opts, credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(opts.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
    return body;
  }

  useEffect(() => {
    if (!query.client_id || !query.redirect_uri) {
      setState('error'); setError('This sign-in link is missing required parameters.');
      return;
    }
    callApi(`/v1/ondi/oauth/authorize/info?${authorizeParams}`)
      .then(async res => {
        setInfo(res);
        if (res.auto_approve) {
          const approveRes = await callApi('/v1/ondi/oauth/authorize/approve', { method: 'POST', body: JSON.stringify(query) });
          setState('redirecting');
          window.location.href = approveRes.redirect_url;
        } else {
          setState('consent');
        }
      })
      .catch(err => { setState('error'); setError(err.message || 'Could not start sign-in.'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function allow() {
    setBusy(true);
    try {
      const res = await callApi('/v1/ondi/oauth/authorize/approve', { method: 'POST', body: JSON.stringify(query) });
      setState('redirecting');
      window.location.href = res.redirect_url;
    } catch (err: any) {
      setState('error'); setError(err.message || 'Could not complete sign-in.');
    } finally { setBusy(false); }
  }

  function deny() {
    if (!query.redirect_uri) return;
    const url = new URL(query.redirect_uri);
    url.searchParams.set('error', 'access_denied');
    if (query.state) url.searchParams.set('state', query.state);
    window.location.href = url.toString();
  }

  const scopes = (query.scope || 'openid').split(' ').filter(Boolean);

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', padding: 32, width: 400, maxWidth: '92vw', boxShadow: 'var(--elev-lg)', textAlign: 'center' }}>
        {(state === 'loading' || state === 'redirecting') && (
          <div style={{ padding: '20px 0', color: 'var(--ink3)', fontSize: 13 }}>
            {state === 'redirecting' ? 'Redirecting…' : 'Loading…'}
          </div>
        )}

        {state === 'error' && (
          <div>
            <Icon name="alertCircle" size={28} style={{ color: 'var(--red)', marginBottom: 12 } as React.CSSProperties} />
            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>Can't continue</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{error}</div>
          </div>
        )}

        {state === 'consent' && info && (
          <>
            <CompanyAvatar name={info.client.name} logoUrl={info.client.logo_url} size={48} shape="square" style={{ margin: '0 auto 16px' } as React.CSSProperties} />
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{info.client.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>wants to access your Hudumika account</div>

            <div style={{ textAlign: 'left', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 24 }}>
              {scopes.map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', padding: '5px 0' }}>
                  <Icon name="check" size={13} strokeWidth={2.5} style={{ color: 'var(--teal)' } as React.CSSProperties} />
                  {SCOPE_LABEL[s] || s}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="button" variant="outline" onClick={deny} disabled={busy} style={{ flex: 1 }}>
                Deny
              </Button>
              <Button type="button" onClick={allow} disabled={busy} style={{ flex: 1 }}>
                {busy ? 'Allowing…' : 'Allow'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OndiAuthorize;
