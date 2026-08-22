// ─── Cross-app stamping — apply a saved stamp to any PDF ───────────────────────
// The generic mechanism behind "the signature/stamp should be available
// inside other apps too" (e.g. a financial manager stamping a customer
// invoice) — not specific to the Sign envelope-signing flow. Draws through
// the exact same kernel (drawStampImage, sign-pdf.service.ts) the envelope
// pipeline uses, so there is one PDF-drawing implementation, not two.
//
// Access is gated by canApplyTenantStamp (sign-stamps.routes.ts) for the
// tenant stamp — the same role allow-list Settings ▸ E-Sign manages and the
// same one sign-stamps.routes.ts's own request/approval workflow (M5) exists
// for someone who doesn't clear it. A personal stamp has no gate beyond
// "it's yours" — applying your own saved signature to something never
// needed a permission system.

import { PDFDocument } from 'pdf-lib';
import { withTenant } from '../db/client.js';
import { drawStampImage } from './sign-pdf.service.js';
import { canApplyTenantStamp } from '../routes/sign-stamps.routes.js';

export class StampAccessDeniedError extends Error {
  constructor() {
    super('This role does not have stamp access. Use "Request stamping" instead.');
    this.name = 'StampAccessDeniedError';
  }
}

export interface ApplyStampOptions {
  tenantId: string;
  userId: string;
  userRole: string;
  pdfBytes: Buffer;
  /** Fractional (0–1) position on the given page, top-left origin — same
   *  convention sign_fields already uses, so a caller that already knows
   *  how to place a Sign field knows how to place a stamp. */
  position: { page?: number; x: number; y: number; width: number; height: number };
  ownerType: 'tenant' | 'user';
  /** Required when ownerType is 'user' and applying someone other than the
   *  caller's own stamp is ever needed; defaults to the caller. */
  ownerUserId?: string;
}

/** Loads the right saved stamp (role-gated for 'tenant'), draws it onto the
 *  given PDF at the given position, and returns the stamped bytes. Throws
 *  StampAccessDeniedError (not a generic Error) so callers — the route
 *  below, or a future direct caller — can distinguish "not allowed" from
 *  "something broke" and steer the person to the request-stamping flow. */
export async function applyStamp(opts: ApplyStampOptions): Promise<Buffer> {
  const { tenantId, userId, userRole, pdfBytes, position, ownerType } = opts;

  return withTenant(tenantId, async (trx) => {
    if (ownerType === 'tenant') {
      const allowed = await canApplyTenantStamp(trx, tenantId, userRole);
      if (!allowed) throw new StampAccessDeniedError();
    }

    const ownerUserId = ownerType === 'user' ? (opts.ownerUserId ?? userId) : null;
    const stampRow = await trx.selectFrom('sign_stamps').select(['image_data'])
      .where('tenant_id', '=', tenantId)
      .where('owner_type', '=', ownerType)
      .$if(ownerType === 'user', qb => qb.where('owner_user_id', '=', ownerUserId!))
      .executeTakeFirst();
    if (!stampRow) {
      throw new Error(ownerType === 'tenant' ? 'No company stamp has been saved yet.' : 'No personal signature has been saved yet.');
    }

    const m = stampRow.image_data.match(/^data:image\/png;base64,(.+)$/);
    if (!m) throw new Error('The saved stamp image is not a usable PNG.');
    const pngBytes = Buffer.from(m[1], 'base64');

    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const page = pages[Math.max(0, (position.page ?? 1) - 1)] ?? pages[0];
    if (!page) throw new Error('The document has no pages to stamp.');

    const { width: pw, height: ph } = page.getSize();
    const boxW = position.width * pw;
    const boxH = position.height * ph;
    const boxX = position.x * pw;
    const boxY = ph - (position.y * ph) - boxH;

    await drawStampImage(doc, page, pngBytes, { x: boxX, y: boxY, width: boxW, height: boxH });

    return Buffer.from(await doc.save());
  });
}
