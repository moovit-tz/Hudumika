import React, { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { Table } from './table.js';
import { cn } from '../../lib/utils.js';
import './responsive-table.css';

function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child ?? '')).join(' ').trim();
}

function isSection(type: React.ElementType | string, native: string, component: string) {
  return type === native || (typeof type !== 'string' && 'displayName' in type && type.displayName === component);
}

/** A semantic table on desktop, labelled record cards on narrow screens. */
export function ResponsiveTable({ children, className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  let labels: string[] = [];
  Children.forEach(children, section => {
    if (!isValidElement<{ children?: ReactNode }>(section) || !isSection(section.type, 'thead', 'TableHeader')) return;
    Children.forEach(section.props.children, row => {
      if (isValidElement<{ children?: ReactNode }>(row)) labels = Children.toArray(row.props.children).map(text);
    });
  });
  const labelled = Children.map(children, section => {
    if (!isValidElement<{ children?: ReactNode }>(section) || !isSection(section.type, 'tbody', 'TableBody')) return section;
    return cloneElement(section, {}, Children.map(section.props.children, row => {
      if (!isValidElement<{ children?: ReactNode }>(row)) return row;
      return cloneElement(row, {}, Children.map(row.props.children, (cell, index) => {
        if (!isValidElement<React.TdHTMLAttributes<HTMLTableCellElement>>(cell)) return cell;
        return cloneElement(cell, { 'data-label': labels[index] || 'Details' } as React.TdHTMLAttributes<HTMLTableCellElement>);
      }));
    }));
  });
  return <Table {...props} className={cn('responsive-record-table', className)}>{labelled}</Table>;
}
