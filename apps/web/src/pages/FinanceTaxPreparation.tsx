import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FinanceTaxPreparationView } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import { Badge } from '../components/ui/badge.js';
import './FinanceIndustries.css';

const guidance: Record<string,string> = {
  jurisdiction: 'Confirm the jurisdiction and reporting period.', registration: 'Check the effective registration dates and number.',
  sales: 'Check invoices, credit notes and tax treatments against customer documents.', purchases: 'Check supplier bills, receipts and recoverable input-tax treatments.',
  currency: 'Check source currencies, dated exchange rates and reporting currency.', reconciliation: 'Reconcile the return to the ledger. Explain differences and partial-exemption adjustments.',
};
export function FinanceTaxPreparation() {
  const { id } = useParams(); const { user } = useAuth(); const [data, setData] = useState<FinanceTaxPreparationView>();
  const [checks, setChecks] = useState<Record<string,boolean>>({}); const [evidence, setEvidence] = useState(''); const [note, setNote] = useState(''); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let live = true; apiFetch<FinanceTaxPreparationView>(`/v1/vat-periods/${id}/preparation`).then(result => { if (live) setData(result); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, [id, revision]);
  async function save(suffix: string, body: object) {
    setBusy(true); setError(''); try { await apiFetch(`/v1/vat-periods/${id}/preparation${suffix}`, { method: 'POST', body: JSON.stringify(body) }); setRevision(value => value + 1); setChecks({}); setEvidence(''); setNote(''); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save preparation.'); } finally { setBusy(false); }
  }
  const blocked = data?.diagnostics.some(item => item.severity === 'blocking');
  return <div className="industry-page"><PageHeader crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'VAT periods', to: '/finance/vat-periods' }, 'Preparation']} titlePlain="VAT" titleEm="preparation" subtitle={data ? `${data.period.jurisdiction} · ${String(data.period.period_start).slice(0,10)} to ${String(data.period.period_end).slice(0,10)}` : 'Prepare and review the existing VAT calculation.'} actions={<Button asChild variant="outline"><Link to="/finance/tax-codes/classify">Classify sources</Link></Button>} />
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading preparation…</p>}
    {data && <><div className="industry-summary-grid">{[['Output tax',data.summary.output_tax],['Recoverable input',data.summary.recoverable_input],['Net payable',data.summary.net_payable],['Ledger difference',data.summary.ledger_difference]].map(([label,value]) => <Card key={label}><CardHeader><CardTitle>{new Intl.NumberFormat('en-TZ',{ style:'currency',currency:data.summary.currency }).format(Number(value))}</CardTitle></CardHeader><CardContent>{label}</CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Diagnostics</CardTitle></CardHeader><CardContent>{data.diagnostics.length ? data.diagnostics.map((item,index) => <p key={index}><Badge variant={item.severity === 'blocking' ? 'destructive' : 'secondary'}>{item.severity}</Badge> {item.message}</p>) : <p>No blocking diagnostics found in the recorded data.</p>}<p>Preparation and review are internal records. They do not submit a return to a tax authority.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Preparation checks</CardTitle></CardHeader><CardContent className="industry-page">{data.checks.map((check,index) => <div key={check}><div className="industry-check"><Checkbox id={`tax-${check}`} checked={checks[check] || false} disabled={busy || data.period.status !== 'open'} onCheckedChange={value => setChecks(current => ({ ...current,[check]:value === true }))} /><Label htmlFor={`tax-${check}`}>{index + 1}. {check}</Label></div><p>{guidance[check]}</p></div>)}<Label htmlFor="tax-evidence">Evidence and reconciliation notes</Label><Textarea id="tax-evidence" maxLength={4000} value={evidence} onChange={event => setEvidence(event.target.value)} /><div className="industry-actions"><Button disabled={busy || blocked || data.period.status !== 'open' || !evidence.trim() || data.checks.some(check => !checks[check])} onClick={() => save('',{ checks,evidence_note:evidence })}>Save preparation</Button><Button asChild variant="outline"><Link to="/finance/vat-periods">View periods</Link></Button></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Accountant review</CardTitle></CardHeader><CardContent className="industry-page"><Label htmlFor="tax-review-note">Review note</Label><Textarea id="tax-review-note" value={note} onChange={event => setNote(event.target.value)} maxLength={4000} />{data.preparations.length === 0 && <p>No preparation recorded.</p>}{data.preparations.map(item => <Card key={item.id}><CardContent className="pt-6 industry-page"><div className="industry-check"><PersonAvatar userId={item.prepared_by} name="Preparer" size={28} /><span>Prepared {new Date(item.created_at).toLocaleString()}</span><Badge>{item.status}</Badge>{!item.current && <Badge variant="destructive">Sources changed</Badge>}</div><p>{item.evidence_note}</p>{item.review_note && <p>Review: {item.review_note}</p>}{item.status === 'prepared' && item.prepared_by !== user?.id && data.period.status === 'open' && <div className="industry-actions"><Button disabled={busy || blocked || !item.current || !note.trim()} onClick={() => save(`/${item.id}/review`,{ approve:true,note })}>Approve preparation</Button><Button variant="outline" disabled={busy || !note.trim()} onClick={() => save(`/${item.id}/review`,{ approve:false,note })}>Return for correction</Button></div>}</CardContent></Card>)}</CardContent></Card>
    </>}
  </div>;
}
