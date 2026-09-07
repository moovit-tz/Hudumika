import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { showAlert } from '../../lib/alert.js';

/** This used to be a fake multi-vendor SIP trunk marketplace (Twilio/
 *  Telnyx/Asterisk cards with invented account SIDs and per-minute rates) —
 *  no PSTN/SIP telephony vendor is wired into this codebase anywhere,
 *  calling here is 1:1 WebRTC between logged-in staff (Calls.tsx) and
 *  multi-party WebRTC meetings (Meeting Center), not phone-network calls.
 *  Adding a real SIP vendor is a business decision (a purchased number, a
 *  vendor account, ongoing per-minute cost), not a code change — same
 *  reasoning BlissCallCenter.tsx's own removal was built on.
 *
 *  What IS real here: the WebRTC connectivity infrastructure that actually
 *  exists — public STUN (hardcoded, genuinely used) plus an optional
 *  per-tenant TURN relay (calls.routes.ts's resolveIceServers, already
 *  live and already used by every 1:1 call and meeting). Without a TURN
 *  server, two callers who are both behind strict/symmetric NATs (common on
 *  corporate networks) simply cannot connect — this page is where a tenant
 *  configures one, and where they can see whether it's live. */
interface IceServer { urls: string | string[]; username?: string; credential?: string }

export const BlissTelephony: React.FC = () => {
  const { user } = useAuth();
  const canManage = MGMT_ROLES.includes(user?.role as any);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [liveIceServers, setLiveIceServers] = useState<IceServer[] | null>(null);
  const [turnConfigured, setTurnConfigured] = useState(false);
  const [turnUrls, setTurnUrls] = useState('');
  const [turnUsername, setTurnUsername] = useState('');
  const [turnCredential, setTurnCredential] = useState('');
  const [credentialConfigured, setCredentialConfigured] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/settings'),
      apiFetch('/v1/calls/config'),
    ]).then(([settingsRes, configRes]: any) => {
      const turn = settingsRes?.settings?.turnConfig;
      setTurnUrls(Array.isArray(turn?.urls) ? turn.urls.join(', ') : (turn?.urls || ''));
      setTurnUsername(turn?.username || '');
      setCredentialConfigured(!!turn?.credential);
      setTurnCredential('');
      setLiveIceServers(Array.isArray(configRes?.iceServers) ? configRes.iceServers : null);
      // The API already computes this (iceServers.length > 2) — trust it
      // rather than re-deriving from URL string prefixes on the frontend.
      setTurnConfigured(!!configRes?.turnConfigured);
    }).catch(() => {
      setLiveIceServers(null);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function saveTurnConfig() {
    setSaving(true);
    try {
      const urls = turnUrls.split(',').map(u => u.trim()).filter(Boolean);
      await apiFetch('/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          turnConfig: {
            urls: urls.length > 1 ? urls : (urls[0] || ''),
            username: turnUsername.trim(),
            // Masked sentinel round-trips as "leave unchanged" (see
            // settings.routes.ts) — only send a new value when one was typed.
            ...(turnCredential.trim() ? { credential: turnCredential.trim() } : {}),
          },
        }),
      });
      showAlert('TURN server configuration saved.');
      load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not save TURN configuration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '20px 24px', background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Bliss', 'Settings', 'Telephony']}
        titlePlain="Calling"
        titleEm="Infrastructure"
        subtitle="STUN/TURN connectivity for WebRTC direct calls and meetings — not a PSTN/SIP phone line, which this platform doesn't integrate."
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>STUN Servers</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>
              {liveIceServers?.filter(s => String(s.urls).startsWith('stun:')).length ?? 0} Active
            </div>
          </div>
          <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>TURN Relay</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: turnConfigured ? 'var(--green)' : 'var(--gold)', marginTop: 4 }}>
              {turnConfigured ? 'Configured' : 'Not configured'}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        <SectionCard title="Live ICE Server Resolution (GET /v1/calls/config)">
          {!liveIceServers ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Could not load live configuration.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {liveIceServers.map((s, i) => {
                const url = String(s.urls);
                const isTurn = url.startsWith('turn:') || url.startsWith('turns:');
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name={isTurn ? 'shield' : 'globe'} size={16} color={isTurn ? 'var(--teal)' : 'var(--ink3)'} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{url}</div>
                        {s.username && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>User: {s.username}</div>}
                      </div>
                    </div>
                    <Badge variant={isTurn ? 'brand' : 'gray'}>{isTurn ? 'TURN relay' : 'STUN'}</Badge>
                  </div>
                );
              })}
              {!turnConfigured && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--gold)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Icon name="alertTriangle" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                  Without a TURN relay, calls between two participants who are both behind a strict/symmetric NAT (common on corporate Wi-Fi) may fail to connect. STUN alone handles most home/mobile networks fine.
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard title="TURN Server Configuration">
          {!canManage ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Only tenant admins and managers can change this.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700 }}>TURN URL(s)</label>
                <input
                  className="input-field" style={{ marginTop: 4, fontFamily: 'var(--mono)' }}
                  value={turnUrls} onChange={e => setTurnUrls(e.target.value)}
                  placeholder="turn:turn.example.com:3478, turns:turn.example.com:5349"
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700 }}>Username</label>
                <input className="input-field" style={{ marginTop: 4 }} value={turnUsername} onChange={e => setTurnUsername(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700 }}>Credential</label>
                <input
                  type="password" className="input-field" style={{ marginTop: 4 }}
                  value={turnCredential} onChange={e => setTurnCredential(e.target.value)}
                  placeholder={credentialConfigured ? '•••••••• (leave blank to keep current)' : 'Not set'}
                />
              </div>
              <Button variant="default" size="sm" onClick={saveTurnConfig} disabled={saving}>
                <Icon name="checkCircle" size={13} /> {saving ? 'Saving…' : 'Save TURN Configuration'}
              </Button>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                Any coturn/Xirsys/Twilio Network Traversal Service TURN server works. Leaving this empty falls back to public STUN only.
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
