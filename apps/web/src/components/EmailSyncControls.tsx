import { useEffect, useState } from 'react';
import type { EmailSyncStatus, EmailLiveCheck } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Banner } from './ui/alert.js';
import { ButtonSpinner } from './ui/spinner.js';

export function EmailSyncControls() {
  const [status, setStatus] = useState<EmailSyncStatus | null>(null);
  const [checks, setChecks] = useState<EmailLiveCheck[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => {
    const [sync, live] = await Promise.all([apiFetch('/v1/email/account/sync-status'), apiFetch('/v1/email/account/live-checks')]);
    setStatus(sync); setChecks(live);
  };
  useEffect(() => {
    refresh().catch(err => setError(err.message));
    const poll = setInterval(() => refresh().catch(err => setError(err.message)), 15_000);
    return () => clearInterval(poll);
  }, []);
  const run = async (action: 'sync' | 'live-check') => {
    setBusy(action); setError('');
    try { await apiFetch(`/v1/email/account/${action}`, { method: 'POST' }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Mailbox check failed'); }
    finally { setBusy(''); }
  };
  return <div className="space-y-3">
    {error && <Banner variant="error" title="Mailbox check needs attention">{error}</Banner>}
    {status?.error && <p className="text-sm text-muted-foreground">{status.error}</p>}
    <p className="text-sm text-muted-foreground">{status?.lastSyncedAt ? `Last full sync: ${new Date(status.lastSyncedAt).toLocaleString()}.` : 'Full synchronization has not completed.'} {status?.pendingChanges ?? 0} remote changes pending; {status?.failedChanges ?? 0} need attention.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!!busy || !status?.connected} onClick={() => run('sync')}>{busy === 'sync' && <ButtonSpinner />} Sync mailbox now</Button>
      <Button variant="outline" disabled={!!busy || !status?.connected} onClick={() => run('live-check')}>{busy === 'live-check' && <ButtonSpinner />} Verify send and receive</Button>
    </div>
    <p className="text-sm text-muted-foreground">Verification sends a uniquely tracked message to your own connected mailbox. “Received” means synchronization found the message; “Sent” means the outgoing provider accepted it.</p>
    {checks.map(check => <div key={check.id} className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={check.status === 'received' ? 'success' : check.status === 'failed' ? 'error' : 'gray'}>{check.status}</Badge>
      <span>{new Date(check.created_at).toLocaleString()}</span>{check.error && <span>{check.error}</span>}
    </div>)}
  </div>;
}
