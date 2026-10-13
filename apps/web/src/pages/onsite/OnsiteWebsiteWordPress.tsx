import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { NotProvisioned } from './NotProvisioned.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import './Onsite.css';

interface WPInfo {
  installed: boolean;
  version: string | null;
  adminUrl: string | null;
  siteUrl: string | null;
  autoUpdate: boolean;
}

interface WPPlugin {
  name: string;
  slug: string;
  version: string;
  active: boolean;
  updateAvailable: boolean;
}

export function OnsiteWebsiteWordPress() {
  const { siteId } = useParams<{ siteId: string }>();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [wordpress, setWordpress] = useState<WPInfo | null>(null);
  const [plugins, setPlugins] = useState<WPPlugin[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Install dialog
  const [showInstall, setShowInstall] = useState(false);
  const [installTitle, setInstallTitle] = useState('');
  const [installUser, setInstallUser] = useState('admin');
  const [installEmail, setInstallEmail] = useState('');
  const [installPassword, setInstallPassword] = useState('');
  const [installing, setInstalling] = useState(false);

  // Plugin install
  const [pluginSlug, setPluginSlug] = useState('');
  const [installingPlugin, setInstallingPlugin] = useState(false);

  const loadWP = () => {
    if (!siteId) { setLoading(false); return; }
    apiFetch(`/v1/onsite/websites/${siteId}/wordpress`)
      .then((res: any) => {
        setConnected(res.connected !== false);
        setWordpress(res.wordpress ?? null);
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  };

  const loadPlugins = () => {
    if (!siteId) return;
    setPluginsLoading(true);
    apiFetch(`/v1/onsite/websites/${siteId}/wordpress/plugins`)
      .then((res: any) => setPlugins(Array.isArray(res) ? res : []))
      .catch(() => setPlugins([]))
      .finally(() => setPluginsLoading(false));
  };

  useEffect(loadWP, [siteId]);

  useEffect(() => {
    if (wordpress?.installed) loadPlugins();
  }, [wordpress?.installed]);

  const handleInstall = async () => {
    if (!siteId || !installTitle || !installUser || !installEmail || !installPassword) return;
    setInstalling(true);
    try {
      const res = await apiFetch(`/v1/onsite/websites/${siteId}/wordpress/install`, {
        method: 'POST',
        body: JSON.stringify({
          title: installTitle, admin_user: installUser,
          admin_email: installEmail, admin_password: installPassword,
        }),
      });
      setWordpress(res.wordpress);
      setShowInstall(false);
      showAlert('WordPress installed successfully', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Installation failed', { variant: 'error' });
    } finally { setInstalling(false); }
  };

  const handleUpdate = async () => {
    if (!siteId) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/v1/onsite/websites/${siteId}/wordpress/update`, { method: 'POST' });
      setWordpress(res.wordpress);
      showAlert('WordPress updated', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Update failed', { variant: 'error' });
    } finally { setUpdating(false); }
  };

  const handleInstallPlugin = async () => {
    if (!siteId || !pluginSlug.trim()) return;
    setInstallingPlugin(true);
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/wordpress/plugins`, {
        method: 'POST', body: JSON.stringify({ slug: pluginSlug.trim() }),
      });
      showAlert(`Plugin "${pluginSlug}" installed`, { variant: 'success' });
      setPluginSlug('');
      loadPlugins();
    } catch (err: any) {
      showAlert(err.message || 'Plugin install failed', { variant: 'error' });
    } finally { setInstallingPlugin(false); }
  };

  const handleRemovePlugin = async (slug: string) => {
    if (!siteId || !(await showConfirm(`Remove plugin "${slug}"?`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/wordpress/plugins/${slug}`, { method: 'DELETE' });
      showAlert('Plugin removed', { variant: 'success' });
      loadPlugins();
    } catch (err: any) {
      showAlert(err.message || 'Plugin removal failed', { variant: 'error' });
    }
  };

  if (loading) return <SectionLoading />;

  if (!connected) {
    return (
      <NotProvisioned
        icon="globe"
        title="WordPress cannot be managed from here yet"
        what="Once a hosting provider is connected, this detects an existing WordPress installation or installs a new one."
        needs="An install writes files to a real server. No hosting provider is connected, so there is nowhere to write them."
      />
    );
  }

  if (!wordpress || !wordpress.installed) {
    return (
      <div className="onsite-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <Icon name="globe" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.5rem' }} />
        <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: '0 0 0.5rem' }}>No WordPress detected</h3>
        <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          The hosting provider is connected but did not report a WordPress installation for this website.
        </p>
        <Button onClick={() => setShowInstall(true)}>
          <Icon name="plus" size={14} /> Install WordPress
        </Button>

        <Dialog open={showInstall} onOpenChange={setShowInstall}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Install WordPress</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Site title</label>
                  <Input value={installTitle} onChange={e => setInstallTitle(e.target.value)} placeholder="My Website" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Admin username</label>
                  <Input value={installUser} onChange={e => setInstallUser(e.target.value)} placeholder="admin" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Admin email</label>
                  <Input value={installEmail} onChange={e => setInstallEmail(e.target.value)} placeholder="admin@example.com" type="email" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Admin password</label>
                  <Input value={installPassword} onChange={e => setInstallPassword(e.target.value)} type="password" placeholder="Strong password" />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInstall(false)}>Cancel</Button>
              <Button onClick={handleInstall} disabled={!installTitle || !installUser || !installEmail || !installPassword || installing}>
                {installing ? <><ButtonSpinner /> Installing…</> : 'Install'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title"><Icon name="globe" size={16} /> WordPress</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Badge variant="success">Installed</Badge>
            <Button variant="outline" size="sm" onClick={handleUpdate} disabled={updating}>
              {updating ? <><ButtonSpinner /> Updating…</> : <><Icon name="refresh" size={12} /> Update</>}
            </Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Version</label>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{wordpress.version ?? 'Detected'}</div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto-update</label>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{wordpress.autoUpdate ? 'Enabled' : 'Disabled'}</div>
          </div>
          {wordpress.adminUrl && (
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin URL</label>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                <a href={wordpress.adminUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>{wordpress.adminUrl}</a>
              </div>
            </div>
          )}
          {wordpress.siteUrl && (
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Site URL</label>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                <a href={wordpress.siteUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>{wordpress.siteUrl}</a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plugins */}
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title"><Icon name="package" size={16} /> Plugins</h3>
          <Badge variant="gray">{plugins.length}</Badge>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
          <Input value={pluginSlug} onChange={e => setPluginSlug(e.target.value)}
            placeholder="Plugin slug (e.g. woocommerce)" style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleInstallPlugin()} />
          <Button size="sm" onClick={handleInstallPlugin} disabled={!pluginSlug.trim() || installingPlugin}>
            {installingPlugin ? <ButtonSpinner /> : <Icon name="plus" size={12} />} Install
          </Button>
        </div>

        {pluginsLoading ? <SectionLoading /> : plugins.length === 0 ? (
          <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>
            No plugins installed.
          </p>
        ) : (
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plugins.map(p => (
                  <tr key={p.slug}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ink3)' }}>{p.slug}</div>
                    </td>
                    <td>{p.version || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <Badge variant={p.active ? 'success' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                        {p.updateAvailable && <Badge variant="warning">Update</Badge>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleRemovePlugin(p.slug)}>
                        <Icon name="trash2" size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
