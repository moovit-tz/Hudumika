import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import { documentTemplate, type DocumentKind, type DocumentTemplateId } from '@hudumika/types';
export { DOCUMENT_KINDS, DOCUMENT_TEMPLATES, templateId, documentLogo } from '@hudumika/types';
export type { DocumentKind, DocumentTemplateId } from '@hudumika/types';
export function useDocumentTemplate(kind: DocumentKind) {
  const [selection, setSelection] = useState<{kind: DocumentKind; id: DocumentTemplateId}>({kind, id: kind === 'invoice' ? 'modern' : 'classic'});
  useEffect(() => {
    let active = true;
    const load = () => apiFetch('/v1/settings').then(r => { if (active) setSelection({kind, id: documentTemplate(r.settings ?? {}, kind)}); }).catch(() => {});
    void load(); window.addEventListener('hudumika-document-template-updated', load);
    return () => { active = false; window.removeEventListener('hudumika-document-template-updated', load); };
  }, [kind]);
  return selection.kind === kind ? selection.id : kind === 'invoice' ? 'modern' : 'classic';
}
export function useInvoiceTemplate() { return useDocumentTemplate('invoice'); }
