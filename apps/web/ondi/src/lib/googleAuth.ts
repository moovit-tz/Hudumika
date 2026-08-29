'use client';

const GOOGLE_CLIENT_ID = '749387198315-495oj9aejbmhnvahvphpiq3o4f2e53v1.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // hl=en pins the rendered button's label language regardless of browser/OS locale,
    // so it doesn't clash with the rest of the (English) UI.
    script.src = 'https://accounts.google.com/gsi/client?hl=en';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed_to_load_google_script'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

const GOOGLE_G_ICON = `
<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
</svg>`;

/**
 * Loads the Google Identity Services script (if needed) and mounts a sign-in trigger into `el`.
 *
 * Google's `renderButton` only exposes a handful of cosmetic knobs (theme/size/shape) and always
 * renders its own iframe chrome, so it can't be made to match Ondi's button system directly. To
 * keep the real, policy-compliant Google button (needed for the credential flow to work) while
 * showing something on-brand, we render Google's actual button fully transparent and stack it
 * exactly on top of an Ondi-styled visual button — the click lands on Google's real element, the
 * pixels the user sees are ours.
 */
export async function renderGoogleButton(el: HTMLElement, onCredential: (idToken: string) => void) {
  await loadGoogleScript();
  if (!window.google) return;

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp: { credential: string }) => onCredential(resp.credential),
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  el.innerHTML = '';
  el.style.position = 'relative';
  el.style.width = '100%';

  const visual = document.createElement('div');
  visual.style.cssText = [
    'width: 100%',
    'padding: 15px 0',
    'background: #ffffff',
    'border: 1px solid #e2e8f0',
    'border-radius: 12px',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'gap: 10px',
    'font-family: inherit',
    'font-weight: 700',
    'font-size: 13px',
    'letter-spacing: 0.05em',
    'text-transform: uppercase',
    'color: #001633',
    'box-shadow: 0 1px 2px rgba(0,22,51,0.04)',
    'transition: background-color 150ms ease, transform 150ms ease',
  ].join(';');
  visual.innerHTML = `${GOOGLE_G_ICON}<span>Continue with Google</span>`;
  el.appendChild(visual);

  el.addEventListener('mouseenter', () => { visual.style.backgroundColor = '#f8fafc'; });
  el.addEventListener('mouseleave', () => { visual.style.backgroundColor = '#ffffff'; });
  el.addEventListener('mousedown', () => { visual.style.transform = 'scale(0.98)'; });
  el.addEventListener('mouseup', () => { visual.style.transform = 'scale(1)'; });

  const real = document.createElement('div');
  real.style.cssText = 'position: absolute; inset: 0; opacity: 0; overflow: hidden;';
  el.appendChild(real);

  window.google.accounts.id.renderButton(real, {
    theme: 'outline',
    size: 'large',
    shape: 'rectangular',
    width: el.offsetWidth || 300,
    text: 'continue_with',
    logo_alignment: 'center',
  });
}
