import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading, PageLoading } from '../../components/ui/spinner.js';
import type {
  AgencyManagedClient, OnsiteDomain, OnsiteDnsRecord,
  OnsiteApplication, OnsiteDeployment, OnsiteHealthCheck,
} from '@hudumika/types';
import './Onsite.css';

export function OnsiteAgencyClientManage() {
  const { clientTenantId } = useParams<{ clientTenantId: string }>();
  const [client, setClient] = useState<AgencyManagedClient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/onsite/agency/clients')
      .then((res: any) => {
        const match = (res?.data ?? []).find((c: AgencyManagedClient) => c.tenant_id === clientTenantId);
        setClient(match ?? null);
      })
      .catch(() => setClient(null))
      .finally(() => setLoading(false));
  }, [clientTenantId]);

  if (!clientTenantId) return null;

  if (loading) {
    return (
      <div className="onsite-page">
        <div className="onsite-card"><PageLoading /></div>
      </div>
    );
  }

  if (!client || client.status !== 'active') {
    return (
      <div className="onsite-page">
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="alertCircle" size={40} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>Client not found</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            This tenant isn't currently attached to your agency.
          </p>
          <Link to="/onsite/agency/clients" className="btn btn-secondary">Back to clients</Link>
        </div>
      </div>
    );
  }

  const base = `/v1/onsite/agency/clients/${clientTenantId}`;

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Agency clients', client.tenant_name]}
        titlePlain="Client"
        titleEm="hosting"
        subtitle={`You're managing ${client.tenant_name}'s Onsite account under your agency package.`}
        actions={<Link to="/onsite/agency/clients" className="onsite-btn-outline">Back to clients</Link>}
      />
      <DomainsSection base={base} />
      <DeploymentsSection base={base} />
      <MonitoringSection base={base} />
      <BillingSection base={base} />
    </div>
  );
}

/* ───────────────────────── Billing (AgencyHost M9) ───────────────────────── */

interface LinkedCustomer { id: string; name: string; }
interface ClientInvoice {
  id: string; invoice_number: string; status: string;
  bill_date: string | null; due_date: string | null;
  received: number | null; currency: string; created_at: string;
}

function BillingSection({ base }: { base: string }) {
  const [customer, setCustomer] = useState<LinkedCustomer | null>(null);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  const fetchBilling = () => {
    setLoading(true);
    apiFetch(`${base}/billing`)
      .then((res: any) => { setCustomer(res?.customer ?? null); setInvoices(res?.invoices ?? []); })
      .catch(() => { setCustomer(null); setInvoices([]); })
      .finally(() => setLoading(false));
  };
  useEffect(fetchBilling, [base]);

  const handleLink = async () => {
    setLinking(true);
    try {
      const created = await apiFetch(`${base}/billing/link-customer`, { method: 'POST' });
      setCustomer(created);
      showAlert(`${created.name} can now be billed — create an invoice below.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Could not set up billing for this client.', { variant: 'error' });
    } finally {
      setLinking(false);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
      <div className="onsite-card-header" style={{ marginBottom: '1rem' }}>
        <h3 className="onsite-card-title">Billing</h3>
        {customer && (
          <Link to={`/billing?customer_id=${customer.id}&new=1`} className="btn btn-sm btn-primary">
            <Icon name="plus" size={14} /> Create invoice
          </Link>
        )}
      </div>
      <div className="onsite-card">
        {loading ? (
          <SectionLoading />
        ) : !customer ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <p style={{ color: 'var(--ink-muted)', marginBottom: '1rem' }}>
              Bill this client for work beyond your bundle — design, retainers, extra services.
            </p>
            <button className="btn btn-primary" disabled={linking} onClick={handleLink}>
              {linking ? 'Setting up…' : 'Add as billable customer'}
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <p style={{ color: 'var(--ink-muted)', padding: '1rem' }}>No invoices yet — use "Create invoice" above.</p>
        ) : (
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead><tr><th>Invoice</th><th>Status</th><th>Due</th><th>Received</th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td><span className={`onsite-badge ${inv.status === 'Paid' ? 'active' : inv.status === 'Void' ? 'inactive' : 'pending'}`}>{inv.status}</span></td>
                    <td>{inv.due_date ? new Date(inv.due_date).toISOString().slice(0, 10) : '—'}</td>
                    <td className="onsite-mono">{inv.received != null ? `${inv.received} ${inv.currency}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Domains & DNS ───────────────────────── */

function DomainsSection({ base }: { base: string }) {
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDomains = () => {
    setLoading(true);
    apiFetch(`${base}/domains`).then((res: any) => setDomains(res ?? [])).catch(() => setDomains([])).finally(() => setLoading(false));
  };
  useEffect(fetchDomains, [base]);

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="onsite-card-header" style={{ marginBottom: '1rem' }}>
        <h3 className="onsite-card-title">Domains &amp; DNS</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAddDomain(true)}>
          <Icon name="plus" size={14} /> Add domain
        </button>
      </div>
      <div className="onsite-card">
        {loading ? (
          <SectionLoading />
        ) : domains.length === 0 ? (
          <p style={{ color: 'var(--ink-muted)', padding: '1rem' }}>No domains attached yet.</p>
        ) : (
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead><tr><th>Domain</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {domains.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{d.domain}</td>
                      <td><span className={`onsite-badge ${d.status === 'active' ? 'active' : 'inactive'}`}>{d.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="onsite-btn-outline" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                          {expandedId === d.id ? 'Hide DNS' : 'Manage DNS'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr>
                        <td colSpan={3} style={{ background: 'var(--bg)', padding: '1rem' }}>
                          <DnsPanel base={base} domainId={d.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showAddDomain && (
        <AddDomainModal base={base} onClose={() => setShowAddDomain(false)} onCreated={() => { setShowAddDomain(false); fetchDomains(); }} />
      )}
    </div>
  );
}

function AddDomainModal({ base, onClose, onCreated }: { base: string; onClose: () => void; onCreated: () => void }) {
  const [domain, setDomain] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`${base}/domains`, { method: 'POST', body: JSON.stringify({ domain: domain.trim() }) });
      onCreated();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add domain', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Add domain" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="onsite-form-group">
          <label>Domain *</label>
          <input type="text" className="onsite-input" placeholder="clientsite.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
        </div>
        <ModalActions onClose={onClose} submitting={submitting} submitLabel="Add domain" busyLabel="Adding…" />
      </form>
    </ModalShell>
  );
}

function DnsPanel({ base, domainId }: { base: string; domainId: string }) {
  const [records, setRecords] = useState<OnsiteDnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRecord, setShowAddRecord] = useState(false);

  const fetchRecords = () => {
    setLoading(true);
    apiFetch(`${base}/domains/${domainId}/dns`)
      .then((res: any) => setRecords(res?.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };
  useEffect(fetchRecords, [base, domainId]);

  // Same shape as OnsiteDNS.tsx's own handleDeleteRecord: a 409 here is the
  // server's own impact warning, not a failure — confirm against its exact
  // wording rather than a generic "are you sure?".
  const handleDelete = async (recordId: string) => {
    const del = (confirmed: boolean) =>
      apiFetch(`${base}/domains/${domainId}/dns/${recordId}${confirmed ? '?confirm=true' : ''}`, { method: 'DELETE' });
    try {
      if (!(await showConfirm('Delete this DNS record?', { variant: 'danger', confirmLabel: 'Delete' }))) return;
      await del(false);
      fetchRecords();
    } catch (err: any) {
      const impact = err?.message || '';
      if (/stops email|unresolvable|takes the website offline|more likely to be treated as spam|weakens protection/i.test(impact)) {
        const ok = await showConfirm(`${impact}\n\nDelete it anyway?`, { title: 'This change has consequences', variant: 'danger', confirmLabel: 'Delete anyway' });
        if (!ok) return;
        try {
          await del(true);
          fetchRecords();
        } catch (e: any) {
          showAlert(e.message || 'Failed to delete record', { variant: 'error' });
        }
        return;
      }
      showAlert(impact || 'Failed to delete record', { variant: 'error' });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '0.875rem' }}>DNS records</strong>
        <button className="btn btn-sm btn-secondary" onClick={() => setShowAddRecord(true)}>
          <Icon name="plus" size={14} /> Add record
        </button>
      </div>
      {loading ? (
        <SectionLoading />
      ) : records.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)' }}>No records yet.</p>
      ) : (
        <table className="onsite-table">
          <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>TTL</th><th></th></tr></thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td className="onsite-mono">{r.name}</td>
                <td>{r.type}</td>
                <td className="onsite-mono">{r.value}</td>
                <td>{r.ttl}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(r.id)}>
                    <Icon name="trash2" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAddRecord && (
        <AddRecordModal base={base} domainId={domainId} onClose={() => setShowAddRecord(false)} onCreated={() => { setShowAddRecord(false); fetchRecords(); }} />
      )}
    </div>
  );
}

function AddRecordModal({ base, domainId, onClose, onCreated }: { base: string; domainId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('@');
  const [type, setType] = useState('A');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('3600');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !value) return;
    setSubmitting(true);
    try {
      await apiFetch(`${base}/domains/${domainId}/dns`, {
        method: 'POST',
        body: JSON.stringify({ name, type, value, ttl: parseInt(ttl, 10) || 3600 }),
      });
      onCreated();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add DNS record', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Add DNS record" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="onsite-form-group">
            <label>Name</label>
            <input type="text" className="onsite-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="onsite-form-group">
            <label>Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="onsite-form-group">
          <label>Value *</label>
          <input type="text" className="onsite-input" value={value} onChange={(e) => setValue(e.target.value)} required />
        </div>
        <div className="onsite-form-group">
          <label>TTL (seconds)</label>
          <input type="number" className="onsite-input" value={ttl} onChange={(e) => setTtl(e.target.value)} />
        </div>
        <ModalActions onClose={onClose} submitting={submitting} submitLabel="Add record" busyLabel="Adding…" />
      </form>
    </ModalShell>
  );
}

/* ───────────────────────── Deployments ───────────────────────── */

function DeploymentsSection({ base }: { base: string }) {
  const [apps, setApps] = useState<OnsiteApplication[]>([]);
  const [deployments, setDeployments] = useState<OnsiteDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddApp, setShowAddApp] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      apiFetch(`${base}/applications`).catch(() => []),
      apiFetch(`${base}/deployments`).catch(() => []),
    ]).then(([a, d]: any) => { setApps(a ?? []); setDeployments(d ?? []); }).finally(() => setLoading(false));
  };
  useEffect(fetchAll, [base]);

  const handleDeploy = async (appId: string) => {
    setDeploying(appId);
    try {
      await apiFetch(`${base}/applications/${appId}/deploy`, { method: 'POST', body: JSON.stringify({}) });
      showAlert('Deployment queued.', { variant: 'success' });
      fetchAll();
    } catch (err: any) {
      // A refused deploy (e.g. no CI provider connected for this client yet)
      // is a real, honest outcome — surfaced as-is, not swallowed.
      showAlert(err.message || 'Failed to trigger deployment', { variant: 'error' });
    } finally {
      setDeploying(null);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="onsite-card-header" style={{ marginBottom: '1rem' }}>
        <h3 className="onsite-card-title">Deployments</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAddApp(true)}>
          <Icon name="plus" size={14} /> Register app
        </button>
      </div>
      <div className="onsite-card">
        {loading ? (
          <SectionLoading />
        ) : apps.length === 0 ? (
          <p style={{ color: 'var(--ink-muted)', padding: '1rem' }}>No applications registered yet.</p>
        ) : (
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead><tr><th>Application</th><th>Runtime</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td className="onsite-mono">{a.runtime}</td>
                    <td><span className={`onsite-badge ${a.status === 'active' ? 'active' : a.status === 'failed' ? 'failed' : 'inactive'}`}>{a.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="onsite-btn-outline" disabled={deploying === a.id} onClick={() => handleDeploy(a.id)}>
                        {deploying === a.id ? 'Deploying…' : 'Redeploy'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deployments.length > 0 && (
        <div className="onsite-card" style={{ marginTop: '0.75rem' }}>
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead><tr><th>Branch</th><th>Status</th><th>Queued</th></tr></thead>
              <tbody>
                {deployments.slice(0, 10).map((d) => (
                  <tr key={d.id}>
                    <td className="onsite-mono">{d.branch || '—'}</td>
                    <td><span className={`onsite-badge ${d.status === 'succeeded' ? 'active' : d.status === 'failed' ? 'failed' : 'pending'}`}>{d.status}</span></td>
                    <td>{new Date(d.queued_at).toISOString().replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddApp && (
        <AddAppModal base={base} onClose={() => setShowAddApp(false)} onCreated={() => { setShowAddApp(false); fetchAll(); }} />
      )}
    </div>
  );
}

function AddAppModal({ base, onClose, onCreated }: { base: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState('nodejs');
  const [repoUrl, setRepoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`${base}/applications`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), runtime, repo_url: repoUrl.trim() || undefined }),
      });
      onCreated();
    } catch (err: any) {
      showAlert(err.message || 'Failed to register application', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Register application" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="onsite-form-group">
          <label>Name *</label>
          <input type="text" className="onsite-input" placeholder="client-site" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="onsite-form-group">
          <label>Runtime</label>
          <Select value={runtime} onValueChange={setRuntime}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['static', 'nodejs', 'python', 'php', 'ruby', 'go', 'rust', 'container', 'custom'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="onsite-form-group">
          <label>Repository URL</label>
          <input type="text" className="onsite-input" placeholder="https://github.com/client/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
        </div>
        <ModalActions onClose={onClose} submitting={submitting} submitLabel="Register" busyLabel="Registering…" />
      </form>
    </ModalShell>
  );
}

/* ───────────────────────── Monitoring ───────────────────────── */

function MonitoringSection({ base }: { base: string }) {
  const [checks, setChecks] = useState<OnsiteHealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCheck, setShowAddCheck] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const fetchChecks = () => {
    setLoading(true);
    apiFetch(`${base}/health-checks`).then((res: any) => setChecks(res ?? [])).catch(() => setChecks([])).finally(() => setLoading(false));
  };
  useEffect(fetchChecks, [base]);

  const handleRun = async (id: string) => {
    setRunning(id);
    try {
      await apiFetch(`${base}/health-checks/${id}/run`, { method: 'POST' });
      fetchChecks();
    } catch (err: any) {
      showAlert(err.message || 'Failed to run check', { variant: 'error' });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
      <div className="onsite-card-header" style={{ marginBottom: '1rem' }}>
        <h3 className="onsite-card-title">Monitoring</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAddCheck(true)}>
          <Icon name="plus" size={14} /> Add check
        </button>
      </div>
      <div className="onsite-card">
        {loading ? (
          <SectionLoading />
        ) : checks.length === 0 ? (
          <p style={{ color: 'var(--ink-muted)', padding: '1rem' }}>No health checks yet.</p>
        ) : (
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead><tr><th>Name</th><th>URL</th><th>Status</th><th>Uptime (30d)</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="onsite-mono">{c.url}</td>
                    <td><span className={`onsite-badge ${c.status === 'healthy' ? 'active' : c.status === 'critical' ? 'failed' : 'unknown'}`}>{c.status}</span></td>
                    <td>{c.uptime_30d != null ? `${c.uptime_30d}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="onsite-btn-outline" disabled={running === c.id} onClick={() => handleRun(c.id)}>
                        {running === c.id ? 'Running…' : 'Run now'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showAddCheck && (
        <AddCheckModal base={base} onClose={() => setShowAddCheck(false)} onCreated={() => { setShowAddCheck(false); fetchChecks(); }} />
      )}
    </div>
  );
}

function AddCheckModal({ base, onClose, onCreated }: { base: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`${base}/health-checks`, { method: 'POST', body: JSON.stringify({ name: name.trim(), url: url.trim() }) });
      onCreated();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add health check', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Add health check" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="onsite-form-group">
          <label>Name *</label>
          <input type="text" className="onsite-input" placeholder="Homepage" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="onsite-form-group">
          <label>URL *</label>
          <input type="text" className="onsite-input" placeholder="https://clientsite.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
        <ModalActions onClose={onClose} submitting={submitting} submitLabel="Add check" busyLabel="Adding…" />
      </form>
    </ModalShell>
  );
}

/* ───────────────────────── Shared modal chrome ───────────────────────── */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
        <div className="onsite-card-header">
          <h3 className="onsite-card-title">{title}</h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onClose, submitting, submitLabel, busyLabel }: { onClose: () => void; submitting: boolean; submitLabel: string; busyLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? busyLabel : submitLabel}</button>
    </div>
  );
}
