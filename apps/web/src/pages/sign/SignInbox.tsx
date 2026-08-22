// ─── SignInbox.tsx — Inbox + Sent + Drafts + Completed views ─────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiDownload } from '../../lib/api.js';
import type { SignEnvelope, SignRecipient } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import './Sign.css';

type EnvelopeWithRecipients = SignEnvelope & { recipients: SignRecipient[] };

const VIEW_TABS = [
  { key: 'inbox',     label: 'Inbox',     icon: 'download'  as const },
  { key: 'sent',      label: 'Sent',      icon: 'send'      as const },
  { key: 'drafts',    label: 'Drafts',    icon: 'fileText'  as const },
  { key: 'completed', label: 'Completed', icon: 'checkCircle' as const },
  { key: 'voided',    label: 'Voided',    icon: 'xCircle'   as const },
  { key: 'declined',  label: 'Declined',  icon: 'xCircle'   as const },
  { key: 'expired',   label: 'Expired',   icon: 'clock'     as const },
] as const;
type ViewKey = typeof VIEW_TABS[number]['key'];

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    draft: 'sign-badge-draft', sent: 'sign-badge-sent', completed: 'sign-badge-completed',
    voided: 'sign-badge-voided', declined: 'sign-badge-declined', expired: 'sign-badge-expired',
  };
  return `sign-badge ${map[status] ?? 'sign-badge-draft'}`;
}

function recipientStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    pending: 'sign-badge-pending', viewed: 'sign-badge-viewed',
    signed: 'sign-badge-signed', declined: 'sign-badge-declined',
  };
  return `sign-badge ${map[status] ?? 'sign-badge-pending'}`;
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const RECIPIENT_COLORS = ['#1a56db','#0e9f6e','#d97706','#7c3aed','#db2777','#0891b2'];

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
          <span className={statusBadgeClass(env.status)}>{env.status}</span>
          {env.file_name && <span style={{ color: 'var(--ink3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={11} /> {env.file_name}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>
            {new Date(env.updated_at).toLocaleDateString()}
          </span>
        </div>
        {signerCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div className="sign-recipient-avatars">
              {env.recipients.slice(0, 5).map((r, i) => (
                <div key={r.id} className="sign-recipient-avatar"
                  style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}
                  title={`${r.name} (${r.status})`}>
                  {initials(r.name)}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {signedCount}/{signerCount} signed
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SignInbox({ view }: { view: ViewKey }) {
  const navigate = useNavigate();
  const [envelopes, setEnvelopes] = useState<EnvelopeWithRecipients[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)' }}>
        <input
          type="search" placeholder="Search envelopes…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
        />
        <Button variant="default" onClick={() => navigate('/sign/editor')}>
          <Icon name="plus" size={14} /> New Envelope
        </Button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 80, borderRadius: 12, background: 'var(--border)', opacity: 0.5, animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--ink3)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="edit" size={48} style={{ opacity: 0.2 }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              {view === 'inbox' ? 'Nothing waiting for your signature' : view === 'drafts' ? 'No drafts' : `No ${view} envelopes`}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink3)', maxWidth: 320 }}>
              {view === 'inbox' ? 'When someone sends you a document to sign, it will appear here.' : 'Create a new envelope to get started.'}
            </div>
            {view !== 'inbox' && (
              <Button variant="default" onClick={() => navigate('/sign/editor')} style={{ marginTop: 8 }}>
                <Icon name="plus" size={14} /> Create Envelope
              </Button>
            )}
          </div>
        ) : (
          filtered.map(env => (
            <EnvelopeCard key={env.id} env={env} onClick={() => navigate(`/sign/envelope/${env.id}`)} />
          ))
        )}
      </div>
    </div>
  );
}

export function SignEnvelopeDetail() {
  const navigate = useNavigate();
  const id = window.location.pathname.split('/').pop() ?? '';
  const [env, setEnv] = useState<EnvelopeWithRecipients | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/v1/sign/envelopes/${id}`).then(setEnv).catch(console.error).finally(() => setLoading(false));
  }, [id]);

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

  if (loading) return <div style={{ padding: 40, color: 'var(--ink3)', textAlign: 'center' }}>Loading…</div>;
  if (!env) return <div style={{ padding: 40, color: 'var(--ink3)', textAlign: 'center' }}>Envelope not found</div>;

  const allSigned = env.recipients?.every(r => r.status === 'signed');

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 32px', fontFamily: 'var(--font)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <Button variant="ghost" size="icon" onClick={() => navigate('/sign')} aria-label="Back to Sign">
          <Icon name="arrowLeft" size={16} />
        </Button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{env.title}</h1>
            <span className={statusBadgeClass(env.status)}>{env.status}</span>
          </div>
          {env.file_name && <div style={{ fontSize: 13, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="paperclip" size={12} /> {env.file_name}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
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
      </div>

      {/* Void/decline reason — real data (sign_envelopes.void_reason) that
          used to be stored and never shown anywhere in this page. */}
      {(env.status === 'voided' || env.status === 'declined') && env.void_reason && (
        <div style={{ background: 'var(--sign-red-l)', border: '1.5px solid var(--sign-red)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sign-red)', marginBottom: 4 }}>
            {env.status === 'declined' ? 'Declined' : 'Voided'}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{env.void_reason}</div>
        </div>
      )}

      {/* Verification code stamp (if completed) */}
      {env.status === 'completed' && env.verification_code && (
        <div style={{ background: 'var(--sign-green-l)', border: '1.5px solid var(--sign-green)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: 'var(--sign-green-l)', flexShrink: 0 }}><Icon name="lock" size={18} style={{ color: 'var(--sign-green)' }} /></div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--sign-green)', marginBottom: 4 }}>Stamped &amp; Verified</div>
            <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--sign-green)', letterSpacing: '0.08em' }}>{env.verification_code}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
              Verify at: <a href={`/sign/verify/${env.verification_code}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--sign-blue)' }}>/sign/verify/{env.verification_code}</a>
            </div>
            {env.anchor_status && (
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name={env.anchor_status === 'confirmed' ? 'checkCircle' : 'clock'} size={11} />
                {env.anchor_status === 'confirmed'
                  ? `Bitcoin-anchored — confirmed in block #${env.anchor_block_height}`
                  : 'Bitcoin anchor pending confirmation'}
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
            {/* --sign-green isn't run through the contrast-floor math
                --primary/--primary-foreground get (CLAUDE.md: that floor
                only exists for --primary today) — #fff here matches the
                rest of the platform's current, honest, un-floored state
                for semantic colors, not a fixed pairing pretending to be. */}
            {env.stamped_file_url && (
              <Button variant="default" size="sm"
                onClick={() => apiDownload(`/v1/sign/envelopes/${env.id}/download`, `${env.title} — signed.pdf`)}
                style={{ background: 'var(--sign-green)', color: '#fff' }}>
                <Icon name="download" size={12} /> Download PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(env.verification_code ?? '')}
              style={{ borderColor: 'var(--sign-green)', color: 'var(--sign-green)' }}>
              Copy Code
            </Button>
          </div>
        </div>
      )}

      {/* Signing links (sent status) */}
      {env.status === 'sent' && env.recipients && (
        <div style={{ marginBottom: 28, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--ink)' }}>Signing Links</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {env.recipients.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className={recipientStatusBadgeClass(r.status)}>{r.status}</span>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{r.email}</span>
                {r.role_label && <span style={{ fontSize: 11, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 99 }}>{r.role_label}</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {(r.status === 'pending' || r.status === 'viewed') && (
                    <Button variant="outline" size="xs" onClick={() => window.open(`/sign/public/${r.token}`, '_blank', 'noopener')}
                      title="Open this recipient's real signing link right now, on this device — for someone signing in person"
                      style={{ borderColor: 'var(--sign-blue)', color: 'var(--sign-blue)' }}>
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

      {/* Recipients Status */}
      <div style={{ marginBottom: 24, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--ink)' }}>Recipients</div>
        {env.recipients?.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < (env.recipients?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
              {initials(r.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{r.email}{r.role_label ? ` · ${r.role_label}` : ''}</div>
              {r.status === 'declined' && r.decline_reason && (
                <div style={{ fontSize: 11.5, color: 'var(--sign-red)', marginTop: 3 }}>Declined: {r.decline_reason}</div>
              )}
            </div>
            <span className={recipientStatusBadgeClass(r.status)}>{r.status}</span>
            {r.signed_at && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(r.signed_at).toLocaleString()}</span>}
          </div>
        ))}
      </div>

      {/* Audit trail */}
      {env.events && env.events.length > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--ink)' }}>Audit Trail</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {env.events.map((ev, i) => (
              <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                {i < env.events!.length - 1 && <div style={{ position: 'absolute', left: 10, top: 20, bottom: 0, width: 1, background: 'var(--border)' }} />}
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    <strong>{ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}</strong>
                    {ev.actor_name ? ` by ${ev.actor_name}` : ''}
                  </div>
                  {ev.note && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{ev.note}</div>}
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                    {new Date(ev.created_at).toLocaleString()}
                    {ev.ip_address ? ` · ${ev.ip_address}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
