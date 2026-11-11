import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '../components/ui/card.js';
import {Icon} from '../components/Icon.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import { SectionLoading } from '../components/ui/spinner.js';

import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '../components/PageHeader.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { Badge } from '../components/ui/badge.js';

import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Button } from '../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { useRenewalFinanceOverview, useRenewalRegister } from '../hooks/useRenewalFinance.js';
import { formatAmount } from '../lib/currency.js';
import './ComplyOS.css';
import './ComplyRenewalFinance.css';

function fmt(n: number, currency = 'TZS') {
  return formatAmount(n, currency);
}

export function ComplyRenewalFinance() {
  const [params] = useSearchParams();
  const initialCurrency=params.get('currency')??'TZS';
  const [currency, setCurrency] = useState(/^[A-Z]{3}$/.test(initialCurrency)?initialCurrency:'TZS');
  const [search, setSearch] = useState('');
  const [status,setStatus]=useState('all');
  const { data: overview, loading: ovLoading, error: ovError, refresh: refreshOverview } = useRenewalFinanceOverview(currency);
  const { data: register, loading: regLoading, error: regError, refresh: refreshRegister } = useRenewalRegister({ currency });

  if (ovLoading && !overview) return <SkeletonPage />;

  const filtered = register.filter(r => {
    if(status==='open'&&['issued','cancelled'].includes(r.cycle_status))return false;
    if(status==='unpriced'&&(r.cost_line_count===undefined?r.estimated_cost!==0:r.cost_line_count!==0))return false;
    if(status==='committed'&&!(Number(r.open_commitments)>0))return false;
    if(params.get('entity_id') && r.entity_id!==params.get('entity_id'))return false;
    if(params.get('site_id') && r.site_id!==params.get('site_id'))return false;
    if(params.get('jurisdiction') && r.jurisdiction!==params.get('jurisdiction'))return false;
    if(params.get('unassigned_entity')==='1' && r.entity_id)return false;
    if(params.get('unassigned_site')==='1' && r.site_id)return false;
    if(params.get('unassigned_jurisdiction')==='1' && r.jurisdiction)return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.cert_name ?? '').toLowerCase().includes(q) ||
           (r.cert_number ?? '').toLowerCase().includes(q) ||
           (r.agency_code ?? '').toLowerCase().includes(q) ||
           (r.entity_name ?? '').toLowerCase().includes(q) ||
           (r.site_name ?? '').toLowerCase().includes(q) ||
           (r.jurisdiction ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="comply-page comply-renewal-finance">
      <PageHeader
        crumbs={['ComplyOS', 'Finance']}
        titlePlain="Renewal"
        titleEm="finance"
        subtitle="Plan renewal funding, review recorded costs and trace payments to each permit."
        actions={
          <div className="renewal-finance-actions">
            <Button variant="outline" size="icon" aria-label="Refresh renewal finances" disabled={ovLoading||regLoading} onClick={()=>{void refreshOverview();void refreshRegister();}}><Icon name="refresh" size={15}/></Button>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger aria-label="Finance currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TZS">TZS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KES">KES</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {(ovError || regError) && <div role="alert" className="comply-finance-error"><p>{ovError || regError}</p><Button variant="outline" onClick={()=>{void refreshOverview();void refreshRegister();}}>Retry</Button></div>}
      {ovLoading&&<SectionLoading label="Updating financial outlook…"/>}
      {!ovLoading && !ovError && overview && (
        <Card className="renewal-finance-brief">
          <div className="renewal-finance-brief-heading"><span>FUNDING OUTLOOK</span><Badge variant="gray">Workspace-wide · {currency}</Badge></div>
          <dl className="renewal-finance-summary">
            <div><dt>Funding next 30 days</dt><dd>{fmt(overview.forecast_30d,currency)}</dd><small>Recorded estimates less payments</small></div>
            <div><dt>Open commitments</dt><dd>{fmt(overview.open_commitments,currency)}</dd><small>{fmt(overview.overdue_payables,currency)} overdue</small></div>
            <div><dt>Net paid this year</dt><dd>{fmt(overview.net_paid_ytd,currency)}</dd><small>Verified payment allocations</small></div>
          </dl>
          <details className="renewal-finance-more"><summary>Budget, longer forecasts & calculation basis</summary><dl>{[
            ['Approved budget',overview.approved_budget],['Funding next 90 days',overview.forecast_90d],['Funding next 365 days',overview.forecast_365d],['Due payables',overview.due_payables],['Budget variance',overview.budget_variance],
          ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{fmt(Number(value),currency)}</dd></div>)}</dl><p>{overview.unpriced_count} renewals have no recorded costs in {currency}. Forecasts include past-due estimates. Commitments overlap with forecasts; do not add these figures together. Unrecorded costs and penalties are excluded.</p></details>
        </Card>
      )}

      {[...params.keys()].some(key=>['entity_id','site_id','jurisdiction','unassigned_entity','unassigned_site','unassigned_jurisdiction'].includes(key))&&<p className="comply-help-text">Register filtered to your dashboard scope. Financial totals above remain workspace-wide. <Link to={`/complyos/renewal-finance?currency=${currency}`}>Show all register rows</Link></p>}
      {!regError && <Card className="comply-finance-register renewal-finance-register">
        <CardHeader className="renewal-finance-register-header"><div><CardTitle>Renewal register</CardTitle><CardDescription>Open a permit to manage its cost lines, budget and payment evidence.</CardDescription></div><Badge variant="gray">{regLoading?'Loading…':`${filtered.length} records`}</Badge></CardHeader>
        <CardContent className="renewal-finance-register-body">
        <div className="renewal-finance-toolbar">
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search permits, agencies, entities…"
          activeFilterCount={0}
        />
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter renewal register"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All renewals</SelectItem><SelectItem value="open">Open renewals</SelectItem><SelectItem value="unpriced">Unpriced renewals</SelectItem><SelectItem value="committed">Open commitments</SelectItem></SelectContent></Select>
        </div>

        <div className="comply-finance-table-wrap">
          <Table className="comply-finance-table">
            <TableHeader>
              <TableRow>
                <TableHead>Permit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Estimated</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Budget</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Net paid</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Remaining</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regLoading ? (
                <TableRow><TableCell colSpan={8} style={{ textAlign: 'center', padding: 32 }}><SectionLoading label="Loading…" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                  {register.length === 0 ? 'No renewal cycles found. Create a lifecycle cycle first.' : 'No results match your search.'}
                </TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.cycle_id}>
                  <TableCell data-label="Permit">
                    <div style={{ fontWeight: 500 }}>{r.cert_name ?? 'Unnamed'}</div>
                    <div className="renewal-finance-record-meta">{[r.cert_number,r.agency_code].filter(Boolean).join(' · ')}</div>
                    <div className="renewal-finance-record-meta">{[r.entity_name??'Unassigned entity',r.site_name,r.jurisdiction].filter(Boolean).join(' · ')}</div>
                  </TableCell>
                  <TableCell data-label="Status"><Badge variant={statusVariant(r.cycle_status)}>{r.cycle_status.replaceAll('_',' ')}</Badge></TableCell>
                  <TableCell data-label="Expiry">{r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : '—'}</TableCell>
                  <TableCell data-label="Estimated" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(r.cost_line_count===undefined?r.estimated_cost===0:r.cost_line_count===0) ? <span style={{ color: 'var(--muted)' }}>Unknown</span> : fmt(r.estimated_cost, currency)}</TableCell>
                  <TableCell data-label="Budget" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.approved_budget > 0 ? fmt(r.approved_budget, currency) : '—'}<small className="renewal-finance-record-meta">{fmt(r.variance,currency)} variance</small></TableCell>
                  <TableCell data-label="Net paid" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.net_paid,currency)}<small className="renewal-finance-record-meta">{fmt(r.committed,currency)} committed</small></TableCell>
                  <TableCell data-label="Remaining" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.cost_line_count===0?'Unknown':fmt(r.remaining_forecast,currency)}</TableCell>
                  <TableCell data-label="Actions">
                    <Button asChild variant="ghost" size="sm"><Link aria-label={`View costs for ${r.cert_name ?? 'renewal'}`} to={`/complyos/renewal-finance/${r.cycle_id}`}>View costs<Icon name="arrowRight" size={13}/></Link></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </CardContent>
      </Card>}
    </div>
  );
}

function statusVariant(s: string): 'brand' | 'success' | 'warning' | 'error' | 'gray' | 'info' {
  if (s === 'issued' || s === 'approved') return 'success';
  if (s === 'submitted' || s === 'under_authority_review') return 'info';
  if (s === 'pending_review' || s === 'pending_documents') return 'warning';
  if (s === 'rejected' || s === 'failed' || s === 'cancelled') return 'error';
  return 'gray';
}
