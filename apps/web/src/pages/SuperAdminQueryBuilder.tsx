import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Button } from '../components/ui/button.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Badge } from '../components/ui/badge.js';
import { DataTable, ExportButton, exportCsv, type ColumnDef } from '../components/AnalyticsKit.js';
import './SuperAdminQueryBuilder.css';

interface AllowedColumn { name: string; label: string; type: 'text' | 'number' | 'date' | 'boolean'; }
interface AllowedTable { table: string; label: string; category: string; columns: AllowedColumn[]; }
interface QueryFilter { column: string; operator: string; value: string; }
interface RunResult { rows: any[]; generated_sql: string; }
interface RunHistoryRow {
  id: string; mode: string; table_name: string | null; status: string;
  row_count: number | null; duration_ms: number | null; started_at: string;
  run_by_name: string | null; error: string | null;
}

const OPERATORS = [
  { value: '=', label: '=' }, { value: '!=', label: '≠' }, { value: '>', label: '>' }, { value: '<', label: '<' },
  { value: 'contains', label: 'contains' }, { value: 'is_null', label: 'is empty' }, { value: 'is_not_null', label: 'is not empty' },
];

function rowsToColumns(rows: any[]): ColumnDef<any>[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map(key => ({
    key, label: key, sortValue: (r: any) => r[key] ?? '', render: (r: any) => String(r[key] ?? ''),
  }));
}

export function SuperAdminQueryBuilder() {
  const [schema, setSchema] = useState<AllowedTable[]>([]);
  const [tenants, setTenants] = useState<ComboboxOption[]>([]);
  const [activeMode, setActiveMode] = useState<'visual' | 'raw' | 'history'>('visual');

  // ── Visual builder state ──
  const [tableName, setTableName] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [aggregateFn, setAggregateFn] = useState<'count' | 'sum'>('count');
  const [aggregateColumn, setAggregateColumn] = useState('');
  const [limit, setLimit] = useState('500');
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualError, setVisualError] = useState<string | null>(null);
  const [visualResult, setVisualResult] = useState<RunResult | null>(null);

  // ── Raw SQL state ──
  const [rawSqlEnabled, setRawSqlEnabled] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [rawSqlText, setRawSqlText] = useState('SELECT * FROM shipment_cases LIMIT 100');
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState<RunResult | null>(null);

  const [runs, setRuns] = useState<RunHistoryRow[]>([]);

  useEffect(() => {
    apiFetch('/v1/superadmin/query-builder/schema').then(setSchema).catch(() => {});
    apiFetch('/v1/superadmin/query-builder/settings').then((r: any) => setRawSqlEnabled(!!r.raw_sql_enabled)).catch(() => {});
    apiFetch('/v1/superadmin/tenants').then((res: any) => {
      const list = Array.isArray(res) ? res : res.tenants || [];
      setTenants(list.map((t: any) => ({ value: t.id, label: t.name })));
    }).catch(() => {});
  }, []);

  const activeTable = schema.find(t => t.table === tableName);
  const tableOptions: ComboboxOption[] = schema.map(t => ({ value: t.table, label: `${t.category} — ${t.label}` }));

  function selectTable(name: string) {
    setTableName(name);
    const table = schema.find(t => t.table === name);
    setSelectedColumns(table ? table.columns.map(c => c.name) : []);
    setFilters([]);
    setGroupBy('');
    setAggregateColumn('');
    setVisualResult(null);
    setVisualError(null);
  }

  function toggleColumn(col: string) {
    setSelectedColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  }

  function addFilter() {
    if (!activeTable) return;
    setFilters(prev => [...prev, { column: activeTable.columns[0].name, operator: '=', value: '' }]);
  }
  function updateFilter(i: number, patch: Partial<QueryFilter>) {
    setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function removeFilter(i: number) {
    setFilters(prev => prev.filter((_, idx) => idx !== i));
  }

  async function runVisual() {
    if (!tableName) return;
    setVisualLoading(true);
    setVisualError(null);
    try {
      const res = await apiFetch('/v1/superadmin/query-builder/run', {
        method: 'POST',
        body: JSON.stringify({
          table: tableName,
          columns: groupBy ? [] : selectedColumns,
          filters: filters.filter(f => f.operator === 'is_null' || f.operator === 'is_not_null' || f.value.trim() !== ''),
          tenant_id: tenantId || undefined,
          group_by: groupBy || undefined,
          aggregate: groupBy ? { fn: aggregateFn, column: aggregateFn === 'sum' ? aggregateColumn : undefined } : undefined,
          limit: Math.min(parseInt(limit, 10) || 500, 2000),
        }),
      });
      setVisualResult(res);
    } catch (err: any) {
      setVisualError(err?.message || 'Query failed');
      setVisualResult(null);
    } finally {
      setVisualLoading(false);
    }
  }

  async function requestOtp() {
    setOtpSending(true);
    setOtpError(null);
    try {
      await apiFetch('/v1/superadmin/query-builder/raw-sql/request-otp', { method: 'POST' });
      setOtpRequested(true);
    } catch (err: any) {
      setOtpError(err?.message || 'Failed to send code');
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyOtp() {
    setOtpError(null);
    try {
      const res = await apiFetch('/v1/superadmin/query-builder/raw-sql/verify-otp', {
        method: 'POST', body: JSON.stringify({ code: otpCode }),
      });
      setRawSqlEnabled(!!res.raw_sql_enabled);
      setOtpRequested(false);
      setOtpCode('');
    } catch (err: any) {
      setOtpError(err?.message || 'Incorrect code');
    }
  }

  async function disableRawSql() {
    await apiFetch('/v1/superadmin/query-builder/raw-sql/disable', { method: 'POST' }).catch(() => {});
    setRawSqlEnabled(false);
    setRawResult(null);
  }

  async function runRaw() {
    setRawLoading(true);
    setRawError(null);
    try {
      const res = await apiFetch('/v1/superadmin/query-builder/raw-run', {
        method: 'POST', body: JSON.stringify({ sql: rawSqlText }),
      });
      setRawResult(res);
    } catch (err: any) {
      setRawError(err?.message || 'Query failed');
      setRawResult(null);
    } finally {
      setRawLoading(false);
    }
  }

  async function loadHistory() {
    setActiveMode('history');
    try {
      setRuns(await apiFetch('/v1/superadmin/query-builder/runs'));
    } catch { setRuns([]); }
  }

  const visualColumns = useMemo(() => rowsToColumns(visualResult?.rows || []), [visualResult]);
  const rawColumns = useMemo(() => rowsToColumns(rawResult?.rows || []), [rawResult]);

  const runColumns: ColumnDef<RunHistoryRow>[] = [
    { key: 'mode', label: 'Mode', sortValue: r => r.mode, render: r => <Badge variant={r.mode === 'raw' ? 'warning' : 'brand'}>{r.mode}</Badge> },
    { key: 'table', label: 'Table', sortValue: r => r.table_name || '', render: r => r.table_name || <span style={{ color: 'var(--ink3)' }}>—</span> },
    { key: 'status', label: 'Status', sortValue: r => r.status, render: r => <Badge variant={r.status === 'succeeded' ? 'success' : 'error'}>{r.status}</Badge> },
    { key: 'rows', label: 'Rows', align: 'right', sortValue: r => r.row_count || 0, render: r => r.row_count ?? '—' },
    { key: 'duration', label: 'Duration', align: 'right', sortValue: r => r.duration_ms || 0, render: r => r.duration_ms != null ? `${r.duration_ms}ms` : '—' },
    { key: 'runBy', label: 'Run by', sortValue: r => r.run_by_name || '', render: r => r.run_by_name || '—' },
    { key: 'started', label: 'Started', sortValue: r => r.started_at, render: r => new Date(r.started_at).toLocaleString() },
  ];

  return (
    <div className="qb-root">
      <div className="qb-header">
        <h1 className="qb-title">Query Builder</h1>
        <p className="qb-sub">Extract data from any allowed table, across all tenants or one at a time — visually, or with raw SQL once unlocked.</p>
      </div>

      <div className="qb-layout">
        <nav className="qb-rail">
          <button type="button" className={`qb-rail-item${activeMode === 'visual' ? ' qb-rail-item--active' : ''}`} onClick={() => setActiveMode('visual')}>
            <Icon name="sliders" size={14} /> Visual Builder
          </button>
          <button type="button" className={`qb-rail-item${activeMode === 'raw' ? ' qb-rail-item--active' : ''}`} onClick={() => setActiveMode('raw')}>
            <Icon name="terminal" size={14} /> Raw SQL {!rawSqlEnabled && <Icon name="lock" size={11} />}
          </button>
          <button type="button" className={`qb-rail-item${activeMode === 'history' ? ' qb-rail-item--active' : ''}`} onClick={loadHistory}>
            <Icon name="clock" size={14} /> Query History
          </button>
        </nav>

        <div className="qb-panel">
          {activeMode === 'visual' && (
            <div>
              <div className="qb-filters-row">
                <Combobox options={tableOptions} value={tableName} onChange={selectTable} placeholder="Pick a table…" className="qb-table-combobox" />
                <Combobox
                  options={[{ value: '', label: 'All tenants (combined)' }, ...tenants]}
                  value={tenantId} onChange={setTenantId} placeholder="All tenants (combined)" className="qb-tenant-combobox"
                />
              </div>

              {activeTable && (
                <>
                  <div className="qb-section-label">Columns</div>
                  <div className="qb-columns-grid">
                    {activeTable.columns.map(c => (
                      <label key={c.name} className="qb-column-checkbox">
                        <Checkbox checked={selectedColumns.includes(c.name)} onCheckedChange={() => toggleColumn(c.name)} disabled={!!groupBy} />
                        {c.label}
                      </label>
                    ))}
                  </div>

                  <div className="qb-section-label">Filters</div>
                  {filters.map((f, i) => (
                    <div key={i} className="qb-filter-row">
                      <Select value={f.column} onValueChange={v => updateFilter(i, { column: v })}>
                        <SelectTrigger className="qb-filter-select"><SelectValue /></SelectTrigger>
                        <SelectContent>{activeTable.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={f.operator} onValueChange={v => updateFilter(i, { operator: v })}>
                        <SelectTrigger className="qb-filter-op"><SelectValue /></SelectTrigger>
                        <SelectContent>{OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {f.operator !== 'is_null' && f.operator !== 'is_not_null' && (
                        <Input value={f.value} onChange={e => updateFilter(i, { value: e.target.value })} placeholder="Value" className="qb-filter-value" />
                      )}
                      <button type="button" className="qb-filter-remove" onClick={() => removeFilter(i)}><Icon name="x" size={13} /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addFilter}>+ Add filter</Button>

                  <div className="qb-section-label">Group &amp; Aggregate (optional)</div>
                  <div className="qb-filters-row">
                    <Select value={groupBy || '__none__'} onValueChange={v => setGroupBy(v === '__none__' ? '' : v)}>
                      <SelectTrigger className="qb-filter-select"><SelectValue placeholder="No grouping" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No grouping</SelectItem>
                        {activeTable.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {groupBy && (
                      <>
                        <Select value={aggregateFn} onValueChange={v => setAggregateFn(v as any)}>
                          <SelectTrigger className="qb-filter-op"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="count">Count</SelectItem><SelectItem value="sum">Sum</SelectItem></SelectContent>
                        </Select>
                        {aggregateFn === 'sum' && (
                          <Select value={aggregateColumn} onValueChange={setAggregateColumn}>
                            <SelectTrigger className="qb-filter-select"><SelectValue placeholder="Column to sum" /></SelectTrigger>
                            <SelectContent>{activeTable.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </>
                    )}
                    <Input type="number" value={limit} onChange={e => setLimit(e.target.value)} className="qb-limit-input" title="Row limit (max 2000)" />
                    <Button size="sm" onClick={runVisual} disabled={visualLoading}>{visualLoading ? 'Running…' : 'Run Query'}</Button>
                  </div>

                  {visualError && <p className="qb-error">{visualError}</p>}

                  {visualResult && (
                    <>
                      <pre className="qb-sql-preview">{visualResult.generated_sql}</pre>
                      <div className="qb-result-actions">
                        <ExportButton onClick={() => exportCsv(`${tableName}.csv`, visualColumns.map(c => c.label), visualResult.rows.map(r => visualColumns.map(c => r[c.key])))} />
                      </div>
                      <DataTable rows={visualResult.rows} columns={visualColumns} rowKey={r => JSON.stringify(r)} emptyMessage="No rows returned." pageSize={15} />
                    </>
                  )}
                </>
              )}
              {!activeTable && <div className="qb-empty">Pick a table above to start.</div>}
            </div>
          )}

          {activeMode === 'raw' && (
            <div>
              {!rawSqlEnabled ? (
                <div className="qb-locked">
                  <Icon name="lock" size={22} />
                  <p>Raw SQL mode is off. Enabling it requires a one-time code sent to your account email.</p>
                  {!otpRequested ? (
                    <Button size="sm" onClick={requestOtp} disabled={otpSending}>{otpSending ? 'Sending…' : 'Request OTP to Enable'}</Button>
                  ) : (
                    <div className="qb-otp-row">
                      <Input value={otpCode} onChange={e => setOtpCode(e.target.value)} placeholder="6-digit code" className="qb-otp-input" />
                      <Button size="sm" onClick={verifyOtp} disabled={otpCode.length < 6}>Verify</Button>
                    </div>
                  )}
                  {otpError && <p className="qb-error">{otpError}</p>}
                </div>
              ) : (
                <div>
                  <div className="qb-raw-toolbar">
                    <span className="qb-raw-enabled-badge"><Badge variant="warning">Raw SQL enabled</Badge></span>
                    <button type="button" className="qb-disable-link" onClick={disableRawSql}>Disable raw SQL mode</button>
                  </div>
                  <Textarea value={rawSqlText} onChange={e => setRawSqlText(e.target.value)} className="qb-sql-textarea" spellCheck={false} />
                  <div className="qb-result-actions">
                    <Button size="sm" onClick={runRaw} disabled={rawLoading}>{rawLoading ? 'Running…' : 'Run Query'}</Button>
                    {rawResult && <ExportButton onClick={() => exportCsv('query.csv', rawColumns.map(c => c.label), rawResult.rows.map(r => rawColumns.map(c => r[c.key])))} />}
                  </div>
                  {rawError && <p className="qb-error">{rawError}</p>}
                  {rawResult && (
                    <>
                      <pre className="qb-sql-preview">{rawResult.generated_sql}</pre>
                      <DataTable rows={rawResult.rows} columns={rawColumns} rowKey={r => JSON.stringify(r)} emptyMessage="No rows returned." pageSize={15} />
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeMode === 'history' && (
            <div>
              <h2 className="qb-panel-title">Query History</h2>
              <DataTable rows={runs} columns={runColumns} rowKey={r => r.id} emptyMessage="No queries run yet." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
