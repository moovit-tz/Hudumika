import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Icon } from './Icon.js';

/* ── Shared building blocks for the analytics/reporting dashboards
     (Operations Metrics, Carbon Portfolio, …) — CSV export, stat tiles,
     a generic sortable/paginated table, and a clickable bar chart. ── */

export function fmtTZS(n: number) { return 'TZS ' + Math.round(n).toLocaleString('en'); }

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ExportButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" className="btn btn-secondary btn-sm" onClick={onClick} title="Export as CSV">
    <Icon name="download" size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
    Export CSV
  </button>
);

const TONE_COLOR: Record<'red' | 'green' | 'ink', string> = { red: 'var(--red)', green: 'var(--green)', ink: 'var(--navy)' };
export const StatTile: React.FC<{ label: string; value: string; tone?: 'red' | 'green' | 'ink' }> = ({ label, value, tone = 'ink' }) => (
  <div style={{ flex: 1, minWidth: 110, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `3px solid ${TONE_COLOR[tone]}` }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 800, color: TONE_COLOR[tone] }}>{value}</div>
  </div>
);

/* ── Generic sortable, paginated table. Can be asked to jump/highlight a row (from a chart click). ── */
export interface ColumnDef<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortValue: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({ rows, columns, rowKey, pageSize = 8, emptyMessage, focusKey }: {
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  pageSize?: number;
  emptyMessage: string;
  focusKey?: string | null;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue(a), bv = col.sortValue(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setSortDir('desc');
      return key;
    });
    setPage(1);
  };

  useEffect(() => {
    if (!focusKey) return;
    const idx = sorted.findIndex(r => rowKey(r) === focusKey);
    if (idx === -1) return;
    setPage(Math.floor(idx / pageSize) + 1);
    setFlashKey(focusKey);
    const raf = requestAnimationFrame(() => {
      document.getElementById(`row-${focusKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const t = setTimeout(() => setFlashKey(null), 2200);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="rtbl-wrap">
        <table className="rtbl" style={{ textAlign: 'left', fontSize: 13.5, width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)', cursor: 'pointer',
                    textAlign: col.align ?? 'left', userSelect: 'none', whiteSpace: 'nowrap',
                  }}
                  title="Click to sort"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : paged.map(row => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  id={`row-${key}`}
                  style={{ borderBottom: '1px solid var(--border)', background: flashKey === key ? 'var(--cts-accent-bg, var(--teal-l))' : undefined, transition: 'background 0.4s' }}
                >
                  {columns.map(col => (
                    <td key={col.key} style={{ padding: '12px 16px', textAlign: col.align ?? 'left' }}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Clickable bar chart — click a bar to jump straight to that row in a detail table ── */
export function ClickableBarChart({ labels, values, barColors, onBarClick, yLabel }: {
  labels: string[]; values: number[]; barColors: string[]; onBarClick?: (index: number) => void; yLabel: string;
}) {
  const chartRef = useRef<any>(null);
  return (
    <div style={{ height: 220 }}>
      <Bar
        ref={chartRef}
        data={{ labels, datasets: [{ label: yLabel, data: values, backgroundColor: barColors, borderRadius: 4, maxBarThickness: 34 }] }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${yLabel}: ${ctx.formattedValue}` } } },
          scales: {
            x: { ticks: { color: 'var(--ink3)', font: { size: 10.5 }, autoSkip: false, maxRotation: 45, minRotation: 0 }, grid: { display: false } },
            y: { ticks: { color: 'var(--ink3)', font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.15)' }, beginAtZero: true },
          },
          onHover: (event, elements) => {
            const target = event.native?.target as HTMLElement | undefined;
            if (target) target.style.cursor = onBarClick && elements.length > 0 ? 'pointer' : 'default';
          },
          onClick: (_evt, elements) => {
            if (onBarClick && elements.length > 0) onBarClick(elements[0].index);
          },
        }}
      />
    </div>
  );
}
