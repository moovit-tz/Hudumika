import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';

/**
 * Every landed-cost calculation run on the platform, across all tenants.
 *
 * A record of what is being searched and by whom — how the calculator is
 * actually used, which corridors and commodities come up, which tenants lean
 * on it. It stops at the summary: the stored payload, which holds a tenant's
 * full costings line by line, is never returned to this screen. Being able to
 * see that a tenant priced a consignment is not the same as being handed what
 * they priced it at, line by line, from a platform console.
 */

const MODE_LABEL: Record<string, string> = {
  sea_fcl: 'Sea · FCL', sea_lcl: 'Sea · LCL', air: 'Airfreight', road: 'Road',
};

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const SuperAdminCalculations: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ sort, dir, limit: String(LIMIT), offset: String(offset) });
      if (q.trim()) p.set('q', q.trim());
      if (kind !== 'all') p.set('kind', kind);
      const res: any = await apiFetch(`/v1/superadmin/calculations?${p}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load platform calculations.');
      setRows([]);
    }
    setLoading(false);
  }, [q, kind, sort, dir, offset]);

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  function th(label: string, key?: string, align?: 'right') {
    return (
      <th
        onClick={key ? () => { setOffset(0); if (sort === key) setDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSort(key); setDir('desc'); } } : undefined}
        style={{ textAlign: align ?? 'left', cursor: key ? 'pointer' : 'default' }}>
        {label}
        {key && sort === key && <Icon name={dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} color="var(--teal)" style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
      </th>
    );
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="sac-page">
      <style>{`
        .sac-page { padding: 24px 32px; }
        .sac-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border);
                    border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,.04); overflow: hidden; --ctl-h: 44px; margin-top: 12px; }
        .sac-card .input-field, .sac-card [data-slot="select-trigger"] {
          height: var(--ctl-h); border-radius: var(--r-sm); padding-top: 0; padding-bottom: 0; }
        .sac-tools { display: grid; grid-template-columns: minmax(0,1fr) 190px; gap: 12px; padding: 18px; border-bottom: 1px solid var(--border); }
        .sac-scroll { max-height: 66vh; overflow: auto; overscroll-behavior: contain;
                      scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .sac-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .sac-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .sac-scroll table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 940px; }
        .sac-scroll th { position: sticky; top: 0; z-index: 2; background: var(--card-bg, var(--white));
                         padding: 10px 12px; font-size: 10.5px; font-weight: 700; color: var(--ink3);
                         text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid var(--border);
                         white-space: nowrap; user-select: none; }
        .sac-scroll td { padding: 11px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .sac-scroll tbody tr:hover { background: var(--teal-l); }
        .sac-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
                    padding: 14px 18px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--ink3); }
        .sac-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700;
                   padding: 6px 12px; border-radius: var(--r-sm); cursor: pointer;
                   border: 1px solid var(--border); background: var(--card-bg, var(--white)); color: var(--ink2); }
        .sac-btn[disabled] { opacity: .45; cursor: not-allowed; }
        @media (max-width: 900px) { .sac-page { padding: 14px; } .sac-tools { grid-template-columns: 1fr; } }
      `}</style>

      <PageHeader
        crumbs={['HuduBI', 'Calculations']}
        titlePlain="Landed Cost"
        titleEm="Activity"
        subtitle="Every calculation run across all tenants — what is being priced, from where, and by whom. Summary figures only."
      />

      {error && (
        <div style={{ margin: '12px 0', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12.5, display: 'flex', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="var(--red)" /> {error}
        </div>
      )}

      <div className="sac-card">
        <div className="sac-tools">
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="input-field" placeholder="Search description, HS code, customer or tenant…" value={q}
              onChange={e => { setQ(e.target.value); setOffset(0); }}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, fontSize: 13 }} />
          </div>
          <Select value={kind} onValueChange={v => { setKind(v); setOffset(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All calculations</SelectItem>
              <SelectItem value="single">Single item</SelectItem>
              <SelectItem value="multi">Multi-item</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sac-scroll">
          <table>
            <thead>
              <tr>
                {th('When', 'created_at')}
                {th('Tenant', 'tenant')}
                {th('Ran by')}
                {th('What was priced', 'description')}
                {th('Corridor')}
                {th('Mode')}
                {th('Landed total (TZS)', 'total', 'right')}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtWhen(r.created_at)}</td>
                  <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.tenant_name ?? '—'}</td>
                  <td style={{ color: 'var(--ink2)' }}>
                    {r.user_name ?? '—'}
                    {r.user_email && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.user_email}</div>}
                  </td>
                  <td>
                    <div style={{ color: 'var(--ink)' }}>{r.description ?? '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {r.hs_code === 'MULTI'
                        ? `${r.item_count ?? num(r.qty)} line items`
                        : <span style={{ color: 'var(--teal)', fontFamily: 'var(--mono, monospace)' }}>{r.hs_code}</span>}
                      {r.customer_name ? ` · for ${r.customer_name}` : ''}
                      {r.version > 1 ? ` · v${r.version}` : ''}
                    </div>
                  </td>
                  <td style={{ color: 'var(--ink2)' }}>
                    {r.loading_point || r.origin_country
                      ? `${r.loading_point ?? r.origin_country}${r.destination ? ` → ${r.destination}` : ''}`
                      : '—'}
                  </td>
                  <td style={{ color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{MODE_LABEL[r.shipment_mode ?? ''] ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}>
                    {num(r.total_tzs).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--ink3)' }}>No calculation matches that search.</td></tr>
              )}
              {loading && <tr><td colSpan={7} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="sac-foot">
          <span>{total === 0 ? 'Nothing to show' : `${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total.toLocaleString()}`}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="sac-btn" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>
              <Icon name="arrowLeft" size={12} /> Previous
            </button>
            <span style={{ minWidth: 74, textAlign: 'center' }}>Page {Math.floor(offset / LIMIT) + 1} of {pages}</span>
            <button type="button" className="sac-btn" disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>
              Next <Icon name="arrowRight" size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminCalculations;
