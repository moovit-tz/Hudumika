import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { AppHeader } from '../../components/AppHeader.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PageFooter } from '../../components/PageLayout.js';
import { Card } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { useTour } from '../../components/WalkthroughTour.js';
import type { HelpCategory, HelpArticle } from '@hudumika/types';
import './HelpCentre.css';

export function HelpCentreHome() {
  const [categories, setCategories] = useState<HelpCategory[]>([]);
  const [popularArticles, setPopularArticles] = useState<HelpArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HelpArticle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();
  const { startTour } = useTour();

  useEffect(() => {
    let mounted = true;
    apiFetch('/v1/help/categories')
      .then(res => { if (mounted) setCategories(res.categories || []); })
      .catch(() => {});

    apiFetch('/v1/help/articles')
      .then(res => { if (mounted) setPopularArticles((res.articles || []).slice(0, 5)); })
      .catch(() => {});

    return () => { mounted = false; };
  }, []);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    apiFetch(`/v1/help/articles?query=${encodeURIComponent(q)}`)
      .then(res => { setSearchResults(res.articles || []); })
      .catch(() => setSearchResults([]))
      .finally(() => setIsSearching(false));
  };

  return (
    <div className="app-shell">
      <div className="app-main">
        <AppHeader />
        <div className="help-scroll-body">
          <main className="help-page-layout">
            {/* Uber Help-style Hero Section */}
            <section className="help-hero">
              <div className="help-hero-content">
                <Badge variant="outline" className="help-hero-badge">
                  <Icon name="compass" size={13} /> Hudumika Help Centre & Guides
                </Badge>
                <h1 className="help-hero-title">How can we help you today?</h1>
                <p className="help-hero-sub">
                  Explore personalized onboarding paths, deep-dive application workflows, interactive in-app tours, and troubleshooting.
                </p>

                {/* Hero Search Box */}
                <div className="help-search-container">
                  <Icon name="search" size={18} className="help-search-icon" />
                  <input
                    type="search"
                    placeholder="Search by topic, app (ClearOS, FinOps, Ondi), or issue ('TRA fiscalization', 'customs filing')..."
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    className="help-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearch('')}
                      className="help-search-clear"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* If Search Active: Show Search Results */}
            {searchQuery.trim().length > 0 ? (
              <section className="help-results-section">
                <div className="help-section-header">
                  <h2>Search results for &ldquo;{searchQuery}&rdquo;</h2>
                  <span className="help-results-count">{searchResults.length} articles found</span>
                </div>

                {isSearching ? (
                  <div className="help-loading">Searching articles and guides…</div>
                ) : searchResults.length === 0 ? (
                  <div className="help-empty-search">
                    <Icon name="alertCircle" size={32} />
                    <h3>No articles matching &ldquo;{searchQuery}&rdquo;</h3>
                    <p>Try searching by app name, feature, or create a ticket with our support specialists.</p>
                    <Button asChild variant="outline">
                      <Link to="/support/tickets">Contact Support Team</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="help-article-list">
                    {searchResults.map(art => (
                      <Link to={`/help/article/${art.slug}`} key={art.slug} className="help-article-card">
                        <div className="help-article-main">
                          <span className="help-article-category">{art.category.replace(/-/g, ' ')}</span>
                          <h3 className="help-article-title">{art.title}</h3>
                          <p className="help-article-summary">{art.summary}</p>
                        </div>
                        <div className="help-article-arrow">
                          <Icon name="arrowRight" size={16} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* Getting Started Callout Banner */}
                <section className="help-getting-started-banner">
                  <div className="help-banner-icon">
                    <Icon name="compass" size={28} />
                  </div>
                  <div className="help-banner-text">
                    <h3>Setting up a new workspace or joining a team?</h3>
                    <p>Follow our personalized checklist to configure branding, invite colleagues, and launch your first real shipment or invoice.</p>
                  </div>
                  <div className="help-banner-actions">
                    <Button asChild variant="default">
                      <Link to="/welcome">View Getting Started Checklist</Link>
                    </Button>
                  </div>
                </section>

                {/* Categorized Product & Audience Grid (Uber Help style) */}
                <section className="help-categories-section">
                  <div className="help-section-header">
                    <h2>Browse help by category</h2>
                    <p>Guidance organized by role, department, and product line.</p>
                  </div>

                  <div className="help-categories-grid">
                    {categories.map(cat => (
                      <Link to={`/help/category/${cat.key}`} key={cat.key} className="help-cat-card">
                        <div className="help-cat-icon-box">
                          <Icon name={cat.icon as any || 'folder'} size={22} />
                        </div>
                        <div className="help-cat-body">
                          <div className="help-cat-top">
                            <h3 className="help-cat-title">{cat.title}</h3>
                            {cat.badge && <Badge variant="secondary">{cat.badge}</Badge>}
                          </div>
                          <p className="help-cat-desc">{cat.shortDescription}</p>
                        </div>
                        <div className="help-cat-footer">
                          <span>Explore guides</span>
                          <Icon name="chevronRight" size={14} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>

                {/* Popular Guides & In-App Tours */}
                <section className="help-popular-section">
                  <div className="help-section-header">
                    <h2>Essential Guides & Walkthroughs</h2>
                    <p>Our most frequently referenced instructions across live tenant workflows.</p>
                  </div>

                  <div className="help-popular-grid">
                    {popularArticles.map(art => (
                      <Card key={art.slug} className="help-popular-card">
                        <div className="help-popular-head">
                          <Badge variant="outline">{art.appId ? art.appId.toUpperCase() : art.category}</Badge>
                          {art.tourId && (
                            <Badge variant="brand" className="cursor-pointer" onClick={(e) => {
                              e.preventDefault();
                              if (art.tourId) startTour(art.tourId);
                            }}>
                              <Icon name="zap" size={11} /> Interactive Tour
                            </Badge>
                          )}
                        </div>
                        <h3 className="help-popular-title">
                          <Link to={`/help/article/${art.slug}`}>{art.title}</Link>
                        </h3>
                        <p className="help-popular-snippet">{art.summary}</p>
                        <div className="help-popular-footer">
                          <Link to={`/help/article/${art.slug}`} className="help-read-link">
                            Read guide <Icon name="arrowRight" size={13} />
                          </Link>
                          {art.tourId && (
                            <button
                              type="button"
                              onClick={() => {
                                if (art.tourId) startTour(art.tourId);
                              }}
                              className="help-tour-btn"
                            >
                              Launch Tour
                            </button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>

                {/* Escalation to Support */}
                <section className="help-support-bar">
                  <div className="help-support-info">
                    <Icon name="headphones" size={24} />
                    <div>
                      <h4>Can&rsquo;t find what you need?</h4>
                      <p>Our technical team and freight compliance specialists are available to assist.</p>
                    </div>
                  </div>
                  <Button asChild variant="outline">
                    <Link to="/support/tickets">Open a Support Ticket</Link>
                  </Button>
                </section>
              </>
            )}

            <PageFooter />
          </main>
        </div>
      </div>
    </div>
  );
}
