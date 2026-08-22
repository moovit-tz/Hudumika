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
//
// After the visual content (signature images, audit page) is drawn, the
// document is also given a real cryptographic signature — a PKCS#7/CMS
// signature dictionary per the PDF spec's own digital-signature mechanism,
// the same thing a real PDF viewer (Adobe Reader, Chrome/Edge's built-in
// viewer) reads to show "This document is digitally signed" and validate
// it hasn't changed since. This is a genuinely different mechanism from
// the visual signature images above — those are just pixels; this is what
// makes the file cryptographically verifiable by any standard PDF tool,
// not only inside Hudumika's own UI. See pdf-signing-identity.service.ts
// for the platform's own signing certificate.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { getSigningIdentity } from './pdf-signing-identity.service.js';
import { canApplyTenantStamp } from '../routes/sign-stamps.routes.js';

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;

interface SourceEnvelope {
  id: string;
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
  user_id?: string | null;
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

/** The reusable kernel behind drawFields()'s own signature/stamp image
 *  branch, extracted so a generic cross-app "apply this stamp" call
 *  (stamp.service.ts) draws through the exact same code, not a second
 *  copy that could drift — same magic-byte guard against pdf-lib's PNG
 *  decoder hang (a real, confirmed incident, not a hypothetical), same
 *  scale-to-fit-box math, same optional caption line. Takes plain PNG
 *  bytes and a box in PDF points (not fractions, not envelope/recipient
 *  rows) — the minimal shape any caller actually has. */
export async function drawStampImage(
  doc: PDFDocument,
  page: PDFPage,
  pngBytes: Buffer,
  box: { x: number; y: number; width: number; height: number },
  caption?: string,
): Promise<void> {
  if (!isPngBytes(pngBytes)) return;
  const png = await doc.embedPng(pngBytes);
  const scale = Math.min(box.width / png.width, box.height / png.height);
  const w = png.width * scale, h = png.height * scale;
  page.drawImage(png, { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h });

  if (caption) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const captionSize = 5.5;
    page.drawText(caption, {
      x: box.x, y: Math.max(2, box.y - captionSize - 2),
      size: captionSize, font, color: rgb(0.45, 0.45, 0.45),
    });
  }
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

  await drawFields(doc, envelope, recipients, fields, await resolveTenantStamp(envelope, recipients, fields));
  await drawAuditTrail(doc, envelope, events);

  const unsigned = Buffer.from(await doc.save());
  try {
    return await applyDigitalSignature(unsigned, envelope, recipients);
  } catch (err) {
    // The visual document (signatures + audit trail) is real and complete
    // either way — a real cryptographic signature is a genuine additional
    // guarantee, not something the rest of the feature depends on, so a
    // failure here returns the honest unsigned-but-complete PDF rather
    // than losing the whole completion.
    console.error('[Sign PDF] Digital signature failed, returning the document unsigned:', (err as Error).message);
    return unsigned;
  }
}

/** Adds a real PKCS#7 signature dictionary — reserves a placeholder in the
 *  PDF's own structure, then computes and embeds the actual signature over
 *  the final bytes. `name` is the platform's own certifying identity, the
 *  same shape DocuSign's own certificate shows "DocuSign, Inc." rather than
 *  the human signer — the human signers and their signature images are
 *  already on the page and in the audit trail; this attests the platform
 *  itself certified the file and that it hasn't changed since. */
async function applyDigitalSignature(
  pdfBytes: Buffer,
  envelope: SourceEnvelope,
  recipients: SourceRecipient[],
): Promise<Buffer> {
  // Fetched before the placeholder is built (not just before signing) so
  // `name` below can reflect whichever identity actually signs — the real
  // uploaded certificate's own subject once a SuperAdmin has activated one
  // (platform-signing-cert.service.ts), not a hardcoded "Hudumika eSign"
  // label that would go stale the moment a real cert goes live.
  const identity = await getSigningIdentity();

  const withPlaceholder = await PDFDocument.load(pdfBytes);
  pdflibAddPlaceholder({
    pdfDoc: withPlaceholder,
    reason: envelope.verification_code
      ? `Certified by ${identity.displayName} — verification code ${envelope.verification_code}`
      : `Certified by ${identity.displayName}`,
    contactInfo: 'support@hudumika.com',
    name: identity.displayName,
    location: recipients.map(r => r.name).join(', ') || envelope.title,
    signingTime: envelope.completed_at ?? new Date(),
    // PAdES (ISO 32000-2) rather than the classic Adobe.PPKLite/PKCS7
    // subfilter — the modern standard, and what current PDF viewers
    // (including Chromium's PDFium) look for first when deciding whether
    // to show native signature-validation UI.
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });
  const placeholderBytes = Buffer.from(await withPlaceholder.save({ useObjectStreams: false }));

  const signer = new P12Signer(identity.p12, { passphrase: identity.password });
  // Dynamic import, same ESM/CJS interop category as node-forge elsewhere in
  // this codebase (see tra.service.ts) — @signpdf/signpdf's compiled output
  // is `exports.default = new SignPdf()`, a real instance confirmed by
  // reading dist/signpdf.js directly, but TS's own resolved type for this
  // import doesn't narrow to it (typed as the whole module namespace
  // instead), so the fallback below is a real runtime need, not a stray cast.
  const signpdfModule = await import('@signpdf/signpdf') as unknown as { default: { sign(pdf: Buffer, signer: P12Signer): Promise<Buffer> } };
  const signpdf = signpdfModule.default;
  return signpdf.sign(placeholderBytes, signer);
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

/** Resolves the tenant's real configured company stamp (Settings ▸ E-Sign)
 *  for any 'stamp' field on this document, plus which recipients are
 *  actually cleared to have it drawn on their behalf — a recipient tagged
 *  to a real colleague (sign_recipients.user_id) whose role clears the same
 *  canApplyTenantStamp gate the rest of the stamp system already enforces.
 *  Returns null bytes / an empty allow-set when there's no stamp field at
 *  all, so drawFields falls back to its old per-recipient-signature
 *  behavior for an untagged/unauthorized recipient rather than leaving the
 *  field blank. */
async function resolveTenantStamp(
  envelope: SourceEnvelope, recipients: SourceRecipient[], fields: SourceField[],
): Promise<{ bytes: Buffer | null; authorizedRecipientIds: Set<string> }> {
  if (!fields.some(f => f.field_type === 'stamp')) return { bytes: null, authorizedRecipientIds: new Set() };

  const taggedRecipients = recipients.filter((r): r is SourceRecipient & { user_id: string } => !!r.user_id);
  const authorizedRecipientIds = new Set<string>();
  if (taggedRecipients.length) {
    const users = await dbPlatform.selectFrom('users').select(['id', 'role'])
      .where('id', 'in', taggedRecipients.map(r => r.user_id)).execute();
    const roleByUserId = new Map(users.map(u => [u.id, u.role]));
    for (const r of taggedRecipients) {
      const role = roleByUserId.get(r.user_id);
      if (role && await canApplyTenantStamp(dbPlatform, envelope.tenant_id, role)) authorizedRecipientIds.add(r.id);
    }
  }
  if (!authorizedRecipientIds.size) return { bytes: null, authorizedRecipientIds };

  const stampRow = await dbPlatform.selectFrom('sign_stamps').select('image_data')
    .where('tenant_id', '=', envelope.tenant_id).where('owner_type', '=', 'tenant').executeTakeFirst();
  const parsed = stampRow ? parseDataUrl(stampRow.image_data) : null;
  return { bytes: parsed?.bytes ?? null, authorizedRecipientIds };
}

/** Draws each placed field onto its real page — the recipient's captured
 *  signature image for signature/initials fields (the same image reused
 *  across every field belonging to that recipient, matching how
 *  sign_recipients.signature_data is captured once per signer, not once
 *  per field), the filled value for text/date, a mark for a checked box.
 *
 *  A 'stamp' field draws the tenant's own configured company stamp
 *  (resolveTenantStamp above) when this field's recipient is tagged and
 *  cleared for it — a real business seal, not the individual signer's hand
 *  drawing. Falls back to the same signature-image behavior as
 *  signature/initials for an untagged/unauthorized recipient, so a stamp
 *  field never renders blank just because nobody's cleared to apply the
 *  real seal.
 *
 *  Signature/initials fields also get a small "Signed by: {name} / {id}"
 *  caption drawn just below the image — the same visual convention
 *  DocuSign's own signature blocks use (see the reference screenshot:
 *  "DocuSigned by:" + a truncated envelope UUID under the signature). The
 *  envelope's own id (not the human-facing verification_code, which is
 *  already prominent elsewhere on the stamp/audit page) is what gets
 *  truncated, matching DocuSign's own choice of an internal document
 *  identifier rather than a display code. Drawn just outside the field's
 *  own box, not inside it — the box is user-sized to fit exactly the
 *  signature image, and DocuSign's real fields reserve extra room for this
 *  caption the same way; a fixed field size here has nowhere to add it. */
async function drawFields(
  doc: PDFDocument, envelope: SourceEnvelope, recipients: SourceRecipient[], fields: SourceField[],
  tenantStamp: { bytes: Buffer | null; authorizedRecipientIds: Set<string> },
): Promise<void> {
  const recipientById = new Map(recipients.map(r => [r.id, r]));
  const pages = doc.getPages();
  let font: PDFFont | null = null;
  let boldFont: PDFFont | null = null;
  const shortId = envelope.id.replace(/-/g, '').toUpperCase().slice(0, 16);

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

    if (field.field_type === 'stamp' && tenantStamp.bytes && tenantStamp.authorizedRecipientIds.has(field.recipient_id)) {
      try {
        await drawStampImage(doc, page, tenantStamp.bytes, { x: boxX, y: boxY, width: boxW, height: boxH });
      } catch (err) {
        console.error('[Sign PDF] Failed to embed the tenant stamp image:', (err as Error).message);
      }
    } else if ((field.field_type === 'signature' || field.field_type === 'initials' || field.field_type === 'stamp') && recipient?.signature_data) {
      try {
        const parsed = parseDataUrl(recipient.signature_data);
        if (parsed) {
          const caption = field.field_type === 'stamp' ? undefined : `Signed by: ${recipient.name} · ${shortId}`;
          await drawStampImage(doc, page, parsed.bytes, { x: boxX, y: boxY, width: boxW, height: boxH }, caption);
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
