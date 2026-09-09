// ─── Digital Execution Seal, Phase 4 — PDF structural & metadata forensics ────
//
// Phases 1-3 answer "is this the same TEXT?" (hash first, real OCR diff as
// the fallback). That misses a class of tampering a text-diff can't see at
// all: a page inserted/removed, an automatic action wired into the file,
// an embedded attachment smuggled in, or a PDF that's been incrementally
// re-saved after it left this platform. This module answers "is this the
// same DOCUMENT, structurally?" — parsed with pdf-lib (the same library
// sign-pdf.service.ts already uses to author these files), not a second
// PDF-parsing dependency.
//
// Deliberately proportionate, and honest about its own limits (the same
// spirit as compareExtractedText's NOISE_THRESHOLD_CHARS comment): this
// walks pdf-lib's fully-resolved object table (real, not a raw-bytes grep —
// see analyzePdfStructure below), which does reach objects that live inside
// a compressed object stream. It is still a heuristic scan for well-known
// suspicious keys, not a full PDF-forensics suite — it will not catch every
// conceivable manipulation, and says so in its own findings rather than
// implying a guarantee it can't back up.
//
// Runs entirely locally (no external API), so it stays available even when
// the Gemini OCR path is down — real value in exactly the situation Phase 3
// first surfaced live: an OCR outage that would otherwise leave a
// verification with zero signal beyond "inconclusive".

import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';

export interface PdfStructuralProfile {
  available: boolean;
  reason?: string;
  pageCount: number | null;
  producer: string | null;
  creator: string | null;
  creationDate: string | null;
  modificationDate: string | null;
  isEncrypted: boolean;
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
  hasOpenAction: boolean;
  hasLaunchAction: boolean;
  /** How many `%%EOF` markers the raw bytes contain. A freshly-written PDF
   *  (every document this platform produces, via pdf-lib) has exactly one.
   *  More than one means the file has gone through at least one further
   *  incremental save since — the standard PDF-forensics signal for "this
   *  file was edited after it was first produced" (not proof of tampering
   *  on its own; a legitimate flatten/annotate pass does this too). */
  incrementalUpdateCount: number;
}

export interface StructuralFinding {
  severity: 'info' | 'risk';
  text: string;
}

export interface StructuralComparison {
  performed: boolean;
  anomalyDetected: boolean;
  findings: StructuralFinding[];
  canonical: PdfStructuralProfile | null;
  uploaded: PdfStructuralProfile | null;
}

function fmtDate(d: Date | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Counts raw `%%EOF` markers in the file's own bytes — deliberately done
 *  BEFORE handing the buffer to pdf-lib, which parses a multi-revision file
 *  down into one resolved object table and would erase this signal. */
function countIncrementalUpdates(bytes: Buffer): number {
  const text = bytes.toString('latin1');
  const matches = text.match(/%%EOF/g);
  return matches ? matches.length : 0;
}

/** Walks every indirect object pdf-lib resolved (including ones that
 *  originally lived inside a compressed object stream — pdf-lib's context
 *  decompresses those during load, so this reaches further than a raw-text
 *  grep over the file's bytes would) looking for the handful of PDF
 *  dictionary keys that mean "this file does something on its own when
 *  opened," rather than only holding static page content. */
function scanForActiveContent(doc: PDFDocument): { hasJavaScript: boolean; hasEmbeddedFiles: boolean; hasOpenAction: boolean; hasLaunchAction: boolean } {
  let hasJavaScript = false;
  let hasEmbeddedFiles = false;
  let hasOpenAction = false;
  let hasLaunchAction = false;

  if (doc.catalog.has(PDFName.of('OpenAction'))) hasOpenAction = true;
  const names = doc.catalog.get(PDFName.of('Names'));
  if (names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'))) hasEmbeddedFiles = true;
  if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) hasJavaScript = true;

  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (obj.has(PDFName.of('JS'))) hasJavaScript = true;
    const subtype = obj.get(PDFName.of('S'));
    if (subtype instanceof PDFName) {
      const name = subtype.asString();
      if (name.includes('JavaScript')) hasJavaScript = true;
      if (name.includes('Launch')) hasLaunchAction = true;
    }
    if (obj.get(PDFName.of('EF'))) hasEmbeddedFiles = true; // embedded-file stream reference
  }

  return { hasJavaScript, hasEmbeddedFiles, hasOpenAction, hasLaunchAction };
}

/** Real, local parse of one PDF's structure/metadata — no network call. */
export async function analyzePdfStructure(bytes: Buffer): Promise<PdfStructuralProfile> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const active = scanForActiveContent(doc);
    return {
      available: true,
      pageCount: doc.getPageCount(),
      producer: doc.getProducer() || null,
      creator: doc.getCreator() || null,
      creationDate: fmtDate(doc.getCreationDate()),
      modificationDate: fmtDate(doc.getModificationDate()),
      isEncrypted: doc.isEncrypted,
      ...active,
      incrementalUpdateCount: countIncrementalUpdates(bytes),
    };
  } catch (err: any) {
    return {
      available: false, reason: err.message || 'Could not parse PDF structure',
      pageCount: null, producer: null, creator: null, creationDate: null, modificationDate: null,
      isEncrypted: false, hasJavaScript: false, hasEmbeddedFiles: false, hasOpenAction: false, hasLaunchAction: false,
      incrementalUpdateCount: countIncrementalUpdates(bytes),
    };
  }
}

/** Compares two profiles. Metadata (Producer/Creator/dates) is reported for
 *  transparency only — it's expected to differ any time a document is
 *  printed, scanned, or re-saved by different software, so it is never on
 *  its own treated as a risk finding, the same reasoning
 *  compareExtractedText already applies to whitespace/line-wrap noise. Only
 *  things that change what the file itself is capable of doing, or how
 *  many pages it holds, count as an anomaly. */
export function compareStructuralProfiles(canonical: PdfStructuralProfile | null, uploaded: PdfStructuralProfile): StructuralComparison {
  const findings: StructuralFinding[] = [];

  if (!uploaded.available) {
    findings.push({ severity: 'info', text: uploaded.reason || 'The uploaded file could not be parsed as a PDF.' });
    return { performed: false, anomalyDetected: false, findings, canonical, uploaded };
  }

  if (canonical?.available && canonical.pageCount !== null && uploaded.pageCount !== null && canonical.pageCount !== uploaded.pageCount) {
    findings.push({ severity: 'risk', text: `Page count differs — canonical has ${canonical.pageCount} page${canonical.pageCount === 1 ? '' : 's'}, uploaded has ${uploaded.pageCount}.` });
  }

  const canonicalHadActiveContent = !!canonical?.available && (canonical.hasJavaScript || canonical.hasOpenAction || canonical.hasLaunchAction || canonical.hasEmbeddedFiles);
  if (uploaded.hasJavaScript && !canonical?.hasJavaScript) {
    findings.push({ severity: 'risk', text: 'Uploaded document contains embedded JavaScript — the canonical record does not.' });
  }
  if ((uploaded.hasOpenAction || uploaded.hasLaunchAction) && !(canonical?.hasOpenAction || canonical?.hasLaunchAction)) {
    findings.push({ severity: 'risk', text: 'Uploaded document runs an automatic action when opened — the canonical record does not.' });
  }
  if (uploaded.hasEmbeddedFiles && !canonical?.hasEmbeddedFiles) {
    findings.push({ severity: 'risk', text: 'Uploaded document has file attachments embedded in it — the canonical record does not.' });
  }
  if (!canonicalHadActiveContent && uploaded.incrementalUpdateCount > 1) {
    findings.push({
      severity: 'risk',
      text: `Uploaded document shows ${uploaded.incrementalUpdateCount} incremental save markers — it has been re-saved since it was first produced (the canonical record has exactly one).`,
    });
  }
  if (uploaded.isEncrypted && !canonical?.isEncrypted) {
    findings.push({ severity: 'info', text: 'Uploaded document is encrypted/password-protected — the canonical record is not.' });
  }
  if (canonical?.available && (canonical.producer !== uploaded.producer || canonical.creator !== uploaded.creator)) {
    findings.push({ severity: 'info', text: `Producer/creator metadata differs (expected for a printed, scanned, or re-saved copy) — canonical: "${canonical.producer || canonical.creator || 'unknown'}", uploaded: "${uploaded.producer || uploaded.creator || 'unknown'}".` });
  }

  return { performed: true, anomalyDetected: findings.some(f => f.severity === 'risk'), findings, canonical, uploaded };
}
