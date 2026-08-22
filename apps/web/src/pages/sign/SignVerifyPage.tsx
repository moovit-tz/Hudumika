// ─── SignVerifyPage.tsx — Public verification page ────────────────────────────
// At /sign/verify/:code — completely public, no auth required.
// Anyone who receives a signed document can enter the verification code
// and see who signed, when, and whether the stamp is genuine.
// Style: DocuSign-like full-page branded verification experience.

import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { BASE_URL } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
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
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-l)', border: '2px solid var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Icon name="edit" size={24} style={{ color: 'var(--blue)' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Document Verification</h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink3)', margin: 0 }}>Verify the authenticity of a Hudumika eSign document</p>
        </div>

        {/* Code input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && verify(code)}
            placeholder="HSGN-XXXXXX-XXXXXX"
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid var(--border)',
              fontSize: 16, fontFamily: 'Courier New, monospace', fontWeight: 700,
              letterSpacing: '0.08em', color: 'var(--ink)', background: 'var(--bg)', outline: 'none',
            }}
          />
          {/* --blue isn't run through the --primary contrast-floor math
              (CLAUDE.md: that floor only exists for --primary today) — #fff
              matches every other fixed-semantic-color solid button on this
              page and elsewhere in the platform's current, un-floored state. */}
          <Button variant="default" onClick={() => verify(code)} disabled={loading || !code.trim()}
            style={{ background: 'var(--blue)', color: '#fff', whiteSpace: 'nowrap' }}>
            {loading ? '…' : 'Verify'} <Icon name="arrowRight" size={14} />
          </Button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8, textAlign: 'center' }}>
          The verification code is printed on every signed document (e.g. HSGN-A1B2C3-D4E5F6)
        </p>

        {/* Result */}
        {error && (
          <div className="sign-verify-result-invalid">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sign-red-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="xCircle" size={16} style={{ color: 'var(--sign-red)' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--sign-red)' }}>Verification Failed</div>
                <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 2 }}>{error}</div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="sign-verify-result-valid">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--sign-green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="lock" size={16} style={{ color: 'var(--sign-green)' }} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--sign-green)' }}>Document Verified</div>
                <div style={{ fontFamily: 'Courier New, monospace', fontSize: 14, color: 'var(--sign-green)', fontWeight: 700, letterSpacing: '0.08em' }}>{result.verification_code}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--sign-green)' }}>Status</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', textTransform: 'capitalize' }}>{result.status}</div>
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 6 }}>Document</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{result.title}</div>
              {result.completed_at && (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                  Completed on {new Date(result.completed_at).toLocaleString()}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 8 }}>Signers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.signers.map((s, i) => (
                  <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.status === 'signed' ? 'var(--sign-green)' : 'var(--border)', color: s.status === 'signed' ? '#fff' : 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {s.status === 'signed' ? <Icon name="check" size={14} /> : '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{s.email}{s.role_label ? ` · ${s.role_label}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: s.status === 'signed' ? 'var(--sign-green)' : 'var(--sign-orange)', textTransform: 'capitalize' }}>{s.status}</div>
                      {s.signed_at && <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{new Date(s.signed_at).toLocaleDateString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11.5, color: 'var(--ink3)' }}>
              This document was signed electronically via Hudumika eSign.
              {result.stamp_applied && <span style={{ color: 'var(--sign-green)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}> <Icon name="checkCircle" size={12} /> Stamp applied.</span>}
            </div>

            {result.anchor_status && (
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11.5, color: result.anchor_status === 'confirmed' ? 'var(--sign-green)' : 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Icon name={result.anchor_status === 'confirmed' ? 'lock' : 'clock'} size={11} />
                {result.anchor_status === 'confirmed'
                  ? `Anchored to the Bitcoin blockchain — confirmed in block #${result.anchor_block_height}`
                  : 'Bitcoin anchor submitted, awaiting block confirmation'}
              </div>
            )}

            {result.has_signed_pdf && (
              <a href={`${BASE_URL}/v1/sign/public/verify/${result.verification_code}/download`}
                style={{ display: 'block', textAlign: 'center', marginTop: 14, padding: '10px', borderRadius: 8, background: 'var(--blue-l)', color: 'var(--blue)', border: '1.5px solid var(--blue)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                Download signed PDF
              </a>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>
          Powered by <strong style={{ color: 'var(--blue)' }}>Hudumika eSign</strong> · Electronic signature verification
        </div>
      </div>
    </div>
  );
}
