import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDomain, OnsiteSubdomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import './Onsite.css';

export function OnsiteDomainDetail() {
  const { id } = useParams<{ id: string }>();
  const [domain, setDomain] = useState<OnsiteDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Registrar operations
  const [renewing, setRenewing] = useState(false);
  const [refreshingInfo, setRefreshingInfo] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Nameserver edit
  const [showEditNs, setShowEditNs] = useState(false);
  const [nsValues, setNsValues] = useState<string[]>(['', '']);
  const [savingNs, setSavingNs] = useState(false);

  // Subdomains
  const [subdomains, setSubdomains] = useState<OnsiteSubdomain[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [subName, setSubName] = useState('');
  const [subType, setSubType] = useState<string>('A');
  const [subValue, setSubValue] = useState('');
  const [subSaving, setSubSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/onsite/domains/${id}`)
      .then(setDomain)
      .catch((err: any) => setError(err.message ?? 'Domain not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const loadSubdomains = () => {
    if (!id) return;
    setSubLoading(true);
    apiFetch(`/v1/onsite/domains/${id}/subdomains`)
      .then((res: any) => setSubdomains(Array.isArray(res) ? res : []))
      .catch(() => setSubdomains([]))
      .finally(() => setSubLoading(false));
  };
  useEffect(loadSubdomains, [id]);

  const handleAddSubdomain = async () => {
    if (!id || !subName || !subValue) return;
    setSubSaving(true);
    try {
      await apiFetch(`/v1/onsite/domains/${id}/subdomains`, {
        method: 'POST',
        body: JSON.stringify({ name: subName, type: subType, value: subValue }),
      });
      showAlert(`${subName}.${domain?.domain} created`, { variant: 'success' });
      setShowAddSub(false);
      setSubName(''); setSubValue('');
      loadSubdomains();
    } catch (err: any) { showAlert(err.message || 'Failed to create subdomain', { variant: 'error' }); }
    finally { setSubSaving(false); }
  };

  const handleRenew = async () => {
    if (!id) return;
    setRenewing(true);
    try {
      const res = await apiFetch(`/v1/onsite/domains/${id}/renew`, { method: 'POST', body: JSON.stringify({ years: 1 }) });
      showAlert(`Domain renewed until ${new Date(res.expires_at).toLocaleDateString()}`, { variant: 'success' });
      setDomain(prev => prev ? { ...prev, expires_at: res.expires_at } : prev);
    } catch (err: any) { showAlert(err.message || 'Renewal failed', { variant: 'error' }); }
    finally { setRenewing(false); }
  };

  const handleRefreshInfo = async () => {
    if (!id) return;
    setRefreshingInfo(true);
    try {
      const res = await apiFetch(`/v1/onsite/domains/${id}/registrar-info`);
      if (res.info) {
        setDomain(prev => prev ? {
          ...prev,
          expires_at: res.info.expiresAt ?? prev.expires_at,
          auto_renew: res.info.autoRenew ?? prev.auto_renew,
          nameservers: res.info.nameservers ?? prev.nameservers,
        } : prev);
        showAlert('Domain info refreshed from registrar', { variant: 'success' });
      } else {
        showAlert('No registrar connected', { variant: 'warning' });
      }
    } catch (err: any) { showAlert(err.message || 'Failed to refresh', { variant: 'error' }); }
    finally { setRefreshingInfo(false); }
  };

  const handleUnlock = async () => {
    if (!id || !(await showConfirm('Unlock this domain? This allows transfers away from the current registrar.', { confirmLabel: 'Unlock' }))) return;
    setUnlocking(true);
    try {
      await apiFetch(`/v1/onsite/domains/${id}/unlock`, { method: 'POST' });
      showAlert('Domain unlocked', { variant: 'success' });
    } catch (err: any) { showAlert(err.message || 'Unlock failed', { variant: 'error' }); }
    finally { setUnlocking(false); }
  };

  const handleSaveNameservers = async () => {
    if (!id) return;
    const ns = nsValues.filter(v => v.trim());
    if (ns.length === 0) return;
    setSavingNs(true);
    try {
      await apiFetch(`/v1/onsite/domains/${id}/nameservers`, {
        method: 'POST', body: JSON.stringify({ nameservers: ns }),
      });
      setDomain(prev => prev ? { ...prev, nameservers: ns } : prev);
      showAlert('Nameservers updated', { variant: 'success' });
      setShowEditNs(false);
    } catch (err: any) { showAlert(err.message || 'Failed to update nameservers', { variant: 'error' }); }
    finally { setSavingNs(false); }
  };

  const handleDeleteSubdomain = async (name: string) => {
    if (!id || !(await showConfirm(`Delete ${name}.${domain?.domain}? This removes all DNS records for this subdomain.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/domains/${id}/subdomains/${name}`, { method: 'DELETE' });
      showAlert('Subdomain deleted', { variant: 'success' });
      loadSubdomains();
    } catch (err: any) { showAlert(err.message || 'Failed', { variant: 'error' }); }
  };

  if (loading) return <div className="onsite-page"><SectionLoading /></div>;

  if (error || !domain) {
    return (
      <div className="onsite-page">
        <Banner variant="error" title="Domain not found">{error || 'Domain not found'}</Banner>
        <Link to="/onsite/domains"><Button variant="outline" style={{ marginTop: '1rem' }}>Back to Domains</Button></Link>
      </div>
    );
  }

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Domains', domain.domain]}
        titlePlain="Domain"
        titleEm="detail"
        subtitle={`Manage DNS, subdomains, SSL and nameservers for ${domain.domain}.`}
        actions={
          <Link to={`/onsite/domains/${domain.id}/dns`}>
            <Button><Icon name="sliders" size={14} /> Manage DNS</Button>
          </Link>
        }
      />

      {/* Transfer progress banner */}
      {(() => {
        let transferInfo: any = null;
        try { transferInfo = domain.notes ? JSON.parse(domain.notes) : null; } catch { /* not JSON */ }
        if (!transferInfo?.transfer) return null;

        const status = transferInfo.transfer_status ?? (transferInfo.error ? 'failed' : 'pending');
        const statusLabels: Record<string, string> = {
          pending: 'Transfer pending — waiting for approval from the current registrar.',
          in_progress: 'Transfer in progress — the domain is being moved. This can take up to 7 days.',
          completed: 'Transfer complete — the domain is now managed through this registrar.',
          failed: `Transfer failed${transferInfo.error ? `: ${transferInfo.error}` : '.'}`,
        };

        return (
          <Banner
            variant={status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'warning'}
            title={`Domain transfer: ${status.replace(/_/g, ' ')}`}
            action={status === 'pending' || status === 'in_progress' ? (
              <Button variant="outline" size="sm" onClick={handleRefreshInfo} disabled={refreshingInfo}>
                <Icon name="refresh" size={12} /> {refreshingInfo ? 'Checking…' : 'Check status'}
              </Button>
            ) : undefined}
          >
            {statusLabels[status] ?? `Transfer status: ${status}`}
            {transferInfo.transfer_id && (
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.25rem' }}>
                Transfer ID: {transferInfo.transfer_id}
              </span>
            )}
          </Banner>
        );
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1rem' }}>
        {/* Domain overview card */}
        <div className="onsite-card">
          <h3 className="onsite-card-title">Domain overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
              <div><Badge variant={domain.status === 'active' ? 'success' : domain.status === 'pending' ? 'warning' : 'gray'}>{domain.status}</Badge></div>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registrar</label>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{domain.registrar || 'Self-managed'}</div>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DNS</label>
              <div><Badge variant={domain.dns_status === 'active' ? 'success' : domain.dns_status === 'failed' ? 'error' : 'gray'}>{domain.dns_status}</Badge></div>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SSL</label>
              <div><Badge variant={domain.ssl_status === 'active' ? 'success' : domain.ssl_status === 'expiring' ? 'warning' : domain.ssl_status === 'expired' ? 'error' : 'gray'}>{domain.ssl_status}</Badge></div>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto-renew</label>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{domain.auto_renew ? 'Enabled' : 'Disabled'}</div>
            </div>
            {domain.expires_at && (
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expires</label>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{new Date(domain.expires_at).toLocaleDateString()}</div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <Link to={`/onsite/domains/${domain.id}/dns`}>
              <Button variant="outline" size="sm"><Icon name="sliders" size={12} /> DNS records</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleRefreshInfo} disabled={refreshingInfo}>
              <Icon name="refresh" size={12} /> {refreshingInfo ? 'Refreshing…' : 'Refresh from registrar'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRenew} disabled={renewing}>
              <Icon name="calendar" size={12} /> {renewing ? 'Renewing…' : 'Renew 1 year'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleUnlock} disabled={unlocking}>
              <Icon name="unlock" size={12} /> {unlocking ? 'Unlocking…' : 'Unlock'}
            </Button>
            <Link to="/onsite/ssl">
              <Button variant="outline" size="sm"><Icon name="shield" size={12} /> SSL</Button>
            </Link>
            <Link to="/onsite/emails">
              <Button variant="outline" size="sm"><Icon name="mail" size={12} /> Email</Button>
            </Link>
          </div>
        </div>

        {/* Nameservers card */}
        <div className="onsite-card">
          <div className="onsite-card-header">
            <h3 className="onsite-card-title">Nameservers</h3>
            <Button variant="outline" size="sm" onClick={() => {
              const current = domain.nameservers?.length ? domain.nameservers.map(String) : ['ns1.hudumika.tz', 'ns2.hudumika.tz'];
              setNsValues([...current, '', ''].slice(0, 4));
              setShowEditNs(true);
            }}>
              <Icon name="edit" size={12} /> Edit
            </Button>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink2)', margin: '0 0 0.75rem' }}>
            Set these nameservers at your registrar to route DNS through Onsite.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {(domain.nameservers?.length ? domain.nameservers : ['ns1.hudumika.tz', 'ns2.hudumika.tz']).map((ns, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <Icon name="server" size={14} color="var(--ink3)" />
                <code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{typeof ns === 'string' ? ns : String(ns)}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subdomains section */}
      <div className="onsite-card" style={{ marginTop: '1rem' }}>
        <div className="onsite-card-header">
          <h3 className="onsite-card-title"><Icon name="layers" size={16} /> Subdomains</h3>
          <Button size="sm" onClick={() => setShowAddSub(true)}>
            <Icon name="plus" size={12} /> Add subdomain
          </Button>
        </div>

        {subLoading ? <SectionLoading /> : subdomains.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Icon name="layers" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.5rem' }} />
            <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              No subdomains yet. Create one to point a subdomain to a server or website.
            </p>
            <Button size="sm" onClick={() => setShowAddSub(true)}>
              <Icon name="plus" size={12} /> Create subdomain
            </Button>
          </div>
        ) : (
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Subdomain</th>
                  <th>Type</th>
                  <th>Points to</th>
                  <th>Website</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subdomains.map(sub => (
                  <tr key={sub.name}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{sub.full_domain}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{sub.records.length} record{sub.records.length !== 1 ? 's' : ''}</div>
                    </td>
                    <td><Badge variant="gray">{sub.records[0]?.type ?? '—'}</Badge></td>
                    <td><code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{sub.records[0]?.value ?? '—'}</code></td>
                    <td>{sub.has_website ? (
                      <Link to={`/onsite/websites/${sub.website_id}`} style={{ color: 'var(--teal)', fontSize: '0.8125rem' }}>{sub.website_name}</Link>
                    ) : <span style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>—</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteSubdomain(sub.name)}>
                        <Icon name="trash2" size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit nameservers dialog */}
      <Dialog open={showEditNs} onOpenChange={setShowEditNs}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Edit nameservers</DialogTitle></DialogHeader>
          <DialogBody>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink2)', margin: '0 0 1rem' }}>
              When a registrar is connected, this updates nameservers at the registrar and locally. Otherwise, only the local record is updated.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {nsValues.map((ns, i) => (
                <Input key={i} value={ns} onChange={e => {
                  const next = [...nsValues];
                  next[i] = e.target.value;
                  setNsValues(next);
                }} placeholder={`ns${i + 1}.example.com`} />
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditNs(false)}>Cancel</Button>
            <Button onClick={handleSaveNameservers} disabled={nsValues.filter(v => v.trim()).length === 0 || savingNs}>
              {savingNs ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add subdomain dialog */}
      <Dialog open={showAddSub} onOpenChange={setShowAddSub}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Create subdomain</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Subdomain name</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Input value={subName} onChange={e => setSubName(e.target.value)} placeholder="blog" style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--ink2)', fontWeight: 500, flexShrink: 0 }}>.{domain.domain}</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Record type</label>
                <Select value={subType} onValueChange={setSubType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — Point to an IPv4 address</SelectItem>
                    <SelectItem value="CNAME">CNAME — Point to another hostname</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  {subType === 'A' ? 'IPv4 address' : 'Target hostname'}
                </label>
                <Input value={subValue} onChange={e => setSubValue(e.target.value)}
                  placeholder={subType === 'A' ? '203.0.113.10' : 'your-app.netlify.app'} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSub(false)}>Cancel</Button>
            <Button onClick={handleAddSubdomain} disabled={!subName || !subValue || subSaving}>
              {subSaving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
