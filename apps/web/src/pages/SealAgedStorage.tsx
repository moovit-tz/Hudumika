import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Card } from '../components/ui/card.js';
import { Banner } from '../components/ui/alert.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { useSealStock } from '../hooks/useSealStock.js';
import './Seal.css';

export function SealAgedStorage() {
  const {rows, loading, error, refresh} = useSealStock();
  const [search,setSearch] = useState('');
  const [age,setAge] = useState<string|null>(null);
  const filtered = rows.filter(r => r.onHand > 0 && `${r.description} ${r.compartmentName}`.toLowerCase().includes(search.toLowerCase()) && (!age || r.daysStored >= Number(age)));
  return <div className="seal-page">
    <PageHeader crumbs={['SEAL','Reports']} titlePlain="Stock" titleEm="aging" subtitle="Actual dwell time and unbilled charges for lots still in storage." actions={<Button variant="outline" onClick={refresh}>Refresh</Button>} />
    <div className="flex flex-wrap gap-3 mb-4"><SingleSelectFilter label="Stored for" value={age} onChange={setAge} options={[{value:'7',label:'7+ days'},{value:'30',label:'30+ days'},{value:'90',label:'90+ days'}]} /><div className="flex-1"><SearchToolbar search={search} onSearch={setSearch} activeFilterCount={age ? 1 : 0} placeholder="Search lot or warehouse…" /></div></div>
    {error && <Banner variant="error">{error}</Banner>}
    <Card className="overflow-x-auto">{loading ? <SectionLoading/> : <table className="seal-table"><thead><tr><th>Lot</th><th>Warehouse</th><th>On hand</th><th>Days stored</th><th>Unbilled charges</th><th>Action</th></tr></thead><tbody>
      {filtered.map(r => <tr key={r.id}><td><Link className="underline" to={`/seal/lots/${r.id}`}>{r.description}</Link></td><td>{r.compartmentName}</td><td>{r.onHand.toLocaleString()} {r.uom}</td><td><Badge variant={r.daysStored >= 90 ? 'error' : r.daysStored >= 30 ? 'warning' : 'gray'}>{r.daysStored} days</Badge></td><td>{r.accrualError ? <span className="text-sm" title={r.accrualError}>Billing details required</span> : r.accrual ? `${r.accrual.currency} ${r.accrual.amount.toLocaleString()}` : '—'}</td><td><Link className="underline" to="/seal/billing/invoices">Review billing</Link></td></tr>)}
      {!error && !filtered.length && <tr><td colSpan={6} className="p-8 text-center">No stocked lots match this scope.</td></tr>}
    </tbody></table>}</Card>
  </div>;
}
