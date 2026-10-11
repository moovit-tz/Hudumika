import React from 'react';
import { Button } from './button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select.js';

interface ListPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  noun?: string;
}

export function useListPagination(defaultSize = 25) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultSize);
  const reset = React.useCallback(() => setPage(1), []);
  return { page, setPage, pageSize, setPageSize, reset };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    visible: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    start: items.length ? start + 1 : 0,
    end: Math.min(start + pageSize, items.length),
    total: items.length,
  };
}

export const ListPagination: React.FC<ListPaginationProps> = ({
  total, page, pageSize, onPageChange, onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  noun = 'items',
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);

  if (total === 0) return null;

  return (
    <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
        Showing {start}–{end} of {total} {noun}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          Previous
        </Button>
        <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {currentPage} / {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
          Next
        </Button>
        <Select value={String(pageSize)} onValueChange={v => { onPageSizeChange(Number(v)); onPageChange(1); }}>
          <SelectTrigger style={{ height: 32, width: 100, fontSize: 12 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(s => (
              <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
