import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import './Inventory.css';

interface Line {
  id: string; itemId: string; itemName?: string; itemSku?: string; locationCode?: string; baseUom?: string;
  batchNo: string | null; expectedQty: number; countedQty: number | null;
}
interface Session {
  id: string; warehouseId: string; warehouseName?: string; status: string; startedAt: string; postedAt: string | null;
  notes: string | null; lines: Line[];
}

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'error'> = { open: 'info', posted: 'success', cancelled: 'error' };

export function InventoryCountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/inventory/count-sessions/${id}`).then(setSession).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRecordCount(line: Line) {
    const qty = countInputs[line.id];
    if (!id || qty === undefined || qty === '') return;
    try {
      await apiFetch(`/v1/inventory/count-sessions/${id}/lines/${line.id}`, {
        method: 'PATCH', body: JSON.stringify({ countedQty: Number(qty) }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to record this count.');
    }
  }

  async function handlePost() {
    if (!id) return;
    setActing(true);
    try {
      const res = await apiFetch(`/v1/inventory/count-sessions/${id}/post`, { method: 'POST' });
      showAlert(`Posted — ${res.correctionsApplied} correction(s) applied.`, { title: 'Count Posted' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to post this count.');
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    setActing(true);
    try {
      await apiFetch(`/v1/inventory/count-sessions/${id}/cancel`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to cancel this count.');
    } finally {
      setActing(false);
    }
  }

  if (loading || !session) return <div className="inv-page"><div className="inv-empty">Loading…</div></div>;

  const uncountedLines = session.lines.filter(l => l.countedQty == null).length;
  const varianceLines = session.lines.filter(l => l.countedQty != null && l.countedQty !== l.expectedQty).length;

  return (
    <div className="inv-page">
      <div>
        <Button type="button" variant="outline" onClick={() => navigate('/inventory/counts')} style={{ marginBottom: 12 }}>
          <Icon name="arrowLeft" size={13} /><span>Back to Stock Counts</span>
        </Button>
        <PageHeader
          crumbs={['Inventory', 'Stock Counts', session.warehouseName ?? '—']}
          titlePlain="Stock"
          titleEm="count"
          subtitle={`Started ${new Date(session.startedAt).toLocaleString()}${session.notes ? ` · ${session.notes}` : ''}`}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant={STATUS_VARIANT[session.status] ?? 'info'}>{session.status}</Badge>
              {session.status === 'open' && (
                <>
                  <Button type="button" variant="outline" onClick={handleCancel} disabled={acting}>Cancel Count</Button>
                  <Button type="button" onClick={handlePost} disabled={acting || uncountedLines > 0}>
                    {acting ? 'Posting…' : 'Post Count'}
                  </Button>
                </>
              )}
            </div>
          }
        />
      </div>

      {session.status === 'open' && uncountedLines > 0 && (
        <div className="inv-empty" style={{ marginBottom: 16, textAlign: 'left', padding: '12px 16px', background: 'var(--gold-l)', borderRadius: 8, color: 'var(--gold)' }}>
          {uncountedLines} line(s) still need a counted quantity before this count can be posted.
        </div>
      )}
      {session.status === 'open' && uncountedLines === 0 && varianceLines > 0 && (
        <div className="inv-empty" style={{ marginBottom: 16, textAlign: 'left', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
          {varianceLines} line(s) have a variance — posting will create a real correction movement for each.
        </div>
      )}

      <div className="inv-card">
        <div className="inv-card-body">
          <table className="inv-table">
            <thead><tr><th>Item</th><th>Location</th><th>Batch</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead>
            <tbody>
              {session.lines.map(line => {
                const variance = line.countedQty != null ? line.countedQty - line.expectedQty : null;
                return (
                  <tr key={line.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{line.itemName}</div>
                      <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{line.itemSku}</div>
                    </td>
                    <td>{line.locationCode}</td>
                    <td>{line.batchNo ? <Badge variant="info">{line.batchNo}</Badge> : '—'}</td>
                    <td className="inv-mono">{line.expectedQty} {line.baseUom}</td>
                    <td>
                      {session.status === 'open' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Input
                            type="number" step="any" style={{ width: 90 }}
                            value={countInputs[line.id] ?? (line.countedQty != null ? String(line.countedQty) : '')}
                            onChange={e => setCountInputs(prev => ({ ...prev, [line.id]: e.target.value }))}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => handleRecordCount(line)}>Save</Button>
                        </div>
                      ) : (
                        <span className="inv-mono">{line.countedQty ?? '—'} {line.baseUom}</span>
                      )}
                    </td>
                    <td>
                      {variance == null ? <span style={{ color: 'var(--ink3)' }}>—</span> : variance === 0 ? (
                        <Badge variant="success">0</Badge>
                      ) : (
                        <Badge variant="warning">{variance > 0 ? '+' : ''}{variance}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
