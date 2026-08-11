import React, { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Icon } from './Icon.js';
import {
  subscribeInAppBrowser,
  closeInAppBrowser,
  openInAppBrowser,
  shouldInterceptHref,
  type InAppBrowserRequest,
} from '../lib/in-app-browser.js';

/**
 * Mounted once at the app root (beside AlertHost / ConfirmHost). Two jobs:
 *
 *  1. Render whatever openInAppBrowser() last requested as a right-hand
 *     slide-over holding an <iframe> — an outbound link viewed inside Hudumika.
 *  2. Intercept clicks on external links app-wide so every outbound <a> routes
 *     here by default, without each call site having to opt in. Modifier-clicks,
 *     downloads, mailto:/tel:, and anything marked data-native-link are left to
 *     the browser; same-origin app routes are never touched.
 */
export function InAppBrowserHost() {
  const [req, setReq] = useState<InAppBrowserRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [slowHint, setSlowHint] = useState(false);   // shown if the frame never loads (often = embedding blocked)
  const [iframeKey, setIframeKey] = useState(0);      // bump to reload

  useEffect(() => subscribeInAppBrowser(setReq), []);

  // Reset load state each time a new URL opens (or a reload is requested).
  useEffect(() => {
    if (!req) return;
    setLoading(true);
    setSlowHint(false);
    const t = setTimeout(() => setSlowHint(true), 6000);
    return () => clearTimeout(t);
  }, [req, iframeKey]);

  // App-wide external-link interceptor.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // respect an explicit "open in new tab"
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.hasAttribute('download')) return;
      if ((a as HTMLElement).dataset.nativeLink !== undefined) return; // opt-out
      if (a.getAttribute('target') === '_self') return;               // deliberate same-tab nav (e.g. OAuth)
      if (!shouldInterceptHref(a.href)) return;
      e.preventDefault();
      e.stopPropagation();
      const label = (a.getAttribute('aria-label') || a.textContent || '').trim();
      openInAppBrowser({ url: a.href, title: label.slice(0, 120) || undefined });
    };
    document.addEventListener('click', onClick, true); // capture — runs before React's handlers
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (!req) return null;

  let host = req.url;
  let path = '';
  let secure = false;
  try {
    const u = new URL(req.url);
    host = u.hostname;
    path = u.pathname + u.search;
    secure = u.protocol === 'https:';
  } catch { /* keep raw url as host */ }

  const openNative = () => window.open(req.url, '_blank', 'noopener,noreferrer');

  const iconBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, flexShrink: 0, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--ink2)', borderRadius: 'var(--r-sm, 8px)',
    cursor: 'pointer',
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) closeInAppBrowser(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(2px)' }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}   // don't drop focus into the cross-origin iframe
          className="fixed inset-y-0 right-0 z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          style={{
            width: 'min(1040px, 96vw)', height: '100dvh',
            background: 'var(--card-bg, var(--white))',
            borderLeft: '1px solid var(--border)',
            boxShadow: 'var(--elev-lg, -8px 0 40px rgba(0,0,0,0.18))',
          }}
        >
          <DialogPrimitive.Title className="sr-only">{req.title || host}</DialogPrimitive.Title>

          {/* Browser chrome */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            {/* Address pill */}
            <div style={{
              flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8,
              height: 34, padding: '0 12px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 'var(--r, 10px)',
            }}>
              <Icon name={secure ? 'lock' : 'globe'} size={13} style={{ flexShrink: 0, color: secure ? 'var(--green)' : 'var(--ink3)' }} />
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 2, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 13 }}>{host}</span>
                <span style={{ color: 'var(--ink3)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</span>
              </div>
            </div>

            <button type="button" style={iconBtn} onClick={() => setIframeKey((k) => k + 1)} title="Reload" aria-label="Reload">
              <Icon name="refresh" size={15} />
            </button>
            <button type="button" style={iconBtn} onClick={openNative} title="Open in new tab" aria-label="Open in new tab">
              <Icon name="externalLink" size={15} />
            </button>
            <button type="button" style={{ ...iconBtn, color: 'var(--ink)' }} onClick={closeInAppBrowser} title="Close" aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Honest embedding note — some portals refuse to be framed, and the
              fallback is a real tab, not a broken panel. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            fontSize: 11.5, color: 'var(--ink3)', background: 'var(--bg)',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <Icon name="shield" size={12} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              Viewing inside Hudumika. Some official portals block in-app view — if the page looks blank,
            </span>
            <button
              type="button"
              onClick={openNative}
              style={{ border: 'none', background: 'transparent', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontSize: 11.5, padding: 0, flexShrink: 0 }}
            >
              open in a new tab ↗
            </button>
          </div>

          {/* The frame */}
          <div style={{ position: 'relative', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
            <iframe
              key={iframeKey}
              src={req.url}
              title={req.title || host}
              onLoad={() => setLoading(false)}
              referrerPolicy="no-referrer-when-downgrade"
              style={{ width: '100%', height: '100%', border: 0, display: 'block', background: 'var(--white)' }}
            />
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 14, pointerEvents: 'none',
                background: 'var(--bg)', color: 'var(--ink3)',
              }}>
                <div className="iab-spinner" style={{
                  width: 30, height: 30, borderRadius: '50%',
                  border: '3px solid var(--border)', borderTopColor: 'var(--teal)',
                }} />
                <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 320, padding: '0 20px' }}>
                  {slowHint
                    ? <>This is taking a while — the site may block in-app viewing.{' '}
                        <button type="button" onClick={openNative} style={{ border: 'none', background: 'transparent', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, pointerEvents: 'auto' }}>Open in a new tab ↗</button>
                      </>
                    : <>Loading {host}…</>}
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
