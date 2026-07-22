import React, { useState } from 'react';
import { Icon } from './Icon.js';
import './ComplyTopbar.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getUserFromToken(): { name: string; initials: string } {
  try {
    const token = localStorage.getItem('hudumika_token');
    if (!token) return { name: 'there', initials: '?' };
    const payload = JSON.parse(atob(token.split('.')[1]));
    const name: string =
      payload.name || payload.first_name || payload.email?.split('@')[0] || 'there';
    const initials = name
      .split(' ')
      .map((n: string) => n[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return { name, initials };
  } catch {
    return { name: 'there', initials: '?' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onMenuToggle: () => void;
}

export function ComplyTopbar({ onMenuToggle }: Props) {
  const [search, setSearch] = useState('');
  const { name, initials } = getUserFromToken();

  return (
    <header className="comply-topbar">

      {/* ── Left: hamburger + greeting ── */}
      <div className="comply-topbar-left">
        <button
          type="button"
          className="comply-topbar-hamburger"
          onClick={onMenuToggle}
          title="Toggle sidebar"
        >
          <Icon name="menu" size={18} strokeWidth={1.8} />
        </button>
        <div className="comply-topbar-greeting">
          <span className="comply-topbar-greeting-text">
            {getGreeting()},
          </span>
          <span className="comply-topbar-greeting-name">{name}!</span>
        </div>
      </div>

      {/* ── Center: pill search ── */}
      <div className="comply-topbar-search">
        <span className="comply-topbar-search-icon">
          <Icon name="search" size={15} strokeWidth={1.8} />
        </span>
        <input
          type="search"
          className="comply-topbar-search-input"
          placeholder="Search here..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search ComplyOS"
        />
      </div>

      {/* ── Right: icon actions + avatar ── */}
      <div className="comply-topbar-actions">
        <button type="button" className="comply-topbar-action-btn" title="Notifications">
          <Icon name="bell" size={16} strokeWidth={1.8} />
          <span className="comply-topbar-notif-dot" aria-hidden="true" />
        </button>
        <button type="button" className="comply-topbar-action-btn" title="Settings">
          <Icon name="settings" size={16} strokeWidth={1.8} />
        </button>
        <div className="comply-topbar-avatar" title={`Signed in as ${name}`}>
          {initials}
        </div>
      </div>

    </header>
  );
}
