import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

// ── Rate Card — the tenant's own per-consignment ICD & C&F/agency charges,
// used to preload the Landed Cost Calculator's defaults instead of the
// calculator guessing. Distinct from Reference's TPA/TASAC tab, which is
// global government tariff data shared by every tenant; this is each
// tenant's own commercial pricing. See apps/api/src/services/rate-card.service.ts.

type CardKey = '20ft' | '40ft' | 'sea' | 'air' | 'road';
const CARDS: { key: CardKey; label: string }[] = [
  { key: '20ft', label: '20ft FCL' },
  { key: '40ft', label: '40ft FCL' },
  { key: 'sea',  label: 'Sea (LCL)' },
  { key: 'air',  label: 'Air' },
  { key: 'road', label: 'Road' },
];

interface RateCardItem {
  id: string | null;
  card: CardKey;
  category: 'ICD' | 'AGENCY' | 'OTHER';
  code: string | null;
  charge_name: string;
  unit: string | null;
  rate_amount: string;
  min_charge: string | null;
  rate_currency: string;
  notes: string | null;
}

interface IcdOperator { id: string; name: string; operator_type: string; region: string | null }

async function searchIcdOperators(q: string): Promise<PickerItem[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await apiFetch(`/v1/rate-card/icd-operators/search?q=${encodeURIComponent(q.trim())}`);
    return (res.data ?? []).map((o: IcdOperator) => ({ id: o.id, label: o.name, sublabel: [o.operator_type, o.region].filter(Boolean).join(' · ') }));
  } catch { return []; }
}

const th: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', fontSize: 13 };
const editInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--teal)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font)' };

export const RateCardPage: React.FC = () => {
  const { user } = useAuth();
  const canEdit = !!user && MGMT_ROLES.includes(user.role as any);

  const [card, setCard] = useState<CardKey>('20ft');
  const [items, setItems] = useState<RateCardItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Real ICD operators charge different rates for the same service — an
  // operator-specific rate card (linked to the global ICD directory) lives
  // alongside the card's own generic default (icdOperatorId === null).
  const [icdOperatorId, setIcdOperatorId] = useState<string | null>(null);
  const [operators, setOperators] = useState<IcdOperator[]>([]);
  const [addingOperator, setAddingOperator] = useState(false);
  const [operatorPicker, setOperatorPicker] = useState<PickerItem | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null); // 'code:X' or 'id:X'
  const [draft, setDraft] = useState<{ rate_amount: string; rate_currency: string; notes: string; charge_name: string; unit: string; min_charge: string }>({ rate_amount: '', rate_currency: 'USD', notes: '', charge_name: '', unit: '', min_charge: '' });
  const [saving, setSaving] = useState(false);

  const [addingExtra, setAddingExtra] = useState(false);
  const [extraDraft, setExtraDraft] = useState({ category: 'OTHER' as 'ICD' | 'AGENCY' | 'OTHER', charge_name: '', unit: '', rate_amount: '', rate_currency: 'USD' });

  const load = async (c: CardKey, opId: string | null) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/v1/rate-card/${c}${opId ? `?icd_operator_id=${opId}` : ''}`);
      setItems(res.data ?? []);
    } catch (err) {
      console.error('Rate card lookup failed:', err);
    } finally {
      setLoading(false);
    }
  };
  const loadOperators = async (c: CardKey) => {
    try {
      const res = await apiFetch(`/v1/rate-card/${c}/icd-operators`);
      setOperators(res.data ?? []);
    } catch (err) {
      console.error('ICD operator lookup failed:', err);
    }
  };

  // Card change resets which ICD operator is selected (each card has its
  // own operator list) — the load effect below re-fires once that settles.
  useEffect(() => { setEditingKey(null); setIcdOperatorId(null); setAddingOperator(false); loadOperators(card); }, [card]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEditingKey(null); load(card, icdOperatorId); }, [card, icdOperatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectOperator(item: PickerItem) {
    setOperators(prev => prev.some(o => o.id === item.id) ? prev : [...prev, { id: item.id, name: item.label, operator_type: '', region: null }]);
    setIcdOperatorId(item.id);
    setOperatorPicker(null);
    setAddingOperator(false);
  }

  function startEdit(row: RateCardItem) {
    setEditingKey(row.code ? `code:${row.code}` : `id:${row.id}`);
    setDraft({ rate_amount: row.rate_amount, rate_currency: row.rate_currency, notes: row.notes ?? '', charge_name: row.charge_name, unit: row.unit ?? '', min_charge: row.min_charge ?? '' });
  }
  function cancelEdit() { setEditingKey(null); }

  async function saveEdit(row: RateCardItem) {
    setSaving(true);
    try {
      const path = row.code ? `/v1/rate-card/${card}/${row.code}` : `/v1/rate-card/${card}/item/${row.id}`;
      const body: Record<string, any> = { rate_amount: parseFloat(draft.rate_amount) || 0, rate_currency: draft.rate_currency, notes: draft.notes || null, icd_operator_id: icdOperatorId,
        // Blank clears the floor (null); it must not become 0, which would be
        // a real zero minimum rather than 'no minimum applies'.
        min_charge: draft.min_charge.trim() === '' ? null : (parseFloat(draft.min_charge) || 0) };
      if (!row.code) { body.charge_name = draft.charge_name; body.unit = draft.unit; }
      const res = await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
      setItems(prev => prev.map(r => (row.code ? r.code === row.code : r.id === row.id) ? res.data : r));
      cancelEdit();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function addExtra() {
    if (!extraDraft.charge_name.trim()) { showAlert('Charge name is required'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/v1/rate-card/${card}`, {
        method: 'POST',
        body: JSON.stringify({ ...extraDraft, rate_amount: parseFloat(extraDraft.rate_amount) || 0, icd_operator_id: icdOperatorId }),
      });
      setItems(prev => [...prev, res.data]);
      setAddingExtra(false);
      setExtraDraft({ category: 'OTHER', charge_name: '', unit: '', rate_amount: '', rate_currency: 'USD' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  }

  async function removeExtra(row: RateCardItem) {
    if (!row.id) return;
    if (!(await showConfirm(`Remove "${row.charge_name}"?`, { title: 'Remove charge', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/rate-card/${card}/${row.id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(r => r.id !== row.id));
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove item');
    }
  }

  const icdRows = items.filter(r => r.category === 'ICD');
  const agencyRows = items.filter(r => r.category === 'AGENCY');
  const otherRows = items.filter(r => r.category === 'OTHER');

  function renderTable(rows: RateCardItem[], title: string, hint: string) {
    return (
      <div style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 8 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '2px 0 0' }}>{hint}</p>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr style={{ background: 'var(--bg)' }}>
              <th style={th}>Charge</th><th style={th}>Unit</th><th style={th}>Rate</th><th style={th}>Min</th><th style={th}>Notes</th>
              {canEdit && <th style={{ ...th, width: 90 }}></th>}
            </tr></thead>
            <tbody>
              {rows.map(row => {
                const key = row.code ? `code:${row.code}` : `id:${row.id}`;
                const isEditing = editingKey === key;
                return (
                  <tr key={key}>
                    <td style={td}>
                      {isEditing && !row.code
                        ? <input style={editInput} value={draft.charge_name} onChange={e => setDraft(d => ({ ...d, charge_name: e.target.value }))} />
                        : <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.charge_name}</span>}
                    </td>
                    <td style={td}>
                      {isEditing && !row.code
                        ? <input style={editInput} value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))} />
                        : <span style={{ color: 'var(--ink3)' }}>{row.unit || '—'}</span>}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Select value={draft.rate_currency} onValueChange={v => setDraft(d => ({ ...d, rate_currency: v }))}>
                            <SelectTrigger style={{ width: 78, height: 30, minHeight: 30, fontSize: 12.5, flex: 'none' }}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="TZS">TZS</SelectItem>
                            </SelectContent>
                          </Select>
                          <input style={editInput} type="number" min="0" step="0.01" value={draft.rate_amount} onChange={e => setDraft(d => ({ ...d, rate_amount: e.target.value }))} />
                        </div>
                      ) : (
                        Number(row.rate_amount) > 0
                          ? <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{row.rate_currency} {Number(row.rate_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          : <span style={{ color: 'var(--ink4)' }}>Not set</span>
                      )}
                    </td>
                    {/* Minimum charge — only meaningful for rates quoted per
                        CBM/kg, where carriers apply a floor. Blank = no floor,
                        which is correct for every per-container FCL row. */}
                    <td style={td}>
                      {isEditing ? (
                        <input style={editInput} type="number" min="0" step="0.01" placeholder="None"
                          value={draft.min_charge} onChange={e => setDraft(d => ({ ...d, min_charge: e.target.value }))} />
                      ) : (
                        row.min_charge != null && Number(row.min_charge) > 0
                          ? <span style={{ color: 'var(--ink2)' }}>{row.rate_currency} {Number(row.min_charge).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          : <span style={{ color: 'var(--ink4)' }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      {isEditing
                        ? <input style={editInput} placeholder="Optional note" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
                        : <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{row.notes || '—'}</span>}
                    </td>
                    {canEdit && (
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" disabled={saving} onClick={() => saveEdit(row)} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={13} /></button>
                            <button type="button" onClick={cancelEdit} style={{ background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={13} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => startEdit(row)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="edit" size={12} color="var(--ink3)" /></button>
                            {!row.code && (
                              <button type="button" onClick={() => removeExtra(row)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" size={12} color="var(--red)" /></button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={canEdit ? 6 : 5} style={{ ...td, textAlign: 'center', color: 'var(--ink4)' }}>No items yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Rate Card']}
        titlePlain="Rate"
        titleEm="card"
        subtitle="Your own per-consignment ICD and clearing-agent charges, split by container/mode. The Landed Cost Calculator preloads these as its defaults for the matching card."
      />

      {!canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
          <Icon name="lock" size={13} />
          Only company management roles can edit the rate card. You can view current values below.
        </div>
      )}

      <Tabs value={card} onValueChange={v => setCard(v as CardKey)} variant="segmented" className="mb-5">
        {/* Tabs left, "Rates for" cluster right — one row on desktop; wraps
            to two only when the combined width genuinely doesn't fit. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <TabsList>
            {CARDS.map(c => (
              <TabsTrigger key={c.key} value={c.key}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.03em' }}>Rates for</span>
            <Select value={icdOperatorId ?? '__generic__'} onValueChange={v => setIcdOperatorId(v === '__generic__' ? null : v)}>
              <SelectTrigger style={{ width: 260, height: 34, fontSize: 13 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__generic__">Generic default</SelectItem>
                {operators.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {canEdit && (addingOperator ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 260 }}>
                  <EntityPicker value={operatorPicker} onChange={item => item && selectOperator(item)} search={searchIcdOperators} placeholder="Search ICD operators…" />
                </div>
                <button type="button" onClick={() => setAddingOperator(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink3)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingOperator(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 12px', fontSize: 13, fontWeight: 700, color: 'var(--teal)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="plusCircle" size={13} /> Link an ICD operator
              </button>
            ))}
          </div>
        </div>

        {card === 'road' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 9, fontSize: 12.5, color: 'var(--gold)', fontWeight: 600, marginBottom: 16 }}>
            <Icon name="info" size={13} />
            The Landed Cost Calculator doesn't have a road-freight mode yet, so this tab isn't read by it — populate it for your own reference until that's added.
          </div>
        )}

        {icdOperatorId && (
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8, marginBottom: 16 }}>
            Showing {operators.find(o => o.id === icdOperatorId)?.name ?? 'this operator'}'s own rates — the calculator's ICD picker lets you choose which one applies per shipment.
          </div>
        )}

        {CARDS.map(c => (
          <TabsContent key={c.key} value={c.key}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : (
              <>
                {/* Air freight never routes through an ICD — an empty "ICD
                    Charges" table here isn't a gap to fill, it's a category
                    that doesn't apply. Still shown if something was added to
                    it anyway (e.g. after switching a shipment's mode), so
                    nothing already saved goes missing. */}
                {(c.key !== 'air' || icdRows.length > 0) &&
                  renderTable(icdRows, c.key === 'sea' ? 'ICD / CFS Charges' : 'ICD Charges', c.key === 'sea' ? 'Per-CBM handling, corridor levy, removal, storage and stripping charges for consolidated cargo.' : 'The charges common to every consignment at your ICD.')}
                {renderTable(agencyRows, c.key === 'air' ? 'Documentation & Agency Charges' : 'C&F / Agency Charges', c.key === 'air' ? 'Per-AWB documentation, notification and your standard agency fee.' : 'Verification, documentation and your standard agency fee.')}
                {renderTable(otherRows, c.key === 'air' ? 'Airport / Handling Charges' : 'Other Charges', c.key === 'air' ? 'Airport authority, handling, equipment, security and data-discharge fees, mostly per kg.' : c.key === 'sea' ? 'Shipping line, consolidation and DO fees for LCL cargo.' : 'Extra charges specific to this card — not read by the calculator, shown for reference alongside your quote.')}

                {canEdit && (
                  addingExtra ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                      <Select value={extraDraft.category} onValueChange={v => setExtraDraft(d => ({ ...d, category: v as any }))}>
                        <SelectTrigger style={{ width: 118, height: 30, minHeight: 30, fontSize: 12.5 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OTHER">Other</SelectItem>
                          <SelectItem value="ICD">ICD</SelectItem>
                          <SelectItem value="AGENCY">Agency</SelectItem>
                        </SelectContent>
                      </Select>
                      <input style={{ ...editInput, width: 180 }} placeholder="Charge name" value={extraDraft.charge_name} onChange={e => setExtraDraft(d => ({ ...d, charge_name: e.target.value }))} />
                      <input style={{ ...editInput, width: 120 }} placeholder="Unit" value={extraDraft.unit} onChange={e => setExtraDraft(d => ({ ...d, unit: e.target.value }))} />
                      <Select value={extraDraft.rate_currency} onValueChange={v => setExtraDraft(d => ({ ...d, rate_currency: v }))}>
                        <SelectTrigger style={{ width: 78, height: 30, minHeight: 30, fontSize: 12.5 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="TZS">TZS</SelectItem>
                        </SelectContent>
                      </Select>
                      <input style={{ ...editInput, width: 100 }} type="number" min="0" step="0.01" placeholder="Rate" value={extraDraft.rate_amount} onChange={e => setExtraDraft(d => ({ ...d, rate_amount: e.target.value }))} />
                      <button type="button" disabled={saving} onClick={addExtra} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Add</button>
                      <button type="button" onClick={() => setAddingExtra(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 14px', fontSize: 13, fontWeight: 600, color: 'var(--ink3)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingExtra(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontSize: 13, fontWeight: 700, color: 'var(--teal)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="plusCircle" size={14} /> Add charge to this card
                    </button>
                  )
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
