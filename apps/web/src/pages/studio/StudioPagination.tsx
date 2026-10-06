import React from 'react';
import { Button } from '../../components/ui/button.js';
import './WorkflowList.css';
export function StudioPagination({page, total, size = 6, onChange}: {page:number; total:number; size?:number; onChange:(page:number)=>void}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  return <nav className="studio-pagination" aria-label="List pages">
    <span aria-live="polite">{total ? (current - 1) * size + 1 : 0}-{Math.min(current * size, total)} of {total}</span>
    <Button variant="outline" disabled={current === 1} onClick={() => onChange(current - 1)}>Previous</Button>
    <span>Page {current} of {pages}</span>
    <Button variant="outline" disabled={current === pages} onClick={() => onChange(current + 1)}>Next</Button>
  </nav>;
}
