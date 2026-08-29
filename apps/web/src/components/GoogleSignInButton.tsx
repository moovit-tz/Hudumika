import React, { useEffect, useRef, useState } from 'react';
import { getOndiConfig } from '../lib/ondiConfig.js';

declare global {
  interface Window { google?: any; }
}

let scriptLoadPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Sign-In'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/**
 * Renders Google's own "Sign in with Google" button only when the platform
 * has a real Google Cloud OAuth client configured (env.GOOGLE_OAUTH_CLIENT_ID
 * — see ondi-auth.routes.ts's GET /config) — renders nothing at all when it
 * isn't, rather than a broken or disabled button nobody can use.
 */
export function GoogleSignInButton({ onCredential, onError }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOndiConfig().then(res => setClientId(res.google_client_id || null)).catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !containerRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: { credential: string }) => onCredential(resp.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, { theme: 'outline', size: 'large', width: 320 });
    }).catch(() => onError('Could not load Google Sign-In.'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!clientId) return null;
  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }} />;
}
