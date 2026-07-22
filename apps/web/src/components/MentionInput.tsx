import React, { useState, useRef, useEffect } from 'react';

export interface MentionUser {
  id: string;
  name: string;
  role: string;
  avatar_initials?: string | null;
}

export interface Mention {
  user_id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (value: string, mentions: Mention[]) => void;
  users: MentionUser[];
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void;
}

const AV_COLORS = ['#e8461a', '#2563eb', '#059669', '#7c3aed', '#ca8a04', '#0891b2', '#be185d', '#9a3412'];
function avColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % AV_COLORS.length;
  return AV_COLORS[Math.abs(h)];
}
function avInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

export function MentionInput({ value, onChange, users, placeholder, disabled, onSubmit }: Props) {
  const [showDrop, setShowDrop]   = useState(false);
  const [query,    setQuery]      = useState('');
  const [atPos,    setAtPos]      = useState(-1);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mentions, setMentions]   = useState<Mention[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter users by current @query, cap at 7
  const filtered = (query
    ? users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()))
    : users
  ).slice(0, 7);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');

    if (lastAt !== -1) {
      const afterAt = before.slice(lastAt + 1);
      // Still in a mention token if no space/newline after @
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setAtPos(lastAt);
        setQuery(afterAt);
        setShowDrop(true);
        setActiveIdx(0);
        onChange(val, mentions);
        return;
      }
    }

    setShowDrop(false);
    setAtPos(-1);
    setQuery('');
    onChange(val, mentions);
  }

  function pick(user: MentionUser) {
    if (atPos === -1) return;
    const before   = value.slice(0, atPos);
    const after    = value.slice(atPos + 1 + query.length);
    const inserted = `@${user.name} `;
    const newVal   = before + inserted + after;
    const newMentions = [
      ...mentions.filter(m => m.user_id !== user.id),
      { user_id: user.id, name: user.name },
    ];
    setMentions(newMentions);
    setShowDrop(false);
    setAtPos(-1);
    setQuery('');
    onChange(newVal, newMentions);
    // Restore focus and cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showDrop && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[activeIdx]) pick(filtered[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setShowDrop(false);
        return;
      }
    }
    // Cmd/Ctrl+Enter submits
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  // Reset accumulated mentions when value is cleared externally
  useEffect(() => { if (!value) setMentions([]); }, [value]);

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Write a comment… type @ to mention someone'}
        disabled={disabled}
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          padding: '9px 11px',
          fontSize: 13,
          borderRadius: 7,
          border: '1px solid var(--border)',
          fontFamily: 'var(--font)',
          lineHeight: 1.55,
          outline: 'none',
          background: disabled ? 'var(--bg)' : 'var(--white)',
          color: 'var(--ink)',
          transition: 'border-color 0.15s',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
        onBlur={e   => { e.currentTarget.style.borderColor = 'var(--border)'; }}
      />

      {showDrop && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 4px)',
          left: 0,
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
          zIndex: 1000,
          minWidth: 230,
          maxHeight: 230,
          overflow: 'auto',
        }}>
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); pick(u); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 12px',
                background: i === activeIdx ? 'var(--bg)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: avColor(u.name), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>
                {u.avatar_initials || avInitials(u.name)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{u.role.toLowerCase().replace(/_/g, ' ')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
