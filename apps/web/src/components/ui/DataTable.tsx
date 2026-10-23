import React from 'react';
import './DataTable.css';
import { PaginationBar } from '../PaginationBar.js';
import { Icon } from '../Icon.js';
import type { IconName } from '../Icon.js';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './dropdown-menu.js';
import { SkeletonTable } from './skeleton.js';
import { Checkbox } from './checkbox.js';
import { FeaturedIcon } from './featured-icon.js';

/* ── Column descriptor ───────────────────────────────────────────────────── */

export interface TableColumn<T> {
  /** Unique key; used as React key and for sort identification. */
  key: string;
  header: React.ReactNode;
  /** Auto-render using this key on the row object. */
  accessor?: keyof T;
  /** Override the cell renderer completely. */
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  /** Sort a formatted or multi-line cell by its underlying value. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** CSS width for the <col> element, e.g. "120px" or "10%". */
  width?: number | string;
  /** Class applied to every <td> in this column. */
  className?: string;
  /** Class applied to the <th>. */
  thClassName?: string;
  /** Hide this column on viewports narrower than the breakpoint. */
  hideAt?: 'md' | 'sm';
  align?: 'left' | 'center' | 'right';
}

/* ── Row action descriptor ───────────────────────────────────────────────── */

export interface RowAction<T> {
  label: string;
  icon?: IconName;
  onClick: (row: T) => void;
  variant?: 'default' | 'danger';
  disabled?: boolean | ((row: T) => boolean);
  /** Render a separator above this item. */
  separator?: boolean;
}

/* ── Component props ─────────────────────────────────────────────────────── */

export interface DataTableProps<T extends object> {
  columns: TableColumn<T>[];
  rows: T[];
  /** Key field used for React keys and selection. Default: 'id'. */
  idKey?: keyof T;

  // ── Async / data states ──
  loading?: boolean;
  /** How many skeleton rows to show while loading. Default: 6. */
  loadingRows?: number;
  error?: string;
  onRetry?: () => void;

  // ── Empty states ──
  /** True when the backing dataset genuinely has no records (not just filtered-out). */
  empty?: boolean;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  /** True when active filters/search produced zero results. Distinct from empty. */
  filteredEmpty?: boolean;
  filteredEmptyMessage?: string;

  // ── Sorting (uncontrolled, client-side) ──
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';

  // ── Selection ──
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  // ── Row actions (kebab menu) ──
  rowActions?: (row: T) => RowAction<T>[] | null | undefined;

  // ── Pagination (uncontrolled, client-side) ──
  pageSize?: number;
  /** Server owns row paging; avoids slicing an already paged response again. */
  serverPagination?: {page:number;pageSize:number;total:number;onPageChange:(page:number)=>void;onPageSizeChange:(size:number)=>void};

  // ── Appearance ──
  /** Tighter row height for data-dense contexts. */
  compact?: boolean;
  /** Disable the sticky first-column behaviour. Default: true. */
  freezeFirstColumn?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

/* ── Internal helpers ────────────────────────────────────────────────────── */

function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <Icon name="arrowUpDown" size={12} strokeWidth={2} color="var(--ink3)" duotone={false} />;
  return <Icon name={dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} strokeWidth={2.5} color="var(--teal)" duotone={false} />;
}

function EmptyState({
  icon = 'inbox',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="dt-empty">
      <FeaturedIcon variant="gray" size="lg" shape="circle">{<Icon name={icon} size={24} strokeWidth={1.5} />}</FeaturedIcon>
      <p className="dt-empty-title">{title}</p>
      {message && <p className="dt-empty-msg">{message}</p>}
      {action && (
        <button type="button" className="btn btn-primary btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="dt-empty">
      <FeaturedIcon variant="error" size="lg" shape="circle">{<Icon name="alertTriangle" size={24} strokeWidth={1.5} />}</FeaturedIcon>
      <p className="dt-empty-title">Failed to load data</p>
      <p className="dt-empty-msg">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          <Icon name="refresh" size={14} strokeWidth={2} /> Try again
        </button>
      )}
    </div>
  );
}

/* ── DataTable ───────────────────────────────────────────────────────────── */

export function DataTable<T extends object>({
  columns,
  rows,
  idKey = 'id' as keyof T,
  loading = false,
  loadingRows = 6,
  error,
  onRetry,
  empty = false,
  emptyIcon = 'inbox',
  emptyTitle = 'No records',
  emptyMessage,
  emptyAction,
  filteredEmpty = false,
  filteredEmptyMessage = 'No results match your filters. Try adjusting or clearing them.',
  defaultSortKey,
  defaultSortDir = 'asc',
  selectedIds,
  onSelectionChange,
  rowActions,
  pageSize: initialPageSize = 10,
  serverPagination,
  compact = false,
  freezeFirstColumn = true,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>(defaultSortDir);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  React.useEffect(() => { setPageSize(initialPageSize); setPage(0); }, [initialPageSize]);

  const handleSort = React.useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
      setSortDir('asc');
      return key;
    });
    setPage(0);
  }, []);

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    const field = col?.accessor;
    if (!field && !col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : a[field!];
      const bv = col?.sortValue ? col.sortValue(b) : b[field!];
      if (av == null || bv == null) return av == null && bv == null ? 0 : av == null ? 1 : -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const pageRows = serverPagination ? rows : sorted.slice(page * pageSize, (page + 1) * pageSize);

  // Reset to page 0 when rows change (e.g. filter applied).
  const prevRowLen = React.useRef(rows.length);
  React.useEffect(() => {
    if (rows.length !== prevRowLen.current) { setPage(0); prevRowLen.current = rows.length; }
  }, [rows.length]);

  const allIds = React.useMemo(() => {
    if (!onSelectionChange) return null;
    return pageRows.map(r => String(r[idKey]));
  }, [pageRows, idKey, onSelectionChange]);

  const allSelected = allIds !== null && allIds.length > 0 && allIds.every(id => selectedIds?.has(id));
  const someSelected = !allSelected && allIds !== null && allIds.some(id => selectedIds?.has(id));

  const toggleAll = () => {
    if (!onSelectionChange || !allIds) return;
    const next = new Set(selectedIds ?? []);
    if (allSelected) allIds.forEach(id => next.delete(id));
    else allIds.forEach(id => next.add(id));
    onSelectionChange(next);
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const hasActions = !!rowActions;
  const hasSelection = !!onSelectionChange;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return <SkeletonTable rows={loadingRows} cols={columns.length + (hasSelection ? 1 : 0) + (hasActions ? 1 : 0)} />;
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`rtbl-wrap ${className ?? ''}`}>
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  // ── Empty (dataset) ──────────────────────────────────────────────────────
  if (empty || (rows.length === 0 && !filteredEmpty)) {
    return (
      <div className={`rtbl-wrap ${className ?? ''}`}>
        <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </div>
    );
  }

  // ── Empty (filtered) ─────────────────────────────────────────────────────
  if (filteredEmpty || rows.length === 0) {
    return (
      <div className={`rtbl-wrap ${className ?? ''}`}>
        <EmptyState icon="search" title="No results" message={filteredEmptyMessage} />
      </div>
    );
  }

  // ── Table ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`rtbl-wrap ${className ?? ''}`}
      data-compact={compact || undefined}
      data-freeze-first-column={String(freezeFirstColumn)}
    >
      <table className="rtbl" aria-rowcount={sorted.length}>
        {/* Column widths */}
        <colgroup>
          {hasSelection && <col style={{ width: 40 }} />}
          {columns.map(col => (
            <col key={col.key} style={col.width !== undefined ? { width: col.width } : undefined} />
          ))}
          {hasActions && <col style={{ width: 52 }} />}
        </colgroup>

        <thead>
          <tr>
            {hasSelection && (
              <th style={{ paddingLeft: 14 }}>
                <Checkbox
                  checked={someSelected ? 'indeterminate' : allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all rows on this page"
                />
              </th>
            )}
            {columns.map(col => {
              const isSorted = sortKey === col.key;
              const colClass = [
                col.thClassName ?? '',
                col.hideAt === 'md' ? 'col-hide-md' : col.hideAt === 'sm' ? 'col-hide-sm' : '',
                col.sortable ? 'dt-th-sortable' : '',
              ].filter(Boolean).join(' ');
              return (
                <th
                  key={col.key}
                  className={colClass || undefined}
                  style={col.align && col.align !== 'left' ? { textAlign: col.align } : undefined}
                  aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {col.sortable ? <button type="button" className="dt-sort-button" onClick={() => handleSort(col.key)}>
                    {col.header}<SortIcon active={isSorted} dir={sortDir} />
                  </button> : <span className="dt-th-inner">{col.header}</span>}
                </th>
              );
            })}
            {hasActions && <th aria-label="Actions" />}
          </tr>
        </thead>

        <tbody>
          {pageRows.map((row, idx) => {
            const id = String(row[idKey]);
            const isSelected = selectedIds?.has(id) ?? false;
            const actions = rowActions?.(row);

            return (
              <tr
                key={id}
                data-state={isSelected ? 'selected' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
                aria-selected={isSelected || undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? event => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); onRowClick(row); } } : undefined}
              >
                {hasSelection && (
                  <td style={{ paddingLeft: 14 }}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleRow(id)}
                      aria-label={`Select row ${idx + 1}`}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </td>
                )}
                {columns.map(col => {
                  const tdClass = [
                    col.className ?? '',
                    col.hideAt === 'md' ? 'col-hide-md' : col.hideAt === 'sm' ? 'col-hide-sm' : '',
                  ].filter(Boolean).join(' ');
                  const value = col.accessor !== undefined ? row[col.accessor] : undefined;
                  return (
                    <td
                      key={col.key}
                      className={tdClass || undefined}
                      style={col.align && col.align !== 'left' ? { textAlign: col.align } : undefined}
                    >
                      {col.render ? col.render(row, idx) : String(value ?? '')}
                    </td>
                  );
                })}
                {hasActions && (
                  <td className="dt-actions-cell">
                    {actions && actions.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="dt-action-btn"
                            aria-label="Row actions"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <Icon name="moreVertical" size={15} strokeWidth={2} duotone={false} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actions.map((a, i) => {
                            const isDisabled = typeof a.disabled === 'function' ? a.disabled(row) : (a.disabled ?? false);
                            return (
                              <React.Fragment key={i}>
                                {a.separator && i > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  onClick={event => { event.stopPropagation(); a.onClick(row); }}
                                  disabled={isDisabled}
                                  className={a.variant === 'danger' ? 'text-destructive focus:text-destructive' : undefined}
                                >
                                  {a.icon && <Icon name={a.icon} size={14} strokeWidth={2} duotone={false} />}
                                  {a.label}
                                </DropdownMenuItem>
                              </React.Fragment>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <PaginationBar page={serverPagination?.page ?? page + 1} pageSize={serverPagination?.pageSize ?? pageSize} total={serverPagination?.total ?? sorted.length}
        onPageChange={value => serverPagination ? serverPagination.onPageChange(value) : setPage(value - 1)}
        onPageSizeChange={value => { if(serverPagination) serverPagination.onPageSizeChange(value); else {setPageSize(value); setPage(0);} }}
        pageSizeOptions={Array.from(new Set([initialPageSize, 10, 25, 50, 100])).sort((a, b) => a - b)} />
    </div>
  );
}

/* ── QueryState ──────────────────────────────────────────────────────────────
 * Centralizes the three standard async states so each list page does not
 * independently decide whether loading means a spinner, blank screen or text.
 *
 * Usage:
 *   <QueryState loading={loading} error={error} empty={!items.length}>
 *     <DataTable ... />
 *   </QueryState>
 * ─────────────────────────────────────────────────────────────────────────── */

export interface QueryStateProps {
  loading?: boolean;
  /** Replaces children with a matching skeleton while true. */
  skeleton?: React.ReactNode;
  error?: string | null;
  onRetry?: () => void;
  /** True when the dataset has zero records (not a filter result). */
  empty?: boolean;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
}

export function QueryState({
  loading,
  skeleton,
  error,
  onRetry,
  empty,
  emptyIcon = 'inbox',
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyAction,
  children,
}: QueryStateProps) {
  if (loading) {
    return skeleton ? <>{skeleton}</> : <SkeletonTable rows={6} cols={5} />;
  }
  if (error) {
    return (
      <div className="rtbl-wrap">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rtbl-wrap">
        <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </div>
    );
  }
  return <>{children}</>;
}
