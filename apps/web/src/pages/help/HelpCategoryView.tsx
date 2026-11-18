import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { AppHeader } from '../../components/AppHeader.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PageFooter } from '../../components/PageLayout.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { useTour } from '../../components/WalkthroughTour.js';
import type { HelpCategory, HelpArticle } from '@hudumika/types';
import './HelpCentre.css';

export function HelpCategoryView() {
  const { categoryKey } = useParams<{ categoryKey: string }>();
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const { startTour } = useTour();

  useEffect(() => {
    if (!categoryKey) return;
    setLoading(true);

    Promise.all([
      apiFetch('/v1/help/categories'),
      apiFetch(`/v1/help/articles?category=${encodeURIComponent(categoryKey)}`),
    ])
      .then(([catRes, artRes]) => {
        const found = (catRes.categories || []).find((c: HelpCategory) => c.key === categoryKey);
        setCategory(found || null);
        setArticles(artRes.articles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [categoryKey]);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-main">
          <AppHeader />
          <div className="help-scroll-body">
            <main className="help-page-layout">
              <div className="help-loading" style={{ padding: 48, textAlign: 'center' }}>
                Loading category guides…
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  const title = category?.title || categoryKey?.replace(/-/g, ' ') || 'Category Guides';

  return (
    <div className="app-shell">
      <div className="app-main">
        <AppHeader />
        <div className="help-scroll-body">
          <main className="help-page-layout">
            <PageHeader
              crumbs={['Help Centre', title]}
              titlePlain={title}
              subtitle={category?.shortDescription}
              actions={
                <Button asChild variant="outline">
                  <Link to="/help">
                    <Icon name="arrowLeft" size={14} /> All Categories
                  </Link>
                </Button>
              }
            />

            <section className="help-article-list">
              {articles.length === 0 ? (
                <div className="help-empty-search">
                  <Icon name="folder" size={36} />
                  <h3>No articles in this category yet</h3>
                  <p>Check back shortly or explore our workspace quickstart guide.</p>
                  <Button asChild variant="default">
                    <Link to="/help">Browse All Help Topics</Link>
                  </Button>
                </div>
              ) : (
                articles.map((art) => (
                  <div key={art.slug} className="help-article-card">
                    <div className="help-article-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {art.appId && <Badge variant="outline">{art.appId.toUpperCase()}</Badge>}
                        {art.tourId && (
                          <Badge variant="brand" className="cursor-pointer" onClick={() => {
                            if (art.tourId) startTour(art.tourId);
                          }}>
                            <Icon name="zap" size={10} /> Has Tour
                          </Badge>
                        )}
                      </div>
                      <h3 className="help-article-title">
                        <Link to={`/help/article/${art.slug}`}>{art.title}</Link>
                      </h3>
                      <p className="help-article-summary">{art.summary}</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {art.tourId && (
                        <button
                          type="button"
                          onClick={() => {
                            if (art.tourId) startTour(art.tourId);
                          }}
                          className="help-tour-btn"
                        >
                          Tour
                        </button>
                      )}
                      <Link to={`/help/article/${art.slug}`} className="help-article-arrow">
                        <Icon name="arrowRight" size={16} />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </section>

            <PageFooter />
          </main>
        </div>
      </div>
    </div>
  );
}
