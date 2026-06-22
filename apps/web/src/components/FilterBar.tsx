import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ShipmentType } from '@clearos/types';

export interface AiFilterResult {
  searchQuery?: string;
  type?: ShipmentType | 'ALL';
  riskOnly?: boolean;
  myCases?: boolean;
}

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedType: ShipmentType | 'ALL';
  setSelectedType: (type: ShipmentType | 'ALL') => void;
  showOnlyMyCases: boolean;
  setShowOnlyMyCases: (val: boolean) => void;
  selectedRiskOnly: boolean;
  setSelectedRiskOnly: (val: boolean) => void;
  onAiQuery?: (raw: string, filters: AiFilterResult) => void;
}

const TYPES: (ShipmentType | 'ALL')[] = ['ALL', 'SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'BULK'];

const TYPE_LABELS: Record<string, string> = {
  ALL: 'All', SEA_FCL: 'FCL', SEA_LCL: 'LCL', AIR: 'Air', ROAD: 'Road', RAIL: 'Rail', BULK: 'Bulk',
};

const TYPE_MAP: Record<string, ShipmentType> = {
  fcl: 'SEA_FCL', 'sea fcl': 'SEA_FCL',
  lcl: 'SEA_LCL', 'sea lcl': 'SEA_LCL',
  air: 'AIR', airfreight: 'AIR', 'air freight': 'AIR', 'air cargo': 'AIR',
  road: 'ROAD', truck: 'ROAD', trucking: 'ROAD',
  rail: 'RAIL', train: 'RAIL',
  bulk: 'BULK',
};

function parseAiQuery(raw: string): AiFilterResult {
  const q = raw.toLowerCase();
  const result: AiFilterResult = {};

  if (/at.?risk|demurrage|overdue|breach|sla|urgent|flagged/i.test(q)) result.riskOnly = true;
  if (/my cases?|mine|assigned to me|my shipments?/i.test(q)) result.myCases = true;

  for (const [kw, type] of Object.entries(TYPE_MAP)) {
    if (q.includes(kw)) { result.type = type; break; }
  }

  const stripped = raw
    .replace(/\b(at[- ]?risk|demurrage|overdue|sla breach|urgent|flagged|my cases?|mine|assigned to me|my shipments?|sea fcl|sea lcl|air freight|air cargo|air|road|truck|trucking|fcl|lcl|rail|train|bulk)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (stripped) result.searchQuery = stripped;

  return result;
}

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2c0 0 1.8 7 5 10s10 5 10 5-7 1.8-10 5-5 10-5 10-1.8-7-5-10S2 12 2 12s7-1.8 10-5 5-10 5-10z"/>
    <path d="M5 3c0 0 .8 3 2.2 4.3S11 9.5 11 9.5s-3 .8-4.3 2.2S4.5 15 4.5 15s-.8-3-2.2-4.3S0 9.5 0 9.5s3-.8 4.3-2.2S5 3 5 3z" opacity=".5"/>
  </svg>
);

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery, setSearchQuery,
  selectedType, setSelectedType,
  showOnlyMyCases, setShowOnlyMyCases,
  selectedRiskOnly, setSelectedRiskOnly,
  onAiQuery,
}) => {
  const [open, setOpen]       = useState(() => Boolean(searchQuery));
  const [local, setLocal]     = useState(searchQuery);
  const [pending, setPending] = useState(false);
  const [aiMode, setAiMode]   = useState(false);
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((val: string) => {
    setLocal(val);
    if (!aiMode) {
      setPending(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearchQuery(val);
        setPending(false);
      }, 350);
    }
  }, [setSearchQuery, aiMode]);

  useEffect(() => {
    if (searchQuery === '' && local !== '') { setLocal(''); setPending(false); }
  }, [searchQuery]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const openSearch = () => setOpen(true);
  const blurSearch = () => { if (!local) { setOpen(false); } };
  const clearSearch = () => {
    setLocal('');
    setSearchQuery('');
    setPending(false);
    setAiLabel(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    inputRef.current?.focus();
  };

  const runAiSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setPending(true);
    setAiLabel(null);
    await new Promise(r => setTimeout(r, 700));
    const filters = parseAiQuery(query);
    onAiQuery?.(query, filters);
    const parts: string[] = [];
    if (filters.riskOnly)              parts.push('at-risk');
    if (filters.myCases)               parts.push('my cases');
    if (filters.type && filters.type !== 'ALL') parts.push(TYPE_LABELS[filters.type] ?? filters.type);
    if (filters.searchQuery)           parts.push(`"${filters.searchQuery}"`);
    setAiLabel(parts.length ? `Filtered: ${parts.join(' · ')}` : 'No specific filters found');
    setPending(false);
  }, [onAiQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { clearSearch(); setOpen(false); setAiMode(false); }
    if (e.key === 'Enter' && aiMode) { e.preventDefault(); runAiSearch(local); }
  };

  const toggleAiMode = () => {
    setAiMode(m => !m);
    setAiLabel(null);
    if (!open) setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="filter-bar">

      {/* ── AI Search ── */}
      <div
        className={`filter-search ai-search${open ? ' fs-open' : ' fs-closed'}${aiMode ? ' ai-active' : ''}`}
        onClick={!open ? openSearch : undefined}
        style={aiMode ? { borderColor: 'var(--teal)', boxShadow: '0 0 0 2px var(--teal-l)' } : undefined}
      >
        <button
          type="button"
          className="fs-icon-btn"
          onClick={e => { e.stopPropagation(); toggleAiMode(); if (!open) openSearch(); }}
          tabIndex={0}
          title={aiMode ? 'Switch to text search (press Enter to run AI)' : 'Switch to AI search mode'}
          style={aiMode ? { color: 'var(--teal)' } : undefined}
        >
          <SparkleIcon />
        </button>

        {!open && <span className="ai-search-label">AI</span>}

        {open && (
          <>
            <input
              ref={inputRef}
              type="text"
              className="fs-input"
              placeholder={aiMode
                ? 'Ask AI: "FCL at risk", "my overdue cases"… press Enter'
                : 'Search ref, goods, BL…'}
              value={local}
              onChange={e => handleChange(e.target.value)}
              onBlur={blurSearch}
              onKeyDown={handleKeyDown}
            />
            {pending && <span className="ai-thinking" title="Processing…" />}
            {local && !pending && (
              <button type="button" className="filter-clear" onMouseDown={e => e.preventDefault()} onClick={clearSearch}>×</button>
            )}
            {aiMode && !pending && local && (
              <button
                type="button"
                title="Run AI search"
                onMouseDown={e => e.preventDefault()}
                onClick={() => runAiSearch(local)}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', border: 'none', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Search ↵
              </button>
            )}
          </>
        )}
      </div>

      {/* AI result label */}
      {aiLabel && (
        <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap', padding: '0 6px', alignSelf: 'center', flexShrink: 0 }}>
          {aiLabel}
          <button type="button" onClick={() => { setAiLabel(null); clearSearch(); onAiQuery?.('', {}); }}
            style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            clear
          </button>
        </div>
      )}

      <div className="filter-spacer" />

      {/* ── Filter chips ── */}
      <div className="filter-chips">
        <button type="button" className={`fc${showOnlyMyCases ? ' on' : ''}`}
          onClick={() => setShowOnlyMyCases(!showOnlyMyCases)}>
          My Cases
        </button>
        <button type="button" className={`fc${selectedRiskOnly ? ' red-on' : ''}`}
          onClick={() => setSelectedRiskOnly(!selectedRiskOnly)}>
          At Risk
        </button>
        <div className="filter-divider" />
        {TYPES.map(type => (
          <button type="button" key={type} className={`fc${selectedType === type ? ' on' : ''}`}
            onClick={() => setSelectedType(type)}>
            {TYPE_LABELS[type] ?? type}
          </button>
        ))}
      </div>
    </div>
  );
};
