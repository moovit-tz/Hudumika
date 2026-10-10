export const DOCUMENT_KINDS = [
  { id: 'invoice', label: 'Invoices' },
  { id: 'credit_note', label: 'Credit notes' },
  { id: 'purchase_order', label: 'Purchase orders' },
  { id: 'quotation', label: 'Quotations' },
  { id: 'delivery_note', label: 'Delivery notes' },
] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number]['id'];
export const DOCUMENT_TEMPLATES = [
  { id: 'modern', name: 'Modern', description: 'Spacious layout with a stacked logo and clear document details.' },
  { id: 'compact', name: 'Compact', description: 'Compact company block on a dark background.' },
  { id: 'classic', name: 'Classic', description: 'Clean business layout with a horizontal logo.' },
] as const;
export type DocumentTemplateId = typeof DOCUMENT_TEMPLATES[number]['id'];
export function templateId(value: unknown, fallback: DocumentTemplateId = 'modern'): DocumentTemplateId {
  return DOCUMENT_TEMPLATES.some(t => t.id === value) ? value as DocumentTemplateId : fallback;
}
export function documentTemplate(settings: { documentTemplates?: Partial<Record<DocumentKind, unknown>> }, kind: DocumentKind): DocumentTemplateId {
  return templateId(settings.documentTemplates?.[kind], kind === 'invoice' ? 'modern' : 'classic');
}
export interface DocumentLogos {
  logoUrl?: string | null; logoUrlDark?: string | null;
  logoVerticalLight?: string | null; logoVerticalDark?: string | null;
}
export function documentLogo(company: DocumentLogos, layout: DocumentTemplateId): string | null {
  return (layout === 'compact'
    ? company.logoVerticalDark || company.logoUrlDark || company.logoVerticalLight || company.logoUrl
    : layout === 'classic' ? company.logoUrl || company.logoVerticalLight : company.logoVerticalLight || company.logoUrl) || null;
}
