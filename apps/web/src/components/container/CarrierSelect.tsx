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
          <label className="text-xs font-bold text-(--ink2)">
            {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
          </label>
          {autoDetectedLine && autoDetectNotice && (
            <button
              type="button"
              onClick={() => handleSelect(autoDetectedLine)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors cursor-pointer shadow-xs"
              style={{ color: 'var(--teal)', background: 'var(--teal-l)', border: '1px solid var(--teal-m)' }}
              title="Click to apply auto-detected carrier"
             data-ui-native-button="">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />
              Equipment owner: <CarrierLogo carrier={autoDetectedLine} size="xs" variant="mark" className="inline-block" /> {autoDetectedLine.shortName}
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
        } border bg-(--bg) text-(--ink) cursor-pointer transition-all shadow-sm ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        style={{
          borderRadius: 'var(--r-sm)',
          borderColor: isOpen ? 'var(--teal)' : 'var(--border)',
          boxShadow: isOpen ? '0 0 0 2px color-mix(in srgb, var(--teal) 16%, transparent)' : undefined,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedLine ? (
            <>
              <CarrierLogo carrier={selectedLine} size={isSmall ? 18 : 22} variant="mark" />
              <span className="font-black text-(--ink) truncate">{selectedLine.shortName}</span>
              {selectedLine.rank && (
                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full hidden sm:inline" style={{ background: 'var(--gold-l)', color: 'var(--gold)', border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)' }}>
                  #{selectedLine.rank}
                </span>
              )}
              <span className="text-[11px] text-(--ink3) truncate hidden sm:inline">
                ({selectedLine.country})
              </span>
            </>
          ) : value ? (
            <>
              <CarrierLogo carrier={value} size={isSmall ? 18 : 22} variant="mark" />
              <span className="font-bold text-(--ink) truncate">{value}</span>
            </>
          ) : (
            <span className="text-(--ink3)">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-(--ink3) flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('', null);
              }}
              className="p-0.5 rounded hover:text-destructive"
              title="Clear carrier"
             data-ui-native-button="">
              <Icon name="x" size={12} />
            </button>
          )}
          <Icon name="chevronDown" size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          {/* Search Box */}
          <div className="p-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div className="relative">
              <Icon
                name="search"
                size={13}
                color="var(--ink3)"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input data-ui-field="input"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search carrier (e.g. MSC, Maersk, COSCO, ONE, Evergreen...)"
                className="w-full h-8 pl-8 pr-3 text-xs bg-(--white) border border-(--border) text-(--ink) placeholder:text-(--ink3) focus:outline-none focus:border-(--teal)"
                style={{ borderRadius: 'var(--r-sm)' }}
                autoFocus
              />
            </div>
          </div>

          {/* Quick carrier option list */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredLines.length > 0 ? (
              filteredLines.map((line) => {
                const isSelected = selectedLine?.id === line.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => handleSelect(line)}
                    className="w-full flex items-center justify-between p-2 text-left transition-colors"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      background: isSelected ? 'var(--teal-l)' : undefined,
                      color: isSelected ? 'var(--teal)' : 'var(--ink)',
                      fontWeight: isSelected ? 700 : undefined,
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
                   data-ui-native-button="">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CarrierLogo carrier={line} size={24} variant="mark" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate flex items-center gap-1.5">
                          <span>{line.shortName}</span>
                          {line.rank && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full" style={{ background: 'var(--gold-l)', color: 'var(--gold)', border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)' }}>
                              #{line.rank}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink3)' }}>
                            {line.bicPrefixes.slice(0, 3).join(', ')}
                          </span>
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--ink3)' }}>
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
                <p className="text-xs" style={{ color: 'var(--ink3)' }}>No standard shipping line matches "{search}"</p>
                <button
                  type="button"
                  onClick={() => handleCustomInput(search)}
                  className="px-3 py-1 text-xs font-bold hover:opacity-90"
                  style={{ borderRadius: 'var(--r-sm)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                 data-ui-native-button="">
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
