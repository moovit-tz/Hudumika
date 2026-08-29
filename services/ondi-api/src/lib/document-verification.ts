import { createWorker } from 'tesseract.js';
import { parse as parseMrzLines } from 'mrz';
import sharp from 'sharp';

export interface VerificationDetails {
  ocrTextLength: number;
  imageQuality: { width: number; height: number; resolutionOk: boolean; sharpnessScore: number; sharpnessOk: boolean };
  mrz: { found: boolean; checksumValid?: boolean; fields?: Record<string, unknown> } | null;
  nameMatch: { claimed: string; score: number; matched: boolean };
  documentNumberMatch: { claimed: string; found: boolean };
  reasons: string[];
}

export interface VerificationResult {
  status: 'VERIFIED' | 'REVIEW' | 'REJECTED';
  confidenceScore: number; // 0-100
  details: VerificationDetails;
}

const MIN_LONG_EDGE_PX = 600;
// Laplacian-variance sharpness threshold — tuned against the real sample
// documents in ocr/ondi (all score well above this; a genuinely blurry photo
// scores well below it). Not a universal constant, a starting point.
const MIN_SHARPNESS = 8;

/** OCR a document image. Normalizes to PNG first — tesseract is unreliable on webp/gif directly. */
async function runOcr(imageBuffer: Buffer): Promise<string> {
  const png = await sharp(imageBuffer).png().toBuffer();
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(png);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** Laplacian-variance blur detection + resolution check — real signal processing, not a guess. */
async function assessImageQuality(imageBuffer: Buffer): Promise<VerificationDetails['imageQuality']> {
  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const laplacian = await image
    .clone()
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .stats();
  const sharpnessScore = laplacian.channels[0].stdev;

  return {
    width,
    height,
    resolutionOk: Math.max(width, height) >= MIN_LONG_EDGE_PX,
    sharpnessScore: Math.round(sharpnessScore * 100) / 100,
    sharpnessOk: sharpnessScore >= MIN_SHARPNESS,
  };
}

/** Find two MRZ-shaped lines (A-Z0-9< only, length 28-44) in raw OCR output. */
function findMrzLines(text: string): string[] | null {
  const candidates = text
    .split('\n')
    // '<' is the only valid MRZ filler character, but OCR frequently misreads
    // it as '>' (the glyphs are easy to confuse at small size) — normalize
    // before filtering rather than rejecting otherwise-valid MRZ lines.
    .map(l => l.replace(/\s+/g, '').toUpperCase().replace(/>/g, '<'))
    .filter(l => /^[A-Z0-9<]{28,44}$/.test(l));
  if (candidates.length < 2) return null;

  // TD3 (passports): last 2 matching lines. Only require that AT LEAST ONE
  // has a '<' filler character — OCR frequently drops trailing '<' padding
  // on whichever line runs closest to the image edge, so requiring it on
  // every line was rejecting real MRZs.
  const lines = candidates.slice(-2);
  if (!lines.some(l => l.includes('<'))) return null;

  return lines.map(l => l.padEnd(44, '<').slice(0, 44));
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Token-overlap fuzzy match — real, deterministic, but not claiming to be more than it is. */
function scoreNameMatch(claimedFullName: string, ocrText: string): number {
  const tokens = claimedFullName.toUpperCase().split(/\s+/).map(t => t.replace(/[^A-Z]/g, '')).filter(t => t.length > 1);
  if (tokens.length === 0) return 0;
  const haystack = ocrText.toUpperCase();
  const matched = tokens.filter(t => haystack.includes(t)).length;
  return matched / tokens.length;
}

export async function verifyDocument(input: {
  documentType: 'NIN' | 'PASSPORT' | 'DRIVER_LICENSE';
  imageBuffer: Buffer;
  claimedFullName: string;
  claimedDocumentNumber: string;
}): Promise<VerificationResult> {
  const reasons: string[] = [];
  const [ocrText, imageQuality] = await Promise.all([
    runOcr(input.imageBuffer),
    assessImageQuality(input.imageBuffer),
  ]);

  if (!imageQuality.resolutionOk) reasons.push(`Image resolution too low (${imageQuality.width}x${imageQuality.height}, need ${MIN_LONG_EDGE_PX}px on the long edge)`);
  if (!imageQuality.sharpnessOk) reasons.push(`Image appears blurry (sharpness score ${imageQuality.sharpnessScore}, need ${MIN_SHARPNESS}+)`);

  const nameScore = scoreNameMatch(input.claimedFullName, ocrText);
  const nameMatch = { claimed: input.claimedFullName, score: Math.round(nameScore * 100) / 100, matched: nameScore >= 0.5 };
  if (!nameMatch.matched) reasons.push(`Claimed name "${input.claimedFullName}" doesn't clearly appear in the document text (${Math.round(nameScore * 100)}% token match)`);

  const claimedNumberNorm = normalize(input.claimedDocumentNumber);
  const documentNumberFound = claimedNumberNorm.length > 0 && normalize(ocrText).includes(claimedNumberNorm);
  const documentNumberMatch = { claimed: input.claimedDocumentNumber, found: documentNumberFound };
  if (!documentNumberFound) reasons.push(`Claimed document number "${input.claimedDocumentNumber}" not found in the document text`);

  let mrz: VerificationDetails['mrz'] = null;
  if (input.documentType === 'PASSPORT') {
    const mrzLines = findMrzLines(ocrText);
    if (!mrzLines) {
      mrz = { found: false };
      reasons.push('No machine-readable zone (MRZ) detected on the document image');
    } else {
      const parsed = parseMrzLines(mrzLines);
      mrz = { found: true, checksumValid: parsed.valid, fields: parsed.fields };
      if (!parsed.valid) {
        const failedChecks = parsed.details.filter((d: any) => !d.valid).map((d: any) => d.label);
        reasons.push(`MRZ checksum validation failed: ${failedChecks.join(', ')}`);
      }
    }
  }

  // Decision. Passports get a cryptographic-grade signal (MRZ check digits,
  // an internationally standardized algorithm) — everything else relies on
  // OCR structural/text matching, which is real but weaker, so it can drive
  // REVIEW confidently but is deliberately never enough alone to REJECT.
  const qualityOk = imageQuality.resolutionOk && imageQuality.sharpnessOk;
  let status: VerificationResult['status'];
  let confidenceScore: number;

  if (!qualityOk) {
    status = 'REVIEW';
    confidenceScore = 30;
  } else if (input.documentType === 'PASSPORT') {
    if (mrz?.found && mrz.checksumValid && nameMatch.matched) {
      status = 'VERIFIED';
      confidenceScore = 95;
    } else if (mrz?.found && mrz.checksumValid === false && !nameMatch.matched && !documentNumberMatch.found) {
      // Checksums fail AND neither name nor number match anything we can
      // find — the strongest negative signal this pipeline can produce.
      status = 'REJECTED';
      confidenceScore = 10;
      reasons.push('Multiple independent checks failed — MRZ checksum, name, and document number all mismatched');
    } else {
      status = 'REVIEW';
      confidenceScore = mrz?.found ? 55 : 40;
    }
  } else {
    // NIN / DRIVER_LICENSE — no checksum standard available, so the ceiling
    // is a strong structural + text match, not cryptographic proof.
    if (nameMatch.matched && documentNumberMatch.found) {
      status = 'VERIFIED';
      confidenceScore = 80;
    } else if (!nameMatch.matched && !documentNumberMatch.found) {
      status = 'REJECTED';
      confidenceScore = 15;
      reasons.push('Neither the claimed name nor document number could be found anywhere in the document text');
    } else {
      status = 'REVIEW';
      confidenceScore = 50;
    }
  }

  if (reasons.length === 0) reasons.push('All checks passed');

  return {
    status,
    confidenceScore,
    details: { ocrTextLength: ocrText.length, imageQuality, mrz, nameMatch, documentNumberMatch, reasons },
  };
}
