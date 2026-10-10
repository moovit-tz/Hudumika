import { useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Badge } from '../components/ui/badge.js';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { getCompany } from '../data/companyStore.js';
import { DOCUMENT_KINDS, DOCUMENT_TEMPLATES, useDocumentTemplate, type DocumentKind, type DocumentTemplateId } from '../lib/documentTemplates.js';
import './StoreDocumentTemplates.css';

const DOCUMENT_COPY: Record<DocumentKind, { party:string; partyName:string; number:string; total:string; note:string }> = {
  invoice:{ party:'Bill to', partyName:'Bahari Logistics Ltd', number:'INV-2026-0042', total:'Amount due', note:'Payment due within 30 days.' },
  credit_note:{ party:'Credit to', partyName:'Bahari Logistics Ltd', number:'CN-2026-0011', total:'Total credited', note:'Credit against invoice INV-2026-0036.' },
  purchase_order:{ party:'Supplier', partyName:'East Africa Office Supplies', number:'PO-2026-0087', total:'Order total', note:'Deliver to the main warehouse by 16 October 2026.' },
  quotation:{ party:'Prepared for', partyName:'Bahari Logistics Ltd', number:'QUO-2026-0064', total:'Quotation total', note:'This quotation is valid for 30 days.' },
  delivery_note:{ party:'Deliver to', partyName:'Bahari Logistics Ltd', number:'DN-2026-0039', total:'Goods received', note:'Received in good order. Receiver signature required.' },
};

const LINES = [
  ['Customs clearance service', '1', 'TZS 850,000'],
  ['Documentation and handling', '2', 'TZS 240,000'],
  ['Local delivery', '1', 'TZS 320,000'],
];

function DocumentPreview({ kind, layout, mode }:{ kind:DocumentKind; layout:DocumentTemplateId; mode:'desktop'|'mobile' }) {
  const company = getCompany();
  const copy = DOCUMENT_COPY[kind];
  const label = DOCUMENT_KINDS.find(item => item.id === kind)?.label.replace(/s$/, '') ?? kind;
  const delivery = kind === 'delivery_note';
  return <div className={`sdt-preview-stage sdt-preview-stage--${mode}`}>
    <article className={`sdt-paper sdt-paper--${layout}`} data-document-template={layout}>
      <header className="sdt-document-head">
        <div className="sdt-company-block">
          <div className="sdt-company-mark">{company.name.slice(0, 2).toUpperCase()}</div>
          <div><strong>{company.name}</strong><span>{company.address || 'Samora Avenue, Dar es Salaam'}<br/>{company.email || 'accounts@company.co.tz'}<br/>{company.taxId ? `TIN ${company.taxId}` : 'TIN 100-200-300'}</span></div>
        </div>
        <div className="sdt-document-meta"><small>{label}</small><h2>{copy.number}</h2><dl><dt>Issued</dt><dd>9 Oct 2026</dd><dt>{delivery ? 'Status' : 'Currency'}</dt><dd>{delivery ? 'Ready' : 'TZS'}</dd></dl></div>
      </header>
      <section className="sdt-party"><small>{copy.party}</small><strong>{copy.partyName}</strong><span>Plot 18, Nyerere Road<br/>Dar es Salaam, Tanzania</span></section>
      <div className="sdt-line-table">
        <div className="sdt-line-head"><span>Description</span><span>Qty</span><span>{delivery ? 'Unit' : 'Amount'}</span></div>
        {LINES.map(([name, qty, amount]) => <div key={name}><span>{name}</span><span>{qty}</span><span>{delivery ? 'EA' : amount}</span></div>)}
      </div>
      {!delivery && <dl className="sdt-totals"><dt>Subtotal</dt><dd>TZS 1,410,000</dd><dt>VAT (18%)</dt><dd>TZS 253,800</dd><dt>{copy.total}</dt><dd>TZS 1,663,800</dd></dl>}
      {delivery && <div className="sdt-signatures"><div><span>Prepared by</span><i/></div><div><span>Received by</span><i/></div></div>}
      <footer><strong>{delivery ? copy.total : 'Notes & terms'}</strong><p>{copy.note}</p></footer>
    </article>
  </div>;
}

export function StoreDocumentTemplates() {
  const [kind, setKind] = useState<DocumentKind>('invoice');
  const [preview, setPreview] = useState<DocumentTemplateId|null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop'|'mobile'>('desktop');
  const selected = useDocumentTemplate(kind);
  const kindLabel = DOCUMENT_KINDS.find(d => d.id === kind)!.label;
  const { user } = useAuth();
  const canSave = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  async function choose(id: DocumentTemplateId) {
    setSaving(id); setError('');
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ documentTemplates: { [kind]: id } }) });
      window.dispatchEvent(new Event('hudumika-document-template-updated'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Template could not be saved.'); }
    finally { setSaving(''); }
  }

  return <div className="space-y-6">
    <PageHeader crumbs={['Store', 'Templates']} titlePlain="Document" titleEm="templates" subtitle="Preview and choose a layout for each workspace document type. Financial amounts and payment records stay the same." />
    <div className="max-w-sm"><Select value={kind} onValueChange={v => setKind(v as DocumentKind)} disabled={!!saving}><SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger><SelectContent>{DOCUMENT_KINDS.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent></Select></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-6 md:grid-cols-3">{DOCUMENT_TEMPLATES.map(t => <Card key={t.id}>
      <CardHeader><CardTitle>{t.name}</CardTitle><CardDescription>{t.description}</CardDescription></CardHeader>
      <CardContent><button type="button" className="sdt-card-preview" onClick={() => setPreview(t.id)} aria-label={`Preview ${t.name} ${kindLabel}`} data-ui-native-button=""><DocumentPreview kind={kind} layout={t.id} mode="mobile"/><span><Icon name="eye" size={14}/>Open preview</span></button></CardContent>
      <CardFooter className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setPreview(t.id)}><Icon name="eye" size={14}/>Preview</Button>{selected === t.id ? <Badge variant="success">Selected</Badge> : <Button disabled={!canSave || !!saving} onClick={() => choose(t.id)}>{saving === t.id ? 'Saving…' : 'Use template'}</Button>}</CardFooter>
    </Card>)}</div>
    <p className="text-sm text-muted-foreground">Previews use realistic sample data. Selecting a layout changes printed documents and PDFs; it does not alter transactions, tax or payment records.</p>

    <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
      <DialogContent size="xl"><DialogHeader><DialogTitle>{DOCUMENT_TEMPLATES.find(item => item.id === preview)?.name} {kindLabel} preview</DialogTitle></DialogHeader>
        <DialogBody className="sdt-dialog-body">
          <div className="sdt-preview-toolbar"><div><Button size="sm" variant={previewMode === 'desktop' ? 'default' : 'outline'} onClick={() => setPreviewMode('desktop')}><Icon name="monitor" size={14}/>Desktop</Button><Button size="sm" variant={previewMode === 'mobile' ? 'default' : 'outline'} onClick={() => setPreviewMode('mobile')}><Icon name="smartphone" size={14}/>Mobile</Button></div><Badge variant="gray">Sample data</Badge></div>
          {preview && <DocumentPreview kind={kind} layout={preview} mode={previewMode}/>} 
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>Close</Button>{preview && selected !== preview && <Button disabled={!canSave || !!saving} onClick={() => choose(preview)}>{saving ? 'Saving…' : 'Use this template'}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
