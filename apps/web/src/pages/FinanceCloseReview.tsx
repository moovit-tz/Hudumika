import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import './FinanceIndustries.css';

type Review = { period: { name: string; status: string }; diagnostics: { pending_expenses: number; unmatched_bank_lines: number; ledger_difference: number }; checks: string[]; blocked: boolean; reviews: { id: string; note: string; created_at: string; reviewer_id: string }[] };
export function FinanceCloseReview() {
  const { id } = useParams(); const [data, setData] = useState<Review>(); const [checks, setChecks] = useState<Record<string, boolean>>({}); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { let live = true; apiFetch<Review>(`/v1/finance/gl-periods/${id}/review`).then(result => { if (live) setData(result); }).catch(err => { if (live) setError(err.message); }); return () => { live = false; }; }, [id, revision]);
  async function signOff() {
    setBusy(true); setError('');
    try { await apiFetch(`/v1/finance/gl-periods/${id}/review`, { method: 'POST', body: JSON.stringify({ checklist: checks, note }) }); setRevision(value => value + 1); setChecks({}); setNote(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign off.'); } finally { setBusy(false); }
  }
  return <div className="industry-page"><PageHeader crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Periods', to: '/finance/accounts/gl-periods' }, 'Review']} titlePlain="Close" titleEm="review" subtitle={data?.period.name || 'Review the accounting period before closing it.'} actions={<Button asChild variant="outline"><Link to="/finance/accounts/gl-periods">View periods</Link></Button>} />
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading review…</p>}
    {data && <><div className="industry-summary-grid">{[['Pending approvals', data.diagnostics.pending_expenses], ['Unmatched bank lines', data.diagnostics.unmatched_bank_lines], ['Ledger difference', data.diagnostics.ledger_difference]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle>{value}</CardTitle></CardHeader><CardContent>{label}</CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Review checklist</CardTitle></CardHeader><CardContent className="industry-page"><p>Confirm each area is complete or not applicable. Automated checks cover recorded transactions; they cannot establish that missing transactions have been entered.</p>{data.checks.map(check => <div className="industry-check" key={check}><Checkbox id={`close-${check}`} checked={checks[check] || false} onCheckedChange={value => setChecks(current => ({ ...current, [check]: value === true }))} disabled={busy || data.period.status !== 'open'} /><Label htmlFor={`close-${check}`} className="capitalize">{check}</Label></div>)}<Label htmlFor="close-note">Review evidence and exceptions</Label><Input id="close-note" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="Record checks performed and any areas that do not apply" /><Button disabled={busy || data.blocked || data.period.status !== 'open' || !note.trim() || data.checks.some(check => !checks[check])} onClick={signOff}>Record sign-off</Button>{data.blocked && <p role="status">Resolve the exceptions above before recording sign-off.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Sign-off history</CardTitle></CardHeader><CardContent>{data.reviews.length === 0 ? <p>No sign-off recorded.</p> : data.reviews.map(review => <p key={review.id}>{new Date(review.created_at).toLocaleString()} · {review.note}</p>)}</CardContent></Card></>}
  </div>;
}
