import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from '../components/ui/DataTable.js';

const columns = [{key:'name',header:'Employee',accessor:'name' as const}];
const text = (html:string) => html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');

describe('HR server-paged registers', () => {
  it('renders the whole server page with its global range, without a second client-side slice', () => {
    const rows=Array.from({length:25},(_,index)=>({id:String(index+26),name:`Employee ${index+26}`}));
    const html=renderToStaticMarkup(<DataTable columns={columns} rows={rows} serverPagination={{page:2,pageSize:25,total:75,onPageChange:()=>{},onPageSizeChange:()=>{}}} />);
    expect(html).toContain('Employee 26');
    expect(html).toContain('Employee 50');
    expect(text(html)).toMatch(/Showing 26\s*–\s*50 of 75/);
  });

  it('preserves client-side pagination for existing callers', () => {
    const rows=Array.from({length:25},(_,index)=>({id:String(index+1),name:`Employee ${index+1}`}));
    const html=renderToStaticMarkup(<DataTable columns={columns} rows={rows} pageSize={10} />);
    expect(html).toContain('Employee 10');
    expect(html).not.toContain('Employee 11');
    expect(text(html)).toMatch(/Showing 1\s*–\s*10 of 25/);
  });
});
