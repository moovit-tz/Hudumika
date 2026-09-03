// ─── OndiPrivacy.tsx — Ondi Personal · Privacy ───────────────────
// Two real, scoped actions rather than a fictional full PDPA rights suite:
// exporting what this platform actually holds about you (GET
// /v1/security/data-export — the same rows every other self-service page
// here already reads, nothing new collected), and requesting your own
// account be deactivated (POST /v1/hr/delete-requests, now allowed for
// self-requests — see hr.routes.ts — reusing NexusHR's existing
// approve/reject workflow rather than a second one).
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiDownload } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { useAuth } from '../hooks/useAuth.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';

interface DeleteRequest { id: string; reason: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'; created_at: string }

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OndiPrivacy: React.FC = () => {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [requests, setRequests] = useState<DeleteRequest[] | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try { setRequests(await apiFetch('/v1/hr/delete-requests/mine')); } catch { setRequests([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function exportData() {
    setExporting(true);
    try {
      await apiDownload('/v1/security/data-export', `hudumika-my-data-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err: any) {
      showAlert(err.message || 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  async function submitDeactivation() {
    if (!user?.id) return;
    if (!(await showConfirm('Request deactivation of your own account? A workspace admin will need to approve it before it takes effect.', { variant: 'warning', confirmLabel: 'Submit Request' }))) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/hr/delete-requests', { method: 'POST', body: JSON.stringify({ user_id: user.id, reason: reason.trim() || undefined }) });
      setReason('');
      await reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const pending = requests?.find(r => r.status === 'PENDING');

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Your"
        titleEm="privacy"
        subtitle="Export what this workspace holds about you, or request your account be deactivated."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
        <SectionCard title="Export your data">
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
            Downloads a JSON file of your profile, security settings, recent sign-ins, and authorized apps — the same data every other page in Ondi already shows you, packaged for your own records.
          </div>
          <button type="button" disabled={exporting} onClick={exportData}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            <Icon name="download" size={15} /> {exporting ? 'Preparing…' : 'Download my data'}
          </button>
        </SectionCard>

        <SectionCard title="Deactivate your account">
          {requests === null ? (
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
          ) : pending ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <Icon name="clock" size={16} color="var(--gold)" style={{ marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Request pending <Badge variant="warning">Awaiting review</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                  Submitted {fmtDate(pending.created_at)}{pending.reason ? ` — "${pending.reason}"` : ''}. A workspace admin needs to approve this before your account is deactivated.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55, marginBottom: 14 }}>
                This sends a deactivation request to a workspace admin for approval — your account stays active until they act on it. This is not immediate or reversible by you once approved.
              </div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />
              <button type="button" disabled={submitting} onClick={submitDeactivation}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1.5px solid var(--red)', background: 'var(--white)', color: 'var(--red)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
                {submitting ? 'Submitting…' : 'Request account deactivation'}
              </button>
            </>
          )}

          {requests && requests.some(r => r.status !== 'PENDING') && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Past requests</div>
              {requests.filter(r => r.status !== 'PENDING').map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0' }}>
                  <span style={{ color: 'var(--ink2)' }}>{fmtDate(r.created_at)}</span>
                  <Badge variant={r.status === 'APPROVED' ? 'error' : 'gray'}>{r.status === 'APPROVED' ? 'Approved' : 'Rejected'}</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default OndiPrivacy;
