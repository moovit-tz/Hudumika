import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import type { StepProps, ProcedureKind, ProcedureSummary } from './types.js';

const FILTER_TABS: { value: ProcedureKind | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'EXPORT', label: 'Export' },
  { value: 'IMPORT', label: 'Import' },
  { value: 'TRANSIT', label: 'Transit' },
  { value: 'REGISTRATION', label: 'Registration' },
];

export function StepGoal({ draft, update, onNext }: StepProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProcedureSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 9;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active kind from draft or fallback to ALL
  const activeKind = draft.kind || 'ALL';

  useEffect(() => {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (draft.kind) params.set('kind', draft.kind);
      apiFetch(`/v1/customs/trade-wizard/procedures/search?${params.toString()}`)
        .then((res: ProcedureSummary[]) => {
          setResults(Array.isArray(res) ? res : []);
          setPage(1); // Reset to page 1 on new search or filter change
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, draft.kind]);

  async function pick(p: ProcedureSummary) {
    const detail = await apiFetch(`/v1/customs/trade-wizard/procedures/${p.id}`);
    // Record which procedure was chosen out of the results. The search itself
    // is already logged; without this the log says what was asked and never
    // what was taken, so no procedure can ever be shown to be mis-mapped.
    // Fire-and-forget — an observation must not block the wizard.
    void apiFetch('/v1/intel/trade-wizard-outcomes', {
      method: 'POST',
      body: JSON.stringify({
        procedure_id: p.id,
        procedure_name: p.name,
        goal: draft.kind ?? null,
        predicted: { permits: (detail as any)?.permits ?? null, steps: (detail as any)?.steps?.length ?? null },
        outcome: 'selected',
      }),
    }).catch(() => { /* observation only */ });
    update({ procedure: detail, answers: {} });
    onNext();
  }

  // Pagination logic
  const totalItems = results.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = results.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Search Bar & Filter Header */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={18} color="var(--teal)" />
          What commodity or procedure?
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
          Search our database of official Tanzania trade procedures, permits, and agency requirements.
        </div>

        {/* Search input with icon and clear button */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input
            className="input-field"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. coal, cashewnuts, coffee, business licence, port clearance, medical devices…"
            style={{ width: '100%', boxSizing: 'border-box', height: 46, paddingLeft: 40, paddingRight: query ? 36 : 14, fontSize: 14 }}
            autoFocus
          />
          <Icon name="search" size={16} color="var(--ink3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <Icon name="close" size={14} color="var(--ink3)" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>
            Filter:
          </span>
          {FILTER_TABS.map(tab => {
            const isActive = tab.value === activeKind;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => update({ kind: tab.value === 'ALL' ? null : tab.value })}
                style={{
                  padding: 'var(--ds-btn-py-sm) 14px',
                  borderRadius: 20,
                  fontSize: 12.5,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  border: `1.5px solid ${isActive ? 'var(--teal)' : 'var(--border)'}`,
                  background: isActive ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'var(--card-bg, var(--white))',
                  color: isActive ? 'var(--teal)' : 'var(--ink2)',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
          <Icon name="refresh" size={24} color="var(--teal)" className="tw-spin" style={{ display: 'block', margin: '0 auto 12px' }} />
          Searching trade procedures…
          <style>{`@keyframes tw-spin { to { transform: rotate(360deg); } } .tw-spin { animation: tw-spin 1s linear infinite; }`}</style>
        </div>
      )}

      {/* Procedure Cards Grid (9 per page) */}
      {!loading && pageItems.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {pageItems.map(p => (
              <div
                key={p.id}
                onClick={() => pick(p)}
                style={{
                  background: 'var(--card-bg, var(--white))',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  transition: 'all 0.18s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--teal)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px color-mix(in srgb, var(--teal) 15%, transparent)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.03)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <Badge variant={p.kind === 'IMPORT' ? 'brand' : p.kind === 'EXPORT' ? 'success' : 'gray'} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px' }}>
                      {p.kind}
                    </Badge>
                    {!p.has_detail && <span style={{ fontSize: 10, color: 'var(--ink4)', fontStyle: 'italic' }}>Overview</span>}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.name}
                  </div>
                  {p.summary && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.summary}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>
                  <span>Select Procedure</span>
                  <Icon name="arrowRight" size={14} color="var(--teal)" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              Showing <strong>{startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, totalItems)}</strong> of <strong>{totalItems}</strong> procedures
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  padding: 'var(--ds-btn-py-sm) 14px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg, var(--white))',
                  color: currentPage === 1 ? 'var(--ink4)' : 'var(--ink)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: currentPage === 1 ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Icon name="chevronLeft" size={13} /> Prev
              </button>

              {/* Page Number Pills */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pNum = i + 1;
                if (totalPages > 5 && currentPage > 3) {
                  pNum = currentPage - 2 + i;
                  if (pNum > totalPages) pNum = totalPages - (4 - i);
                }
                const isSelected = pNum === currentPage;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 'var(--r)',
                      border: `1px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--teal)' : 'var(--card-bg, var(--white))',
                      color: isSelected ? '#ffffff' : 'var(--ink)',
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{
                  padding: 'var(--ds-btn-py-sm) 14px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg, var(--white))',
                  color: currentPage >= totalPages ? 'var(--ink4)' : 'var(--ink)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: currentPage >= totalPages ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                Next <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && (
        <div style={{ padding: '36px 20px', textAlign: 'center', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14 }}>
          <Icon name="search" size={24} color="var(--ink3)" style={{ display: 'block', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No matching procedure found</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>Try clearing your search query or selecting a different procedure category filter.</div>
        </div>
      )}
    </div>
  );
}
