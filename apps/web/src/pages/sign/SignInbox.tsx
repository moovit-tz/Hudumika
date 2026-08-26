// ─── SignInbox.tsx — Inbox + Sent + Drafts + Completed views ─────────────────
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiFetchBlob, apiDownload, BASE_URL } from '../../lib/api.js';
import type { SignEnvelope, SignRecipient } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign']}
        titlePlain="eSign"
        titleEm={(currentTab?.label ?? view).toLowerCase()}
        subtitle={currentTab?.subtitle ?? 'Send documents for signature, track every recipient, and verify completed envelopes.'}
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16 }}>
        <div className="sign-view-toggle">
          {(['list', 'grid'] as const).map(m => (
            <button key={m} type="button" onClick={() => setViewMode(m)} title={m === 'list' ? 'List view' : 'Grid view'}
              className={`sign-view-toggle-btn${viewMode === m ? ' sign-view-toggle-btn--on' : ''}`}>
              <Icon name={m} size={15} />
            </button>
          ))}
        </div>
        <Button variant="default" onClick={() => navigate('/sign/editor')} style={{ fontWeight: 600 }}>
          <Icon name="plus" size={14} /> New Envelope
        </Button>
        <div style={{ position: 'relative', width: '100%', maxWidth: 320, marginLeft: 'auto' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }} />
          <input
            type="search" placeholder="Search envelopes by title…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 34px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box' }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <Icon name="x" size={13} />
            </button>
          )}
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
            <table className="rtbl" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9 }}>
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
                      <Button variant="outline" size="xs" onClick={() => copy(rLink, `recipient-${r.id}`)} style={{ borderRadius: 5 }}>
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
    if (!env || !confirm('Send this envelope for signing?')) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/send`, { method: 'POST' });
      const refreshed = await apiFetch(`/v1/sign/envelopes/${env.id}`);
      setEnv(refreshed);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to send');
    }
  }

  async function handleVoid() {
    if (!env) return;
    const reason = window.prompt('Reason for voiding (optional):') ?? '';
    await apiFetch(`/v1/sign/envelopes/${env.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    navigate('/sign');
  }

  async function handleRemind() {
    if (!env) return;
    try {
      const result = await apiFetch(`/v1/sign/envelopes/${env.id}/remind`, { method: 'POST' });
      const names = (result.reminded ?? []).map((r: { name: string }) => r.name).join(', ');
      alert(names ? `Reminder emailed to ${names}` : 'Reminder sent');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to send reminder');
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
    const next = window.prompt('Rename this envelope:', env.title);
    if (!next?.trim() || next.trim() === env.title) return;
    try {
      await apiFetch(`/v1/sign/envelopes/${env.id}/title`, { method: 'PATCH', body: JSON.stringify({ title: next.trim() }) });
      setEnv(prev => prev ? { ...prev, title: next.trim() } : prev);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to rename');
    }
  }

  // ── Document preview (left column) ─────────────────────────────────────────
  // Before this, the only way to actually see the document was to download
  // it — the header showed a filename chip and nothing else. A completed
  // envelope previews the real stamped/signed file; anything else previews
  // the original upload, the same document_data/file_id shape the editor
  // already loads a draft from.
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

  const previewPaneRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(480);
  useEffect(() => {
    function measure() {
      const w = previewPaneRef.current?.clientWidth ?? 480;
      setPreviewW(Math.max(220, w - 32));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const previewH = Math.round(previewW * (previewNaturalSize ? previewNaturalSize.height / previewNaturalSize.width : DETAIL_A4_ASPECT));
  const previewScale = previewNaturalSize ? previewW / previewNaturalSize.width : 1;

  if (loading) return <div style={{ padding: 40, color: 'var(--ink3)', textAlign: 'center' }}>Loading envelope details…</div>;
  if (!env) return <div style={{ padding: 40, color: 'var(--ink3)', textAlign: 'center' }}>Envelope not found</div>;

  return (
    <div style={{ fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['eSign', 'Envelopes']}
        title={env.title}
        subtitle={env.version_number > 1 ? `Version ${env.version_number}` : undefined}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge variant={envelopeBadgeVariant(env.status)}>{env.status}</Badge>
            {env.status === 'completed' ? (
              // A completed document's signed PDF is final — "Edit" here
              // can't mean "change this record," it means "start a
              // corrected Version 2," so it gets its own label and icon
              // rather than sitting behind the same plain pencil every
              // other status uses for a simple rename.
              !env.next_version && (
                <Button variant="ghost" size="icon" onClick={handleAmend} title="This document has an issue — create an amended Version 2" aria-label="Create an amended version">
                  <Icon name="gitBranch" size={14} />
                </Button>
              )
            ) : (
              <Button variant="ghost" size="icon" onClick={handleRename} title="Rename this envelope" aria-label="Rename this envelope">
                <Icon name="edit" size={14} />
              </Button>
            )}
            {env.status === 'draft' && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/sign/editor/${env.id}`)}>Edit</Button>
                <Button variant="default" size="sm" onClick={handleSend}>Send for Signing</Button>
              </>
            )}
            {env.status === 'sent' && (
              <>
                <Button variant="outline" size="sm" onClick={handleRemind}>Remind</Button>
                <Button variant="outline" size="sm" onClick={handleVoid}
                  style={{ borderColor: 'var(--sign-red)', background: 'var(--sign-red-l)', color: 'var(--sign-red)' }}>
                  Void
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Version chain banners */}
      {env.previous_version && (
        <div onClick={() => navigate(`/sign/envelope/${env.previous_version!.id}`)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-l)', border: '1px solid var(--blue)', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, color: 'var(--ink)' }}>
          <Icon name="gitBranch" size={14} style={{ color: 'var(--blue)', flexShrink: 0 } as React.CSSProperties} />
          This is Version {env.version_number}, amended from <strong>Version {env.previous_version.version_number} — {env.previous_version.title}</strong>
          <Icon name="chevronRight" size={13} style={{ marginLeft: 'auto', color: 'var(--ink3)' } as React.CSSProperties} />
        </div>
      )}
      {env.next_version && (
        <div onClick={() => navigate(`/sign/envelope/${env.next_version!.id}`)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, color: 'var(--ink)' }}>
          <Icon name="gitBranch" size={14} style={{ color: 'var(--gold)', flexShrink: 0 } as React.CSSProperties} />
          This signed document is unchanged, but it’s been superseded by <strong>Version {env.next_version.version_number}</strong> ({env.next_version.status})
          <Icon name="chevronRight" size={13} style={{ marginLeft: 'auto', color: 'var(--ink3)' } as React.CSSProperties} />
        </div>
      )}

      {/* Document on the left (2/3), everything about it — status, stamp,
          recipients, audit trail (1/3) — on the right. This used to be one
          full-width stacked column with no way to actually see the
          document short of downloading it first. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 20, alignItems: 'start' }}>

        {/* LEFT: document preview */}
        <div ref={previewPaneRef} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 0, position: isMobile ? 'static' : 'sticky', top: isMobile ? undefined : 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document</div>
            {env.file_name && (
              <span style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Icon name="paperclip" size={11} /> {env.file_name}
              </span>
            )}
          </div>

          {previewIsPdf && previewNumPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1f2937', borderRadius: 20, padding: '5px 14px' }}>
              <button onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage <= 1}
                style={{ background: 'none', border: 'none', cursor: previewPage <= 1 ? 'default' : 'pointer', opacity: previewPage <= 1 ? 0.4 : 1, display: 'flex', padding: 2 }}>
                <Icon name="chevronLeft" size={15} color="#d1d5db" />
              </button>
              <span style={{ fontSize: 12.5, color: '#f3f4f6', fontWeight: 600 }}>Page {previewPage} / {previewNumPages}</span>
              <button onClick={() => setPreviewPage(p => Math.min(previewNumPages, p + 1))} disabled={previewPage >= previewNumPages}
                style={{ background: 'none', border: 'none', cursor: previewPage >= previewNumPages ? 'default' : 'pointer', opacity: previewPage >= previewNumPages ? 0.4 : 1, display: 'flex', padding: 2 }}>
                <Icon name="chevronRight" size={15} color="#d1d5db" />
              </button>
            </div>
          )}

          <div style={{ width: previewW, height: previewH, maxWidth: '100%', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {previewLoading || (previewIsPdf && !!previewUrl && previewPdfLoading) ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading document…</div>
            ) : !previewUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--ink3)', padding: 24, textAlign: 'center' }}>
                <Icon name="fileText" size={28} style={{ opacity: 0.4 }} />
                <div style={{ fontSize: 13 }}>No preview available for this document</div>
              </div>
            ) : previewIsPdf ? (
              previewPdfError || !previewDoc ? (
                <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Couldn’t load this PDF</div>
              ) : (
                <PdfPageCanvas doc={previewDoc} pageNumber={previewPage} scale={previewScale} style={{ display: 'block' }} />
              )
            ) : (
              <img src={previewUrl} alt={env.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
          </div>
        </div>

        {/* RIGHT: status, stamp, signing links, recipients, audit trail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

      {/* Void/decline reason banner */}
      {(env.status === 'voided' || env.status === 'declined') && env.void_reason && (
        <div style={{ background: 'var(--sign-red-l)', border: '1px solid var(--sign-red)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sign-red)', marginBottom: 4 }}>
            {env.status === 'declined' ? 'Declined' : 'Voided'}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{env.void_reason}</div>
        </div>
      )}

      {/* Verification code stamp (if completed) */}
      {env.status === 'completed' && env.verification_code && (
        <div style={{ background: 'var(--sign-green-l)', border: '1px solid var(--sign-green)', borderRadius: 12, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <FeaturedIcon variant="success" size="md" shape="circle"><Icon name="lock" size={20} /></FeaturedIcon>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sign-green)', marginBottom: 4 }}>Stamped &amp; Verified</div>
            <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: 'var(--sign-green)', letterSpacing: '0.08em' }}>{env.verification_code}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>
              Verify at: <a href={`/sign/verify/${env.verification_code}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--teal)', fontWeight: 600 }}>/sign/verify/{env.verification_code}</a>
            </div>
            {env.anchor_status && (
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name={env.anchor_status === 'confirmed' ? 'checkCircle' : 'clock'} size={12} style={{ color: env.anchor_status === 'confirmed' ? 'var(--green)' : 'var(--gold)' }} />
                {env.anchor_status === 'confirmed'
                  ? `Bitcoin-anchored — confirmed in block #${env.anchor_block_height}`
                  : 'Bitcoin anchor pending confirmation'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => setShowShareModal(true)}
              style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)' }}>
              <Icon name="share" size={13} /> Share Link
            </Button>
            {env.stamped_file_url && (
              <Button variant="default" size="sm"
                onClick={() => apiDownload(`/v1/sign/envelopes/${env.id}/download`, `${env.title} — signed.pdf`)}
                style={{ background: 'var(--sign-green)', color: '#fff', fontWeight: 600 }}>
                <Icon name="download" size={13} /> Download PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCopyCode}
              style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)' }}>
              <Icon name={copiedCode ? 'check' : 'copy'} size={13} /> {copiedCode ? 'Copied!' : 'Copy Code'}
            </Button>
          </div>
        </div>
      )}

      {/* Signing links (if sent status) */}
      {env.status === 'sent' && env.recipients && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Recipient Signing Links</div>
            <Button variant="outline" size="xs" onClick={() => setShowShareModal(true)} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
              <Icon name="share" size={12} /> Share Links
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {env.recipients.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <Badge variant={recipientBadgeVariant(r.status)}>{r.status}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 8 }}>{r.email}</span>
                </div>
                {r.role_label && <Badge variant="gray">{r.role_label}</Badge>}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(r.status === 'pending' || r.status === 'viewed') && (
                    <Button variant="outline" size="xs" onClick={() => window.open(`/sign/public/${r.token}`, '_blank', 'noopener')}
                      title="Open this recipient's signing link right now — for in-person signing"
                      style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                      <Icon name="edit" size={11} /> Sign In Person
                    </Button>
                  )}
                  <Button variant="outline" size="xs" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/sign/public/${r.token}`)}>
                    Copy Link
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipients Section */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Recipients</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {env.recipients?.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <PersonAvatar userId={r.user_id} name={r.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{r.email}{r.role_label ? ` · ${r.role_label}` : ''}</div>
                {r.status === 'declined' && r.decline_reason && (
                  <div style={{ fontSize: 11.5, color: 'var(--sign-red)', marginTop: 3 }}>Reason: {r.decline_reason}</div>
                )}
              </div>
              <Badge variant={recipientBadgeVariant(r.status)}>{r.status}</Badge>
              {r.signed_at && <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{new Date(r.signed_at).toLocaleString()}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Audit Trail Timeline */}
      {env.events && env.events.length > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Audit Trail</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 6 }}>
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
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                      <strong>{ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}</strong>
                      {ev.actor_name ? ` by ${ev.actor_name}` : ''}
                    </div>
                    {ev.note && <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{ev.note}</div>}
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{new Date(ev.created_at).toLocaleString()}</span>
                      {ev.ip_address && (
                        <span style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'monospace' }}>
                          IP: {ev.ip_address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

        </div>
        {/* end RIGHT column */}
      </div>
      {/* end document/detail grid */}

      {showShareModal && <ShareEnvelopeModal env={env} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
