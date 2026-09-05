import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useCloud, StorageProvider } from './cloud-context.js';
import { SectionLoading } from '../components/ui/spinner.js';

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
  const { connections, connectionsLoading, loadConnections, connectProvider, disconnectProvider, syncProvider } = useCloud();
  const [connectingProvider, setConnectingProvider] = useState<StorageProvider | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [busyProvider, setBusyProvider] = useState<StorageProvider | null>(null);

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

  async function handleDisconnect(provider: StorageProvider) {
    setBusyProvider(provider);
    try { await disconnectProvider(provider); } finally { setBusyProvider(null); }
  }

  async function handleSync(provider: StorageProvider) {
    setBusyProvider(provider);
    try { await syncProvider(provider); } finally { setBusyProvider(null); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 460, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize:'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>Connected Apps</span>
          <button onClick={onClose} className="dp-close" aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <p style={{ fontSize:'var(--text-sm)', color: 'var(--ink3)', margin: '0 0 18px' }}>
          Sync your Drive to other storage providers. Connecting a provider requires that provider's own account sign-in.
        </p>

        {connectionsLoading && connections.length === 0 ? (
          <SectionLoading />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STORAGE_PROVIDERS.map(p => {
              const conn = connections.find(c => c.provider === p.id);
              const isConnected = conn?.status === 'connected';
              const isBusy = busyProvider === p.id;
              const isConnecting = connectingProvider === p.id;

              return (
                <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius:'var(--r)', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius:'var(--r)', background: `${p.color}1a`, flexShrink: 0 }}>
                      <Icon name={p.icon} size={18} color={p.color} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize:'var(--text-base)', fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                        <span style={{ fontSize:'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius:'var(--badge-radius)', textTransform: 'uppercase', letterSpacing: '0.03em', color: isConnected ? '#188038' : 'var(--ink3)', background: isConnected ? '#e6f4ea' : 'var(--bg)' }}>
                          {isConnected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      <div style={{ fontSize:'var(--text-xs)', color: 'var(--ink3)', marginTop: 2 }}>
                        {isConnected
                          ? `${conn?.account_label ?? 'Account'} · synced ${fmtRelative(conn?.last_synced_at ?? null) ?? 'never'}`
                          : p.blurb}
                      </div>
                    </div>
                    {!isConnecting && (
                      isConnected ? (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => handleSync(p.id)}
                            disabled={isBusy}
                            className="btn btn-secondary btn-sm"
                          >
                            <Icon name="refresh" size={12} /> Sync
                          </button>
                          <button
                            onClick={() => handleDisconnect(p.id)}
                            disabled={isBusy}
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--red)' }}
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setConnectingProvider(p.id); setEmailInput(''); }}
                          className="btn btn-primary btn-sm"
                          style={{ flexShrink: 0 }}
                        >
                          Connect
                        </button>
                      )
                    )}
                  </div>

                  {isConnecting && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <input
                        autoFocus
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConnect(p.id); if (e.key === 'Escape') setConnectingProvider(null); }}
                        placeholder={`${p.name} account email…`}
                        className="input-field"
                        style={{ flex: 1, fontSize:'var(--text-base)' }}
                      />
                      <button onClick={() => setConnectingProvider(null)} className="btn btn-secondary btn-sm">Cancel</button>
                      <button onClick={() => handleConnect(p.id)} className="btn btn-primary btn-sm" disabled={!emailInput.trim() || isBusy}>
                        {isBusy ? 'Connecting…' : 'Connect'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
