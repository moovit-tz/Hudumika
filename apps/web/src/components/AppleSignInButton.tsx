import React, { useEffect, useState } from 'react';
import { getOndiConfig } from '../lib/ondiConfig.js';

declare global {
  interface Window { AppleID?: any; }
}

const APPLE_SCRIPT_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

let scriptLoadPromise: Promise<void> | null = null;
function loadAppleScript(): Promise<void> {
  if (window.AppleID?.auth) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = APPLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Sign in with Apple'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// Apple's SDK is initialized once per Services ID and reused across clicks,
// same reasoning as MicrosoftSignInButton's cached PublicClientApplication.
// redirectURI has no dedicated SuperAdmin field (matching Microsoft's own
// single-Client-ID-only setup) — it defaults to this app's own origin, which
// must be added as a Return URL on the Services ID in Apple's own developer
// console (the same "add this app's URL in the provider's console" step the
// Ondi SSO settings hint already asks for), or the popup will fail to close
// itself after a real sign-in.
let initPromise: Promise<void> | null = null;
let initClientId: string | null = null;
function initAppleAuth(clientId: string): Promise<void> {
  if (initPromise && initClientId === clientId) return initPromise;
  initClientId = clientId;
  initPromise = loadAppleScript().then(() => {
    window.AppleID.auth.init({
      clientId,
      scope: 'name email',
      redirectURI: window.location.origin,
      usePopup: true,
    });
  });
  return initPromise;
}

/**
 * Apple's counterpart to GoogleSignInButton/MicrosoftSignInButton — renders
 * nothing unless a real "Sign in with Apple" Services ID is configured (GET
 * /v1/ondi/auth/config), same self-hiding rule. Apple's own JS SDK draws no
 * button of its own (unlike Google's), so this renders Apple's required
 * black-mark logo on the same tucked-away `.login-social-btn` treatment
 * Microsoft's button uses, and drives the SDK's popup authorization flow —
 * a public client, no client secret ever involved here or on the backend
 * that verifies the resulting id_token (see lib/apple-oidc.ts).
 */
export function AppleSignInButton({ onCredential, onError }: {
  onCredential: (idToken: string, name?: string) => void;
  onError: (message: string) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOndiConfig().then(res => setClientId(res.apple_client_id || null)).catch(() => setClientId(null));
  }, []);

  if (!clientId) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await initAppleAuth(clientId);
      const result = await window.AppleID.auth.signIn();
      const idToken = result?.authorization?.id_token;
      if (!idToken) throw new Error('No credential returned');
      // Only present on a user's very first authorization — see
      // apple-oidc.ts's own header on why the id_token itself never has it.
      const name = result?.user?.name
        ? [result.user.name.firstName, result.user.name.lastName].filter(Boolean).join(' ').trim()
        : undefined;
      onCredential(idToken, name || undefined);
    } catch (err: any) {
      if (err?.error !== 'popup_closed_by_user' && err?.error !== 'user_cancelled_authorize') {
        onError('Could not sign in with Apple.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={handleClick} disabled={busy} className="login-social-btn">
      <svg width="16" height="18" viewBox="0 0 384 512" aria-hidden="true">
        <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
      </svg>
      <span>{busy ? 'Signing in…' : 'Sign in with Apple'}</span>
    </button>
  );
}
