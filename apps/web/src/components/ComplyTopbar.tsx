import React, { useState } from 'react';
import { Icon } from './Icon.js';
import { useAuth } from '../hooks/useAuth.js';
import { PersonAvatar } from './PersonAvatar.js';
import './ComplyTopbar.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onMenuToggle: () => void;
}

export function ComplyTopbar({ onMenuToggle }: Props) {
  const [search, setSearch] = useState('');
  // The token used to be decoded client-side just to read this — already
  // redundant even before the cookie migration made it impossible (an
  // httpOnly access token is invisible to JS): the same name is already
  // sitting in the signed-in user's own context.
  const { user } = useAuth();
  const name = user?.name || user?.email?.split('@')[0] || 'there';

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
        <div title={`Signed in as ${name}`}>
          <PersonAvatar userId={user?.id} name={name} size={36} />
        </div>
      </div>

    </header>
  );
}
