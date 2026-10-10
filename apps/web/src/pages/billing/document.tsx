import { QRCodeSVG } from 'qrcode.react';
import { CompanyAvatar } from '../../components/PersonAvatar.js';
import { Card, CardContent } from '../../components/ui/card.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table.js';
import { formatAmount } from '../../lib/currency.js';
import { useInvoiceTemplate } from '../../lib/documentTemplates.js';
import { getCompany } from '../../data/companyStore.js';
import { invoiceTotals, type Invoice } from './shared.js';

export function InvoiceDocument({inv}: {inv:Invoice}) {
 const layout=useInvoiceTemplate();
 const company=getCompany();
 const logo = layout === 'compact' ? (company.logoVerticalDark || company.logoUrlDark || company.logoVerticalLight || company.logoUrl) : layout === 'classic' ? company.logoUrl : (company.logoVerticalLight || company.logoUrl); const currency=inv.documentCurrency || 'TZS'; const totals=invoiceTotals(inv);
 const money=(amount:number)=>formatAmount(amount,currency);
 const balance=Math.max(0,totals.documentTotal-inv.received);
 const subtotal=inv.items.reduce((sum,item)=>{
  const net=Math.round(item.qty*item.rate*100)/100;
  return sum+((item.currency || currency)===currency?net:Math.round(item.qty*item.rate*inv.exchangeRate*100)/100);
 },0);
 return <Card data-invoice-document={inv.id} data-document-template={layout} className="mx-auto w-full max-w-5xl"><CardContent className="p-5 sm:p-8 lg:p-12">
  <div className="grid gap-8 border-b pb-8 sm:grid-cols-2">
   <div className={`flex items-start gap-4 ${layout === 'compact' ? 'invoice-company-dark rounded-lg p-5' : ''}`}><CompanyAvatar name={company.name} logoUrl={logo} size={layout === 'modern' ? 80 : 56} shape="square" /><div><div className="font-semibold">{company.name}</div><div className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{[company.address,[company.city,company.country].filter(Boolean).join(', '),company.email,company.phone,company.taxId?`Tax ID: ${company.taxId}`:''].filter(Boolean).join('\n')}</div></div></div>
   <div className="sm:text-right"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice</div><div className="mt-2 break-words text-2xl font-semibold">{inv.id}</div><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Issued</dt><dd>{inv.billDate}</dd><dt className="text-muted-foreground">Due</dt><dd>{inv.dueDate || 'Upon receipt'}</dd><dt className="text-muted-foreground">Currency</dt><dd>{currency}</dd></dl></div>
  </div>
  <div className="my-8 grid gap-6 sm:grid-cols-2"><div><div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill to</div><div className="font-semibold">{inv.client}</div><div className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{inv.clientAddress.join('\n')}</div></div>{(inv.shipmentRef || inv.blNumber) && <div><div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shipment reference</div><div className="text-sm leading-6">{inv.shipmentRef || inv.blNumber}<br/>{[inv.origin,inv.destination].filter(Boolean).join(' → ')}</div></div>}</div>
  <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Tax</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{inv.items.map((item,index)=>{
   const gross=Math.round(item.qty*item.rate*(1+item.taxPct/100)*100)/100;
   const converted=(item.currency || currency)===currency?gross:Math.round(gross*inv.exchangeRate*100)/100;
   return <TableRow key={index}><TableCell className="min-w-44 whitespace-pre-line py-5 font-medium">{item.name}</TableCell><TableCell className="text-right">{item.qty}</TableCell><TableCell>{item.unit}</TableCell><TableCell className="whitespace-nowrap text-right">{formatAmount(item.rate,item.currency || currency)}</TableCell><TableCell className="text-right">{item.taxPct}%</TableCell><TableCell className="whitespace-nowrap text-right font-medium">{money(converted)}</TableCell></TableRow>;
  })}</TableBody></Table>
  <dl className="ml-auto mt-8 grid w-full max-w-sm grid-cols-2 gap-y-4 text-sm"><dt className="text-muted-foreground">Subtotal</dt><dd className="text-right">{money(subtotal)}</dd><dt className="text-muted-foreground">Tax</dt><dd className="text-right">{money(totals.documentTotal-subtotal)}</dd><dt className="border-t pt-4 font-semibold">Total</dt><dd className="border-t pt-4 text-right font-semibold">{money(totals.documentTotal)}</dd><dt className="text-muted-foreground">Paid</dt><dd className="text-right">{money(inv.received)}</dd><dt className="border-t pt-4 text-base font-semibold">Amount due</dt><dd className="border-t pt-4 text-right text-base font-semibold text-primary">{money(balance)}</dd></dl>
  {inv.items.some(item=>item.currency!==currency)&&<p className="mt-4 text-sm text-muted-foreground">Foreign line amounts converted using this invoice’s recorded exchange rate: {inv.exchangeRate}.</p>}
  {inv.traStatus==='submitted' && inv.traAckCode===0 && <section className="mt-8 flex flex-wrap items-center gap-4 border-t pt-6">{inv.traQrUrl && <QRCodeSVG value={inv.traQrUrl} size={80}/>}<div><h3 className="font-semibold">Fiscal receipt</h3><p className="text-sm text-muted-foreground">Verification: {inv.traRctvnum}</p></div></section>}
  {inv.shipmentCarbon && <section className="mt-8 border-t pt-6"><h3 className="font-semibold">Shipment emissions estimate</h3><p className="mt-2 text-sm text-muted-foreground">{Number(inv.shipmentCarbon.co2_emissions_kg).toLocaleString()} kg CO₂ · GLEC / ISO 14083 methodology. Internal estimate, not a registry-issued carbon credit.</p></section>}
  {!!inv.payments?.length && <section className="mt-8 border-t pt-6"><h3 className="mb-4 font-semibold">Payments</h3><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{inv.payments.map(payment=><TableRow key={payment.id}><TableCell>{payment.date}</TableCell><TableCell>{payment.method}</TableCell><TableCell className="text-right">{money(payment.amount)}</TableCell></TableRow>)}</TableBody></Table></section>}
  {inv.terms&&<section className="mt-10 border-t pt-6"><h3 className="font-semibold">Terms and payment instructions</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{inv.terms}</p></section>}
 </CardContent></Card>;
}
