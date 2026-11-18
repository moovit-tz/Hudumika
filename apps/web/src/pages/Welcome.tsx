import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { PageFooter } from '../components/PageLayout.js';
import { AppHeader } from '../components/AppHeader.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon, type IconName } from '../components/Icon.js';
import { useTour } from '../components/WalkthroughTour.js';
import type { GettingStartedPhase } from '@hudumika/types';
import './Welcome.css';

export function Welcome() {
  const { user } = useAuth();
  const [phases, setPhases] = useState<GettingStartedPhase[]>([]);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { startTour } = useTour();

  const isCustomer = user?.role === 'CUSTOMER' || user?.role === 'ORG';
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_ADMIN';

  useEffect(() => {
    let live = true;
    setLoading(true);
    apiFetch('/v1/help/getting-started')
      .then(res => {
        if (!live) return;
        const fetchedPhases: GettingStartedPhase[] = res.phases || [];
        setPhases(fetchedPhases);

        // Auto-select first phase that has incomplete items
        const firstIncomplete = fetchedPhases.findIndex(p => p.steps.some((s: any) => !s.completed));
        setSelectedPhaseIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
      })
      .catch(err => {
        if (live) setError(err.message || 'Setup progress is unavailable.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, []);

  const currentPhase = phases[selectedPhaseIndex];
  const totalSteps = phases.reduce((acc, p) => acc + p.steps.length, 0);
  const completedSteps = phases.reduce((acc, p) => acc + p.steps.filter((s: any) => s.completed).length, 0);
  const overallPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="app-shell">
      <div className="app-main">
        <AppHeader />
        <div className="welcome-scroll">
          <main className="welcome-page">
            <PageHeader
              crumbs={['Workspace', 'Getting Started']}
              titlePlain={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`}
              titleEm="aboard"
              subtitle={
                isAdmin
                  ? 'Complete your workspace setup, invite your team, and verify readiness.'
                  : isCustomer
                  ? 'Accept consignments, track real-time cargo clearance, and review invoices.'
                  : 'Get oriented with your role, verify credentials, and tackle your first tasks.'
              }
              actions={
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button asChild variant="outline">
                    <Link to="/help">
                      <Icon name="compass" size={15} /> Help Centre
                    </Link>
                  </Button>
                  <Button asChild variant="default">
                    <Link to="/">
                      Open workspace <Icon name="arrowRight" size={15} />
                    </Link>
                  </Button>
                </div>
              }
            />

            <div className="welcome-grid">
              <div className="welcome-primary">
                {/* Getting Started Main Checklist Card */}
                <Card className="welcome-setup">
                  <div className="welcome-section-head">
                    <div>
                      <h2>Getting Started Progress</h2>
                      <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--ink3)' }}>
                        {completedSteps} of {totalSteps} verified milestones completed ({overallPercentage}%)
                      </p>
                    </div>
                    <Badge variant={overallPercentage === 100 ? 'success' : 'brand'}>
                      {overallPercentage === 100 ? 'Fully Operational' : 'In Progress'}
                    </Badge>
                  </div>

                  {loading && !error ? (
                    <SectionLoading label="Checking workspace records and verification signals…" />
                  ) : error ? (
                    <p role="alert" className="welcome-error">{error}</p>
                  ) : (
                    <div className="welcome-setup-grid">
                      {/* Left Phase Selector Nav */}
                      <nav aria-label="Setup phases">
                        {phases.map((phase, idx) => {
                          const phaseComplete = phase.steps.every((s: any) => s.completed);
                          const isCurrent = idx === selectedPhaseIndex;
                          return (
                            <button
                              key={phase.id}
                              aria-current={isCurrent ? 'step' : undefined}
                              onClick={() => setSelectedPhaseIndex(idx)}
                              data-ui-native-button=""
                            >
                              <span className={phaseComplete ? 'done' : ''}>
                                {phaseComplete ? <Icon name="check" size={18} /> : idx + 1}
                              </span>
                              <div>
                                <strong>{phase.title}</strong>
                                <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--ink3)' }}>
                                  ~{phase.estimatedMinutes} mins
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </nav>

                      {/* Right Active Phase Detail */}
                      {currentPhase && (
                        <section>
                          <span className="welcome-kicker">
                            Phase {selectedPhaseIndex + 1} · {currentPhase.steps.every((s: any) => s.completed) ? 'Complete' : 'Actions Needed'}
                          </span>
                          <h3>{currentPhase.title}</h3>
                          <p>{currentPhase.description}</p>

                          <div className="welcome-steps-expanded" style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0' }}>
                            {currentPhase.steps.map((st: any) => (
                              <div
                                key={st.id}
                                style={{
                                  background: st.completed ? 'var(--white)' : 'var(--bg)',
                                  border: `1px solid ${st.completed ? 'var(--teal-l)' : 'var(--border)'}`,
                                  borderRadius: 8,
                                  padding: '12px 16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: '50%',
                                      background: st.completed ? 'var(--teal)' : 'var(--border)',
                                      color: '#fff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {st.completed ? <Icon name="check" size={14} /> : <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                                  </div>
                                  <div>
                                    <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                                      {st.title}
                                    </h4>
                                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--ink3)' }}>
                                      {st.description}
                                    </p>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                  {st.tourId && (
                                    <button
                                      type="button"
                                      onClick={() => startTour(st.tourId)}
                                      style={{
                                        background: 'var(--teal-l)',
                                        color: 'var(--teal)',
                                        border: '1px solid rgba(11,114,100,0.2)',
                                        borderRadius: 6,
                                        padding: '5px 10px',
                                        fontSize: 11.5,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                    >
                                      <Icon name="zap" size={11} /> Tour
                                    </button>
                                  )}
                                  <Button asChild size="sm" variant={st.completed ? 'outline' : 'default'}>
                                    <Link to={st.href}>
                                      {st.completed ? 'Review' : 'Start'} <Icon name="arrowRight" size={12} />
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <p className="welcome-hint">
                            Checklist progress automatically refreshes when real records (e.g. shipments, users, tax codes) are created in your workspace.
                          </p>
                        </section>
                      )}
                    </div>
                  )}
                </Card>

                {/* Explore Hudumika Features Section */}
                <section>
                  <h2 className="welcome-learn-title">Explore Hudumika</h2>
                  <div className="welcome-learning">
                    {[
                      {
                        title: 'Customs Clearance (ClearOS)',
                        text: 'Manage import, export, and transit declarations with automated TANSAD verification.',
                        to: '/clearos/ops',
                        icon: 'truck' as const,
                        action: 'Open ClearOS',
                      },
                      {
                        title: 'Help Centre & Knowledge Base',
                        text: 'Search guides, understand compliance policies, and start interactive in-app tours.',
                        to: '/help',
                        icon: 'compass' as const,
                        action: 'Browse Help Centre',
                      },
                      {
                        title: 'Workflow Studio Automations',
                        text: 'Build automated triggers and notifications linking logistics, billing, and CRM.',
                        to: '/studio/templates',
                        icon: 'layers' as const,
                        action: 'Browse templates',
                      },
                    ].map(item => (
                      <Card className="welcome-learning-card" key={item.to}>
                        <Icon name={item.icon} size={24} />
                        <h3>{item.title}</h3>
                        <p>{item.text}</p>
                        <Button asChild variant="link">
                          <Link to={item.to}>
                            {item.action} <Icon name="arrowRight" size={16} />
                          </Link>
                        </Button>
                      </Card>
                    ))}
                  </div>
                </section>
              </div>

              {/* Aside: Quick Links & Support */}
              <aside>
                <Card className="welcome-resource">
                  <h2>Help & Documentation</h2>
                  {[
                    { label: 'Help Centre Home', to: '/help' },
                    { label: 'Workspace Owner Quickstart', to: '/help/article/workspace-quickstart-guide' },
                    { label: 'ClearOS Freight Guide', to: '/help/article/customs-shipment-first-run' },
                    { label: 'FinOps Invoicing Guide', to: '/help/article/invoicing-and-payment-processing' },
                    { label: 'Customer Portal Guide', to: '/help/article/customer-portal-onboarding' },
                    { label: 'Technical Support Tickets', to: '/support/tickets' },
                  ].map(link => (
                    <Link key={link.to} to={link.to}>
                      {link.label} <Icon name="chevronRight" size={16} />
                    </Link>
                  ))}

                  <div className="welcome-resource-note">
                    <Icon name="headphones" size={24} />
                    <h3>Need Assistance?</h3>
                    <p>Have questions about setting up your organization or integrating TRA systems? Our support specialists are available.</p>
                    <Button asChild variant="outline">
                      <Link to="/support/tickets">Contact Support</Link>
                    </Button>
                  </div>
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
