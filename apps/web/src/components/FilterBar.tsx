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
  /**
   * The declaration filters, rendered as one "Filter by" menu at the end of
   * this row. They used to be three loose Selects up in the page header, a
   * second filter control in a different place doing the same kind of job as
   * these chips. One row filters the list; this is that row.
   */
  declarationFilter?: React.ReactNode;
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
  declarationFilter,
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

      {/* The search box moved to the page header, beside the List/Board
          toggle. It is not a filter chip — it is the page's primary way in,
          and it was sitting mid-row between two groups of chips. */}

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
        {/* The seven type chips (All / FCL / LCL / Air / Road / Rail / Bulk)
            are inside the "Filter by" menu now. Seven always-visible buttons
            for one single-choice field is a lot of row for something most
            sessions never touch, and it sat beside a second filter control
            doing the same job. */}
        {declarationFilter}
      </div>
    </div>
  );
};
