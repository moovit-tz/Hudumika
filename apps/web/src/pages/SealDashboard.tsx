import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { useSealStock } from '../hooks/useSealStock.js';
import './SealInventoryDashboard.css';
import './Seal.css';

export function SealDashboard() {
  const { rows, loading, error, refresh } = useSealStock();
  const navigate = useNavigate();
  const stocked = rows.filter(r => r.onHand > 0);
  const awaitingPutaway = stocked.filter(r => !r.locationCode);
  const nearExpiry = stocked.filter(r => r.expiresOn && new Date(r.expiresOn).getTime() <= Date.now() + 30 * 86400000);
  const allocated = stocked.filter(r => r.allocated > 0);
  return <div className="seal-page">
    <PageHeader crumbs={['SEAL', 'Overview']} titlePlain="Warehouse" titleEm="dashboard" subtitle="Live stock, warehouse exceptions and the next action for your team."
      actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh}>Refresh</Button><Button onClick={() => navigate('/seal/lots/new')}>Receive Stock</Button></div>} />
    {error && <Banner variant="error">{error}</Banner>}
    {loading ? <SectionLoading label="Loading warehouse stock…" /> : <>
      {!error && <MetricsRow cards={[
        {title:'Stocked Lots',value:String(stocked.length),icon:'package',barHighlight:'var(--teal)',sub1Label:'Inventory',sub1Value:'Lots with stock on hand'},
        {title:'Awaiting Putaway',value:String(awaitingPutaway.length),icon:'layers',barHighlight:'var(--gold)',sub1Label:'Receiving',sub1Value:'Stock without a location'},
        {title:'Expiry Exceptions',value:String(nearExpiry.length),icon:'clock',barHighlight:'var(--red)',sub1Label:'Next 30 days',sub1Value:'Includes overdue lots'},
        {title:'Allocated Lots',value:String(allocated.length),icon:'truck',barHighlight:'var(--blue)',sub1Label:'Outbound',sub1Value:'Lots with reserved stock'},
      ]} />}
      <div className="grid gap-4 lg:grid-cols-2 my-5">
        <Card className="p-5 space-y-4"><h2 className="text-lg font-semibold">Warehouse work</h2>
          <div className="grid grid-cols-2 gap-3">{[
            ['Appointments','/seal/appointments'],['Consignments & Receiving','/seal/consignments'],['Warehouse Tasks','/seal/activities'],['Dispatch Requests','/seal/dispatch-requests'],['Fulfillment Orders','/seal/fulfillment'],['Counts & Adjustments','/seal/adjustments'],
          ].map(([label,to]) => <Link key={to} className="underline text-sm" to={to}>{label}</Link>)}</div>
        </Card>
        <Card className="p-5 space-y-4"><h2 className="text-lg font-semibold">Needs attention</h2>
          {error ? <p>Stock could not be loaded. Refresh to retry.</p> : <>
            <p><Link className="underline" to="/seal/stock">{awaitingPutaway.length} stocked lots awaiting putaway</Link></p>
            <p><Link className="underline" to="/seal/billing/aged-storage">{stocked.filter(r => r.daysStored >= 90).length} lots stored for 90+ days</Link></p>
            <p><Link className="underline" to="/seal/billing/invoices">{stocked.filter(r => r.accrualError).length} lots need storage billing details</Link></p>
          </>}
        </Card>
      </div>
      <Card className="overflow-x-auto"><div className="p-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Stock snapshot</h2><Button variant="outline" size="sm" onClick={() => navigate('/seal/stock')}>View all stock</Button></div>
        <table className="seal-table"><thead><tr><th>Lot</th><th>Warehouse</th><th>Available</th><th>Action</th></tr></thead><tbody>{stocked.slice(0,5).map(r => <tr key={r.id}><td><Link to={`/seal/lots/${r.id}`} className="underline font-semibold">{r.description}</Link></td><td>{r.compartmentName}</td><td>{r.available.toLocaleString()} {r.uom}</td><td><Badge variant={r.locationCode ? 'success' : 'warning'}>{r.locationCode ?? 'Putaway needed'}</Badge></td></tr>)}
          {!stocked.length && !error && <tr><td colSpan={4} className="p-8 text-center">No stocked lots in this warehouse scope. Receive stock to start.</td></tr>}
        </tbody></table>
      </Card>
    </>}
  </div>;
}
