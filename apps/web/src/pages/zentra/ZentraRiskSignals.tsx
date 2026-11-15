import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { Spinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch } from '../../lib/api.js';
import type { ZentraRiskSignal, ZentraSignalStatus } from '@hudumika/types';
import './Zentra.css';

export function ZentraRiskSignals() {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<ZentraRiskSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [triageSignal, setTriageSignal] = useState<ZentraRiskSignal | null>(null);
  const [triageNotes, setTriageNotes] = useState('');
  const [triageStatus, setTriageStatus] = useState<ZentraSignalStatus>('TRIAGED');
  const [savingTriage, setSavingTriage] = useState(false);

  async function loadSignals() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSeverity !== 'all') params.append('severity', selectedSeverity);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);

      const res = await apiFetch(`/v1/zentra/risk/signals?${params.toString()}`);
      setSignals(res.signals || []);
    } catch {
      // handled by apiFetch
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSignals();
  }, [selectedSeverity, selectedStatus]);

  async function handleSaveTriage() {
    if (!triageSignal) return;
    setSavingTriage(true);
    try {
      if (triageStatus === 'CASE_OPEN') {
        const createdCase = await apiFetch('/v1/zentra/cases', {
          method: 'POST',
          body: JSON.stringify({
            title: `Investigation: ${triageSignal.title}`,
            severity: triageSignal.severity,
            summary: triageSignal.description,
            lead_signal_id: triageSignal.id,
            evidence_event_ids: triageSignal.evidence_event_ids || [],
          }),
        });
        setTriageSignal(null);
        navigate(`/zentra/cases/${createdCase.id}`);
        return;
      }

      await apiFetch(`/v1/zentra/risk/signals/${triageSignal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: triageStatus,
          notes: triageNotes,
        }),
      });
      setTriageSignal(null);
      await loadSignals();
    } finally {
      setSavingTriage(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Risk Signals' }]}
        titlePlain="Explainable Risk"
        titleEm="Signals"
        subtitle="Deterministic rules detecting repeated permission denials, bulk data reads, and unauthorized privilege shifts"
        actions={
          <div className="flex items-center gap-2">
            <span className="zentra-sec-chip active">
              <Icon name="shield" size={12} /> Deterministic Rules Engine
            </span>
            <Button size="sm" variant="outline" onClick={() => loadSignals()} className="gap-1.5 text-xs">
              <Icon name="refresh" size={13} /> Refresh
            </Button>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="NEW">New Alerts</option>
            <option value="TRIAGED">Triaged</option>
            <option value="CASE_OPEN">Under Investigation</option>
            <option value="RESOLVED">Resolved</option>
            <option value="FALSE_POSITIVE">False Positive</option>
          </select>
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          Showing {signals.length} signal{signals.length === 1 ? '' : 's'}
        </div>
      </Card>

      {/* Signals Queue List */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <Spinner />
          </div>
        ) : signals.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Icon name="checkCircle" size={24} />
            </div>
            <div className="font-semibold text-foreground">Zero Detected Threats</div>
            <p className="mt-1 text-xs">All monitored system operations conform strictly to active security policies.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {signals.map((sig) => (
              <div key={sig.id} className="p-4 transition-colors hover:bg-muted/30">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          sig.severity === 'CRITICAL'
                            ? 'error'
                            : sig.severity === 'HIGH'
                            ? 'warning'
                            : sig.severity === 'MEDIUM'
                            ? 'info'
                            : 'gray'
                        }
                        className="text-[10px] uppercase font-bold"
                      >
                        {sig.severity}
                      </Badge>
                      <span className="zentra-sec-chip font-mono">
                        {sig.app_id}
                      </span>
                      <span className="zentra-mono-code font-bold text-foreground">
                        {sig.rule_code}
                      </span>
                      <h3 className="text-sm font-bold text-foreground">
                        {sig.title}
                      </h3>
                    </div>

                    <p className="text-xs text-foreground/90 max-w-3xl leading-relaxed">
                      {sig.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
                      {sig.actor_name && (
                        <span className="flex items-center gap-1.5">
                          <PersonAvatar userId={sig.actor_id} name={sig.actor_name} size={18} />
                          <span>Actor: <strong className="text-foreground">{sig.actor_name}</strong></span>
                        </span>
                      )}
                      {sig.resource_type && (
                        <span>
                          Target: <strong className="font-mono text-foreground">{sig.resource_type}:{sig.resource_id?.slice(0, 8)}</strong>
                        </span>
                      )}
                      <span className="font-mono">
                        Detected: {new Date(sig.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>
                        Status: <strong className="uppercase text-foreground">{sig.status}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1"
                      onClick={() => {
                        setTriageSignal(sig);
                        setTriageStatus(sig.status === 'NEW' ? 'TRIAGED' : sig.status);
                        setTriageNotes('');
                      }}
                    >
                      <Icon name="folder" size={12} /> Triage / Case
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Triage Modal */}
      <Dialog open={!!triageSignal} onOpenChange={(open) => !open && setTriageSignal(null)}>
        {triageSignal && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Icon name="shield" size={16} className="text-teal-600" />
                Triage Threat Signal
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                [{triageSignal.rule_code}] {triageSignal.title}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1.5 font-semibold">
                  Triage Decision
                </label>
                <select
                  value={triageStatus}
                  onChange={(e) => setTriageStatus(e.target.value as ZentraSignalStatus)}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground"
                >
                  <option value="TRIAGED">Acknowledge &amp; Mark Triaged</option>
                  <option value="CASE_OPEN">Escalate to Formal Investigation Case</option>
                  <option value="FALSE_POSITIVE">Flag as False Positive</option>
                  <option value="RESOLVED">Mark Resolved (No Action Needed)</option>
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1.5 font-semibold">
                  Reviewer Notes &amp; Rationale
                </label>
                <textarea
                  rows={3}
                  value={triageNotes}
                  onChange={(e) => setTriageNotes(e.target.value)}
                  placeholder="Explain why this decision was taken and link any supporting evidence…"
                  className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setTriageSignal(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveTriage} disabled={savingTriage}>
                  {triageStatus === 'CASE_OPEN' ? 'Create Case & Investigate' : 'Save Triage'}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
