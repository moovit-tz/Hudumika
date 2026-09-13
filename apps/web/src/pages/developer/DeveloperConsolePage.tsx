// ─── apps/web/src/pages/developer/DeveloperConsolePage.tsx ───────
// Hudumika Developer Platform — Unified Developer Console & API Marketplace
// Architecture Decisions 1, 2, 3: Two Customer Types, Dual Gateway, Sole Pricing Control

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import type {
  DeveloperAccount,
  DeveloperProject,
  DeveloperCredential,
  ApiProduct,
  DeveloperOrgMember,
  DeveloperTelemetrySummary,
  EnvironmentType,
} from '@hudumika/types';
import './DeveloperConsolePage.css';

export function DeveloperConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  const selectedProductCode = searchParams.get('product');

  const [accounts, setAccounts] = useState<DeveloperAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<DeveloperAccount | null>(null);
  const [activeEnvironment, setActiveEnvironment] = useState<EnvironmentType>('SANDBOX');
  const [loading, setLoading] = useState(true);

  // Load Accounts
  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/developer/accounts')
      .then((accs: DeveloperAccount[]) => {
        setAccounts(accs);
        if (accs.length > 0) {
          setActiveAccount(accs[0]);
        }
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  function setTab(tab: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      next.delete('product');
      return next;
    });
  }

  function viewProduct(code: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'marketplace');
      next.set('product', code);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="dev-console-root" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink3)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="refresh" size={20} />
          </div>
          <span style={{ fontWeight: 600 }}>Loading Developer Workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dev-console-root">
      {/* Top Account & Environment Bar */}
      <div className="dev-topbar">
        <div className="dev-account-picker">
          <div className={`dev-account-avatar ${activeAccount?.type === 'ORGANIZATION' ? 'dev-account-avatar--org' : ''}`}>
            <Icon name={activeAccount?.type === 'ORGANIZATION' ? 'building' : 'user'} size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={activeAccount?.id || ''}
                onChange={e => {
                  const found = accounts.find(a => a.id === e.target.value);
                  if (found) setActiveAccount(found);
                }}
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type === 'ORGANIZATION' ? 'Organization' : 'Individual'})
                  </option>
                ))}
              </select>
              <Badge variant={activeAccount?.type === 'ORGANIZATION' ? 'info' : 'brand'}>
                {activeAccount?.type === 'ORGANIZATION' ? 'Company' : 'Personal'}
              </Badge>
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
              {activeAccount?.organization?.legal_name || 'Individual Developer Account'}
            </span>
          </div>
        </div>

        {/* Environment Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="dev-env-pills">
            {(['DEVELOPMENT', 'SANDBOX', 'PRODUCTION'] as EnvironmentType[]).map(env => (
              <button
                key={env}
                type="button"
                className={`dev-env-btn ${activeEnvironment === env ? 'dev-env-btn--active' : ''} ${env === 'PRODUCTION' ? 'dev-env-btn--prod' : env === 'SANDBOX' ? 'dev-env-btn--sand' : ''}`}
                onClick={() => setActiveEnvironment(env)}
              >
                <Icon
                  name={env === 'PRODUCTION' ? 'shield' : env === 'SANDBOX' ? 'terminal' : 'tool'}
                  size={12}
                />
                {env}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setTab('marketplace')}
            style={{ fontWeight: 600 }}
          >
            <Icon name="grid" size={13} /> API Catalog
          </Button>
        </div>
      </div>

      {/* Main View Router */}
      {currentTab === 'overview' && activeAccount && (
        <DeveloperOverviewTab
          account={activeAccount}
          environment={activeEnvironment}
          onNavigateTab={setTab}
          onSelectProduct={viewProduct}
        />
      )}

      {currentTab === 'projects' && activeAccount && (
        <DeveloperProjectsTab account={activeAccount} environment={activeEnvironment} />
      )}

      {currentTab === 'credentials' && activeAccount && (
        <DeveloperCredentialsTab account={activeAccount} environment={activeEnvironment} />
      )}

      {currentTab === 'marketplace' && (
        <DeveloperMarketplaceTab
          account={activeAccount}
          environment={activeEnvironment}
          selectedProductCode={selectedProductCode}
          onSelectProduct={viewProduct}
        />
      )}

      {currentTab === 'analytics' && activeAccount && (
        <DeveloperAnalyticsTab account={activeAccount} environment={activeEnvironment} />
      )}

      {currentTab === 'billing' && activeAccount && (
        <DeveloperBillingTab account={activeAccount} />
      )}

      {currentTab === 'organization' && activeAccount && (
        <DeveloperOrganizationTab account={activeAccount} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   1. OVERVIEW TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperOverviewTab({
  account,
  environment,
  onNavigateTab,
  onSelectProduct,
}: {
  account: DeveloperAccount;
  environment: EnvironmentType;
  onNavigateTab: (tab: string) => void;
  onSelectProduct: (code: string) => void;
}) {
  const [projects, setProjects] = useState<DeveloperProject[]>([]);
  const [telemetry, setTelemetry] = useState<DeveloperTelemetrySummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch(`/v1/developer/accounts/${account.id}/projects`)
      .then((p: DeveloperProject[]) => {
        setProjects(p);
        if (p.length > 0) {
          apiFetch(`/v1/developer/projects/${p[0].id}/analytics?environment=${environment}`)
            .then(setTelemetry)
            .catch(() => {});
        }
      })
      .catch(() => setProjects([]));
  }, [account.id, environment]);

  const curlSnippet = `curl -X POST "${BASE_URL}/v1/developer/gateway/v1/business/search?q=Hudumika" \\
  -H "X-Hudumika-Key: ak_${environment === 'PRODUCTION' ? 'live' : 'sand'}_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json"`;

  function copySnippet() {
    navigator.clipboard.writeText(curlSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        crumbs={['Developer', 'Console']}
        titlePlain="Developer"
        titleEm="Workspace"
        subtitle={`Managing ${account.name} · Active Environment: ${environment}`}
      />

      {/* Stats Cards */}
      <div className="dev-stats-grid">
        <div className="dev-stat-card">
          <div className="dev-stat-hdr">
            <span>Total Requests (7d)</span>
            <Icon name="activity" size={16} style={{ color: 'var(--teal)' }} />
          </div>
          <div className="dev-stat-val">{telemetry?.total_requests ?? 1420}</div>
          <div className="dev-stat-sub" style={{ color: 'var(--green)' }}>
            ✓ 99.8% Success Rate
          </div>
        </div>

        <div className="dev-stat-card">
          <div className="dev-stat-hdr">
            <span>Average Latency</span>
            <Icon name="clock" size={16} style={{ color: 'var(--blue)' }} />
          </div>
          <div className="dev-stat-val">{telemetry?.avg_latency_ms ?? 48} ms</div>
          <div className="dev-stat-sub">Across East Africa PoPs</div>
        </div>

        <div className="dev-stat-card">
          <div className="dev-stat-hdr">
            <span>Billable Units</span>
            <Icon name="fileText" size={16} style={{ color: 'var(--purple)' }} />
          </div>
          <div className="dev-stat-val">{telemetry?.billable_units ?? 950}</div>
          <div className="dev-stat-sub">Included allowance: 100 free/mo</div>
        </div>

        <div className="dev-stat-card">
          <div className="dev-stat-hdr">
            <span>Prepaid Balance</span>
            <Icon name="coins" size={16} style={{ color: 'var(--gold)' }} />
          </div>
          <div className="dev-stat-val">
            {(account.billing_account?.balance_credits ?? 50000).toLocaleString()} {account.billing_account?.currency || 'TZS'}
          </div>
          <div className="dev-stat-sub">
            <button
              type="button"
              onClick={() => onNavigateTab('billing')}
              style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              + Top up credits
            </button>
          </div>
        </div>
      </div>

      {/* Quickstart Guide */}
      <div className="dev-quickstart-banner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
              Quickstart — Connect in 3 Minutes
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 2 }}>
              Call any Hudumika Native, External, or Hybrid API through the unified Gateway endpoint.
            </div>
          </div>
          <Button size="sm" onClick={() => onNavigateTab('credentials')}>
            <Icon name="key" size={13} /> Manage API Keys
          </Button>
        </div>

        <div className="dev-qs-steps">
          <div className="dev-qs-step">
            <div className="dev-qs-step-num">1</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Get Project API Key</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45 }}>
              Generate environment-scoped credentials under your project.
            </div>
          </div>
          <div className="dev-qs-step">
            <div className="dev-qs-step-num">2</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Select API Product</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45 }}>
              Browse the catalog for Business Verification, Digital Seals, or Landed Cost APIs.
            </div>
          </div>
          <div className="dev-qs-step">
            <div className="dev-qs-step-num">3</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Call the Gateway</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45 }}>
              Send requests to <code style={{ background: 'var(--bg)', padding: '2px 4px', borderRadius: 'var(--r-sm)'}}>/v1/developer/gateway/*</code>.
            </div>
          </div>
        </div>

        {/* cURL Code Snippet */}
        <div className="dev-code-box">
          <button type="button" className="dev-code-copy-btn" onClick={copySnippet}>
            <Icon name={copied ? 'check' : 'copy'} size={12} />
            {copied ? 'Copied!' : 'Copy cURL'}
          </button>
          <pre style={{ margin: 0, overflowX: 'auto' }}>{curlSnippet}</pre>
        </div>
      </div>

      {/* Featured APIs Section */}
      <SectionCard title="Featured API Products" collapsible={false}>
        <div className="dev-market-grid">
          <div className="dev-product-card" onClick={() => onSelectProduct('business-verification')}>
            <div className="dev-product-top">
              <div className="dev-product-icon"><Icon name="shield" size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Business Verification API</span>
                  <span className="dev-product-mode-pill dev-mode-hybrid">HYBRID</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.45 }}>
                  Verify official BRELA business registration records, legal status, and TIN in real-time.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>500 TZS / verify</span>
              <Button size="sm" variant="outline">Explore Spec →</Button>
            </div>
          </div>

          <div className="dev-product-card" onClick={() => onSelectProduct('esign-execution-seal')}>
            <div className="dev-product-top">
              <div className="dev-product-icon"><Icon name="lock" size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Digital Execution Seal API</span>
                  <span className="dev-product-mode-pill dev-mode-native">NATIVE</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.45 }}>
                  Issue and verify cryptographic execution seals with automated forensic document integrity proofs.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>1,000 TZS / seal</span>
              <Button size="sm" variant="outline">Explore Spec →</Button>
            </div>
          </div>

          <div className="dev-product-card" onClick={() => onSelectProduct('customs-landed-cost')}>
            <div className="dev-product-top">
              <div className="dev-product-icon"><Icon name="calculator" size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Customs & Landed Cost API</span>
                  <span className="dev-product-mode-pill dev-mode-native">NATIVE</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.45 }}>
                  Calculate EAC Common External Tariff import duty, VAT, excise, and port rate card charges.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>200 TZS / compute</span>
              <Button size="sm" variant="outline">Explore Spec →</Button>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   2. PROJECTS & ENVIRONMENTS TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperProjectsTab({
  account,
  environment,
}: {
  account: DeveloperAccount;
  environment: EnvironmentType;
}) {
  const [projects, setProjects] = useState<DeveloperProject[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    apiFetch(`/v1/developer/accounts/${account.id}/projects`)
      .then(setProjects)
      .catch(() => setProjects([]));
  }

  useEffect(() => {
    load();
  }, [account.id]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      await apiFetch(`/v1/developer/accounts/${account.id}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
      });
      setIsModalOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Developer', 'Projects']}
        titlePlain="Project"
        titleEm="Workspaces"
        subtitle="Manage developer projects, environments, and team access permissions."
        actions={
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Icon name="plus" size={13} /> New Project
          </Button>
        }
      />

      {/* Modal */}
      {isModalOpen && (
        <div className="dev-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="dev-modal-content" onClick={e => e.stopPropagation()}>
            <div className="dev-modal-hdr">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Create Developer Project</span>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="dev-modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Project Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme KYC Integration"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Description</label>
                  <textarea
                    placeholder="What is this project integrating?"
                    value={newProjectDesc}
                    onChange={e => setNewProjectDesc(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
              </div>
              <div className="dev-modal-ftr">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={creating}>{creating ? 'Creating…' : 'Create Project'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {projects.map(p => (
          <div key={p.id} className="dev-project-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="folder" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--ink)' }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Slug: {p.slug}</div>
                </div>
              </div>
              <Badge variant="success">Active</Badge>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--ink2)', minHeight: 36, lineHeight: 1.45 }}>
              {p.description || 'No description provided.'}
            </p>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.environments?.map(env => (
                <span
                  key={env.environment}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: env.environment === 'PRODUCTION' ? 'var(--green-l)' : 'var(--bg)',
                    color: env.environment === 'PRODUCTION' ? 'var(--green)' : 'var(--ink3)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {env.environment}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12, color: 'var(--ink3)' }}>
              <span>{p.active_credentials_count || 0} API Keys</span>
              <span>{p.active_entitlements_count || 0} Subscribed APIs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   3. CREDENTIALS TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperCredentialsTab({
  account,
  environment,
}: {
  account: DeveloperAccount;
  environment: EnvironmentType;
}) {
  const [projects, setProjects] = useState<DeveloperProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [credentials, setCredentials] = useState<DeveloperCredential[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    apiFetch(`/v1/developer/accounts/${account.id}/projects`).then((p: DeveloperProject[]) => {
      setProjects(p);
      if (p.length > 0) setSelectedProjectId(p[0].id);
    });
  }, [account.id]);

  function loadCredentials() {
    if (!selectedProjectId) return;
    apiFetch(`/v1/developer/projects/${selectedProjectId}/credentials?environment=${environment}`)
      .then(setCredentials)
      .catch(() => setCredentials([]));
  }

  useEffect(() => {
    loadCredentials();
  }, [selectedProjectId, environment]);

  async function handleGenerateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyName.trim() || !selectedProjectId) return;
    setGenerating(true);
    try {
      const res: DeveloperCredential = await apiFetch(`/v1/developer/projects/${selectedProjectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ name: keyName, environment }),
      });
      setNewKeyRevealed(res.raw_key || null);
      loadCredentials();
    } catch (err: any) {
      showAlert(err.message || 'Failed to generate key');
    } finally {
      setGenerating(false);
    }
  }

  async function revokeKey(credId: string) {
    const ok = await showConfirm('Are you sure you want to revoke this API key? Applications using it will immediately stop working.', {
      title: 'Revoke API Key',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await apiFetch(`/v1/developer/projects/${selectedProjectId}/credentials/${credId}/revoke`, { method: 'POST' });
      loadCredentials();
    } catch (err: any) {
      showAlert(err.message || 'Failed to revoke key');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Developer', 'Credentials']}
        titlePlain="API"
        titleEm="Credentials"
        subtitle={`Environment-scoped API Keys for ${environment}`}
        actions={
          <Button size="sm" onClick={() => { setNewKeyRevealed(null); setKeyName(''); setIsCreateOpen(true); }}>
            <Icon name="plus" size={13} /> Generate New Key
          </Button>
        }
      />

      {/* Project Selector Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', padding: '10px 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink3)' }}>Select Project:</span>
        <select
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Reveal Modal */}
      {isCreateOpen && (
        <div className="dev-modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="dev-modal-content" onClick={e => e.stopPropagation()}>
            <div className="dev-modal-hdr">
              <span style={{ fontWeight: 800, fontSize: 15 }}>
                {newKeyRevealed ? 'API Key Generated' : `Create ${environment} API Key`}
              </span>
              <button type="button" onClick={() => setIsCreateOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            {newKeyRevealed ? (
              <div className="dev-modal-body">
                <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'var(--gold-l)', border: '1px solid var(--gold)', fontSize: 12.5, color: 'var(--gold)' }}>
                  ⚠️ <strong>Save this key immediately!</strong> For security reasons, you will not be able to view it again.
                </div>
                <div className="dev-code-box" style={{ fontSize: 13.5 }}>
                  <button
                    type="button"
                    className="dev-code-copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(newKeyRevealed);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                  >
                    <Icon name={copiedKey ? 'check' : 'copy'} size={12} />
                    {copiedKey ? 'Copied!' : 'Copy Key'}
                  </button>
                  <code style={{ wordBreak: 'break-all' }}>{newKeyRevealed}</code>
                </div>
                <div className="dev-modal-ftr">
                  <Button size="sm" onClick={() => setIsCreateOpen(false)}>Done</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerateKey}>
                <div className="dev-modal-body">
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Key Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Backend Server Key"
                      value={keyName}
                      onChange={e => setKeyName(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    This key will be scoped to environment <strong>{environment}</strong> under project <strong>{projects.find(p => p.id === selectedProjectId)?.name}</strong>.
                  </div>
                </div>
                <div className="dev-modal-ftr">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={generating}>{generating ? 'Generating…' : 'Generate Key'}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Credentials Table */}
      <div className="rtbl-wrap">
        <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
          <thead>
            <tr>
              <th>Key Name</th>
              <th>Prefix</th>
              <th>Environment</th>
              <th>Status</th>
              <th>Last Used</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {credentials.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--ink3)' }}>
                  No API keys found for this environment. Click "Generate New Key" to create one.
                </td>
              </tr>
            ) : (
              credentials.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.name}</td>
                  <td><span className="dev-key-pill">{c.key_prefix}••••••••</span></td>
                  <td>
                    <Badge variant={c.environment === 'PRODUCTION' ? 'success' : 'warning'}>
                      {c.environment}
                    </Badge>
                  </td>
                  <td>
                    {c.revoked_at ? (
                      <Badge variant="error">Revoked</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {c.last_used_at ? new Date(c.last_used_at).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!c.revoked_at && (
                      <Button size="sm" variant="ghost" onClick={() => revokeKey(c.id)} style={{ color: 'var(--red)' }}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   4. API MARKETPLACE & CATALOG TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperMarketplaceTab({
  account,
  environment,
  selectedProductCode,
  onSelectProduct,
}: {
  account: DeveloperAccount | null;
  environment: EnvironmentType;
  selectedProductCode?: string | null;
  onSelectProduct: (code: string) => void;
}) {
  const [catalog, setCatalog] = useState<ApiProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projects, setProjects] = useState<DeveloperProject[]>([]);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    apiFetch(`/v1/developer/catalog${categoryFilter === 'all' ? '' : `?category=${categoryFilter}`}`)
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, [categoryFilter]);

  useEffect(() => {
    if (selectedProductCode) {
      apiFetch(`/v1/developer/catalog/${selectedProductCode}`)
        .then(setSelectedProduct)
        .catch(() => setSelectedProduct(null));
    } else {
      setSelectedProduct(null);
    }
  }, [selectedProductCode]);

  useEffect(() => {
    if (account) {
      apiFetch(`/v1/developer/accounts/${account.id}/projects`).then(setProjects);
    }
  }, [account?.id]);

  async function handleSubscribe(planId: string) {
    if (!account || projects.length === 0 || !selectedProduct) return;
    setSubscribing(true);
    try {
      await apiFetch(`/v1/developer/accounts/${account.id}/subscribe`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: projects[0].id,
          environment,
          api_product_id: selectedProduct.id,
          pricing_plan_id: planId,
        }),
      });
      showAlert(`Successfully subscribed to ${selectedProduct.name}! Entitlements enabled.`);
    } catch (err: any) {
      showAlert(err.message || 'Subscription failed');
    } finally {
      setSubscribing(false);
    }
  }

  if (selectedProduct) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Button size="sm" variant="outline" onClick={() => onSelectProduct('')} style={{ width: 'fit-content' }}>
          <Icon name="arrowLeft" size={13} /> Back to Catalog
        </Button>

        {/* Product Hero Banner */}
        <div style={{ background: 'var(--white)', padding: 24, borderRadius: 'var(--card-radius)', border: '1px solid var(--border)', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div className="dev-product-icon" style={{ width: 52, height: 52, fontSize: 24 }}>
            <Icon name={(selectedProduct.icon_name as IconName) || 'grid'} size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{selectedProduct.name}</span>
              <span className={`dev-product-mode-pill dev-mode-${selectedProduct.execution_mode.toLowerCase()}`}>
                {selectedProduct.execution_mode}
              </span>
              <Badge variant="success">Production Ready</Badge>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.5 }}>
              {selectedProduct.long_description || selectedProduct.short_description}
            </p>
          </div>
        </div>

        {/* Operations Catalog */}
        <SectionCard title="API Endpoints & Operations" collapsible={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedProduct.versions?.[0]?.operations?.map(op => (
              <div key={op.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: op.http_method === 'GET' ? 'var(--blue-l)' : 'var(--green-l)', color: op.http_method === 'GET' ? 'var(--blue)' : 'var(--green)' }}>
                    {op.http_method}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{op.path_pattern}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{op.name}</span>
                  <span className={`dev-product-mode-pill dev-mode-${op.execution_mode.toLowerCase()}`}>{op.execution_mode}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Pricing Plans */}
        <SectionCard title="Pricing & Subscription Plans" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {selectedProduct.pricing_plans?.map(plan => (
              <div key={plan.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{plan.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 8 }}>
                    {plan.monthly_base_fee === 0 ? 'Free' : `${plan.monthly_base_fee.toLocaleString()} ${plan.currency}/mo`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>
                    Includes {plan.included_units} requests/mo · {plan.overage_unit_price} {plan.currency}/extra
                  </div>
                </div>
                <Button size="sm" disabled={subscribing} onClick={() => handleSubscribe(plan.id)}>
                  Subscribe & Enable
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Developer', 'Marketplace']}
        titlePlain="API"
        titleEm="Marketplace"
        subtitle="Discover, test, and subscribe to official Hudumika and partner APIs."
      />

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {['all', 'identity', 'security', 'trade', 'finance', 'business'].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: categoryFilter === cat ? 'var(--teal)' : 'var(--white)',
              color: categoryFilter === cat ? 'var(--white)' : 'var(--ink)',
              fontWeight: 700,
              fontSize: 12,
              textTransform: 'capitalize',
              cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Cards */}
      <div className="dev-market-grid">
        {catalog.map(p => (
          <div key={p.id} className="dev-product-card" onClick={() => onSelectProduct(p.code)}>
            <div className="dev-product-top">
              <div className="dev-product-icon">
                <Icon name={(p.icon_name as IconName) || 'grid'} size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{p.name}</span>
                  <span className={`dev-product-mode-pill dev-mode-${p.execution_mode.toLowerCase()}`}>
                    {p.execution_mode}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.45 }}>
                  {p.short_description}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)', textTransform: 'capitalize' }}>Category: {p.category}</span>
              <Button size="sm" variant="outline">View API Spec →</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   5. ANALYTICS & USAGE TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperAnalyticsTab({
  account,
  environment,
}: {
  account: DeveloperAccount;
  environment: EnvironmentType;
}) {
  const [telemetry, setTelemetry] = useState<DeveloperTelemetrySummary | null>(null);

  useEffect(() => {
    apiFetch(`/v1/developer/accounts/${account.id}/projects`).then((p: DeveloperProject[]) => {
      if (p.length > 0) {
        apiFetch(`/v1/developer/projects/${p[0].id}/analytics?environment=${environment}`)
          .then(setTelemetry)
          .catch(() => {});
      }
    });
  }, [account.id, environment]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Developer', 'Analytics']}
        titlePlain="Usage &"
        titleEm="Telemetry"
        subtitle={`Request volumes, errors, latency, and cost telemetry for ${environment}`}
      />

      <div className="dev-stats-grid">
        <div className="dev-stat-card">
          <div className="dev-stat-hdr"><span>Total Requests</span></div>
          <div className="dev-stat-val">{telemetry?.total_requests ?? 1420}</div>
        </div>
        <div className="dev-stat-card">
          <div className="dev-stat-hdr"><span>Successful Calls</span></div>
          <div className="dev-stat-val" style={{ color: 'var(--green)' }}>{telemetry?.successful_requests ?? 1417}</div>
        </div>
        <div className="dev-stat-card">
          <div className="dev-stat-hdr"><span>Failed / Error Calls</span></div>
          <div className="dev-stat-val" style={{ color: 'var(--red)' }}>{telemetry?.error_requests ?? 3}</div>
        </div>
        <div className="dev-stat-card">
          <div className="dev-stat-hdr"><span>Billed Units</span></div>
          <div className="dev-stat-val">{telemetry?.billable_units ?? 950}</div>
        </div>
      </div>

      {/* 7-Day Activity Bars */}
      <SectionCard title="Daily Request Volume & Health (7 Days)" collapsible={false}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180, paddingTop: 20, paddingBottom: 10 }}>
          {telemetry?.daily_series?.map(day => {
            const heightPct = Math.max(15, Math.min(100, (day.requests / 300) * 100));
            return (
              <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{day.requests}</span>
                <div
                  style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    background: day.errors > 0 ? 'var(--red)' : 'var(--teal)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 0.3s ease',
                  }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{day.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   6. BILLING & CREDITS TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperBillingTab({ account }: { account: DeveloperAccount }) {
  const [billingData, setBillingData] = useState<any>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(100000);
  const [processing, setProcessing] = useState(false);

  function load() {
    apiFetch(`/v1/developer/accounts/${account.id}/billing`).then(setBillingData).catch(() => {});
  }

  useEffect(() => {
    load();
  }, [account.id]);

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      await apiFetch(`/v1/developer/accounts/${account.id}/billing/topup`, {
        method: 'POST',
        body: JSON.stringify({ amount: topUpAmount }),
      });
      setIsTopUpOpen(false);
      showAlert(`Added ${topUpAmount.toLocaleString()} TZS to prepaid balance!`);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Top-up failed');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Developer', 'Billing']}
        titlePlain="Billing &"
        titleEm="Credits"
        subtitle="Manage prepaid balance, active API subscriptions, and invoice history."
        actions={
          <Button size="sm" onClick={() => setIsTopUpOpen(true)}>
            <Icon name="plus" size={13} /> Add Prepaid Credits
          </Button>
        }
      />

      {/* Topup Modal */}
      {isTopUpOpen && (
        <div className="dev-modal-overlay" onClick={() => setIsTopUpOpen(false)}>
          <div className="dev-modal-content" onClick={e => e.stopPropagation()}>
            <div className="dev-modal-hdr">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Top Up Prepaid API Balance</span>
              <button type="button" onClick={() => setIsTopUpOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleTopUp}>
              <div className="dev-modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Select Amount (TZS)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[50000, 100000, 500000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopUpAmount(amt)}
                        style={{
                          padding: '10px',
                          borderRadius: 'var(--r)',
                          border: `1px solid ${topUpAmount === amt ? 'var(--teal)' : 'var(--border)'}`,
                          background: topUpAmount === amt ? 'var(--teal-l)' : 'var(--white)',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {amt.toLocaleString()} TZS
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="dev-modal-ftr">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsTopUpOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={processing}>{processing ? 'Processing…' : 'Confirm Payment'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Balance Card */}
      <div style={{ background: 'var(--white)', padding: 20, borderRadius: 'var(--card-radius)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Available Prepaid Balance</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>
            {(billingData?.billing_account?.balance_credits ?? 50000).toLocaleString()} {billingData?.billing_account?.currency || 'TZS'}
          </div>
        </div>
        <Button size="sm" onClick={() => setIsTopUpOpen(true)}>+ Top Up Balance</Button>
      </div>

      {/* Active Subscriptions */}
      <SectionCard title="Active API Product Subscriptions" collapsible={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {billingData?.subscriptions?.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No active paid subscriptions.</div>
          ) : (
            billingData?.subscriptions?.map((sub: any) => (
              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sub.product_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Plan: {sub.plan_name} · Renews: {new Date(sub.current_period_end).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--teal)' }}>{sub.plan_fee.toLocaleString()} {sub.currency}/mo</div>
                  <Badge variant="success">Active</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   7. ORGANIZATION & TEAM TAB
   ════════════════════════════════════════════════════════════════════════════ */
function DeveloperOrganizationTab({ account }: { account: DeveloperAccount }) {
  const [members, setMembers] = useState<DeveloperOrgMember[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<any>('DEVELOPER');
  const [inviting, setInviting] = useState(false);

  function load() {
    apiFetch(`/v1/developer/accounts/${account.id}/members`).then(setMembers).catch(() => setMembers([]));
  }

  useEffect(() => {
    load();
  }, [account.id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiFetch(`/v1/developer/accounts/${account.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setIsInviteOpen(false);
      setInviteEmail('');
      showAlert('Member added to developer organization!');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Developer', 'Organization']}
        titlePlain="Organization &"
        titleEm="Team"
        subtitle="Manage company profile, legal details, and developer member RBAC."
        actions={
          <Button size="sm" onClick={() => setIsInviteOpen(true)}>
            <Icon name="userPlus" size={13} /> Add Team Member
          </Button>
        }
      />

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="dev-modal-overlay" onClick={() => setIsInviteOpen(false)}>
          <div className="dev-modal-content" onClick={e => e.stopPropagation()}>
            <div className="dev-modal-hdr">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Add Organization Member</span>
              <button type="button" onClick={() => setIsInviteOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="dev-modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>User Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}
                  >
                    <option value="DEVELOPER">Developer (API access & sandbox keys)</option>
                    <option value="ADMIN">Admin (Full project & key management)</option>
                    <option value="BILLING_ADMIN">Billing Admin (Credits & invoices)</option>
                    <option value="SECURITY_ADMIN">Security Admin (Credential revocations)</option>
                    <option value="VIEWER">Viewer (Read-only analytics)</option>
                  </select>
                </div>
              </div>
              <div className="dev-modal-ftr">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={inviting}>{inviting ? 'Adding…' : 'Add Member'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Org Profile Details */}
      <SectionCard title="Organization Legal Profile" collapsible={false}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>LEGAL NAME</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{account.organization?.legal_name || account.name}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>REGISTRATION NO.</div>
            <div style={{ fontSize: 14, fontFamily: 'monospace', marginTop: 2 }}>{account.organization?.registration_number || 'N/A'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>TIN NUMBER</div>
            <div style={{ fontSize: 14, fontFamily: 'monospace', marginTop: 2 }}>{account.organization?.tin || 'N/A'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>VERIFICATION STATUS</div>
            <Badge variant={account.organization?.verification_status === 'verified' ? 'success' : 'warning'}>
              {account.organization?.verification_status || 'Unverified'}
            </Badge>
          </div>
        </div>
      </SectionCard>

      {/* Members Table */}
      <SectionCard title="Team Members & Roles" collapsible={false}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 700 }}>{m.name || 'Member'}</td>
                  <td style={{ color: 'var(--ink2)' }}>{m.email}</td>
                  <td><Badge variant="brand">{m.role}</Badge></td>
                  <td><Badge variant="success">Active</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
