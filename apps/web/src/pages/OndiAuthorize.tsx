import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';

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
 */
export const OndiAuthorize: React.FC = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'consent' | 'redirecting' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ client: { name: string; logo_url: string | null }; scopes: string[]; auto_approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const query = Object.fromEntries(params.entries());

  useEffect(() => {
    if (!query.client_id || !query.redirect_uri) {
      setState('error'); setError('This sign-in link is missing required parameters.');
      return;
    }
    apiFetch(`/v1/ondi/oauth/authorize/info?${params.toString()}`)
      .then(async res => {
        setInfo(res);
        if (res.auto_approve) {
          const approveRes = await apiFetch('/v1/ondi/oauth/authorize/approve', { method: 'POST', body: JSON.stringify(query) });
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
      const res = await apiFetch('/v1/ondi/oauth/authorize/approve', { method: 'POST', body: JSON.stringify(query) });
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
      <div style={{ background: 'var(--white, #fff)', borderRadius: 12, padding: 32, width: 400, maxWidth: '92vw', boxShadow: 'var(--elev-lg)', textAlign: 'center' }}>
        {(state === 'loading' || state === 'redirecting') && (
          <div style={{ padding: '20px 0', color: 'var(--ink3)', fontSize: 13 }}>
            {state === 'redirecting' ? 'Redirecting…' : 'Loading…'}
          </div>
        )}

        {state === 'error' && (
          <div>
            <Icon name="alertCircle" size={28} style={{ color: 'var(--red, #dc2626)', marginBottom: 12 } as React.CSSProperties} />
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
              <button type="button" onClick={deny} disabled={busy}
                style={{ flex: 1, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white, #fff)', color: 'var(--ink)', fontWeight: 600, cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)' }}>
                Deny
              </button>
              <button type="button" onClick={allow} disabled={busy}
                style={{ flex: 1, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: busy ? 0.6 : 1, minHeight: 'var(--ctl-h)' }}>
                {busy ? 'Allowing…' : 'Allow'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OndiAuthorize;
