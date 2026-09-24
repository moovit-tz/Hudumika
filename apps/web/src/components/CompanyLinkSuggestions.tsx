import { useCallback, useEffect, useState } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Spinner } from './ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

interface Side { id: string; name: string; roles: string }
interface Suggestion { a: Side; b: Side; reason: string }

interface LinkedPair { a: Side; b: Side }

/**
 * "Companies that may be the same" — a customer that is also a supplier, or any
 * two organization records that look alike (same tax ID, registration number,
 * name once "Ltd/Limited/Co" is ignored, or a shared email/phone). These are
 * only candidates: a manager confirms each link, or marks it "not the same" so
 * it is never suggested again. Linking changes no ids and merges nothing — both
 * records keep their own invoices and bills; pickers just show one company.
 * Confirmed links are listed below with an Unlink action.
 */
export function CompanyLinkSuggestions() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [linked, setLinked] = useState<LinkedPair[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch('/v1/parties/link-suggestions').then((res: any) => setItems(res.data ?? [])).catch(() => setItems([]));
    apiFetch('/v1/parties/links').then((res: any) => setLinked(res.data ?? [])).catch(() => setLinked([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (a: string, b: string, path: 'links' | 'links/dismiss' | 'links/remove', successMsg: string) => {
    const key = `${a}|${b}`;
    setBusy(key);
    try {
      await apiFetch(`/v1/parties/${path}`, { method: 'POST', body: JSON.stringify({ a, b }) });
      showAlert(successMsg, { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update.');
    } finally { setBusy(null); }
  };

  if (items === null || linked === null) return <div style={{ padding: 16 }}><Spinner /></div>;
  if (items.length === 0 && linked.length === 0) return null;

  return (
    <div className="card" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20, marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Companies that may be the same</h3>
      <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 16px' }}>
        Confirming a link keeps both records and their history; it only lets other apps recognise them as one company.
      </p>
      {items.map(s => {
        const key = `${s.a.id}|${s.b.id}`;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {s.a.name} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>↔</span> {s.b.name}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Badge variant="gray">{s.a.roles}</Badge>
                <Badge variant="gray">{s.b.roles}</Badge>
                <Badge variant="info">{s.reason}</Badge>
              </div>
            </div>
            <Button size="sm" variant="secondary" disabled={busy === key} onClick={() => act(s.a.id, s.b.id, 'links/dismiss', 'Marked as different companies.')}>Not the same</Button>
            <Button size="sm" disabled={busy === key} onClick={() => act(s.a.id, s.b.id, 'links', 'Linked as the same company.')}>Link as one company</Button>
          </div>
        );
      })}
      {linked.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', margin: '20px 0 4px' }}>Linked companies</h4>
          {linked.map(l => {
            const key = `${l.a.id}|${l.b.id}`;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260, fontSize: 14, color: 'var(--ink)' }}>
                  {l.a.name} <span style={{ color: 'var(--ink3)' }}>=</span> {l.b.name}
                  <span style={{ marginLeft: 8 }}><Badge variant="success">Linked</Badge></span>
                </div>
                <Button size="sm" variant="outline" disabled={busy === key} onClick={() => act(l.a.id, l.b.id, 'links/remove', 'Unlinked — they are shown separately again.')}>Unlink</Button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
