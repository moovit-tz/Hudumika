import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { showPrompt } from '../lib/prompt.js';
import { ActivityTimeline } from '../components/crm/ActivityTimeline.js';
import { LabelChips } from '../components/crm/LabelChips.js';
import { ComposeEmailButton } from '../components/crm/ComposeEmailButton.js';
import { StartCallButton } from '../components/crm/StartCallButton.js';
import { CustomFieldsPanel } from '../components/crm/CustomFieldsPanel.js';
import { STAGE_COLORS, type PipelineStage } from './CrmPipelineStages.js';

/* ── Types — mirror deals.routes.ts's mapDeal() shape ── */
interface Deal {
  id: string;
  name: string;
  customer_id?: string;
  customer_name?: string;
  lead_id?: string;
  lead_company?: string;
  // A per-tenant configurable key (crm_pipeline_stages.key), not a fixed
  // literal set — see migration 459 / CrmPipelineStages.tsx.
  stage: string;
  value: number;
  currency: string;
  probability: number;
  owner_id?: string;
  owner_name?: string;
  source?: string;
  expected_close?: string;
  closed_at?: string;
  lost_reason?: string;
  notes?: string;
  stage_changed_at: string;
  days_in_stage: number;
  created_at: string;
}

interface Metrics {
  by_stage: Record<string, { count: number; value: number }>;
  open_count: number;
  open_value: number;
  win_rate_30d: number | null;
  closed_30d: number;
  leaderboard: { owner_id: string; owner_name: string; won: number; value: number }[];
}

function fmtMoney(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
}

/* ── Metrics strip ── */
function MetricTile({ icon, label, value, color, bg }: { icon: IconName; label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, minWidth: 160, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 38, height: 38, borderRadius: 'var(--r-sm)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/* ── Deal card ── */
function DealCard({ deal, closed, onOpen, onDragStart, dragging }: {
  deal: Deal; closed: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void; dragging: boolean;
}) {
  const aging = !closed && deal.days_in_stage >= 14;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      style={{
        background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
        padding: '11px 12px', cursor: 'grab', opacity: dragging ? 0.4 : 1, display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{deal.name}</div>
      {(deal.customer_name || deal.lead_company) && (
        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{deal.customer_name || deal.lead_company}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{fmtMoney(deal.value, deal.currency)}</span>
        {deal.owner_id ? <PersonAvatar userId={deal.owner_id} name={deal.owner_name || ''} size={22} /> : <span style={{ width: 22 }} />}
      </div>
      {aging && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--gold)', fontWeight: 700 }}>
          <Icon name="clock" size={11} /> {deal.days_in_stage}d in stage
        </div>
      )}
    </div>
  );
}

/* ── Create / edit modal ── */
function DealModal({ deal, onClose, onSaved }: { deal: Deal | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(deal?.name ?? '');
  const [customer, setCustomer] = useState<PickerItem | null>(deal?.customer_id ? { id: deal.customer_id, label: deal.customer_name || '' } : null);
  const [value, setValue] = useState(String(deal?.value ?? 0));
  const [currency, setCurrency] = useState(deal?.currency ?? 'TZS');
  const [ownerId, setOwnerId] = useState<string>(deal?.owner_id ?? '');
  const [staff, setStaff] = useState<{ value: string; label: string }[]>([]);
  const [expectedClose, setExpectedClose] = useState<string | undefined>(deal?.expected_close);
  const [saving, setSaving] = useState(false);
  const [activityRefresh, setActivityRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/hr/staff?search=').then((rows: any[]) => { if (alive) setStaff((rows || []).map(u => ({ value: u.id, label: u.name }))); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch('/v1/customers');
    const list = (res?.data ?? res ?? []) as any[];
    return list
      .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 20)
      .map(c => ({ id: c.id, label: c.name }));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        customer_id: customer?.id || null,
        value: Number(value) || 0,
        currency,
        owner_id: ownerId || null,
        expected_close: expectedClose || null,
      };
      if (deal) {
        await apiFetch(`/v1/deals/${deal.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/v1/deals', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save deal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{deal ? 'Edit deal' : 'New deal'}</DialogTitle>
        </DialogHeader>

        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {deal && <LabelChips subjectType="deal" subjectId={deal.id} />}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Deal name</span>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Msomi Logistics — annual clearing contract" autoFocus />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Customer (optional)</span>
            <EntityPicker value={customer} onChange={setCustomer} search={searchCustomers} placeholder="Search customers…" />
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Value</span>
              <input className="input-field" type="number" min={0} value={value} onChange={e => setValue(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Currency</span>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="input-field" style={{ height: 36, padding: '0 8px' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['TZS', 'USD', 'KES', 'UGX'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Owner</span>
            <Combobox
              options={staff}
              value={ownerId}
              onChange={setOwnerId}
              placeholder={staff.length ? 'Assign to…' : 'Loading people…'}
              searchPlaceholder="Search people…"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Expected close</span>
            <DatePicker date={parseDateOnly(expectedClose)} onChange={d => setExpectedClose(d ? toDateOnlyString(d) : undefined)} />
          </label>

          {deal && <CustomFieldsPanel entityType="deal" subjectId={deal.id} heading="Custom Fields" />}

          {deal && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Activity</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ComposeEmailButton subjectType="deal" subjectId={deal.id} onSent={() => setActivityRefresh(n => n + 1)}>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', height: 26, fontSize: 11.5 }}>
                      <Icon name="mail" size={11} /> Email
                    </button>
                  </ComposeEmailButton>
                  <StartCallButton subjectType="deal" subjectId={deal.id} onLogged={() => setActivityRefresh(n => n + 1)}>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', height: 26, fontSize: 11.5 }}>
                      <Icon name="phone" size={11} /> Call
                    </button>
                  </StartCallButton>
                </div>
              </div>
              <ActivityTimeline key={activityRefresh} subjectType="deal" subjectId={deal.id} />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving || !name.trim()} onClick={save}>
            {saving ? 'Saving…' : deal ? 'Save changes' : 'Create deal'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ── */
export function Pipeline() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalDeal, setModalDeal] = useState<Deal | null | undefined>(undefined); // undefined = closed
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // The tenant's real, configurable stages (CrmPipelineStages.tsx manages
  // these) — replaces the fixed 5-column board every prior version hardcoded.
  const [stages, setStages] = useState<PipelineStage[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m, s] = await Promise.all([apiFetch('/v1/deals'), apiFetch('/v1/deals/metrics'), apiFetch('/v1/crm/pipeline-stages')]);
      setDeals(Array.isArray(d) ? d : []);
      setMetrics(m);
      setStages(Array.isArray(s) ? s.filter((x: PipelineStage) => x.active) : []);
    } catch (err: any) {
      showAlert(err.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stageByKey = useMemo(() => new Map(stages.map(s => [s.key, s])), [stages]);

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of stages) map[s.key] = [];
    for (const d of deals) (map[d.stage] ??= []).push(d);
    return map;
  }, [deals, stages]);

  async function moveStage(dealId: string, stage: string) {
    try {
      let lost_reason: string | null = null;
      if (stageByKey.get(stage)?.is_lost) {
        lost_reason = await showPrompt('Why was this deal lost?', { title: 'Mark as lost', confirmLabel: 'Mark lost', placeholder: 'e.g. Went with a competitor on price' });
        if (lost_reason === null) return; // cancelled
      }
      await apiFetch(`/v1/deals/${dealId}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, lost_reason }) });
      await load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to move deal');
    }
  }

  return (
    <div style={{ padding: '20px 0 40px' }}>
      <PageHeader
        crumbs={['CRM', 'Pipeline']}
        titlePlain="Sales"
        titleEm="pipeline"
        subtitle="Every deal, its stage, and who owns it — dragged, not just listed."
        actions={<Button size="sm" onClick={() => setModalDeal(null)}><Icon name="plus" size={14} /> New deal</Button>}
      />

      {metrics && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '18px 0 24px' }}>
          <MetricTile icon="briefcase" label="Open pipeline value" value={fmtMoney(metrics.open_value, 'TZS')} color="var(--teal)" bg="var(--teal-l)" />
          <MetricTile icon="trendingUp" label="Open deals" value={String(metrics.open_count)} color="var(--blue)" bg="var(--blue-l)" />
          <MetricTile icon="target" label="Win rate (30d)" value={metrics.win_rate_30d === null ? '—' : `${metrics.win_rate_30d}%`} color="var(--green)" bg="var(--green-l)" />
          <MetricTile icon="checkCircle" label="Closed (30d)" value={String(metrics.closed_30d)} color="var(--gold)" bg="var(--gold-l)" />
        </div>
      )}

      {metrics && metrics.leaderboard.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Top performers — deals won</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {metrics.leaderboard.slice(0, 5).map((rep, i) => (
              <div key={rep.owner_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink3)', width: 14 }}>{i + 1}</span>
                <PersonAvatar userId={rep.owner_id} name={rep.owner_name} size={26} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{rep.owner_name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{rep.won} won · {fmtMoney(rep.value, 'TZS')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink3)' }}>Loading pipeline…</div>
      ) : stages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink3)' }}>No pipeline stages configured yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, minmax(260px, 1fr))`, gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
          {stages.map(col => {
            const list = byStage[col.key] || [];
            const total = list.reduce((s, d) => s + d.value, 0);
            const tint = STAGE_COLORS[col.color] ?? STAGE_COLORS.blue;
            const closed = col.is_won || col.is_lost;
            return (
              <div
                key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (draggingId) moveStage(draggingId, col.key); setDraggingId(null); }}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', minHeight: 420, overflow: 'hidden' }}
              >
                <div style={{ padding: '10px 12px', borderBottom: `2px solid ${tint.fg}`, background: tint.bg }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: tint.fg }}>{col.label} <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>({list.length})</span></div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{fmtMoney(total, 'TZS')}</div>
                </div>
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>
                  {list.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>No deals here</div>}
                  {list.map(d => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      closed={closed}
                      dragging={draggingId === d.id}
                      onOpen={() => setModalDeal(d)}
                      onDragStart={e => { e.dataTransfer.setData('text/deal-id', d.id); setDraggingId(d.id); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalDeal !== undefined && (
        <DealModal deal={modalDeal} onClose={() => setModalDeal(undefined)} onSaved={load} />
      )}
    </div>
  );
}
