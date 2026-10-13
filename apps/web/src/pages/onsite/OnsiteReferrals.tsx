import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge, type BadgeProps } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import './Onsite.css';

interface ReferralLink { referral_code: string; url: string | null; reason: string | null; }
interface Commission {
  id: string; amount: string; currency: string; rate: string; status: string;
  flagged_reason: string | null; created_at: string; paid_at: string | null;
  payout_method: string | null; referred_tenant_name: string | null;
}

const STATUS_META: Record<string, { variant: NonNullable<BadgeProps['variant']>; label: string }> = {
  pending: { variant: 'warning', label: 'Pending review' },
  flagged: { variant: 'error', label: 'Flagged for review' },
  approved: { variant: 'info', label: 'Approved — awaiting payout' },
  paid: { variant: 'success', label: 'Paid' },
  rejected: { variant: 'gray', label: 'Rejected' },
};

export function OnsiteReferrals() {
  const [link, setLink] = useState<ReferralLink | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/referrals/my-link'),
      apiFetch('/v1/referrals/commissions'),
    ]).then(([l, c]: any) => { setLink(l); setCommissions(Array.isArray(c) ? c : []); })
      .catch(() => { setLink(null); setCommissions([]); })
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link.url ?? link.referral_code);
    showAlert('Copied to clipboard.', { variant: 'success' });
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Agency', 'Referrals']}
        titlePlain="Referral"
        titleEm="program"
        subtitle="Earn a commission when a company you refer signs up and pays for its first Hudumika plan."
      />

      {loading ? (
        <div className="onsite-card"><SectionLoading /></div>
      ) : (
        <>
          <div className="onsite-card" style={{ marginBottom: '1rem' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title"><Icon name="link" size={16} />Your referral link</h3>
            </div>
            {link?.url ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input className="onsite-input onsite-mono" readOnly value={link.url} style={{ flex: 1 }} />
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Icon name="copy" size={14} /> Copy
                </Button>
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--ink2)' }}>
                  {link?.reason || 'Could not load your referral link.'}
                </p>
                <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                  Your referral code is still real — hand out <code className="onsite-mono">?ref={link?.referral_code}</code> on the signup page.
                </p>
              </div>
            )}
          </div>

          <div className="onsite-card">
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Commissions earned</h3>
            </div>
            {commissions.length === 0 ? (
              <p style={{ color: 'var(--ink3)', padding: '1rem 0' }}>
                No referrals have signed up and paid yet.
              </p>
            ) : (
              <div className="onsite-table-wrapper">
                <table className="onsite-table">
                  <thead>
                    <tr><th>Referred company</th><th>Amount</th><th>Status</th><th>Earned</th></tr>
                  </thead>
                  <tbody>
                    {commissions.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.referred_tenant_name ?? '—'}</td>
                        <td className="onsite-mono">{c.amount} {c.currency}</td>
                        <td>
                          <Badge variant={(STATUS_META[c.status] ?? STATUS_META.pending).variant} title={c.flagged_reason ?? undefined}>
                            {(STATUS_META[c.status] ?? STATUS_META.pending).label}
                          </Badge>
                        </td>
                        <td>{new Date(c.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
