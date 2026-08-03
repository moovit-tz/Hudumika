import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { DECLARATION_STATUS_LABELS, type DeclarationStatus } from '@hudumika/types';

/**
 * Every TANSAD declaration in the workspace.
 *
 * This screen used to list seal_customs_entries — SEAL's ex-warehouse entry,
 * which has no shipment link at all — under the name "Declarations". Those
 * pages are back in SEAL now. This lists the real thing: the `declarations`
 * table from migration 004, which is what a clearing agent lodges with TRA and
 * what carries the assessment, the selectivity lane and the release.
 *
 * The declaration itself is edited on its shipment (ShipmentDetail's
 * Declaration tab) because that is where the data it needs already lives, so
 * every row here opens that shipment rather than a second editor.
 */

interface DeclRow {
  id: string;
  shipment_id: string;
  tancis_ref: string;
  tansad_number: string | null;
  importer_name: string;
  declarant_name: string;
  status: DeclarationStatus;
  selectivity_channel: string | null;
  total_customs_value: string | number;
  invoice_currency: string;
  no_of_items: number;
  clearing_office: string;
  reference_date: string;
  created_at: string;
}

const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  DRAFT: 'gray', VALIDATED: 'info', SAVED: 'info', TRANSFERRED: 'brand',
  ACCEPTED: 'brand', ASSESSED: 'warning', PAID: 'info', RELEASED: 'success',
  AMENDED: 'warning', CANCELLED: 'error',
};

/**
 * The lane TRA assigns. Colours are the literal ones customs uses — green is
 * straight through, red is a physical examination — so they are not themed.
 */
const LANE: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info'; hint: string }> = {
  GREEN:  { label: 'Green',  variant: 'success', hint: 'Straight through — no examination' },
  YELLOW: { label: 'Yellow', variant: 'warning', hint: 'Documentary check' },
  RED:    { label: 'Red',    variant: 'error',   hint: 'Physical examination required' },
  BLUE:   { label: 'Blue',   variant: 'info',    hint: 'Post-clearance audit' },
};

const STATUS_ORDER: DeclarationStatus[] = [
  'DRAFT', 'VALIDATED', 'SAVED', 'TRANSFERRED', 'ACCEPTED',
  'ASSESSED', 'PAID', 'RELEASED', 'AMENDED', 'CANCELLED',
];

const money = (v: string | number | null, ccy: string) => {
  const n = Number(v ?? 0);
  if (!n) return '—';
  return `${ccy} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const fdate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function ClearOSDeclarations() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DeclRow[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('__all__');
  const [lane, setLane] = useState('__all__');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (status !== '__all__') params.set('status', status);
    if (lane !== '__all__') params.set('selectivity_channel', lane);
    if (search.trim()) params.set('search', search.trim());

    apiFetch(`/v1/declarations?${params.toString()}`)
      .then((r: any) => { if (alive) setRows(r?.data ?? []); })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Could not load declarations.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, lane, search]);

  // The declaration stores shipment_id but not the ref a person recognises.
  useEffect(() => {
    apiFetch('/v1/shipments?limit=500')
      .then((r: any) => {
        const map: Record<string, string> = {};
        for (const s of r?.data ?? []) map[s.id] = s.ref_number;
        setRefs(map);
      })
      .catch(() => setRefs({}));
  }, []);

  const summary = useMemo(() => {
    const awaiting = rows.filter(r => ['TRANSFERRED', 'ACCEPTED'].includes(r.status)).length;
    const assessed = rows.filter(r => r.status === 'ASSESSED').length;
    const released = rows.filter(r => r.status === 'RELEASED').length;
    const red = rows.filter(r => r.selectivity_channel === 'RED').length;
    return { awaiting, assessed, released, red };
  }, [rows]);

  const filtersOn = status !== '__all__' || lane !== '__all__' || !!search.trim();

  return (
    <div>
      <PageHeader
        crumbs={['ClearOS', 'Declarations']}
        titlePlain="Customs"
        titleEm="declarations"
        subtitle="Every TANSAD lodged for this workspace — its assessment, lane and release."
        actions={
          <Button type="button" variant="outline" onClick={() => navigate('/clearos/ops')}>
            <Icon name="package" size={14} /> Ops Command
          </Button>
        }
      />

      {/* Tiles read from the rows on screen, so they always agree with the table. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'With TRA', value: summary.awaiting, tone: 'brand' as const, icon: 'send' },
          { label: 'Assessed, unpaid', value: summary.assessed, tone: 'warning' as const, icon: 'dollarSign' },
          { label: 'Released', value: summary.released, tone: 'success' as const, icon: 'checkCircle' },
          { label: 'Red lane', value: summary.red, tone: 'error' as const, icon: 'alertTriangle' },
        ].map(t => (
          <div key={t.label} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))', padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <FeaturedIcon variant={t.tone} size="sm"><Icon name={t.icon as any} size={14} /></FeaturedIcon>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{t.label}</span>
            </div>
            <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* One row of controls, all 36px tall — Input, Select and Button share
          the design system's h-9, so nothing here sets its own height. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
          <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="TANCIS ref, TANSAD or importer…"
            style={{ paddingLeft: 32 }}
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger style={{ width: 190 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{DECLARATION_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={lane} onValueChange={setLane}>
          <SelectTrigger style={{ width: 170 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any lane</SelectItem>
            {Object.entries(LANE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label} lane</SelectItem>)}
          </SelectContent>
        </Select>

        {filtersOn && (
          <Button type="button" variant="ghost" onClick={() => { setStatus('__all__'); setLane('__all__'); setSearch(''); }}>
            Clear
          </Button>
        )}
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '38px 22px', textAlign: 'center' }}>
            <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="fileText" size={20} /></FeaturedIcon>
            <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)', marginTop: 12 }}>
              {filtersOn ? 'No declarations match these filters.' : 'No declarations lodged yet.'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 5, maxWidth: 430, marginInline: 'auto', lineHeight: 1.6 }}>
              {filtersOn
                ? 'Try widening the search, or clear the filters.'
                : 'A declaration is created from its shipment — open a consignment in Ops Command and use its Declaration tab.'}
            </div>
            {!filtersOn && (
              <Button type="button" style={{ marginTop: 14 }} onClick={() => navigate('/clearos/ops')}>
                <Icon name="package" size={14} color="white" /> Go to Ops Command
              </Button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['TANCIS ref', 'Shipment', 'Importer', 'Status', 'Lane', 'Items', 'Customs value', 'Lodged'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const laneInfo = r.selectivity_channel ? LANE[r.selectivity_channel] : null;
                  return (
                    <tr
                      key={r.id}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => navigate(`/clearos/clearance/${r.shipment_id}`)}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink)' }}>{r.tancis_ref}</div>
                        {r.tansad_number && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{r.tansad_number}</div>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                        {refs[r.shipment_id] ?? <span style={{ color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.importer_name || '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{DECLARATION_STATUS_LABELS[r.status] ?? r.status}</Badge>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {/* An unassigned lane is stated as such. Showing "Green"
                            for "we don't know yet" would send someone to the gate. */}
                        {laneInfo
                          ? <span title={laneInfo.hint}><Badge variant={laneInfo.variant}>{laneInfo.label}</Badge></span>
                          : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Not assigned</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--ink2)' }}>{r.no_of_items || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                        {money(r.total_customs_value, r.invoice_currency)}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(r.reference_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 10 }}>
          {rows.length} declaration{rows.length === 1 ? '' : 's'} · a row opens its shipment, where the declaration is edited.
        </div>
      )}
    </div>
  );
}
