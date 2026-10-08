import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { Dialog, DialogContent, DialogHeader as DHeader, DialogBody, DialogFooter, DialogTitle } from '../components/ui/dialog.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';

type DsrStatus = 'PENDING' | 'IN_REVIEW' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';
type DsrType = 'ACCESS' | 'ERASURE' | 'PORTABILITY' | 'RECTIFICATION' | 'RESTRICTION' | 'OBJECTION';

interface Dsr {
  id: string;
  request_type: DsrType;
  status: DsrStatus;
  created_at: string;
  due_at: string;
  processed_at?: string;
  result_file_key?: string;
}

interface ConsentActivity {
  id: string;
  name: string;
  purpose: string;
  lawful_basis: string;
  my_consent: { status: string; granted_at: string; withdrawn_at?: string } | null;
}

const DSR_TYPE_LABELS: Record<DsrType, string> = {
  ACCESS: 'Download my data',
  ERASURE: 'Request deletion',
  PORTABILITY: 'Export data (machine-readable)',
  RECTIFICATION: 'Correct inaccurate data',
  RESTRICTION: 'Restrict processing',
  OBJECTION: 'Object to processing',
};

const DSR_STATUS_VARIANT: Record<DsrStatus, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  PROCESSING: 'info',
  COMPLETED: 'success',
  REJECTED: 'error',
  PARTIALLY_COMPLETED: 'warning',
  CANCELLED: 'gray',
};

const TABS = ['My Data', 'Data Requests', 'My Consents', 'Privacy Controls'] as const;
type Tab = typeof TABS[number];

export function PrivacyCenter() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('My Data');
  const [dsrs, setDsrs] = useState<Dsr[]>([]);
  const [consents, setConsents] = useState<ConsentActivity[]>([]);
  const [dsrLoading, setDsrLoading] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [submitDialog, setSubmitDialog] = useState<DsrType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadDsrs = useCallback(async () => {
    setDsrLoading(true);
    try {
      const res = await apiFetch('/v1/privacy/dsr');
      if (res.ok) setDsrs(await res.json());
    } finally {
      setDsrLoading(false);
    }
  }, []);

  const loadConsents = useCallback(async () => {
    setConsentLoading(true);
    try {
      const res = await apiFetch('/v1/privacy/consent');
      if (res.ok) setConsents(await res.json());
    } finally {
      setConsentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'Data Requests') loadDsrs();
    if (tab === 'My Consents') loadConsents();
  }, [tab, loadDsrs, loadConsents]);

  async function submitDsr(type: DsrType) {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await apiFetch('/v1/privacy/dsr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_type: type }),
      });
      if (!res.ok) {
        const body = await res.json();
        setSubmitError(body.error ?? 'Request failed');
        return;
      }
      setSubmitDialog(null);
      await loadDsrs();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelDsr(id: string) {
    const res = await apiFetch(`/v1/privacy/dsr/${id}`, { method: 'DELETE' });
    if (res.ok) await loadDsrs();
  }

  async function toggleConsent(activityId: string, hasActive: boolean) {
    if (hasActive) {
      await apiFetch(`/v1/privacy/consent/${activityId}`, { method: 'DELETE' });
    } else {
      await apiFetch(`/v1/privacy/consent/${activityId}`, { method: 'POST' });
    }
    await loadConsents();
  }

  return (
    <div>
      <PageHeader
        crumbs={['Profile', 'Privacy']}
        titlePlain="Privacy"
        titleEm="center"
        subtitle="Control your data, review requests, and manage your consent choices."
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 28px 20px', borderBottom: '1px solid var(--border)' }} data-ds-tabstrip="">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              background: tab === t ? 'hsl(var(--primary))' : 'transparent',
              color: tab === t ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
           data-ds-selected={tab === t} data-ui-native-button="" aria-pressed={tab === t}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 28px' }}>
        {/* ── My Data ──────────────────────────────────────────────────────── */}
        {tab === 'My Data' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="privacy-summary-card" style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FeaturedIcon variant="brand" size="md" shape="squircle">
                  <Icon name="user" size={18} />
                </FeaturedIcon>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Personal Information</div>
                  <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{user?.name} · {user?.email}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Profile photo', icon: 'image', stored: true },
                  { label: 'Name & email', icon: 'atSign', stored: true },
                  { label: 'Phone number', icon: 'phone', stored: true },
                  { label: 'Date of birth', icon: 'calendar', stored: true },
                  { label: 'National ID', icon: 'creditCard', stored: false, note: 'HR-only' },
                  { label: 'Bank details', icon: 'dollarSign', stored: false, note: 'Payroll-only' },
                ].map(item => (
                  <div key={item.label} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: 'var(--surface2)', borderRadius: 'var(--r-sm)',
                  }}>
                    <Icon name={item.icon as any} size={15} color="var(--ink3)" />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{item.label}</span>
                    {item.note ? (
                      <Badge variant="gray" style={{ fontSize: 11 }}>{item.note}</Badge>
                    ) : (
                      <Badge variant="success" style={{ fontSize: 11 }}>Stored</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: 'var(--teal-l)',
              border: '1px solid var(--teal-m)',
              borderRadius: 'var(--r)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Exercise your GDPR rights</div>
                <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 2 }}>
                  Download a copy of your data, correct inaccuracies, or request deletion.
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setTab('Data Requests')}
              >
                Manage requests
              </Button>
            </div>
          </div>
        )}

        {/* ── Data Requests ────────────────────────────────────────────────── */}
        {tab === 'Data Requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {(Object.entries(DSR_TYPE_LABELS) as [DsrType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => { setSubmitDialog(type); setSubmitError(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s',
                  }}
                 data-ui-native-button="">
                  <Icon name="shield" size={15} color="var(--teal)" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{label}</span>
                </button>
              ))}
            </div>

            {dsrLoading ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : dsrs.length === 0 ? (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
              }}>
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No data requests yet.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dsrs.map(dsr => (
                  <div key={dsr.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink)' }}>
                        {DSR_TYPE_LABELS[dsr.request_type]}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                        Submitted {new Date(dsr.created_at).toLocaleDateString()} · Due {new Date(dsr.due_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant={DSR_STATUS_VARIANT[dsr.status]}>
                      {dsr.status.replace('_', ' ')}
                    </Badge>
                    {dsr.status === 'PENDING' && (
                      <Button variant="ghost" size="sm" onClick={() => cancelDsr(dsr.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── My Consents ──────────────────────────────────────────────────── */}
        {tab === 'My Consents' && (
          <div>
            {consentLoading ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : consents.length === 0 ? (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
              }}>
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                  No consent-based processing activities have been configured for this workspace.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {consents.map(activity => {
                  const active = activity.my_consent?.status === 'ACTIVE';
                  const isConsentBasis = activity.lawful_basis === 'CONSENT';
                  return (
                    <div key={activity.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                      padding: '14px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink)' }}>{activity.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{activity.purpose}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                          Lawful basis: <span style={{ color: 'var(--ink2)' }}>{activity.lawful_basis}</span>
                        </div>
                      </div>
                      {isConsentBasis ? (
                        <Button
                          variant={active ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={() => toggleConsent(activity.id, active)}
                        >
                          {active ? 'Withdraw' : 'Consent'}
                        </Button>
                      ) : (
                        <Badge variant="gray">Mandatory</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Privacy Controls ─────────────────────────────────────────────── */}
        {tab === 'Privacy Controls' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '14px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <Icon name="activity" size={15} color="var(--ink3)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink)' }}>Online presence indicator</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  Controls whether teammates see your live active / clocked-in status dot.
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/profile?tab=personal'}>
                Edit in Profile
              </Button>
            </div>

            <div style={{
              padding: '14px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <Icon name="mail" size={15} color="var(--ink3)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink)' }}>Email notifications</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  Manage what emails you receive from the platform.
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/profile?tab=notifications'}>
                Edit in Profile
              </Button>
            </div>

            <div style={{
              marginTop: 8,
              padding: '14px 16px',
              background: 'var(--teal-l)',
              border: '1px solid var(--teal-m)',
              borderRadius: 'var(--r)',
              fontSize: 13,
              color: 'var(--ink2)',
              lineHeight: 1.5,
            }}>
              Under GDPR, you have the right to access, correct, delete, or export your personal data at any time.
              Use the <strong>Data Requests</strong> tab to exercise these rights. Requests are processed within 30 days.
            </div>
          </div>
        )}
      </div>

      {/* Submit DSR dialog */}
      {submitDialog && (
        <Dialog open onOpenChange={() => setSubmitDialog(null)}>
          <DialogContent size="sm">
            <DHeader>
              <DialogTitle>{DSR_TYPE_LABELS[submitDialog]}</DialogTitle>
            </DHeader>
            <DialogBody>
              <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
                {submitDialog === 'ACCESS' && 'We will compile all personal data held about you and send you a secure download link within 30 days.'}
                {submitDialog === 'ERASURE' && 'We will delete or anonymise your personal data where there is no legal obligation to retain it. Some records (tax, payroll) must be kept by law.'}
                {submitDialog === 'PORTABILITY' && 'We will export your data in a structured, machine-readable format (JSON/CSV) within 30 days.'}
                {submitDialog === 'RECTIFICATION' && 'Please describe the inaccurate data you want corrected. Our team will review and update it within 30 days.'}
                {submitDialog === 'RESTRICTION' && 'Processing of your personal data will be restricted while we review your request.'}
                {submitDialog === 'OBJECTION' && 'You can object to certain uses of your data. Our team will review your objection within 30 days.'}
              </p>
              {submitError && (
                <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{submitError}</p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitDialog(null)}>Cancel</Button>
              <Button onClick={() => submitDsr(submitDialog!)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
