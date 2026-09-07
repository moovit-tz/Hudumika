import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { BlissSearch } from '../../components/BlissSearch.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Support, type ViewMode } from '../Support.js';
import { Chat } from '../Chat.js';

/** Support Center — the real, backend-integrated ticket inbox (Support.tsx:
 *  real /v1/support/tickets data, the WhatsApp/Email/SMS/Reply broadcast
 *  composer, internal notes, live WS updates) plus Team Chat as a second
 *  tab. This file used to BE the inbox (a from-scratch, no-backend UI
 *  rebuilt from mock data more than once) while Support.tsx — the one with
 *  real data — sat orphaned, imported by nothing. Exactly backwards; this
 *  is now just the thin shell around the real component, plus the Team
 *  Chat tab.
 *  ?view=team switches to the internal Chat component (channels/DMs
 *  between staff, unrelated to any customer) — Team Chat's old standalone
 *  nav entry is gone, this is its only home now. */
export const BlissInbox: React.FC = () => {
  usePageSEO('Support Center', 'Every customer conversation and internal team chat, in one place.');
  const isMobile = useMediaQuery('(max-width: 899px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // Lifted out of Support.tsx's own ConvList toolbar, where it was a small,
  // easy-to-miss icon+chevron dropdown buried next to "Your inbox" — moved
  // up into this header, next to Settings, as an explicit two-way switcher.
  // Meaningless for Team Chat (no table layout there), so it only renders
  // for the Customer Conversations view.
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('bliss_tix_view') as ViewMode) || 'chat');
  // Derived straight from the URL, not mirrored into its own useState — a
  // ?view=team link (a search result, a notification, the sidebar's Live
  // Chat/Team Chat items) used to only take effect on first mount, since a
  // one-time useState initializer never re-read searchParams after that.
  // Clicking a chat search result while the Customers pane was open just
  // rewrote the URL with nothing on screen reacting to it.
  const viewParam = searchParams.get('view');
  const view: 'customers' | 'team' = viewParam === 'team' ? 'team' : 'customers';
  // ?view=livechat isn't a third tab (it's still the same Customer
  // Conversations pane) — it just deep-links Support.tsx's own channel
  // filter to Live Chat (IN_APP), oldest-waiting-first, the one thing the
  // old standalone Live Chat page did beyond "filter + reply".
  const isLivechatDeepLink = viewParam === 'livechat';

  function setView(next: 'customers' | 'team') {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next === 'team') params.set('view', 'team'); else params.delete('view');
      return params;
    });
  }

  const viewTabs: { id: 'customers' | 'team'; label: string; icon: 'inbox' | 'chatBubble' }[] = [
    { id: 'customers', label: 'Customer Conversations', icon: 'inbox' },
    { id: 'team', label: 'Team Chat', icon: 'chatBubble' },
  ];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)' }}>Support Center</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {viewTabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
                  background: view === t.id ? 'var(--teal-l)' : 'transparent',
                  color: view === t.id ? 'var(--teal)' : 'var(--ink2)',
                  fontSize: 12.5, fontWeight: 800, letterSpacing: '0.02em',
                }}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Desktop already has a search box inside the ticket list itself
              (Support.tsx's own header) — on mobile that pane isn't always
              on screen (a thread or Team Chat can fill it), so this is the
              one place search is reachable regardless of what's open, and
              it searches across tickets, chats and the KB, not just tickets. */}
          {isMobile && (
            <Tip label="Search Bliss">
              <button type="button" onClick={() => setSearchOpen(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: 'pointer' }}>
                <Icon name="search" size={15} />
              </button>
            </Tip>
          )}
          {view === 'customers' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Tip label="Chat layout">
                <button
                  type="button" aria-label="Chat layout"
                  onClick={() => setViewMode('chat')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26,
                    borderRadius: 'calc(var(--r) - 2px)', border: 'none', cursor: 'pointer',
                    background: viewMode === 'chat' ? 'var(--white)' : 'transparent',
                    color: viewMode === 'chat' ? 'var(--teal)' : 'var(--ink3)',
                    boxShadow: viewMode === 'chat' ? 'var(--elev-sm)' : 'none',
                  }}
                >
                  <Icon name="layoutSplit" size={14} />
                </button>
              </Tip>
              <Tip label="Table layout">
                <button
                  type="button" aria-label="Table layout"
                  onClick={() => setViewMode('table')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26,
                    borderRadius: 'calc(var(--r) - 2px)', border: 'none', cursor: 'pointer',
                    background: viewMode === 'table' ? 'var(--white)' : 'transparent',
                    color: viewMode === 'table' ? 'var(--teal)' : 'var(--ink3)',
                    boxShadow: viewMode === 'table' ? 'var(--elev-sm)' : 'none',
                  }}
                >
                  <Icon name="layoutTable" size={14} />
                </button>
              </Tip>
            </div>
          )}
          {/* Routing/SLA/escalation rules live on their own real page
              (support_rules, previously orphaned) — this is the discoverable
              way to reach them from where an agent actually feels the need. */}
          <Tip label="Support routing & SLA rules">
            <Link to="/bliss/operational-mode" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
              <Icon name="settings" size={14} />
              Settings
            </Link>
          </Tip>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {view === 'team' ? <Chat /> : (
          <Support
            initialChannelFilter={isLivechatDeepLink ? 'inapp' : undefined} queueMode={isLivechatDeepLink}
            viewMode={viewMode} onViewModeChange={setViewMode}
          />
        )}
      </div>

      {searchOpen && <BlissSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
};
