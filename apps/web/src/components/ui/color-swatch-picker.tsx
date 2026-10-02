import React, { useState } from 'react';
import { Icon } from '../Icon.js';
import { Popover, PopoverTrigger, PopoverContent } from './popover.js';
import { ColorPicker } from './color-picker.js';

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  swatches?: string[];
  className?: string;
}

// Canonical platform palette — matches the SuperAdmin theme-preset colors.
export const PLATFORM_SWATCHES = [
  '#1257c6', '#0f766e', '#059669', '#0891b2',
  '#7c3aed', '#9333ea', '#e11d48', '#d97706',
  '#0284c7', '#4f46e5', '#0d5c46', '#1e293b',
];

function isLight(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

/**
 * Compact color picker: one colored square trigger → popover with:
 *   1. Quick preset swatches (top)
 *   2. Full HSB gradient canvas + hue slider for custom colors (bottom)
 */
export function ColorSwatchPicker({
  value,
  onChange,
  swatches = PLATFORM_SWATCHES,
  className = '',
}: ColorSwatchPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={value}
            aria-label={`Color: ${value}`}
            className="w-9 h-9 rounded-lg border-2 border-input shadow-sm shrink-0 cursor-pointer transition-all hover:scale-105 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            style={{ backgroundColor: value }}
          />
        </PopoverTrigger>

        <PopoverContent className="w-auto p-3" align="start" sideOffset={6}>
          {/* Preset swatches */}
          <div className="grid gap-1.5 mb-3" style={{ gridTemplateColumns: 'repeat(6, 2rem)' }}>
            {swatches.map(sw => {
              const active = sw.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={sw}
                  type="button"
                  aria-label={sw}
                  aria-pressed={active}
                  onClick={() => { onChange(sw); setOpen(false); }}
                  style={{ backgroundColor: sw }}
                  className={[
                    'relative w-8 h-8 rounded-lg border-2 transition-all duration-100 cursor-pointer shrink-0',
                    'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary',
                    active ? 'border-(--teal) shadow-md scale-105' : 'border-transparent',
                  ].join(' ')}
                >
                  {active && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ color: isLight(sw) ? '#000' : '#fff' }}
                    >
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-border mb-3" />

          {/* Full color picker for custom colors */}
          <ColorPicker value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>

      {/* Hex shown alongside the trigger */}
      <span className="font-mono text-xs text-muted-foreground">{value}</span>
    </div>
  );
}
