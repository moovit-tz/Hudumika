import React, { useState, useEffect } from 'react';
import { Icon } from './Icon.js';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.js';
import { Button } from './ui/button.js';

/* ── Reminder picker — a real datetime the user chooses, via the shared
   Popover primitive rather than a hand-rolled absolutely-positioned div.
   Shared by Notes and Tasks (and the companion sidebar's mini Tasks panel)
   — one picker, one interaction, wherever a reminder can be set. ── */
export const ReminderPicker: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra class on the trigger button — callers style it to match their own icon-button convention. */
  triggerClassName?: string;
  /** Inline style fallback for callers with no shared icon-button class in scope. */
  triggerStyle?: React.CSSProperties;
}> = ({ value, onChange, open, onOpenChange, triggerClassName, triggerStyle }) => {
  const [draft, setDraft] = useState(() => (value ? value.slice(0, 16) : ''));

  useEffect(() => { if (open) setDraft(value ? value.slice(0, 16) : ''); }, [open, value]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={triggerClassName ? `${triggerClassName}${value ? ' active' : ''}` : (triggerStyle ? undefined : `notes-icon-btn${value ? ' active' : ''}`)}
          style={triggerStyle ? { ...triggerStyle, color: value ? 'var(--teal)' : triggerStyle.color } : undefined}
          title={value ? 'Change reminder' : 'Add reminder'}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name="clock" size={17} />
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-64 p-3">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
          Remind me
        </div>
        <input
          type="datetime-local"
          className="input-field"
          style={{ width: '100%', boxSizing: 'border-box' }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          {value ? (
            <Button size="xs" variant="ghost" onClick={() => { onChange(null); onOpenChange(false); }}>Remove</Button>
          ) : <span />}
          <Button
            size="xs"
            disabled={!draft}
            onClick={() => {
              if (!draft) return;
              onChange(new Date(draft).toISOString());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReminderPicker;
