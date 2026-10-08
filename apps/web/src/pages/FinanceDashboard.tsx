import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FinanceDashboardSnapshot } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import './FinanceIndustries.css';

export function FinanceDashboard() {
  const [data, setData] = useState<FinanceDashboardSnapshot>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const { isEnabled } = useFinanceCapabilities();
  useEffect(() => {
    let live = true; setLoading(true); setError('');
    apiFetch<FinanceDashboardSnapshot>('/v1/finance/dashboard-snapshot')
      .then(result => { if (live) setData(result); })
      .catch(err => { if (live) { setData(undefined); setError(err instanceof Error ? err.message : 'Unable to load Finance.'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [revision]);
  if (loading) return <SkeletonPage variant="dashboard" />;
  const money = (value: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: data?.currency || 'TZS' }).format(value);
  const cards = data ? [
    { title: 'Receivables', value: data.receivables.total, detail: `${data.receivables.count} open accounts · ${money(data.receivables.overdue)} overdue`, to: '/finance/accounts/aged-receivables' },
    { title: 'Payables', value: data.payables.total, detail: `${data.payables.count} open accounts · ${money(data.payables.overdue)} overdue`, to: '/finance/accounts/aged-payables' },
    { title: 'Revenue this month', value: data.profitLoss.month.revenue, detail: 'Posted ledger revenue', to: '/finance/accounts/profit-loss' },
    { title: 'Net result this month', value: data.profitLoss.month.net, detail: 'Posted revenue less expenses', to: '/finance/accounts/profit-loss' },
  ] : [];
  return <div className="industry-page">
    <PageHeader crumbs={['Finance', 'Overview']} titlePlain="Finance" titleEm="overview" subtitle={data ? `Posted accounting records through ${data.asOf}. Figures use ${data.currency}.` : 'Review recorded balances and outstanding work.'} actions={<div className="industry-actions"><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Refresh</Button><Button asChild><Link to="/finance/invoices">Invoices</Link></Button></div>} />
    {error && <Card><CardContent className="pt-6"><p role="alert">{error}</p><p>Balances are unavailable. Retry before using this dashboard for a decision.</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></CardContent></Card>}
    {data && <>
      <div className="industry-summary-grid">{cards.map(card => <Card key={card.title}><CardHeader><CardTitle>{card.title}</CardTitle></CardHeader><CardContent><strong>{money(card.value)}</strong><p>{card.detail}</p><Button asChild variant="outline"><Link to={card.to}>View report</Link></Button></CardContent></Card>)}</div>
      <div className="industry-hub-grid">
        <Card><CardHeader><CardTitle>Year to date</CardTitle></CardHeader><CardContent><p>Revenue: {money(data.profitLoss.ytd.revenue)}</p><p>Expenses: {money(data.profitLoss.ytd.expenses)}</p><p>Net result: {money(data.profitLoss.ytd.net)}</p><Button asChild variant="outline"><Link to="/finance/accounts/profit-loss">Profit and loss</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle>Approval queue</CardTitle></CardHeader><CardContent><p>{data.approvals.billsPendingApproval.count} supplier bills await approval.</p><p>{data.approvals.expensesPendingApproval.count} expenses await approval.</p><div className="industry-actions"><Button asChild variant="outline"><Link to="/finance/bills">Bills</Link></Button><Button asChild variant="outline"><Link to="/finance/expenses">Expenses</Link></Button></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Period controls</CardTitle></CardHeader><CardContent><p>{data.glPeriod ? `Latest closed period: ${data.glPeriod.name}` : 'No closed accounting period recorded.'}</p><div className="industry-actions"><Button asChild variant="outline"><Link to="/finance/vat-periods">VAT preparation</Link></Button>{isEnabled('finance.accounting.advanced') && <Button asChild variant="outline"><Link to="/finance/accounts/gl-periods">Close review</Link></Button>}</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Workspace tools</CardTitle></CardHeader><CardContent className="industry-actions"><Button asChild variant="outline"><Link to="/crm/customers">CRM customers</Link></Button><Button asChild variant="outline"><Link to="/crm/vendors">CRM vendors</Link></Button><Button asChild variant="outline"><Link to="/finance/industries">Industries</Link></Button><Button asChild variant="outline"><Link to="/agentic">Plan a task</Link></Button>{isEnabled('finance.pos') && <Button asChild variant="outline"><Link to="/finance/pos">POS</Link></Button>}</CardContent></Card>
    </>}
  </div>;
}
