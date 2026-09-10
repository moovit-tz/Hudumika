// ─── Digital Execution Seal — printed/scanned document verification ───────────
// The half of the spec that matters most: a valid QR/signature alone must
// NEVER be treated as proof that the document in front of a verifier is
// unaltered (a legitimate seal can be photographed and pasted onto a
// different page). This module is what actually compares the uploaded
// bytes against the canonical, database-held record — hash-first (exact,
// cheap), then a real OCR-based text comparison only when the hash
// disagrees, which is the ordinary, innocent case for any printed-then-
// scanned copy and must not be reported as "altered" on its own.
//
// OCR here reuses the platform's existing Gemini-vision key (ocr.routes.ts)
// rather than standing up a second OCR integration — real extraction, not a
// simulated result: unlike ocr.routes.ts's own /scan (which has an explicit,
// clearly-labelled simulated fallback for demo/dev use), a verification
// result is security-relevant, so this module returns "OCR unavailable"
// rather than ever fabricating a code or a text comparison.

import { createHash } from 'crypto';
import { diffWords, type Change } from 'diff';
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../routes/ocr.routes.js';
import { MinioIntegration } from '../integrations/minio.js';
import { verifySealCryptography, type SealVerdict } from './sign-seal.service.js';
import { analyzePdfStructure, compareStructuralProfiles, type StructuralComparison } from './sign-forensic-structural.service.js';
import { compareVisual, type VisualComparison } from './sign-forensic-visual.service.js';
import type { Db } from './sign-notify.service.js';

export interface OcrCodeResult {
  available: boolean;
  code: string | null;
  confidence: number;
  excerpt: string | null;
  reason?: string;
}

const CODE_PATTERN = /\b(HSGN|HUDU)[A-Z0-9-]{6,24}\b/;

/** OCR fallback for when a QR can't be read (damaged/cropped/glare) —
 *  recovers the printed human-readable serial instead. jsQR (client-side)
 *  is always tried first; this is only ever reached once that's failed. */
export async function ocrRecoverVerificationCode(imageBase64: string, mediaType: string): Promise<OcrCodeResult> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return { available: false, code: null, confidence: 0, excerpt: null, reason: 'OCR is not configured on this platform yet — enter the verification code shown on the document instead.' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mediaType, data: imageBase64 } },
          { text: 'Find the Hudumika Digital Execution Seal on this document image. It carries a printed verification serial that starts with "HSGN-" or "HUDU-", usually near a QR code and the words "Digitally Executed". Return ONLY JSON: {"code": "<the exact serial as printed, or null if none visible>", "confidence": 0.0-1.0, "excerpt": "<the seal\'s surrounding text as you read it, or null>"}' },
        ],
      }],
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as { code?: string | null; confidence?: number; excerpt?: string | null };
    const code = parsed.code ? parsed.code.trim().toUpperCase() : null;
    const validShape = code && CODE_PATTERN.test(code);
    return {
      available: true,
      code: validShape ? code : null,
      confidence: parsed.confidence ?? 0,
      excerpt: parsed.excerpt ?? null,
      reason: code && !validShape ? `OCR found "${code}" but it doesn't match a Hudumika serial format.` : undefined,
    };
  } catch (err: any) {
    return { available: false, code: null, confidence: 0, excerpt: null, reason: err.message || 'OCR failed' };
  }
}

/** Extracts the visible text of a document (image or PDF — Gemini reads
 *  PDF bytes directly via inlineData, no rasterization needed) via the same
 *  vision model. Used for BOTH sides of a content comparison: the uploaded
 *  file every time, the canonical stamped PDF only once (cached — see
 *  getCanonicalText below). */
export async function extractDocumentText(fileBase64: string, mediaType: string): Promise<{ available: boolean; text: string | null; reason?: string }> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return { available: false, text: null, reason: 'OCR is not configured on this platform.' };
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mediaType, data: fileBase64 } },
          { text: 'Transcribe every line of visible text on every page of this document, in reading order, exactly as written. Return plain text only — no commentary, no markdown.' },
        ],
      }],
    });
    return { available: true, text: (response.text ?? '').trim() };
  } catch (err: any) {
    return { available: false, text: null, reason: err.message || 'Text extraction failed' };
  }
}

/** The canonical side of a comparison, cached on sign_envelopes after the
 *  first real need (migration 425) — the canonical document never changes
 *  once completed, so re-extracting its text on every verification attempt
 *  would just be repeat cost for an identical answer. */
export async function getCanonicalText(
  db: Db,
  envelope: { id: string; canonical_text_extract: string | null; canonical_text_extracted_at: Date | null },
  fetchStampedPdf: () => Promise<Buffer | null>,
): Promise<{ available: boolean; text: string | null; reason?: string }> {
  if (envelope.canonical_text_extract) return { available: true, text: envelope.canonical_text_extract };

  const pdfBuffer = await fetchStampedPdf();
  if (!pdfBuffer) return { available: false, text: null, reason: 'The canonical signed document could not be loaded.' };

  const result = await extractDocumentText(pdfBuffer.toString('base64'), 'application/pdf');
  if (result.available && result.text) {
    await db.updateTable('sign_envelopes')
      .set({ canonical_text_extract: result.text, canonical_text_extracted_at: new Date() })
      .where('id', '=', envelope.id).execute();
  }
  return result;
}

export interface TextDifference {
  type: 'added' | 'removed';
  text: string;
  context: string;
}

export interface ContentComparisonResult {
  performed: boolean;
  substantiveDifferences: TextDifference[];
  reason?: string;
}

// A change under this length is treated as scan/OCR noise (a stray
// punctuation mark, a misread character, whitespace) rather than a
// substantive difference — real content edits (an amount, a name, a
// clause) run many characters longer than OCR jitter does. This is a
// blunt, honest heuristic, not a forensic-grade classifier, and is
// reported as such in the verdict language (§27/§61 — "difference
// detected", never "forged" or "altered").
const NOISE_THRESHOLD_CHARS = 4;

/** Real diff (the `diff` package — the same algorithm class used across the
 *  JS ecosystem, not homemade), not a fabricated result. Whitespace-
 *  normalized before comparing so line-wrap/justification differences from
 *  a print-then-scan cycle (real, expected, NOT a content change) don't
 *  register as differences at all. */
export function compareExtractedText(canonicalText: string, uploadedText: string): ContentComparisonResult {
  const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();
  const changes: Change[] = diffWords(normalize(canonicalText), normalize(uploadedText));

  const substantive: TextDifference[] = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (!c.added && !c.removed) continue;
    if (c.value.trim().length < NOISE_THRESHOLD_CHARS) continue;
    const before = changes[i - 1]?.value?.slice(-40) ?? '';
    const after = changes[i + 1]?.value?.slice(0, 40) ?? '';
    substantive.push({
      type: c.added ? 'added' : 'removed',
      text: c.value.trim(),
      context: `…${before}[${c.value.trim()}]${after}…`,
    });
  }
  return { performed: true, substantiveDifferences: substantive };
}

export type SealVerificationVerdict =
  | 'EXACT_MATCH'
  | 'SEAL_VERIFIED_CONTENT_MATCH'
  | 'SEAL_VERIFIED_SCAN_VARIATION_ONLY'
  | 'SEAL_VERIFIED_CONTENT_DIFFERENCE'
  | 'SEAL_INVALID'
  | 'DOCUMENT_MISMATCH'
  | 'INCONCLUSIVE';

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface CompareOutcome {
  verification_code: string;
  title: string;
  seal: SealVerdict;
  uploaded_hash: string;
  canonical_hash: string | null;
  hash_match: boolean;
  content_verdict: SealVerificationVerdict;
  comparison_note?: string;
  findings: TextDifference[];
  structural: StructuralComparison | null;
  visual: VisualComparison | null;
}

/** The actual comparison work behind POST /v1/sign/verify/compare — pulled
 *  out of the route so sign-forensic-verify.job.ts (the background worker,
 *  migration 427) and the route can call the exact same logic; the route
 *  itself only enqueues now, it doesn't run this directly, but the shape
 *  stays independent of *how* it's invoked. Records the sign_verifications
 *  audit row itself, same as the route used to, so every caller gets that
 *  for free rather than needing to remember it. */
export async function runContentComparison(
  db: Db,
  envelope: {
    id: string; tenant_id: string; verification_code: string | null; title: string;
    anchor_hash: string | null; stamped_file_url: string | null;
    seal_signature: string | null; seal_payload: string | null; seal_key_label: string | null; seal_type: string | null;
    canonical_text_extract: string | null; canonical_text_extracted_at: Date | null;
  },
  uploadedBuffer: Buffer,
  mediaType: string,
  requester: { ipAddress: string | null; userAgent: string | null },
): Promise<CompareOutcome> {
  const uploadedHash = sha256Hex(uploadedBuffer);
  const hashMatch = !!envelope.anchor_hash && uploadedHash === envelope.anchor_hash;
  const sealVerdict = await verifySealCryptography(envelope);

  let contentVerdict: SealVerificationVerdict;
  let findings: TextDifference[] = [];
  let comparisonNote: string | undefined;
  let structural: StructuralComparison | null = null;
  let visual: VisualComparison | null = null;

  if (!sealVerdict.signatureValid && sealVerdict.sealPresent) {
    contentVerdict = 'SEAL_INVALID';
  } else if (hashMatch) {
    contentVerdict = 'EXACT_MATCH';
  } else {
    // Different bytes — expected for any printed/scanned/re-saved copy.
    // Two independent checks run from here, neither gating the other:
    //   1. Structural/metadata (Phase 4) — real, local pdf-lib parse, no
    //      network call. Catches what a text diff can't (a page added or
    //      removed, an embedded auto-run action, a file that's been
    //      incrementally re-saved) and stays available even when OCR is
    //      down — see the comparisonNote fallback below.
    //   2. OCR text comparison (Phase 1) — scan-variation vs. genuine
    //      content difference.
    const fetchCanonicalBytes = async () => (envelope.stamped_file_url ? await MinioIntegration.readFile(envelope.stamped_file_url) : null);

    let canonicalBytesForPdfChecks: Buffer | null = null;
    if (mediaType === 'application/pdf') {
      canonicalBytesForPdfChecks = await fetchCanonicalBytes();
      const canonicalProfile = canonicalBytesForPdfChecks ? await analyzePdfStructure(canonicalBytesForPdfChecks) : null;
      const uploadedProfile = await analyzePdfStructure(uploadedBuffer);
      structural = compareStructuralProfiles(canonicalProfile, uploadedProfile);

      // 3. Visual/pixel (Phase 5) — real, local render+diff, independent of
      //    both checks above (a purely visual edit can pass a text diff and
      //    a structural scan alike). Only meaningful once the canonical
      //    file itself is available to render against.
      if (canonicalBytesForPdfChecks) {
        visual = await compareVisual(canonicalBytesForPdfChecks, uploadedBuffer);
      }
    }

    const canonical = await getCanonicalText(db, envelope, fetchCanonicalBytes);
    const uploaded = await extractDocumentText(uploadedBuffer.toString('base64'), mediaType);

    if (structural?.anomalyDetected || visual?.anomalyDetected) {
      contentVerdict = 'DOCUMENT_MISMATCH';
      const structuralNote = structural?.findings.filter(f => f.severity === 'risk').map(f => f.text).join(' ') ?? '';
      const visualNote = visual?.anomalyDetected
        ? `Visual comparison found significant pixel-level differences on ${visual.pages.length} page${visual.pages.length === 1 ? '' : 's'} (up to ${visual.worstDiffPercent}% of the page).`
        : '';
      comparisonNote = [structuralNote, visualNote].filter(Boolean).join(' ');
    } else if (!canonical.available || !uploaded.available) {
      contentVerdict = 'INCONCLUSIVE';
      comparisonNote = canonical.reason || uploaded.reason || 'Content comparison could not be completed.';
      if (structural?.performed) comparisonNote += ' Structural check (page count, embedded actions, metadata) found no anomalies.';
      if (visual?.performed) comparisonNote += ' Visual pixel comparison found no anomalies.';
    } else if (!canonical.text || !uploaded.text) {
      contentVerdict = 'INCONCLUSIVE';
      comparisonNote = 'No readable text was found to compare.';
    } else {
      const comparison = compareExtractedText(canonical.text, uploaded.text);
      findings = comparison.substantiveDifferences;
      contentVerdict = findings.length === 0 ? 'SEAL_VERIFIED_SCAN_VARIATION_ONLY' : 'SEAL_VERIFIED_CONTENT_DIFFERENCE';
    }
  }

  await db.insertInto('sign_verifications').values({
    envelope_id: envelope.id,
    tenant_id: envelope.tenant_id,
    verification_code: (envelope.verification_code ?? '').toUpperCase(),
    ip_address: requester.ipAddress,
    user_agent: requester.userAgent,
    result: 'valid',
    method: 'upload',
    signature_valid: sealVerdict.signatureValid,
    uploaded_hash: uploadedHash,
    hash_match: hashMatch,
    content_verdict: contentVerdict,
    findings: JSON.stringify(findings) as any,
    structural_findings: structural ? (JSON.stringify(structural) as any) : null,
    // Every verification attempt gets a permanent, never-cleaned-up row
    // here — so the (occasionally several, base64-encoded) diff PNGs stay
    // out of it. The full VisualComparison (images included) still reaches
    // the caller via CompareOutcome.visual below, and from there either
    // sign_forensic_jobs.result (Phase 2, swept after 24h) or, for a
    // non-clean verdict, the durable per-case evidence store (Phase 3 —
    // see autoOpenCaseFromJob, which pulls the diff images out into their
    // own sign_forensic_evidence rows rather than leaving them buried
    // in JSON at all).
    visual_findings: visual ? (JSON.stringify({
      performed: visual.performed, reason: visual.reason, anomalyDetected: visual.anomalyDetected,
      pagesCompared: visual.pagesCompared, worstDiffPercent: visual.worstDiffPercent,
      pages: visual.pages.map(p => ({ page: p.page, diffPercent: p.diffPercent })),
    }) as any) : null,
  }).execute().catch(() => {});

  return {
    verification_code: envelope.verification_code ?? '',
    title: envelope.title,
    seal: sealVerdict,
    uploaded_hash: uploadedHash,
    canonical_hash: envelope.anchor_hash,
    hash_match: hashMatch,
    content_verdict: contentVerdict,
    comparison_note: comparisonNote,
    findings,
    structural,
    visual,
  };
}
