import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { Spinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch } from '../../lib/api.js';
import type { ZentraInvestigationCase, ZentraSeverity } from '@hudumika/types';
import './Zentra.css';

export function ZentraCases() {
  const [cases, setCases] = useState<ZentraInvestigationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newSeverity, setNewSeverity] = useState<ZentraSeverity>('MEDIUM');
  const [creating, setCreating] = useState(false);

  async function loadCases() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);

      const res = await apiFetch(`/v1/zentra/cases?${params.toString()}`);
      setCases(res.cases || []);
    } catch {
      // handled by apiFetch
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCases();
  }, [filterStatus]);

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/v1/zentra/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          summary: newSummary.trim() || undefined,
          severity: newSeverity,
        }),
      });
      setCreateOpen(false);
      setNewTitle('');
      setNewSummary('');
      await loadCases();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Investigations' }]}
        titlePlain="Investigation"
        titleEm="Cases"
        subtitle="Audited SOC case workflow, evidence collection, reviewer notes, and resolution tracking"
        actions={
          <div className="flex items-center gap-2">
            <span className="zentra-sec-chip active">
              <Icon name="folder" size={12} /> SOC Active Case Files
            </span>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 text-xs">
              <Icon name="plus" size={13} /> New Investigation
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
          >
            <option value="all">All Case Statuses</option>
            <option value="OPEN">Open (New)</option>
            <option value="INVESTIGATING">Under Investigation</option>
            <option value="REMEDIATION">Remediation in Progress</option>
            <option value="CLOSED">Closed / Resolved</option>
          </select>
        </div>

        <Button size="sm" variant="outline" onClick={() => loadCases()} className="h-8 gap-1.5 text-xs">
          <Icon name="refresh" size={12} /> Refresh
        </Button>
      </Card>

      {/* Cases List */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <Spinner />
          </div>
        ) : cases.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Icon name="folder" size={24} />
            </div>
            <div className="font-semibold text-foreground">No Investigation Cases</div>
            <p className="mt-1 text-xs">Open a new investigation case from any risk signal or directly via the button above.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cases.map((c) => (
              <div key={c.id} className="p-4 transition-colors hover:bg-muted/30">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">
                        {c.case_number}
                      </span>
                      <Badge
                        variant={
                          c.severity === 'CRITICAL'
                            ? 'error'
                            : c.severity === 'HIGH'
                            ? 'warning'
                            : 'info'
                        }
                        className="text-[10px] font-bold uppercase"
                      >
                        {c.severity}
                      </Badge>
                      <Badge variant="outline" className="font-semibold uppercase text-[10px]">
                        {c.status}
                      </Badge>
                      <h3 className="font-semibold text-foreground text-sm">
                        {c.title}
                      </h3>
                    </div>

                    {c.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {c.summary}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1.5">
                        <PersonAvatar userId={c.assigned_to_user_id} name={c.assigned_to_name || 'Unassigned'} size={18} />
                        <span>Assignee: <strong className="text-foreground">{c.assigned_to_name || 'Unassigned'}</strong></span>
                      </span>
                      <span>
                        Evidence Records: <strong className="font-mono text-foreground">{(c.evidence_event_ids || []).length}</strong>
                      </span>
                      <span className="font-mono">
                        Created: {new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <Link to={`/zentra/cases/${c.id}`} className="self-end sm:self-center">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                      Inspect Dossier <Icon name="arrowRight" size={11} />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Case Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Icon name="folder" size={16} className="text-teal-600" />
              Open New Investigation Dossier
            </DialogTitle>
            <DialogDescription>
              Create an audited case to track suspicious behavior, evidence, and remediation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCase} className="space-y-3.5 py-2 text-xs">
            <div>
              <label className="block text-muted-foreground font-semibold mb-1">
                Case Title *
              </label>
              <input
                required
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Investigation into abnormal export velocity"
                className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-muted-foreground font-semibold mb-1">
                Severity Rating
              </label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as ZentraSeverity)}
                className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-semibold mb-1">
                Initial Summary &amp; Scope
              </label>
              <textarea
                rows={3}
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Describe the initial triggers, affected accounts or transactions…"
                className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? 'Creating…' : 'Open Case'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
