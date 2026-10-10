import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { InvoicePaymentSummary } from '@hudumika/types';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { formatAmount } from '../lib/currency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
export function InvoicePaymentPage() {
 const {id=''}=useParams();const {user}=useAuth();const [invoice,setInvoice]=useState<InvoicePaymentSummary|null>(null);
 const [error,setError]=useState('');const [downloading,setDownloading]=useState(false);
 useEffect(()=>{let live=true;setInvoice(null);setError('');if(user)apiFetch<InvoicePaymentSummary>(`/v1/invoice-payment/${encodeURIComponent(id)}`).then(data=>{if(live)setInvoice(data);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id,user]);
 async function download(){setDownloading(true);try{await apiDownload(`/v1/invoice-payment/${encodeURIComponent(id)}/pdf`,`${invoice?.invoice_number || 'invoice'}.pdf`);}catch(e){setError(e instanceof Error?e.message:'Download failed.');}finally{setDownloading(false);}}
 return <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
  <PageHeader crumbs={['Invoice']} titlePlain="Invoice" titleEm="payment" subtitle={invoice?.company_name || 'View your invoice and outstanding balance.'}/>
  {!user&&<Card><CardContent className="space-y-4 p-6"><p>Sign in with your customer account to view this invoice.</p><Button asChild><a href="/login" target="_blank" rel="noreferrer">Sign in</a></Button><Button variant="outline" onClick={()=>window.location.reload()}>Continue after sign-in</Button></CardContent></Card>}
  {error&&<Banner variant="error">{error}</Banner>}
  {user&&!invoice&&!error&&<p role="status">Loading invoice…</p>}
  {invoice&&<Card><CardContent className="space-y-6 p-5 sm:p-8">
   <div><h2 className="break-words text-xl font-semibold">{invoice.invoice_number}</h2><p className="mt-2 text-muted-foreground">{invoice.customer_name}</p></div>
   <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Total</dt><dd className="text-right">{formatAmount(invoice.total,invoice.currency)}</dd><dt>Paid</dt><dd className="text-right">{formatAmount(invoice.received,invoice.currency)}</dd><dt className="border-t pt-4 font-semibold">Amount due</dt><dd className="border-t pt-4 text-right text-lg font-semibold">{formatAmount(invoice.balance,invoice.currency)}</dd></dl>
   {invoice.balance===0?<Banner variant="success">This invoice has no outstanding balance.</Banner>:invoice.providers.some(p=>p.available)?<Banner variant="info">Online payment is available via {invoice.providers.filter(p=>p.available).map(p=>p.name).join(', ')}. Contact {invoice.company_name} to receive a payment link.</Banner>:<Banner variant="info">Online payments will be available once a payment gateway is connected. Contact {invoice.company_name} for payment instructions.</Banner>}
   <div className="grid gap-3 sm:grid-cols-2">{invoice.providers.map(provider=><div key={provider.id} className="rounded-lg border p-4"><div className="flex items-center gap-2"><div className="font-medium">{provider.name}</div>{provider.available&&<span className="inline-block h-2 w-2 rounded-full bg-[var(--green)]" />}</div><p className="mt-1 text-sm text-muted-foreground">{provider.available?'Connected':'Not connected'}</p></div>)}</div>
   <Button className="w-full sm:w-auto" disabled={downloading} onClick={download}>{downloading?'Downloading…':'Download PDF'}</Button>
   <p className="text-xs text-muted-foreground">Invoice access is restricted to its customer and authorised finance staff.</p>
  </CardContent></Card>}
 </div>;
}
