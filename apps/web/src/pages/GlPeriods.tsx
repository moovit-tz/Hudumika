import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

interface Period {
  id: string; name: string; period_type: 'MONTH' | 'YEAR'; period_start: string; period_end: string;
  status: 'open' | 'closed'; closed_at: string | null; reopen_reason: string | null;
}

export function GlPeriods() {
  const { fmt } = useCurrency();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reopening, setReopening] = useState<Period | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const load = () => apiFetch('/v1/finance/gl-periods').then((d: any) => { if (Array.isArray(d)) setPeriods(d); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

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

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading periods…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Period"
        titleEm="close"
        subtitle="Lock a period against further posting; a year-end close also zeroes revenue and expense into Retained Earnings."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={13} /> New Period
          </button>
        }
      />

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
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{p.period_type === 'YEAR' ? 'Fiscal Year' : 'Month'}</td>
                  <td style={{ padding: '9px 12px' }}>{new Date(p.period_start).toLocaleDateString('en-GB')} – {new Date(p.period_end).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: p.status === 'closed' ? 'var(--red-l)' : 'var(--green-l)', color: p.status === 'closed' ? 'var(--red)' : 'var(--green)' }}>{p.status.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {p.status === 'open' ? (
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => closePeriod(p)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Close</button>
                        {!p.closed_at && <button type="button" onClick={() => deletePeriod(p)} style={{ fontSize: 12, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>}
                      </div>
                    ) : (
                      <button type="button" onClick={() => setReopening(p)} style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Reopen…</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <>
          <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 400 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>New Period</div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FY2026 or August 2026"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Type</label>
              <div style={{ marginBottom: 14 }}>
                <Select value={periodType} onValueChange={v => setPeriodType(v as 'MONTH' | 'YEAR')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="MONTH">Month (lock only)</SelectItem><SelectItem value="YEAR">Fiscal Year (lock + closing entries)</SelectItem></SelectContent>
                </Select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Start</label><DatePicker date={parseDateOnly(start)} onChange={d => setStart(toDateOnlyString(d) ?? '')} /></div>
                <div><label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>End</label><DatePicker date={parseDateOnly(end)} onChange={d => setEnd(toDateOnlyString(d) ?? '')} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={createPeriod}>Create</button>
              </div>
            </div>
          </div>
        </>
      )}

      {reopening && (
        <>
          <div onClick={() => setReopening(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 400 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Reopen "{reopening.name}"</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14 }}>The original close remains on record — reopening doesn't erase it.</div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Reason (required)</label>
              <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReopening(null)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={reopenPeriod}>Reopen</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
