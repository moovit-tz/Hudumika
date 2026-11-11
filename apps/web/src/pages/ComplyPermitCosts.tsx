import {MetricsRow} from '../components/MetricCard.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter} from '../components/ui/table.js';

import React, {useState} from 'react';
import {apiFetch} from '../lib/api.js';
import {useAuth} from '../hooks/useAuth.js';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '../components/ui/select.js';
import { useParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { formatAmount } from '../lib/currency.js';

import { Badge } from '../components/ui/badge.js';

import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { useCycleCostLines, useCycleBudgets, useCycleAllocations, useCycleAudit, useRenewalRegister } from '../hooks/useRenewalFinance.js';
import './ComplyOS.css';

function fmt(n: number, currency = 'TZS') {
  return formatAmount(n, currency);
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    authority_application: 'Authority Application',
    authority_renewal: 'Authority Renewal',
    inspection: 'Inspection',
    late_penalty: 'Late Penalty',
    agent_fee: 'Agent Fee',
    translation: 'Translation',
    document: 'Document',
    travel: 'Travel',
    platform_charge: 'Platform Charge',
    other: 'Other',
  };
  return map[cat] ?? cat;
}

function allocTypeLabel(t: string): string {
  const map: Record<string, string> = {
    bill: 'Bill', expense: 'Expense', payment: 'Payment',
    refund: 'Refund', credit: 'Credit', reversal: 'Reversal',
  };
  return map[t] ?? t;
}

function budgetStatusVariant(s: string): 'brand' | 'success' | 'warning' | 'error' | 'gray' {
  if (s === 'approved') return 'success';
  if (s === 'pending_approval') return 'warning';
  if (s === 'rejected') return 'error';
  if (s === 'superseded') return 'gray';
  return 'brand';
}

export function ComplyPermitCosts() {
  const {user}=useAuth();
  const [currency,setCurrency]=useState('TZS');
  const [actionError,setActionError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const {data:register,error:summaryError,refresh:refreshSummary}=useRenewalRegister({currency});
  const { cycleId } = useParams<{ cycleId: string }>();
  const { data: allCostLines, loading: clLoading, error: clError, refresh: refreshcl } = useCycleCostLines(cycleId ?? null);
  const { data: allBudgets, loading: bLoading, error: bError, refresh: refreshb } = useCycleBudgets(cycleId ?? null);
  const { data: allAllocations, loading: aLoading, error: aError, refresh: refresha } = useCycleAllocations(cycleId ?? null);
  const { data: allAudit, loading: auLoading, error: auError, refresh: refreshau } = useCycleAudit(cycleId ?? null);

  if (!cycleId) return <div>Missing cycle ID</div>;

  const costLines=allCostLines.filter(l=>l.currency===currency);
  const budgets=allBudgets.filter(b=>b.currency===currency);
  const allocations=allAllocations.filter(a=>a.currency===currency);
  const audit=allAudit;
  const summary=register.find(r=>r.cycle_id===cycleId);
  const totalEstimated=summary?.estimated_cost??0;
  const approvedBudget=summary?.approved_budget??0;
  const netPaid=summary?.net_paid??0;
  const remaining=summary?.remaining_forecast??0;
  const error=clError||bError||aError||auError||summaryError;
  const refresh=()=>{void refreshcl();void refreshb();void refresha();void refreshau();void refreshSummary();};
  async function decide(id:string,approved:boolean) {
    setSaving(true);setActionError(null);
    try {await apiFetch(`/v1/renewal-finance/budgets/${id}/approve`,{method:'POST',body:JSON.stringify({approved})});refresh();}
    catch(e){setActionError(e instanceof Error?e.message:'Unable to review budget');}
    finally{setSaving(false);}
  }

  return (
    <div className="comply-page comply-permit-costs">
      <PageHeader
        crumbs={['ComplyOS', 'Finance', 'Cycle Detail']}
        titlePlain="Costs &"
        titleEm="payments"
        subtitle="Line-item budget, authority assessments, invoices, payments and receipts for this renewal cycle."
        actions={
          <Link to="/complyos/renewal-finance">
            <Button variant="outline" size="sm"><Icon name="arrowLeft" size={14} /> Back to register</Button>
          </Link>
        }
      />

      {/* ── Summary strip ────────────────────────────────────────── */}
      <div className="comply-finance-actions">
        <Select value={currency} onValueChange={setCurrency}><SelectTrigger aria-label="Display currency"><SelectValue /></SelectTrigger><SelectContent>{[...new Set(['TZS','USD','KES',...allCostLines.map(l=>l.currency),...allBudgets.map(b=>b.currency)])].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Link to={`cost-line?currency=${currency}`}><Button>Add cost line</Button></Link>
        <Link to={`budget?currency=${currency}`}><Button variant="outline">Request budget</Button></Link>
        <Link to={`allocation?currency=${currency}`}><Button variant="outline">Link Finance record</Button></Link>
      </div>
      {(error||actionError) && <div role="alert" className="comply-finance-error"><p>{error||actionError}</p><Button variant="outline" onClick={refresh}>Retry</Button></div>}
      {!error && <>
      <MetricsRow cards={[
        {title:'Estimated cost',value:costLines.length?fmt(totalEstimated,currency):'Unknown',icon:'fileText'},
        {title:'Approved budget',value:fmt(approvedBudget,currency),icon:'shield'},
        {title:'Net paid',value:fmt(netPaid,currency),icon:'bankNote',barHighlight:'var(--green)'},
        {title:'Remaining funding',value:costLines.length?fmt(remaining,currency):'Unknown',icon:'clock',barHighlight:'var(--gold)'},
      ]} />

      {/* ── Cost lines ───────────────────────────────────────────── */}
      <section className="comply-finance-section">
        <h3 className="comply-finance-section__title">Cost Lines</h3>
        {clLoading ? <SectionLoading /> : costLines.length === 0 ? (
          <p style={{ color: 'var(--muted)', padding: '16px 0' }}>No cost lines recorded. Add one to begin tracking estimated and actual costs.</p>
        ) : (
          <div className="comply-finance-table-wrap">
            <Table className="comply-finance-table comply-finance-table--compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Qty</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Unit price</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Tax</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Total</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costLines.map(l => (
                  <TableRow key={l.id}>
                    <TableCell data-label="Category"><Badge variant="gray">{categoryLabel(l.category)}</Badge></TableCell>
                    <TableCell data-label="Description">{l.description}</TableCell>
                    <TableCell data-label="Payee">{l.payee_name ?? '—'}</TableCell>
                    <TableCell data-label="Source">{l.source_type ?? '—'}</TableCell>
                    <TableCell data-label="Qty" style={{ textAlign: 'right' }}>{l.quantity}</TableCell>
                    <TableCell data-label="Unit price" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.unit_price, l.currency)}</TableCell>
                    <TableCell data-label="Tax" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.tax_amount > 0 ? fmt(l.tax_amount, l.currency) : '—'}</TableCell>
                    <TableCell data-label="Total" style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.total_amount, l.currency)}</TableCell>
                    <TableCell data-label="Due">{l.due_date ? new Date(l.due_date).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7} style={{ textAlign: 'right', fontWeight: 600 }}>Total</TableCell>
                  <TableCell data-label="Description" style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalEstimated, currency)}</TableCell>
                  <TableCell data-label="Payee"></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      {/* ── Budget versions ──────────────────────────────────────── */}
      <section className="comply-finance-section">
        <h3 className="comply-finance-section__title">Budget Versions</h3>
        {bLoading ? <SectionLoading /> : budgets.length === 0 ? (
          <p style={{ color: 'var(--muted)', padding: '16px 0' }}>No budget created for this cycle.</p>
        ) : (
          <div className="comply-finance-table-wrap">
            <Table className="comply-finance-table comply-finance-table--compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Approved amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Approved</TableHead><TableHead>Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map(b => (
                  <TableRow key={b.id}>
                    <TableCell data-label="Version">v{b.version}</TableCell>
                    <TableCell data-label="Status"><Badge variant={budgetStatusVariant(b.status)}>{b.status}</Badge></TableCell>
                    <TableCell data-label="Approved amount" style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.approved_amount, b.currency)}</TableCell>
                    <TableCell data-label="Reason">{b.reason ?? '—'}</TableCell>
                    <TableCell data-label="Requested">{new Date(b.requested_at).toLocaleDateString()}</TableCell>
                    <TableCell data-label="Approved">{b.approved_at ? new Date(b.approved_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell data-label="Review">{b.status === 'pending_approval' && (b.requested_by === user?.id ? <span>Awaiting another administrator</span> : <div className="comply-finance-actions"><Button size="sm" disabled={saving} onClick={() => void decide(b.id, true)}>Approve</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => void decide(b.id, false)}>Reject</Button></div>)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Finance allocations ──────────────────────────────────── */}
      <section className="comply-finance-section">
        <h3 className="comply-finance-section__title">Finance Allocations</h3>
        {aLoading ? <SectionLoading /> : allocations.length === 0 ? (
          <p style={{ color: 'var(--muted)', padding: '16px 0' }}>No finance records allocated to this cycle. Link bills, expenses or payments to track actual spend.</p>
        ) : (
          <div className="comply-finance-table-wrap">
            <Table className="comply-finance-table comply-finance-table--compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Finance record</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reconciled</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map(a => (
                  <TableRow key={a.id}>
                    <TableCell data-label="Type">
                      <Badge variant={a.allocation_type === 'payment' ? 'success' : ['refund', 'reversal', 'credit'].includes(a.allocation_type) ? 'error' : 'info'}>
                        {allocTypeLabel(a.allocation_type)}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Finance record" style={{ fontSize: 12 }}>{a.bill_id ? <Link to={`/finops/bills/${a.bill_id}`}>{a.finance_record_type.replaceAll('_', ' ')} · {a.finance_record_id}</Link> : <span>{a.finance_record_type} · {a.finance_record_id}</span>}</TableCell>
                    <TableCell data-label="Amount" style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {['refund', 'reversal', 'credit'].includes(a.allocation_type) ? '−' : ''}{fmt(a.amount, a.currency)}
                    </TableCell>
                    <TableCell data-label="Date">{new Date(a.allocation_date).toLocaleDateString()}</TableCell>
                    <TableCell data-label="Reconciled">{a.reconciled ? <span>Verified against Finance</span> : 'Unverified / source unavailable'}</TableCell>
                    <TableCell data-label="Notes" style={{ color: 'var(--muted)', fontSize: 12 }}>{a.notes ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} style={{ textAlign: 'right', fontWeight: 600 }}>Net paid</TableCell>
                  <TableCell data-label="Finance record" style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(netPaid, currency)}</TableCell>
                  <TableCell colSpan={3}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      {/* ── Audit trail ──────────────────────────────────────────── */}
      <section className="comply-finance-section">
        <h3 className="comply-finance-section__title">Audit Trail</h3>
        {auLoading ? <SectionLoading /> : audit.length === 0 ? (
          <p style={{ color: 'var(--muted)', padding: '16px 0' }}>No audit entries yet.</p>
        ) : (
          <div className="comply-finance-table-wrap">
            <Table className="comply-finance-table comply-finance-table--compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell data-label="Action"><Badge variant="gray">{a.action}</Badge></TableCell>
                    <TableCell data-label="Target" style={{ fontSize: 12 }}>{a.target_type} · {a.target_id?.slice(0, 8)}…</TableCell>
                    <TableCell data-label="Details" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {a.new_value ? JSON.stringify(a.new_value).slice(0, 80) : '—'}
                    </TableCell>
                    <TableCell data-label="When">{new Date(a.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      </>}
    </div>
  );
}
