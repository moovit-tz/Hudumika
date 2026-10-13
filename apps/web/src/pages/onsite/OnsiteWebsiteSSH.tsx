import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { NotProvisioned } from './NotProvisioned.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import './Onsite.css';

interface SSHInfo { host: string; port: number; username: string; status: string }
interface SSHKey { id: string; name: string; fingerprint: string; addedAt: string }

export function OnsiteWebsiteSSH() {
  const { siteId } = useParams<{ siteId: string }>();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [ssh, setSsh] = useState<SSHInfo | null>(null);
  const [keys, setKeys] = useState<SSHKey[]>([]);

  // Add key dialog
  const [showAddKey, setShowAddKey] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [addingKey, setAddingKey] = useState(false);

  // Reset password dialog
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  const loadSSH = () => {
    if (!siteId) { setLoading(false); return; }
    apiFetch(`/v1/onsite/websites/${siteId}/ssh`)
      .then((res: any) => {
        setConnected(res.connected !== false);
        setSsh(res.ssh ?? null);
        setKeys(Array.isArray(res.keys) ? res.keys : []);
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  };

  useEffect(loadSSH, [siteId]);

  const handleAddKey = async () => {
    if (!siteId || !keyName || !publicKey) return;
    setAddingKey(true);
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/ssh/keys`, {
        method: 'POST',
        body: JSON.stringify({ name: keyName, public_key: publicKey }),
      });
      showAlert('SSH key added', { variant: 'success' });
      setShowAddKey(false);
      setKeyName(''); setPublicKey('');
      setLoading(true);
      loadSSH();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add key', { variant: 'error' });
    } finally { setAddingKey(false); }
  };

  const handleRemoveKey = async (keyId: string, name: string) => {
    if (!siteId || !(await showConfirm(`Remove SSH key "${name}"?`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/ssh/keys/${keyId}`, { method: 'DELETE' });
      showAlert('SSH key removed', { variant: 'success' });
      setLoading(true);
      loadSSH();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove key', { variant: 'error' });
    }
  };

  const handleResetPassword = async () => {
    if (!siteId || !newPassword) return;
    setResettingPw(true);
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/ssh/reset-password`, {
        method: 'POST', body: JSON.stringify({ password: newPassword }),
      });
      showAlert('SSH password reset', { variant: 'success' });
      setShowResetPw(false);
      setNewPassword('');
    } catch (err: any) {
      showAlert(err.message || 'Password reset failed', { variant: 'error' });
    } finally { setResettingPw(false); }
  };

  const copyCommand = () => {
    if (!ssh) return;
    navigator.clipboard.writeText(`ssh ${ssh.username}@${ssh.host} -p ${ssh.port}`);
    showAlert('SSH command copied', { variant: 'success' });
  };

  if (loading) return <SectionLoading />;

  if (!connected) {
    return (
      <NotProvisioned
        icon="terminal"
        title="SSH access is not available yet"
        what="Once a hosting provider is connected, this shows the host, port and username for this website, and the command to connect."
        needs="Onsite reports what a provider tells it. No hosting provider is connected to this website, so there is no host to report."
      />
    );
  }

  if (!ssh) {
    return (
      <div className="onsite-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <Icon name="terminal" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.5rem' }} />
        <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: '0 0 0.5rem' }}>SSH not available on this plan</h3>
        <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: 0 }}>
          The hosting provider is connected but does not expose SSH for this website.
        </p>
      </div>
    );
  }

  const sshCommand = `ssh ${ssh.username}@${ssh.host} -p ${ssh.port}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Connection details */}
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title"><Icon name="terminal" size={16} /> SSH access</h3>
          <Badge variant="success">Connected</Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Host</label>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{ssh.host}</div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Port</label>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{ssh.port}</div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</label>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{ssh.username}</div>
          </div>
        </div>
      </div>

      {/* Connect command */}
      <div className="onsite-card">
        <h3 className="onsite-card-title">Connect via terminal</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          <code style={{ flex: 1, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{sshCommand}</code>
          <Button variant="outline" size="sm" onClick={copyCommand}>
            <Icon name="copy" size={12} /> Copy
          </Button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={() => setShowResetPw(true)}>
            <Icon name="lock" size={12} /> Reset password
          </Button>
        </div>
      </div>

      {/* SSH keys */}
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title"><Icon name="key" size={16} /> SSH keys</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Badge variant="gray">{keys.length}</Badge>
            <Button size="sm" onClick={() => setShowAddKey(true)}>
              <Icon name="plus" size={12} /> Add key
            </Button>
          </div>
        </div>

        {keys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
              No SSH keys added. Add a public key for password-less authentication.
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowAddKey(true)}>
              <Icon name="plus" size={12} /> Add SSH key
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {keys.map(k => (
              <div key={k.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                padding: '0.6rem 0.75rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{k.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink3)', fontFamily: 'var(--font-mono)' }}>
                    {k.fingerprint || 'No fingerprint'}
                    {k.addedAt && ` · ${new Date(k.addedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveKey(k.id, k.name)}>
                  <Icon name="trash2" size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add SSH key dialog */}
      <Dialog open={showAddKey} onOpenChange={setShowAddKey}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Add SSH key</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Key name</label>
                <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="My laptop" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Public key</label>
                <Textarea value={publicKey} onChange={e => setPublicKey(e.target.value)}
                  placeholder="ssh-rsa AAAA... or ssh-ed25519 AAAA..."
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', minHeight: '6rem' }} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddKey(false)}>Cancel</Button>
            <Button onClick={handleAddKey} disabled={!keyName || !publicKey || addingKey}>
              {addingKey ? <><ButtonSpinner /> Adding…</> : 'Add key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={showResetPw} onOpenChange={setShowResetPw}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reset SSH password</DialogTitle></DialogHeader>
          <DialogBody>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>New password</label>
              <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="New password (min 8 chars)" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPw(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={!newPassword || newPassword.length < 8 || resettingPw}>
              {resettingPw ? <><ButtonSpinner /> Resetting…</> : 'Reset password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
