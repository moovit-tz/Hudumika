import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { useSealStock } from '../hooks/useSealStock.js';
import { CUSTOMS_STATUS_LABELS } from '@hudumika/types';
import './Seal.css';

export function SealStockOverview() {
  const { rows, loading, error, refresh } = useSealStock();
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<string | null>(null);
  const navigate = useNavigate();
  const filtered = rows.filter(r => `${r.description} ${r.batch ?? ''} ${r.compartmentName} ${r.ownerName ?? ''}`.toLowerCase().includes(search.toLowerCase()) &&
    (!availability || (availability === 'available' ? r.available > 0 : r.available <= 0)));
  return <div className="seal-page">
    <PageHeader crumbs={['SEAL', 'Inventory']} titlePlain="Stock" titleEm="overview" subtitle="On-hand, allocated and available quantities by lot and warehouse."
      actions={<Button onClick={() => navigate('/seal/lots/new')}>Receive Stock</Button>} />
    <div className="flex flex-wrap gap-3 mb-4"><Button variant="outline" onClick={refresh}>Refresh</Button><Button variant="outline" onClick={() => navigate('/seal/movements')}>Movement History</Button><Link className="text-sm underline self-center" to="/seal/stock/item-ledger">Item stock used by FinOps & production</Link></div>
    <Banner variant="info">Lot stock and item stock are separate records. Item balances remain in their own ledger for FinOps and production; they are not added to lot balances.</Banner>
    <div className="flex flex-wrap gap-3 my-4 items-center"><SingleSelectFilter label="Availability" value={availability} onChange={setAvailability} options={[{value:'available',label:'Available'},{value:'empty',label:'Fully allocated / empty'}]} /><div className="flex-1"><SearchToolbar search={search} onSearch={setSearch} placeholder="Search lot, batch, owner or warehouse…" activeFilterCount={availability ? 1 : 0} /></div></div>
    {error && <Banner variant="error">{error}</Banner>}
    <Card className="overflow-x-auto">{loading ? <SectionLoading /> : <table className="seal-table"><thead><tr><th>Lot / batch</th><th>Warehouse / location</th><th>On hand</th><th>Allocated</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {filtered.map(r => <tr key={r.id}><td><Link className="font-semibold underline" to={`/seal/lots/${r.id}`}>{r.description}</Link><div className="text-xs text-muted-foreground">{r.batch ?? 'No batch'}</div></td><td>{r.compartmentName}<div className="text-xs text-muted-foreground">{r.locationCode ?? 'Awaiting putaway'}</div></td><td>{r.onHand.toLocaleString()} {r.uom}</td><td>{r.allocated.toLocaleString()}</td><td>{r.available.toLocaleString()} {r.uom}</td><td><Badge variant={r.available > 0 ? 'success' : 'warning'}>{CUSTOMS_STATUS_LABELS[r.customsStatus]}</Badge></td><td><Button size="sm" variant="outline" onClick={() => navigate(`/seal/lots/${r.id}`)}>View / Move</Button></td></tr>)}
      {!error && !filtered.length && <tr><td colSpan={7} className="text-center p-8">No stock matches this scope. Receive stock to begin.</td></tr>}
    </tbody></table>}</Card>
  </div>;
}
