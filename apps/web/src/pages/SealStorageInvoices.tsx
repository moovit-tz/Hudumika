import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SealStorageInvoice } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { useSealStock } from '../hooks/useSealStock.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

export function SealStorageInvoices() {
  const {rows, loading, error, refresh} = useSealStock();
  const [invoices,setInvoices] = useState<SealStorageInvoice[]>([]);
  const [invoiceError,setInvoiceError] = useState<string|null>(null);
  const [invoiceLoading,setInvoiceLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [message,setMessage] = useState<string|null>(null);
  const [actionError,setActionError] = useState<string|null>(null);
  const [version,setVersion] = useState(0);
  useEffect(() => {
    let active=true; setInvoiceLoading(true);
    apiFetch('/v1/seal/storage-invoices').then(data => {if(active){setInvoices(data);setInvoiceError(null);}})
      .catch(e=>{if(active)setInvoiceError(e.message);}).finally(()=>{if(active)setInvoiceLoading(false);});
    return ()=>{active=false;};
  },[version]);
  async function generate(id:string) {
    setBusy(id);setMessage(null);setActionError(null);
    try {const result=await apiFetch(`/v1/seal/lots/${id}/generate-storage-invoice`,{method:'POST'});setMessage(`Draft ${result.invoice.invoice_number} created. Review and finalize it in FinOps.`);refresh();setVersion(v=>v+1);}
    catch(e){setActionError(e instanceof Error?e.message:'Invoice generation failed.');}
    finally{setBusy(null);}
  }
  return <div className="seal-page">
    <PageHeader crumbs={['SEAL','Billing']} titlePlain="Storage charges &" titleEm="invoices" subtitle="Review accrued charges, create draft invoices and follow their status in FinOps." actions={<Button variant="outline" onClick={()=>{refresh();setVersion(v=>v+1);}}>Refresh</Button>} />
    {message&&<Banner variant="success">{message}</Banner>}{(error||actionError)&&<Banner variant="error">{error||actionError}</Banner>}
    <h2 className="text-lg font-semibold my-4">Unbilled storage charges</h2>
    <Card className="overflow-x-auto">{loading?<SectionLoading/>:<table className="seal-table"><thead><tr><th>Lot</th><th>Warehouse</th><th>Unbilled days</th><th>Charge</th><th>Action</th></tr></thead><tbody>
      {rows.filter(r=>r.onHand>0 || (r.accrual?.amount ?? 0)>0).map(r=><tr key={r.id}><td><Link className="underline" to={`/seal/lots/${r.id}`}>{r.description}</Link></td><td>{r.compartmentName}</td><td>{r.accrual?.days??'—'}</td><td>{r.accrualError??`${r.accrual?.currency} ${r.accrual?.amount.toLocaleString()}`}</td><td><Button size="sm" disabled={busy!==null||!!r.accrualError||!r.accrual||r.accrual.amount<=0} onClick={()=>generate(r.id)}>{busy===r.id?'Generating…':'Generate Draft'}</Button></td></tr>)}
      {!rows.length&&!error&&<tr><td colSpan={5} className="p-8 text-center">No storage charges in this warehouse scope.</td></tr>}
    </tbody></table>}</Card>
    <h2 className="text-lg font-semibold my-4">Generated invoices — all warehouses</h2>
    {invoiceError&&<Banner variant="error">{invoiceError}</Banner>}
    <Card className="overflow-x-auto">{invoiceLoading?<SectionLoading/>:<table className="seal-table"><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {invoices.map(i=><tr key={i.id}><td>{i.invoiceNumber}</td><td>{new Date(i.billDate).toLocaleDateString('en-GB')}</td><td>{i.totals.map(t=><div key={t.currency}>{t.currency} {t.amount.toLocaleString()}</div>)}</td><td><Badge variant={i.status==='Draft'?'warning':'info'}>{i.status}</Badge></td><td><Link className="underline" to={`/finance/invoices/${i.id}`}>Review in FinOps</Link></td></tr>)}
      {!invoices.length&&!invoiceError&&<tr><td colSpan={5} className="p-8 text-center">No storage invoices generated yet.</td></tr>}
    </tbody></table>}</Card>
  </div>;
}
