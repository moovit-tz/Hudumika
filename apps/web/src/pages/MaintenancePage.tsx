import React from 'react';
import { Icon } from '../components/Icon.js';

/** Shown when Platform Settings ▸ Maintenance Mode is on — the API rejects
 *  every authenticated request with a real 503 (middleware/auth.ts's
 *  enforceMaintenanceGate), and lib/api.ts's throwForErrorResponse redirects
 *  here rather than letting each page surface its own fetch error. */
export function MaintenancePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 24, textAlign: 'center', background: 'var(--bg)', fontFamily: 'var(--font)',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gold-l)', color: 'var(--gold)',
      }}>
        <Icon name="alertTriangle" size={30} />
      </div>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>Down for maintenance</h1>
        <p style={{ fontSize: 14, color: 'var(--ink3)', maxWidth: 380, margin: 0 }}>
          Hudumika is temporarily unavailable while we make some changes. This shouldn't take long — try again shortly.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
          background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 13,
          fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25,
        }}
      >
        Try again
      </button>
    </div>
  );
}
