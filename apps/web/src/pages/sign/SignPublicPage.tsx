// ─── SignPublicPage.tsx — Public signing experience (no auth required) ────────
// Accessed via /sign/public/:token
// Shows the document, guides the signer through each required field,
// lets them draw/type/upload their signature, then submits.
// On completion shows the DocuSign-style stamp with verification code.

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { BASE_URL } from '../../lib/api.js';
import '../sign/Sign.css';

interface PublicSigningData {
  envelope: {
    id: string; title: string; message: string | null;
    document_data: string | null; file_name: string | null;
    status: string; expires_at: string | null;
    verification_code: string | null;
    require_otp: boolean;
  };
  recipient: {
    id: string; name: string; email: string; role_label: string | null; status: string;
    phone_masked: string | null; otp_verified: boolean;
  };
  tenant: { logo_url: string | null; primary_color: string | null };
  fields: Array<{
    id: string; field_type: string; page: number;
    x: number; y: number; width: number; height: number;
    required: boolean; placeholder: string | null; value: string | null;
  }>;
  already_completed?: boolean;
}

interface StampPayload {
  verification_code: string;
  completed_at: string;
  title: string;
  signers: Array<{ name: string; email: string; signed_at: string | null }>;
  verify_url: string;
}

type SignMode = 'draw' | 'type' | 'upload';

function SignatureCanvas({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<SignMode>('draw');
  const [typedName, setTypedName] = useState('');
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const client = 'touches' in e ? e.touches[0] : e;
    return {
      x: (client.clientX - rect.left) * (canvas.width / rect.width),
      y: (client.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (mode !== 'draw') return;
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || mode !== 'draw') return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawn(true);
  }

  function stopDraw() { setIsDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function renderTyped() {
    if (!typedName.trim()) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'italic 48px Georgia, serif';
    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
    setHasDrawn(true);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      setHasDrawn(true);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  }

  function capture() {
    const canvas = canvasRef.current!;
    onCapture(canvas.toDataURL('image/png'));
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {/* Mode tabs */}
      <div style={{ display: 'flex', marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {(['draw', 'type', 'upload'] as SignMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); clearCanvas(); }}
            style={{ flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: mode === m ? 'var(--teal)' : 'var(--bg)', color: mode === m ? '#fff' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Icon name={m === 'draw' ? 'edit' : m === 'type' ? 'fileText' : 'upload'} size={13} />
            {m === 'draw' ? 'Draw' : m === 'type' ? 'Type' : 'Upload'}
          </button>
        ))}
      </div>

      {mode === 'type' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={typedName} onChange={e => setTypedName(e.target.value)}
            placeholder="Type your full name…"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 14 }} />
          <button onClick={renderTyped} style={{ padding: '9px 14px', borderRadius: 7, background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>Preview</button>
        </div>
      )}

      <div className="sign-canvas-wrap" style={{ height: 140, position: 'relative' }}>
        <canvas ref={canvasRef} width={520} height={140}
          style={{ display: 'block', width: '100%', height: 140, touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
        {!hasDrawn && mode === 'draw' && (
          <div className="sign-canvas-placeholder">Sign here with your mouse or finger</div>
        )}
        {!hasDrawn && mode === 'upload' && (
          <div onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                const img = new Image();
                img.onload = () => {
                  const canvas = canvasRef.current!;
                  const ctx = canvas.getContext('2d')!;
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                  const w = img.width * scale, h = img.height * scale;
                  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                  setHasDrawn(true);
                };
                img.src = URL.createObjectURL(file);
              }
            }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', cursor: 'pointer', gap: 6, border: '1.5px dashed var(--border)', borderRadius: 8 }}>
            <Icon name="upload" size={24} style={{ color: 'var(--sign-blue)', opacity: 0.7 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sign-blue)' }}>Upload signature image</span>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Click to browse or drag & drop</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <button onClick={clearCanvas} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', fontSize: 12.5 }}>Clear</button>
        {mode === 'upload' && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 12.5 }}>Choose Image…</button>
          </>
        )}
        <button onClick={capture} disabled={!hasDrawn}
          style={{ padding: '7px 18px', borderRadius: 7, background: hasDrawn ? 'var(--sign-blue)' : '#e5e7eb', color: hasDrawn ? '#fff' : '#9ca3af', border: 'none', cursor: hasDrawn ? 'pointer' : 'default', fontSize: 12.5, fontWeight: 600 }}>
          Use This Signature →
        </button>
      </div>
    </div>
  );
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
  const accent = data?.tenant?.primary_color || '#1a56db';

  useEffect(() => {
    fetch(`${BASE_URL}/v1/sign/public/${token}`)
      .then(r => { if (!r.ok) throw new Error('Signing link not found'); return r.json(); })
      .then((d: PublicSigningData) => { setData(d); setOtpVerified(!!d.recipient?.otp_verified); })
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name="edit" size={36} style={{ opacity: 0.4 }} />
        </div>
        <div style={{ fontSize: 16 }}>Loading signing request…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 400, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name="alertCircle" size={48} style={{ color: '#e02424' }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Unable to load document</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>{error}</p>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, ${accent} 100%)`, fontFamily: 'Inter, sans-serif', padding: 32 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 40, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #0e9f6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="checkCircle" size={32} style={{ color: '#0e9f6e' }} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Document Signed!</h1>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Your signature has been securely recorded and legally timestamped.</p>
        </div>

        {stamp && (
          <div style={{ background: '#f0fdf4', border: '2px solid #0e9f6e', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0e9f6e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="lock" size={11} /> Hudumika eSign Stamp</div>
            <div style={{ fontFamily: 'Courier New, monospace', fontSize: 18, fontWeight: 700, color: '#0e9f6e', letterSpacing: '0.1em', marginBottom: 10 }}>{stamp.verification_code}</div>
            <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 4 }}>Document: <strong>{stamp.title}</strong></div>
            <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 10 }}>Completed: <strong>{new Date(stamp.completed_at).toLocaleString()}</strong></div>
            {stamp.signers.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Icon name="checkCircle" size={12} style={{ color: '#0e9f6e', flexShrink: 0 }} />
                <span><strong>{s.name}</strong> · {s.email}</span>
                {s.signed_at && <span style={{ marginLeft: 'auto', color: '#6b7280' }}>{new Date(s.signed_at).toLocaleString()}</span>}
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(14,159,110,0.1)', borderRadius: 7, fontSize: 11.5, color: '#0e9f6e' }}>
              Verify this document at: <strong>{stamp.verify_url}</strong>
            </div>
          </div>
        )}

        <a href={`${BASE_URL}/v1/sign/public/${token}/download`}
          style={{ display: 'block', textAlign: 'center', width: '100%', padding: '12px', borderRadius: 10, background: '#f0fdf4', color: '#0e9f6e', border: '1.5px solid #0e9f6e', cursor: 'pointer', fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
          Download your signed copy
        </a>
        <button onClick={() => window.close()}
          style={{ width: '100%', padding: '12px', borderRadius: 10, background: accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
          Close Window
        </button>
      </div>
    </div>
  );

  if (!data) return null;

  // A document sent with "Require SMS verification" cannot be reviewed or
  // signed until the recipient proves they hold the phone on file — this
  // gate replaces the whole signing UI, the same way the loading/error/
  // done states above do, rather than just disabling the Sign button
  // (which would still let someone read a confidential document's content).
  if (data.envelope.require_otp && !otpVerified) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 36, maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="lock" size={26} style={{ color: accent }} />
            </div>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>SMS verification required</h2>
          <p style={{ color: '#6b7280', fontSize: 13.5, textAlign: 'center', margin: '0 0 22px' }}>
            {data.envelope.title} requires you to confirm your identity by text before you can review or sign it.
          </p>

          {!otpSentTo ? (
            <button onClick={handleRequestOtp} disabled={otpRequesting}
              style={{ width: '100%', padding: '11px', borderRadius: 9, background: accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {otpRequesting ? 'Sending code…' : data.recipient.phone_masked ? `Send code to ${data.recipient.phone_masked}` : 'Send verification code'}
            </button>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: '#0e9f6e', textAlign: 'center', margin: '0 0 14px' }}>
                Code sent to {otpSentTo}
              </p>
              <input
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') handleVerifyOtp(); }}
                placeholder="6-digit code"
                inputMode="numeric"
                style={{ width: '100%', padding: '11px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', boxSizing: 'border-box', marginBottom: 12 }}
              />
              <button onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
                style={{ width: '100%', padding: '11px', borderRadius: 9, background: otpCode.length === 6 ? accent : '#e5e7eb', color: otpCode.length === 6 ? '#fff' : '#9ca3af', border: 'none', cursor: otpCode.length === 6 ? 'pointer' : 'default', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                {otpVerifying ? 'Verifying…' : 'Verify code'}
              </button>
              <button onClick={handleRequestOtp} disabled={otpRequesting}
                style={{ width: '100%', padding: '8px', borderRadius: 9, background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: 12.5 }}>
                Resend code
              </button>
            </>
          )}

          {otpError && <p style={{ color: '#e02424', fontSize: 12.5, textAlign: 'center', marginTop: 12 }}>{otpError}</p>}
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>{data.envelope.title}</span>
          {data.recipient.role_label && <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 99 }}>{data.recipient.role_label}</span>}
        </div>
        <button onClick={handleDecline} disabled={declining}
          style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e02424', color: '#e02424', background: 'transparent', cursor: 'pointer', fontSize: 12.5 }}>
          {declining ? 'Declining…' : 'Decline'}
        </button>
      </div>

      <div className="sign-public-body">
        {/* Document area */}
        <div className="sign-public-doc-area">
          {data.envelope.message && (
            <div style={{ width: '100%', maxWidth: 700, background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #e5e7eb', fontSize: 13.5, color: '#374151', fontStyle: 'italic', marginBottom: 16 }}>
              "{data.envelope.message}"
            </div>
          )}

          {/* A4 document page */}
          <div style={{ background: '#fff', borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.16)', width: '100%', maxWidth: 700, minHeight: 990, position: 'relative', overflow: 'hidden' }}>
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
                ((field.field_type === 'signature' || field.field_type === 'initials' || field.field_type === 'stamp') && signature);

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
                    signature ? (
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
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Signing As</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{data.recipient.name}</div>
            <div style={{ fontSize: 12.5, color: '#6b7280' }}>{data.recipient.email}</div>
            {data.recipient.role_label && <div style={{ fontSize: 11.5, color: accent, fontWeight: 600, marginTop: 4 }}>{data.recipient.role_label}</div>}
          </div>

          <div className="sign-public-sidebar-body">
            {/* Progress */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Signing Progress</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {requiredFields.map((f, i) => (
                  <div key={f.id} style={{ width: 28, height: 28, borderRadius: 6, background: fieldValues[f.id] || (f.field_type === 'signature' && signature) ? '#0e9f6e' : i === currentField ? accent : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: fieldValues[f.id] || (f.field_type === 'signature' && signature) ? '#fff' : i === currentField ? '#fff' : '#6b7280', fontWeight: 700 }} title={f.field_type}>
                    {fieldValues[f.id] || (f.field_type === 'signature' && signature) ? <Icon name="check" size={12} /> : i + 1}
                  </div>
                ))}
                {requiredFields.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>No required fields</div>}
              </div>
            </div>

            {/* Signature capture */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Your Signature</div>
              {signature ? (
                <div style={{ border: '1.5px solid #0e9f6e', borderRadius: 8, padding: 8, background: '#f0fdf4', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <img src={signature} alt="signature" style={{ width: '100%', height: 60, objectFit: 'contain', background: '#fff', borderRadius: 4 }} />
                  <button onClick={() => setSignature(null)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>Change</button>
                </div>
              ) : (
                <SignatureCanvas onCapture={setSignature} />
              )}
            </div>

            {/* Text fields */}
            {data.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'initials').map(field => (
              <div key={field.id}>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                  {field.placeholder ?? field.field_type} {field.required && <span style={{ color: '#e02424' }}>*</span>}
                </label>
                {field.field_type === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!fieldValues[field.id]}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : '' }))} />
                    <span style={{ fontSize: 13 }}>{field.placeholder ?? 'I agree'}</span>
                  </label>
                ) : field.field_type === 'date' ? (
                  <input type="date" value={fieldValues[field.id] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
                ) : (
                  <input value={fieldValues[field.id] ?? ''} placeholder={field.placeholder ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
          </div>

          <div className="sign-public-sidebar-footer">
            <button onClick={handleDecline} disabled={declining}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>
              Decline
            </button>
            <button onClick={handleSubmit} disabled={!signature || submitting}
              style={{ flex: 2, padding: '10px', borderRadius: 8, background: signature ? accent : '#e5e7eb', color: signature ? '#fff' : '#9ca3af', border: 'none', cursor: signature ? 'pointer' : 'default', fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="edit" size={14} />
              {submitting ? 'Submitting…' : 'Sign & Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
