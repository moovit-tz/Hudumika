import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';

const PAGE_SIZES = [10, 20, 50];

export function useSmsList<T extends { id: string }>(items: T[], initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => setPage(current => Math.min(current, totalPages)), [totalPages]);
  useEffect(() => {
    const validIds = new Set(items.map(item => item.id));
    setSelectedIds(current => {
      const next = new Set([...current].filter(id => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );
  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  const someSelected = !allSelected && items.some(item => selectedIds.has(item.id));

  function toggle(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map(item => item.id)));
  }

  return {
    page,
    pageSize,
    pageItems,
    totalPages,
    selectedIds,
    selectedItems: items.filter(item => selectedIds.has(item.id)),
    allSelected,
    someSelected,
    setPage,
    setPageSize: (size: number) => { setPageSize(size); setPage(1); },
    setSelectedIds,
    toggle,
    toggleAll,
  };
}

interface SmsListToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  total: number;
  page: number;
  pageSize: number;
  selectedCount: number;
  activeFilterCount?: number;
  filterContent: (close: () => void) => React.ReactNode;
  onPageSizeChange: (size: number) => void;
  onExport: () => void;
}

export function SmsListToolbar(props: SmsListToolbarProps) {
  const start = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const end = Math.min(props.page * props.pageSize, props.total);
  return (
    <SearchToolbar
      search={props.search}
      onSearch={props.onSearch}
      placeholder={props.placeholder}
      activeFilterCount={props.activeFilterCount ?? 0}
      filterContent={props.filterContent}
      actions={
        <>
          <span style={{ padding: '0 8px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
            {start}–{end} of {props.total} rows
          </span>
          <Select value={String(props.pageSize)} onValueChange={value => props.onPageSizeChange(Number(value))}>
            <SelectTrigger aria-label="Rows per page" style={{ width: 72, height: 'var(--ctl-h-sm)' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={props.selectedCount === 0} onClick={props.onExport}>
            <Icon name="download" size={13} /> Export{props.selectedCount ? ` (${props.selectedCount})` : ''}
          </Button>
        </>
      }
    />
  );
}

export function SmsListPagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Page {page} of {totalPages}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevronLeft" size={13} /> Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => onPage(page + 1)}>
          Next <Icon name="chevronRight" size={13} />
        </Button>
      </div>
    </div>
  );
}

export function SmsFilterMenu({ children, onClear, showClear }: { children: React.ReactNode; onClear: () => void; showClear: boolean }) {
  return (
    <div style={{ width: 300, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>Filter rows</strong>
        {showClear && <Button size="sm" variant="ghost" onClick={onClear}>Clear all</Button>}
      </div>
      {children}
    </div>
  );
}

export function downloadSmsCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
