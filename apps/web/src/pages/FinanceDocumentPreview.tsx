import type {PDFDocumentProxy} from 'pdfjs-dist';
import { FinancePdfViewer } from '../components/FinancePdfViewer.js';
import React,{useEffect,useRef,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {apiFetch,apiFetchBlob} from '../lib/api.js';
import {documentLabels,documentPdfUrl,documentFilename,saveBlob,type FinanceDocumentKind} from '../lib/financeDocuments.js';
import {PageHeader} from '../components/PageHeader.js';
import {Icon} from '../components/Icon.js';
import {Button} from '../components/ui/button.js';
import {Input} from '../components/ui/input.js';
import {Textarea} from '../components/ui/textarea.js';
import {SectionLoading} from '../components/ui/spinner.js';
import {Dialog,DialogContent,DialogTitle} from '../components/ui/dialog.js';
export function FinanceDocumentPreview(){
 const {kind:rawKind,id}=useParams(); const [params]=useSearchParams();
 const kind=rawKind as FinanceDocumentKind; const valid=Object.hasOwn(documentLabels,kind) && !!id;
 const [blob,setBlob]=useState<Blob>();const [url,setUrl]=useState('');const [label,setLabel]=useState('');const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const [send,setSend]=useState(params.get('send')==='1');const [email,setEmail]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [sendError,setSendError]=useState('');
 const [printDoc,setPrintDoc]=useState<PDFDocumentProxy|null>(null);
 const [deliveryError,setDeliveryError]=useState('');
 const [deliveries,setDeliveries]=useState<{id:string;status:string;created_at:string;attempts:number}[]>([]);const [deliveryRevision,setDeliveryRevision]=useState(0);
 useEffect(()=>{if(!valid)return;let active=true;setDeliveryError('');apiFetch<{id:string;status:string;created_at:string;attempts:number}[]>(`/v1/finance/documents/${kind}/${id}/deliveries`).then(rows=>{if(active)setDeliveries(rows);}).catch(()=>{if(active)setDeliveryError('Could not load delivery history. Refresh to retry.');});return()=>{active=false;};},[kind,id,valid,deliveryRevision]);
 const requestKey=useRef(crypto.randomUUID());
 useEffect(()=>{let live=true;let objectUrl='';setBlob(undefined);setUrl('');setError('');if(!valid){setError('Unknown document type.');return;}
 Promise.all([apiFetchBlob(documentPdfUrl(kind,id!)),apiFetch<{label:string}>(`/v1/finance/documents/${kind}/${id}/metadata`)]).then(([bytes,meta])=>{if(!live)return;objectUrl=URL.createObjectURL(bytes);setBlob(bytes);setUrl(objectUrl);setLabel(meta.label);}).catch(e=>{if(live)setError(e.message);});
 return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[kind,id,valid,revision]);
 async function print(){
  if(!printDoc)return;
  const win=window.open('','_blank');
  if(!win){setNotice('Your browser blocked printing. Allow pop-ups and retry, or download this PDF.');return;}
  win.opener=null;
  win.document.write('<!doctype html><html><head><title>Print document</title><style>@page{size:A4;margin:0}html,body{margin:0;background:white}canvas{display:block;width:210mm;height:297mm;break-after:page}canvas:last-child{break-after:auto}@media screen{body{max-width:210mm;margin:auto}}</style></head><body><p id="preparing">Preparing PDF pages for printing…</p></body></html>');win.document.close();win.document.title=label;
  try{
    for(let n=1;n<=printDoc.numPages;n++){
      if(win.closed)return;
      const page=await printDoc.getPage(n);const viewport=page.getViewport({scale:2});const canvas=win.document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d');if(!context)throw new Error('Canvas printing is unavailable.');
      await page.render({canvasContext:context,viewport}).promise;
      win.document.body.appendChild(canvas);
    }
    win.document.getElementById('preparing')?.remove();win.focus();win.print();setNotice('Print preview prepared from this PDF. Choose a printer or save from your browser’s print dialog.');
  }catch{win.close();setNotice('Could not prepare printing. Download the PDF and print the original file.');}
 }
 const collections:Record<FinanceDocumentKind,string>={invoice:'invoices',credit_note:'credit-notes',quotation:'quotations',purchase_order:'purchase-orders',delivery_note:'delivery-documents',bill:'bills',expense:'expenses',expense_report:'expense-reports',vendor_statement:'vendors'};
 return <div className="flex min-w-0 flex-col gap-4"><PageHeader crumbs={[{label:'Finance',to:'/finance'},{label:valid?documentLabels[kind]:'Documents',to:'/finance/'+(valid?collections[kind]:'')},'PDF preview']} titlePlain={label|| (valid?documentLabels[kind]:'Document')} titleEm="preview" subtitle="Live PDF output. Filed and stamped originals stay separate." actions={<div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline" iconOnly aria-label="Back to records"><Link to={'/finance/'+(valid?collections[kind]:'')}><Icon name="arrowLeft" size={14}/></Link></Button><Button iconOnly aria-label="Download PDF" disabled={!blob} onClick={()=>blob&&saveBlob(blob,documentFilename(kind,label||id!))}><Icon name="download" size={14}/></Button><Button iconOnly aria-label="Print" variant="outline" disabled={!printDoc} onClick={print}><Icon name="printer" size={14}/></Button><Button iconOnly aria-label="Send" variant="outline" disabled={!blob} onClick={()=>setSend(true)}><Icon name="mail" size={14}/></Button><Button iconOnly aria-label="Copy internal link" variant="outline" disabled={!blob} onClick={async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname);setNotice('Link copied. Recipients must sign in.');}catch{setNotice('Copy the URL from your browser. Sign-in still required.');}}}><Icon name="link" size={14}/></Button></div>}/>
 {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
 {error?<div role="alert"><p>{error}</p><Button onClick={()=>setRevision(v=>v+1)}>Retry</Button></div>:!url?<SectionLoading/>:<><FinancePdfViewer url={url} label={label} onReady={setPrintDoc}/><p className="text-sm text-muted-foreground">If PDF preview is unavailable on your device, use Download PDF.{params.get('print')==='1'?' Select Print above to open your browser’s print controls.':''}</p></>}
 <section className="rounded-lg border p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Email delivery history</h2><Button variant="outline" iconOnly aria-label="Refresh delivery status" onClick={()=>setDeliveryRevision(v=>v+1)}><Icon name="refresh" size={14}/></Button></div>{deliveryError?<p role="alert" className="mt-2 text-sm text-destructive">{deliveryError}</p>:deliveries.length?<ul className="mt-3 space-y-2 text-sm">{deliveries.map(item=><li key={item.id}>{item.status} · {new Date(item.created_at).toLocaleString()} · {item.attempts} attempts</li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">No email delivery records loaded for this document.</p>}</section>
 <Dialog open={send} onOpenChange={v=>{if(!busy)setSend(v);}}><DialogContent><DialogTitle>Send {valid?documentLabels[kind]:'document'}</DialogTitle><p className="text-sm text-muted-foreground">Review the recipient. A newly generated PDF will be attached and queued for email delivery. Queued does not mean delivered.</p><label className="grid gap-1 text-sm">Recipient email<Input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="grid gap-1 text-sm">Message<Textarea value={message} maxLength={5000} onChange={e=>setMessage(e.target.value)}/></label>{sendError&&<p role="alert">{sendError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setSend(false)}>Cancel</Button><Button disabled={busy||!blob||!email.trim()} onClick={async()=>{setBusy(true);setSendError('');try{await apiFetch(`/v1/finance/documents/${kind}/${id}/send`,{method:'POST',body:JSON.stringify({email:email.trim(),message,requestKey:requestKey.current})});setNotice('Email queued with PDF attached. Delivery is processed by the email outbox.');requestKey.current=crypto.randomUUID();setDeliveryRevision(v=>v+1);setSend(false);}catch(e){setSendError(e instanceof Error?e.message:'Could not queue email.');}finally{setBusy(false);}}}>{busy?'Queuing…':'Queue email'}</Button></div></DialogContent></Dialog>
 </div>;
}
