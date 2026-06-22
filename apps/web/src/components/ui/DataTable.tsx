import React from 'react';
import './DataTable.css'; // optional styling file

type Column<T> = {
  header: string;
  accessor: keyof T;
  render?: (value: any, row: T) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  sortable?: boolean;
  pageSize?: number;
};

export function DataTable<T extends Record<string, any>>({ columns, rows, sortable = true, pageSize = 10 }: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof T; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = React.useState(0);

  const sortedRows = React.useMemo(() => {
    if (!sortConfig) return rows;
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, sortConfig]);

  const displayedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);

  const requestSort = (key: keyof T) => {
    if (!sortable) return;
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const totalPages = Math.ceil(rows.length / pageSize);

  return (
    <div className="card">
      <div className="rtbl-wrap">
      <table className="rtbl">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={String(col.accessor)}
                onClick={() => requestSort(col.accessor)}
                style={{ cursor: sortable ? 'pointer' : 'default', textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}
              >
                {col.header}
                {sortConfig?.key === col.accessor ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayedRows.map((row, idx) => (
            <tr key={idx} style={{ background: idx % 2 === 0 ? 'var(--color-bg)' : 'transparent' }}>
              {columns.map(col => (
                <td key={String(col.accessor)} style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                  {col.render ? col.render(row[col.accessor], row) : row[col.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => Math.max(p - 1, 0))}>Prev</button>
          <span>{page + 1} / {totalPages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(p + 1, totalPages - 1))}>Next</button>
        </div>
      )}
    </div>
  );
}
