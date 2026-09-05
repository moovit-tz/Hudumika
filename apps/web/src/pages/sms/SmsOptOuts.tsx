import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';

interface OptOut { id: string; phone: string; reason: string; note: string | null; created_at: string; }
interface Inbound { id: string; from_number: string; body: string; matched_keyword: string | null; created_at: string; }

export function SmsOptOuts() {
  usePageSEO('SMS Opt-outs', 'Numbers that must never be sent to — self-opted-out via a STOP reply, or manually blocked.');
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [inbound, setInbound] = useState<Inbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/opt-outs').then(res => setOptOuts(res.data || [])),
      apiFetch('/v1/sms/inbound').then(res => setInbound(res.data || [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function addOptOut() {
    if (!phone.trim()) { setError('Enter a phone number.'); return; }
    setAdding(true); setError(null);
    try {
      await apiFetch('/v1/sms/opt-outs', { method: 'POST', body: JSON.stringify({ phone: phone.trim(), note: note.trim() || undefined }) });
      setPhone(''); setNote('');
      load();
    } catch (err: any) { setError(err.message || 'Failed to add.'); }
    finally { setAdding(false); }
  }

  async function remove(id: string, phone: string) {
    if (!await showConfirm(`"${phone}" will be able to receive SMS again.`, { title: 'Remove from blacklist?', confirmLabel: 'Remove' })) return;
    setOptOuts(prev => prev.filter(o => o.id !== id));
    await apiFetch(`/v1/sms/opt-outs/${id}`, { method: 'DELETE' }).catch(load);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Opt-outs']}
        titlePlain="Opt-outs"
        titleEm="blacklist"
        subtitle="Checked before every send — a number here is never contacted, no matter which app or campaign tries."
      />

      <SectionCard title="Add a number" collapsible={false}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, maxWidth: 240 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Phone number</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255700000000" />
          </div>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Note (optional)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Why this number is blocked" />
          </div>
          <Button disabled={adding} onClick={addOptOut}><Icon name="plus" size={14} /> Block</Button>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      </SectionCard>

      <div style={{ marginTop: 20 }}>
        <SectionCard title={`Blocked numbers (${optOuts.length})`} padded={false} collapsible={false}>
          {loading ? (
            <SectionLoading />
          ) : optOuts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No numbers blocked yet.</div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Phone', 'Reason', 'Note', 'Added', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {optOuts.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{o.phone}</td>
                    <td style={{ padding: '12px 16px' }}><Badge variant={o.reason === 'stop_keyword' ? 'warning' : 'gray'}>{o.reason === 'stop_keyword' ? 'STOP reply' : 'Manual'}</Badge></td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{o.note || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(o.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" onClick={() => remove(o.id, o.phone)}><Icon name="x" size={13} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionCard title="Recent inbound messages" padded={false} collapsible={false}>
          {inbound.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No inbound messages received yet.</div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['From', 'Message', 'Matched keyword', 'Received'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {inbound.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.from_number}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{m.body}</td>
                    <td style={{ padding: '12px 16px' }}>{m.matched_keyword ? <Badge variant="warning">{m.matched_keyword}</Badge> : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(m.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
