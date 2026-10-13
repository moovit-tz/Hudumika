import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { Input } from '../../components/ui/input.js';
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
  const [loadError, setLoadError] = useState('');
  const [retentionError, setRetentionError] = useState('');
  const [loadingRetention, setLoadingRetention] = useState(true);
  const retentionValid = retentionDays !== null && Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 365;

  const fetchBackups = () => {
    setLoading(true);
    setLoadError('');
    apiFetch('/v1/onsite/backups').then((res: any) => setBackups(res?.data ?? []))
      .catch(error => setLoadError(error.message || 'Unable to load backups')).finally(() => setLoading(false));
  };
  const fetchRetention = () => {
    setLoadingRetention(true);
    setRetentionError('');
    apiFetch('/v1/onsite/backups/retention').then((res: any) => setRetentionDays(res.retention_days))
      .catch(error => setRetentionError(error.message || 'Unable to load retention settings'))
      .finally(() => setLoadingRetention(false));
  };

  useEffect(() => {
    fetchBackups();
    fetchRetention();
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
    let summary: string;
    try {
      const preview = await apiFetch(`/v1/onsite/backups/${backup.id}/restore-preview`) as { sections: { section: string; added: number; replaced: number; removed: number }[] };
      summary = preview.sections.map(section => `${section.section.replaceAll('_', ' ')}: ${section.added} added, ${section.replaced} replaced, ${section.removed} removed`).join('\n');
    } catch (error: any) {
      showAlert(error.message || 'Unable to preview restore', { variant: 'error' });
      return;
    }
    const ok = await showConfirm(
      `${summary}\n\nThis replaces configuration with the snapshot. Counts are a preview of the current state; later changes can affect the result. Deployed files and databases are excluded. This cannot be undone.`,
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
    if (!retentionValid || loadingRetention || savingRetention || retentionError) return;
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
          <Button disabled={creating} onClick={handleCreate}>
            {creating ? <ButtonSpinner /> : <Icon name="plus" size={16} />} {creating ? 'Creating…' : 'Create backup now'}
          </Button>
        }
      />

      {loadError && <Banner variant="error" title="Backup history unavailable" action={<Button variant="outline" onClick={fetchBackups}>Retry</Button>}>{loadError}</Banner>}
      {retentionError && <Banner variant="error" title="Retention settings unavailable" action={<Button variant="outline" onClick={fetchRetention}>Retry</Button>}>{retentionError}</Banner>}
      <div className="onsite-card" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
        <label htmlFor="onsite-retention-days" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Keep backups for</label>
        <Input
          id="onsite-retention-days"
          disabled={loadingRetention || savingRetention || !!retentionError}
          type="number"
          className="onsite-input"
          style={{ width: '90px' }}
          min={1}
          max={365}
          step={1}
          aria-invalid={!loadingRetention && !retentionError && !retentionValid}
          aria-describedby="onsite-retention-help"
          value={retentionDays ?? ''}
          onChange={(e) => setRetentionDays(e.target.value === '' ? null : e.target.valueAsNumber)}
        />
        <span style={{ fontSize: '0.875rem', color: 'var(--ink3)' }}>days</span>
        <Button size="sm" variant="outline" disabled={loadingRetention || savingRetention || !retentionValid || !!retentionError} onClick={handleSaveRetention}>
          {savingRetention && <ButtonSpinner />}
          {savingRetention ? 'Saving…' : 'Save'}
        </Button>
        <span id="onsite-retention-help" style={{ fontSize: '0.875rem', color: 'var(--ink3)' }}>Enter a whole number from 1 to 365 days.</span>
      </div>

      {loading ? (
        <div className="onsite-card"><p style={{ color: 'var(--ink3)' }}>Loading backups…</p></div>
      ) : loadError && backups.length === 0 ? null : backups.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="layers" size={48} style={{ color: 'var(--ink3)', margin: '0 auto 1rem auto' }} />
          <h3>No backups yet</h3>
          <p style={{ color: 'var(--ink3)', marginBottom: '1.5rem' }}>
            A scheduled snapshot runs automatically every day. Create one now to protect your current setup right away.
          </p>
          <Button disabled={creating} onClick={handleCreate}>
            {creating ? <ButtonSpinner /> : <Icon name="plus" size={16} />} Create backup now
          </Button>
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
                      <Badge variant={b.status === 'completed' ? 'success' : 'error'}>{b.status}</Badge>
                      {b.error_message && <div style={{ fontSize: '0.75rem', color: 'var(--red)', marginTop: '0.25rem' }}>{b.error_message}</div>}
                    </td>
                    <td className="onsite-mono">{formatSize(b.size_bytes)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        {b.status === 'completed' && (
                          <Button size="sm" variant="outline" disabled={restoringId === b.id} onClick={() => handleRestore(b)}>
                            {restoringId === b.id && <ButtonSpinner />}
                            {restoringId === b.id ? 'Restoring…' : 'Restore'}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label={`Delete backup from ${new Date(b.created_at).toLocaleString()}`} style={{ color: 'var(--red)' }} onClick={() => handleDelete(b)}>
                          <Icon name="trash2" size={14} />
                        </Button>
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
