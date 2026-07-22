import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ShipmentType } from '@hudumika/types';

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedType: ShipmentType | 'ALL';
  setSelectedType: (type: ShipmentType | 'ALL') => void;
  showOnlyMyCases: boolean;
  setShowOnlyMyCases: (val: boolean) => void;
  selectedRiskOnly: boolean;
  setSelectedRiskOnly: (val: boolean) => void;
}

const TYPES: (ShipmentType | 'ALL')[] = ['ALL', 'SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'BULK'];

const TYPE_LABELS: Record<string, string> = {
  ALL: 'All', SEA_FCL: 'FCL', SEA_LCL: 'LCL', AIR: 'Air', ROAD: 'Road', RAIL: 'Rail', BULK: 'Bulk',
};

import { Icon } from './Icon.js';

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery, setSearchQuery,
  selectedType, setSelectedType,
  showOnlyMyCases, setShowOnlyMyCases,
  selectedRiskOnly, setSelectedRiskOnly,
}) => {
  const [local, setLocal]     = useState(searchQuery);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((val: string) => {
    setLocal(val);
    setPending(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearchQuery(val);
      setPending(false);
    }, 350);
  }, [setSearchQuery]);

  useEffect(() => {
    if (searchQuery === '' && local !== '') { setLocal(''); setPending(false); }
  }, [searchQuery]);

  const clearSearch = () => {
    setLocal('');
    setSearchQuery('');
    setPending(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') clearSearch();
  };

  return (
    <div className="filter-bar">

      {/* ── Search — always-visible, plain input ── */}
      <div className="filter-search fs-open">
        <span className="fs-icon-btn"><Icon name="search" size={14} /></span>
        <input
          type="text"
          className="fs-input"
          placeholder="Search ref, goods, BL…"
          value={local}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {pending && <span className="ai-thinking" title="Searching…" />}
        {local && !pending && (
          <button type="button" className="filter-clear" onMouseDown={e => e.preventDefault()} onClick={clearSearch}>×</button>
        )}
      </div>

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
