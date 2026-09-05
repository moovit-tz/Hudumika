// ─── SignInbox.tsx — Inbox + Sent + Drafts + Completed views ─────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiFetchBlob, apiDownload, BASE_URL } from '../../lib/api.js';
import type { SignEnvelope, SignRecipient } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Tip } from '../../components/ui/tooltip.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { MetricsRow } from '../../components/MetricCard.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';
// Same real-canvas PDF render Cloud's Lightbox and the envelope editor both
// use — this page used to show only a filename chip, with no way to
// actually see the document without downloading it first.
import { usePdfDocument } from '../cloud/lib/usePdfDocument.js';
import { PdfPageCanvas } from '../cloud/components/PdfPageCanvas.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import './Sign.css';

const DETAIL_A4_ASPECT = 1.414; // height/width ratio of A4, same constant SignEditor.tsx uses

type EnvelopeWithRecipients = SignEnvelope & { recipients: SignRecipient[] };

const VIEW_TABS = [
  { key: 'inbox',     label: 'Inbox',     icon: 'download'  as const,
    subtitle: 'Sent to you by someone else — waiting on your signature.' },
  { key: 'sent',      label: 'Sent',      icon: 'send'      as const,
    subtitle: 'Everything you’ve sent out, at every stage from just-sent to fully signed.' },
  { key: 'drafts',    label: 'Drafts',    icon: 'fileText'  as const,
    subtitle: 'Still being prepared on your side — not sent to anyone yet.' },
  { key: 'completed', label: 'Completed', icon: 'checkCircle' as const,
    subtitle: 'Every recipient has signed. Fully executed and locked.' },
  // Voided and Declined used to share the same xCircle icon — both mean
  // "this didn't get signed," but for opposite reasons (you cancelled it
  // vs. a signer refused it), so they need distinct icons and copy that
  // actually says who stopped it and why — that's the exact distinction
  // a first-time user can't tell from the label alone.
  { key: 'voided',    label: 'Voided',    icon: 'xCircle'   as const,
    subtitle: 'You (the sender) cancelled these before everyone finished signing.' },
  { key: 'declined',  label: 'Declined',  icon: 'userMinus' as const,
    subtitle: 'A signer refused to sign — the envelope stopped because of them, not you.' },
  { key: 'expired',   label: 'Expired',   icon: 'clock'     as const,
    subtitle: 'Nobody cancelled or declined these — they just passed their signing deadline first.' },
] as const;
type ViewKey = typeof VIEW_TABS[number]['key'];

// Same semantic mapping as statusBadgeClass/recipientStatusBadgeClass above,
// but as ui/badge.tsx variants — for SignEnvelopeDetail, which uses the real
// Badge component (CLAUDE.md's design-system mapping: "Status pill → Badge")
// rather than this file's own .sign-badge-* CSS classes.
type BadgeVariant = 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';
function envelopeBadgeVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    draft: 'gray', sent: 'info', completed: 'success', voided: 'error', declined: 'error', expired: 'gray',
  };
  return map[status] ?? 'gray';
}
function recipientBadgeVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    pending: 'warning', viewed: 'info', signed: 'success', declined: 'error',
  };
  return map[status] ?? 'warning';
}

/** Stacked, overlapping avatars for a "who's on this envelope" summary —
 *  shared by grid (EnvelopeCard) and list (EnvelopeRow). PersonAvatar draws
 *  a real photo when a recipient is a linked platform user, deterministic
 *  per-name initials otherwise — replacing the old array-index-based
 *  coloring, which reassigned colors to the wrong person if recipients were
 *  ever reordered. */
function RecipientAvatarStack({ recipients, size, max }: { recipients: SignRecipient[]; size: number; max: number }) {
  return (
    <div style={{ display: 'flex' }}>
      {recipients.slice(0, max).map((r, i) => (
        <PersonAvatar key={r.id} userId={r.user_id} name={r.name} size={size} title={`${r.name} (${r.status})`}
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.28), border: '2px solid var(--card-bg)' }} />
      ))}
    </div>
  );
}

function EnvelopeCard({ env, onClick }: { env: EnvelopeWithRecipients; onClick: () => void }) {
  const signerCount = env.recipients?.length ?? 0;
  const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;

  return (
    <div className="sign-envelope-card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="sign-envelope-icon"><Icon name="fileText" size={20} style={{ color: 'var(--teal)' }} /></div>
      <div className="sign-envelope-meta">
        <div className="sign-envelope-title">{env.title}</div>
        <div className="sign-envelope-sub">
          <Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge>
          {env.file_name && <span style={{ color: 'var(--ink3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={11} /> {env.file_name}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>
            {new Date(env.updated_at).toLocaleDateString()}
          </span>
        </div>
        {signerCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <RecipientAvatarStack recipients={env.recipients} size={22} max={5} />
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {signedCount}/{signerCount} signed
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Dense, single-row rendering for list view — a real table row rather than
 *  a hand-laid-out div, so Document/Status/Recipients/Updated line up in the
 *  same column on every row regardless of how long any one envelope's title,
 *  status text or filename happens to be (same reasoning as the Companies
 *  table in SuperAdmin.tsx / DataTable). Grid view keeps the taller,
 *  two-row EnvelopeCard, which is a different visual shape on purpose. */
function EnvelopeRow({ env, onClick }: { env: EnvelopeWithRecipients; onClick: () => void }) {
  const signerCount = env.recipients?.length ?? 0;
  const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;

  return (
    <tr onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()} style={{ cursor: 'pointer' }}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.title}</div>
            {env.file_name && (
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Icon name="paperclip" size={10} /> {env.file_name}
              </div>
            )}
          </div>
        </div>
      </td>
      <td><Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge></td>
      <td>
        {signerCount > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RecipientAvatarStack recipients={env.recipients} size={20} max={4} />
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{signedCount}/{signerCount} signed</span>
          </div>
        ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
      </td>
      <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{new Date(env.updated_at).toLocaleDateString()}</td>
    </tr>
  );
}

type ViewMode = 'list' | 'grid';

export function SignInbox({ view }: { view: ViewKey }) {
  const navigate = useNavigate();
  const [envelopes, setEnvelopes] = useState<EnvelopeWithRecipients[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    // Drafts are a personal work-in-progress, same as Sent — the backend
    // scopes both to created_by when `view` is set, not just `status`.
    if (view === 'drafts') { params.set('status', 'draft'); params.set('view', 'drafts'); }
    else if (view === 'completed') params.set('status', 'completed');
    else if (view === 'voided') params.set('status', 'voided');
    else if (view === 'declined') params.set('status', 'declined');
    else if (view === 'expired') params.set('status', 'expired');
    else params.set('view', view);

    apiFetch(`/v1/sign/envelopes?${params}`)
      .then(setEnvelopes).catch(console.error)
      .finally(() => setLoading(false));
  }, [view]);

  const filtered = envelopes.filter(e =>
    !search || e.title.toLowerCase().includes(search.toLowerCase())
  );
  const currentTab = VIEW_TABS.find(t => t.key === view);

  // Compute live metrics for KPI cards row matching standard format
  const stats = useMemo(() => {
    const total = envelopes.length;
    const drafts = envelopes.filter(e => e.status === 'draft').length;
    const sent = envelopes.filter(e => e.status === 'sent').length;
    const completed = envelopes.filter(e => e.status === 'completed').length;
    const pendingSign = envelopes.filter(e => e.recipients?.some(r => r.status === 'pending')).length;
    const anchored = envelopes.filter(e => e.anchor_status === 'confirmed').length;
    return { total, drafts, sent, completed, pendingSign, anchored };
  }, [envelopes]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign', (currentTab?.label ?? view).toUpperCase()]}
        titlePlain="eSign"
        titleEm={`${(currentTab?.label ?? view).toLowerCase()}.`}
        subtitle={currentTab?.subtitle ?? 'Send documents for signature, track every recipient, and verify completed envelopes.'}
      />

      {/* KPI Metrics Row */}
      {!loading && envelopes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MetricsRow cards={[
            {
              title: 'TOTAL ENVELOPES', value: String(stats.total),
              sub1Label: 'DRAFT', sub1Value: String(stats.drafts),
              sub2Label: 'SENT', sub2Value: String(stats.sent), barHighlight: 'var(--teal)',
            },
            {
              title: 'PENDING ACTION', value: String(stats.sent + stats.drafts),
              sub1Label: 'AWAITING SIGNATURE', sub1Value: String(stats.pendingSign),
              sub2Label: 'OUT FOR SIGNING', sub2Value: String(stats.sent), barHighlight: 'var(--gold)',
            },
            {
              title: 'COMPLETED & VERIFIED', value: String(stats.completed),
              sub1Label: 'COMPLETED', sub1Value: String(stats.completed),
              sub2Label: 'BITCOIN ANCHORED', sub2Value: String(stats.anchored), barHighlight: 'var(--green)',
            },
          ]} />
        </div>
      )}

      {/* Filter Navigation Pills & Action Toolbar matching standard format */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Tabs value={view} onValueChange={(v) => navigate(v === 'inbox' ? '/sign' : `/sign/${v}`)} variant="segmented">
        <TabsList>
          {VIEW_TABS.map(tab => {
            return (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        </Tabs>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sign-view-toggle">
            {(['list', 'grid'] as const).map(m => (
              <Tip key={m} label={m === 'list' ? 'List view' : 'Grid view'}>
                <button type="button" onClick={() => setViewMode(m)}
                  className={`sign-view-toggle-btn${viewMode === m ? ' sign-view-toggle-btn--on' : ''}`}>
                  <Icon name={m} size={15} />
                </button>
              </Tip>
            ))}
          </div>

          <div style={{ position: 'relative', width: 240 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
            <input
              type="search" placeholder="Search envelopes..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <Button variant="default" onClick={() => navigate('/sign/editor')} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, padding: '8px 16px' }}>
            <Icon name="plus" size={14} /> New Envelope
          </Button>
        </div>
      </div>

      {/* List / grid */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? (
          <div className={viewMode === 'grid' ? 'sign-envelope-grid' : 'sign-envelope-list'}>
            {Array.from({ length: viewMode === 'grid' ? 6 : 8 }).map((_, i) => (
              <div key={i} style={{ height: viewMode === 'grid' ? 116 : 46, borderRadius: 8, background: 'var(--border)', opacity: 0.4, animation: 'pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 280, gap: 12, color: 'var(--ink3)', textAlign: 'center', padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Icon name="edit" size={24} style={{ color: 'var(--ink3)', opacity: 0.6 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {search ? 'No matching envelopes' : view === 'inbox' ? 'Nothing waiting for your signature' : view === 'drafts' ? 'No drafts' : `No ${view} envelopes`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 340, lineHeight: 1.5 }}>
              {search ? 'Try adjusting your search terms.'
                : view === 'inbox' ? 'When someone sends you a document to sign, it will appear here.'
                : view === 'voided' ? 'Envelopes only land here once you cancel one yourself — nothing to show yet.'
                : view === 'declined' ? 'This fills up if a signer ever refuses to sign — nothing here means everyone has signed so far.'
                : view === 'expired' ? 'Envelopes land here only after their deadline passes unsigned — none have yet.'
                : 'Create a new envelope to get started.'}
            </div>
            {view !== 'inbox' && !search && (
              <Button variant="default" onClick={() => navigate('/sign/editor')} style={{ marginTop: 8 }}>
                <Icon name="plus" size={14} /> Create Envelope
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="sign-envelope-grid">
            {filtered.map(env => (
              <EnvelopeCard key={env.id} env={env} onClick={() => navigate(`/sign/envelope/${env.id}`)} />
            ))}
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Recipients</th>
                  <th style={{ textAlign: 'right' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(env => (
                  <EnvelopeRow key={env.id} env={env} onClick={() => navigate(`/sign/envelope/${env.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function ShareEnvelopeModal({ env, onClose }: { env: EnvelopeWithRecipients; onClose: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = window.location.origin;
  const verifyUrl = env.verification_code ? `${origin}/sign/verify/${env.verification_code}` : '';
  const downloadUrl = env.verification_code ? `${BASE_URL}/v1/sign/public/verify/${env.verification_code}/download` : '';

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const shareText = `View signed document "${env.title}" verified on Hudumika eSign:\n${verifyUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Signed Document: ${env.title}`)}&body=${encodeURIComponent(shareText)}`;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-140 max-h-[85vh] overflow-y-auto" style={{ padding: 24, borderRadius: 10 }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            <Icon name="share" size={16} style={{ color: 'var(--teal)' }} />
            Share Document — {env.title}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
          {/* Verification & View Link */}
          {env.verification_code && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Public Verification &amp; View Link
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  value={verifyUrl}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'monospace' }}
                />
                <Button variant="default" size="sm" onClick={() => copy(verifyUrl, 'verify')} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Icon name={copiedKey === 'verify' ? 'check' : 'copy'} size={13} />
                  {copiedKey === 'verify' ? 'Copied!' : 'Copy Link'}
                </Button>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '5px 0 0', lineHeight: 1.4 }}>
                Anyone with this link can view the verification docket, audit details, and download the signed document without logging in.
              </p>
            </div>
          )}

          {/* Direct PDF Download Link */}
          {env.verification_code && env.stamped_file_url && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Direct PDF Download Link
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  value={downloadUrl}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'monospace' }}
                />
                <Button variant="outline" size="sm" onClick={() => copy(downloadUrl, 'download')} style={{ whiteSpace: 'nowrap' }}>
                  <Icon name={copiedKey === 'download' ? 'check' : 'copy'} size={13} />
                  {copiedKey === 'download' ? 'Copied!' : 'Copy PDF Link'}
                </Button>
              </div>
            </div>
          )}

          {/* Verification Code */}
          {env.verification_code && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Verification Code
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ padding: '8px 14px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: 'var(--teal)', letterSpacing: '0.06em', flex: 1 }}>
                  {env.verification_code}
                </div>
                <Button variant="outline" size="sm" onClick={() => copy(env.verification_code!, 'code')}>
                  <Icon name={copiedKey === 'code' ? 'check' : 'copy'} size={13} />
                  {copiedKey === 'code' ? 'Copied!' : 'Copy Code'}
                </Button>
              </div>
            </div>
          )}

          {/* Recipient Signing Links (if active sent status) */}
          {env.status === 'sent' && env.recipients && env.recipients.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>
                Recipient Signing Links
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {env.recipients.map(r => {
                  const rLink = `${origin}/sign/public/${r.token}`;
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12.5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.email}</div>
                      </div>
                      <Button variant="outline" size="xs" onClick={() => copy(rLink, `recipient-${r.id}`)} style={{ borderRadius: 'var(--r-sm)' }}>
                        <Icon name={copiedKey === `recipient-${r.id}` ? 'check' : 'copy'} size={11} />
                        {copiedKey === `recipient-${r.id}` ? 'Copied' : 'Copy Link'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Share Action Buttons */}
          {env.verification_code && (
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <a href={whatsappUrl} target="_blank" rel="noreferrer"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="messageSquare" size={14} style={{ color: '#10b981' }} /> WhatsApp Share
              </a>
              <a href={mailtoUrl}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="mail" size={14} style={{ color: 'var(--teal)' }} /> Email Share
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getAuditEventStyle(type: string) {
  const t = type.toLowerCase();
  if (t === 'created') return { icon: 'plus' as const, color: 'var(--teal)', bg: 'var(--teal-l)' };
  if (t === 'sent') return { icon: 'send' as const, color: 'var(--blue)', bg: 'var(--blue-l)' };
  if (t === 'viewed') return { icon: 'eye' as const, color: 'var(--gold)', bg: 'var(--gold-l)' };
  if (t === 'signed') return { icon: 'edit' as const, color: 'var(--green)', bg: 'var(--green-l)' };
  if (t === 'completed') return { icon: 'checkCircle' as const, color: 'var(--green)', bg: 'var(--green-l)' };
  if (t === 'stamped') return { icon: 'stamp' as const, color: 'var(--teal)', bg: 'var(--teal-l)' };
  if (t === 'verified') return { icon: 'shield' as const, color: 'var(--blue)', bg: 'var(--blue-l)' };
  if (t === 'anchored') return { icon: 'lock' as const, color: 'var(--green)', bg: 'var(--green-l)' };
  // 'updated' covers every metadata edit — a rename, or PUT's own message/
  // recipient/field changes on a still-draft envelope.
  if (t === 'updated') return { icon: 'edit' as const, color: 'var(--ink2)', bg: 'var(--bg)' };
  if (t === 'voided') return { icon: 'xCircle' as const, color: 'var(--red)', bg: 'var(--red-l)' };
  if (t === 'declined') return { icon: 'userMinus' as const, color: 'var(--red)', bg: 'var(--red-l)' };
  if (t === 'expired') return { icon: 'clock' as const, color: 'var(--ink3)', bg: 'var(--bg)' };
  return { icon: 'circle' as const, color: 'var(--ink3)', bg: 'var(--bg)' };
}

export function SignEnvelopeDetail() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const id = window.location.pathname.split('/').pop() ?? '';
  const [env, setEnv] = useState<EnvelopeWithRecipients | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/v1/sign/envelopes/${id}`).then(setEnv).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || env?.status !== 'sent') return;
    const interval = setInterval(() => {
      apiFetch(`/v1/sign/envelopes/${id}`).then(setEnv).catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, [id, env?.status]);

  async function handleSend() {
    if (!env) return;
    if (!(await showConfirm('This sends a real signing link to every recipient.', { title: 'Send this envelope for signing?', variant: 'info', confirmLabel: 'Send' }))) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/send`, { method: 'POST' });
      const refreshed = await apiFetch(`/v1/sign/envelopes/${env.id}`);
      setEnv(refreshed);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to send');
    }
  }

  async function handleVoid() {
    if (!env) return;
    const reason = await showPrompt('This stops the envelope for every recipient — it can’t be un-voided.', { title: 'Reason for voiding (optional)', placeholder: 'e.g. Sent to the wrong recipient', confirmLabel: 'Void Envelope' });
    if (reason === null) return;
    await apiFetch(`/v1/sign/envelopes/${env.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    navigate('/sign');
  }

  async function handleRemind() {
    if (!env) return;
    try {
      const result = await apiFetch(`/v1/sign/envelopes/${env.id}/remind`, { method: 'POST' });
      const names = (result.reminded ?? []).map((r: { name: string }) => r.name).join(', ');
      showAlert(names ? `Reminder emailed to ${names}` : 'Reminder sent', { variant: 'success' });
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to send reminder');
    }
  }

  function handleCopyCode() {
    if (!env?.verification_code) return;
    navigator.clipboard?.writeText(env.verification_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  async function handleRename() {
    if (!env) return;
    const next = await showPrompt('', { title: 'Rename this envelope', defaultValue: env.title, required: true, confirmLabel: 'Rename' });
    if (next === null || !next.trim() || next.trim() === env.title) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/title`, { method: 'PATCH', body: JSON.stringify({ title: next.trim() }) });
      setEnv(prev => prev ? { ...prev, title: next.trim() } : prev);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to rename');
    }
  }

  async function handleAmend() {
    if (!env) return;
    const ok = await showConfirm(
      `This creates a new draft — Version ${env.version_number + 1} — copying the same document, recipients and fields. The signed original stays exactly as it is, on file.`,
      { title: 'Create an amended version?', variant: 'info', confirmLabel: 'Create Version ' + (env.version_number + 1) });
    if (!ok) return;
    try {
      const amended = await apiFetch(`/v1/sign/envelopes/${env.id}/amend`, { method: 'POST' });
      navigate(`/sign/editor/${amended.id}`);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to create an amended version');
    }
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(true);
  useEffect(() => {
    if (!env) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setPreviewLoading(true);
    (async () => {
      try {
        if (env.status === 'completed' && env.stamped_file_url) {
          const blob = await apiFetchBlob(`/v1/sign/envelopes/${env.id}/download`);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
          setPreviewIsPdf(true);
        } else if (env.document_data) {
          setPreviewUrl(env.document_data);
          setPreviewIsPdf(!!env.file_name?.toLowerCase().endsWith('.pdf') || env.document_data.startsWith('data:application/pdf'));
        } else if (env.file_id) {
          const blob = await apiFetchBlob(`/v1/files/${env.file_id}/preview`);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
          setPreviewIsPdf(!!env.file_name?.toLowerCase().endsWith('.pdf'));
        } else {
          setPreviewUrl(null);
        }
      } catch {
        if (!cancelled) setPreviewUrl(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [env?.id, env?.status, env?.document_data, env?.file_id, env?.stamped_file_url]);

  const { doc: previewDoc, numPages: previewNumPages, loading: previewPdfLoading, error: previewPdfError } =
    usePdfDocument(previewIsPdf ? previewUrl : null);
  const [previewPage, setPreviewPage] = useState(1);
  useEffect(() => { setPreviewPage(1); }, [previewUrl]);
  const [previewNaturalSize, setPreviewNaturalSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!previewDoc) { setPreviewNaturalSize(null); return; }
    let cancelled = false;
    previewDoc.getPage(1).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setPreviewNaturalSize({ width: vp.width, height: vp.height });
    });
    return () => { cancelled = true; };
  }, [previewDoc]);

  const [previewW, setPreviewW] = useState(480);
  const previewPaneRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setPreviewW(Math.min(800, Math.max(220, node.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const previewH = Math.round(previewW * (previewNaturalSize ? previewNaturalSize.height / previewNaturalSize.width : DETAIL_A4_ASPECT));
  const previewScale = previewNaturalSize ? previewW / previewNaturalSize.width : 1;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, gap: 12, color: 'var(--ink3)' }}>
        <Icon name="clock" size={32} style={{ opacity: 0.4, animation: 'ds-spin 2s linear infinite' }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>Loading envelope details…</div>
      </div>
    );
  }

  if (!env) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, gap: 12, color: 'var(--ink3)' }}>
        <Icon name="xCircle" size={36} style={{ color: 'var(--red)', opacity: 0.8 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Envelope Not Found</div>
        <Button variant="outline" size="sm" onClick={() => navigate('/sign')}>Return to eSign Inbox</Button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['eSign', 'Envelopes']}
        title={env.title}
        subtitle={env.version_number > 1 ? `Version ${env.version_number}` : undefined}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/sign')} style={{ fontWeight: 600 }}>
              <Icon name="arrowLeft" size={14} /> Back to Inbox
            </Button>
            <Badge variant={envelopeBadgeVariant(env.status)} style={{ textTransform: 'capitalize', padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}>
              {env.status}
            </Badge>
            {env.status === 'completed' ? (
              !env.next_version && (
                <Tip label="This document has an issue — create an amended Version 2">
                  <Button variant="outline" size="sm" onClick={handleAmend} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Icon name="gitBranch" size={14} /> Amend Version
                  </Button>
                </Tip>
              )
            ) : (
              <Tip label="Rename this envelope">
                <Button variant="ghost" size="sm" className="aspect-square px-0" onClick={handleRename} aria-label="Rename this envelope">
                  <Icon name="edit" size={14} />
                </Button>
              </Tip>
            )}
            {env.status === 'draft' && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/sign/editor/${env.id}`)}>
                  <Icon name="edit" size={14} /> Edit Studio
                </Button>
                <Button variant="default" size="sm" onClick={handleSend} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700 }}>
                  <Icon name="send" size={14} /> Send for Signing
                </Button>
              </>
            )}
            {env.status === 'sent' && (
              <>
                <Button variant="outline" size="sm" onClick={handleRemind}>
                  <Icon name="mail" size={14} /> Remind All
                </Button>
                <Button variant="outline" size="sm" onClick={handleVoid}
                  style={{ borderColor: 'var(--sign-red)', background: 'var(--sign-red-l)', color: 'var(--sign-red)', fontWeight: 600 }}>
                  <Icon name="xCircle" size={14} /> Void Envelope
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Sent by — the creator, so a shared workspace inbox reads as "who
          actually raised this," not just what and when. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink3)' }}>
        <PersonAvatar userId={env.created_by} name={env.created_by_name ?? ''} size={22} />
        <span>Sent by <strong style={{ color: 'var(--ink2)' }}>{env.created_by_name ?? 'Unknown'}</strong> · {new Date(env.created_at).toLocaleDateString()}</span>
      </div>

      {/* Version chain banners */}
      {env.previous_version && (
        <div onClick={() => navigate(`/sign/envelope/${env.previous_version!.id}`)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--teal-l)', border: '1px solid var(--teal)', borderRadius: 12, padding: '12px 18px', fontSize: 13, color: 'var(--ink)' }}>
          <Icon name="gitBranch" size={16} style={{ color: 'var(--teal)', flexShrink: 0 } as React.CSSProperties} />
          <span>This is Version {env.version_number}, amended from <strong>Version {env.previous_version.version_number} — {env.previous_version.title}</strong></span>
          <Icon name="chevronRight" size={14} style={{ marginLeft: 'auto', color: 'var(--teal)' } as React.CSSProperties} />
        </div>
      )}
      {env.next_version && (
        <div onClick={() => navigate(`/sign/envelope/${env.next_version!.id}`)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12, padding: '12px 18px', fontSize: 13, color: 'var(--ink)' }}>
          <Icon name="gitBranch" size={16} style={{ color: 'var(--gold)', flexShrink: 0 } as React.CSSProperties} />
          <span>This signed document is unchanged, but it’s been superseded by <strong>Version {env.next_version.version_number}</strong> ({env.next_version.status})</span>
          <Icon name="chevronRight" size={14} style={{ marginLeft: 'auto', color: 'var(--gold)' } as React.CSSProperties} />
        </div>
      )}

      {/* Main 2-column workspace layout */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.8fr) minmax(320px, 1fr)', gap: 24, alignItems: 'start' }}>

        {/* LEFT: Premium PDF / Document Preview Studio */}
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0,
          position: isMobile ? 'static' : 'sticky', top: isMobile ? undefined : 16
        }}>
          {/* Top Dark Slate Studio Control Bar */}
          <div style={{
            background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, borderBottom: '1px solid #1e293b'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Icon name="fileText" size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {env.file_name || env.title}
              </span>
              {env.file_name && (
                <span style={{ fontSize: 10, fontWeight: 800, background: '#1e293b', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                  {env.file_name.split('.').pop() || 'PDF'}
                </span>
              )}
            </div>

            {previewIsPdf && previewNumPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                <button onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage <= 1}
                  style={{ background: 'none', border: 'none', cursor: previewPage <= 1 ? 'default' : 'pointer', opacity: previewPage <= 1 ? 0.3 : 1, display: 'flex', padding: 2 }}>
                  <Icon name="chevronLeft" size={14} color="#f8fafc" />
                </button>
                <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                  {previewPage} / {previewNumPages}
                </span>
                <button onClick={() => setPreviewPage(p => Math.min(previewNumPages, p + 1))} disabled={previewPage >= previewNumPages}
                  style={{ background: 'none', border: 'none', cursor: previewPage >= previewNumPages ? 'default' : 'pointer', opacity: previewPage >= previewNumPages ? 0.4 : 1, display: 'flex', padding: 2 }}>
                  <Icon name="chevronRight" size={14} color="#f8fafc" />
                </button>
              </div>
            )}
          </div>

          {/* Document Canvas Container */}
          <div style={{ padding: 20, background: 'var(--bg)', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 480 }}>
            <div ref={previewPaneRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: previewW, height: previewH, maxWidth: '100%', background: '#ffffff', borderRadius: 8,
                overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative'
              }}>
                {previewLoading || (previewIsPdf && !!previewUrl && previewPdfLoading) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--ink3)' }}>
                    <Icon name="clock" size={24} style={{ animation: 'ds-spin 2s linear infinite', color: 'var(--teal)' }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Loading document canvas…</div>
                  </div>
                ) : !previewUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--ink3)', padding: 24, textAlign: 'center' }}>
                    <Icon name="fileText" size={32} style={{ opacity: 0.3 }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>No document preview available</div>
                  </div>
                ) : previewIsPdf ? (
                  previewPdfError || !previewDoc ? (
                    <div style={{ color: 'var(--ink3)', fontSize: 13, fontWeight: 600 }}>Unable to render PDF preview</div>
                  ) : (
                    <PdfPageCanvas doc={previewDoc} pageNumber={previewPage} scale={previewScale} style={{ display: 'block' }} />
                  )
                ) : (
                  <img src={previewUrl} alt={env.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Status, Verification Certificate, Recipients, & Audit Trail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* Void / Decline Reason Banner */}
          {(env.status === 'voided' || env.status === 'declined') && env.void_reason && (
            <div style={{ background: 'var(--sign-red-l)', border: '1px solid var(--sign-red)', borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 8px rgba(239,68,68,0.06)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sign-red)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="xCircle" size={14} /> {env.status === 'declined' ? 'Envelope Declined' : 'Envelope Voided'}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>{env.void_reason}</div>
            </div>
          )}

          {/* Stamped & Verified Certificate Card (if Completed) — styled as an
              actual certificate (serial plate + provenance line + corner
              seal) rather than a generic tinted SaaS status card. */}
          {env.status === 'completed' && env.verification_code && (
            <div style={{
              position: 'relative', overflow: 'hidden',
              background: 'var(--sign-green-l)', border: '1px solid var(--sign-green)', borderRadius: 'var(--r)',
              padding: '22px 24px', boxShadow: 'var(--elev-sm)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* Corner seal ring — a notary-stamp motif, not another icon-in-a-circle */}
              <div aria-hidden style={{
                position: 'absolute', top: -20, right: -20, width: 88, height: 88, borderRadius: '50%',
                border: '2px dashed var(--sign-green)', opacity: 0.3, transform: 'rotate(12deg)', pointerEvents: 'none',
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--sign-green)' }}>
                    Legal Verification Certificate
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 3, maxWidth: 420 }}>
                    This document's signed record is sealed and independently verifiable by anyone holding the certificate number below.
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--white)', border: '2px solid var(--sign-green)', color: 'var(--sign-green)', transform: 'rotate(-8deg)',
                }}>
                  <Icon name="stamp" size={18} />
                </div>
              </div>

              {/* Certificate plate — the code presented like a serial number */}
              <div style={{
                background: 'var(--white)', border: '1px dashed var(--sign-green)', borderRadius: 'var(--r-sm)',
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink3)' }}>
                    Certificate No.
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 800, letterSpacing: '0.07em', color: 'var(--sign-green)', marginTop: 2 }}>
                    {env.verification_code}
                  </div>
                </div>
                <a href={`/sign/verify/${env.verification_code}`} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--sign-green)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Verify record <Icon name="arrowRight" size={12} />
                </a>
              </div>

              {env.anchor_status && (
                <div style={{ fontSize: 11.5, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={env.anchor_status === 'confirmed' ? 'checkCircle' : 'clock'} size={14} style={{ color: env.anchor_status === 'confirmed' ? 'var(--green)' : 'var(--gold)', flexShrink: 0 }} />
                  <span>
                    {env.anchor_status === 'confirmed'
                      ? `Bitcoin-anchored — confirmed in block #${env.anchor_block_height}`
                      : 'Bitcoin anchor pending blockchain confirmation'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <Button variant="outline" size="sm" onClick={() => setShowShareModal(true)} style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)', fontWeight: 600 }}>
                  <Icon name="share" size={13} /> Share Link
                </Button>
                {env.stamped_file_url && (
                  <Button variant="outline" size="sm" onClick={() => apiDownload(`/v1/sign/envelopes/${env.id}/download`, `${env.title} — signed.pdf`)} style={{ background: 'var(--sign-green-l)', borderColor: 'var(--sign-green)', color: 'var(--sign-green)', fontWeight: 700 }}>
                    <Icon name="download" size={13} /> Download PDF
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleCopyCode} style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)' }}>
                  <Icon name={copiedCode ? 'check' : 'copy'} size={13} /> {copiedCode ? 'Copied!' : 'Copy Code'}
                </Button>
              </div>
            </div>
          )}

          {/* Recipient Signing Links (when Sent) */}
          {env.status === 'sent' && env.recipients && (
            <SectionCard title="Recipient Signing Links" collapsible={false} action={
              <Button variant="outline" size="xs" onClick={() => setShowShareModal(true)} style={{ borderColor: 'var(--teal)', color: 'var(--teal)', fontWeight: 600 }}>
                <Icon name="share" size={12} /> Share Links
              </Button>
            }>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {env.recipients.map(r => (
                  // flexWrap, not a single fixed row: without it, a long
                  // name had nowhere to go but wrap onto a second line
                  // inside its own flex:1 column while the role badge and
                  // the two buttons — plain siblings in the same unwrapped
                  // row — stayed pinned in place, overlapping that second
                  // line (confirmed live: "Viden Remmigius Clemmence"
                  // wrapped under a "Superadmin" badge sitting on top of
                  // it). The name/email column now truncates with an
                  // ellipsis instead of wrapping its own text, and the
                  // whole row wraps onto a second line — actions included —
                  // once it runs out of room, on any width, not just below
                  // a mobile breakpoint.
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <PersonAvatar userId={r.user_id} name={r.name} size={30} />
                    <Badge variant={recipientBadgeVariant(r.status)}>{r.status}</Badge>
                    <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
                    </div>
                    {r.role_label && <Badge variant="gray">{r.role_label}</Badge>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(r.status === 'pending' || r.status === 'viewed') && (
                        <Tip label="Open this recipient's signing link right now for in-person signing">
                          <Button variant="outline" size="xs" onClick={() => window.open(`/sign/public/${r.token}`, '_blank', 'noopener')} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                            <Icon name="edit" size={11} /> Sign In Person
                          </Button>
                        </Tip>
                      )}
                      <Button variant="outline" size="xs" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/sign/public/${r.token}`); showAlert('Signing link copied'); }}>
                        Copy Link
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Recipients — a legal certifier (Certified True Copy — an
              advocate/notary attesting the copy, not just another party
              signing it) gets its own section, separate from ordinary
              signatories/approvers, rather than being one more row in the
              same flat list with just a small badge to tell it apart. */}
          {(() => {
            const renderRecipientRow = (r: typeof env.recipients[number]) => (
              // Same overlap risk as the signing-links row above, plus a
              // taller one: this row's second/third lines (certifier info,
              // a decline reason) are meant to wrap as real sentences, not
              // truncate — so the trailing badges/timestamp need their own
              // wrapping group, or a long reason growing this row taller
              // pushes past the single-line-height the trailing badges
              // assumed and overlaps them the same way.
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, rowGap: 8, padding: '12px 14px', borderRadius: 10, background: r.is_certifier ? 'var(--blue-l)' : 'var(--bg)', border: `1px solid ${r.is_certifier ? 'var(--blue)' : 'var(--border)'}`, flexWrap: 'wrap' }}>
                <PersonAvatar userId={r.user_id} name={r.name} size={38} />
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}{r.role_label ? ` · ${r.role_label}` : ''}</div>
                  {r.is_certifier && (
                    <div style={{ fontSize: 11.5, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>
                      {r.certifier_title || 'Advocate'}{r.certifier_roll_number ? ` · Roll No. ${r.certifier_roll_number}` : ''}{r.certifier_firm ? ` · ${r.certifier_firm}` : ''}
                    </div>
                  )}
                  {r.status === 'declined' && r.decline_reason && (
                    <div style={{ fontSize: 11.5, color: 'var(--sign-red)', marginTop: 2 }}>Reason: {r.decline_reason}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                  <Badge variant={recipientBadgeVariant(r.status)}>{r.status}</Badge>
                  {r.signed_at && <span style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{new Date(r.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            );
            const certifiers = env.recipients?.filter(r => r.is_certifier) ?? [];
            const signatories = env.recipients?.filter(r => !r.is_certifier) ?? [];
            return (
              <>
                {certifiers.length > 0 && (
                  <SectionCard title="Certification" collapsible={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {certifiers.map(renderRecipientRow)}
                    </div>
                  </SectionCard>
                )}
                <SectionCard title="Recipients & Approvers" collapsible={false}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {signatories.map(renderRecipientRow)}
                  </div>
                </SectionCard>
              </>
            );
          })()}

          {/* Audit Trail Timeline */}
          {env.events && env.events.length > 0 && (
            <SectionCard title="Audit Trail Log" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 4 }}>
                {env.events.map((ev, i) => {
                  const styleCfg = getAuditEventStyle(ev.event_type);
                  const isLast = i === env.events!.length - 1;
                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: 14, paddingBottom: isLast ? 0 : 20, position: 'relative' }}>
                      {!isLast && (
                        <div style={{ position: 'absolute', left: 13, top: 26, bottom: 0, width: 2, background: 'var(--border)' }} />
                      )}
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: styleCfg.bg, color: styleCfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, border: '2px solid var(--card-bg)' }}>
                        <Icon name={styleCfg.icon} size={13} />
                      </div>
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                          {ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}
                          {ev.actor_name ? ` by ${ev.actor_name}` : ''}
                        </div>
                        {ev.note && <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{ev.note}</div>}
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{new Date(ev.created_at).toLocaleString()}</span>
                          {ev.ip_address && (
                            <span style={{ background: 'var(--white)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                              IP: {ev.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

        </div>
      </div>

      {showShareModal && <ShareEnvelopeModal env={env} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}

// ─── SignAllDocuments — tenant-admin view across every user ───────────────────
// Every other view in this file is scoped to "documents I own or I'm a
// recipient on" (Inbox/Sent/Drafts/...). A tenant admin currently has no
// way to find a colleague's document short of already knowing its exact
// link — GET /envelopes?view=all (role-gated server-side, not just here)
// is the one query that isn't scoped to the requesting user, and this is
// its one page.
type AdminEnvelope = EnvelopeWithRecipients & { owner: { name: string; email: string } | null };

export function SignAllDocuments() {
  const navigate = useNavigate();
  const [envelopes, setEnvelopes] = useState<AdminEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminEnvelope['status']>('all');

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/sign/envelopes?view=all')
      .then(setEnvelopes).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = envelopes.filter(e =>
    (statusFilter === 'all' || e.status === statusFilter) &&
    (!search || e.title.toLowerCase().includes(search.toLowerCase()) || e.owner?.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign', 'Admin']}
        titlePlain="All"
        titleEm="documents"
        subtitle="Every envelope in this workspace, regardless of who created it — for oversight and audit, not day-to-day signing."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 'var(--r)', padding: 3 }}>
          {(['all', 'draft', 'sent', 'completed', 'voided', 'declined', 'expired'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600, fontSize: 12, textTransform: 'capitalize', background: statusFilter === s ? 'var(--white)' : 'transparent', color: statusFilter === s ? 'var(--ink)' : 'var(--ink3)', boxShadow: statusFilter === s ? 'var(--elev-sm)' : 'none' }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: 320, marginLeft: 'auto' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
          <input
            type="search" placeholder="Search by title or owner…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 34px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 46, borderRadius: 8, background: 'var(--border)', opacity: 0.4, animation: 'pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 280, gap: 12, color: 'var(--ink3)', textAlign: 'center', padding: 32 }}>
            <Icon name="users" size={28} style={{ opacity: 0.4 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{search ? 'No matching documents' : 'No documents yet'}</div>
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Recipients</th>
                  <th style={{ textAlign: 'right' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(env => {
                  const signerCount = env.recipients?.length ?? 0;
                  const signedCount = env.recipients?.filter(r => r.status === 'signed').length ?? 0;
                  return (
                    <tr key={env.id} onClick={() => navigate(`/sign/envelope/${env.id}`)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/sign/envelope/${env.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="sign-envelope-row-icon"><Icon name="fileText" size={14} style={{ color: 'var(--teal)' }} /></div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.title}</div>
                            {env.file_name && (
                              <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <Icon name="paperclip" size={10} /> {env.file_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {env.owner ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <PersonAvatar userId={env.created_by} name={env.owner.name} size={26} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.owner.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{env.owner.email}</div>
                            </div>
                          </div>
                        ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td><Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge></td>
                      <td>
                        {signerCount > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <RecipientAvatarStack recipients={env.recipients} size={20} max={4} />
                            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{signedCount}/{signerCount} signed</span>
                          </div>
                        ) : <span style={{ color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{new Date(env.updated_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
