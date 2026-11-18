import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { AppHeader } from '../../components/AppHeader.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PageFooter } from '../../components/PageLayout.js';
import { Card } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { useTour } from '../../components/WalkthroughTour.js';
import type { HelpArticle } from '@hudumika/types';
import './HelpCentre.css';

export function HelpArticleView() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { startTour } = useTour();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiFetch(`/v1/help/articles/${slug}`)
      .then(res => {
        setArticle(res.article || null);
        setError('');
      })
      .catch(err => {
        setError(err.message || 'Article could not be loaded.');
        setArticle(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-main">
          <AppHeader />
          <div className="help-scroll-body">
            <main className="help-page-layout">
              <div className="help-loading" style={{ padding: 48, textAlign: 'center' }}>
                Loading article guide…
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="app-shell">
        <div className="app-main">
          <AppHeader />
          <div className="help-scroll-body">
            <main className="help-page-layout">
              <div className="help-empty-search">
                <Icon name="alertCircle" size={36} />
                <h2>Article Not Found</h2>
                <p>{error || 'The requested guide does not exist or has been relocated.'}</p>
                <Button asChild variant="outline">
                  <Link to="/help">Back to Help Centre</Link>
                </Button>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        <AppHeader />
        <div className="help-scroll-body">
          <main className="help-page-layout">
            <PageHeader
              crumbs={['Help Centre', article.category.replace(/-/g, ' '), article.title]}
              titlePlain={article.title}
              actions={
                article.tourId ? (
                  <Button
                    onClick={() => {
                      if (article.tourId) startTour(article.tourId);
                    }}
                    style={{ background: 'var(--teal)', color: '#fff' }}
                  >
                    <Icon name="zap" size={14} /> Start Interactive Tour
                  </Button>
                ) : undefined
              }
            />

            <div className="help-article-container">
              {/* Main Content Column */}
              <div className="help-article-body-col">
                {/* Summary Hero */}
                <div className="help-article-summary-box">
                  <p>{article.summary}</p>
                  <div className="help-meta-tags">
                    <span className="help-meta-item">
                      <Icon name="user" size={13} /> Audience: <strong>{article.audience}</strong>
                    </span>
                    <span className="help-meta-item">
                      <Icon name="calendar" size={13} /> Verified: <strong>{article.lastVerified}</strong>
                    </span>
                    {article.appId && (
                      <span className="help-meta-item">
                        <Icon name="grid" size={13} /> App: <strong>{article.appId.toUpperCase()}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Prerequisites Box */}
                {article.prerequisites && article.prerequisites.length > 0 && (
                  <div className="help-prerequisites-card">
                    <h4>
                      <Icon name="checkCircle" size={16} /> Prerequisites & Access Requirements
                    </h4>
                    <ul>
                      {article.prerequisites.map((prereq, i) => (
                        <li key={i}>{prereq}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Numbered Steps */}
                {article.steps && article.steps.length > 0 && (
                  <div className="help-steps-block">
                    <h2>Step-by-step instructions</h2>
                    <div className="help-step-list">
                      {article.steps.map((st) => (
                        <div key={st.number} className="help-step-card">
                          <div className="help-step-num">{st.number}</div>
                          <div className="help-step-content">
                            <h3 className="help-step-title">{st.title}</h3>
                            <p className="help-step-instr">{st.instruction}</p>
                            {st.actionTarget && (
                              <div className="help-step-target-link">
                                <Link to={st.actionTarget} className="help-action-shortcut">
                                  Open screen <Icon name="externalLink" size={12} />
                                </Link>
                              </div>
                            )}
                            {st.tip && (
                              <div className="help-step-tip">
                                <Icon name="sparkle" size={14} />
                                <span>{st.tip}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expected Result */}
                {article.expectedResult && (
                  <div className="help-expected-result">
                    <h4>
                      <Icon name="award" size={18} /> Expected Outcome
                    </h4>
                    <p>{article.expectedResult}</p>
                  </div>
                )}

                {/* Troubleshooting / Common Failures */}
                {article.troubleshooting && article.troubleshooting.length > 0 && (
                  <div className="help-troubleshoot-block">
                    <h3>Common issues & resolutions</h3>
                    <div className="help-troubleshoot-list">
                      {article.troubleshooting.map((item, i) => (
                        <div key={i} className="help-troubleshoot-item">
                          <div className="help-troubleshoot-symptom">
                            <Icon name="alertTriangle" size={15} />
                            <strong>{item.symptom}</strong>
                          </div>
                          <p className="help-troubleshoot-res">{item.resolution}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar: Navigation, Tour Launch & Support */}
              <aside className="help-article-sidebar">
                {article.tourId && (
                  <Card className="help-tour-card">
                    <Icon name="compass" size={24} color="var(--teal)" />
                    <h4>Follow this in real time</h4>
                    <p>Launch an interactive spotlight overlay that guides your clicks directly on the screen.</p>
                    <Button
                      onClick={() => {
                        if (article.tourId) startTour(article.tourId);
                      }}
                      className="w-full"
                      style={{ background: 'var(--teal)', color: '#fff' }}
                    >
                      <Icon name="zap" size={14} /> Launch Tour
                    </Button>
                  </Card>
                )}

                <Card className="help-side-nav-card">
                  <h4>Category Guides</h4>
                  <Link to="/help" className="help-side-link">
                    <Icon name="arrowLeft" size={14} /> All Help Topics
                  </Link>
                  <Link to={`/help/category/${article.category}`} className="help-side-link">
                    More in {article.category.replace(/-/g, ' ')}
                  </Link>
                  <Link to="/welcome" className="help-side-link">
                    Workspace Getting Started
                  </Link>
                  <Link to="/support/tickets" className="help-side-link">
                    Contact Support Team
                  </Link>
                </Card>
              </aside>
            </div>

            <PageFooter />
          </main>
        </div>
      </div>
    </div>
  );
}
