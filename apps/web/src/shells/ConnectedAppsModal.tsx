import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useCloud, StorageProvider } from './cloud-context.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent } from '../components/ui/dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';

export const STORAGE_PROVIDERS: { id: StorageProvider; name: string; color: string; icon: IconName; blurb: string }[] = [
  { id: 'box',      name: 'Box',      color: '#0061D5', icon: 'box2',    blurb: 'Sync folders to your Box account.' },
  { id: 'dropbox',  name: 'Dropbox',  color: '#0061FF', icon: 'package', blurb: 'Sync folders to your Dropbox account.' },
  { id: 'mega',     name: 'Mega',     color: '#D9272E', icon: 'lock',    blurb: 'Sync folders to your encrypted Mega drive.' },
  { id: 'onedrive', name: 'OneDrive', color: '#0078D4', icon: 'layers',  blurb: 'Sync folders to your OneDrive account.' },
];

function fmtRelative(iso: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function ConnectedAppsModal({ onClose }: { onClose: () => void }) {
  const {
    connections, connectionsLoading, loadConnections, connectProvider, disconnectProvider, syncProvider,
    configureConnectorOAuth, startConnectorOAuth,
  } = useCloud();
  const [connectingProvider, setConnectingProvider] = useState<StorageProvider | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [busyProvider, setBusyProvider] = useState<StorageProvider | null>(null);
  const [oauthFormProvider, setOauthFormProvider] = useState<StorageProvider | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => { loadConnections(); }, [loadConnections]);

  async function handleConnect(provider: StorageProvider) {
    if (!emailInput.trim()) return;
    setBusyProvider(provider);
    try {
      await connectProvider(provider, emailInput.trim());
      setConnectingProvider(null);
      setEmailInput('');
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleSaveOAuthConfig(provider: StorageProvider) {
    if (!clientId.trim()) return;
    setBusyProvider(provider);
    try {
      await configureConnectorOAuth(provider, clientId.trim(), clientSecret.trim());
      setOauthFormProvider(null);
      setClientId(''); setClientSecret('');
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleOAuthConnect(provider: StorageProvider) {
    setBusyProvider(provider);
    try {
      const { url } = await startConnectorOAuth(provider);
      if (url) window.location.href = url;
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleDisconnect(provider: StorageProvider) {
    setBusyProvider(provider);
    try { await disconnectProvider(provider); } finally { setBusyProvider(null); }
  }

  async function handleSync(provider: StorageProvider) {
    setBusyProvider(provider);
    try { await syncProvider(provider); } finally { setBusyProvider(null); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent hideClose className="flex w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md" style={{ maxHeight: 'min(85vh, 640px)' }}>
        {/* Header — fixed, doesn't scroll with the list */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="text-base font-bold" style={{ color: 'var(--ink)' }}>Connected apps</div>
            <p className="mt-1 text-sm leading-snug" style={{ color: 'var(--ink3)' }}>
              Sync your Drive to other storage providers. Connecting one requires that provider's own account sign-in.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-(--bg)"
            style={{ color: 'var(--ink3)' }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Body — the only part that scrolls */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {connectionsLoading && connections.length === 0 ? (
            <SectionLoading />
          ) : (
            <div className="flex flex-col gap-2.5">
              {STORAGE_PROVIDERS.map(p => {
                const conn = connections.find(c => c.provider === p.id);
                const isConnected = conn?.status === 'connected';
                const isBusy = busyProvider === p.id;
                const isConnecting = connectingProvider === p.id;
                const isReal = conn?.supported === true;
                const oauthReady = conn?.oauth_configured === true;
                const showOAuthForm = oauthFormProvider === p.id;

                return (
                  <div
                    key={p.id}
                    className="rounded-(--r-lg) border p-3.5 transition-colors sm:p-4"
                    style={{ borderColor: 'var(--border)', background: 'var(--white)' }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--r)"
                          style={{ background: `${p.color}1a` }}
                        >
                          <Icon name={p.icon} size={18} color={p.color} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold" style={{ color: 'var(--ink)', fontSize: 'var(--text-base)' }}>{p.name}</span>
                            <Badge variant={isConnected ? 'success' : isReal ? 'gray' : 'info'}>{isConnected ? 'Connected' : isReal ? 'Not connected' : 'Coming soon'}</Badge>
                          </div>
                          <div className="mt-0.5 truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink3)' }}>
                            {isConnected
                              ? `${conn?.account_email ?? conn?.account_label ?? 'Account'} · synced ${fmtRelative(conn?.last_synced_at ?? null) ?? 'never'}`
                              : isReal
                              ? (oauthReady ? 'OAuth app configured — connect your account.' : 'Needs a Microsoft Graph OAuth app (Client ID + Secret).')
                              : `${p.blurb.replace('Sync folders to', 'Browse and sync files from')} Not available yet — this integration is still being built.`}
                          </div>
                          {isConnected && conn?.file_count != null && (
                            <div className="mt-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink3)' }}>{conn.file_count} files synced</div>
                          )}
                        </div>
                      </div>

                      {/* Actions get their own full-width row on mobile instead of
                          squeezing beside the icon/name — that's the layout the
                          original never had a fallback for. */}
                      {!isConnecting && !showOAuthForm && (
                        isConnected ? (
                          <div className="flex shrink-0 gap-2 sm:gap-1.5">
                            {isReal && (
                              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" disabled={isBusy} onClick={() => handleSync(p.id)}>
                                <Icon name="refresh" size={12} /> Sync
                              </Button>
                            )}
                            <Button
                              variant="outline" size="sm" className="flex-1 sm:flex-none"
                              disabled={isBusy} onClick={() => handleDisconnect(p.id)}
                              style={{ color: 'var(--red)' }}
                            >
                              Disconnect
                            </Button>
                          </div>
                        ) : isReal ? (
                          <div className="flex shrink-0 gap-2 sm:gap-1.5">
                            <Button variant="outline" size="sm" className="flex-1 sm:flex-none"
                              onClick={() => { setOauthFormProvider(p.id); setClientId(conn?.oauth_client_id ?? ''); setClientSecret(''); }}>
                              {oauthReady ? 'Edit app' : 'Set up app'}
                            </Button>
                            {oauthReady && (
                              <Button size="sm" className="flex-1 sm:flex-none" disabled={isBusy} onClick={() => handleOAuthConnect(p.id)}>
                                {isBusy ? 'Redirecting…' : 'Connect'}
                              </Button>
                            )}
                          </div>
                        ) : (
                          // No real integration behind this provider yet — never offer a Connect that would only record an email.
                          <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled>Coming soon</Button>
                        )
                      )}
                    </div>

                    {isConnecting && (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          autoFocus
                          value={emailInput}
                          onChange={e => setEmailInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleConnect(p.id); if (e.key === 'Escape') setConnectingProvider(null); }}
                          placeholder={`${p.name} account email…`}
                          className="input-field flex-1"
                          style={{ fontSize: 'var(--text-base)' }}
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setConnectingProvider(null)}>Cancel</Button>
                          <Button size="sm" className="flex-1 sm:flex-none" disabled={!emailInput.trim() || isBusy} onClick={() => handleConnect(p.id)}>
                            {isBusy ? 'Connecting…' : 'Connect'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {showOAuthForm && (
                      <div className="mt-3 flex flex-col gap-2">
                        <p className="text-xs leading-snug" style={{ color: 'var(--ink3)' }}>
                          Register an app in the Microsoft Entra (Azure AD) portal with a redirect URI of
                          {' '}<code>{window.location.origin}/cloud/connections/{p.id}/callback</code> and the
                          {' '}<code>Files.Read offline_access</code> scopes, then paste its Client ID and Secret.
                        </p>
                        <input autoFocus value={clientId} onChange={e => setClientId(e.target.value)}
                          placeholder="Client ID" className="input-field" style={{ fontSize: 'var(--text-base)' }} />
                        <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                          placeholder={oauthReady ? 'Client Secret (leave blank to keep)' : 'Client Secret'}
                          className="input-field" style={{ fontSize: 'var(--text-base)' }} />
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setOauthFormProvider(null)}>Cancel</Button>
                          <Button size="sm" className="flex-1 sm:flex-none" disabled={!clientId.trim() || isBusy} onClick={() => handleSaveOAuthConfig(p.id)}>
                            {isBusy ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — fixed */}
        <div className="flex shrink-0 justify-end border-t px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
