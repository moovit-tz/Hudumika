import React, { useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import { Button } from './button.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.js';
import './kanban-board.css';

export interface KanbanColumn<S extends string = string> {
  id: S;
  label: string;
  color?: string;
}

export interface KanbanCardData {
  id: string;
  columnId: string;
  [key: string]: any;
}

interface KanbanBoardProps<T extends KanbanCardData, S extends string = string> {
  columns: KanbanColumn<S>[];
  items: T[];
  renderCard: (item: T, dragging: boolean) => ReactNode;
  onDrop?: (itemId: string, fromColumn: string, toColumn: string) => void;
  columnStyle?: CSSProperties;
  boardStyle?: CSSProperties;
  emptyMessage?: string;
  /** When provided, each status column paginates independently. */
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export function KanbanBoard<T extends KanbanCardData, S extends string = string>({
  columns,
  items,
  renderCard,
  onDrop,
  columnStyle,
  boardStyle,
  emptyMessage = 'No items',
  pageSizeOptions,
  defaultPageSize,
}: KanbanBoardProps<T, S>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const resolvedPageSizes = pageSizeOptions?.length ? pageSizeOptions : undefined;
  const initialPageSize = defaultPageSize && resolvedPageSizes?.includes(defaultPageSize)
    ? defaultPageSize
    : resolvedPageSizes?.[0] ?? 0;
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [columnPages, setColumnPages] = useState<Record<string, number>>({});
  const draggable = !!onDrop;
  const paginated = pageSize > 0;

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('kanban/item-id', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverColumn(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverColumn(colId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toColId: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('kanban/item-id');
    setOverColumn(null);
    setDraggingId(null);
    if (!itemId || !onDrop) return;
    const item = items.find(i => i.id === itemId);
    if (item && item.columnId !== toColId) {
      onDrop(itemId, item.columnId, toColId);
    }
  }, [items, onDrop]);

  return (
    <div>
      {paginated && resolvedPageSizes && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>Tasks per column</span>
          <Select value={String(pageSize)} onValueChange={value => {
            setPageSize(Number(value));
            setColumnPages({});
          }}>
            <SelectTrigger className="h-8 w-20 text-xs" aria-label="Tasks per Kanban column">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolvedPageSizes.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div
      className="kb-board"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
        gap: 12,
        alignItems: 'start',
        ...boardStyle,
      }}
    >
      {columns.map(col => {
        const colItems = items.filter(i => i.columnId === col.id);
        const pageCount = paginated ? Math.max(1, Math.ceil(colItems.length / pageSize)) : 1;
        const requestedPage = columnPages[col.id] ?? 1;
        const currentPage = Math.min(requestedPage, pageCount);
        const firstItem = paginated ? (currentPage - 1) * pageSize : 0;
        const visibleItems = paginated ? colItems.slice(firstItem, firstItem + pageSize) : colItems;
        const isOver = overColumn === col.id;
        return (
          <div
            key={col.id}
            className={`kb-column${isOver ? ' kb-column--over' : ''}`}
            style={columnStyle}
            onDragOver={draggable ? e => handleDragOver(e, col.id) : undefined}
            onDragLeave={draggable ? handleDragLeave : undefined}
            onDrop={draggable ? e => handleDrop(e, col.id) : undefined}
          >
            <div className="kb-col-header">
              <span className="kb-col-ring" style={{ color: col.color || 'var(--teal)' }} />
              <span className="kb-col-label">{col.label}</span>
              <span className="kb-col-count">{colItems.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {visibleItems.map(item => {
                const isDragging = draggingId === item.id;
                return (
                  <div
                    key={item.id}
                    draggable={draggable}
                    onDragStart={draggable ? e => handleDragStart(e, item.id) : undefined}
                    onDragEnd={draggable ? handleDragEnd : undefined}
                    className={`kb-card${isDragging ? ' kb-card--dragging' : ''}${!draggable ? ' kb-card--static' : ''}`}
                  >
                    {renderCard(item, isDragging)}
                  </div>
                );
              })}
              {colItems.length === 0 && (
                <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 11.5, color: 'var(--ink3)', opacity: 0.6 }}>
                  {emptyMessage}
                </div>
              )}
            </div>
            {paginated && colItems.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, marginTop: 10, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {firstItem + 1}–{Math.min(firstItem + pageSize, colItems.length)} of {colItems.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Previous ${col.label} tasks`}
                    disabled={currentPage <= 1}
                    onClick={() => setColumnPages(pages => ({ ...pages, [col.id]: currentPage - 1 }))}
                  >
                    ‹
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Next ${col.label} tasks`}
                    disabled={currentPage >= pageCount}
                    onClick={() => setColumnPages(pages => ({ ...pages, [col.id]: currentPage + 1 }))}
                  >
                    ›
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
