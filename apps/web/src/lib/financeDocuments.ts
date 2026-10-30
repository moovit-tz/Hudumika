import { apiDownload, apiFetchBlob } from './api.js';
export type FinanceDocumentKind = 'invoice' | 'credit_note' | 'quotation' | 'purchase_order' | 'delivery_note' | 'bill' | 'expense' | 'expense_report' | 'vendor_statement';
export const documentLabels: Record<FinanceDocumentKind,string> = {invoice:'Invoice',credit_note:'Credit note',quotation:'Quotation',purchase_order:'Purchase order',delivery_note:'Delivery document',bill:'Supplier bill',expense:'Expense voucher',expense_report:'Expense claim report',vendor_statement:'Vendor statement'};
export const documentPreviewUrl = (kind: FinanceDocumentKind,id: string) => `/finance/documents/${kind}/${encodeURIComponent(id)}/preview`;
export const documentPdfUrl = (kind: FinanceDocumentKind,id: string) => `/v1/finance/documents/${kind}/${encodeURIComponent(id)}/pdf`;
export const documentFilename = (kind: FinanceDocumentKind,label: string) => `${kind}_${label.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,100)}.pdf`;
export function saveBlob(blob: Blob,filename: string) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export async function downloadDocument(kind: FinanceDocumentKind,id: string,label: string) { await apiDownload(`${documentPdfUrl(kind,id)}?download=1`,documentFilename(kind,label)); }
export async function downloadDocumentBatch(documents: {kind: FinanceDocumentKind;id:string}[]) {
  if(documents.length>30)throw new Error('Select up to 30 documents per ZIP download.');
  const blob=await apiFetchBlob('/v1/finance/documents/batch',{method:'POST',body:JSON.stringify({documents})}); saveBlob(blob,'finance-documents.zip');
}
export { csvCell, csvText } from '@hudumika/types';
