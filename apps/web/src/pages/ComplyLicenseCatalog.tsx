import {Banner} from '../components/ui/alert.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import {Sheet, SheetContent, SheetTitle} from '../components/ui/sheet.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Card } from '../components/ui/card.js';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useComplyLicenseCatalog } from '../hooks/useComply.js';
import type { CompLicenseCatalogEntry } from '@hudumika/types';
import { Combobox } from '../components/ui/combobox.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import './ComplyOS.css';

function formatFee(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  if (amount === 0) return 'Nil';
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  return currency === 'USD' ? `USD ${formatted}` : `TZS ${formatted}/=`;
}

export function ComplyLicenseCatalog() {
  const navigate = useNavigate();
  const { catalog, loading, error } = useComplyLicenseCatalog();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('__all__');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<CompLicenseCatalogEntry | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of catalog) if (!seen.has(c.sn)) seen.set(c.sn, c.category);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([sn, name]) => ({ value: String(sn), label: `${sn}. ${name}` }));
  }, [catalog]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(c => {
      if (category !== '__all__' && String(c.sn) !== category) return false;
      if (!q) return true;
      return c.category.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || (c.tier ?? '').toLowerCase().includes(q);
    });
  }, [catalog, search, category]);

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Licence catalogue']}
        titlePlain="Licence"
        titleEm="catalogue"
        subtitle={<> Tanzania Business Licensing Act fee schedule — {catalog.length} licence options across 37 categories </>}
      />

      {error && <Banner variant="error" icon={false} className="">Failed to load the licence catalogue: {error}</Banner>}

      <div style={{ margin: '0 0 16px' }}>
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search licence, category or tier…"
          activeFilterCount={category !== '__all__' ? 1 : 0}
          onFiltersClick={() => setShowFilters(f => !f)}
          filtersOpen={showFilters}
        />
        {showFilters && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0 4px', alignItems: 'center' }}>
            <Combobox
              value={category}
              onChange={setCategory}
              placeholder="All categories"
              searchPlaceholder="Search category…"
              options={[{ value: '__all__', label: 'All categories' }, ...categories]}
            />
          </div>
        )}
      </div>

      <Card className="comply-card">
        <div className="comply-card-body">
          <Table className="comply-table">
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Principal Fee</TableHead>
                <TableHead>Sub-Licence Fee</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="comply-empty-hint"><SectionLoading label="Loading licence catalogue…" /></TableCell></TableRow>}
              {!loading && visible.length === 0 && (
                <TableRow><TableCell colSpan={6} className="comply-empty-hint">No licences match your search.</TableCell></TableRow>
              )}
              {visible.map(c => (
                <TableRow tabIndex={0} onKeyDown={event => {if(event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')){event.preventDefault();event.currentTarget.click();}}} key={c.id} className="comply-tr-click" onClick={() => setSelected(c)}>
                  <TableCell data-label="Category" className="comply-td-muted" style={{ whiteSpace: 'nowrap' }}>{c.sn}. {c.category}</TableCell>
                  <TableCell data-label="Licence" className="comply-table-name">{c.description}</TableCell>
                  <TableCell data-label="Tier" className="comply-td-muted">{c.tier ?? '—'}</TableCell>
                  <TableCell data-label="Principal Fee" className="comply-td-mono">{formatFee(c.principal_fee, c.principal_currency)}</TableCell>
                  <TableCell data-label="Sub-Licence Fee" className="comply-td-mono">{formatFee(c.subsidiary_fee, c.subsidiary_currency)}</TableCell>
                  <TableCell data-label="Actions" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="sm"
                      type="button"

                      onClick={() => navigate(`/complyos/license-catalog/apply/${c.id}`)}
                     >
                      Apply
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Detail drawer */}
      {selected && (
        <Sheet open={true} onOpenChange={open => { if (!open) (() => setSelected(null))(); }}>
          <SheetContent aria-describedby={undefined} className="comply-detail-sheet w-full sm:max-w-xl flex flex-col p-0 gap-0">
            <div className="comply-panel-hdr">
              <div>
                <SheetTitle className="comply-panel-hdr-title">{selected.description}</SheetTitle>
                <Badge variant={complyBadgeVariant("comply-badge comply-badge--draft")}>{selected.sn}. {selected.category}</Badge>
              </div>

            </div>

            <div className="comply-panel-body">
              <div className="comply-meta-grid">
                {[
                  { label: 'Tier', val: selected.tier ?? '—' },
                  { label: 'Principal Fee', val: formatFee(selected.principal_fee, selected.principal_currency) },
                  { label: 'Sub-Licence Fee', val: formatFee(selected.subsidiary_fee, selected.subsidiary_currency) },
                  { label: 'Issuing Authority', val: 'Local Government Authority (LGA)' },
                ].map(m => (
                  <div key={m.label}>
                    <div className="comply-meta-key">{m.label}</div>
                    <div className="comply-meta-val">{m.val}</div>
                  </div>
                ))}
              </div>

              {selected.notes && (
                <Banner variant="info" icon={false} className=""><strong>Note: </strong>{selected.notes}</Banner>
              )}

              <div>
                <div className="comply-section-title">Typical Requirements</div>
                <p style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10, lineHeight: 1.5 }}>
                  A general starting checklist — not an official per-licence list. You can edit it when you apply.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.requirements.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                      <Icon name="fileText" size={13} color="var(--comply)" />
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button variant="default" size="sm"
                type="button"

                style={{alignSelf: 'flex-start'}}
                onClick={() => navigate(`/complyos/license-catalog/apply/${selected.id}`)}
               >
                <Icon name="send" size={13} /> Apply for this Licence
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
