import { useEffect, useRef, useState } from 'react';
import type { AccountingSyncTaskPage } from '@hudumika/types';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { formatDateTime } from '../lib/tenantLocale.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Card, CardContent } from '../components/ui/card.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.js';

const states = ['PENDING', 'RUNNING', 'SUCCESS', 'RETRY', 'RECONCILE', 'FAILED'];
const labels: Record<string, string> = { PENDING: 'Queued', RUNNING: 'Sending', SUCCESS: 'Delivered', RETRY: 'Retry scheduled', RECONCILE: 'Needs review', FAILED: 'Failed' };

export function AccountingDeliveries() {
  const { user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AccountingSyncTaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [externalId, setExternalId] = useState('');
  const [reviewError, setReviewError] = useState('');
  const sequence = useRef(0);
  const canRetry = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'].includes(user.role);

  useEffect(() => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    const query = new URLSearchParams({ page: String(page), page_size: '25' });
    if (status) query.set('status', status);
    if (provider) query.set('provider', provider);
    apiFetch(`/v1/accounting-integrations/deliveries?${query}`).then((result: AccountingSyncTaskPage) => {
      if (request === sequence.current) setData(result);
    }).catch((cause: unknown) => {
      if (request === sequence.current) { setData(null); setError(cause instanceof Error ? cause.message : 'Unable to load deliveries.'); }
    }).finally(() => { if (request === sequence.current) setLoading(false); });
    return () => { sequence.current++; };
  }, [page, status, provider, revision]);

  async function retry(id: string) {
    if (busy) return;
    setBusy(id); setError('');
    try {
      await apiFetch(`/v1/accounting-integrations/deliveries/${id}/retry`, { method: 'POST' });
      setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to retry delivery.'); }
    finally { setBusy(null); }
  }

  async function reconcile() {
    if (!reviewId || busy) return;
    setBusy(reviewId); setReviewError('');
    try {
      await apiFetch(`/v1/accounting-integrations/deliveries/${reviewId}/reconcile`, { method: 'POST', body: JSON.stringify({ external_id: externalId.trim() }) });
      setReviewId(null); setRevision(value => value + 1);
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : 'Unable to verify provider record.'); }
    finally { setBusy(null); }
  }

  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader crumbs={['Finance', 'Integrations', 'Deliveries']} titlePlain="Accounting" titleEm="deliveries"
      subtitle="Track exports and review failures before trying again."
      actions={<Button variant="outline" disabled={loading || !!busy} onClick={() => setRevision(value => value + 1)}>Refresh</Button>} />
    <div className="flex flex-wrap items-center gap-3">
      <SingleSelectFilter label="Status" value={status} options={states.map(value => ({ value, label: labels[value] }))} onChange={value => { setStatus(value); setPage(1); }} />
      <SingleSelectFilter label="Provider" value={provider} options={[{ value: 'XERO', label: 'Xero' }, { value: 'QUICKBOOKS', label: 'QuickBooks' }]} onChange={value => { setProvider(value); setPage(1); }} />
      <Button variant="ghost" asChild><Link to="/finance/integrations">Connections</Link></Button>
    </div>
    <Card><CardContent className="p-6 text-sm text-muted-foreground">
      Needs review means the provider may already have accepted the export. Check its records before making another entry. Automatic retries stay blocked for these deliveries. QuickBooks supplier exports are currently unavailable.
    </CardContent></Card>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Card><CardContent className="p-0">
      {loading ? <SectionLoading label="Loading deliveries…" /> : <Table>
        <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Updated</TableHead><TableHead>Details</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
        <TableBody>{data?.items.map(item => <TableRow key={item.id}>
          <TableCell><div>{item.entity_type.replaceAll('_', ' ').toLowerCase()}</div><code className="text-xs">{item.entity_id}</code></TableCell>
          <TableCell>{item.provider === 'XERO' ? 'Xero' : 'QuickBooks'}</TableCell>
          <TableCell><Badge variant={item.status === 'SUCCESS' ? 'success' : item.status === 'RECONCILE' || item.status === 'FAILED' ? 'warning' : 'gray'}>{labels[item.status]}</Badge></TableCell>
          <TableCell>{item.attempts}</TableCell><TableCell className="whitespace-nowrap">{formatDateTime(item.updated_at)}</TableCell>
          <TableCell><p className="max-w-sm break-words">{item.last_error || (item.status === 'RETRY' ? `Next attempt: ${formatDateTime(item.next_attempt_at)}` : '—')}</p></TableCell>
          <TableCell>{canRetry && item.status === 'FAILED' && !(item.provider === 'QUICKBOOKS' && ['BILL', 'BILL_PAYMENT'].includes(item.entity_type)) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => retry(item.id)}>{busy === item.id ? 'Queuing…' : 'Retry'}</Button>}{canRetry && item.status === 'RECONCILE' && item.provider === 'XERO' && item.entity_type === 'INVOICE' && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setReviewId(item.id); setExternalId(''); setReviewError(''); }}>Verify record</Button>}</TableCell>
        </TableRow>)}{data && data.items.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center">No deliveries match these filters.</TableCell></TableRow>}</TableBody>
      </Table>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} deliveries · Page {page} of {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}</span>
        <div className="flex gap-2"><Button variant="outline" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" disabled={loading || !data || page * 25 >= data.total} onClick={() => setPage(value => value + 1)}>Next</Button></div>
      </div>
    </CardContent></Card>
    <Dialog open={!!reviewId} onOpenChange={open => { if (!open && !busy) setReviewId(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Verify Xero invoice</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Enter the existing invoice ID from Xero. We check its number, contact, currency, total and status before linking it. This does not create another invoice.</p>
        <label htmlFor="xero-invoice-id" className="text-sm font-medium">Xero invoice ID</label>
        <Input id="xero-invoice-id" value={externalId} onChange={event => setExternalId(event.target.value)} disabled={!!busy} />
        {reviewError && <p role="alert" className="text-destructive">{reviewError}</p>}
        <DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setReviewId(null)}>Cancel</Button><Button disabled={!!busy || !externalId.trim()} onClick={reconcile}>{busy ? 'Verifying…' : 'Verify and link'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
