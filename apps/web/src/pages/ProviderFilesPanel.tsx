import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import { useCloud, StorageProvider } from '../shells/cloud-context.js';
import { STORAGE_PROVIDERS } from '../shells/ConnectedAppsModal.js';
import { fmtSize, fmtDate } from './cloud/lib/format.js';
import { fileTypeStyle } from './cloud/lib/fileTypeStyle.js';

interface ExternalFile {
  id: string;
  provider: string;
  name: string;
  type: string;
  size: number | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Crumb { id: string | null; name: string }

const GD = { blue: '#1a73e8', blueL: '#e8f0fe' };

export function ProviderFilesPanel({ provider }: { provider: StorageProvider }) {
  const { connections, loadConnections, connectProvider, disconnectProvider, syncProvider } = useCloud();
  const meta = STORAGE_PROVIDERS.find(p => p.id === provider)!;
  const conn = connections.find(c => c.provider === provider);
  const isConnected = conn?.status === 'connected';

  const [files, setFiles] = useState<ExternalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([{ id: null, name: meta.name }]);
  const [emailInput, setEmailInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset local folder navigation whenever the provider switches
  useEffect(() => {
    setCurrentFolderId(null);
    setBreadcrumb([{ id: null, name: meta.name }]);
    setFiles([]);
    setError(null);
  }, [provider]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/v1/files/connections/${provider}/files`)
      .then(data => { if (!cancelled) setFiles(Array.isArray(data) ? data : []); })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load synced files'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [provider, isConnected]);

  async function handleConnect() {
    if (!emailInput.trim()) return;
    setBusy(true);
    try { await connectProvider(provider, emailInput.trim()); setEmailInput(''); }
    catch (err: any) { setError(err.message || 'Connect failed'); }
    finally { setBusy(false); }
  }

  async function handleDisconnect() {
    setBusy(true);
    try { await disconnectProvider(provider); setFiles([]); }
    catch (err: any) { setError(err.message || 'Disconnect failed'); }
    finally { setBusy(false); }
  }

  async function handleSync() {
    setBusy(true);
    try {
      await syncProvider(provider);
      const data = await apiFetch(`/v1/files/connections/${provider}/files`);
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: any) { setError(err.message || 'Sync failed'); }
    finally { setBusy(false); }
  }

  function openFolder(item: ExternalFile) {
    setCurrentFolderId(item.id);
    setBreadcrumb(prev => [...prev, { id: item.id, name: item.name }]);
  }
  function navToBreadcrumb(idx: number) {
    setBreadcrumb(prev => {
      const next = prev.slice(0, idx + 1);
      setCurrentFolderId(next[next.length - 1].id);
      return next;
    });
  }

  if (!isConnected) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius:'var(--r)', background: `${meta.color}1a` }}>
          <Icon name={meta.icon} size={30} color={meta.color} />
        </span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize:'var(--text-lg)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{meta.name} isn't connected</div>
          <div style={{ fontSize:'var(--text-base)', color: 'var(--ink3)' }}>{meta.blurb}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, width: 320 }}>
          <input
            autoFocus
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            placeholder={`${meta.name} account email…`}
            className="input-field"
            style={{ flex: 1, fontSize:'var(--text-base)' }}
          />
          <button onClick={handleConnect} className="btn btn-primary btn-sm" disabled={!emailInput.trim() || busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {error && <div style={{ fontSize:'var(--text-sm)', color: 'var(--red)' }}>{error}</div>}
      </div>
    );
  }

  const displayItems = files.filter(f => f.parent_id === currentFolderId);
  const folders = displayItems.filter(f => f.type === 'folder');
  const filesOnly = displayItems.filter(f => f.type !== 'folder');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          {breadcrumb.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <Icon name="chevronRight" size={12} color="var(--ink3)" />}
              <button
                onClick={() => navToBreadcrumb(idx)}
                style={{ background: 'none', border: 'none', padding: 'var(--ds-btn-py-xs) 4px', borderRadius:'var(--r-sm)', cursor: idx < breadcrumb.length - 1 ? 'pointer' : 'default', color: idx === breadcrumb.length - 1 ? 'var(--ink)' : 'var(--ink3)', fontWeight: idx === breadcrumb.length - 1 ? 600 : 400, fontSize:'var(--text-md)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
          {conn?.account_label && <span style={{ fontSize:'var(--text-xs)', color: 'var(--ink3)' }}>· {conn.account_label}</span>}
        </div>
        <button onClick={handleSync} disabled={busy} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Icon name="refresh" size={13} /> {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button onClick={handleDisconnect} disabled={busy} className="btn btn-secondary btn-sm" style={{ gap: 6, color: 'var(--red)' }}>
          Disconnect
        </button>
      </div>

      {conn?.last_synced_at && (
        <div style={{ padding: '8px 20px', fontSize:'var(--text-xs)', color: 'var(--ink3)', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
          Last synced {fmtDate(conn.last_synced_at)}
        </div>
      )}

      {error && <Banner variant="error" onDismiss={() => setError(null)} className="rounded-none border-x-0 border-t-0">{error}</Banner>}

      <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)', fontSize:'var(--text-md)' }}>Loading synced files…</div>
        )}

        {!loading && displayItems.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--ink3)' }}>
            <Icon name="folder" size={48} color="var(--border)" />
            <span style={{ fontSize:'var(--text-md)' }}>Nothing synced here yet</span>
          </div>
        )}

        {folders.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize:'var(--text-sm)', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Folders <span style={{ fontWeight: 400 }}>({folders.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {folders.map(item => (
                <div
                  key={item.id}
                  onClick={() => openFolder(item)}
                  style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius:'var(--r)', padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius:'var(--r)', background: `${meta.color}1a` }}>
                      <Icon name="folder" size={20} color={meta.color} />
                    </span>
                    <div style={{ fontSize:'var(--text-base)', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filesOnly.length > 0 && (
          <div>
            <div style={{ fontSize:'var(--text-sm)', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Files <span style={{ fontWeight: 400 }}>({filesOnly.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {filesOnly.map(item => {
                const cfg = fileTypeStyle(item.type);
                return (
                  <div
                    key={item.id}
                    style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius:'var(--r)', padding: '14px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <FeaturedIcon variant={cfg.variant} size="md"><Icon name={cfg.icon} size={20} /></FeaturedIcon>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize:'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all', lineHeight: 1.3 }}>{item.name}</div>
                        <div style={{ fontSize:'var(--text-xs)', color: 'var(--ink3)', marginTop: 2 }}>{cfg.label}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:'var(--text-xs)', color: 'var(--ink3)' }}>{fmtSize(item.size)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
