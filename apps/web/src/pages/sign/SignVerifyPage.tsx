// ─── SignVerifyPage.tsx — Public verification page ────────────────────────────
// At /sign/verify/:code — completely public, no auth required.
// Anyone who receives a signed document can enter the verification code
// and see who signed, when, and whether the stamp is genuine.
//
// Two distinct checks live here, and the copy is careful never to blur
// them together (Digital Execution Seal spec §35/§60/§61):
//   1. RECORD lookup — does this code/seal exist, and does its Ed25519
//      signature check out against Hudumika's stored public key? A valid
//      signature here proves Hudumika issued this exact claim; it does
//      NOT by itself prove the document in someone's hand is genuine — a
//      legitimate seal can be photographed and pasted onto different
//      content (seal cloning).
//   2. DOCUMENT comparison (upload a scan/photo/PDF) — hashes it, and if
//      the hash differs from the canonical record (the ordinary, innocent
//      case for anything printed then scanned), runs a real OCR-based text
//      comparison rather than either trusting the seal alone or flatly
//      reporting "altered".
// QR decoding happens client-side (jsQR, real canvas pixel decode) — no
// server round trip needed for the common case; OCR is the fallback for a
// damaged/cropped/glared QR, and always the path for a manually-typed code
// with no scannable QR at all.

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Icon } from '../../components/Icon.js';
import { BASE_URL, apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Banner } from '../../components/ui/alert.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import '../sign/Sign.css';

interface SealVerdict {
  sealPresent: boolean;
  signatureValid: boolean;
  keyStatus: string;
  sealType: string | null;
  fingerprint: string | null;
  payloadFingerprintMatchesCanonical: boolean | null;
  reason?: string;
}

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
  seal: SealVerdict | null;
  signers: Array<{
    name: string; email: string; role_label: string | null;
    status: string; signed_at: string | null;
  }>;
  certification: {
    name: string; title: string; roll_number: string | null; firm: string | null;
    certified: boolean; certified_at: string | null;
  } | null;
}

interface TextDifference { type: 'added' | 'removed'; text: string; context: string; }
interface StructuralFinding { severity: 'info' | 'risk'; text: string; }
interface PdfStructuralProfile {
  available: boolean; pageCount: number | null; producer: string | null; creator: string | null;
  creationDate: string | null; modificationDate: string | null; isEncrypted: boolean;
  incrementalUpdateCount: number;
}
interface StructuralComparison {
  performed: boolean; anomalyDetected: boolean; findings: StructuralFinding[];
  canonical: PdfStructuralProfile | null; uploaded: PdfStructuralProfile | null;
}
interface VisualPageDiff { page: number; diffPercent: number; diffPngBase64: string; }
interface VisualComparison {
  performed: boolean; reason?: string; anomalyDetected: boolean;
  pagesCompared: number; worstDiffPercent: number; pages: VisualPageDiff[];
}
interface CompareResult {
  verification_code: string;
  title: string;
  seal: SealVerdict;
  uploaded_hash: string;
  canonical_hash: string | null;
  hash_match: boolean;
  content_verdict: string;
  comparison_note?: string;
  findings: TextDifference[];
  structural: StructuralComparison | null;
  visual: VisualComparison | null;
}

const SEAL_TYPE_LABEL: Record<string, string> = {
  STANDARD_SIGN_SEAL: 'Standard Sign Seal', ADVANCED_EXECUTION_SEAL: 'Advanced Execution Seal',
  WITNESS_SEAL: 'Witness Seal', NOTARY_SEAL: 'Notary Seal', AFFIDAVIT_SEAL: 'Affidavit Seal', CERTIFICATE_SEAL: 'Certificate Seal',
};

const CONTENT_VERDICT_CFG: Record<string, { label: string; tone: 'green' | 'gold' | 'red' | 'gray' }> = {
  EXACT_MATCH: { label: 'Exact digital match', tone: 'green' },
  SEAL_VERIFIED_SCAN_VARIATION_ONLY: { label: 'Seal verified — scan variation only', tone: 'green' },
  SEAL_VERIFIED_CONTENT_DIFFERENCE: { label: 'Seal verified — content differences detected', tone: 'gold' },
  SEAL_INVALID: { label: 'Seal invalid', tone: 'red' },
  DOCUMENT_MISMATCH: { label: 'Document mismatch', tone: 'red' },
  INCONCLUSIVE: { label: 'Inconclusive', tone: 'gray' },
};

function getCodeFromUrl(): string {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1]?.toUpperCase() ?? '';
}

/** Pulls a Hudumika verification code out of any string a QR might decode
 *  to — either the bare code, or the /sign/verify/:code page URL a printed
 *  seal's QR actually encodes. */
function extractCodeFromScan(scanned: string): string | null {
  const urlMatch = scanned.match(/\/sign\/verify\/([A-Za-z0-9-]+)/);
  if (urlMatch) return urlMatch[1].toUpperCase();
  if (/^(HSGN|HUDU)[A-Z0-9-]{6,}$/i.test(scanned.trim())) return scanned.trim().toUpperCase();
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Real canvas pixel decode (jsQR) — not a guess, not an LLM description of
 *  "there seems to be a QR code here". Works on any raster image; a PDF
 *  upload skips straight to OCR (see handleFile) rather than rasterizing
 *  client-side for this first version. */
async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return result ? result.data : null;
}

function SealBadge({ seal }: { seal: SealVerdict | null }) {
  if (!seal) return null;
  if (!seal.sealPresent) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)' }}>
        <Icon name="info" size={12} /> No Digital Execution Seal on record for this envelope.
      </div>
    );
  }
  const ok = seal.signatureValid;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: ok ? 'var(--green)' : 'var(--red)' }}>
        <Icon name={ok ? 'shield' : 'xCircle'} size={13} />
        {ok ? 'Digital Execution Seal signature valid' : `Seal signature invalid${seal.reason ? ` — ${seal.reason}` : ''}`}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {seal.sealType && <span>{SEAL_TYPE_LABEL[seal.sealType] ?? seal.sealType}</span>}
        {seal.fingerprint && <span style={{ fontFamily: 'monospace' }}>Fingerprint: {seal.fingerprint}</span>}
        {seal.keyStatus && seal.keyStatus !== 'active' && seal.keyStatus !== 'n/a' && (
          <span style={{ color: seal.keyStatus === 'revoked' ? 'var(--red)' : 'var(--ink3)' }}>Key: {seal.keyStatus}</span>
        )}
      </div>
    </div>
  );
}

export function SignVerifyPage() {
  const urlCode = getCodeFromUrl();
  const [code, setCode] = useState(urlCode);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(!!urlCode);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack] = useState(() => !!document.referrer);

  const [mode, setMode] = useState<'code' | 'upload'>('code');
  const [uploadStage, setUploadStage] = useState<'idle' | 'scanning' | 'ocr' | 'comparing'>('idle');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [manualCodeNeeded, setManualCodeNeeded] = useState(false);
  const pendingFileRef = useRef<{ base64: string; mediaType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // The compare endpoint now only enqueues (Digital Execution Seal, Phase
  // 2 — a background sweep does the real hash/OCR/diff work, same as every
  // other async workflow in this platform). This polls the job every 1.5s
  // until it's done — the sweep runs every 10s, so a result typically
  // lands within one or two polls of that, plus whatever the real Gemini-
  // vision call itself takes.
  async function runCompare(lookupCode: string, base64: string, mediaType: string) {
    setUploadStage('comparing');
    setUploadStatus('Comparing against the canonical record…');
    try {
      const queued: { job_id: string; status: string } = await apiFetch('/v1/sign/verify/compare', {
        method: 'POST',
        body: JSON.stringify({ code: lookupCode, file_base64: base64, media_type: mediaType }),
      });

      const start = Date.now();
      while (Date.now() - start < 90_000) {
        await new Promise(r => setTimeout(r, 1500));
        const job: { status: string; result: CompareResult | null; error: string | null } =
          await apiFetch(`/v1/sign/verify/jobs/${queued.job_id}`);
        if (job.status === 'completed' && job.result) {
          setCompareResult(job.result);
          setUploadStatus(null);
          return;
        }
        if (job.status === 'failed') {
          setUploadStatus(null);
          setError(job.error || 'Comparison failed — please try again.');
          return;
        }
        // still 'queued'/'processing' — keep polling
      }
      setUploadStatus(null);
      setError('This is taking longer than expected — please try again in a moment.');
    } catch (err: any) {
      setUploadStatus(null);
      setError(err.message || 'Could not resolve that verification code — check it and try again.');
    } finally {
      setUploadStage('idle');
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setCompareResult(null);
    setManualCodeNeeded(false);
    const base64 = await fileToBase64(file);
    const mediaType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    pendingFileRef.current = { base64, mediaType };

    // 1) Real client-side QR decode — images only; a PDF skips straight to
    //    OCR rather than rasterizing client-side in this first version.
    if (mediaType.startsWith('image/')) {
      setUploadStage('scanning');
      setUploadStatus('Reading QR code…');
      const scanned = await decodeQrFromImageFile(file).catch(() => null);
      const foundCode = scanned ? extractCodeFromScan(scanned) : null;
      if (foundCode) {
        setCode(foundCode);
        await runCompare(foundCode, base64, mediaType);
        return;
      }
    }

    // 2) OCR fallback — the QR was missing, damaged, or this is a PDF.
    setUploadStage('ocr');
    setUploadStatus('QR not readable — searching the page for the verification serial…');
    try {
      const ocr: { available: boolean; code: string | null; reason?: string } = await apiFetch('/v1/sign/verify/ocr', {
        method: 'POST',
        body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
      });
      if (ocr.code) {
        setCode(ocr.code);
        await runCompare(ocr.code, base64, mediaType);
        return;
      }
      setUploadStatus(null);
      setUploadStage('idle');
      setManualCodeNeeded(true);
    } catch {
      setUploadStatus(null);
      setUploadStage('idle');
      setManualCodeNeeded(true);
    }
  }

  return (
    <div className="sign-verify-page" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Public Branded Header */}
      <header style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--primary-foreground))' }}>
            <Icon name="edit" size={16} />
          </div>
          <span>Hudumika eSign</span>
        </div>
        {canGoBack && (
          <Button variant="outline" size="sm" onClick={() => window.history.back()} style={{ fontWeight: 600 }}>
            <Icon name="arrowLeft" size={14} /> Back
          </Button>
        )}
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: 560, width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '32px', boxShadow: 'var(--elev-sm)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, textAlign: 'center' }}>Verify a Document</h2>
          <p style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20, textAlign: 'center' }}>
            Check a Digital Execution Seal's record, or upload a printed/scanned copy to compare it against the original.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Tabs value={mode} onValueChange={(v) => { setMode(v as 'code' | 'upload'); setError(null); }} variant="segmented">
              <TabsList>
                <TabsTrigger value="code">Enter code</TabsTrigger>
                <TabsTrigger value="upload">Upload document</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === 'code' && (() => {
            const isCurrentlyVerified = !!result && result.verification_code === code.trim().toUpperCase();
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && verify(code)}
                      placeholder="e.g. HSGN-A1B2C3-D4E5F6"
                      style={{
                        width: '100%', padding: isCurrentlyVerified ? '10px 36px 10px 14px' : '10px 14px', borderRadius: 'var(--r-sm)',
                        border: `1px solid ${isCurrentlyVerified ? 'var(--sign-green)' : 'var(--border)'}`,
                        fontSize: 14, fontFamily: 'monospace', fontWeight: 600,
                        color: 'var(--ink)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    {isCurrentlyVerified && (
                      <Icon name="checkCircle" size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sign-green)' }} />
                    )}
                  </div>
                  <Button variant="default" onClick={() => verify(code)} disabled={loading || !code.trim()}
                    style={{ background: isCurrentlyVerified ? 'var(--sign-green)' : 'var(--blue)', color: isCurrentlyVerified ? 'hsl(var(--green-foreground))' : 'hsl(var(--blue-foreground))', padding: '0 20px', borderRadius: 'var(--r-sm)', fontSize: 13.5, fontWeight: 600 }}>
                    {loading ? 'Verifying...' : isCurrentlyVerified ? 'Re-verify' : 'Verify'}
                  </Button>
                </div>
                {isCurrentlyVerified && (
                  <div style={{ fontSize: 11.5, color: 'var(--sign-green)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="checkCircle" size={11} /> Verified — re-verify to check for status updates (e.g. Bitcoin confirmation).
                  </div>
                )}
              </div>
            );
          })()}

          {mode === 'upload' && (
            <div style={{ marginBottom: 12 }}>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div
                onClick={() => fileInputRef.current?.click()}
                role="button" tabIndex={0}
                style={{ border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}>
                <Icon name="upload" size={22} style={{ color: 'var(--ink3)', marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Upload a photo, scan, or PDF</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>We'll read the QR or the printed serial automatically.</div>
              </div>

              {uploadStage !== 'idle' && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
                  <Icon name="clock" size={14} style={{ animation: 'ds-spin 2s linear infinite', color: 'var(--teal)' }} />
                  {uploadStatus}
                </div>
              )}

              {manualCodeNeeded && (
                <div style={{ marginTop: 12 }}>
                  <Banner variant="warning" title="Couldn't read the QR or serial automatically">
                    Enter the verification code printed on the document, and we'll compare your file against that record.
                  </Banner>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. HSGN-A1B2C3-D4E5F6"
                      style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 14, fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }} />
                    <Button variant="default" disabled={!code.trim() || !pendingFileRef.current}
                      onClick={() => pendingFileRef.current && runCompare(code, pendingFileRef.current.base64, pendingFileRef.current.mediaType)}
                      style={{ padding: '0 20px', borderRadius: 'var(--r-sm)', fontSize: 13.5, fontWeight: 600 }}>
                      Compare
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {error && (
            <div style={{ marginTop: 16 }}>
              <Banner variant="error" title="Verification Failed">{error}</Banner>
            </div>
          )}

          {mode === 'upload' && compareResult && (() => {
            const cfg = CONTENT_VERDICT_CFG[compareResult.content_verdict] ?? { label: compareResult.content_verdict, tone: 'gray' as const };
            const toneColor = { green: 'var(--green)', gold: 'var(--gold)', red: 'var(--red)', gray: 'var(--ink3)' }[cfg.tone];
            const toneBg = { green: 'var(--green-l)', gold: 'var(--gold-l)', red: 'var(--red-l)', gray: 'var(--bg)' }[cfg.tone];
            return (
              <div style={{ marginTop: 24 }}>
                <div style={{ background: toneBg, border: `1px solid ${toneColor}`, borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: toneColor }}>
                    <Icon name={cfg.tone === 'green' ? 'checkCircle' : cfg.tone === 'red' ? 'xCircle' : 'alertCircle'} size={16} />
                    {cfg.label}
                  </div>
                  {compareResult.comparison_note && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>{compareResult.comparison_note}</div>}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <SealBadge seal={compareResult.seal} />
                </div>

                <div style={{ marginBottom: 16, fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--ink3)' }}>Document hash match</span>
                    <span style={{ fontWeight: 600, color: compareResult.hash_match ? 'var(--green)' : 'var(--gold)' }}>{compareResult.hash_match ? 'Identical bytes' : 'Different bytes (expected for a print/scan)'}</span>
                  </div>
                  <div style={{ padding: '6px 0', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--ink3)', wordBreak: 'break-all' }}>
                    Uploaded: {compareResult.uploaded_hash}<br />
                    Canonical: {compareResult.canonical_hash ?? '—'}
                  </div>
                </div>

                {compareResult.structural?.findings && compareResult.structural.findings.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                      Document structure &amp; metadata
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {compareResult.structural.findings.map((f, i) => (
                        <div key={i} style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', background: f.severity === 'risk' ? 'var(--red-l)' : 'var(--bg)', border: `1px solid ${f.severity === 'risk' ? 'var(--red)' : 'var(--border)'}`, fontSize: 12, color: f.severity === 'risk' ? 'var(--red)' : 'var(--ink2)' }}>
                          {f.text}
                        </div>
                      ))}
                    </div>
                    {compareResult.structural.uploaded?.pageCount != null && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span>Pages: {compareResult.structural.uploaded.pageCount}</span>
                        {compareResult.structural.uploaded.producer && <span>Producer: {compareResult.structural.uploaded.producer}</span>}
                      </div>
                    )}
                  </div>
                )}

                {compareResult.visual?.anomalyDetected && compareResult.visual.pages.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                      Visual differences ({compareResult.visual.pages.length} page{compareResult.visual.pages.length === 1 ? '' : 's'})
                    </h3>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10 }}>
                      Highlighted in red where the rendered page differs from the canonical record. Only meaningful for a PDF-to-PDF comparison — not run against a photographed/scanned image.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {compareResult.visual.pages.map(p => (
                        <div key={p.page}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>Page {p.page} — {p.diffPercent}% different</div>
                          <img src={`data:image/png;base64,${p.diffPngBase64}`} alt={`Visual diff, page ${p.page}`} style={{ width: '100%', border: '1px solid var(--red)', borderRadius: 'var(--r-sm)'}} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {compareResult.findings.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                      {compareResult.findings.length} textual difference{compareResult.findings.length === 1 ? '' : 's'} detected
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {compareResult.findings.map((f, i) => (
                        <div key={i} style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', background: f.type === 'added' ? 'var(--green-l)' : 'var(--red-l)', border: `1px solid ${f.type === 'added' ? 'var(--green)' : 'var(--red)'}`, fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: f.type === 'added' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', fontSize: 10 }}>
                            {f.type === 'added' ? 'Present in uploaded, not in original' : 'Present in original, missing from uploaded'}
                          </span>
                          <div style={{ marginTop: 4, fontFamily: 'monospace', color: 'var(--ink)', wordBreak: 'break-word' }}>{f.context}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>
                      Technical differences detected — this reflects extracted text comparison only, not a legal conclusion. Review the evidence directly before drawing conclusions.
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {mode === 'code' && result && (
            <div style={{ marginTop: 24 }}>
              {/* Status Banner */}
              <div style={{ background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 'var(--r-sm)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="checkCircle" size={18} style={{ color: 'var(--green)' }} />
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--green)' }}>
                  This document is authentic and verified.
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <SealBadge seal={result.seal} />
              </div>

              {/* Document Info Table */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Document Details</h3>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)', width: '30%' }}>File Name</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--ink)' }}>{result.title}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)' }}>Code</td>
                      <td style={{ padding: '8px 0', fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{result.verification_code}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)' }}>Completed</td>
                      <td style={{ padding: '8px 0', color: 'var(--ink)' }}>{result.completed_at ? new Date(result.completed_at).toLocaleString() : 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink3)' }}>Status</td>
                      <td style={{ padding: '8px 0', textTransform: 'capitalize', fontWeight: 600, color: 'var(--ink)' }}>{result.status}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signers Grid */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Signers</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.signers.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: s.status === 'signed' ? 'var(--green-l)' : 'var(--card-sunken)', color: s.status === 'signed' ? 'var(--green)' : 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={s.status === 'signed' ? 'check' : 'clock'} size={12} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{s.email}{s.role_label ? ` · ${s.role_label}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: s.status === 'signed' ? 'var(--green)' : 'var(--gold)', textTransform: 'capitalize' }}>{s.status}</span>
                        {s.signed_at && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{new Date(s.signed_at).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certified True Copy — the whole point of checking this page for
                  a legally certified document is confirming who certified it
                  and their roll number, so it gets its own distinct block
                  rather than blending into the ordinary signers list above. */}
              {result.certification && (
                <div style={{ marginBottom: 24, padding: 14, borderRadius: 'var(--r-sm)', background: 'var(--blue-l)', border: '1px solid var(--blue)' }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="shield" size={13} /> Certified True Copy
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                    <div style={{ fontWeight: 700 }}>{result.certification.name}</div>
                    <div style={{ color: 'var(--ink2)', marginTop: 2 }}>
                      {result.certification.title}
                      {result.certification.roll_number ? ` · Roll No. ${result.certification.roll_number}` : ''}
                    </div>
                    {result.certification.firm && <div style={{ color: 'var(--ink2)' }}>{result.certification.firm}</div>}
                    <div style={{ fontSize: 11.5, color: result.certification.certified ? 'var(--green)' : 'var(--gold)', fontWeight: 600, marginTop: 6 }}>
                      {result.certification.certified
                        ? `Certified${result.certification.certified_at ? ` on ${new Date(result.certification.certified_at).toLocaleDateString()}` : ''}`
                        : 'Certification pending'}
                    </div>
                  </div>
                </div>
              )}

              {/* Cryptographic Proof Details */}
              <div style={{ padding: '16px', background: 'var(--card-sunken)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                {result.stamp_applied && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>
                    <Icon name="checkCircle" size={14} />
                    <span>Visual audit stamp applied to all pages.</span>
                  </div>
                )}
                {result.anchor_status && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: 'var(--ink2)', lineHeight: '1.4' }}>
                    <Icon name={result.anchor_status === 'confirmed' ? 'lock' : 'clock'} size={12} style={{ marginTop: 2, color: result.anchor_status === 'confirmed' ? 'var(--green)' : 'var(--ink3)' }} />
                    <div>
                      {result.anchor_status === 'confirmed'
                        ? `Cryptographically anchored to the Bitcoin blockchain (Block #${result.anchor_block_height}).`
                        : 'Bitcoin blockchain anchor pending confirmation.'}
                    </div>
                  </div>
                )}
              </div>

              {result.has_signed_pdf && (
                <a href={`${BASE_URL}/v1/sign/public/verify/${result.verification_code}/download`} download
                  style={{ display: 'block', textAlign: 'center', marginTop: 24, padding: '10px 16px', borderRadius: 'var(--r-sm)', background: 'var(--blue)', color: 'hsl(var(--blue-foreground))', fontSize: 13.5, fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s' }}>
                  Download Signed PDF
                </a>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>
          Powered by <strong>Hudumika eSign</strong> · Electronic signature verification
        </div>
      </div>
    </div>
  );
}
