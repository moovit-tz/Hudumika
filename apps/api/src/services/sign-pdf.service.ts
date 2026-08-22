// ─── Sign app — final stamped PDF, baked with a real audit-trail page ─────────
// Called once, at the moment an envelope completes (the allSigned branch of
// POST /public/:token/sign). This closes the gap this session's own
// comparison against Google/DocuSign flagged as the highest-value one: the
// full audit trail (who signed, when, from what IP) used to only exist
// inside the Hudumika UI — the moment a signed document was downloaded and
// left the platform, none of that evidence traveled with it. Both
// competitors bake this into the file itself; this does the same.
//
// pdf-lib (not pdfkit) because the source document is an arbitrary
// uploaded/Cloud-sourced PDF this platform did not generate — pdfkit only
// builds a new PDF from scratch, pdf-lib can load and draw onto an
// existing one. When there is no real PDF to draw onto (an image source,
// or no document at all), a fresh single-page PDF is built instead so the
// signature/audit content still has somewhere real to live.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;

interface SourceEnvelope {
  title: string;
  tenant_id: string;
  file_id: string | null;
  document_data: string | null;
  verification_code: string | null;
  completed_at: Date | null;
}

interface SourceRecipient {
  id: string;
  name: string;
  email: string;
  signature_data: string | null;
}

interface SourceField {
  recipient_id: string;
  field_type: string;
  page: number;
  x: number; y: number; width: number; height: number;
  value: string | null;
}

interface SourceEvent {
  event_type: string;
  actor_name: string | null;
  actor_email: string | null;
  ip_address: string | null;
  note: string | null;
  created_at: Date;
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
}

/** Resolves the envelope's real source document bytes, from wherever it
 *  actually lives — a Cloud Drive file (file_id) takes priority, matching
 *  how the editor itself prefers sourceFileId over a fresh upload; falls
 *  back to the inline document_data data-URL a direct upload produced. */
async function resolveSourceBytes(envelope: SourceEnvelope): Promise<{ bytes: Buffer; kind: 'pdf' | 'image' | 'none' }> {
  if (envelope.file_id) {
    const file = await dbPlatform.selectFrom('cloud_files').select(['storage_key', 'type', 'mime_type'])
      .where('id', '=', envelope.file_id).executeTakeFirst();
    if (file?.storage_key) {
      const buf = MinioIntegration.readFile(file.storage_key);
      if (buf && buf.length) {
        const isPdf = file.type === 'pdf' || file.mime_type === 'application/pdf';
        return { bytes: buf, kind: isPdf ? 'pdf' : 'image' };
      }
    }
  }
  if (envelope.document_data) {
    const parsed = parseDataUrl(envelope.document_data);
    if (parsed && parsed.bytes.length) {
      return { bytes: parsed.bytes, kind: parsed.mime === 'application/pdf' ? 'pdf' : 'image' };
    }
  }
  return { bytes: Buffer.alloc(0), kind: 'none' };
}

function isPngBytes(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

export async function buildSignedPdf(
  envelope: SourceEnvelope,
  recipients: SourceRecipient[],
  fields: SourceField[],
  events: SourceEvent[],
): Promise<Buffer> {
  const { bytes, kind } = await resolveSourceBytes(envelope);

  let doc: PDFDocument;
  if (kind === 'pdf') {
    try {
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (err) {
      console.error('[Sign PDF] Source PDF failed to load, falling back to a generated page:', (err as Error).message);
      doc = await buildFallbackDoc(envelope, null);
    }
  } else if (kind === 'image') {
    doc = await buildFallbackDoc(envelope, bytes);
  } else {
    doc = await buildFallbackDoc(envelope, null);
  }

  await drawFields(doc, recipients, fields);
  await drawAuditTrail(doc, envelope, events);

  return Buffer.from(await doc.save());
}

async function buildFallbackDoc(envelope: SourceEnvelope, imageBytes: Buffer | null): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText(envelope.title, { x: 50, y: PAGE_H - 70, size: 20, font: bold, color: rgb(0.06, 0.09, 0.16) });

  if (imageBytes && imageBytes.length) {
    try {
      const img = isPngBytes(imageBytes) ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
      const maxW = PAGE_W - 100, maxH = PAGE_H - 160;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: (PAGE_W - w) / 2, y: PAGE_H - 120 - h, width: w, height: h });
    } catch (err) {
      console.error('[Sign PDF] Failed to embed source image:', (err as Error).message);
    }
  }
  return doc;
}

/** Draws each placed field onto its real page — the recipient's captured
 *  signature image for signature/initials/stamp fields (the same image
 *  reused across every field belonging to that recipient, matching how
 *  sign_recipients.signature_data is captured once per signer, not once
 *  per field), the filled value for text/date, a mark for a checked box. */
async function drawFields(doc: PDFDocument, recipients: SourceRecipient[], fields: SourceField[]): Promise<void> {
  const recipientById = new Map(recipients.map(r => [r.id, r]));
  const pngCache = new Map<string, PDFImage>();
  const pages = doc.getPages();
  let font: PDFFont | null = null;
  let boldFont: PDFFont | null = null;

  for (const field of fields) {
    const page = pages[Math.max(0, (field.page || 1) - 1)] ?? pages[0];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const boxW = field.width * pw;
    const boxH = field.height * ph;
    const boxX = field.x * pw;
    // Fields are stored as a fraction from the page's TOP (matching the
    // editor's `top: ${y*100}%` CSS) — pdf-lib's origin is bottom-left.
    const boxY = ph - (field.y * ph) - boxH;

    const recipient = recipientById.get(field.recipient_id);

    if ((field.field_type === 'signature' || field.field_type === 'initials' || field.field_type === 'stamp') && recipient?.signature_data) {
      try {
        let png = pngCache.get(recipient.id);
        if (!png) {
          const parsed = parseDataUrl(recipient.signature_data);
          // A real signature is always canvas.toDataURL('image/png') from
          // SignPublicPage's own capture — this is a magic-byte sanity
          // check, not a real-world branch: pdf-lib's PNG decoder was
          // confirmed (this session) to hang the entire Node event loop
          // rather than throw on malformed input, which would otherwise
          // block every tenant's requests, not just this one signer's.
          if (parsed && isPngBytes(parsed.bytes)) {
            png = await doc.embedPng(parsed.bytes);
            pngCache.set(recipient.id, png);
          }
        }
        if (png) {
          const scale = Math.min(boxW / png.width, boxH / png.height);
          const w = png.width * scale, h = png.height * scale;
          page.drawImage(png, { x: boxX + (boxW - w) / 2, y: boxY + (boxH - h) / 2, width: w, height: h });
        }
      } catch (err) {
        console.error('[Sign PDF] Failed to embed a signature image:', (err as Error).message);
      }
    } else if ((field.field_type === 'text' || field.field_type === 'date') && field.value) {
      font ??= await doc.embedFont(StandardFonts.Helvetica);
      const fontSize = Math.max(7, Math.min(12, boxH * 0.7));
      page.drawText(field.value, { x: boxX + 3, y: boxY + (boxH - fontSize) / 2, size: fontSize, font, color: rgb(0.07, 0.09, 0.15) });
    } else if (field.field_type === 'checkbox' && field.value === 'true') {
      boldFont ??= await doc.embedFont(StandardFonts.HelveticaBold);
      const size = Math.min(boxW, boxH) * 0.8;
      page.drawText('X', { x: boxX + (boxW - size * 0.5) / 2, y: boxY + (boxH - size) / 2, size, font: boldFont, color: rgb(0.05, 0.5, 0.35) });
    }
  }
}

/** Appends one or more trailing pages listing the full chronological
 *  sign_events log — the same data already shown in SignEnvelopeDetail,
 *  now traveling with the file itself. Paginates rather than truncating:
 *  a real envelope's audit trail should never be silently dropped just
 *  because it outgrew a single page. */
async function drawAuditTrail(doc: PDFDocument, envelope: SourceEnvelope, events: SourceEvent[]): Promise<void> {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 60;

  function header() {
    page.drawText('Audit Trail', { x: 50, y, size: 20, font: bold, color: rgb(0.06, 0.09, 0.16) });
    y -= 24;
    page.drawText(envelope.title, { x: 50, y, size: 12, font: regular, color: rgb(0.35, 0.38, 0.45) });
    y -= 18;
    if (envelope.verification_code) {
      page.drawText(`Verification code: ${envelope.verification_code}`, { x: 50, y, size: 11, font: bold, color: rgb(0.05, 0.5, 0.35) });
      y -= 16;
    }
    if (envelope.completed_at) {
      page.drawText(`Completed: ${envelope.completed_at.toISOString()}`, { x: 50, y, size: 10, font: regular, color: rgb(0.35, 0.38, 0.45) });
      y -= 20;
    }
    page.drawLine({ start: { x: 50, y }, end: { x: PAGE_W - 50, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 20;
  }
  header();

  for (const ev of events) {
    if (y < 70) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 50;
    }
    const who = ev.actor_name ? `${ev.actor_name}${ev.actor_email ? ` <${ev.actor_email}>` : ''}` : 'System';
    const label = ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1);
    page.drawText(`${label} — ${who}`, { x: 50, y, size: 10.5, font: bold, color: rgb(0.1, 0.1, 0.15) });
    y -= 13;
    const parts = [ev.created_at.toISOString()];
    if (ev.ip_address) parts.push(ev.ip_address);
    if (ev.note) parts.push(ev.note);
    page.drawText(parts.join('  ·  '), { x: 50, y, size: 9, font: regular, color: rgb(0.45, 0.48, 0.55) });
    y -= 18;
  }
}
