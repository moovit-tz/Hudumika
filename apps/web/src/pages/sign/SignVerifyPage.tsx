// ─── SignVerifyPage.tsx — Public verification page ────────────────────────────
// At /sign/verify/:code — completely public, no auth required.
// Anyone who receives a signed document can enter the verification code
// and see who signed, when, and whether the stamp is genuine.
// Style: DocuSign-like full-page branded verification experience.

import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { BASE_URL } from '../../lib/api.js';
import '../sign/Sign.css';

interface VerifyResult {
  valid: boolean;
  verification_code: string;
  title: string;
  status: string;
  completed_at: string | null;
  stamp_applied: boolean;
  has_signed_pdf: boolean;
  anchor_status: 'pending' | 'confirmed' | null;
  anchor_block_height: number | null;
  anchor_block_time: string | null;
  signers: Array<{
    name: string; email: string; role_label: string | null;
    status: string; signed_at: string | null;
  }>;
}

function getCodeFromUrl(): string {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1]?.toUpperCase() ?? '';
}

export function SignVerifyPage() {
  const urlCode = getCodeFromUrl();
  const [code, setCode] = useState(urlCode);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(!!urlCode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlCode) verify(urlCode);
  }, []);

  async function verify(lookupCode: string) {
    if (!lookupCode.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${BASE_URL}/v1/sign/public/verify/${lookupCode.trim()}`);
      if (!res.ok) {
        setError('Verification code not found. Please check the code and try again.');
        return;
      }
      setResult(await res.json());
    } catch {
      setError('Unable to connect to verification server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sign-verify-hero">
      <div className="sign-verify-card">
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', border: '2px solid #1a56db', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Icon name="edit" size={24} style={{ color: '#1a56db' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Document Verification</h1>
          <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>Verify the authenticity of a Hudumika eSign document</p>
        </div>

        {/* Code input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && verify(code)}
            placeholder="HSGN-XXXXXX-XXXXXX"
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid #e5e7eb',
              fontSize: 16, fontFamily: 'Courier New, monospace', fontWeight: 700,
              letterSpacing: '0.08em', color: '#111827', background: '#f9fafb', outline: 'none',
            }}
          />
          <button
            onClick={() => verify(code)}
            disabled={loading || !code.trim()}
            style={{ padding: '12px 20px', borderRadius: 10, background: '#1a56db', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {loading ? '…' : 'Verify →'}
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
          The verification code is printed on every signed document (e.g. HSGN-A1B2C3-D4E5F6)
        </p>

        {/* Result */}
        {error && (
          <div className="sign-verify-result-invalid">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="xCircle" size={16} style={{ color: '#e02424' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#e02424' }}>Verification Failed</div>
                <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{error}</div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="sign-verify-result-valid">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="lock" size={16} style={{ color: '#0e9f6e' }} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0e9f6e' }}>Document Verified</div>
                <div style={{ fontFamily: 'Courier New, monospace', fontSize: 14, color: '#0e9f6e', fontWeight: 700, letterSpacing: '0.08em' }}>{result.verification_code}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0e9f6e' }}>Status</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', textTransform: 'capitalize' }}>{result.status}</div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Document</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 2 }}>{result.title}</div>
              {result.completed_at && (
                <div style={{ fontSize: 12.5, color: '#6b7280' }}>
                  Completed on {new Date(result.completed_at).toLocaleString()}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 8 }}>Signers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.signers.map((s, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.status === 'signed' ? '#0e9f6e' : '#f3f4f6', color: s.status === 'signed' ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {s.status === 'signed' ? <Icon name="check" size={14} /> : '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{s.email}{s.role_label ? ` · ${s.role_label}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: s.status === 'signed' ? '#0e9f6e' : '#f59e0b', textTransform: 'capitalize' }}>{s.status}</div>
                      {s.signed_at && <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{new Date(s.signed_at).toLocaleDateString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11.5, color: '#6b7280' }}>
              This document was signed electronically via Hudumika eSign.
              {result.stamp_applied && <span style={{ color: '#0e9f6e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}> <Icon name="checkCircle" size={12} /> Stamp applied.</span>}
            </div>

            {result.anchor_status && (
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11.5, color: result.anchor_status === 'confirmed' ? '#0e9f6e' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Icon name={result.anchor_status === 'confirmed' ? 'lock' : 'clock'} size={11} />
                {result.anchor_status === 'confirmed'
                  ? `Anchored to the Bitcoin blockchain — confirmed in block #${result.anchor_block_height}`
                  : 'Bitcoin anchor submitted, awaiting block confirmation'}
              </div>
            )}

            {result.has_signed_pdf && (
              <a href={`${BASE_URL}/v1/sign/public/verify/${result.verification_code}/download`}
                style={{ display: 'block', textAlign: 'center', marginTop: 14, padding: '10px', borderRadius: 8, background: '#fff', color: '#1a56db', border: '1.5px solid #1a56db', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                Download signed PDF
              </a>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
          Powered by <strong style={{ color: '#1a56db' }}>Hudumika eSign</strong> · Electronic signature verification
        </div>
      </div>
    </div>
  );
}
