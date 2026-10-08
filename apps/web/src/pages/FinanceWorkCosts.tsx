import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { IndustryCostAllocation, IndustryCostSource, IndustryWork } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import './FinanceIndustries.css';

type Costs = { data: IndustryCostSource[]; has_more: boolean; allocations: IndustryCostAllocation[] };
const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS' }).format(amount);
export function FinanceWorkCosts() {
  const { id, industry } = useParams();
  const [work, setWork] = useState<IndustryWork>(); const [costs, setCosts] = useState<Costs>();
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [source, setSource] = useState<IndustryCostSource>(); const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true; setCosts(undefined); setSource(undefined);
    const timer = setTimeout(() => {
      Promise.all([apiFetch<IndustryWork>(`/v1/finance/industries/${id}`), apiFetch<Costs>(`/v1/finance/industries/${id}/costs?search=${encodeURIComponent(search)}&page=${page}`)])
        .then(([job, result]) => { if (live) { setWork(job); setCosts(result); setError(''); } })
        .catch(err => { if (live) setError(err.message); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [id, search, page, revision]);
  async function mutate(path: string, body: object) {
    setBusy(true); setError('');
    try { await apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); setRevision(value => value + 1); setReason(''); setAmount(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to save allocation.'); }
    finally { setBusy(false); }
  }
  if (work && work.industry !== industry) return <p role="alert">This job belongs to another workspace.</p>;
  const allowed = work?.currency === 'TZS' && ['active', 'completed'].includes(work.status);
  return <div className="industry-page">
    <PageHeader crumbs={[{ label: 'Finance', to: '/finance' }, { label: work?.reference || 'Job', to: `/finance/industries/${industry}/${id}` }, 'Costs']} titlePlain="Allocate job" titleEm="costs" subtitle="Assign posted bills, expenses and payroll costs to a job. Company profit stays unchanged." actions={<Button variant="outline" asChild><Link to={`/finance/industries/${industry}/${id}`}>View job</Link></Button>} />
    {error && <p role="alert">{error}</p>}
    {work && !allowed && <p role="status">Cost allocation requires an active or completed TZS job.</p>}
    <Card><CardHeader><CardTitle>Posted costs</CardTitle></CardHeader><CardContent>
      <SearchToolbar search={search} onSearch={value => { setSearch(value); setPage(1); }} placeholder="Search journal or account" />
      {!costs && !error && <p role="status">Loading costs…</p>}
      {costs?.data.length === 0 && <p>No unallocated costs match this search.</p>}
      <div className="industry-hub-grid">{costs?.data.map(item => <Card key={item.id}><CardContent className="pt-6"><strong>{item.entry_number} · {item.account_name}</strong><p>{item.description}</p><p>Available: {money(item.available)}</p><Button variant={source?.id === item.id ? 'default' : 'outline'} disabled={!allowed || busy} onClick={() => { setSource(item); setAmount(String(item.available)); }}>Select cost</Button></CardContent></Card>)}</div>
      <div className="industry-actions"><Button variant="outline" disabled={page === 1 || !costs || busy} onClick={() => setPage(value => value - 1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={!costs?.has_more || busy} onClick={() => setPage(value => value + 1)}>Next</Button></div>
    </CardContent></Card>
    {source && <Card><CardHeader><CardTitle>Allocate {source.entry_number}</CardTitle></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); void mutate(`/v1/finance/industries/${id}/costs`, { source_journal_line_id: source.id, amount: Number(amount), reason }); }} className="industry-page">
      <div><Label htmlFor="allocation-amount">Amount (TZS)</Label><Input id="allocation-amount" type="number" min="0.01" max={source.available} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></div>
      <div><Label htmlFor="allocation-reason">Allocation reason</Label><Input id="allocation-reason" required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></div>
      <Button disabled={busy || !allowed || !reason.trim()}>Allocate cost</Button>
    </form></CardContent></Card>}
    <Card><CardHeader><CardTitle>Allocation history</CardTitle></CardHeader><CardContent>
      <p>Latest 100 allocations. Reversing the original transaction also reverses its allocations.</p>
      <Label htmlFor="reversal-reason">Reason for reversal</Label><Input id="reversal-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder="Explain the correction" />
      {costs?.allocations.map(item => <div key={item.id} className="industry-actions"><span>{money(Number(item.amount))} · {item.reason} · {item.reversed_at ? 'Reversed' : 'Active'}</span>{!item.reversed_at && <Button variant="outline" disabled={busy || !reason.trim()} onClick={() => mutate(`/v1/finance/industries/${id}/costs/${item.id}/reverse`, { reason })}>Reverse allocation</Button>}</div>)}
    </CardContent></Card>
  </div>;
}
