import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

/**
 * Multi-entity accounting (ClearOS/FinOps M8) — a legal-entity/branch
 * concept on top of the GL, additive only. A tenant that never creates an
 * entity here keeps every report exactly as before: entity_id stays NULL
 * on every posting, and the existing single-tenant reports already ARE the
 * consolidated view. See gl.service.ts's M8 section for the full design.
 *
 * Figures are shown in each entity's own currency, not FX-converted to one
 * consolidated currency — that conversion logic doesn't exist anywhere in
 * this platform's GL reports yet (flagged, not silently invented).
 */

interface Entity { id: string; name: string; entity_code: string; country_code: string | null; currency: string; active: boolean; }
interface IcTxn {
  id: string; description: string; amount: string | number; currency: string; status: string;
  from_entity_name: string | null; to_entity_name: string | null; created_at: string;
}
interface ConsolidatedBucket { entityId: string | null; entityName: string; totals: { revenue: number; expenses: number; net: number }; }

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

export function MultiEntityAccounting() {
  const [tab, setTab] = useState<'entities' | 'intercompany' | 'consolidated'>('entities');

  const [entities, setEntities] = useState<Entity[]>([]);
  const [txns, setTxns] = useState<IcTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entityForm, setEntityForm] = useState({ name: '', entityCode: '', countryCode: '', currency: 'TZS' });
  const [txnForm, setTxnForm] = useState({ fromEntityId: '', toEntityId: '', description: '', amount: '', currency: 'TZS', fromAccountCode: '', toAccountCode: '' });

  const [plFrom, setPlFrom] = useState(monthStartIso());
  const [plTo, setPlTo] = useState(todayIso());
  const [consolidated, setConsolidated] = useState<{ entities: ConsolidatedBucket[]; total: { revenue: number; expenses: number; net: number } } | null>(null);
  const [consolidatedLoading, setConsolidatedLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/finance/entities').catch(() => []),
      apiFetch('/v1/finance/intercompany-transactions').catch(() => []),
    ]).then(([e, t]) => { setEntities(e); setTxns(t); }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const loadConsolidated = useCallback(() => {
    setConsolidatedLoading(true);
    apiFetch(`/v1/finance/consolidated-profit-loss?from=${plFrom}&to=${plTo}`)
      .then(setConsolidated)
      .catch(() => setConsolidated(null))
      .finally(() => setConsolidatedLoading(false));
  }, [plFrom, plTo]);
  useEffect(() => { if (tab === 'consolidated') loadConsolidated(); }, [tab, loadConsolidated]);

  async function saveEntity() {
    if (!entityForm.name.trim() || !entityForm.entityCode.trim()) { setError('Name and entity code are required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/finance/entities', {
        method: 'POST',
        body: JSON.stringify({
          name: entityForm.name.trim(), entityCode: entityForm.entityCode.trim(),
          countryCode: entityForm.countryCode.trim() || undefined, currency: entityForm.currency.trim() || undefined,
        }),
      });
      setEntityForm({ name: '', entityCode: '', countryCode: '', currency: 'TZS' });
      setShowEntityForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to create entity'); }
    finally { setSaving(false); }
  }

  async function saveTxn() {
    if (!txnForm.fromEntityId || !txnForm.toEntityId || !txnForm.description.trim() || !txnForm.amount || !txnForm.fromAccountCode.trim() || !txnForm.toAccountCode.trim()) {
      setError('All fields are required.');
      return;
    }
    if (txnForm.fromEntityId === txnForm.toEntityId) { setError('From and to entities must be different.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/finance/intercompany-transactions', {
        method: 'POST',
        body: JSON.stringify({
          fromEntityId: txnForm.fromEntityId, toEntityId: txnForm.toEntityId, description: txnForm.description.trim(),
          amount: parseFloat(txnForm.amount), currency: txnForm.currency.trim() || undefined,
          fromAccountCode: txnForm.fromAccountCode.trim(), toAccountCode: txnForm.toAccountCode.trim(),
        }),
      });
      setTxnForm({ fromEntityId: '', toEntityId: '', description: '', amount: '', currency: 'TZS', fromAccountCode: '', toAccountCode: '' });
      setShowTxnForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to post intercompany transaction'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts', 'Multi-Entity']}
        titlePlain="Multi-entity"
        titleEm="accounting"
        subtitle="Branches share one chart of accounts, tagged per entity for reporting — additive, so a tenant with no entities keeps its books exactly as before."
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button size="sm" variant={tab === 'entities' ? 'default' : 'outline'} onClick={() => setTab('entities')}>Entities</Button>
        <Button size="sm" variant={tab === 'intercompany' ? 'default' : 'outline'} onClick={() => setTab('intercompany')}>Intercompany</Button>
        <Button size="sm" variant={tab === 'consolidated' ? 'default' : 'outline'} onClick={() => setTab('consolidated')}>Consolidated P&L</Button>
      </div>

      {tab === 'entities' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowEntityForm(s => !s)}><Icon name="plus" size={14} /> {showEntityForm ? 'Cancel' : 'New entity'}</Button>
          </div>
          {showEntityForm && (
            <SectionCard title="New entity" collapsible={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
                  <Input value={entityForm.name} onChange={e => setEntityForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Hudumika Kenya Ltd" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Entity code *</label>
                  <Input value={entityForm.entityCode} onChange={e => setEntityForm(p => ({ ...p, entityCode: e.target.value.toUpperCase() }))} placeholder="KE-BR" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Country</label>
                  <Input value={entityForm.countryCode} onChange={e => setEntityForm(p => ({ ...p, countryCode: e.target.value.toUpperCase() }))} placeholder="KE" maxLength={2} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
                  <Input value={entityForm.currency} onChange={e => setEntityForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} />
                </div>
              </div>
              {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
              <Button disabled={saving} onClick={saveEntity}>{saving ? 'Saving…' : 'Save entity'}</Button>
            </SectionCard>
          )}

          <SectionCard title="Entities" padded={false} collapsible={false}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
            ) : entities.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No branches/entities configured — this tenant's books are one consolidated set, as they always have been.</div>
            ) : (
              <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Code', 'Name', 'Country', 'Currency', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {entities.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{e.entity_code}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{e.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{e.country_code || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{e.currency}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={e.active ? 'success' : 'gray'}>{e.active ? 'active' : 'inactive'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'intercompany' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button disabled={entities.length < 2} onClick={() => setShowTxnForm(s => !s)}><Icon name="plus" size={14} /> {showTxnForm ? 'Cancel' : 'New transaction'}</Button>
          </div>
          {entities.length < 2 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Create at least two entities before posting an intercompany transaction.</div>}
          {showTxnForm && (
            <SectionCard title="New intercompany transaction" collapsible={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>From entity (billing) *</label>
                  <Select value={txnForm.fromEntityId} onValueChange={v => setTxnForm(p => ({ ...p, fromEntityId: v }))}>
                    <SelectTrigger className="input-field"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{entities.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>To entity (paying) *</label>
                  <Select value={txnForm.toEntityId} onValueChange={v => setTxnForm(p => ({ ...p, toEntityId: v }))}>
                    <SelectTrigger className="input-field"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{entities.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Amount *</label>
                  <Input type="number" min="0" value={txnForm.amount} onChange={e => setTxnForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Description *</label>
                  <Input value={txnForm.description} onChange={e => setTxnForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Shared IT services recharge" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
                  <Input value={txnForm.currency} onChange={e => setTxnForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>From-entity credit account code *</label>
                  <Input value={txnForm.fromAccountCode} onChange={e => setTxnForm(p => ({ ...p, fromAccountCode: e.target.value }))} placeholder="e.g. 4500" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>To-entity debit account code *</label>
                  <Input value={txnForm.toAccountCode} onChange={e => setTxnForm(p => ({ ...p, toAccountCode: e.target.value }))} placeholder="e.g. 5102" />
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>
                Posts two balanced entries: the from-entity is debited to an Intercompany Receivable clearing account and credited on its own account code; the to-entity is debited on its own account code and credited to Intercompany Payable.
              </div>
              {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
              <Button disabled={saving} onClick={saveTxn}>{saving ? 'Posting…' : 'Post transaction'}</Button>
            </SectionCard>
          )}

          <SectionCard title="Intercompany transactions" padded={false} collapsible={false}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
            ) : txns.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No intercompany transactions yet.</div>
            ) : (
              <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['From', 'To', 'Description', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {txns.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink)' }}>{t.from_entity_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink)' }}>{t.to_entity_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{t.description}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{t.currency} {Number(t.amount).toFixed(2)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={t.status === 'posted' ? 'success' : 'gray'}>{t.status}</Badge></td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'consolidated' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Period" collapsible={false}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>From</label>
                <Input type="date" value={plFrom} onChange={e => setPlFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>To</label>
                <Input type="date" value={plTo} onChange={e => setPlTo(e.target.value)} />
              </div>
              <Button onClick={loadConsolidated} disabled={consolidatedLoading}>{consolidatedLoading ? 'Loading…' : 'Refresh'}</Button>
            </div>
          </SectionCard>

          <SectionCard title="P&L by entity" padded={false} collapsible={false}>
            {consolidatedLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
            ) : !consolidated ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No data for this period.</div>
            ) : (
              <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Entity', 'Revenue', 'Expenses', 'Net'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {consolidated.entities.map(e => (
                    <tr key={e.entityId ?? 'unassigned'} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.entityName}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{e.totals.revenue.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{e.totals.expenses.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{e.totals.net.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Total</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{consolidated.total.revenue.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>{consolidated.total.expenses.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{consolidated.total.net.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table></div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
