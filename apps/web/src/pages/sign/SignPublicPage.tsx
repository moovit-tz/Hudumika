// ─── SignPublicPage.tsx — Public signing experience (no auth required) ────────
// Accessed via /sign/public/:token
// Shows the document, guides the signer through each required field,
// lets them draw/type/upload their signature, then submits.
// On completion shows the DocuSign-style stamp with verification code.

import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { BASE_URL } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { SignaturePad } from '../../components/SignaturePad.js';
import { pickForegroundHsl } from '../../lib/color.js';
import '../sign/Sign.css';

interface PublicSigningEnvelope {
  id: string; title: string; message: string | null;
  document_data: string | null; file_name: string | null;
  status: string; expires_at: string | null;
  verification_code: string | null;
  require_otp: boolean;
  // Only ever populated for a recipient tagged to a real colleague whose
  // role clears the tenant's own stamp-access gate (Settings ▸ E-Sign) —
  // null for every external/untagged signer, even when the tenant has a
  // stamp configured. See GET /public/:token's own comment.
  tenant_stamp_image: string | null;
}

// A discriminated union, not one interface with optional fields — the
// backend's GET /public/:token genuinely sends two different shapes: once
// an envelope is completed it short-circuits to just
// `{ already_completed: true, envelope }` (nothing left to review/sign), so
// recipient/tenant/fields are never present together with that flag. Modeled
// this way so TypeScript itself catches any future code that reads
// data.fields etc. without first checking already_completed, instead of a
// runtime crash on a signer's second visit to their own link (the actual
// bug this fixes — the page never checked the flag at all before).
type PublicSigningData =
  | { already_completed: true; envelope: PublicSigningEnvelope }
  | {
      already_completed?: false;
      envelope: PublicSigningEnvelope;
      recipient: {
        id: string; name: string; email: string; role_label: string | null; status: string;
        phone_masked: string | null; otp_verified: boolean;
        // Their own saved signature (StaffDetail.tsx's Signature tab / NexusHR
        // profile), only present when this recipient is tagged to a real
        // platform user — null for an external signer with no profile to pull.
        saved_signature: string | null;
      };
      tenant: { logo_url: string | null; primary_color: string | null };
      fields: Array<{
        id: string; field_type: string; page: number;
        x: number; y: number; width: number; height: number;
        required: boolean; placeholder: string | null; value: string | null;
      }>;
    };

interface StampPayload {
  verification_code: string;
  completed_at: string;
  title: string;
  signers: Array<{ name: string; email: string; signed_at: string | null }>;
  verify_url: string;
}

export function SignPublicPage() {
  const token = window.location.pathname.split('/').pop() ?? '';
  const [data, setData] = useState<PublicSigningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [currentField, setCurrentField] = useState(0);
  const [step, setStep] = useState<'review' | 'sign' | 'done'>('review');
  const [stamp, setStamp] = useState<StampPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);

  // ── SMS verification gate (only relevant when envelope.require_otp) ────────
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // This document's real sender, not a generic Hudumika blue — the same
  // tenants.primary_color/logo_url columns mail-template.service.ts /
  // email-envelope.ts already read for unauthenticated/system contexts.
  // Falls back to the original fixed blue until data (and therefore the
  // tenant) has loaded, or for a tenant that never set a brand color.
  const accent = (data && !data.already_completed ? data.tenant.primary_color : null) || '#1a56db';
  // accent is an arbitrary tenant-picked hex with no contrast guarantee —
  // same risk CLAUDE.md documents for --primary, but this page has no
  // --primary-foreground to read (it's a no-auth public page, no tenant
  // context guaranteed) since it already fetches the real color as data
  // rather than a CSS var. pickForegroundHsl (lib/color.ts) is the same
  // WCAG-measured picker useDesignSystem.ts uses for --primary-foreground.
  const accentFg = `hsl(${pickForegroundHsl(accent)})`;

  useEffect(() => {
    fetch(`${BASE_URL}/v1/sign/public/${token}`)
      .then(r => { if (!r.ok) throw new Error('Signing link not found'); return r.json(); })
      .then((d: PublicSigningData) => {
        setData(d);
        setOtpVerified(!d.already_completed && !!d.recipient.otp_verified);
        // A tagged colleague's own saved signature (their NexusHR profile)
        // pre-fills instead of forcing a fresh draw every time — the
        // existing "Change" button below still lets them draw a different
        // one for this specific document.
        if (!d.already_completed && d.recipient.saved_signature) setSignature(d.recipient.saved_signature);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleRequestOtp() {
    setOtpRequesting(true);
    setOtpError(null);
    try {
      const res = await fetch(`${BASE_URL}/v1/sign/public/${token}/request-otp`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Could not send verification code');
      setOtpSentTo(result.sent_to ?? null);
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : 'Could not send verification code');
    } finally {
      setOtpRequesting(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode.trim()) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch(`${BASE_URL}/v1/sign/public/${token}/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpCode.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Incorrect code');
      setOtpVerified(true);
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : 'Incorrect code');
    } finally {
      setOtpVerifying(false);
    }
  }

  async function handleSubmit() {
    if (!data || !signature) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/v1/sign/public/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_data: signature,
          fields: Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Failed to submit');
      if (result.stamp) setStamp(result.stamp);
      setStep('done');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    const reason = window.prompt('Reason for declining (optional):') ?? '';
    if (!confirm('Are you sure you want to decline this document?')) return;
    setDeclining(true);
    try {
      await fetch(`${BASE_URL}/v1/sign/public/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      setError('You have declined to sign this document.');
    } finally {
      setDeclining(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name="edit" size={36} style={{ opacity: 0.4 }} />
        </div>
        <div style={{ fontSize: 16 }}>Loading signing request…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 40, maxWidth: 400, textAlign: 'center', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name="alertCircle" size={48} style={{ color: 'var(--sign-red)' }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Unable to load document</h2>
        <p style={{ color: 'var(--ink3)', fontSize: 14 }}>{error}</p>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, ${accent} 100%)`, fontFamily: 'var(--font)', padding: 32 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, padding: 40, maxWidth: 520, width: '100%', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--sign-green-l)', border: '2px solid var(--sign-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="checkCircle" size={32} style={{ color: 'var(--sign-green)' }} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: 'var(--ink)' }}>Document Signed!</h1>
          <p style={{ color: 'var(--ink3)', fontSize: 14, margin: 0 }}>Your signature has been securely recorded and legally timestamped.</p>
        </div>

        {stamp && (
          <div style={{ background: 'var(--sign-green-l)', border: '2px solid var(--sign-green)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sign-green)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="lock" size={11} /> Hudumika eSign Stamp</div>
            <div style={{ fontFamily: 'Courier New, monospace', fontSize: 18, fontWeight: 700, color: 'var(--sign-green)', letterSpacing: '0.1em', marginBottom: 10 }}>{stamp.verification_code}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 4 }}>Document: <strong>{stamp.title}</strong></div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 10 }}>Completed: <strong>{new Date(stamp.completed_at).toLocaleString()}</strong></div>
            {stamp.signers.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Icon name="checkCircle" size={12} style={{ color: 'var(--sign-green)', flexShrink: 0 }} />
                <span><strong>{s.name}</strong> · {s.email}</span>
                {s.signed_at && <span style={{ marginLeft: 'auto', color: 'var(--ink3)' }}>{new Date(s.signed_at).toLocaleString()}</span>}
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--sign-green-l)', borderRadius: 7, fontSize: 11.5, color: 'var(--sign-green)' }}>
              Verify this document at: <strong>{stamp.verify_url}</strong>
            </div>
          </div>
        )}

        <a href={`${BASE_URL}/v1/sign/public/${token}/download`} download
          style={{ display: 'block', textAlign: 'center', width: '100%', padding: '12px', borderRadius: 10, background: 'var(--sign-green-l)', color: 'var(--sign-green)', border: '1.5px solid var(--sign-green)', cursor: 'pointer', fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
          Download your signed copy
        </a>
        <Button variant="default" onClick={() => window.close()}
          style={{ width: '100%', background: accent, color: accentFg }}>
          Close Window
        </Button>
      </div>
    </div>
  );

  if (!data) return null;

  // A signer revisiting their own link after already completing it — the
  // backend deliberately sends only { already_completed, envelope } at that
  // point (nothing left to review/sign), and this page used to never check
  // for it at all, so it fell straight into the normal signing render and
  // crashed on data.fields being undefined. Real fix, not a guess: give
  // them the same confirmation + a real (download-attributed, so the
  // platform's in-app-browser link interceptor leaves it alone) link to
  // their signed copy, rather than a broken page.
  if (data.already_completed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font)', padding: 32 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, padding: 40, maxWidth: 480, width: '100%', boxShadow: 'var(--elev-lg)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--sign-green-l)', border: '2px solid var(--sign-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Icon name="checkCircle" size={32} style={{ color: 'var(--sign-green)' }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: 'var(--ink)' }}>Already Signed</h1>
        <p style={{ color: 'var(--ink3)', fontSize: 14, margin: '0 0 4px' }}><strong>{data.envelope.title}</strong> has already been completed.</p>
        {data.envelope.verification_code && (
          <p style={{ fontFamily: 'Courier New, monospace', fontSize: 13, color: 'var(--sign-green)', fontWeight: 700, letterSpacing: '0.06em', margin: '8px 0 20px' }}>
            {data.envelope.verification_code}
          </p>
        )}
        <a href={`${BASE_URL}/v1/sign/public/${token}/download`} download
          style={{ display: 'block', textAlign: 'center', width: '100%', padding: '12px', borderRadius: 10, background: 'var(--sign-green-l)', color: 'var(--sign-green)', border: '1.5px solid var(--sign-green)', cursor: 'pointer', fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
          Download your signed copy
        </a>
        {data.envelope.verification_code && (
          <a href={`/sign/verify/${data.envelope.verification_code}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
            View full verification details
          </a>
        )}
      </div>
    </div>
  );

  // A document sent with "Require SMS verification" cannot be reviewed or
  // signed until the recipient proves they hold the phone on file — this
  // gate replaces the whole signing UI, the same way the loading/error/
  // done states above do, rather than just disabling the Sign button
  // (which would still let someone read a confidential document's content).
  if (data.envelope.require_otp && !otpVerified) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font)', padding: 24 }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 36, maxWidth: 420, width: '100%', boxShadow: 'var(--elev-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="lock" size={26} style={{ color: accent }} />
            </div>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: 'var(--ink)' }}>SMS verification required</h2>
          <p style={{ color: 'var(--ink3)', fontSize: 13.5, textAlign: 'center', margin: '0 0 22px' }}>
            {data.envelope.title} requires you to confirm your identity by text before you can review or sign it.
          </p>

          {!otpSentTo ? (
            <Button variant="default" onClick={handleRequestOtp} disabled={otpRequesting}
              style={{ width: '100%', background: accent, color: accentFg }}>
              {otpRequesting ? 'Sending code…' : data.recipient.phone_masked ? `Send code to ${data.recipient.phone_masked}` : 'Send verification code'}
            </Button>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--sign-green)', textAlign: 'center', margin: '0 0 14px' }}>
                Code sent to {otpSentTo}
              </p>
              <input
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') handleVerifyOtp(); }}
                placeholder="6-digit code"
                inputMode="numeric"
                style={{ width: '100%', padding: '11px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', boxSizing: 'border-box', marginBottom: 12 }}
              />
              <Button variant="default" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
                style={{ width: '100%', marginBottom: 10, ...(otpCode.length === 6 ? { background: accent, color: accentFg } : {}) }}>
                {otpVerifying ? 'Verifying…' : 'Verify code'}
              </Button>
              <Button variant="ghost" onClick={handleRequestOtp} disabled={otpRequesting} style={{ width: '100%' }}>
                Resend code
              </Button>
            </>
          )}

          {otpError && <p style={{ color: 'var(--sign-red)', fontSize: 12.5, textAlign: 'center', marginTop: 12 }}>{otpError}</p>}
        </div>
      </div>
    );
  }

  const requiredFields = data.fields.filter(f => f.required);

  return (
    <div className="sign-public-layout">
      {/* Header */}
      <div className="sign-public-header">
        {data.tenant.logo_url && (
          <img src={data.tenant.logo_url} alt="" style={{ height: 28, maxWidth: 120, objectFit: 'contain' }} />
        )}
        <div style={{ fontWeight: 800, fontSize: 16, color: accent, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="edit" size={16} /> Hudumika eSign</div>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{data.envelope.title}</span>
          {data.recipient.role_label && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 99 }}>{data.recipient.role_label}</span>}
        </div>
        <Button variant="outline" size="sm" onClick={handleDecline} disabled={declining}
          style={{ borderColor: 'var(--sign-red)', color: 'var(--sign-red)' }}>
          {declining ? 'Declining…' : 'Decline'}
        </Button>
      </div>

      <div className="sign-public-body">
        {/* Document area */}
        <div className="sign-public-doc-area">
          {data.envelope.message && (
            <div style={{ width: '100%', maxWidth: 700, background: 'var(--card-bg)', borderRadius: 10, padding: '14px 18px', border: '1px solid var(--border)', fontSize: 13.5, color: 'var(--ink2)', fontStyle: 'italic', marginBottom: 16 }}>
              "{data.envelope.message}"
            </div>
          )}

          {/* A4 document page — literal white paper (document content, not
              app chrome), same reasoning as .sign-page-canvas-wrap in
              Sign.css: it stays white in both themes because it's simulating
              the actual printed page, not a themed surface. */}
          <div style={{ background: '#fff', borderRadius: 4, boxShadow: 'var(--elev-lg)', width: '100%', maxWidth: 700, minHeight: 990, position: 'relative', overflow: 'hidden' }}>
            {data.envelope.document_data ? (
              <img src={data.envelope.document_data} alt="document" style={{ width: '100%', display: 'block' }} />
            ) : (
              <div style={{ padding: '48px 56px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{data.envelope.title}</h2>
                {Array.from({ length: 28 }).map((_, i) => (
                  <div key={i} style={{ height: 2, background: '#f3f4f6', borderRadius: 1, width: i % 7 === 0 ? '70%' : i % 3 === 0 ? '85%' : '97%' }} />
                ))}
              </div>
            )}

            {/* Signature field overlays on document */}
            {data.fields.map(field => {
              const isStamp = field.field_type === 'stamp';
              const isCheckbox = field.field_type === 'checkbox';
              const isFilled =
                fieldValues[field.id] ||
                (isStamp && (data.envelope.tenant_stamp_image || signature)) ||
                ((field.field_type === 'signature' || field.field_type === 'initials') && signature);

              return (
                <div key={field.id}
                  style={{
                    position: 'absolute',
                    left: `${field.x * 100}%`, top: `${field.y * 100}%`,
                    width: `${field.width * 100}%`, height: `${field.height * 100}%`,
                    border: isFilled ? (isStamp ? '3px double #0e9f6e' : '2px solid #0e9f6e') : `2px dashed ${accent}`,
                    background: isFilled ? 'rgba(14,159,110,0.08)' : 'rgba(26,86,219,0.08)',
                    borderRadius: isStamp ? '50%' : 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                  onClick={() => {
                    const reqIdx = requiredFields.findIndex(rf => rf.id === field.id);
                    if (reqIdx !== -1) setCurrentField(reqIdx);
                  }}>
                  {field.field_type === 'stamp' ? (
                    data.envelope.tenant_stamp_image ? (
                      <img src={data.envelope.tenant_stamp_image} alt="Verification stamp" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                    ) : signature ? (
                      <div style={{
                        width: '100%', height: '100%', borderRadius: '50%',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'monospace', fontWeight: 800, color: '#0e9f6e',
                        transform: 'rotate(-4deg)', background: 'rgba(255, 255, 255, 0.95)',
                        padding: '4px 6px', boxSizing: 'border-box', textAlign: 'center', lineHeight: 1.1,
                      }}>
                        <div style={{ fontSize: 5.5, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>HUDUMIKA SECURED</div>
                        <div style={{ fontSize: 13, margin: '1px 0', display: 'flex', justifyContent: 'center' }}><Icon name="lock" size={10} /></div>
                        <div style={{ fontSize: 6.5, fontWeight: 900 }}>{data.envelope.verification_code ?? 'HSGN-UNKNOWN'}</div>
                        <div style={{ fontSize: 5, color: '#6b7280' }}>{new Date().toLocaleDateString()}</div>
                      </div>
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', borderRadius: '50%',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'monospace', fontSize: 8, fontWeight: 700, color: accent, textAlign: 'center',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="stamp" size={8} /> STAMP</div>
                        <div style={{ fontSize: 6, opacity: 0.7 }}>Click to Sign</div>
                      </div>
                    )
                  ) : (field.field_type === 'signature' || field.field_type === 'initials') && signature ? (
                    <img src={signature} alt="sig" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                  ) : isCheckbox ? (
                    fieldValues[field.id] === 'true' ? (
                      <Icon name="check" size={14} style={{ color: '#0e9f6e', fontWeight: 900 }} />
                    ) : (
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>[ ]</span>
                    )
                  ) : (field.field_type === 'text' || field.field_type === 'date') && fieldValues[field.id] ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#111827', width: '100%', textAlign: 'center', padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fieldValues[field.id]}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: accent, textAlign: 'center', padding: '2px 4px' }}>
                      {field.placeholder ?? field.field_type}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="sign-public-sidebar">
          <div className="sign-public-sidebar-header">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 6 }}>Signing As</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{data.recipient.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{data.recipient.email}</div>
            {data.recipient.role_label && <div style={{ fontSize: 11.5, color: accent, fontWeight: 600, marginTop: 4 }}>{data.recipient.role_label}</div>}
          </div>

          <div className="sign-public-sidebar-body">
            {/* Progress */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>Signing Progress</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {requiredFields.map((f, i) => {
                  const isDone = !!(
                    fieldValues[f.id] ||
                    (f.field_type === 'signature' && signature) ||
                    (f.field_type === 'stamp' && (data.envelope.tenant_stamp_image || signature))
                  );
                  return (
                    <div key={f.id} style={{ width: 28, height: 28, borderRadius: 6, background: isDone ? 'var(--sign-green)' : i === currentField ? accent : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: isDone ? '#fff' : i === currentField ? accentFg : 'var(--ink3)', fontWeight: 700 }} title={f.field_type}>
                      {isDone ? <Icon name="check" size={12} /> : i + 1}
                    </div>
                  );
                })}
                {requiredFields.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No required fields</div>}
              </div>
            </div>

            {/* Signature capture */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10, color: 'var(--ink)' }}>Your Signature</div>
              {signature ? (
                <div style={{ border: '1.5px solid var(--sign-green)', borderRadius: 8, padding: 8, background: 'var(--sign-green-l)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <img src={signature} alt="signature" style={{ width: '100%', height: 60, objectFit: 'contain', background: '#fff', borderRadius: 4 }} />
                  {data.recipient.saved_signature === signature && (
                    <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="checkCircle" size={11} style={{ color: 'var(--sign-green)' }} /> Using your saved signature from your profile
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSignature(null)}>Change</Button>
                </div>
              ) : (
                <SignaturePad onCapture={setSignature} />
              )}
            </div>

            {/* When this recipient is cleared to apply the tenant's real
                stamp, say so plainly — the on-document preview already
                shows the actual image, this just explains why there's
                nothing to draw for it. */}
            {data.envelope.tenant_stamp_image && data.fields.some(f => f.field_type === 'stamp') && (
              <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'flex-start', gap: 6, background: 'var(--sign-green-l)', border: '1px solid var(--sign-green)', borderRadius: 8, padding: '8px 10px' }}>
                <Icon name="stamp" size={13} style={{ color: 'var(--sign-green)', flexShrink: 0, marginTop: 1 }} />
                <span>Your organization's verification stamp will be applied automatically — configured in Settings.</span>
              </div>
            )}

            {/* Text fields — stamp is excluded too: it's never manually
                typed, it's either the tenant's real stamp (auto-applied for
                an authorized colleague) or falls back to the drawn
                signature above, same as signature/initials. */}
            {data.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'initials' && f.field_type !== 'stamp').map(field => (
              <div key={field.id}>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--ink)' }}>
                  {field.placeholder ?? field.field_type} {field.required && <span style={{ color: 'var(--sign-red)' }}>*</span>}
                </label>
                {field.field_type === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!fieldValues[field.id]}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : '' }))} />
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{field.placeholder ?? 'I agree'}</span>
                  </label>
                ) : field.field_type === 'date' ? (
                  <input type="date" value={fieldValues[field.id] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
                ) : (
                  <input value={fieldValues[field.id] ?? ''} placeholder={field.placeholder ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
          </div>

          <div className="sign-public-sidebar-footer">
            <Button variant="outline" onClick={handleDecline} disabled={declining} style={{ flex: 1 }}>
              Decline
            </Button>
            <Button variant="default" onClick={handleSubmit} disabled={!signature || submitting}
              style={{ flex: 2, ...(signature ? { background: accent, color: accentFg } : {}) }}>
              <Icon name="edit" size={14} />
              {submitting ? 'Submitting…' : 'Sign & Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
