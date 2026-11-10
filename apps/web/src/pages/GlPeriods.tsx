import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../components/ui/dialog.js';
import { useFinanceReadOnly } from '../components/FinanceCapabilityGate.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Label } from '../components/ui/label.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tip } from '../components/ui/tooltip.js';

interface Period {
  id: string; name: string; period_type: 'MONTH' | 'YEAR'; period_start: string; period_end: string;
  status: 'open' | 'closed'; closed_at: string | null; reopen_reason: string | null;
}

export function GlPeriods() {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const readOnly = useFinanceReadOnly();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reopening, setReopening] = useState<Period | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const [glpStats, setGlpStats] = useState<any>(null);
  const fetchStats = useCallback(async () => {
    try { setGlpStats(await apiFetch('/v1/finance/gl-periods/stats')); } catch {}
  }, []);

  const load = () => apiFetch('/v1/finance/gl-periods').then((d: any) => { if (Array.isArray(d)) setPeriods(d); }).catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load accounting periods.')).finally(() => setLoading(false));
  useEffect(() => { load(); fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (readOnly) {
      setShowNew(false);
      setReopening(null);
    }
  }, [readOnly]);

  async function createPeriod() {
    if (!name.trim() || !start || !end) return showAlert('Name, start and end dates are required.');
    try {
      await apiFetch('/v1/finance/gl-periods', { method: 'POST', body: JSON.stringify({ name: name.trim(), period_type: periodType, period_start: start, period_end: end }) });
      setShowNew(false); setName(''); setStart(''); setEnd('');
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not create this period.');
    }
  }

  async function closePeriod(p: Period) {
    const warn = p.period_type === 'YEAR'
      ? `Close "${p.name}"? This posts real closing entries zeroing every revenue/expense account's movement into Retained Earnings, and blocks any further posting dated inside this range.`
      : `Close "${p.name}"? This blocks any further posting dated inside this range.`;
    if (!(await showConfirm(warn, { variant: 'warning', confirmLabel: 'Close Period' }))) return;
    try {
      await apiFetch(`/v1/finance/gl-periods/${p.id}/close`, { method: 'POST' });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not close this period.');
    }
  }

  async function reopenPeriod() {
    if (!reopening || !reopenReason.trim()) return showAlert('A reason is required to reopen a period.');
    try {
      await apiFetch(`/v1/finance/gl-periods/${reopening.id}/reopen`, { method: 'POST', body: JSON.stringify({ reason: reopenReason.trim() }) });
      setReopening(null); setReopenReason('');
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not reopen this period.');
    }
  }

  async function deletePeriod(p: Period) {
    if (!(await showConfirm(`Delete "${p.name}"? Only possible if it has never been closed.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/finance/gl-periods/${p.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not delete this period.');
    }
  }

  if (loading) return <SectionLoading label="Loading periods…" />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Period"
        titleEm="close"
        subtitle="Lock a period against further posting; a year-end close also zeroes revenue and expense into Retained Earnings."
      />

      <MetricsRow cards={[
        {
          emphasis: 'primary', title: 'Total Periods', value: String(glpStats?.total ?? periods.length), icon: 'calendar',
          sub1Label: 'OPEN', sub1Value: String(glpStats?.open ?? periods.filter(p => p.status === 'open').length),
          sub2Label: 'CLOSED', sub2Value: String(glpStats?.closed ?? periods.filter(p => p.status === 'closed').length), barHighlight: 'var(--teal)',
          loading: !glpStats,
        },
        {
          title: 'Open Periods', value: String(glpStats?.open ?? periods.filter(p => p.status === 'open').length), icon: 'unlock',
          sub1Label: 'MONTHS', sub1Value: String(periods.filter(p => p.status === 'open' && p.period_type === 'MONTH').length),
          sub2Label: 'YEARS', sub2Value: String(periods.filter(p => p.status === 'open' && p.period_type === 'YEAR').length), barHighlight: 'var(--gold)',
        },
        {
          title: 'Closed Periods', value: String(periods.filter(p => p.status === 'closed').length), icon: 'lock',
          sub1Label: 'MONTHS', sub1Value: String(periods.filter(p => p.status === 'closed' && p.period_type === 'MONTH').length),
          sub2Label: 'YEARS', sub2Value: String(periods.filter(p => p.status === 'closed' && p.period_type === 'YEAR').length), barHighlight: 'var(--green)',
        },
        {
          title: 'Fiscal Years', value: String(periods.filter(p => p.period_type === 'YEAR').length), icon: 'checkCircle',
          sub1Label: 'CLOSED', sub1Value: String(periods.filter(p => p.period_type === 'YEAR' && p.status === 'closed').length),
          sub2Label: 'TOTAL', sub2Value: String(periods.length), barHighlight: 'var(--blue)',
        },
      ]} />

      {!readOnly && <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="button" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={14} /> New period
        </Button>
      </div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Range</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>No periods defined yet.</td></tr>
              ) : periods.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{p.name}<Button asChild variant="link"><Link to={`/finance/accounts/gl-periods/${p.id}/review`}>Review close</Link></Button></td>
                  <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{p.period_type === 'YEAR' ? 'Fiscal Year' : 'Month'}</td>
                  <td style={{ padding: '9px 12px' }}>{new Date(p.period_start).toLocaleDateString('en-GB')} – {new Date(p.period_end).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                    <Badge variant={p.status === 'closed' ? 'error' : 'success'}>{p.status.toUpperCase()}</Badge>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {!readOnly && (p.status === 'open' ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Tip label="Close period"><Button variant="ghost" size="icon" iconOnly aria-label="Close period" onClick={() => closePeriod(p)}><Icon name="lock" size={14} color="var(--red)" /></Button></Tip>
                        {!p.closed_at && <Tip label="Delete period"><Button variant="ghost" size="icon" iconOnly aria-label="Delete period" onClick={() => deletePeriod(p)}><Icon name="trash2" size={14} color="var(--ink3)" /></Button></Tip>}
                      </div>
                    ) : (
                      <Tip label="Reopen period"><Button variant="ghost" size="icon" iconOnly aria-label="Reopen period" onClick={() => setReopening(p)}><Icon name="unlock" size={14} color="var(--teal)" /></Button></Tip>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!readOnly && showNew} onOpenChange={o => { if (!o) setShowNew(false); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New period</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3.5">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FY2026 or August 2026" /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={periodType} onValueChange={v => setPeriodType(v as 'MONTH' | 'YEAR')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="MONTH">Month (lock only)</SelectItem><SelectItem value="YEAR">Fiscal year (lock + closing entries)</SelectItem></SelectContent>
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div className="space-y-1.5"><Label>Start</Label><DatePicker date={parseDateOnly(start)} onChange={d => setStart(toDateOnlyString(d) ?? '')} /></div>
              <div className="space-y-1.5"><Label>End</Label><DatePicker date={parseDateOnly(end)} onChange={d => setEnd(toDateOnlyString(d) ?? '')} /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={createPeriod}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!readOnly && !!reopening} onOpenChange={o => { if (!o) setReopening(null); }}>
        <DialogContent size="sm">
          {reopening && (
            <>
              <DialogHeader>
                <DialogTitle>Reopen "{reopening.name}"</DialogTitle>
                <p className="text-xs text-muted-foreground">The original close stays on record — reopening doesn't erase it.</p>
              </DialogHeader>
              <DialogBody className="space-y-1.5">
                <Label>Reason (required)</Label>
                <Textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3} />
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReopening(null)}>Cancel</Button>
                <Button onClick={reopenPeriod}>Reopen</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
