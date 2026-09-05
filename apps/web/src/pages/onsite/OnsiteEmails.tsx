import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { OnsiteDomain } from '@hudumika/types';
import './Onsite.css';

interface MailDnsStatus {
  domain: string;
  domain_id: string;
  mx: { id: string; name: string; value: string; priority: number | null }[];
  spf: { id: string; value: string } | null;
  dkim: { id: string; name: string }[];
  dmarc: { id: string; value: string } | null;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`onsite-badge ${ok ? 'active' : 'inactive'}`} style={{ fontSize: '0.72rem' }}>
      <Icon name={ok ? 'checkCircle' : 'alertCircle'} size={12} />
      {label}
    </span>
  );
}

export function OnsiteEmails() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [mailDns, setMailDns] = useState<Record<string, MailDnsStatus>>({});
  const [mailboxStatus, setMailboxStatus] = useState<{ gmail: string; outlook: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/onsite/domains'),
      apiFetch('/v1/settings'),
    ]).then(async ([domainsRes, settingsRes]: [any, any]) => {
      const list: OnsiteDomain[] = Array.isArray(domainsRes) ? domainsRes : [];
      setDomains(list);
      setMailboxStatus({
        gmail: settingsRes?.email?.gmailStatus ?? '',
        outlook: settingsRes?.email?.outlookStatus ?? '',
      });

      const entries = await Promise.all(list.map(async (d) => {
        try {
          const status = await apiFetch(`/v1/onsite/domains/${d.id}/mail-dns`);
          return [d.id, status] as const;
        } catch {
          return [d.id, null] as const;
        }
      }));
      const map: Record<string, MailDnsStatus> = {};
      for (const [id, status] of entries) if (status) map[id] = status;
      setMailDns(map);
    }).catch(() => {
      setDomains([]);
      setMailboxStatus({ gmail: '', outlook: '' });
    }).finally(() => setLoading(false));
  }, []);

  const isConnected = mailboxStatus?.gmail === 'authorized' || mailboxStatus?.outlook === 'authorized';

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Emails']}
        titlePlain="Mail"
        titleEm="records"
        subtitle="Real DNS mail records for each domain you host, and the mailbox connected to send/receive as them."
      />

      {loading ? (
        <div className="onsite-card"><SectionLoading /></div>
      ) : (
        <>
          <div className="onsite-card" style={{ marginBottom: '1rem' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title"><Icon name="mail" size={16} />Connected mailbox</h3>
              <span className={`onsite-badge ${isConnected ? 'active' : 'inactive'}`}>
                {isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink2)' }}>
              {isConnected
                ? `This workspace sends and receives mail through its connected ${mailboxStatus?.gmail === 'authorized' ? 'Gmail' : 'Outlook'} account.`
                : 'No mailbox is connected yet. Connecting one lets this workspace send and receive real mail — the same account used across the platform, not a separate inbox per domain.'}
            </p>
            <div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/workspace/settings?s=email')}>
                {isConnected ? 'Manage connection' : 'Connect a mailbox'}
              </button>
            </div>
          </div>

          {domains.length === 0 ? (
            <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <Icon name="mail" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)' }}>No domains yet</h3>
              <p style={{ margin: '0.4rem 0 1rem', fontSize: '0.875rem', color: 'var(--ink2)' }}>
                Add a domain to see and manage its mail DNS records here.
              </p>
              <button className="btn btn-primary" onClick={() => navigate('/onsite/domains')}>
                <Icon name="plus" size={14} /> Add a domain
              </button>
            </div>
          ) : (
            <div className="onsite-card">
              <div className="onsite-card-header">
                <h3 className="onsite-card-title">Mail DNS by domain</h3>
              </div>
              <div className="onsite-table-wrapper">
                <table className="onsite-table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>MX</th>
                      <th>SPF</th>
                      <th>DKIM</th>
                      <th>DMARC</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d) => {
                      const status = mailDns[d.id];
                      return (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 600 }}>{d.domain}</td>
                          <td><StatusPill ok={!!status && status.mx.length > 0} label={status && status.mx.length > 0 ? `${status.mx.length} record${status.mx.length === 1 ? '' : 's'}` : 'Missing'} /></td>
                          <td><StatusPill ok={!!status?.spf} label={status?.spf ? 'Set' : 'Missing'} /></td>
                          <td><StatusPill ok={!!status && status.dkim.length > 0} label={status && status.dkim.length > 0 ? 'Set' : 'Missing'} /></td>
                          <td><StatusPill ok={!!status?.dmarc} label={status?.dmarc ? 'Set' : 'Missing'} /></td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to={`/onsite/domains/${d.id}/dns`} className="onsite-btn-outline">
                              Manage DNS
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
