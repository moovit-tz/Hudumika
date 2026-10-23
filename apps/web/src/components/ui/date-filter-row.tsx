import React from 'react';
import { X } from 'lucide-react';
import { DatePicker, parseDateOnly, toDateOnlyString } from './date-picker.js';
import './date-filter-row.css';

export function datePresetRange(preset: 'all' | 'today' | '7d' | '30d' | 'month', today = new Date()): [string, string] {
  if (preset === 'all') return ['', ''];
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  if (preset === 'month') start.setDate(1);
  else if (preset === '7d' || preset === '30d') start.setDate(start.getDate() - (preset === '7d' ? 6 : 29));
  return [toDateOnlyString(start), toDateOnlyString(end)];
}

export function DateFilterRow({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const PRESETS: readonly [ 'all' | 'today' | '7d' | '30d' | 'month', string ][] = [
    ['all', 'All'],
    ['today', 'Today'],
    ['7d', '7 days'],
    ['30d', '30 days'],
    ['month', 'This month'],
  ];

  return (
    <div className="ds-date-combined" role="group" aria-label="Date filters">
      <div className="ds-date-presets" role="group" aria-label="Quick date range">
        {PRESETS.map(([preset, label]) => {
          const range = datePresetRange(preset);
          const active = from === range[0] && to === range[1];
          return (
            <button
              key={preset}
              type="button"
              className={`date-preset-pill${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(...range)}
              data-ui-native-button=""
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="ds-date-divider" aria-hidden="true" />
      <div className="ds-date-range">
        <DatePicker
          date={parseDateOnly(from)}
          onChange={date => {
            const value = toDateOnlyString(date);
            onChange(value, to && value > to ? '' : to);
          }}
          placeholder="Start date"
          triggerClassName="date-picker-seamless"
        />
        <span className="ds-date-arrow" aria-hidden="true">→</span>
        <DatePicker
          date={parseDateOnly(to)}
          onChange={date => {
            const value = toDateOnlyString(date);
            onChange(from && value && value < from ? '' : from, value);
          }}
          placeholder="End date"
          triggerClassName="date-picker-seamless"
        />
        {(from || to) && (
          <button
            type="button"
            className="stb-icon-btn ds-date-reset-btn"
            onClick={() => onChange('', '')}
            title="Reset dates"
            aria-label="Reset dates"
            data-ui-native-button=""
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
