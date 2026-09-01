// ─── OneIdPolicies.tsx — Ondi Enterprise · Policies ───────────────
// The Session Policy card that used to live on Sessions & Security, given
// its own permission-gated page (Ondi M8) — same storage
// (tenant_settings.settings.sessionPolicy), moved rather than duplicated.
// One real change alongside the move: the session-timeout value is now
// actually enforced (middleware/auth.ts re-checks it on every request,
// the same way device revocation already was) — before this it was saved
// and never read back by anything. MFA-required stays honestly labeled as
// a recorded policy, not an enforced login gate — see the note below it.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';

export const OneIdPolicies: React.FC = () => {
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/v1/oneid/org/policies').then(res => {
      setTimeoutMinutes(res.timeout_minutes ?? 60);
      setMfaRequired(!!res.mfa_required);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/oneid/org/policies', {
        method: 'PATCH',
        body: JSON.stringify({ timeout_minutes: timeoutMinutes, mfa_required: mfaRequired }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', maxWidth: 240, padding: '8px 12px', borderRadius: 'var(--r-sm, 6px)',
    border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13,
    background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Security"
        titleEm="policies"
        subtitle="Org-wide rules — actually enforced, not just recorded."
      />

      <SectionCard title="Session Timeout">
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
          Signs everyone out after this many minutes of inactivity — enforced live on every request, the same way "Sign Out" already works.
        </div>
        {!loaded ? (
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
        ) : (
          <input type="number" min={5} max={1440} value={timeoutMinutes} onChange={e => setTimeoutMinutes(Number(e.target.value))} style={inputStyle} />
        )}
      </SectionCard>

      <div style={{ marginTop: 20 }}>
        <SectionCard title="Two-Factor Authentication">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={mfaRequired} onChange={e => setMfaRequired(e.target.checked)} style={{ cursor: 'pointer', marginTop: 2 }} />
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>Require 2FA for everyone in this tenant</span>
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
            <Icon name="info" size={14} color="var(--ink3)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
              Recorded as this tenant's policy, not yet a hard login block — pair it with the{' '}
              <Link to="/ondi/compliance" style={{ color: 'var(--teal)' }}>Compliance page's</Link> 2FA-adoption number to see who still needs to set it up.
            </div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: 20 }}>
        <button type="button" onClick={save} disabled={saving || !loaded}
          style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Policies'}
        </button>
      </div>
    </div>
  );
};

export default OneIdPolicies;
