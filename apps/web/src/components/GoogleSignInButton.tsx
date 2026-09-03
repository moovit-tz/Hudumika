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

const GOOGLE_G_ICON = `
<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
</svg>`;

/**
 * Renders Google's own "Sign in with Google" button only when the platform
 * has a real Google Cloud OAuth client configured (GET /v1/ondi/auth/config)
 * — renders nothing at all when it isn't, rather than a broken or disabled
 * button nobody can use.
 *
 * variant="pill" (OndiLogin.tsx): Google's `renderButton` only exposes a
 * handful of cosmetic knobs and always draws its own iframe chrome, so it
 * can't be made to match this app's own full-width pill buttons directly.
 * To keep the real, policy-compliant Google button (required for the
 * credential flow to fire at all) while still looking on-brand, this
 * renders Google's actual button fully transparent and stacks it exactly
 * over a styled visual pill built from plain markup — the click lands on
 * Google's real element, the pixels the user sees are ours. Ported from the
 * same technique already used in apps/web/ondi's prototype login page.
 */
export function GoogleSignInButton({ onCredential, onError, variant = 'default' }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  variant?: 'default' | 'pill';
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOndiConfig().then(res => setClientId(res.google_client_id || null)).catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;
    loadGoogleScript().then(() => {
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: { credential: string }) => onCredential(resp.credential),
      });

      if (variant === 'pill') {
        container.innerHTML = '';
        const visual = document.createElement('div');
        visual.className = 'ondi-pill ondi-pill--google-visual';
        visual.style.pointerEvents = 'none';
        visual.innerHTML = `${GOOGLE_G_ICON}<span>Continue with Google</span>`;
        container.appendChild(visual);
        visualRef.current = visual;

        const real = document.createElement('div');
        real.className = 'ondi-google-real';
        container.appendChild(real);
        container.addEventListener('mouseenter', () => visual.classList.add('ondi-pill--google-hover'));
        container.addEventListener('mouseleave', () => visual.classList.remove('ondi-pill--google-hover'));

        window.google.accounts.id.renderButton(real, {
          theme: 'outline', size: 'large', shape: 'rectangular',
          width: container.offsetWidth || 320, text: 'continue_with', logo_alignment: 'center',
        });
      } else {
        window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 320 });
      }
    }).catch(() => onError('Could not load Google Sign-In.'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, variant]);

  if (!clientId) return null;
  if (variant === 'pill') {
    return <div ref={containerRef} className="ondi-google-pill" />;
  }
  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }} />;
}
