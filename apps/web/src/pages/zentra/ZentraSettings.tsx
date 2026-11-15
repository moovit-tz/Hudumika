import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Switch } from '../../components/ui/switch.js';
import { Banner } from '../../components/ui/alert.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Icon } from '../../components/Icon.js';
import { Spinner } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showConfirm } from '../../lib/confirm.js';
import { useAuth } from '../../hooks/useAuth.js';
import './Zentra.css';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
interface Rule { code: string; name: string; description: string; category: string; severity: Severity; enabled: boolean; parameters: Record<string, number> }

const RETENTION = [
  { value: '90', label: '90 days' }, { value: '180', label: '180 days' }, { value: '365', label: '1 year' },
  { value: '730', label: '2 years' }, { value: '2555', label: '7 years (statutory)' },
];
const PARAM_LABEL: Record<string, string> = {
  threshold: 'Denials before a signal', window_minutes: 'Within (minutes)', count_threshold: 'Records exported',
  window_hours: 'Within (hours) of a role change', amount_threshold: 'Amount at or above', dormant_hours: 'Silent for (hours)',
};
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function ZentraSettings() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role as string);
  const [rules, setRules] = useState<Rule[]>([]);
  const [retentionDays, setRetentionDays] = useState(365);
  const [dormantHours, setDormantHours] = useState(48);
  const [savedRetention, setSavedRetention] = useState(365);
  const [legalHold, setLegalHold] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertMin, setAlertMin] = useState<Severity>('HIGH');
  const [pending, setPending] = useState<{ days: number; at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/zentra/settings');
      setRules(res.rules || []);
      setRetentionDays(res.retention_days || 365);
      setSavedRetention(res.retention_days || 365);
      setLegalHold(!!res.legal_hold);
      setAlertEmail(res.alert_email || '');
      setAlertMin(res.alert_min_severity || 'HIGH');
      setPending(res.retention_pending_days && res.retention_pending_at ? { days: res.retention_pending_days, at: res.retention_pending_at } : null);
      setDormantHours(res.dormant_threshold_hours || 48);
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Could not load settings.' });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadSettings(); }, []);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key); setMessage(null);
    try { setMessage({ tone: 'success', text: await fn() }); }
    catch (err: any) { setMessage({ tone: 'error', text: err?.message || 'Something went wrong.' }); }
    finally { setBusy(null); }
  }

  const saveSettings = () => run('settings', async () => {
    const res = await apiFetch('/v1/zentra/settings', { method: 'PATCH', body: JSON.stringify({ retention_days: retentionDays, dormant_threshold_hours: dormantHours, legal_hold: legalHold, alert_email: alertEmail.trim() || null, alert_min_severity: alertMin }) });
    await loadSettings();
    return res?.retention_pending_at && retentionDays < savedRetention
      ? `Saved. The shorter period starts on ${formatDay(res.retention_pending_at)}; until then events are kept for ${savedRetention} days.`
      : 'Settings saved.';
  });

  async function purge() {
    if (!(await showConfirm(`Permanently delete audit events older than ${savedRetention} days? Events linked to a case or an open signal are kept. This cannot be undone.`, { variant: 'danger', confirmLabel: 'Delete old events' }))) return;
    run('purge', async () => {
      const res = await apiFetch('/v1/zentra/settings/purge', { method: 'POST', body: JSON.stringify({}) });
      return legalHold ? 'Nothing was deleted: a legal hold is on.' : `Deleted ${Number(res.result ?? 0).toLocaleString()} audit events older than ${savedRetention} days.`;
    });
  }

  const saveRule = (r: Rule) => run(`rule:${r.code}`, async () => {
    await apiFetch(`/v1/zentra/rules/${r.code}`, { method: 'PATCH', body: JSON.stringify({ enabled: r.enabled, severity: r.severity, parameters: r.parameters }) });
    await loadSettings();
    return `${r.name} saved.`;
  });
  const setRule = (code: string, patch: Partial<Rule>) => setRules(rs => rs.map(r => (r.code === code ? { ...r, ...patch } : r)));

  if (loading) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Settings' }]}
        titlePlain="Zentra"
        titleEm="Settings"
        subtitle="How long audit evidence is kept, when an app counts as silent, and the risk rules"
      />
      {message && <Banner variant={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Banner>}
      {!isAdmin && <Banner variant="info">Only a workspace admin can change these settings.</Banner>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2"><Icon name="clock" size={16} /><h2 className="text-sm font-bold text-foreground">Retention, alerts and telemetry</h2></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Keep audit events for</span>
              <Select value={String(retentionDays)} onValueChange={v => setRetentionDays(Number(v))} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RETENTION.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">App is silent after (hours)</span>
              <Input type="number" min={1} max={720} value={dormantHours} disabled={!isAdmin} onChange={e => setDormantHours(Number(e.target.value) || 48)} />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Alert on signals at least</span>
              <Select value={alertMin} onValueChange={v => setAlertMin(v as Severity)} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Also email (optional)</span>
              <Input type="email" placeholder="security@yourcompany.com" value={alertEmail} disabled={!isAdmin} onChange={e => setAlertEmail(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Workspace admins are notified in Hudumika for every signal at or above this level.</p>
          {pending && (
            <Banner variant="warning">
              Shortening to {pending.days} days takes effect on {formatDay(pending.at)}. A shorter period always waits 30 days, so recent evidence can't be erased the same day.
            </Banner>
          )}
          <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Legal hold</div>
              <p className="text-xs text-muted-foreground">While on, nothing in the audit log is deleted, whatever the retention period.</p>
            </div>
            <Switch checked={legalHold} disabled={!isAdmin} onCheckedChange={c => setLegalHold(c === true)} aria-label="Legal hold" />
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveSettings} loading={busy === 'settings'}>Save</Button>
              <Button size="sm" variant="outline" onClick={purge} loading={busy === 'purge'} disabled={legalHold}>Delete expired events now</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Expired events are deleted automatically each night. Events linked to a case or an open signal are never deleted. Every change on this page is itself recorded in the audit log.
          </p>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2"><Icon name="shield" size={16} /><h2 className="text-sm font-bold text-foreground">Risk rules</h2></div>
          <p className="text-xs text-muted-foreground">Each rule raises a signal when its numbers are crossed. A rule may step up one severity when far over its threshold.</p>
          <div className="space-y-3">
            {rules.map(r => (
              <div key={r.code} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {r.name}{!r.enabled && <Badge variant="gray">Off</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <Switch checked={r.enabled} disabled={!isAdmin} onCheckedChange={c => setRule(r.code, { enabled: c })} aria-label={`${r.name} on`} />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Severity</span>
                    <Select value={r.severity} onValueChange={v => setRule(r.code, { severity: v as Severity })} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                  {Object.entries(r.parameters).map(([k, v]) => (
                    <label key={k} className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">{PARAM_LABEL[k] ?? k}</span>
                      <Input type="number" min={1} value={v} disabled={!isAdmin}
                        onChange={e => setRule(r.code, { parameters: { ...r.parameters, [k]: Number(e.target.value) } })} />
                    </label>
                  ))}
                </div>
                {isAdmin && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => saveRule(r)} loading={busy === `rule:${r.code}`}>Save rule</Button></div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
