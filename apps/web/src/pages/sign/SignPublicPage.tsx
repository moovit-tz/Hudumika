// ─── SignPublicPage.tsx — Public signing experience (no auth required) ────────
// Accessed via /sign/public/:token
// Shows the document, guides the signer through each required field,
// lets them draw/type/upload their signature, then submits.
// On completion shows the DocuSign-style stamp with verification code.

import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { BASE_URL } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SignaturePad } from '../../components/SignaturePad.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { pickForegroundHsl } from '../../lib/color.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';
import { Tip } from '../../components/ui/tooltip.js';
import { usePdfDocument } from '../cloud/lib/usePdfDocument.js';
import { PdfPageCanvas } from '../cloud/components/PdfPageCanvas.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import '../sign/Sign.css';

const A4_ASPECT = 1.414; // height/width ratio of A4 — same fallback SignEditor.tsx uses

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
  // No CompanyAvatar here — this strip is a wide wordmark-shaped logo
  // (height:34, contain-fit) with a specific branded "eSign" fallback, not
  // a square/circle "who" badge, and there's no tenant name in this public
  // payload for CompanyAvatar's own initials fallback to use. A broken
  // logo_url used to render nothing but a broken-image icon; this makes it
  // degrade to the same eSign wordmark the no-logo case already shows.
  const [logoFailed, setLogoFailed] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [currentField, setCurrentField] = useState(0);
  const [step, setStep] = useState<'review' | 'sign' | 'done'>('review');
  const [stamp, setStamp] = useState<StampPayload | null>(null);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'doc' | 'panel'>('doc');
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);

  // ── SMS verification gate (only relevant when envelope.require_otp) ────────
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp' | null>(null);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // ── Real PDF rendering (pdf.js via canvas) ──────────────────────────────────
  // document_data is the raw uploaded file's own data URI — for a PDF (the
  // overwhelming majority of what gets signed) that's `data:application/pdf;
  // base64,...`, which an <img> tag cannot render at all (browsers don't
  // rasterize PDFs via <img src>) — the document silently showed as blank
  // white space with only the field overlays visible, which is exactly what
  // it looked like. SignEditor.tsx (the sender's own editor) and SignInbox.tsx
  // (the sender's envelope detail view) both already solve this the same way
  // — real per-page canvas render via usePdfDocument/PdfPageCanvas — this
  // mirrors that same proven pattern rather than inventing a third approach.
  const isPdf = !!(data && !data.already_completed && data.envelope.file_name?.toLowerCase().endsWith('.pdf'));
  const pdfSource = isPdf && data && !data.already_completed ? data.envelope.document_data : null;
  const { doc: pdfDoc, numPages: pdfNumPages, loading: pdfLoading, error: pdfError } = usePdfDocument(pdfSource);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  useEffect(() => { setCurrentPdfPage(1); }, [pdfDoc]);
  const [naturalPageSize, setNaturalPageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!pdfDoc) { setNaturalPageSize(null); return; }
    let cancelled = false;
    pdfDoc.getPage(1).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setNaturalPageSize({ width: vp.width, height: vp.height });
    });
    return () => { cancelled = true; };
  }, [pdfDoc]);
  // The document should fill the available column, not sit in a fixed
  // 700px box with empty grey margins either side of it — measures the
  // real doc-area container (same callback-ref + ResizeObserver pattern
  // SignInbox.tsx's own envelope-detail preview already proved out) and
  // caps generously rather than the narrow 800px a split-panel editor uses,
  // since this page's document column is the primary, near-full-width thing
  // on screen.
  const [docPaneW, setDocPaneW] = useState(700);
  const docPaneRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setDocPaneW(Math.min(1000, Math.max(320, node.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const docPaneH = Math.round(docPaneW * (naturalPageSize ? naturalPageSize.height / naturalPageSize.width : A4_ASPECT));
  const pdfRenderScale = naturalPageSize ? docPaneW / naturalPageSize.width : 1;

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

  async function handleRequestOtp(channel: 'sms' | 'whatsapp') {
    setOtpRequesting(true);
    setOtpError(null);
    try {
      const res = await fetch(`${BASE_URL}/v1/sign/public/${token}/request-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Could not send verification code');
      setOtpChannel(channel);
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
      showAlert(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!(await showConfirm('The sender will be notified, and this document will stop for everyone else on it too.', { title: 'Decline to sign this document?', confirmLabel: 'Decline' }))) return;
    const reason = await showPrompt('', { title: 'Reason for declining (optional)', placeholder: 'Let the sender know why' }) ?? '';
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* Public Branded Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', height: 60, display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentFg }}>
            <Icon name="edit" size={16} />
          </div>
          <span>eSign</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '32px', maxWidth: 520, width: '100%', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#ecfdf5', border: '1px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Icon name="checkCircle" size={24} style={{ color: '#10b981' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>Document Signed</h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Your signature has been securely recorded and legally timestamped.</p>
          </div>

          {stamp && (
            <div style={{ background: '#ecfdf5', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="lock" size={11} /> Verification Stamp</div>
              <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#10b981', letterSpacing: '0.08em', marginBottom: 10 }}>{stamp.verification_code}</div>
              <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 4 }}>Document: <strong>{stamp.title}</strong></div>
              <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 10 }}>Completed: <strong>{new Date(stamp.completed_at).toLocaleString()}</strong></div>
              {stamp.signers.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <Icon name="checkCircle" size={12} style={{ color: '#10b981', flexShrink: 0 }} />
                  <span><strong>{s.name}</strong> ({s.email})</span>
                  {s.signed_at && <span style={{ marginLeft: 'auto', color: '#6b7280' }}>{new Date(s.signed_at).toLocaleDateString()}</span>}
                </div>
              ))}
            </div>
          )}

          <a href={`${BASE_URL}/v1/sign/public/${token}/download`} download
            style={{ display: 'block', textAlign: 'center', width: '100%', padding: '10px 16px', borderRadius: 6, background: accent, color: accentFg, fontSize: 13.5, fontWeight: 600, textDecoration: 'none', marginBottom: 12, boxSizing: 'border-box' }}>
            Download Signed PDF
          </a>
          <Button variant="outline" onClick={() => window.close()}
            style={{ width: '100%', height: 38, fontSize: 13, fontWeight: 600 }}>
            Close Window
          </Button>
        </div>
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
          <h2 style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: 'var(--ink)' }}>OTP / WhatsApp verification required</h2>
          <p style={{ color: 'var(--ink3)', fontSize: 13.5, textAlign: 'center', margin: '0 0 22px' }}>
            {data.envelope.title} requires you to confirm your identity before you can review or sign it. Choose how to receive your code.
          </p>

          {!otpSentTo ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="outline" onClick={() => handleRequestOtp('sms')} disabled={otpRequesting}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="messageSquare" size={15} />
                {otpRequesting ? 'Sending…' : 'SMS'}
              </Button>
              <Button variant="default" onClick={() => handleRequestOtp('whatsapp')} disabled={otpRequesting}
                style={{ flex: 1, background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="messageSquare" size={15} color="#fff" />
                {otpRequesting ? 'Sending…' : 'WhatsApp'}
              </Button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--sign-green)', textAlign: 'center', margin: '0 0 14px' }}>
                Code sent via {otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to {otpSentTo}
              </p>
              <input
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') handleVerifyOtp(); }}
                placeholder="6-digit code"
                inputMode="numeric"
                style={{ width: '100%', padding: '11px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', boxSizing: 'border-box', marginBottom: 12 }}
              />
              <Button variant="default" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
                style={{ width: '100%', marginBottom: 10, ...(otpCode.length === 6 ? { background: accent, color: accentFg } : {}) }}>
                {otpVerifying ? 'Verifying…' : 'Verify code'}
              </Button>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => handleRequestOtp('sms')} disabled={otpRequesting} style={{ flex: 1, fontSize: 12.5 }}>
                  Resend via SMS
                </Button>
                <Button variant="ghost" onClick={() => handleRequestOtp('whatsapp')} disabled={otpRequesting} style={{ flex: 1, fontSize: 12.5 }}>
                  Resend via WhatsApp
                </Button>
              </div>
            </>
          )}

          {otpError && <p style={{ color: 'var(--sign-red)', fontSize: 12.5, textAlign: 'center', marginTop: 12 }}>{otpError}</p>}
        </div>
      </div>
    );
  }

  const requiredFields = data.fields.filter(f => f.required);
  const completedCount = requiredFields.filter(f => {
    const isStamp = f.field_type === 'stamp';
    return (
      fieldValues[f.id] ||
      (isStamp && (data.envelope.tenant_stamp_image || signature)) ||
      ((f.field_type === 'signature' || f.field_type === 'initials') && signature)
    );
  }).length;

  return (
    <div className="sign-public-layout">
      {/* Header */}
      <div className="sign-public-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {data.tenant.logo_url && !logoFailed ? (
            <img src={data.tenant.logo_url} alt="" onError={() => setLogoFailed(true)} style={{ height: 34, maxWidth: 150, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontWeight: 800, fontSize: 18, color: accent, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentFg, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                <Icon name="edit" size={17} />
              </div>
              <span style={{ letterSpacing: '-0.02em' }}>eSign</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.envelope.title}
          </span>
          {data.recipient.role_label && (
            <span style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', padding: '3px 10px', borderRadius: 14, fontWeight: 600, flexShrink: 0 }}>
              {data.recipient.role_label}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 20, fontWeight: 500 }}>
            <Icon name="lock" size={13} color="var(--teal)" />
            <span>256-bit SSL Encrypted</span>
          </div>

          <Button variant="outline" size="sm" onClick={handleDecline} disabled={declining}
            style={{ borderColor: 'var(--sign-red-l)', color: 'var(--sign-red)', height: 38, fontSize: 13, padding: '0 16px', fontWeight: 600 }}>
            {declining ? 'Declining…' : 'Decline'}
          </Button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      {isMobile && (
        <Tabs value={mobileTab} onValueChange={v => setMobileTab(v as typeof mobileTab)} variant="segmented">
          <TabsList style={{ width: '100%' }}>
            <TabsTrigger value="doc" style={{ flex: 1 }}>
              <Icon name="fileText" size={14} /> Document View
            </TabsTrigger>
            <TabsTrigger value="panel" style={{ flex: 1 }}>
              <Icon name="edit" size={14} /> Sign &amp; Submit ({completedCount}/{requiredFields.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="sign-public-body">
        {/* Document area */}
        <div className="sign-public-doc-area" style={{ display: isMobile && mobileTab !== 'doc' ? 'none' : 'flex' }}>
          {data.envelope.message && (
            <div style={{ width: '100%', maxWidth: docPaneW, background: 'var(--card-bg)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)', fontSize: 13, color: 'var(--ink2)', marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <Icon name="mail" size={16} color="var(--teal)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 2 }}>Note from sender</div>
                <div style={{ fontStyle: 'italic' }}>"{data.envelope.message}"</div>
              </div>
            </div>
          )}

          <div ref={docPaneRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            {/* Dark document control bar */}
            {data.envelope.file_name && (
              <div style={{
                width: '100%', maxWidth: docPaneW, background: '#0f172a', borderRadius: '10px 10px 0 0',
                padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, boxSizing: 'border-box',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Icon name="fileText" size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {data.envelope.file_name}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, background: '#1e293b', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0 }}>
                    {data.envelope.file_name.split('.').pop() || 'PDF'}
                  </span>
                </div>
                {isPdf && pdfNumPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                    <button onClick={() => setCurrentPdfPage(p => Math.max(1, p - 1))} disabled={currentPdfPage <= 1}
                      style={{ background: 'none', border: 'none', cursor: currentPdfPage <= 1 ? 'default' : 'pointer', opacity: currentPdfPage <= 1 ? 0.3 : 1, display: 'flex', padding: 2 }}>
                      <Icon name="chevronLeft" size={14} color="#f8fafc" />
                    </button>
                    <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                      {currentPdfPage} / {pdfNumPages}
                    </span>
                    <button onClick={() => setCurrentPdfPage(p => Math.min(pdfNumPages, p + 1))} disabled={currentPdfPage >= pdfNumPages}
                      style={{ background: 'none', border: 'none', cursor: currentPdfPage >= pdfNumPages ? 'default' : 'pointer', opacity: currentPdfPage >= pdfNumPages ? 0.4 : 1, display: 'flex', padding: 2 }}>
                      <Icon name="chevronRight" size={14} color="#f8fafc" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* A4 document page */}
            <div style={{
              background: '#fff', borderRadius: data.envelope.file_name ? '0 0 8px 8px' : 8, boxShadow: 'var(--elev-lg)',
              width: docPaneW, height: isPdf ? docPaneH : undefined, minHeight: isPdf ? undefined : 500,
              maxWidth: '100%', position: 'relative', overflow: 'hidden', border: '1px solid var(--border)',
            }}>
              {isPdf ? (
                pdfLoading || !pdfDoc ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#9ca3af', fontSize: 13 }}>
                    {pdfError ? "Couldn't load this document" : (
                      <>
                        <Icon name="clock" size={22} style={{ animation: 'ds-spin 2s linear infinite', color: accent }} />
                        Loading document…
                      </>
                    )}
                  </div>
                ) : (
                  <PdfPageCanvas doc={pdfDoc} pageNumber={currentPdfPage} scale={pdfRenderScale} style={{ display: 'block' }} />
                )
              ) : data.envelope.document_data ? (
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
              {data.fields.filter(field => (field.page || 1) === currentPdfPage).map(field => {
                const isStamp = field.field_type === 'stamp';
                const isCheckbox = field.field_type === 'checkbox';
                const isFilled = !!(
                  fieldValues[field.id] ||
                  (isStamp && (data.envelope.tenant_stamp_image || signature)) ||
                  ((field.field_type === 'signature' || field.field_type === 'initials') && signature)
                );

                return (
                  <div key={field.id}
                    style={{
                      position: 'absolute',
                      left: `${field.x * 100}%`, top: `${field.y * 100}%`,
                      width: `${field.width * 100}%`, height: `${field.height * 100}%`,
                      border: isFilled ? (isStamp ? '3px double #10b981' : '2px solid #10b981') : `2px dashed ${accent}`,
                      background: isFilled ? 'rgba(16,185,129,0.1)' : 'rgba(13,148,136,0.1)',
                      borderRadius: isStamp ? '50%' : 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      boxShadow: isFilled ? '0 0 0 1px #10b981' : '0 0 0 2px rgba(13,148,136,0.2)',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => {
                      const reqIdx = requiredFields.findIndex(rf => rf.id === field.id);
                      if (reqIdx !== -1) setCurrentField(reqIdx);
                      if (isMobile) setMobileTab('panel');
                    }}>
                    {field.field_type === 'stamp' ? (
                      data.envelope.tenant_stamp_image ? (
                        <img src={data.envelope.tenant_stamp_image} alt="Verification stamp" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                      ) : signature ? (
                        <div style={{
                          width: '100%', height: '100%', borderRadius: '50%',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'monospace', fontWeight: 800, color: '#10b981',
                          transform: 'rotate(-4deg)', background: 'rgba(255, 255, 255, 0.95)',
                          padding: '4px 6px', boxSizing: 'border-box', textAlign: 'center', lineHeight: 1.1,
                        }}>
                          <div style={{ fontSize: 5.5, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>HUDUMIKA SECURED</div>
                          <div style={{ fontSize: 13, margin: '1px 0', display: 'flex', justifyContent: 'center' }}><Icon name="lock" size={10} /></div>
                          <div style={{ fontSize: 6.5, fontWeight: 900 }}>{data.envelope.verification_code ?? 'HSGN-VERIFIED'}</div>
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
                        <Icon name="check" size={14} style={{ color: '#10b981', fontWeight: 900 }} />
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
        </div>

        {/* Sidebar */}
        <div className="sign-public-sidebar" style={{ display: isMobile && mobileTab !== 'panel' ? 'none' : 'flex' }}>
          <div className="sign-public-sidebar-header">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 6 }}>Signing Identity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--teal)', fontSize: 14 }}>
                {data.recipient.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.recipient.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.recipient.email}</div>
              </div>
            </div>
          </div>

          <div className="sign-public-sidebar-body">
            {/* Progress */}
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Required Fields</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: completedCount === requiredFields.length ? 'var(--green)' : 'var(--teal)' }}>
                  {completedCount} / {requiredFields.length} Completed
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {requiredFields.map((f, i) => {
                  const isDone = !!(
                    fieldValues[f.id] ||
                    (f.field_type === 'signature' && signature) ||
                    (f.field_type === 'stamp' && (data.envelope.tenant_stamp_image || signature))
                  );
                  return (
                    <Tip key={f.id} label={`${f.field_type.charAt(0).toUpperCase() + f.field_type.slice(1).replace('_', ' ')} (Page ${f.page || 1})`}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentField(i);
                          if (f.page) setCurrentPdfPage(f.page);
                        }}
                        style={{
                          width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: isDone ? 'var(--green)' : i === currentField ? accent : 'var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                          color: isDone || i === currentField ? '#fff' : 'var(--ink2)', fontWeight: 700
                        }}
                      >
                        {isDone ? <Icon name="check" size={13} /> : i + 1}
                      </button>
                    </Tip>
                  );
                })}
                {requiredFields.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No required fields</div>}
              </div>
            </div>

            {/* Signature capture */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="edit" size={14} color="var(--teal)" /> Your Signature <span style={{ color: 'var(--sign-red)' }}>*</span>
              </div>
              {signature ? (
                <div style={{ border: '1.5px solid var(--green)', borderRadius: 8, padding: 10, background: 'var(--green-l)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <img src={signature} alt="signature" style={{ width: '100%', height: 64, objectFit: 'contain', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }} />
                  {data.recipient.saved_signature === signature && (
                    <div style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                      <Icon name="checkCircle" size={12} color="var(--green)" /> Pre-filled from your profile signature
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSignature(null)} style={{ fontSize: 12, height: 30 }}>Change Signature</Button>
                </div>
              ) : (
                <SignaturePad onCapture={setSignature} />
              )}
            </div>

            {/* Stamp notice if present */}
            {data.envelope.tenant_stamp_image && data.fields.some(f => f.field_type === 'stamp') && (
              <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 8, padding: '10px 12px' }}>
                <Icon name="stamp" size={15} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 1 }} />
                <span>Your organization's verification stamp will be applied automatically on submit.</span>
              </div>
            )}

            {/* Form Fields */}
            {data.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'initials' && f.field_type !== 'stamp').map(field => (
              <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{field.placeholder ?? field.field_type.toUpperCase()}</span>
                  {field.required && <span style={{ color: 'var(--sign-red)', fontSize: 11 }}>Required</span>}
                </label>
                {field.field_type === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={!!fieldValues[field.id]}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : '' }))} style={{ accentColor: 'var(--teal)' }} />
                    <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{field.placeholder ?? 'I agree to the terms'}</span>
                  </label>
                ) : field.field_type === 'date' ? (
                  <DatePicker
                    date={parseDateOnly(fieldValues[field.id])}
                    onChange={d => setFieldValues(prev => ({ ...prev, [field.id]: toDateOnlyString(d) }))}
                    placeholder="Select date"
                    triggerClassName="w-full"
                  />
                ) : (
                  <input value={fieldValues[field.id] ?? ''} placeholder={field.placeholder ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                )}
              </div>
            ))}
          </div>

          <div className="sign-public-sidebar-footer">
            <Button variant="outline" onClick={handleDecline} disabled={declining} style={{ flex: 1, height: 38, fontSize: 13 }}>
              Decline
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!signature || submitting}
              style={{ flex: 2, height: 38, fontSize: 13, fontWeight: 700, background: signature ? accent : 'var(--border)', color: signature ? accentFg : '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="checkCircle" size={15} color={signature ? accentFg : '#fff'} />
              {submitting ? 'Submitting…' : 'Sign & Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
