import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteProviderConnection, OnsiteDnsComparisonRecord, OnsiteDnsSyncProposal } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import './Onsite.css';

function AgencyRelationshipCard() {
  const navigate = useNavigate();
  const [agency, setAgency] = useState<{ agency_tenant_id: string; agency_name: string } | null | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/onsite/agency/my-agency')
      .then((res: any) => setAgency(res?.agency ?? null))
      .catch(() => setAgency(null));
  }, []);

  const handleLeave = async () => {
    if (!agency) return;
    const ok = await showConfirm(
      `Leave ${agency.agency_name}? You'll keep your account and all your data, but lose Onsite access under their package until you activate a plan of your own.`,
      { title: 'Leave this agency', variant: 'danger', confirmLabel: 'Leave' },
    );
    if (!ok) return;
    setLeaving(true);
    try {
      await apiFetch('/v1/onsite/agency/leave', { method: 'POST' });
      showAlert('You have left this agency.', { variant: 'success' });
      navigate('/onsite/activate');
    } catch (err: any) {
      showAlert(err.message || 'Failed to leave agency', { variant: 'error' });
    } finally {
      setLeaving(false);
    }
  };

  if (!agency) return null; // still loading, or not managed by anyone — nothing to show either way

  return (
    <div className="onsite-card" style={{ marginBottom: '1.5rem' }}>
      <div className="onsite-card-header">
        <h3 className="onsite-card-title">Your hosting agency</h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: 'var(--ink3)', margin: 0 }}>
          Onsite is currently managed by <strong style={{ color: 'var(--ink)' }}>{agency.agency_name}</strong> under their package.
        </p>
        <Button size="sm" variant="outline" style={{ color: 'var(--red)' }} disabled={leaving} onClick={handleLeave}>
          {leaving ? 'Leaving…' : 'Leave this agency'}
        </Button>
      </div>
    </div>
  );
}

export function OnsiteSettings() {
  const [inventory, setInventory] = useState<{ connectionId: string; domains: string[]; page: number } | null>(null);
  const [inventoryError, setInventoryError] = useState('');
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [providerDns, setProviderDns] = useState<{ domain: string; fingerprint: string; records: OnsiteDnsComparisonRecord[]; comparison: { matched: number; storedOnly: OnsiteDnsComparisonRecord[]; providerOnly: OnsiteDnsComparisonRecord[]; disabledProviderRecords: number } | null; proposals: OnsiteDnsSyncProposal[] } | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState('');
  const [dnsImporting, setDnsImporting] = useState(false);
  const publishDnsRecord = async (record: OnsiteDnsComparisonRecord) => {
    if (!inventory || !providerDns || dnsImporting) return;
    const ok = await showConfirm(`Publish ${record.name} ${record.type} (TTL ${record.ttl}) with value ${record.value} to Hostinger for ${providerDns.domain}? This changes provider DNS. Public propagation may take time.`, { title: 'Publish DNS record', confirmLabel: 'Publish' });
    if (!ok) return;
    setDnsImporting(true);
    try {
      const result = await apiFetch(`/v1/onsite/provider-connections/${inventory.connectionId}/hostinger-dns/publish`, {
        method: 'POST', body: JSON.stringify({ confirmed: true, domain: providerDns.domain, page: inventory.page, fingerprint: providerDns.fingerprint, record }),
      }) as { published: boolean };
      showAlert(result.published ? 'Provider record published and re-read. Public propagation is not yet verified.' : 'Provider already contains this record.', { variant: 'success' });
      await loadProviderDns(providerDns.domain);
    } catch (error: any) { showAlert(error.message || 'Unable to publish DNS', { variant: 'error' }); }
    finally { setDnsImporting(false); }
  };
  const importDnsRecord = async (record: OnsiteDnsComparisonRecord) => {
    if (!inventory || !providerDns || dnsImporting) return;
    setDnsImporting(true);
    try {
      const result = await apiFetch(`/v1/onsite/provider-connections/${inventory.connectionId}/hostinger-dns/import`, {
        method: 'POST', body: JSON.stringify({ domain: providerDns.domain, page: inventory.page, record }),
      }) as { imported: boolean };
      showAlert(result.imported ? 'Record saved in Onsite. Public DNS is unchanged.' : 'Record already exists in Onsite.', { variant: 'success' });
      await loadProviderDns(providerDns.domain);
    } catch (error: any) { showAlert(error.message || 'Unable to import DNS record', { variant: 'error' }); }
    finally { setDnsImporting(false); }
  };
  const loadProviderDns = async (domain: string) => {
    if (!inventory || dnsLoading) return;
    setDnsLoading(true); setDnsError(''); setProviderDns(null);
    try {
      setProviderDns(await apiFetch(`/v1/onsite/provider-connections/${inventory.connectionId}/hostinger-dns?domain=${encodeURIComponent(domain)}&page=${inventory.page}`));
    } catch (error: any) { setDnsError(error.message || 'Unable to read provider DNS'); }
    finally { setDnsLoading(false); }
  };
  const [importing, setImporting] = useState(false);
  const [importedDomains, setImportedDomains] = useState<string[]>([]);
  const importWebsite = async (domain: string) => {
    if (!inventory || importing) return;
    setImporting(true);
    try {
      const result = await apiFetch(`/v1/onsite/provider-connections/${inventory.connectionId}/hostinger-websites/import`, {
        method: 'POST', body: JSON.stringify({ domain, page: inventory.page }),
      }) as { imported: boolean };
      setImportedDomains(current => [...current, domain]);
      showAlert(result.imported ? 'Website added as inactive configuration. Hosting and DNS are unchanged.' : 'Website is already recorded in Onsite.', { variant: 'success' });
    } catch (error: any) {
      showAlert(error.message || 'Unable to import website', { variant: 'error' });
    } finally { setImporting(false); }
  };
  const loadInventory = async (connectionId: string, page = 1) => {
    setProviderDns(null); setDnsError('');
    setImportedDomains([]);
    setInventoryLoading(true);
    setInventoryError('');
    setInventory(null);
    try {
      const result = await apiFetch(`/v1/onsite/provider-connections/${connectionId}/hostinger-websites?page=${page}`) as { domains: string[]; page: number };
      setInventory({ ...result, connectionId });
    } catch (error: any) {
      setInventoryError(error.message || 'Unable to read website inventory');
    } finally {
      setInventoryLoading(false);
    }
  };
  const [loadError, setLoadError] = useState('');
  const [connections, setConnections] = useState<OnsiteProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [provider, setProvider] = useState('github');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [externalId, setExternalId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchConnections = () => {
    setLoadError('');
    setLoading(true);
    apiFetch('/v1/onsite/provider-connections')
      .then(setConnections)
      .catch(error => setLoadError(error.message || 'Unable to load provider connections'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/provider-connections', {
        method: 'POST',
        body: JSON.stringify({ provider, name, token, external_id: externalId.trim() || undefined }),
      });
      setShowAddModal(false);
      setName('');
      setToken('');
      setExternalId('');
      fetchConnections();
    } catch (err: any) {
      showAlert(err.message || 'Failed to connect provider', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const externalIdHelp: Record<string, { label: string; placeholder: string }> = {
    circleci: { label: 'Project Slug', placeholder: 'gh/owner/repo' },
    github: { label: 'Repository (+ optional workflow file)', placeholder: 'owner/repo or owner/repo/deploy.yml' },
    cloudflare: { label: 'Account ID / Project Name', placeholder: 'a1b2c3.../my-pages-project' },
    digitalocean: { label: 'App ID', placeholder: '4f6c71e2-...' },
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Settings']}
        titlePlain="Provider"
        titleEm="connections"
        subtitle="Connect infrastructure providers. Available operations depend on the provider and its verified permissions."
        actions={
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Connect Provider
          </Button>
        }
      />

      <AgencyRelationshipCard />
      {loadError && <Banner variant="error" title="Provider connections unavailable" action={<Button variant="outline" onClick={fetchConnections}>Retry</Button>}>{loadError}</Banner>}

      <div className="onsite-grid-2">
        <div className="onsite-card">
          <h3 className="onsite-card-title">Connected Providers</h3>
          {loading ? (
            <p style={{ color: 'var(--ink3)' }}>Loading provider connections…</p>
          ) : loadError && connections.length === 0 ? null : connections.length === 0 ? (
            <p style={{ color: 'var(--ink3)', padding: '1rem 0' }}>
              No external providers connected yet. Connect GitHub or CircleCI to enable automated repository deployments.
            </p>
          ) : (
            <div className="onsite-table-wrapper">
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Account Label</th>
                    <th>Status</th>
                    <th>Connected</th>
                    <th>Inventory</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{c.provider}</td>
                      <td>{c.name}</td>
                      <td>
                        <Badge variant={c.status === 'active' ? 'success' : 'error'}>{c.status}</Badge>
                      </td>
                      <td style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td>{c.provider === 'hostinger' && <Button size="sm" variant="outline" disabled={inventoryLoading || c.status !== 'active'} onClick={() => loadInventory(c.id)}>View websites</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {inventoryError && <Banner variant="error" title="Hostinger inventory unavailable">{inventoryError}</Banner>}
        {inventoryLoading && <p>Loading Hostinger websites…</p>}
        {inventory && <div className="onsite-card">
          <h3 className="onsite-card-title">Hostinger websites — page {inventory.page}</h3>
          <p style={{ color: 'var(--ink3)' }}>Import records a website as inactive Onsite configuration. It does not change hosting, DNS or the registrar.</p>
          {inventory.domains.length ? <ul>{inventory.domains.map(domain => <li key={domain} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', overflowWrap: 'anywhere' }}><span>{domain}</span><Button size="sm" variant="outline" disabled={importing || importedDomains.includes(domain)} onClick={() => importWebsite(domain)}>{importedDomains.includes(domain) ? 'Recorded' : 'Import website'}</Button><Button size="sm" variant="outline" disabled={dnsLoading} onClick={() => loadProviderDns(domain)}>Read provider DNS</Button></li>)}</ul> : <p>No websites returned on this page.</p>}
          {dnsLoading && <p>Reading Hostinger DNS…</p>}
          {dnsError && <Banner variant="error" title="Provider DNS unavailable">{dnsError}</Banner>}
          {providerDns && <div>
            <h4>Hostinger DNS: {providerDns.domain}</h4>
            <p>Provider records only. Onsite configuration and public DNS propagation have not been changed or verified.</p>
            {providerDns.comparison ? <p>{providerDns.comparison.matched} exact matches · {providerDns.comparison.storedOnly.length} saved-only · {providerDns.comparison.providerOnly.length} provider-only · {providerDns.comparison.disabledProviderRecords} disabled provider records. Comparison includes TTL and literal values; differences require review, especially MX/SRV priorities.</p> : <p>Add this domain to your Onsite domain portfolio to compare saved records.</p>}
            {providerDns.records.length ? <ul>{providerDns.records.map((record, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{record.name} · {record.type} · TTL {record.ttl} · {record.disabled ? 'Disabled' : 'Enabled'}<br />{record.value}</li>)}</ul> : <p>No records returned.</p>}
            {providerDns.comparison && <div>
              <h4>Synchronization proposals</h4>
              <p>Import saves a selected provider record in Onsite. Publish adds a saved record to Hostinger after confirmation. Existing conflicting sets and deletions are not supported.</p>
              {providerDns.proposals.length ? providerDns.proposals.map((proposal, index) => <div key={index} className="onsite-card" style={{ marginBottom: '0.75rem', overflowWrap: 'anywhere' }}>
                <strong>{proposal.direction === 'import' ? 'Provider → Onsite' : 'Onsite → Provider'}</strong>
                <p>{proposal.record.name} · {proposal.record.type} · TTL {proposal.record.ttl}<br />{proposal.record.value}{proposal.record.priority != null ? ` · Priority ${proposal.record.priority}` : ''}</p>
                {proposal.review.length ? <ul>{proposal.review.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>No structural conflict detected. Provider validation is still required.</p>}
                {proposal.direction === 'import' && <Button size="sm" disabled={dnsImporting || proposal.review.length > 0} onClick={() => importDnsRecord(proposal.record)}>Import saved record</Button>}
                {proposal.direction === 'publish' && <Button size="sm" disabled={dnsImporting || proposal.review.length > 0 || ['NS', 'MX', 'SRV'].includes(proposal.record.type.toUpperCase())} onClick={() => publishDnsRecord(proposal.record)}>Review and publish</Button>}
              </div>) : <p>No synchronization proposals from this comparison.</p>}
            </div>}
          </div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Button size="sm" variant="outline" disabled={inventory.page <= 1} onClick={() => loadInventory(inventory.connectionId, inventory.page - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={inventory.domains.length === 0} onClick={() => loadInventory(inventory.connectionId, inventory.page + 1)}>Next</Button>
          </div>
        </div>}
        <div className="onsite-card">
          <h3 className="onsite-card-title">Supported Integrations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="gitBranch" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>GitHub</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Repository triggers & webhooks</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setProvider('github'); setShowAddModal(true); }}>Connect</Button>
            </div>

            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="circle" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>CircleCI</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>CI/CD pipelines & build notifications</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setProvider('circleci'); setShowAddModal(true); }}>Connect</Button>
            </div>

            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="globe" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>Cloudflare Pages</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Static/JAMstack deployments</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setProvider('cloudflare'); setShowAddModal(true); }}>Connect</Button>
            </div>

            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="monitor" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>DigitalOcean App Platform</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Managed app deployments</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setProvider('digitalocean'); setShowAddModal(true); }}>Connect</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Connect Modal */}
      <Dialog open={showAddModal} onOpenChange={(o) => { if (!o) setShowAddModal(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Connect Infrastructure Provider</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Provider Platform</label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github">GitHub</SelectItem>
                      <SelectItem value="circleci">CircleCI</SelectItem>
                      <SelectItem value="cloudflare">Cloudflare</SelectItem>
                      <SelectItem value="digitalocean">DigitalOcean</SelectItem>
                      <SelectItem value="hostinger">Hostinger</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="onsite-form-group">
                  <label>Connection Name / Label *</label>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="e.g. Primary GitHub Organization"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="onsite-form-group">
                  <label>Personal Access Token / API Key</label>
                  <input
                    type="password"
                    className="onsite-input"
                    placeholder="ghp_xxxxxxxxxxxx or API token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
                {provider !== 'hostinger' && (
                  <div className="onsite-form-group">
                    <label>{externalIdHelp[provider]?.label ?? 'Project Reference'} *</label>
                    <input
                      type="text"
                      className="onsite-input onsite-mono"
                      placeholder={externalIdHelp[provider]?.placeholder ?? ''}
                      value={externalId}
                      onChange={(e) => setExternalId(e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>
                      Tells Onsite which specific {provider === 'github' ? 'repository' : provider === 'cloudflare' ? 'Pages project' : provider === 'digitalocean' ? 'app' : 'project'} to deploy — a token alone only proves the credential works.
                    </span>
                  </div>
                )}
                {provider === 'hostinger' && (
                  <p style={{ color: 'var(--ink3)', fontSize: '0.875rem', margin: 0 }}>
                    Verifies read-only website inventory access. DNS synchronization and deployment are not connected yet.
                  </p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <><ButtonSpinner /> Connecting…</> : 'Save Connection'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
