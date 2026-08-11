import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';

/**
 * The one pagination bar for the platform. Ops Command grew the canonical
 * version (range text · « ‹ 1 … n › » · rows-per-page); LandedCost history and
 * Products/Services each hand-rolled their own. This is that bar extracted so
 * every list page shares the exact same control, spacing and tokens — the
 * unused `ui/pagination.tsx` (shadcn links) never fit this "of N · page-size"
 * shape, so it stays for anything that wants prev/next links only.
 */
export interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the rows-per-page control (fixed page size). */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Singular noun for the range text, e.g. "customer group" → "16 customer groups". */
  itemLabel?: string;
  /** Set false to drop the top border (when the parent already draws one). */
  bordered?: boolean;
}

const btn: React.CSSProperties = {
  minWidth: 28, height: 28, padding: '0 6px', fontSize: 13, fontWeight: 600,
  border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)',
};

export function PaginationBar({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 25, 50], itemLabel = 'item', bordered = true,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const step = (disabled: boolean, to: number, label: string) => (
    <button type="button" disabled={disabled} onClick={() => onPageChange(to)}
      style={{ ...btn, color: disabled ? 'var(--ink3)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer' }}>
      {label}
    </button>
  );

  // 1 … (page-1) page (page+1) … last — collapse the gaps with an ellipsis.
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: bordered ? '1px solid var(--border)' : 'none', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
        {start}–{end} of {total} {itemLabel}{total !== 1 ? 's' : ''}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {step(page <= 1, 1, '«')}
        {step(page <= 1, page - 1, '‹')}
        {pages.map((p, i) => p === '…'
          ? <span key={`e${i}`} style={{ fontSize: 13, color: 'var(--ink3)', padding: '0 2px' }}>…</span>
          : <button key={p} type="button" onClick={() => onPageChange(p as number)}
              style={{ ...btn, cursor: 'pointer', background: page === p ? 'var(--teal)' : 'var(--white)', color: page === p ? '#fff' : 'var(--ink)' }}>
              {p}
            </button>
        )}
        {step(page >= totalPages, page + 1, '›')}
        {step(page >= totalPages, totalPages, '»')}
      </div>
      {onPageSizeChange && (
        <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
          <SelectTrigger aria-label="Rows per page" style={{ width: 'auto', height: 'auto', fontSize: 12, padding: '3px 6px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(s => <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
