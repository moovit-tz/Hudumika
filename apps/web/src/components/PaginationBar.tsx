import React from 'react';
import { Icon } from './Icon.js';
import { Tip } from './ui/tooltip.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import './PaginationBar.css';

/**
 * The canonical pagination bar for the platform.
 * Standardizes range text (e.g. 1–15 of 48 items), first/prev/page-numbers/next/last
 * navigation buttons, and responsive rows-per-page dropdown controls across all list views.
 */
export interface PaginationBarProps {
  /** 1-based current page index */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  total: number;
  /** Called when user changes the active page (1-based) */
  onPageChange: (page: number) => void;
  /** Omit to hide the rows-per-page control (fixed page size) */
  onPageSizeChange?: (size: number) => void;
  /** Available page size options in the dropdown */
  pageSizeOptions?: number[];
  /** Singular noun for the range text, e.g. "message", "contact", "order" */
  itemLabel?: string;
  /** Set false to drop the top border (when the parent container already draws one) */
  bordered?: boolean;
  /** Optional extra class name for custom layout tweaks */
  className?: string;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = 'item',
  bordered = true,
  className = '',
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  // Smart page number windowing
  const getPageNumbers = (): (number | '…')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safePage <= 4) {
      return [1, 2, 3, 4, 5, '…', totalPages];
    }
    if (safePage >= totalPages - 3) {
      return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '…', safePage - 1, safePage, safePage + 1, '…', totalPages];
  };

  const pages = getPageNumbers();

  const pluralLabel = total === 1
    ? itemLabel
    : itemLabel.endsWith('s') || itemLabel.endsWith('ch') || itemLabel.endsWith('sh')
      ? `${itemLabel}es`
      : `${itemLabel}s`;

  return (
    <div className={`pagination-bar${!bordered ? ' pagination-bar--noborder' : ''}${className ? ` ${className}` : ''}`}>
      {/* ── Left Region: Item count & range ── */}
      <div className="pagination-bar-info">
        {total === 0 ? (
          <span>0 of 0 {pluralLabel}</span>
        ) : (
          <span>
            Showing <span className="pagination-bar-num">{start}–{end}</span> of <span className="pagination-bar-num">{total.toLocaleString()}</span> {pluralLabel}
          </span>
        )}
      </div>

      {/* ── Center Region: Navigation buttons ── */}
      <div className="pagination-bar-nav" role="navigation" aria-label="Pagination Navigation">
        <Tip label="First page">
          <button
            type="button"
            className="pagination-bar-btn"
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            <Icon name="chevronsLeft" size={14} />
          </button>
        </Tip>

        <Tip label="Previous page">
          <button
            type="button"
            className="pagination-bar-btn"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous page"
          >
            <Icon name="chevronLeft" size={14} />
          </button>
        </Tip>

        {pages.map((p, idx) =>
          p === '…' ? (
            <span key={`dots-${idx}`} className="pagination-bar-ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`pagination-bar-btn${p === safePage ? ' is-active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === safePage ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}

        <Tip label="Next page">
          <button
            type="button"
            className="pagination-bar-btn"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next page"
          >
            <Icon name="chevronRight" size={14} />
          </button>
        </Tip>

        <Tip label="Last page">
          <button
            type="button"
            className="pagination-bar-btn"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Last page"
          >
            <Icon name="chevronsRight" size={14} />
          </button>
        </Tip>
      </div>

      {/* ── Right Region: Rows per page selector ── */}
      {onPageSizeChange && (
        <div className="pagination-bar-size">
          <span className="pagination-bar-size-label">Rows per page:</span>
          <div className="pagination-bar-select-wrap">
            <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
              <SelectTrigger className="pagination-bar-select-trigger" aria-label="Select rows per page">
                <SelectValue>{pageSize} / page</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {pageSizeOptions.map(opt => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
