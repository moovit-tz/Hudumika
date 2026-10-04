import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch } from '../../lib/api.js';
import { Combobox } from '../../components/ui/combobox.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { showAlert } from '../../lib/alert.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import {
  Badge, PLAN_CFG, DOM_CFG, TX_CFG, METHOD_LABELS,
  type Company, type Package, type Domain, type Transaction,
  type PlanId, type DomainStatus, type TxStatus, type PayMethod,
  COMPANIES, fmtCurrency, fmtDate,
  Spark, BarChart, KPICard, PageHdr,
  DataTable, useSortState, sortedRows, TR, TD, ActBtn, StatCard,
} from './shared.js';
export function DomainsView() {
  const [domains, setDomains] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DomainStatus|'all'>('all');
  const [adding, setAdding] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [newTenant, setNewTenant] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [domPage, setDomPage] = useState(1);
  const [domPageSize, setDomPageSize] = useState(25);

  const load = React.useCallback(async () => {
    setLoadError('');
    try {
      const [d, t] = await Promise.all([
        apiFetch('/v1/superadmin/domains'),
        apiFetch('/v1/superadmin/tenants'),
      ]);
      setDomains(d?.data ?? []);
      setTenants(Array.isArray(t) ? t : (t?.data ?? []));
    } catch (e: any) { setLoadError(e?.message ?? 'Could not load domains.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(key: string, fn: () => Promise<any>) {
    setBusy(key); setLoadError('');
    try { await fn(); await load(); }
    catch (e: any) { setLoadError(e?.message ?? 'That did not work.'); }
    finally { setBusy(''); }
  }

  const filtered = useMemo(()=>
    domains.filter(d=>{
      if (statusFilter!=='all' && d.status!==statusFilter) return false;
      if (search && !d.domain.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [domains, search, statusFilter]);

  useEffect(() => { setSelected(new Set()); setDomPage(1); }, [search, statusFilter]);

  const { sortBy: domSortBy, sortDir: domSortDir, handleSort: domHandleSort } = useSortState();
  const domAccessor = (col: string, d: any) => ({
    'Domain': d.domain, 'Company': d.tenant_name ?? '',
    'TLS certificate': d.ssl_ok ? 1 : 0, 'Status': d.status,
    'Last checked': d.last_checked_at ?? '',
  }[col]);
  const domPaginated = useMemo(() => {
    const sorted = sortedRows(filtered, domSortBy, domSortDir, domAccessor);
    return sorted.slice((domPage - 1) * domPageSize, domPage * domPageSize);
  }, [filtered, domPage, domPageSize, domSortBy, domSortDir]);

  function exportDomains() {
    const rows = selected.size > 0 ? filtered.filter(d => selected.has(d.id)) : filtered;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Domain','Company','TLS OK','Status','Last Checked'];
    const csv = [header.join(','), ...rows.map(d => [
      d.domain, d.tenant_name ?? '', d.ssl_ok ? 'yes' : 'no', d.status,
      d.last_checked_at ? fmtDate(d.last_checked_at) : 'never',
    ].map(esc).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `domains-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const stats = useMemo(()=>({
    total:    domains.length,
    verified: domains.filter(d=>d.status==='active').length,
    ssl:      domains.filter(d=>d.ssl_ok).length,
    unchecked:domains.filter(d=>d.never_checked).length,
  }),[domains]);

  if (loading) return <div style={{ padding:30, color:'var(--ink3)' }}>Loading domainsâ€¦</div>;

  return (
    <div>
      <PageHdr title="Custom Domains" sub="Custom domains across all companies, and what the last DNS and TLS check actually found" />

      {loadError && (
        <div style={{ padding:'10px 13px', borderRadius: 'var(--r)', background:'var(--red-l)', color:'var(--red)', fontSize:12.5, marginBottom:14 }}>{loadError}</div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Domains"  value={stats.total}     color="var(--teal)"   />
        <StatCard label="Verified"       value={stats.verified}  color="var(--green)"  />
        {/* Counts certificates actually seen, not domains someone ticked. */}
        <StatCard label="Serving TLS"    value={stats.ssl}       color="var(--green)" />
        <StatCard label="Never checked"  value={stats.unchecked} color="var(--gold)"   />
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          search={search}
          onSearch={v => { setSearch(v); setDomPage(1); }}
          placeholder="Search domainsâ€¦"
          quickFilter={{
            value: statusFilter === 'all' ? null : statusFilter,
            onChange: v => setStatusFilter((v ?? 'all') as DomainStatus | 'all'),
            allLabel: 'All Status',
            columns: 2,
            options: (Object.keys(DOM_CFG) as DomainStatus[]).map(k => ({
              value: k,
              label: DOM_CFG[k].label,
              icon: <span style={{ width:7, height:7, borderRadius:'50%', background: DOM_CFG[k].color, display:'inline-block' }} />,
            })),
          }}
          activeFilterCount={statusFilter !== 'all' ? 1 : 0}
          actions={
            <button type="button" className="btn btn-primary btn-sm" onClick={()=>setAdding(a=>!a)}>
              {adding ? 'Cancel' : '+ Add domain'}
            </button>
          }
        />
      </div>

      {adding && (
        <div className="card" style={{ padding:16, marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:'1 1 240px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'var(--ink3)', marginBottom:4 }}>Hostname</div>
            <input className="input-field" value={newHost} onChange={e=>setNewHost(e.target.value)} placeholder="clearance.example.com" />
          </div>
          <div style={{ flex:'1 1 200px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'var(--ink3)', marginBottom:4 }}>Company</div>
            <Combobox
              options={tenants.map((t:any) => ({ value: t.id, label: t.name }))}
              value={newTenant}
              onChange={setNewTenant}
              placeholder="Choose a companyâ€¦"
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={!newHost.trim() || !newTenant || !!busy}
            onClick={()=>act('add', async () => {
              await apiFetch('/v1/superadmin/domains', { method:'POST', body: JSON.stringify({ tenant_id:newTenant, domain:newHost.trim() }) });
              setNewHost(''); setAdding(false);
            })}>
            {busy==='add' ? 'Addingâ€¦' : 'Add domain'}
          </button>
          <div style={{ flexBasis:'100%', fontSize:11.5, color:'var(--ink3)' }}>
            Added unverified. The company publishes the TXT token it is given, then Check confirms it â€” nothing is marked verified before that.
          </div>
        </div>
      )}

      {domains.length === 0 ? (
        <div className="card" style={{ padding:40, textAlign:'center' }}>
          <Icon name="globe" size={22} color="var(--ink3)" />
          <div style={{ fontSize:13.5, color:'var(--ink2)', marginTop:10 }}>No custom domains registered.</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4 }}>Companies reach the platform on its default hostname until one is added here.</div>
        </div>
      ) : (
      <>
        {selected.size > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0 14px', minHeight:'var(--ctl-h)', marginBottom:8, background:'color-mix(in srgb, var(--teal) 8%, var(--white))', border:'1px solid color-mix(in srgb, var(--teal) 25%, transparent)', borderRadius:'var(--r)', fontSize:13, boxShadow:'0 1px 2px 0 rgba(0,0,0,0.03)' }}>
            <span style={{ fontWeight:600, color:'var(--teal)' }}>{selected.size} {selected.size === 1 ? 'domain' : 'domains'} selected</span>
            <div style={{ flex:1 }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportDomains}><Icon name="download" size={12} style={{ marginRight:5 }}/>Export</button>
            <button type="button" className="btn btn-sm" style={{ color:'var(--ink3)' }} onClick={()=>setSelected(new Set())}>Clear</button>
          </div>
        )}

        <DataTable
          headers={['Domain','Company','TLS certificate','Status','Last checked','Actions']}
          selectAll={selected.size === domPaginated.length && domPaginated.length > 0}
          selectAllIndeterminate={selected.size > 0 && selected.size < domPaginated.length}
          onSelectAll={() => {
            if (selected.size === domPaginated.length) setSelected(new Set());
            else setSelected(new Set(domPaginated.map((d:any) => d.id)));
          }}
          sortBy={domSortBy} sortDir={domSortDir} onSort={domHandleSort}
        >
          {domPaginated.map((d:any)=>(
            <TR key={d.id} selected={selected.has(d.id)} onSelect={() => setSelected(prev => {
              const next = new Set(prev); if (next.has(d.id)) next.delete(d.id); else next.add(d.id); return next;
            })}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius: 'var(--r-sm)', background:'var(--bg)' }}>
                    <Icon name="globe" size={14} color="var(--teal)" />
                  </span>
                  <div>
                    <div style={{ fontFamily:'var(--font)', fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>{d.domain}</div>
                    {!d.dns_ok && (
                      <div style={{ fontFamily:'var(--font)', fontSize:10.5, color:'var(--ink3)' }}>TXT {d.verification_token}</div>
                    )}
                  </div>
                </div>
              </TD>
              <TD><span style={{ fontSize:13 }}>{d.tenant_name ?? 'company no longer on file'}</span></TD>
              <TD>
                {d.ssl_ok
                  ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--green)', background:'var(--green-l)', padding:'3px 8px', borderRadius:'var(--badge-radius)' }}>
                      <Icon name="lock" size={10} color="var(--green)" />
                      expires {d.ssl_expires_at ? fmtDate(d.ssl_expires_at) : 'unknown'}
                    </span>
                  : d.never_checked
                    ? <span style={{ fontSize:11.5, color:'var(--ink3)' }}>not checked yet</span>
                    : <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', background:'var(--red-l)', padding:'3px 8px', borderRadius:'var(--badge-radius)' }}>no certificate</span>}
              </TD>
              <TD>
                <Badge cfg={DOM_CFG[d.status as DomainStatus]} />
                {d.last_error && (
                  <div style={{ fontSize:10.5, color:'var(--ink3)', marginTop:3, maxWidth:260 }}>{d.last_error}</div>
                )}
              </TD>
              <TD nowrap>
                <span style={{ fontSize:12, color:'var(--ink3)' }}>
                  {d.last_checked_at ? fmtDate(d.last_checked_at) : 'never'}
                </span>
              </TD>
              <TD>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button type="button" className="btn" style={{ fontSize:11, padding:'var(--ds-btn-py-xs) 9px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                    disabled={busy==='chk'+d.id}
                    onClick={()=>act('chk'+d.id, ()=>apiFetch(`/v1/superadmin/domains/${d.id}/check`, { method:'POST', body:'{}' }))}>
                    {busy==='chk'+d.id ? 'Checkingâ€¦' : 'Check'}
                  </button>
                  <ActBtn icon="trash" color="var(--red)" title="Remove"
                    onClick={()=>act('del'+d.id, ()=>apiFetch(`/v1/superadmin/domains/${d.id}`, { method:'DELETE' }))} />
                </div>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>No domains match your filters.</td></tr>
          )}
        </DataTable>

        {filtered.length > 0 && (
          <PaginationBar
            page={domPage} pageSize={domPageSize} total={filtered.length}
            onPageChange={setDomPage}
            onPageSizeChange={p => { setDomPageSize(p); setDomPage(1); }}
            itemLabel="domains" bordered
          />
        )}
      </>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TRANSACTIONS VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function TransactionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TxStatus|'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(25);

  // Real platform_transactions. This screen previously rendered the hardcoded
  // TRANSACTIONS sample array â€” eleven 2025 payments for companies that do not
  // exist, $43,346 of revenue that was never collected.
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/superadmin/transactions?limit=500')
      .then((r: any) => { if (alive) { setRows(r?.data ?? []); setTotals(r?.totals ?? null); } })
      .catch((e: any) => { if (alive) setLoadError(e?.message ?? 'Could not load transactions.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(()=>
    rows.filter(t=>{
      if (statusFilter!=='all' && t.status!==statusFilter) return false;
      const q = search.trim().toLowerCase();
      if (q && !(t.companyName ?? '').toLowerCase().includes(q)
            && !(t.txRef ?? '').toLowerCase().includes(q)
            && !(t.payerName ?? '').toLowerCase().includes(q)) return false;
      return true;
    }),
  [rows, search, statusFilter]);

  useEffect(() => { setSelected(new Set()); setTxPage(1); }, [search, statusFilter]);

  const { sortBy: txSortBy, sortDir: txSortDir, handleSort: txHandleSort } = useSortState();
  const txAccessor = (col: string, t: any) => ({
    'Ref': t.txRef, 'Company': t.companyName ?? '', 'Package': t.packageCode ?? '',
    'Amount': Number(t.amount), 'Date': t.created, 'Method': t.method ?? '', 'Status': t.status,
  }[col]);
  const txPaginated = useMemo(() => {
    const sorted = sortedRows(filtered, txSortBy, txSortDir, txAccessor);
    return sorted.slice((txPage - 1) * txPageSize, txPage * txPageSize);
  }, [filtered, txPage, txPageSize, txSortBy, txSortDir]);

  function exportCsv() {
    const exportRows = selected.size > 0 ? filtered.filter(t => selected.has(t.id)) : filtered;
    const head = ['Ref','Company','Package','Amount','Currency','Date','Method','Status','Payer'];
    const body = exportRows.map(t => [t.txRef, t.companyName ?? '', t.packageCode ?? '', t.amount, t.currency,
      new Date(t.created).toISOString().slice(0,10), t.method ?? '', t.status, t.payerName ?? '']);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head, ...body].map(r => r.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `platform-transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHdr title="Purchase Transactions" sub="All billing transactions across the platform"
        action={<button className="btn btn-secondary btn-sm" style={{gap:6}} onClick={exportCsv} disabled={filtered.length===0}><Icon name="download" size={13}/>Export CSV</button>}
      />

      {loadError && <div style={{ color:'var(--red)', fontSize:13, marginBottom:14 }}>{loadError}</div>}

      {/* Counts are over the whole table, not the filtered page. */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Revenue Collected" value={fmtCurrency(totals?.completed ?? 0)} color="var(--teal)"  />
        <StatCard label="Completed"         value={totals?.completedCount ?? 0}         color="var(--green)" />
        <StatCard label="Pending"           value={totals?.pendingCount ?? 0}           color="var(--gold)"  />
        <StatCard label="Failed"            value={totals?.failedCount ?? 0}            color="var(--red)"   />
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          search={search}
          onSearch={v => { setSearch(v); setTxPage(1); }}
          placeholder="Search company or Refâ€¦"
          quickFilter={{
            value: statusFilter === 'all' ? null : statusFilter,
            onChange: v => setStatusFilter((v ?? 'all') as TxStatus | 'all'),
            allLabel: 'All Status',
            columns: 2,
            options: (Object.keys(TX_CFG) as TxStatus[]).map(k => ({
              value: k,
              label: TX_CFG[k].label,
              icon: <span style={{ width:7, height:7, borderRadius:'50%', background: TX_CFG[k].color, display:'inline-block' }} />,
            })),
          }}
          activeFilterCount={statusFilter !== 'all' ? 1 : 0}
        />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>Loading transactionsâ€¦</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding:'34px 22px', textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:650, color:'var(--ink)' }}>
            {rows.length === 0 ? 'No platform payments recorded yet.' : 'No transactions match these filters.'}
          </div>
          <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:5 }}>
            {rows.length === 0 ? 'Payments appear here as tenants subscribe.' : 'Try clearing the search or status filter.'}
          </div>
        </div>
      ) : (
      <>
        {selected.size > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0 14px', minHeight:'var(--ctl-h)', marginBottom:8, background:'color-mix(in srgb, var(--teal) 8%, var(--white))', border:'1px solid color-mix(in srgb, var(--teal) 25%, transparent)', borderRadius:'var(--r)', fontSize:13, boxShadow:'0 1px 2px 0 rgba(0,0,0,0.03)' }}>
            <span style={{ fontWeight:600, color:'var(--teal)' }}>{selected.size} {selected.size === 1 ? 'transaction' : 'transactions'} selected</span>
            <div style={{ flex:1 }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}><Icon name="download" size={12} style={{ marginRight:5 }}/>Export selected</button>
            <button type="button" className="btn btn-sm" style={{ color:'var(--ink3)' }} onClick={()=>setSelected(new Set())}>Clear</button>
          </div>
        )}

        <DataTable
          headers={['Ref','Company','Package','Amount','Date','Method','Status']}
          selectAll={selected.size === txPaginated.length && txPaginated.length > 0}
          selectAllIndeterminate={selected.size > 0 && selected.size < txPaginated.length}
          onSelectAll={() => {
            if (selected.size === txPaginated.length) setSelected(new Set());
            else setSelected(new Set(txPaginated.map((t:any) => t.id)));
          }}
          sortBy={txSortBy} sortDir={txSortDir} onSort={txHandleSort}
        >
          {txPaginated.map(tx=>(
            <TR key={tx.id} selected={selected.has(tx.id)} onSelect={() => setSelected(prev => {
              const next = new Set(prev); if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id); return next;
            })}>
              <TD><span style={{ fontFamily:'var(--font)', fontSize:12, color:'var(--ink3)' }}>{tx.txRef}</span></TD>
              <TD>
                <span style={{ fontWeight:600, fontSize:13 }}>{tx.companyName || 'Deleted company'}</span>
                {tx.payerName && <span style={{ display:'block', fontSize:11, color:'var(--ink3)' }}>{tx.payerName}</span>}
              </TD>
              <TD><span style={{ fontSize:12, color:'var(--ink2)' }}>{tx.packageCode ?? 'â€”'}{tx.billingCycle ? ` Â· ${tx.billingCycle}` : ''}</span></TD>
              <TD right><span style={{ fontWeight:700, fontFamily:'var(--font)' }}>{tx.currency} {Number(tx.amount).toLocaleString()}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(tx.created)}</span></TD>
              <TD><span style={{ fontSize:12, color:'var(--ink2)' }}>{METHOD_LABELS[tx.method as PayMethod] ?? tx.method ?? 'â€”'}</span></TD>
              <TD><Badge cfg={TX_CFG[tx.status as TxStatus] ?? TX_CFG.completed} /></TD>
            </TR>
          ))}
        </DataTable>

        <PaginationBar
          page={txPage} pageSize={txPageSize} total={filtered.length}
          onPageChange={setTxPage}
          onPageSizeChange={p => { setTxPageSize(p); setTxPage(1); }}
          itemLabel="transactions" bordered
        />
      </>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FINANCE VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/**
 * Two different things live on this page and they used to be conflated:
 *
 *  - what the platform has actually been paid (platform_transactions), and
 *  - what it would bill in a month if every active tenant paid list price
 *    (a run-rate estimate).
 *
 * Neither used to be shown. MRR, ARR, "Total Revenue Collected: $21,046",
 * "Active Paid Subscribers: 5", the 12-month MRR trend and the whole per-plan
 * breakdown were all hardcoded literals with invented +8.2%/-4.1% deltas.
 */
export function FinanceView() {
  const [tx, setTx] = useState<{ data: any[]; totals: any; monthly: any[] } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch('/v1/superadmin/transactions?limit=1000'),
      apiFetch('/v1/superadmin/dashboard-stats'),
    ])
      .then(([t, s]: any[]) => { if (alive) { setTx(t); setStats(s); } })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Could not load finance data.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Money received, by the package each payment actually bought.
  const byPackage = useMemo(() => {
    const m = new Map<string, { code: string; total: number; count: number }>();
    for (const t of tx?.data ?? []) {
      if (t.status !== 'completed') continue;
      const code = t.packageCode ?? 'unknown';
      const cur = m.get(code) ?? { code, total: 0, count: 0 };
      cur.total += Number(t.amount); cur.count += 1;
      m.set(code, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [tx]);

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading finance dataâ€¦</div>;
  if (error)   return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--red)' }}>{error}</div>;

  const collected = tx?.totals?.completed ?? 0;
  const paidCount = tx?.totals?.completedCount ?? 0;
  const runRate   = stats?.kpis?.totalEarnings ?? 0;
  // m.month is "YYYY-MM"; label it "Jul" rather than "07".
  const trend = (tx?.monthly ?? []).map((m: any) => ({
    label: new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' }),
    value: m.total,
  }));
  const noHistory = (stats?.monthsWithData ?? 0) < 2 ? 'not enough history yet' : undefined;
  const collectedTotal = byPackage.reduce((s, p) => s + p.total, 0);

  return (
    <div>
      <PageHdr title="Platform Finance" sub="Platform billing â€” what has been received, and what active plans would bill" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Revenue Collected"      value={fmtCurrency(collected)} icon="dollarSign" color="var(--teal)"
                 spark={trend.map((d: any) => d.value)} emptyHint={noHistory} />
        <KPICard title="Payments Received"      value={String(paidCount)}      icon="receipt"    color="var(--teal)"
                 hint={`${tx?.totals?.allCount ?? 0} transactions in total`} />
        {/* Named an estimate on the card, because it is one: list price for
            every active tenant, whether or not they have ever paid. */}
        <KPICard title="Run Rate (list price)"  value={fmtCurrency(runRate)}   icon="trendingUp" color="var(--teal)"
                 hint="estimate â€” active tenants at list price" />
        <KPICard title="Paying Companies"       value={String(new Set((tx?.data ?? []).filter((t: any) => t.status === 'completed').map((t: any) => t.companyId)).size)}
                 icon="building" color="var(--teal)" hint={`of ${stats?.kpis?.activeCompanies ?? 0} active`} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
        <div className="card" style={{ padding:'22px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Revenue Received</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:20 }}>
            Completed payments by month{trend.length ? '' : ' â€” nothing recorded yet'}
          </div>
          {trend.length > 0
            ? <BarChart data={trend} color="var(--teal)" height={100} />
            : <div style={{ fontSize:12.5, color:'var(--ink3)', padding:'22px 0' }}>No payments have been recorded.</div>}
        </div>

        <div className="card" style={{ padding:'22px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Revenue by Package</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:16 }}>What each package has actually brought in</div>
          {byPackage.length === 0 ? (
            <div style={{ fontSize:12.5, color:'var(--ink3)' }}>No completed payments yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {byPackage.map(p => {
                const pct = collectedTotal > 0 ? Math.round((p.total / collectedTotal) * 100) : 0;
                const cfg = PLAN_CFG[p.code as PlanId];
                return (
                  <div key={p.code}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {cfg ? <Badge cfg={cfg} /> : <span style={{ fontSize:12, fontWeight:700, color:'var(--ink2)', textTransform:'capitalize' }}>{p.code}</span>}
                        <span style={{ fontSize:12, color:'var(--ink3)' }}>{p.count} payment{p.count===1?'':'s'}</span>
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{fmtCurrency(p.total)}</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:cfg?.color ?? 'var(--teal)', borderRadius:99 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12, marginTop:4, borderTop:'1px solid var(--border)', fontWeight:800 }}>
                <span style={{ fontSize:13, color:'var(--ink)' }}>Total received</span>
                <span style={{ fontSize:14, color:'var(--teal)', fontFamily:'var(--font)' }}>{fmtCurrency(collectedTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ACTIVITY VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/**
 * The platform audit trail, from platform_activity_log.
 *
 * Rows are written by the superadmin routes as they act, so this is a record
 * of what was done rather than a description of what such a screen might show.
 * Actor and target names are the snapshots taken at the time â€” a company that
 * has since been deleted is still named, which is exactly when an audit trail
 * earns its keep.
 */
type AuditTab = 'all' | 'role' | 'permissions' | 'tokens' | 'deletions' | 'config';

const AUDIT_TABS: { value: AuditTab; label: string }[] = [
  { value: 'all',         label: 'All' },
  { value: 'role',        label: 'Role Changes' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'tokens',      label: 'API Tokens' },
  { value: 'deletions',   label: 'Deletions' },
  { value: 'config',      label: 'Config' },
];

const MODULE_LABELS: Record<string, string> = {
  role:        'Roles & Users',
  permissions: 'Access Control',
  tokens:      'API Keys',
  deletions:   'Deletions',
  config:      'Config & Settings',
};

function auditCategory(a: any): Exclude<AuditTab, 'all'> {
  const act = (a.action ?? '').toLowerCase();
  if (/\btoken\b|api.key|revoke/.test(act))             return 'tokens';
  if (/\bdelet|remov|suspend|archive/.test(act))         return 'deletions';
  if (/\brole\b|plan\b|subscript|promote|demot/.test(act)) return 'role';
  if (/\bpermission|grant|access|privilege/.test(act))   return 'permissions';
  if (a.category === 'user')                             return 'role';
  if (a.category === 'billing')                          return 'config';
  return 'config';
}

function auditRisk(a: any): { label: string; color: string; bg: string } | null {
  const cat = auditCategory(a);
  if (cat === 'role')        return { label: 'High Risk',  color: 'var(--red)',  bg: 'var(--red-l)'  };
  if (cat === 'permissions') return { label: 'High Risk',  color: 'var(--red)',  bg: 'var(--red-l)'  };
  if (cat === 'tokens')      return { label: 'API Token',  color: 'var(--blue)', bg: 'var(--blue-l)' };
  if (cat === 'deletions')   return { label: 'Deletion',   color: 'var(--red)',  bg: 'var(--red-l)'  };
  if (cat === 'config')      return { label: 'Config',     color: 'var(--gold)', bg: 'var(--gold-l)' };
  return null;
}

export function ActivityView() {
  const [tab,       setTab]       = useState<AuditTab>('all');
  const [search,    setSearch]    = useState('');
  const [rows,      setRows]      = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [visCount,  setVisCount]  = useState(15);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/superadmin/activity?limit=500')
      .then((a: any) => { if (alive) setRows(a?.data ?? []); })
      .catch((e: any) => { if (alive) setLoadError(e?.message ?? 'Could not load the audit log.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() =>
    rows.filter(a => {
      if (tab !== 'all' && auditCategory(a) !== tab) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(
          (a.actor_name  ?? '').toLowerCase().includes(q) ||
          (a.action      ?? '').toLowerCase().includes(q) ||
          (a.target_name ?? '').toLowerCase().includes(q) ||
          (a.tenant_name ?? '').toLowerCase().includes(q)
        )) return false;
      }
      return true;
    }),
  [rows, tab, search]);

  const visible = useMemo(() => filtered.slice(0, visCount), [filtered, visCount]);

  // â”€â”€ stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const weekAgo  = Date.now() - 7 * 24 * 3600_000;

    const todayRows = rows.filter(r => new Date(r.created_at).toDateString() === todayStr);
    const highRisk  = rows.filter(r => { const c = auditCategory(r); return c === 'role' || c === 'permissions'; });
    const weekRows  = rows.filter(r => new Date(r.created_at).getTime() > weekAgo);
    const admins    = new Set(weekRows.map(r => r.actor_user_id).filter(Boolean));

    const byCat: Record<string, number> = {};
    for (const r of rows) {
      const c = auditCategory(r);
      byCat[c] = (byCat[c] ?? 0) + 1;
    }

    const byActor = new Map<string, { name: string; userId: string|null; count: number }>();
    for (const r of weekRows) {
      const prev = byActor.get(r.actor_name) ?? { name: r.actor_name, userId: r.actor_user_id ?? null, count: 0 };
      byActor.set(r.actor_name, { ...prev, count: prev.count + 1 });
    }
    const topModifiers = [...byActor.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return { todayCount: todayRows.length, highRiskCount: highRisk.length, activeAdmins: admins.size, byCat, topModifiers };
  }, [rows]);

  function exportCsv() {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['When','Actor','Action','Category','Target','Company'].join(','),
      ...filtered.map(a => [
        new Date(a.created_at).toISOString().slice(0,16).replace('T',' '),
        a.actor_name, a.action, a.category, a.target_name ?? '', a.tenant_name ?? '',
      ].map(esc).join(',')),
    ].join('\r\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href     = url;
    link.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      + ', ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const catTotal = Object.values(stats.byCat).reduce((s, v) => s + v, 0) || 1;

  // â”€â”€ card helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function MetricCard({ label, value, icon, color, bg }: { label: string; value: number|string; icon: string; color: string; bg: string }) {
    return (
      <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'18px 20px', boxShadow:'var(--elev-sm)', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:42, height:42, borderRadius:'var(--r)', background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon name={icon as any} size={18} color={color} />
        </div>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--ink)', lineHeight:1 }}>{value}</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4 }}>{label}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHdr
        title="Audit Log"
        sub="Security-sensitive changes with before/after comparison"
        action={
          <button type="button" className="btn btn-secondary btn-sm" style={{ gap:6 }} onClick={exportCsv} disabled={filtered.length === 0}>
            <Icon name="download" size={12} style={{ marginRight:4 }} />Export CSV
          </button>
        }
      />

      <SearchToolbar
        search={search}
        onSearch={v => { setSearch(v); setVisCount(15); }}
        placeholder="Search by actor, action, companyâ€¦"
        style={{ marginBottom:20 }}
      />

      {loadError && (
        <div style={{ padding:'10px 13px', borderRadius:'var(--r)', background:'var(--red-l)', color:'var(--red)', fontSize:12.5, marginBottom:14 }}>{loadError}</div>
      )}

      {/* â”€â”€ Metric cards â”€â”€ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <MetricCard label="Changes Today"     value={stats.todayCount}     icon="activity"    color="var(--teal)" bg="var(--teal-l)" />
        <MetricCard label="High-Risk Changes" value={stats.highRiskCount}  icon="alertTriangle" color="var(--red)"  bg="var(--red-l)"  />
        <MetricCard label="Restored Values"   value={0}                    icon="refresh"     color="var(--green)" bg="var(--green-l)" />
        <MetricCard label="Active Admins"     value={stats.activeAdmins}   icon="users"       color="var(--blue)" bg="var(--blue-l)" />
      </div>

      {/* â”€â”€ Two-column layout â”€â”€ */}
      <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>

        {/* â”€â”€ Feed â”€â”€ */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Tab pills */}
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
            {AUDIT_TABS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setTab(t.value); setVisCount(15); }}
                style={{
                  padding:'5px 14px', borderRadius:20, fontSize:12.5, fontWeight:600, cursor:'pointer',
                  border:'1px solid var(--border)',
                  background: tab === t.value ? 'hsl(var(--primary))' : 'var(--white)',
                  color:      tab === t.value ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                  transition:'background 0.15s, color 0.15s',
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* Activity list */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {loading && (
              <div style={{ padding:'48px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>Loading audit logâ€¦</div>
            )}
            {!loading && rows.length === 0 && (
              <div style={{ padding:'48px 22px', textAlign:'center' }}>
                <div style={{ fontSize:13.5, color:'var(--ink2)' }}>Nothing has been recorded yet.</div>
                <div style={{ fontSize:12, color:'var(--ink3)', marginTop:5 }}>
                  Superadmin actions â€” creating a company, changing a plan, revoking a token â€” appear here as they happen.
                </div>
              </div>
            )}
            {!loading && rows.length > 0 && filtered.length === 0 && (
              <div style={{ padding:'48px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>
                No audit entries match your filters.
              </div>
            )}

            {visible.map(a => {
              const risk = auditRisk(a);
              const isDeletion = auditCategory(a) === 'deletions';
              const meta   = typeof a.metadata === 'string' ? (() => { try { return JSON.parse(a.metadata); } catch { return {}; } })() : (a.metadata ?? {});
              const before = meta?.before;
              const after  = meta?.after;
              const hasDiff = before !== undefined || after !== undefined;

              return (
                <div key={a.id} style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'16px 18px', boxShadow:'var(--elev-sm)' }}>
                  {/* Header row */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom: hasDiff ? 14 : 10 }}>
                    <PersonAvatar userId={a.actor_user_id ?? undefined} name={a.actor_name} size={34} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, lineHeight:1.4 }}>
                        <span style={{ fontWeight:700, color:'var(--ink)' }}>{a.actor_name}</span>
                        {' '}
                        <span style={{ color:'var(--ink2)' }}>{a.action}</span>
                        {a.target_name && <span style={{ color:'var(--ink3)' }}> Â· {a.target_name}</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--ink3)', marginTop:3 }}>
                        {a.tenant_name ? `${a.tenant_name} Â· ` : ''}{fmtDate(a.created_at)}
                        {' '}
                        <span style={{ opacity:0.7 }}>({relTime(a.created_at)})</span>
                      </div>
                    </div>
                    {risk && (
                      <span style={{ flexShrink:0, display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:risk.bg, color:risk.color }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:risk.color, display:'inline-block' }} />
                        {risk.label}
                      </span>
                    )}
                  </div>

                  {/* Before / After diff */}
                  {hasDiff && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      <div style={{ background:'var(--red-l)', borderRadius:'var(--r-sm)', padding:'8px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Before</div>
                        <div style={{ fontSize:12.5, color:'var(--ink2)', wordBreak:'break-all' }}>
                          {before !== undefined ? (typeof before === 'object' ? JSON.stringify(before) : String(before)) : 'â€”'}
                        </div>
                      </div>
                      <div style={{ background:'var(--green-l)', borderRadius:'var(--r-sm)', padding:'8px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>After</div>
                        <div style={{ fontSize:12.5, color:'var(--ink2)', wordBreak:'break-all' }}>
                          {after !== undefined ? (typeof after === 'object' ? JSON.stringify(after) : String(after)) : 'â€”'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Restore button */}
                  <button
                    type="button"
                    onClick={() => showAlert('Restore functionality is coming soon.')}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'var(--ink2)', background:'none', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'5px 12px', cursor:'pointer' }}
                  >
                    <Icon name="refresh" size={12} />
                    {isDeletion && a.target_name ? `Restore ${a.target_name.split(' ')[0]}` : 'Restore Previous Value'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Load older */}
          {!loading && filtered.length > visible.length && (
            <button
              type="button"
              onClick={() => setVisCount(c => c + 15)}
              style={{ width:'100%', textAlign:'center', padding:'13px 0', marginTop:14, background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:13, fontWeight:600, color:'var(--ink2)', cursor:'pointer' }}
            >
              Load Older Changes ({filtered.length - visible.length} remaining)
            </button>
          )}
        </div>

        {/* â”€â”€ Sidebar â”€â”€ */}
        <div style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:14 }}>

          {/* Changes by Module */}
          <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'16px 18px', boxShadow:'var(--elev-sm)' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--ink)', marginBottom:14 }}>Changes by Module</div>
            {Object.entries(stats.byCat).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <div key={cat} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--ink2)' }}>{MODULE_LABELS[cat] ?? cat}</span>
                  <span style={{ fontSize:11.5, fontWeight:700, color:'var(--ink3)' }}>{Math.round((count / catTotal) * 100)}%</span>
                </div>
                <div style={{ height:5, borderRadius:3, background:'var(--bg)' }}>
                  <div style={{ height:'100%', borderRadius:3, width:`${(count / catTotal) * 100}%`, background:'hsl(var(--primary))' }} />
                </div>
              </div>
            ))}
            {Object.keys(stats.byCat).length === 0 && !loading && (
              <div style={{ fontSize:12, color:'var(--ink3)', textAlign:'center', padding:'10px 0' }}>No data yet.</div>
            )}
          </div>

          {/* Top Modifiers */}
          <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'16px 18px', boxShadow:'var(--elev-sm)' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--ink)', marginBottom:14 }}>Top Modifiers</div>
            {stats.topModifiers.map((m, i) => (
              <div key={m.name} style={{ display:'flex', alignItems:'center', gap:10, marginBottom: i < stats.topModifiers.length - 1 ? 12 : 0 }}>
                <PersonAvatar userId={m.userId ?? undefined} name={m.name} size={32} />
                <div>
                  <div style={{ fontWeight:700, fontSize:12.5, color:'var(--ink)' }}>{m.name}</div>
                  <div style={{ fontSize:11, color:'var(--ink3)', marginTop:1 }}>{m.count} change{m.count === 1 ? '' : 's'} this week</div>
                </div>
              </div>
            ))}
            {stats.topModifiers.length === 0 && !loading && (
              <div style={{ fontSize:12, color:'var(--ink3)', textAlign:'center', padding:'10px 0' }}>No activity this week.</div>
            )}
          </div>

          {/* AI Risk Summary â€” only shown when high-risk events exist */}
          {stats.highRiskCount > 0 && (
            <div style={{ background:'var(--teal-l)', border:'1px solid var(--teal-m)', borderRadius:'var(--r)', padding:'16px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
                <Icon name="sparkle" size={14} color="var(--teal)" />
                <span style={{ fontWeight:700, fontSize:13, color:'var(--ink)' }}>AI Risk Summary</span>
              </div>
              <p style={{ fontSize:12.5, color:'var(--ink2)', margin:'0 0 14px', lineHeight:1.55 }}>
                <strong>{stats.highRiskCount}</strong> permission escalation{stats.highRiskCount === 1 ? '' : 's'} detected this week.
                These changes granted broader access than the requesting role typically warrants.
                Consider a quarterly access review.
              </p>
              <button
                type="button"
                onClick={() => showAlert('Access policy review coming soon.')}
                style={{ padding:'6px 14px', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', background:'var(--white)', fontSize:12.5, fontWeight:600, color:'var(--ink)', cursor:'pointer' }}
              >
                Review Access Policy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

