import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import './Store.css';

interface AddonApp {
  id: string;
  name: string;
  developer: string;
  developer_name?: string;
  category: 'business' | 'productivity' | 'communication' | 'utility' | 'ai';
  rating: number;
  reviewsCount: number;
  installs: string;
  shortDesc: string;
  longDesc: string;
  features: string[];
  permissions: string[];
  iconUrl?: string;
}

// ── App icons (brand SVGs — always light-on-color, no theme sensitivity) ──
const APP_ICONS: Record<string, React.ReactNode> = {
  zoom: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#2D8CFF"/>
      <path d="M12 18C12 15.79 13.79 14 16 14H26C28.21 14 30 15.79 30 18V28C30 30.21 28.21 32 26 32H16C13.79 32 12 30.21 12 28V18Z" fill="white"/>
      <path d="M31.5 20.25L35.25 17.25C35.8 16.81 36.6 17.2 36.6 17.91V30.09C36.6 30.8 35.8 31.19 35.25 30.75L31.5 27.75V20.25Z" fill="white"/>
    </svg>
  ),
  docusign: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#092D74"/>
      <path d="M14 14H30V18H18V22H28V26H18V34H14V14Z" fill="#FFC72C"/>
      <circle cx="31" cy="31" r="3" fill="white"/>
    </svg>
  ),
  slack: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#4A154B"/>
      <circle cx="17" cy="17" r="3" fill="#36C5F0"/>
      <path d="M17 21H21V17C21 15.9 20.1 15 19 15C17.9 15 17 15.9 17 17V21Z" fill="#36C5F0"/>
      <circle cx="31" cy="17" r="3" fill="#2EB67D"/>
      <path d="M27 17V21H31C32.1 21 33 20.1 33 19C33 17.9 32.1 17 31 17H27Z" fill="#2EB67D"/>
      <circle cx="31" cy="31" r="3" fill="#E01E5A"/>
      <path d="M31 27H27V31C27 32.1 27.9 33 29 33C30.1 33 31 32.1 31 31V27Z" fill="#E01E5A"/>
      <circle cx="17" cy="31" r="3" fill="#ECB22E"/>
      <path d="M21 31V27H17C15.9 27 15 27.9 15 29C15 30.1 15.9 33 17 33H21Z" fill="#ECB22E"/>
    </svg>
  ),
  quickbooks: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#2CA01C"/>
      <path d="M14 24C14 18.48 18.48 14 24 14C29.52 14 34 18.48 34 24C34 29.52 29.52 34 24 34C18.48 34 14 29.52 14 24Z" fill="white" opacity="0.3"/>
      <path d="M20 20H28V28H20V20Z" fill="white"/>
    </svg>
  ),
  mailchimp: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#FFE01B"/>
      <path d="M24 12C17.37 12 12 17.37 12 24C12 30.63 17.37 36 24 36C30.63 36 36 30.63 36 24C36 17.37 30.63 12 24 12ZM20 20C21.1 20 22 20.9 22 22C22 23.1 21.1 24 20 24C18.9 24 18 23.1 18 22C18 20.9 18.9 20 20 20ZM28 28C26 31 22 31 20 28H28Z" fill="black"/>
    </svg>
  ),
  asana: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#FC636B"/>
      <circle cx="24" cy="18" r="4" fill="white"/>
      <circle cx="18" cy="28" r="4" fill="white"/>
      <circle cx="30" cy="28" r="4" fill="white"/>
    </svg>
  ),
  trello: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#0079BF"/>
      <rect x="14" y="14" width="8" height="18" rx="2" fill="white"/>
      <rect x="26" y="14" width="8" height="12" rx="2" fill="white"/>
    </svg>
  ),
  powerbi: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#F2C811"/>
      <rect x="14" y="26" width="5" height="8" rx="1" fill="#F2C811" stroke="black" strokeWidth="2"/>
      <rect x="21" y="20" width="5" height="14" rx="1" fill="#F2C811" stroke="black" strokeWidth="2"/>
      <rect x="28" y="14" width="5" height="20" rx="1" fill="#F2C811" stroke="black" strokeWidth="2"/>
    </svg>
  ),
  hubspot: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
      <rect width="48" height="48" rx="10" fill="#FF7A59"/>
      <circle cx="24" cy="24" r="6" stroke="white" strokeWidth="3" fill="none"/>
      <circle cx="24" cy="14" r="3" fill="white"/>
      <circle cx="14" cy="29" r="3" fill="white"/>
      <circle cx="34" cy="29" r="3" fill="white"/>
      <line x1="24" y1="17" x2="24" y2="21" stroke="white" strokeWidth="3"/>
      <line x1="16.5" y1="27.5" x2="20.5" y2="25.5" stroke="white" strokeWidth="3"/>
      <line x1="31.5" y1="27.5" x2="27.5" y2="25.5" stroke="white" strokeWidth="3"/>
    </svg>
  ),
};

// Apps will be loaded dynamically from the API

const SAMPLE_REVIEWS = [
  { author: 'Sarah Johnson', date: 'June 15, 2026', rating: 5, comment: 'Extremely easy to set up. Literally took 2 clicks to integrate with our workflow, and now we can trigger calls immediately. Highly recommended!' },
  { author: 'David Kim', date: 'May 28, 2026', rating: 4, comment: 'Saves us a ton of time. The sync is reliable, though I wish we could customize the notification template slightly more. Still a solid 4 stars.' },
];

const RATING_BARS = [
  { stars: 5, pct: 75 }, { stars: 4, pct: 15 }, { stars: 3, pct: 6 },
  { stars: 2, pct: 3  }, { stars: 1, pct: 1  },
];

// ── Component ────────────────────────────────────────────────────
export const Store: React.FC = () => {
  const [searchParams] = useSearchParams();
  const activeCategory = searchParams.get('cat') ?? 'all';
  const [apps, setApps] = useState<AddonApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [installedApps, setInstalledApps] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<AddonApp | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'reviews' | 'permissions'>('overview');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('hudumika_installed_addons');
    if (saved) { try { setInstalledApps(JSON.parse(saved)); } catch { /* ignore */ } }
    
    apiFetch('/v1/store/apps').then(data => {
      setApps(data);
      setAppsLoading(false);
    }).catch(e => {
      console.error(e);
      setAppsLoading(false);
    });
  }, []);

  useEffect(() => { setSelectedApp(null); }, [activeCategory]);

  function saveInstalled(list: string[]) {
    setInstalledApps(list);
    localStorage.setItem('hudumika_installed_addons', JSON.stringify(list));
  }

  function triggerToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const filteredApps = useMemo(() =>
    apps.filter(app => {
      const matchesCat = activeCategory === 'all' || app.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = app.name.toLowerCase().includes(q) ||
        (app.developer || '').toLowerCase().includes(q) ||
        (app.shortDesc || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    }),
  [activeCategory, searchQuery, apps]);

  function handleInstallClick(app: AddonApp) {
    if (installedApps.includes(app.id)) {
      saveInstalled(installedApps.filter(id => id !== app.id));
      triggerToast(`Uninstalled ${app.name} successfully.`);
      if (selectedApp?.id === app.id) setSelectedApp(null);
    } else {
      setShowConsent(true);
    }
  }

  function confirmInstall() {
    if (!selectedApp) return;
    saveInstalled([...installedApps, selectedApp.id]);
    setShowConsent(false);
    triggerToast(`Installed ${selectedApp.name} successfully! Integration is now active.`);
  }

  const sectionTitle = activeCategory === 'all'
    ? 'Recommended Add-ons & Apps'
    : `${activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} Solutions`;

  return (
    <div className="store-root">

      {/* ── Main ── */}
      <div className="store-main">
        {/* Search bar */}
        <div className="store-topbar">
          <div className="store-search-wrap">
            <Icon name="search" size={16} color="var(--ink3)" />
            <input
              type="search"
              className="store-search-input"
              placeholder="Search apps, integrations, utilities..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="store-search-clear" title="Clear search" onClick={() => setSearchQuery('')}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <div className="store-verified-note">
            <Icon name="shield" size={14} color="var(--green)" />
            <span>All apps are <strong>verified secure</strong> by Hudumika Security.</span>
          </div>
        </div>

        {/* Body */}
        <div className="store-body">
          {/* Hero banner */}
          {activeCategory === 'all' && !searchQuery && (
            <div className="store-hero">
              <div className="store-hero-ring1" />
              <div className="store-hero-ring2" />
              <div className="store-hero-content">
                <span className="store-hero-badge">Featured Integration</span>
                <h2 className="store-hero-title">Zoom Meetings for Hudumika</h2>
                <p className="store-hero-desc">
                  Schedule meetings, invite clients, and run video calls directly from your shipments, leads, and customer profiles. Sync invites and calendars in one click.
                </p>
                <button
                  type="button"
                  className="store-hero-btn"
                  onClick={() => setSelectedApp(apps.find(a => a.name.includes('Zoom')) ?? apps[0] ?? null)}
                >
                  Explore Integration
                </button>
              </div>
              <div className="store-hero-icon-wrap">
                <div className="store-hero-icon-box">{APP_ICONS.zoom}</div>
              </div>
            </div>
          )}

          {/* Section header */}
          <div className="store-section-header">
            <h3 className="store-section-title">{sectionTitle}</h3>
            <span className="store-section-count">{filteredApps.length} results</span>
          </div>

          {/* App grid */}
          <div className="store-grid">
            {appsLoading ? (
              <div style={{ padding: '40px', color: 'var(--ink3)' }}>Loading apps...</div>
            ) : filteredApps.length === 0 ? (
              <div style={{ padding: '40px', color: 'var(--ink3)' }}>No apps found in this category.</div>
            ) : filteredApps.map(app => {
              const isInstalled = installedApps.includes(app.id);
              const iconNode = app.iconUrl ? <img src={app.iconUrl} alt="icon" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} /> : (APP_ICONS[app.id] || <Icon name="package" size={48} color="#2563eb" />);
              return (
                <div
                  key={app.id}
                  className="store-app-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedApp(app); setActiveDetailTab('overview'); }}
                  onKeyDown={e => { if (e.key === 'Enter') { setSelectedApp(app); setActiveDetailTab('overview'); } }}
                >
                  <div>
                    <div className="store-app-card-top">
                      <div className="store-app-icon-wrap">{iconNode}</div>
                      <span className={`store-badge ${isInstalled ? 'store-badge-installed' : 'store-badge-verified'}`}>
                        {isInstalled ? 'Installed' : 'Verified'}
                      </span>
                    </div>
                    <h4 className="store-app-name">{app.name}</h4>
                    <div className="store-app-dev">By {app.developer_name || app.developer}</div>
                    <div className="store-app-meta">
                      <span className="store-app-rating" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{app.rating} <Icon name="star" size={11} duotone color="#f59e0b" /></span>
                      <span className="store-app-sep">|</span>
                      <span className="store-app-installs">{app.installs} installs</span>
                    </div>
                    <p className="store-app-desc">{app.shortDesc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── App Detail Modal ── */}
      {selectedApp && (
        <div
          className="store-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={selectedApp.name}
          onClick={() => setSelectedApp(null)}
        >
          <div className="store-detail-modal" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="store-detail-header">
              <div className="store-detail-app-info">
                <div className="store-detail-app-icon">
                  {selectedApp.iconUrl ? <img src={selectedApp.iconUrl} alt="icon" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} /> : (APP_ICONS[selectedApp.id] || <Icon name="package" size={48} color="#2563eb" />)}
                </div>
                <div>
                  <h3 className="store-detail-name">{selectedApp.name}</h3>
                  <div className="store-detail-dev">By {selectedApp.developer_name || selectedApp.developer}</div>
                  <div className="store-detail-meta">
                    <span className="store-detail-rating" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{selectedApp.rating} <Icon name="star" size={12} duotone color="#f59e0b" /></span>
                    <span className="store-detail-sep">|</span>
                    <span className="store-detail-reviews">{selectedApp.reviewsCount} reviews</span>
                    <span className="store-detail-sep">|</span>
                    <span className="store-detail-reviews">{selectedApp.installs} installs</span>
                  </div>
                </div>
              </div>
              <div className="store-detail-actions">
                {installedApps.includes(selectedApp.id) ? (
                  <button type="button" className="store-uninstall-btn" onClick={() => handleInstallClick(selectedApp)}>
                    Uninstall
                  </button>
                ) : (
                  <button type="button" className="store-install-btn" onClick={() => handleInstallClick(selectedApp)}>
                    Install Add-on
                  </button>
                )}
                <button type="button" className="store-close-btn" title="Close" onClick={() => setSelectedApp(null)}>
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="store-detail-tabs">
              {(['overview', 'reviews', 'permissions'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`store-tab-btn${activeDetailTab === tab ? ' active' : ''}`}
                  onClick={() => setActiveDetailTab(tab)}
                >
                  {tab === 'permissions' ? 'Permissions & Privacy' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="store-detail-body">

              {activeDetailTab === 'overview' && (
                <div>
                  <h4 className="store-detail-h4">Description</h4>
                  <p className="store-detail-p">{selectedApp.longDesc}</p>
                  <h4 className="store-detail-h4">Key Features</h4>
                  <ul className="store-detail-features">
                    {selectedApp.features.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  <div className="store-secure-box">
                    <Icon name="shield" size={18} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div className="store-secure-title">Secure Integration</div>
                      <div className="store-secure-desc">
                        This app uses OAuth 2.0 to access your account securely. It will never see your password, and you can revoke access at any time from your admin panel.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'reviews' && (
                <div>
                  <div className="store-reviews-header">
                    <div className="store-rating-big">
                      <div className="store-rating-num">{selectedApp.rating}</div>
                      <div className="store-rating-stars" style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={13} duotone color="#f59e0b" />)}
                      </div>
                      <div className="store-rating-total">{selectedApp.reviewsCount} reviews</div>
                    </div>
                    <div className="store-rating-bars">
                      {RATING_BARS.map(r => (
                        <div key={r.stars} className="store-rating-bar-row">
                          <span className="store-rating-bar-label">{r.stars}</span>
                          <div className="store-rating-bar-track">
                            <div className={`store-rating-bar-fill store-rating-bar-fill--${r.pct}`} />
                          </div>
                          <span className="store-rating-bar-pct">{r.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="store-review-list">
                    {SAMPLE_REVIEWS.map((rev, i) => (
                      <div key={i} className="store-review-item">
                        <div className="store-review-meta">
                          <span className="store-review-author">{rev.author}</span>
                          <span className="store-review-date">{rev.date}</span>
                        </div>
                        <div className="store-review-stars" style={{ display: 'flex', gap: 2 }}>
                          {Array.from({ length: 5 }, (_, si) => <Icon key={si} name="star" size={12} duotone={si < rev.rating} color={si < rev.rating ? '#f59e0b' : 'var(--border2)'} />)}
                        </div>
                        <p className="store-review-text">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeDetailTab === 'permissions' && (
                <div>
                  <h4 className="store-detail-h4">Required Access Scopes</h4>
                  <p className="store-perm-intro">This add-on requires permission to access the following data in your Hudumika account:</p>
                  <div className="store-perm-list">
                    {selectedApp.permissions.map((p, i) => (
                      <div key={i} className="store-perm-item">
                        <Icon name="checkCircle" size={15} color="#8b5cf6" style={{ marginTop: 2 }} />
                        <span className="store-perm-text">{p}</span>
                      </div>
                    ))}
                  </div>
                  <div className="store-privacy-box">
                    <strong>Developer Privacy Agreement:</strong> The developer of this app ({selectedApp.developer_name || selectedApp.developer}) has agreed to the Hudumika Marketplace Developer Terms, including data protection policies.
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Consent dialog ── */}
      {showConsent && selectedApp && (
        <div className="store-consent-overlay">
          <div className="store-consent-dialog">
            <div className="store-consent-brand">
              <span className="store-consent-brand-name">Hudumika</span>
              <span className="store-consent-arrow">→</span>
              <div className="store-consent-icon">
                {selectedApp.iconUrl ? <img src={selectedApp.iconUrl} alt="icon" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} /> : (APP_ICONS[selectedApp.id] || <Icon name="package" size={48} color="#2563eb" />)}
              </div>
            </div>
            <h3 className="store-consent-title">Grant Permissions</h3>
            <p className="store-consent-desc">
              <strong>{selectedApp.name}</strong> wants to access your Hudumika account. This will allow the integration to function.
            </p>
            <div className="store-consent-scopes">
              {selectedApp.permissions.map((p, i) => (
                <div key={i} className="store-consent-scope-item">
                  <Icon name="check" size={14} color="#8b5cf6" className="store-consent-scope-check" />
                  <span className="store-consent-scope-text">{p}</span>
                </div>
              ))}
            </div>
            <div className="store-consent-actions">
              <button type="button" className="btn btn-secondary store-consent-cancel-btn" onClick={() => setShowConsent(false)}>
                Cancel
              </button>
              <button type="button" className="store-consent-allow-btn" onClick={confirmInstall}>
                Allow & Install
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="store-toast">
          <Icon name="checkCircle" size={16} color="var(--green)" />
          {toast}
        </div>
      )}

    </div>
  );
};
export default Store;
