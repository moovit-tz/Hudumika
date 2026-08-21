import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import type { OnsiteBackup } from '@hudumika/types';
import './Onsite.css';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OnsiteBackups() {
  const [backups, setBackups] = useState<OnsiteBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);

  const fetchBackups = () => {
    setLoading(true);
    apiFetch('/v1/onsite/backups').then((res: any) => setBackups(res?.data ?? [])).catch(() => setBackups([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBackups();
    apiFetch('/v1/onsite/backups/retention').then((res: any) => setRetentionDays(res?.retention_days ?? 30)).catch(() => setRetentionDays(30));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiFetch('/v1/onsite/backups', { method: 'POST' });
      showAlert('Backup created.', { variant: 'success' });
      fetchBackups();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create backup', { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (backup: OnsiteBackup) => {
    const ok = await showConfirm(
      'This replaces your current domains, DNS, applications, environments, secrets, websites, health checks and provider connections with this snapshot\'s state. Anything added or changed since this backup was taken will be lost. This cannot be undone.',
      { title: `Restore backup from ${new Date(backup.created_at).toLocaleString()}?`, variant: 'danger', confirmLabel: 'Restore' },
    );
    if (!ok) return;
    setRestoringId(backup.id);
    try {
      await apiFetch(`/v1/onsite/backups/${backup.id}/restore`, { method: 'POST' });
      showAlert('Restore complete.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to restore backup', { variant: 'error' });
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (backup: OnsiteBackup) => {
    if (!(await showConfirm('Delete this backup? This cannot be undone.', { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/backups/${backup.id}`, { method: 'DELETE' });
      fetchBackups();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete backup', { variant: 'error' });
    }
  };

  const handleSaveRetention = async () => {
    if (retentionDays == null) return;
    setSavingRetention(true);
    try {
      await apiFetch('/v1/onsite/backups/retention', { method: 'PUT', body: JSON.stringify({ retention_days: retentionDays }) });
      showAlert('Retention updated.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Failed to update retention', { variant: 'error' });
    } finally {
      setSavingRetention(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Backups']}
        titlePlain="Config"
        titleEm="backups"
        subtitle="Snapshots of your domains, DNS, applications, environments, secrets, websites and health checks — not your site's deployed files or database, which Onsite never stores a copy of."
        actions={
          <button className="btn btn-primary" disabled={creating} onClick={handleCreate}>
            <Icon name="plus" size={16} /> {creating ? 'Creating…' : 'Create backup now'}
          </button>
        }
      />

      <div className="onsite-card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Keep backups for</label>
        <input
          type="number"
          className="onsite-input"
          style={{ width: '90px' }}
          min={1}
          max={365}
          value={retentionDays ?? ''}
          onChange={(e) => setRetentionDays(Number(e.target.value) || 1)}
        />
        <span style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}>days</span>
        <button className="btn btn-sm btn-secondary" disabled={savingRetention} onClick={handleSaveRetention}>
          {savingRetention ? 'Saving…' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="onsite-card"><p style={{ color: 'var(--ink-muted)' }}>Loading backups…</p></div>
      ) : backups.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="layers" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No backups yet</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            A scheduled snapshot runs automatically every day. Create one now to protect your current setup right away.
          </p>
          <button className="btn btn-primary" disabled={creating} onClick={handleCreate}>
            <Icon name="plus" size={16} /> Create backup now
          </button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.created_at).toLocaleString()}</td>
                    <td style={{ textTransform: 'capitalize' }}>{b.trigger}</td>
                    <td>
                      <span className={`onsite-badge ${b.status === 'completed' ? 'active' : 'failed'}`}>{b.status}</span>
                      {b.error_message && <div style={{ fontSize: '0.75rem', color: 'var(--red)', marginTop: '0.25rem' }}>{b.error_message}</div>}
                    </td>
                    <td className="onsite-mono">{formatSize(b.size_bytes)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        {b.status === 'completed' && (
                          <button className="onsite-btn-outline" disabled={restoringId === b.id} onClick={() => handleRestore(b)}>
                            {restoringId === b.id ? 'Restoring…' : 'Restore'}
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(b)}>
                          <Icon name="trash2" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
