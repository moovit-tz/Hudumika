import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { apiFetch } from '../lib/api.js';
import {
  printSharedReport, rateCardKeyFor, fetchRateCardDefaults, fetchSizeCardsForLots,
} from './LandedCostPage.js';

/**
 * Every landed-cost calculation this tenant has run.
 *
 * This replaces a right-hand slide-over that listed the last fifty totals and
 * could do nothing with them — a multi-item entry said "View-only — re-enter
 * items to recalculate", which for a 206-line invoice meant the record was
 * decorative. Calculations are now saved with the whole result (migration
 * 166), so an entry here can be reopened, re-exported, and amended into a new
 * version without touching the figures a customer was already quoted.
 *
 * Searching and sorting happen on the server: a busy tenant accumulates
 * thousands of these, and fetching them all so the browser could filter would
 * be slow and would ship rows a narrower query never had to return.
 */

interface HistoryRow {
  id: string;
  hs_code: string | null;
  description: string | null;
  title: string | null;
  customer_name: string | null;
  customer_email: string | null;
  destination: string | null;
  shipment_ref: string | null;
  cif_usd: number | string | null;
  total_tzs: number | string | null;
  qty: number | string | null;
  item_count: number | null;
  shipment_mode: string | null;
  origin_country: string | null;
  loading_point: string | null;
  source: string | null;
  version: number;
  parent_id: string | null;
  has_payload: boolean;
  created_at: string;
}

type SortKey = 'created_at' | 'total' | 'customer' | 'description' | 'items';

const MODE_LABEL: Record<string, string> = {
  sea_fcl: 'Sea · FCL', sea_lcl: 'Sea · LCL', air: 'Airfreight', road: 'Road',
};

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtTzs = (v: unknown) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtUsd = (v: unknown) =>
  `$${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const LandedCostHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'single' | 'multi'>('all');
  const [mode, setMode] = useState('all');
  const [sort, setSort] = useState<SortKey>('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT), offset: String(offset), sort, dir,
      });
      if (q.trim()) params.set('q', q.trim());
      if (kind !== 'all') params.set('kind', kind);
      if (mode !== 'all') params.set('mode', mode);
      const res: any = await apiFetch(`/v1/customs/landed-cost/history?${params}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the calculation history.');
      setRows([]);
    }
    setLoading(false);
  }, [q, kind, mode, sort, dir, offset]);

  // Debounced so typing in the search box isn't one request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  function toggleSort(key: SortKey) {
    setOffset(0);
    if (sort === key) { setDir(d => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSort(key);
    setDir(key === 'created_at' || key === 'total' ? 'desc' : 'asc');
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail({ id });
    try {
      setDetail(await apiFetch(`/v1/customs/landed-cost/history/${id}`));
    } catch (e: any) {
      setNotice(e?.message ?? 'Could not open that calculation.');
      setDetail(null);
    }
    setDetailLoading(false);
  }

  /**
   * Re-renders a saved calculation through the very same report generator the
   * calculator uses, so a reopened estimate is the document that was handed
   * over — not a second implementation that can drift from it.
   *
   * The rate card is fetched fresh rather than stored: ICD and agency charges
   * are the tenant's own commercial rates, and a report reprinted today should
   * carry today's, with the tariff figures still those of the original
   * assessment. The QR is dropped — reprinting one would mint a link to an
   * estimate the reader already has.
   */
  async function openReport(id: string) {
    setBusyId(id);
    setNotice('');
    try {
      const rec: any = await apiFetch(`/v1/customs/landed-cost/history/${id}`);
      const payload = rec?.payload;
      if (!payload?.result) {
        setNotice('This calculation was saved before full results were kept, so it cannot be reopened. Its totals are still on record.');
        return;
      }
      const inputs = payload.inputs ?? {};
      const isMulti = Array.isArray(payload.result.items) && rec.hs_code === 'MULTI';
      const container = inputs.container ?? '20ft';
      const lots = Array.isArray(inputs.containers) ? inputs.containers : [];
      const [rateCard, sizeCards] = await Promise.all([
        fetchRateCardDefaults(rateCardKeyFor(payload.result.mode ?? inputs.mode ?? 'sea_fcl', container), inputs.icd_operator_id ?? null),
        lots.length ? fetchSizeCardsForLots(lots, inputs.icd_operator_id ?? null) : Promise.resolve({}),
      ]);
      printSharedReport({
        [isMulti ? 'multiResult' : 'result']: payload.result,
        qty: String(inputs.qty ?? '1'),
        container,
        rateCard,
        sizeCards,
        lots,
        meta: {
          customerName: rec.customer_name ?? undefined,
          customerEmail: rec.customer_email ?? undefined,
          destination: rec.destination ?? undefined,
        },
      } as any);
    } catch (e: any) {
      setNotice(e?.message ?? 'Could not reopen that report.');
    }
    setBusyId(null);
  }

  /**
   * Amending a saved estimate. The calculator loads the stored inputs and,
   * when it is next calculated, saves the result as the next version of this
   * record rather than overwriting it — the figures a customer was quoted stay
   * on the record, which is the whole point of keeping a history.
   */
  function customise(rec: HistoryRow) {
    navigate(`/clearos/customs-tools?from=${rec.id}`);
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const page = Math.floor(offset / LIMIT) + 1;

  const Th = ({ label, k, align }: { label: string; k?: SortKey; align?: 'right' }) => (
    <th
      onClick={k ? () => toggleSort(k) : undefined}
      style={{
        textAlign: align ?? 'left', padding: '10px 12px', fontSize: 10.5, fontWeight: 700,
        color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px',
        borderBottom: '1px solid var(--border)', cursor: k ? 'pointer' : 'default',
        whiteSpace: 'nowrap', userSelect: 'none',
      }}>
      {label}
      {k && sort === k && <Icon name={dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} color="var(--teal)" style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
    </th>
  );

  return (
    <div className="lch-page">
      <style>{`
        .lch-page { padding: 24px 32px; }
        .lch-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border);
                    border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); overflow: hidden; }
        .lch-card { --ctl-h: 44px; }
        .lch-card .input-field, .lch-card .btn, .lch-card [data-slot="select-trigger"],
        .lch-card [data-slot="combobox-trigger"] {
          height: var(--ctl-h); border-radius: var(--r-sm); padding-top: 0; padding-bottom: 0;
        }
        .lch-toolbar { display: grid; grid-template-columns: minmax(0,1fr) 170px 190px; gap: 12px;
                       padding: 18px; border-bottom: 1px solid var(--border); }
        /* The table scrolls inside its own box rather than lengthening the
           page — same rule the calculator's breakdown follows. */
        .lch-scroll { max-height: 62vh; overflow: auto; overscroll-behavior: contain;
                      scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .lch-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .lch-scroll::-webkit-scrollbar-track { background: transparent; }
        .lch-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .lch-scroll::-webkit-scrollbar-thumb:hover { background: var(--ink3); }
        .lch-scroll table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 900px; }
        .lch-scroll thead th { position: sticky; top: 0; z-index: 2; background: var(--card-bg, var(--white)); }
        .lch-scroll tbody tr { border-bottom: 1px solid var(--border); }
        .lch-scroll tbody tr:hover { background: var(--teal-l); }
        .lch-scroll td { padding: 11px 12px; vertical-align: top; }
        .lch-acts { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
        .lch-act { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700;
                   padding: 5px 10px; border-radius: var(--r-sm); cursor: pointer;
                   border: 1px solid var(--border); background: var(--card-bg, var(--white)); color: var(--ink2); }
        .lch-act:hover { border-color: var(--teal); color: var(--teal); }
        .lch-act[disabled] { opacity: .45; cursor: not-allowed; }
        .lch-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    padding: 14px 18px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--ink3); flex-wrap: wrap; }
        @media (max-width: 900px) {
          .lch-page { padding: 14px; }
          .lch-toolbar { grid-template-columns: 1fr; }
        }
      `}</style>

      <PageHeader
        crumbs={['Customs Tools', 'Landed Cost', 'History']}
        titlePlain="Calculation"
        titleEm="History"
        subtitle="Every landed cost estimate this workspace has run — search it, reopen the report, or amend one into a new version."
        actions={
          <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={() => navigate('/clearos/customs-tools')}>
            <Icon name="calculator" size={14} color="#fff" /> New calculation
          </button>
        }
      />

      {notice && (
        <div style={{ margin: '12px 0', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--gold-l)', border: '1px solid var(--gold-m, var(--gold-l))', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="info" size={15} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>{notice}</span>
        </div>
      )}

      <div className="lch-card" style={{ marginTop: 12 }}>
        <div className="lch-toolbar">
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              className="input-field"
              placeholder="Search description, HS code, customer, reference or destination…"
              value={q}
              onChange={e => { setQ(e.target.value); setOffset(0); }}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, fontSize: 13 }}
            />
          </div>
          <Select value={kind} onValueChange={v => { setKind(v as any); setOffset(0); }}>
            <SelectTrigger><SelectValue placeholder="All calculations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All calculations</SelectItem>
              <SelectItem value="single">Single item</SelectItem>
              <SelectItem value="multi">Multi-item</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={v => { setMode(v); setOffset(0); }}>
            <SelectTrigger><SelectValue placeholder="Any shipment mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any shipment mode</SelectItem>
              <SelectItem value="sea_fcl">Sea · FCL</SelectItem>
              <SelectItem value="sea_lcl">Sea · LCL</SelectItem>
              <SelectItem value="air">Airfreight</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div style={{ padding: '16px 18px', color: 'var(--red)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="alertCircle" size={15} color="var(--red)" /> {error}
          </div>
        )}

        <div className="lch-scroll">
          <table>
            <thead>
              <tr>
                <Th label="When" k="created_at" />
                <Th label="Calculation" k="description" />
                <Th label="Customer" k="customer" />
                <Th label="Mode" />
                <Th label="Lines" k="items" align="right" />
                <Th label="CIF (USD)" align="right" />
                <Th label="Landed total (TZS)" k="total" align="right" />
                <Th label="" align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isMulti = r.hs_code === 'MULTI';
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtWhen(r.created_at)}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
                        {r.title || r.description || '—'}
                        {r.version > 1 && (
                          <Badge variant="gray" style={{ marginLeft: 6 }}>v{r.version}</Badge>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                        {isMulti ? 'Multi-item' : <span style={{ color: 'var(--teal)', fontFamily: 'var(--mono, monospace)' }}>{r.hs_code}</span>}
                        {r.shipment_ref ? ` · ${r.shipment_ref}` : ''}
                        {r.loading_point ? ` · from ${r.loading_point}` : ''}
                      </div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--ink2)' }}>{r.customer_name || '—'}</div>
                      {r.destination && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{r.destination}</div>}
                    </td>
                    <td style={{ color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{MODE_LABEL[r.shipment_mode ?? ''] ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{isMulti ? (r.item_count ?? num(r.qty)) : 1}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink2)' }}>{r.cif_usd == null ? '—' : fmtUsd(r.cif_usd)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}>{fmtTzs(r.total_tzs)}</td>
                    <td>
                      <div className="lch-acts">
                        <button type="button" className="lch-act" onClick={() => openDetail(r.id)}>
                          <Icon name="eye" size={12} /> View
                        </button>
                        {/* Offered only when the record can actually produce a
                            document. A disabled button that explains itself is
                            better than one that fails after the click. */}
                        <button type="button" className="lch-act" disabled={!r.has_payload || busyId === r.id}
                          title={r.has_payload ? 'Open the printable report' : 'Saved before full results were kept — totals only'}
                          onClick={() => openReport(r.id)}>
                          <Icon name="download" size={12} /> {busyId === r.id ? 'Opening…' : 'Report'}
                        </button>
                        <button type="button" className="lch-act" disabled={!r.has_payload}
                          title={r.has_payload ? 'Load into the calculator and save as a new version' : 'Cannot be amended — no saved inputs'}
                          onClick={() => customise(r)}>
                          <Icon name="edit" size={12} /> Customise
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    {q || kind !== 'all' || mode !== 'all'
                      ? 'No calculation matches those filters.'
                      : 'No calculations yet. Run one from the Landed Cost calculator and it will be recorded here.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr><td colSpan={8} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="lch-foot">
          <span>
            {total === 0 ? 'Nothing to show' : `${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total.toLocaleString()} calculation${total === 1 ? '' : 's'}`}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="lch-act" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>
              <Icon name="arrowLeft" size={12} /> Previous
            </button>
            <span style={{ minWidth: 70, textAlign: 'center' }}>Page {page} of {pages}</span>
            <button type="button" className="lch-act" disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>
              Next <Icon name="arrowRight" size={12} />
            </button>
          </div>
        </div>
      </div>

      <Sheet open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <SheetContent side="right" style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', padding: 0 }}>
          <SheetHeader style={{ padding: '20px 20px 0' }}>
            <SheetTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="fileText" size={16} color="var(--teal)" /> Calculation detail
            </SheetTitle>
          </SheetHeader>
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontSize: 13 }}>
            {detailLoading && <div style={{ color: 'var(--ink3)' }}>Loading…</div>}
            {detail && !detailLoading && (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>
                  {detail.title || detail.description || '—'}
                </div>
                <div style={{ color: 'var(--ink3)', fontSize: 12, marginBottom: 16 }}>{fmtWhen(detail.created_at)}</div>

                <DRow label="Customer" value={detail.customer_name} />
                <DRow label="Contact" value={detail.customer_email} />
                <DRow label="Destination" value={detail.destination} />
                <DRow label="Shipment reference" value={detail.shipment_ref} />
                <DRow label="HS code" value={detail.hs_code === 'MULTI' ? `${detail.item_count ?? '—'} line items` : detail.hs_code} />
                <DRow label="Mode" value={MODE_LABEL[detail.shipment_mode ?? ''] ?? detail.shipment_mode} />
                <DRow label="Origin" value={detail.origin_country} />
                <DRow label="Loading point" value={detail.loading_point} />
                <DRow label="Price basis" value={detail.price_basis} />
                <DRow label="FX rate" value={detail.fx_rate ? `1 USD = TZS ${num(detail.fx_rate).toLocaleString()}` : null} />

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <DRow label="CIF" value={detail.cif_tzs ? `TZS ${fmtTzs(detail.cif_tzs)}` : null} />
                  <DRow label="Import duty" value={detail.duty_amount != null ? `TZS ${fmtTzs(detail.duty_amount)}` : null} />
                  <DRow label="VAT" value={detail.vat_amount != null ? `TZS ${fmtTzs(detail.vat_amount)}` : null} />
                  <DRow label="RDL" value={detail.rdl_amount != null ? `TZS ${fmtTzs(detail.rdl_amount)}` : null} />
                  <DRow label="CPF" value={detail.cpf_amount != null ? `TZS ${fmtTzs(detail.cpf_amount)}` : null} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1.5px solid var(--ink)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Landed total</strong>
                    <strong style={{ color: 'var(--teal)', fontSize: 15 }}>TZS {fmtTzs(detail.total_tzs)}</strong>
                  </div>
                </div>

                {Array.isArray(detail.versions) && detail.versions.length > 1 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 8 }}>
                      Versions of this estimate
                    </div>
                    {detail.versions.map((v: any) => (
                      <div key={v.id} onClick={() => openDetail(v.id)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                          padding: '9px 12px', marginBottom: 6, borderRadius: 'var(--r-sm)', cursor: 'pointer',
                          border: `1px solid ${v.id === detail.id ? 'var(--teal)' : 'var(--border)'}`,
                          background: v.id === detail.id ? 'var(--teal-l)' : 'transparent',
                        }}>
                        <span style={{ color: 'var(--ink2)' }}>v{v.version} · {fmtWhen(v.created_at)}</span>
                        <strong style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>TZS {fmtTzs(v.total_tzs)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 22 }}>
                  <button type="button" className="lch-act" style={{ justifyContent: 'center', padding: 'var(--ds-btn-py) 0', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                    disabled={!detail.payload} onClick={() => openReport(detail.id)}>
                    <Icon name="download" size={13} /> Open report
                  </button>
                  <button type="button" className="lch-act" style={{ justifyContent: 'center', padding: 'var(--ds-btn-py) 0', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                    disabled={!detail.payload} onClick={() => customise(detail)}>
                    <Icon name="edit" size={13} /> Customise
                  </button>
                </div>
                <button type="button" className="lch-act" style={{ width: '100%', justifyContent: 'center', padding: 'var(--ds-btn-py) 0', marginTop: 10, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                  onClick={() => navigate(`/clearos/report-issue?record=${detail.id}`)}>
                  <Icon name="alertCircle" size={13} /> Report an issue with this calculation
                </button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

function DRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0' }}>
      <span style={{ color: 'var(--ink3)' }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default LandedCostHistoryPage;
