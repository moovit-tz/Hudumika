import React from 'react';

interface TableHeaderProps {
  sortBy: 'urgency' | 'created' | 'eta' | 'days';
  setSortBy: (sort: 'urgency' | 'created' | 'eta' | 'days') => void;
}

export const TableHeader: React.FC<TableHeaderProps> = ({ sortBy, setSortBy }) => {
  const headers = [
    { label: '', className: 'th-urgency' },
    { label: 'Customer', className: 'th-ref', field: 'created' as const },
    { label: 'Segment & Location', className: 'th-type' },
    { label: 'Demurrage Risk', className: 'th-desc' },
    { label: 'Action Needed', className: 'th-stage' },
    { label: 'Active Cases', className: 'th-status' },
  ];

  return (
    <div
      className="table-hdr"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      {headers.map((h, i) => {
        const isSortable = !!h.field;
        const isSelected = isSortable && sortBy === h.field;

        return (
          <div
            key={i}
            className={`${h.className} ${isSortable ? 'th' : ''}`}
            onClick={isSortable ? () => setSortBy(h.field!) : undefined}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10.5px',
              fontWeight: 600,
              color: isSelected ? 'var(--teal)' : 'var(--ink3)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: isSortable ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {h.label} {isSelected ? '▼' : ''}
          </div>
        );
      })}
    </div>
  );
};
