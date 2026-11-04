import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SealMovementHistoryPage } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

export function SealMovementHistory() {
  const [scope]=useSealCompartmentId();
  const [type,setType]=useState<string|null>(null);
  const [cursor,setCursor]=useState<string|null>(null);
  const [data,setData]=useState<SealMovementHistoryPage>({rows:[],nextCursor:null});
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{setCursor(null);},[scope,type]);
  useEffect(()=>{
    let active=true;setLoading(true);
    const query=new URLSearchParams();if(scope)query.set('compartment_id',scope);if(type)query.set('movement_type',type);if(cursor)query.set('before',cursor);
    apiFetch(`/v1/seal/movements?${query}`).then(result=>{if(active){setData(result);setError(null);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[scope,type,cursor]);
  return <div className="seal-page"><PageHeader crumbs={['SEAL','Reports']} titlePlain="Movement" titleEm="history" subtitle="Recorded receipts, putaway, picks, transfers and adjustments."/>
    <div className="mb-4"><SingleSelectFilter label="Movement" value={type} onChange={setType} options={['receipt','putaway','pick','transfer','adjust','release','destroy','status_change','return'].map(t=>({value:t,label:t.replace('_',' ')}))}/></div>
    {error&&<Banner variant="error">{error}</Banner>}
    <Card className="overflow-x-auto">{loading?<SectionLoading/>:<table className="seal-table"><thead><tr><th>When</th><th>Lot</th><th>Movement</th><th>Quantity change</th><th>Reference / reason</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.id}><td>{new Date(r.occurred_at).toLocaleString('en-GB')}</td><td><Link className="underline" to={`/seal/lots/${r.lot_id}`}>{r.description}</Link></td><td>{r.movement_type.replace('_',' ')}</td><td>{Number(r.qty_delta).toLocaleString()} {r.uom}</td><td>{r.reference??r.reason_code??'—'}</td></tr>)}{!data.rows.length&&!error&&<tr><td colSpan={5} className="p-8 text-center">No movements in this scope.</td></tr>}</tbody></table>}</Card>
    <div className="flex justify-end gap-3 mt-4">{cursor&&<Button variant="outline" onClick={()=>setCursor(null)}>Latest</Button>}<Button variant="outline" disabled={loading||!data.nextCursor} onClick={()=>setCursor(data.nextCursor)}>Older movements</Button></div>
  </div>;
}
