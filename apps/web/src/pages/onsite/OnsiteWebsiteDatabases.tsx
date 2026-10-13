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

interface DatabaseInfo {
  name: string;
  user: string;
  type: string;
  sizeBytes: number;
  host: string;
  port: number;
}

export function OnsiteWebsiteDatabases() {
  const { siteId } = useParams<{ siteId: string }>();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const loadDatabases = () => {
    if (!siteId) { setLoading(false); return; }
    apiFetch(`/v1/onsite/websites/${siteId}/databases`)
      .then((res: any) => {
        setConnected(res.connected !== false);
        setDatabases(Array.isArray(res.databases) ? res.databases : []);
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  };

  useEffect(loadDatabases, [siteId]);

  const handleCreate = async () => {
    if (!siteId || !dbName || !dbPassword) return;
    setCreating(true);
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/databases`, {
        method: 'POST',
        body: JSON.stringify({ name: dbName, password: dbPassword }),
      });
      showAlert(`Database "${dbName}" created`, { variant: 'success' });
      setShowCreate(false);
      setDbName(''); setDbPassword('');
      setLoading(true);
      loadDatabases();
    } catch (err: any) {
      showAlert(err.message || 'Database creation failed', { variant: 'error' });
    } finally { setCreating(false); }
  };

  const handleDelete = async (name: string) => {
    if (!siteId || !(await showConfirm(`Delete database "${name}"? This is irreversible.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/websites/${siteId}/databases/${name}`, { method: 'DELETE' });
      showAlert('Database deleted', { variant: 'success' });
      setLoading(true);
      loadDatabases();
    } catch (err: any) {
      showAlert(err.message || 'Deletion failed', { variant: 'error' });
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <SectionLoading />;

  if (!connected) {
    return (
      <NotProvisioned
        icon="layers"
        title="No databases are managed here yet"
        what="Once a hosting provider is connected, this lists each database with its user, size and connection details, and can create new ones."
        needs="Creating a database means asking a provider to provision one. None is connected, so there is nothing to create it on."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title"><Icon name="layers" size={16} /> Databases</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Badge variant="gray">{databases.length}</Badge>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={12} /> Create
            </Button>
          </div>
        </div>

        {databases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Icon name="layers" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.5rem' }} />
            <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              No databases on this website yet.
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={12} /> Create database
            </Button>
          </div>
        ) : (
          <div className="onsite-table-wrapper" style={{ marginTop: '0.5rem' }}>
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>User</th>
                  <th>Host</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Size</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((db, i) => (
                  <tr key={db.name ?? i}>
                    <td><code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{db.name}</code></td>
                    <td><code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{db.user || '—'}</code></td>
                    <td><code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{db.host}:{db.port}</code></td>
                    <td>{db.type || 'MySQL'}</td>
                    <td style={{ textAlign: 'right' }}>{formatSize(db.sizeBytes)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(db.name)}>
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Create database</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Database name</label>
                <Input value={dbName} onChange={e => setDbName(e.target.value)} placeholder="my_database" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Password</label>
                <Input value={dbPassword} onChange={e => setDbPassword(e.target.value)} type="password" placeholder="Strong password (min 8 chars)" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!dbName || !dbPassword || dbPassword.length < 8 || creating}>
              {creating ? <><ButtonSpinner /> Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
