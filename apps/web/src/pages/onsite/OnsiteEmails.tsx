import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Input } from '../../components/ui/input.js';
import { Combobox } from '../../components/ui/combobox.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import type { OnsiteEmailDomain, OnsiteEmailMailbox, OnsiteDomain } from '@hudumika/types';
import './Onsite.css';

interface MailDnsVerification {
  mx: { found: boolean; records: string[] };
  spf: { found: boolean; record: string | null };
  dkim: { found: boolean };
  dmarc: { found: boolean; record: string | null };
}

interface TenantUser { id: string; name: string; email: string }

export function OnsiteEmails() {
  const navigate = useNavigate();
  const [emailDomains, setEmailDomains] = useState<OnsiteEmailDomain[]>([]);
  const [allDomains, setAllDomains] = useState<OnsiteDomain[]>([]);
  const [mailboxStatus, setMailboxStatus] = useState<{ gmail: string; outlook: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Add email domain dialog
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [addDomainId, setAddDomainId] = useState('');
  const [addProvider, setAddProvider] = useState<string>('platform');
  const [addSaving, setAddSaving] = useState(false);

  // Mailbox management
  const [selectedDomain, setSelectedDomain] = useState<OnsiteEmailDomain | null>(null);
  const [mailboxes, setMailboxes] = useState<OnsiteEmailMailbox[]>([]);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [showAddMailbox, setShowAddMailbox] = useState(false);
  const [mbLocalPart, setMbLocalPart] = useState('');
  const [mbDisplayName, setMbDisplayName] = useState('');
  const [mbType, setMbType] = useState<string>('mailbox');
  const [mbUserId, setMbUserId] = useState('');
  const [mbForwardTo, setMbForwardTo] = useState('');
  const [mbSaving, setMbSaving] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  // DNS verification
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verification, setVerification] = useState<Record<string, MailDnsVerification>>({});

  const loadAll = () => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      apiFetch('/v1/onsite/email-domains'),
      apiFetch('/v1/onsite/domains'),
      apiFetch('/v1/onsite/mailbox-status'),
    ]).then(([edRes, dRes, msRes]: any[]) => {
      setEmailDomains(Array.isArray(edRes) ? edRes : []);
      setAllDomains(Array.isArray(dRes) ? dRes : []);
      setMailboxStatus(msRes ?? null);
    }).catch(err => setLoadError(err.message || 'Failed to load email configuration'))
      .finally(() => setLoading(false));
  };
  useEffect(loadAll, []);

  const loadMailboxes = (ed: OnsiteEmailDomain) => {
    setSelectedDomain(ed);
    setMailboxLoading(true);
    apiFetch(`/v1/onsite/email-domains/${ed.id}/mailboxes`)
      .then((res: any) => setMailboxes(Array.isArray(res) ? res : []))
      .catch(() => setMailboxes([]))
      .finally(() => setMailboxLoading(false));
  };

  const handleAddDomain = async () => {
    if (!addDomainId) return;
    setAddSaving(true);
    try {
      await apiFetch('/v1/onsite/email-domains', { method: 'POST', body: JSON.stringify({ domain_id: addDomainId, provider: addProvider }) });
      showAlert('Email enabled on domain', { variant: 'success' });
      setShowAddDomain(false);
      setAddDomainId('');
      loadAll();
    } catch (err: any) { showAlert(err.message || 'Failed', { variant: 'error' }); }
    finally { setAddSaving(false); }
  };

  const handleVerify = async (ed: OnsiteEmailDomain) => {
    setVerifying(ed.id);
    try {
      const result = await apiFetch(`/v1/onsite/email-domains/${ed.id}/verify`, { method: 'POST' });
      setVerification(prev => ({ ...prev, [ed.id]: result }));
      loadAll();
      showAlert('DNS verification complete', { variant: 'success' });
    } catch (err: any) { showAlert(err.message || 'Verification failed', { variant: 'error' }); }
    finally { setVerifying(null); }
  };

  const handleDeleteDomain = async (ed: OnsiteEmailDomain) => {
    if (!(await showConfirm(`Remove email configuration for ${ed.domain}? This does not delete DNS records or mailboxes at the provider.`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/onsite/email-domains/${ed.id}`, { method: 'DELETE' });
      showAlert('Email domain removed', { variant: 'success' });
      if (selectedDomain?.id === ed.id) { setSelectedDomain(null); setMailboxes([]); }
      loadAll();
    } catch (err: any) { showAlert(err.message || 'Failed', { variant: 'error' }); }
  };

  const handleAddMailbox = async () => {
    if (!selectedDomain || !mbLocalPart) return;
    setMbSaving(true);
    try {
      const payload: Record<string, unknown> = {
        local_part: mbLocalPart, display_name: mbDisplayName || undefined, type: mbType,
      };
      if (mbType === 'mailbox' && mbUserId) payload.linked_user_id = mbUserId;
      if ((mbType === 'forward' || mbType === 'group') && mbForwardTo) {
        payload.forward_to = mbForwardTo.split(',').map(s => s.trim()).filter(Boolean);
      }
      await apiFetch(`/v1/onsite/email-domains/${selectedDomain.id}/mailboxes`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      showAlert('Mailbox created', { variant: 'success' });
      setShowAddMailbox(false);
      setMbLocalPart(''); setMbDisplayName(''); setMbType('mailbox'); setMbUserId(''); setMbForwardTo('');
      loadMailboxes(selectedDomain);
      loadAll();
    } catch (err: any) { showAlert(err.message || 'Failed', { variant: 'error' }); }
    finally { setMbSaving(false); }
  };

  const handleDeleteMailbox = async (mb: OnsiteEmailMailbox) => {
    if (!selectedDomain || !(await showConfirm(`Delete ${mb.full_address}?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/email-domains/${selectedDomain.id}/mailboxes/${mb.id}`, { method: 'DELETE' });
      showAlert('Mailbox deleted', { variant: 'success' });
      loadMailboxes(selectedDomain);
      loadAll();
    } catch (err: any) { showAlert(err.message || 'Failed', { variant: 'error' }); }
  };

  const openAddMailbox = () => {
    setShowAddMailbox(true);
    if (tenantUsers.length === 0) {
      apiFetch('/v1/onsite/email-users')
        .then((res: any) => setTenantUsers(Array.isArray(res) ? res : []))
        .catch(() => setTenantUsers([]));
    }
  };

  const isConnected = mailboxStatus?.gmail === 'authorized' || mailboxStatus?.outlook === 'authorized';
  const enabledDomainIds = new Set(emailDomains.map(ed => ed.domain_id));
  const availableDomains = allDomains.filter(d => !enabledDomainIds.has(d.id) && d.status === 'active');

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Emails']}
        titlePlain="Email"
        titleEm="hosting"
        subtitle="Manage email domains, mailboxes, aliases and forwarding for your workspace."
        actions={
          <Button onClick={() => setShowAddDomain(true)} disabled={availableDomains.length === 0}>
            <Icon name="plus" size={14} /> Enable email on a domain
          </Button>
        }
      />

      {loadError && <Banner variant="error" title="Email configuration unavailable" action={<Button variant="outline" onClick={loadAll}>Retry</Button>}>{loadError}</Banner>}
      {loading ? <SectionLoading /> : loadError ? null : (
        <>
          {/* Connected mailbox card */}
          <div className="onsite-card" style={{ marginBottom: '1rem' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title"><Icon name="mail" size={16} /> Platform mailbox</h3>
              <Badge variant={isConnected ? 'success' : 'gray'}>{isConnected ? 'Connected' : 'Not connected'}</Badge>
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--ink2)' }}>
              {isConnected
                ? `This workspace sends and receives mail through its connected ${mailboxStatus?.gmail === 'authorized' ? 'Gmail' : 'Outlook'} account.`
                : 'Connect a Gmail or Outlook account, or configure SMTP credentials in workspace settings, to enable sending and receiving from the Email app.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/workspace/settings?s=email')}>
              <Icon name="settings" size={14} /> {isConnected ? 'Manage connection' : 'Connect a mailbox'}
            </Button>
          </div>

          {/* Email domains */}
          {emailDomains.length === 0 ? (
            <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <Icon name="mail" size={40} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>No email domains configured</h3>
              <p style={{ margin: '0.5rem 0 1.25rem', fontSize: '0.875rem', color: 'var(--ink2)' }}>
                Enable email on one of your domains to create mailboxes, aliases and forwarding rules.
              </p>
              {availableDomains.length > 0 ? (
                <Button onClick={() => setShowAddDomain(true)}>
                  <Icon name="plus" size={14} /> Enable email on a domain
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate('/onsite/domains')}>
                  <Icon name="globe" size={14} /> Add a domain first
                </Button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: selectedDomain ? '1fr 1fr' : '1fr', gap: '1rem' }}>
              {/* Left: email domain list */}
              <div className="onsite-card">
                <div className="onsite-card-header">
                  <h3 className="onsite-card-title">Email domains</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {emailDomains.map(ed => {
                    const allVerified = ed.mx_verified && ed.spf_verified && ed.dkim_verified && ed.dmarc_verified;
                    const isSelected = selectedDomain?.id === ed.id;
                    return (
                      <div key={ed.id} className="onsite-card" style={{
                        cursor: 'pointer', border: isSelected ? '2px solid var(--teal)' : undefined,
                        background: isSelected ? 'var(--teal-l)' : undefined,
                      }} onClick={() => loadMailboxes(ed)}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{ed.domain}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ink2)', marginTop: '0.2rem' }}>
                              {ed.provider === 'platform' ? 'cPanel' : ed.provider === 'google' ? 'Google Workspace' : ed.provider === 'microsoft' ? 'Microsoft 365' : 'External'} · {ed.mailbox_count ?? 0} mailbox{(ed.mailbox_count ?? 0) !== 1 ? 'es' : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                            <Badge variant={allVerified ? 'success' : ed.mx_verified ? 'warning' : 'gray'}>
                              {allVerified ? 'Verified' : ed.mx_verified ? 'Partial' : 'Unverified'}
                            </Badge>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          <Badge variant={ed.mx_verified ? 'success' : 'gray'}>MX</Badge>
                          <Badge variant={ed.spf_verified ? 'success' : 'gray'}>SPF</Badge>
                          <Badge variant={ed.dkim_verified ? 'success' : 'gray'}>DKIM</Badge>
                          <Badge variant={ed.dmarc_verified ? 'success' : 'gray'}>DMARC</Badge>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleVerify(ed); }}
                            disabled={verifying === ed.id}>
                            {verifying === ed.id ? <ButtonSpinner /> : <Icon name="refresh" size={12} />} {verifying === ed.id ? 'Checking…' : 'Verify DNS'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/onsite/domains/${ed.domain_id}/dns`); }}>
                            <Icon name="settings" size={12} /> DNS
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/onsite/emails/${ed.id}/setup`); }}>Mail setup</Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteDomain(ed); }} title="Remove domain">
                            <Icon name="trash2" size={12} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: mailboxes for selected domain */}
              {selectedDomain && (
                <div className="onsite-card">
                  <div className="onsite-card-header">
                    <h3 className="onsite-card-title">
                      <Icon name="inbox" size={16} /> Mailboxes on {selectedDomain.domain}
                    </h3>
                    <Button size="sm" onClick={openAddMailbox}>
                      <Icon name="plus" size={12} /> Add
                    </Button>
                  </div>
                  {mailboxLoading ? <SectionLoading /> : mailboxes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      <Icon name="inbox" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.5rem' }} />
                      <p style={{ color: 'var(--ink2)', fontSize: '0.875rem' }}>Create a mailbox record, then provision it in Mail setup.</p>
                      <Button size="sm" onClick={openAddMailbox}><Icon name="plus" size={12} /> Create mailbox</Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {mailboxes.map(mb => (
                        <div key={mb.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                          padding: '0.6rem 0.75rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{mb.full_address}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ink2)' }}>
                              {mb.display_name ? `${mb.display_name} · ` : ''}
                              {mb.type === 'mailbox' ? (mb.linked_user_name ? `Linked to ${mb.linked_user_name}` : 'Mailbox') :
                               mb.type === 'alias' ? 'Alias' :
                               mb.type === 'forward' ? `Forwards to ${(mb.forward_to as string[]).join(', ')}` :
                               `Group (${(mb.forward_to as string[]).length} members)`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                            <Badge variant={mb.type === 'mailbox' ? 'brand' : mb.type === 'forward' ? 'info' : 'gray'}>
                              {mb.type}
                            </Badge>
                            {mb.type === 'mailbox' && mb.linked_user_id && selectedDomain?.provider === 'platform' && (
                              <Badge variant="info" title="Email app account created — credentials must be configured before send/receive is active.">
                                <Icon name="mail" size={10} /> Pending setup
                              </Badge>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteMailbox(mb)} title="Delete mailbox">
                              <Icon name="trash2" size={12} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Link to Email app */}
                  <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <Icon name="externalLink" size={14} color="var(--teal)" />
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Email app</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink2)' }}>
                      Users linked to a mailbox above will have an Email app account pre-configured. Real credentials must be added in the Email app before send/receive is active.
                    </p>
                    <Button variant="outline" size="sm" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/email')}>
                      Open Email app
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add email domain dialog */}
      <Dialog open={showAddDomain} onOpenChange={setShowAddDomain}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Enable email on a domain</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Domain</label>
                <Combobox
                  options={availableDomains.map(d => ({ value: d.id, label: d.domain }))}
                  value={addDomainId}
                  onChange={setAddDomainId}
                  placeholder="Select a domain"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Email provider</label>
                <Select value={addProvider} onValueChange={setAddProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">cPanel hosting</SelectItem>
                    <SelectItem value="google">Google Workspace</SelectItem>
                    <SelectItem value="microsoft">Microsoft 365</SelectItem>
                    <SelectItem value="external">External provider</SelectItem>
                  </SelectContent>
                </Select>
                <p style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.25rem' }}>
                  {addProvider === 'platform' ? 'Mailboxes will be accessible from the Email app.' :
                   addProvider === 'google' ? 'DNS records will be configured for Google Workspace mail routing.' :
                   addProvider === 'microsoft' ? 'DNS records will be configured for Microsoft 365 mail routing.' :
                   'You manage the mail server; Onsite manages the DNS records.'}
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDomain(false)}>Cancel</Button>
            <Button onClick={handleAddDomain} disabled={!addDomainId || addSaving}>
              {addSaving && <ButtonSpinner />}
              {addSaving ? 'Enabling…' : 'Enable email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add mailbox dialog */}
      <Dialog open={showAddMailbox} onOpenChange={setShowAddMailbox}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Create mailbox on {selectedDomain?.domain}</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Type</label>
                <Select value={mbType} onValueChange={setMbType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mailbox">Mailbox — a real inbox linked to a user</SelectItem>
                    <SelectItem value="alias">Alias — another name for an existing mailbox</SelectItem>
                    <SelectItem value="forward">Forward — sends mail to an external address</SelectItem>
                    <SelectItem value="group">Group — distributes to multiple addresses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Address</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Input value={mbLocalPart} onChange={e => setMbLocalPart(e.target.value)} placeholder="info" style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--ink2)', fontWeight: 500 }}>@{selectedDomain?.domain}</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Display name</label>
                <Input value={mbDisplayName} onChange={e => setMbDisplayName(e.target.value)} placeholder="Company Support" />
              </div>
              {mbType === 'mailbox' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Link to user</label>
                  <Combobox
                    options={tenantUsers.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                    value={mbUserId}
                    onChange={setMbUserId}
                    placeholder="Select a user (optional)"
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.25rem' }}>
                    The linked user will get a pre-configured Email app account for this address. Mailbox credentials must be added separately.
                  </p>
                </div>
              )}
              {(mbType === 'forward' || mbType === 'group') && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    {mbType === 'forward' ? 'Forward to' : 'Group members'}
                  </label>
                  <Input value={mbForwardTo} onChange={e => setMbForwardTo(e.target.value)}
                    placeholder="user@example.com, other@example.com" />
                  <p style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.25rem' }}>Comma-separated email addresses.</p>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMailbox(false)}>Cancel</Button>
            <Button onClick={handleAddMailbox} disabled={!mbLocalPart || mbSaving}>
              {mbSaving && <ButtonSpinner />}
              {mbSaving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
