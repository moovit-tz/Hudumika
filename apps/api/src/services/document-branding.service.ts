import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dbPlatform } from '../db/client.js';
import { documentLogo, documentTemplate, type DocumentKind, type DocumentTemplateId } from '@hudumika/types';
export interface DocumentBranding { layout: DocumentTemplateId; accent: string; logo: Buffer | null; fonts?: { regular: Buffer; bold: Buffer } }
let fontAssets: Promise<{ regular: Buffer; bold: Buffer }> | undefined;
export async function documentFonts(font: string) {
  if (font !== 'atlassian-sans') return undefined;
  fontAssets ??= Promise.all([
    readFile(new URL('../assets/fonts/AtlassianSans-Regular.ttf', import.meta.url)),
    readFile(new URL('../assets/fonts/AtlassianSans-Bold.ttf', import.meta.url)),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fontAssets;
}
async function platformDocumentFont(): Promise<string> {
  // Read only the public design-token sentinel, never another tenant's settings.
  const row = await dbPlatform.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', '00000000-0000-0000-0000-000000000000').executeTakeFirst();
  const settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
  return settings?.['design-tokens']?.typography?.font ?? 'atlassian-sans';
}
/** Only embedded uploads are decoded: a document render must never fetch tenant-supplied URLs. */
export async function documentBranding(settings: any, kind: DocumentKind): Promise<DocumentBranding> {
  const layout = documentTemplate(settings ?? {}, kind);
  const source = documentLogo(settings?.company ?? {}, layout);
  let logo: Buffer | null = null;
  const match = source?.match(/^data:image\/(png|jpeg|jpg|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/);
  if (match && match[2].length <= 3 * 1024 * 1024) {
    try {
      logo = await sharp(Buffer.from(match[2], 'base64'), { limitInputPixels: 16_000_000 })
        .resize({ width: 320, height: 240, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    } catch { /* An unsupported image leaves the company name as the document identity. */ }
  }
  const accent = /^#[0-9a-f]{6}$/i.test(settings?.branding?.accentColor ?? '') ? settings.branding.accentColor : '#1257c6';
  return { layout, accent, logo, fonts: await documentFonts(await platformDocumentFont()) };
}
// Dedicated aliases avoid PDFKit's pre-cached default Helvetica overriding an embedded face.
export function applyDocumentFonts(doc: PDFKit.PDFDocument, brand?: DocumentBranding) {
  doc.registerFont('Document-Regular', brand?.fonts?.regular ?? 'Helvetica');
  doc.registerFont('Document-Bold', brand?.fonts?.bold ?? 'Helvetica-Bold');
}
export function drawDocumentHeader(doc: PDFKit.PDFDocument, brand: DocumentBranding, company: {name: string; address: string}, title: string, number: string, x: number, y: number, width: number): number {
  applyDocumentFonts(doc, brand);
  const compact = brand.layout === 'compact';
  const companyWidth = width * .55;
  const inset = compact ? 12 : 0;
  const logoWidth = brand.layout === 'modern' ? 64 : 48;
  const nameX = x + inset + (brand.logo ? logoWidth + 12 : 0);
  const textWidth = companyWidth - (nameX - x) - 12;
  const companyHeight = doc.font('Document-Bold').fontSize(14).heightOfString(company.name, {width: textWidth}) +
    doc.font('Document-Regular').fontSize(8.5).heightOfString(company.address || '', {width: textWidth}) + 12;
  const height = Math.max(72, companyHeight + inset * 2);
  if (compact) doc.roundedRect(x, y, companyWidth, height, 8).fill('#161a1e');
  if (brand.logo) doc.image(brand.logo, x + inset, y + inset, { fit: [logoWidth, 56] });
  doc.font('Document-Bold').fontSize(14).fillColor(compact ? '#ffffff' : '#0b1220').text(company.name, nameX, y + inset, {width: textWidth});
  doc.font('Document-Regular').fontSize(8.5).fillColor(compact ? '#dfe3e8' : '#5b6472').text(company.address, nameX, doc.y + 4, {width: textWidth});
  const metaX = x + companyWidth + 16;
  doc.font('Document-Bold').fontSize(18).fillColor(brand.accent).text(title, metaX, y, {width: width - companyWidth - 16, align: 'right'});
  doc.font('Document-Regular').fontSize(9).fillColor('#5b6472').text(number, metaX, doc.y + 4, {width: width - companyWidth - 16, align: 'right'});
  return Math.max(y + height, doc.y) + (brand.layout === 'modern' ? 24 : 12);
}
