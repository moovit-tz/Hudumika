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
 * Gmail's own Advanced Search form — From/To/Subject/Has the words/Doesn't
 * have/Size/Date within/Search scope/Has attachment, all independently
 * combinable. `onSearch` runs the query against the current folder view;
 * `onCreateFilter` hands the exact same criteria to the Filters feature so
 * "Create filter" persists what "Search" just ran, matching Gmail's own
 * dual-purpose form.
 */
export function AdvancedEmailSearch({ labelDefs, onSearch, onCreateFilter }: {
  labelDefs: { name: string }[];
  onSearch: (q: AdvancedSearchQuery) => void;
  onCreateFilter?: (q: AdvancedSearchQuery) => void;
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label="Advanced search">
        <PopoverTrigger asChild>
          <button type="button" className="em-icon-btn em-icon-btn--ghost">
            <Icon name="chevronDown" size={14} />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="em-adv-search">
        <div className="em-adv-search-row">
          <label>From</label>
          <input className="em-compose-input em-settings-input" value={q.from ?? ''} onChange={e => set('from', e.target.value || undefined)} />
        </div>
        <div className="em-adv-search-row">
          <label>To</label>
          <input className="em-compose-input em-settings-input" value={q.to ?? ''} onChange={e => set('to', e.target.value || undefined)} />
        </div>
        <div className="em-adv-search-row">
          <label>Subject</label>
          <input className="em-compose-input em-settings-input" value={q.subject ?? ''} onChange={e => set('subject', e.target.value || undefined)} />
        </div>
        <div className="em-adv-search-row">
          <label>Has the words</label>
          <input className="em-compose-input em-settings-input" value={q.hasWords ?? ''} onChange={e => set('hasWords', e.target.value || undefined)} />
        </div>
        <div className="em-adv-search-row">
          <label>Doesn't have</label>
          <input className="em-compose-input em-settings-input" value={q.doesntHave ?? ''} onChange={e => set('doesntHave', e.target.value || undefined)} />
        </div>
        <div className="em-adv-search-row">
          <label>Size</label>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            <Select value={q.sizeCmp ?? '__none__'} onValueChange={v => set('sizeCmp', v === '__none__' ? undefined : v as any)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="doesn't matter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Doesn't matter</SelectItem>
                <SelectItem value="gt">Greater than</SelectItem>
                <SelectItem value="lt">Less than</SelectItem>
              </SelectContent>
            </Select>
            <input className="em-compose-input em-settings-input" type="number" min={0} style={{ width: 70 }}
              value={q.sizeMb ?? ''} onChange={e => set('sizeMb', e.target.value ? Number(e.target.value) : undefined)} disabled={!q.sizeCmp} />
            <span className="em-settings-hint" style={{ margin: 0, alignSelf: 'center' }}>MB</span>
          </div>
        </div>
        <div className="em-adv-search-row">
          <label>Date within</label>
          <Select value={q.dateWithin ?? '__any__'} onValueChange={v => set('dateWithin', v === '__any__' ? undefined : v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_WITHIN_OPTIONS.map(o => <SelectItem key={o.value || 'any'} value={o.value || '__any__'}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="em-adv-search-row">
          <label>After</label>
          <DatePicker date={q.dateAfter ? new Date(q.dateAfter) : undefined} onChange={d => set('dateAfter', d ? d.toISOString() : undefined)} placeholder="Any date" />
        </div>
        <div className="em-adv-search-row">
          <label>Before</label>
          <DatePicker date={q.dateBefore ? new Date(q.dateBefore) : undefined} onChange={d => set('dateBefore', d ? d.toISOString() : undefined)} placeholder="Any date" />
        </div>
        <div className="em-adv-search-row">
          <label>Search</label>
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
        <label className="em-compose-receipt-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={!!q.hasAttachment} onChange={e => set('hasAttachment', e.target.checked || undefined)} />
          Has attachment
        </label>
        <div className="em-adv-search-actions">
          <button type="button" className="em-text-btn" onClick={clear}>Clear</button>
          <div style={{ flex: 1 }} />
          {onCreateFilter && (
            <Tip label="Save these criteria as a filter">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onCreateFilter(q); setOpen(false); }}>Create filter</button>
            </Tip>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={run}>Search</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
