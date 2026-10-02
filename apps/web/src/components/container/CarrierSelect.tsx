import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon.js';
import { SHIPPING_LINES, detectShippingLine, ShippingLine } from './shippingLines.js';
import { CarrierLogo } from './CarrierLogo.js';

interface CarrierSelectProps {
  value?: string;
  onChange: (carrierName: string, shippingLine?: ShippingLine | null) => void;
  containerNumber?: string; // If provided, auto-detects and triggers auto-suggestion
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  autoDetectNotice?: boolean;
}

export const CarrierSelect: React.FC<CarrierSelectProps> = ({
  value = '',
  onChange,
  containerNumber,
  label,
  placeholder = 'Select shipping line or type carrier...',
  disabled = false,
  required = false,
  size = 'md',
  className = '',
  autoDetectNotice = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [autoDetectedLine, setAutoDetectedLine] = useState<ShippingLine | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-detection from container number
  useEffect(() => {
    if (containerNumber && containerNumber.trim().length >= 3) {
      const detected = detectShippingLine(containerNumber);
      if (detected) {
        setAutoDetectedLine(detected);
        // If current value is empty or mismatched, auto-suggest/apply
        if (!value || value === '' || value === '—') {
          onChange(detected.shortName, detected);
        }
      } else {
        setAutoDetectedLine(null);
      }
    } else {
      setAutoDetectedLine(null);
    }
  }, [containerNumber]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredLines = SHIPPING_LINES.filter((line) => {
    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      line.name.toLowerCase().includes(query) ||
      line.shortName.toLowerCase().includes(query) ||
      line.code.toLowerCase().includes(query) ||
      line.country.toLowerCase().includes(query) ||
      (line.headquarters && line.headquarters.toLowerCase().includes(query)) ||
      (line.alliance && line.alliance.toLowerCase().includes(query)) ||
      line.bicPrefixes.some((p) => p.toLowerCase().includes(query))
    );
  });

  const selectedLine = SHIPPING_LINES.find(
    (l) =>
      l.shortName.toLowerCase() === value.toLowerCase() ||
      l.name.toLowerCase() === value.toLowerCase() ||
      l.code.toLowerCase() === value.toLowerCase() ||
      l.id.toLowerCase() === value.toLowerCase()
  );

  const handleSelect = (line: ShippingLine) => {
    onChange(line.shortName, line);
    setIsOpen(false);
    setSearch('');
  };

  const handleCustomInput = (text: string) => {
    const detected = detectShippingLine(text);
    onChange(text, detected);
  };

  const isSmall = size === 'sm';

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={dropdownRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-[var(--ink2)] uppercase tracking-wider">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          {autoDetectedLine && autoDetectNotice && (
            <button
              type="button"
              onClick={() => handleSelect(autoDetectedLine)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/80 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer shadow-xs"
              title="Click to apply auto-detected carrier"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              Auto-detected: <CarrierLogo carrier={autoDetectedLine} size="xs" variant="mark" className="inline-block" /> {autoDetectedLine.shortName}
              <span className="text-[9px] underline opacity-80">Apply</span>
            </button>
          )}
        </div>
      )}

      {/* Main Select Button / Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-3 ${
          isSmall ? 'h-8 text-xs' : 'h-10 text-sm'
        } rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] cursor-pointer hover:border-[var(--teal)] transition-all shadow-sm ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        } ${isOpen ? 'ring-2 ring-teal-500/20 border-[var(--teal)]' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedLine ? (
            <>
              <CarrierLogo carrier={selectedLine} size={isSmall ? 18 : 22} variant="mark" />
              <span className="font-black text-[var(--ink)] truncate">{selectedLine.shortName}</span>
              {selectedLine.rank && (
                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hidden sm:inline">
                  #{selectedLine.rank}
                </span>
              )}
              <span className="text-[11px] text-[var(--ink3)] truncate hidden sm:inline">
                ({selectedLine.country})
              </span>
            </>
          ) : value ? (
            <>
              <CarrierLogo carrier={value} size={isSmall ? 18 : 22} variant="mark" />
              <span className="font-bold text-[var(--ink)] truncate">{value}</span>
            </>
          ) : (
            <span className="text-[var(--ink3)]">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[var(--ink3)] flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('', null);
              }}
              className="p-0.5 hover:text-red-500 rounded"
              title="Clear carrier"
            >
              <Icon name="x" size={12} />
            </button>
          )}
          <Icon name="chevronDown" size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-[var(--white)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search Box */}
          <div className="p-2 border-b border-[var(--border)] bg-[var(--bg)]">
            <div className="relative">
              <Icon
                name="search"
                size={13}
                color="var(--ink3)"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search carrier (e.g. MSC, Maersk, COSCO, ONE, Evergreen...)"
                className="w-full h-8 pl-8 pr-3 text-xs rounded-md bg-[var(--white)] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--ink3)] focus:outline-none focus:border-[var(--teal)]"
                autoFocus
              />
            </div>
          </div>

          {/* Quick carrier option list */}
          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)]/30 p-1">
            {filteredLines.length > 0 ? (
              filteredLines.map((line) => {
                const isSelected = selectedLine?.id === line.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => handleSelect(line)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/50 text-[var(--teal)] font-bold'
                        : 'hover:bg-[var(--bg)] text-[var(--ink)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CarrierLogo carrier={line} size={24} variant="mark" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate flex items-center gap-1.5">
                          <span>{line.shortName}</span>
                          {line.rank && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              #{line.rank}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--ink3)] font-mono font-normal">
                            {line.bicPrefixes.slice(0, 3).join(', ')}
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--ink3)] truncate">
                          {line.name} · {line.country} {line.alliance ? `· ${line.alliance}` : ''}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Icon name="check" size={14} color="var(--teal)" className="flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center space-y-2">
                <p className="text-xs text-[var(--ink3)]">No standard shipping line matches "{search}"</p>
                <button
                  type="button"
                  onClick={() => handleCustomInput(search)}
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-[var(--teal)] text-white hover:opacity-90"
                >
                  Use custom carrier "{search}"
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
