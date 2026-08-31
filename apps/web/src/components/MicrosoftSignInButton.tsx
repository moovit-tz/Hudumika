import React, { useEffect, useState } from 'react';
import { getOndiConfig } from '../lib/ondiConfig.js';

declare global {
  interface Window { msal?: any; }
}

const MSAL_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.24.0/lib/msal-browser.min.js';

let scriptLoadPromise: Promise<void> | null = null;
function loadMsalScript(): Promise<void> {
  if (window.msal?.PublicClientApplication) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MSAL_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Microsoft Sign-In'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// One PublicClientApplication per client ID, reused across renders/clicks —
// MSAL owns its own popup + token-exchange lifecycle internally and expects
// a long-lived instance, the same way GoogleSignInButton reuses one loaded
// `window.google` rather than re-initializing per click.
let pcaPromise: Promise<any> | null = null;
let pcaClientId: string | null = null;
function getPublicClientApplication(clientId: string): Promise<any> {
  if (pcaPromise && pcaClientId === clientId) return pcaPromise;
  pcaClientId = clientId;
  pcaPromise = loadMsalScript().then(async () => {
    const pca = new window.msal.PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/common' },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await pca.initialize();
    return pca;
  });
  return pcaPromise;
}

/**
 * Microsoft's counterpart to GoogleSignInButton — renders nothing unless
 * env.MICROSOFT_OAUTH_CLIENT_ID is configured (GET /v1/ondi/auth/config),
 * same self-hiding rule. Unlike Google Identity Services, MSAL has no
 * "render your branded button for me" call, so this draws its own button
 * (Microsoft's own four-square mark, sized to match GoogleSignInButton's
 * 320px width) and drives MSAL's popup authorization-code+PKCE flow on
 * click — a public SPA client, so no client secret is ever involved here
 * or on the backend that verifies the resulting id_token.
 */
export function MicrosoftSignInButton({ onCredential, onError }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOndiConfig().then(res => setClientId(res.microsoft_client_id || null)).catch(() => setClientId(null));
  }, []);

  if (!clientId) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pca = await getPublicClientApplication(clientId);
      const result = await pca.loginPopup({ scopes: ['openid', 'profile', 'email'] });
      if (!result?.idToken) throw new Error('No credential returned');
      onCredential(result.idToken);
    } catch (err: any) {
      if (err?.errorCode !== 'user_cancelled' && !/cancel/i.test(String(err?.message || ''))) {
        onError('Could not sign in with Microsoft.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={handleClick} disabled={busy} className="login-social-btn">
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
      <span>{busy ? 'Signing in…' : 'Sign in with Microsoft'}</span>
    </button>
  );
}
