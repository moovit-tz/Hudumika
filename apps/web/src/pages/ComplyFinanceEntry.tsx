import {useEffect, useState, type FormEvent} from 'react';
import {Link, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import type {RenewalFinanceRecordOption, CostLineCategory} from '@hudumika/types';
import {apiFetch} from '../lib/api.js';
import {PageHeader} from '../components/PageHeader.js';
import {Icon} from '../components/Icon.js';
import {Button} from '../components/ui/button.js';
import {Input} from '../components/ui/input.js';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '../components/ui/select.js';
import {Combobox} from '../components/ui/combobox.js';
import {DatePicker, toDateOnlyString} from '../components/ui/date-picker.js';
import {useCycleCostLines} from '../hooks/useRenewalFinance.js';
import './ComplyOS.css';

const categories: CostLineCategory[]=['authority_application','authority_renewal','inspection','late_penalty','agent_fee','translation','document','travel','platform_charge','other'];
export function ComplyFinanceEntry() {
  const {cycleId,action}=useParams();
  const [params]=useSearchParams();
  const navigate=useNavigate();
  const back=`/complyos/renewal-finance/${cycleId}`;
  const [currency,setCurrency]=useState(params.get('currency')??'TZS');
  const [description,setDescription]=useState('');
  const [amount,setAmount]=useState('');
  const [category,setCategory]=useState<CostLineCategory>('authority_renewal');
  const [due,setDue]=useState<Date>();
  const [lineId,setLineId]=useState('');
  const [recordId,setRecordId]=useState('');
  const [search,setSearch]=useState('');
  const [records,setRecords]=useState<RenewalFinanceRecordOption[]>([]);
  const [recordsError,setRecordsError]=useState<string|null>(null);
  const [recordsLoading,setRecordsLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const {data:lines,error:linesError}=useCycleCostLines(cycleId??null);
  useEffect(()=>{
    if(action!=='allocation')return;
    let active=true;
    const timer=setTimeout(async()=>{
      setRecordsLoading(true);setRecordsError(null);
      try {const result=await apiFetch(`/v1/renewal-finance/finance-records?currency=${encodeURIComponent(currency)}&search=${encodeURIComponent(search)}`);if(active)setRecords(result);}
      catch(e){if(active){setRecords([]);setRecordsError(e instanceof Error?e.message:'Unable to load Finance records');}}
      finally{if(active)setRecordsLoading(false);}
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[action,currency,search]);
  if(!cycleId || !['cost-line','budget','allocation'].includes(action??''))return <p role="alert">Unknown renewal finance action.</p>;
  async function submit(event:FormEvent) {
    event.preventDefault();setError(null);
    const value=Number(amount);
    if(!Number.isFinite(value)||value<0||!amount)return setError('Enter a valid amount.');
    setSaving(true);
    try {
      if(action==='cost-line')await apiFetch('/v1/renewal-finance/cost-lines',{method:'POST',body:JSON.stringify({cycle_id:cycleId,category,description,unit_price:value,currency,source_type:'manual_estimate',...(due?{due_date:toDateOnlyString(due)}:{})})});
      else if(action==='budget')await apiFetch('/v1/renewal-finance/budgets',{method:'POST',body:JSON.stringify({cycle_id:cycleId,approved_amount:value,currency,reason:description})});
      else {
        const record=records.find(r=>r.id===recordId);
        if(!record||!lineId)throw new Error('Select a cost line and a Finance record.');
        if(value<=0||value>record.available)throw new Error('Amount must be positive and within the available Finance balance.');
        await apiFetch('/v1/renewal-finance/allocations',{method:'POST',body:JSON.stringify({cycle_id:cycleId,cost_line_id:lineId,finance_record_type:record.type,finance_record_id:record.id,allocation_type:record.type==='supplier_bill'?'bill':'payment',amount:value,currency,notes:description})});
      }
      navigate(back);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setSaving(false);}
  }
  return <div className="comply-page comply-finance-entry">
    <PageHeader crumbs={['ComplyOS','Renewal Finance']} titlePlain={action==='cost-line'?'Add cost':action==='budget'?'Request':'Link Finance'} titleEm={action==='cost-line'?'line':action==='budget'?'budget':'record'} subtitle={action==='allocation'?'Link an existing posted supplier bill or recorded payment. This does not send money.':action==='budget'?'A different administrator must approve this request. Your existing approved budget stays active until a replacement is approved.':'Record one charge in its original currency. Estimates do not count as payments.'} actions={<Link to={back}><Button variant="outline" iconOnly aria-label="Cancel">
  <Icon name="x" size={14} />
</Button></Link>}/>
    <form onSubmit={submit} className="comply-finance-entry-form">
      {(error||linesError||recordsError)&&<p role="alert" className="comply-finance-error">{error||linesError||recordsError}</p>}
      <label>Currency<Select value={currency} onValueChange={c=>{setCurrency(c);setLineId('');setRecordId('');setRecords([]);}}><SelectTrigger aria-label="Currency"><SelectValue/></SelectTrigger><SelectContent>{[...new Set(['TZS','USD','KES','EUR','GBP',...lines.map(l=>l.currency)])].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></label>
      {action==='cost-line'&&<><label>Category<Select value={category} onValueChange={c=>setCategory(c as CostLineCategory)}><SelectTrigger aria-label="Category"><SelectValue/></SelectTrigger><SelectContent>{categories.map(c=><SelectItem key={c} value={c}>{c.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select></label><label>Due date<DatePicker date={due} onChange={setDue}/></label></>}
      {action==='allocation'&&<>
        <label>Cost line<Combobox value={lineId} onChange={setLineId} options={lines.filter(l=>l.currency===currency).map(l=>({value:l.id,label:`${l.description} · ${l.currency} ${l.total_amount}`}))} placeholder="Select cost line"/></label>
        <label>Find bill or payment<Input value={search} onChange={e=>{setSearch(e.target.value);setRecordId('');}} placeholder="Search bill number or supplier"/></label>
        <label>Finance record<Combobox value={recordId} onChange={setRecordId} disabled={recordsLoading} options={records.map(r=>({value:r.id,label:`${r.label} · available ${r.currency} ${r.available}`}))} placeholder={recordsLoading?'Loading records…':'Select posted bill or payment'}/></label>
        {!recordsLoading&&!records.length&&!recordsError&&<p>No eligible records found. Create and post a bill or record its payment in <Link to="/finops/bills">FinOps bills</Link>, then return here.</p>}
        <p>Supplier refunds, credits and expense settlements cannot be linked until Finance supplies an authoritative settlement record.</p>
      </>}
      <label>{action==='budget'?'Reason':action==='allocation'?'Notes':'Description'}<Input required={action!=='allocation'} value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000}/></label>
      <label>{action==='budget'?'Budget amount':action==='allocation'?'Amount to allocate':'Estimated amount'} ({currency})<Input type="number" min={action==='allocation'?'0.01':'0'} max="1000000000000" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <Button type="submit" disabled={saving||!!linesError||!!recordsError}>{saving?'Saving…':action==='budget'?'Request approval':action==='allocation'?'Link record':'Save cost line'}</Button>
    </form>
  </div>;
}
