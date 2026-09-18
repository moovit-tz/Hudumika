import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { BlissSearch } from '../../components/BlissSearch.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
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

  const viewTabs: { id: 'customers' | 'team'; label: string; shortLabel: string; icon: 'inbox' | 'chatBubble' }[] = [
    { id: 'customers', label: 'Customer Conversations', shortLabel: 'Conversations', icon: 'inbox' },
    { id: 'team', label: 'Team Chat', shortLabel: 'Team Chat', icon: 'chatBubble' },
  ];

  return (
    <div className="bliss-inbox-card">
      <div className="bliss-inbox-header">
        <div className="bliss-inbox-header-main">
          <div className="bliss-inbox-title-group">
            <span className="bliss-inbox-title">Support Center</span>
          </div>
          <div className="bliss-inbox-tabs-wrap">
            <Tabs value={view} onValueChange={v => setView(v as 'customers' | 'team')} className="bliss-inbox-tabs">
              <TabsList className="bliss-inbox-tabs-list">
                {viewTabs.map(t => (
                  <TabsTrigger key={t.id} value={t.id} className="bliss-inbox-tab-trigger">
                    <Icon name={t.icon} size={16} />
                    <span className="bliss-inbox-tab-label-full">{t.label}</span>
                    <span className="bliss-inbox-tab-label-short">{t.shortLabel}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="bliss-inbox-header-right">
          {/* Desktop already has a search box inside the ticket list itself
              (Support.tsx's own header) — on mobile that pane isn't always
              on screen (a thread or Team Chat can fill it), so this is the
              one place search is reachable regardless of what's open, and
              it searches across tickets, chats and the KB, not just tickets. */}
          {isMobile && (
            <Tip label="Search Bliss">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="bliss-inbox-action-btn"
                aria-label="Search Bliss"
              >
                <Icon name="search" size={15} />
              </button>
            </Tip>
          )}
          {view === 'customers' && (
            <div className="bliss-inbox-layout-switch">
              <Tip label="Chat layout">
                <button
                  type="button"
                  aria-label="Chat layout"
                  onClick={() => setViewMode('chat')}
                  className={`bliss-inbox-layout-btn ${viewMode === 'chat' ? 'is-active' : ''}`}
                >
                  <Icon name="layoutSplit" size={14} />
                </button>
              </Tip>
              <Tip label="Table layout">
                <button
                  type="button"
                  aria-label="Table layout"
                  onClick={() => setViewMode('table')}
                  className={`bliss-inbox-layout-btn ${viewMode === 'table' ? 'is-active' : ''}`}
                >
                  <Icon name="layoutTable" size={14} />
                </button>
              </Tip>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--card-bg, var(--white))' }}>
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
