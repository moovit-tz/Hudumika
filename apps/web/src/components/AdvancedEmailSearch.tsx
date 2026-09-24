import { useState } from 'react';
import { Icon } from './Icon.js';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { DatePicker } from './ui/date-picker.js';
import { Tip } from './ui/tooltip.js';

export interface AdvancedSearchQuery {
  from?: string;
  to?: string;
  subject?: string;
  hasWords?: string;
  doesntHave?: string;
  hasAttachment?: boolean;
  sizeCmp?: 'gt' | 'lt';
  sizeMb?: number;
  dateWithin?: string;
  dateAfter?: string;
  dateBefore?: string;
  scope?: string;
}

const EMPTY: AdvancedSearchQuery = {};

const DATE_WITHIN_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '1w', label: '1 week' },
  { value: '2w', label: '2 weeks' },
  { value: '1m', label: '1 month' },
  { value: '2m', label: '2 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
];

/**
 * Advanced Email Search Form — From / To / Subject / Keywords / Size / Date range / Scope.
 * Fully styled according to the Hudumika Design System.
 */
export function AdvancedEmailSearch({ labelDefs, onSearch, onCreateFilter, collisionBoundary }: {
  labelDefs: { name: string }[];
  onSearch: (q: AdvancedSearchQuery) => void;
  onCreateFilter?: (q: AdvancedSearchQuery) => void;
  collisionBoundary?: Element | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<AdvancedSearchQuery>(EMPTY);

  function set<K extends keyof AdvancedSearchQuery>(key: K, value: AdvancedSearchQuery[K]) {
    setQ(prev => ({ ...prev, [key]: value }));
  }

  function run() {
    onSearch(q);
    setOpen(false);
  }

  function clear() {
    setQ(EMPTY);
  }

  const hasAnyFilter = Object.values(q).some(v => v !== undefined && v !== '');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label="Advanced search">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`em-icon-btn ${hasAnyFilter ? 'em-icon-btn--active' : 'em-icon-btn--ghost'}`}
            aria-label="Toggle advanced search"
          >
            <Icon name="chevronDown" size={14} />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        align="end"
        collisionBoundary={collisionBoundary ?? undefined}
        collisionPadding={16}
        sticky="always"
        sideOffset={6}
        className="em-adv-search"
      >
        <div className="em-adv-search-hdr">
          <div className="em-adv-search-title">
            <Icon name="filter" size={14} />
            <span>Advanced Search</span>
          </div>
          {hasAnyFilter && (
            <button type="button" className="em-adv-reset-btn" onClick={clear}>
              <Icon name="refresh" size={11} />
              <span>Reset filters</span>
            </button>
          )}
        </div>

        <div className="em-adv-search-row">
          <label>From</label>
          <div className="em-adv-search-ctrl">
            <input
              className="em-adv-input"
              placeholder="Sender name or email"
              value={q.from ?? ''}
              onChange={e => set('from', e.target.value || undefined)}
            />
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>To</label>
          <div className="em-adv-search-ctrl">
            <input
              className="em-adv-input"
              placeholder="Recipient name or email"
              value={q.to ?? ''}
              onChange={e => set('to', e.target.value || undefined)}
            />
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Subject</label>
          <div className="em-adv-search-ctrl">
            <input
              className="em-adv-input"
              placeholder="Subject keywords"
              value={q.subject ?? ''}
              onChange={e => set('subject', e.target.value || undefined)}
            />
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Has words</label>
          <div className="em-adv-search-ctrl">
            <input
              className="em-adv-input"
              placeholder="Keywords in body or header"
              value={q.hasWords ?? ''}
              onChange={e => set('hasWords', e.target.value || undefined)}
            />
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Doesn't have</label>
          <div className="em-adv-search-ctrl">
            <input
              className="em-adv-input"
              placeholder="Exclude matching words"
              value={q.doesntHave ?? ''}
              onChange={e => set('doesntHave', e.target.value || undefined)}
            />
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Size</label>
          <div className="em-adv-search-ctrl em-adv-size-ctrl">
            <Select value={q.sizeCmp ?? '__none__'} onValueChange={v => set('sizeCmp', v === '__none__' ? undefined : v as any)}>
              <SelectTrigger className="w-32 shrink-0"><SelectValue placeholder="Doesn't matter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Doesn't matter</SelectItem>
                <SelectItem value="gt">Greater than</SelectItem>
                <SelectItem value="lt">Less than</SelectItem>
              </SelectContent>
            </Select>
            <input
              className="em-adv-input em-adv-size-num"
              type="number"
              min={0}
              placeholder="0"
              value={q.sizeMb ?? ''}
              onChange={e => set('sizeMb', e.target.value ? Number(e.target.value) : undefined)}
              disabled={!q.sizeCmp}
            />
            <span className="em-adv-unit-pill">MB</span>
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Date within</label>
          <div className="em-adv-search-ctrl">
            <Select value={q.dateWithin ?? '__any__'} onValueChange={v => set('dateWithin', v === '__any__' ? undefined : v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_WITHIN_OPTIONS.map(o => <SelectItem key={o.value || 'any'} value={o.value || '__any__'}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Date range</label>
          <div className="em-adv-search-ctrl em-adv-dates-ctrl">
            <DatePicker
              date={q.dateAfter ? new Date(q.dateAfter) : undefined}
              onChange={d => set('dateAfter', d ? d.toISOString() : undefined)}
              placeholder="After date"
              triggerClassName="em-adv-datepicker-trigger"
            />
            <DatePicker
              date={q.dateBefore ? new Date(q.dateBefore) : undefined}
              onChange={d => set('dateBefore', d ? d.toISOString() : undefined)}
              placeholder="Before date"
              triggerClassName="em-adv-datepicker-trigger"
            />
          </div>
        </div>

        <div className="em-adv-search-row">
          <label>Search in</label>
          <div className="em-adv-search-ctrl">
            <Select value={q.scope ?? 'all'} onValueChange={v => set('scope', v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Mail</SelectItem>
                <SelectItem value="inbox">Inbox</SelectItem>
                <SelectItem value="starred">Starred</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="drafts">Drafts</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="trash">Trash</SelectItem>
                {labelDefs.map(l => <SelectItem key={l.name} value={`label:${l.name}`}>Label: {l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="em-adv-search-row">
          <label></label>
          <label className="em-adv-checkbox-label">
            <input
              type="checkbox"
              checked={!!q.hasAttachment}
              onChange={e => set('hasAttachment', e.target.checked || undefined)}
            />
            <span>Has attachment</span>
          </label>
        </div>

        <div className="em-adv-search-actions">
          <button type="button" className="btn btn-ghost btn-xs" onClick={clear}>
            Clear
          </button>
          <div className="em-adv-actions-right">
            {onCreateFilter && (
              <Tip label="Save these criteria as an incoming filter">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => { onCreateFilter(q); setOpen(false); }}
                >
                  <Icon name="filter" size={12} />
                  <span>Create filter</span>
                </button>
              </Tip>
            )}
            <button type="button" className="btn btn-primary btn-xs" onClick={run}>
              <Icon name="search" size={12} />
              <span>Search</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
