import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { Spinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Banner } from '../../components/ui/alert.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import type { ZentraInvestigationCase, ZentraCaseStatus, ZentraResolutionOutcome, ZentraAuditEvent } from '@hudumika/types';
import './Zentra.css';

export function ZentraCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<ZentraInvestigationCase | null>(null);
  const [evidenceEvents, setEvidenceEvents] = useState<ZentraAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionOutcome, setResolutionOutcome] = useState<ZentraResolutionOutcome>('remediated');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [resolving, setResolving] = useState(false);
  const [chainIntact, setChainIntact] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadCase() {
    if (!id) return;
    setLoading(true);
    try {
      // The case endpoint returns its own linked evidence (however old) and
      // whether the case history's hash chain is intact.
      const res = await apiFetch(`/v1/zentra/cases/${id}`);
      setCaseData(res.case);
      setEvidenceEvents(res.evidence ?? []);
      setChainIntact(typeof res.chain_intact === 'boolean' ? res.chain_intact : null);
    } catch {
      // handled by apiFetch
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCase();
  }, [id]);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !noteContent.trim()) return;
    setAddingNote(true);
    try {
      await apiFetch(`/v1/zentra/cases/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: noteContent.trim() }),
      });
      setNoteContent('');
      await loadCase();
    } catch (err: any) {
      setActionError(err?.message || 'Could not add the note.');
    } finally {
      setAddingNote(false);
    }
  }

  async function handleStatusChange(nextStatus: ZentraCaseStatus) {
    if (!id) return;
    try {
      await apiFetch(`/v1/zentra/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadCase();
    } catch (err: any) {
      setActionError(err?.message || 'Could not change the status.');
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !resolutionSummary.trim()) return;
    setResolving(true);
    try {
      await apiFetch(`/v1/zentra/cases/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution_outcome: resolutionOutcome,
          resolution: resolutionSummary.trim(),
        }),
      });
      setResolveOpen(false);
      await loadCase();
    } catch (err: any) {
      setActionError(err?.message || 'Could not resolve the case.');
    } finally {
      setResolving(false);
    }
  }

  if (loading || !caseData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {actionError && <Banner variant="error" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/zentra/cases" className="hover:text-foreground">
          ← Back to Investigations
        </Link>
      </div>

      <PageHeader
        crumbs={[{ label: 'Zentra', to: '/zentra' }, { label: 'Investigations', to: '/zentra/cases' }, { label: caseData.case_number }]}
        titlePlain={caseData.case_number}
        titleEm={caseData.title.split(' ').pop() || 'Dossier'}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span>Opened {new Date(caseData.created_at).toLocaleDateString()} by</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <PersonAvatar userId={caseData.created_by} name={caseData.created_by || 'System'} size={18} />
              {caseData.created_by || 'System'}
            </span>
            {chainIntact === true && <Badge variant="success">History intact</Badge>}
            {chainIntact === false && <Badge variant="error">History altered</Badge>}
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" title="The case, its full history and every evidence event, with a SHA-256 checksum"
              onClick={() => apiDownload(`/v1/zentra/cases/${caseData.id}/evidence-pack`, `zentra-${caseData.case_number}-evidence.json`)}>
              <Icon name="download" size={13} /> Evidence pack
            </Button>
            {caseData.status !== 'CLOSED' ? (
              <>
                <Select value={caseData.status} onValueChange={v => handleStatusChange(v as ZentraCaseStatus)}>
                  <SelectTrigger aria-label="Case status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Status: Open</SelectItem>
                    <SelectItem value="INVESTIGATING">Status: Under investigation</SelectItem>
                    <SelectItem value="REMEDIATION">Status: Remediation</SelectItem>
                  </SelectContent>
                </Select>

                <Button size="sm" onClick={() => setResolveOpen(true)} className="gap-1.5">
                  <Icon name="check" size={13} /> Resolve &amp; Close Case
                </Button>
              </>
            ) : (
              <Badge variant="success" className="text-xs">
                Case Resolved ({caseData.resolution_outcome})
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Case Narrative and Notes */}
        <div className="space-y-6 lg:col-span-2">
          {/* Summary Card */}
          <Card className="p-4 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Scope &amp; Background
            </h2>
            <p className="text-sm text-foreground">
              {caseData.summary || 'No background description provided.'}
            </p>
          </Card>

          {/* Evidence Trail */}
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3 text-xs font-bold uppercase tracking-wider text-foreground">
              Linked Audit Evidence ({(caseData.evidence_event_ids || []).length})
            </div>
            {evidenceEvents.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                {(caseData.evidence_event_ids || []).length > 0
                  ? `Linked to ${caseData.evidence_event_ids.length} audit event IDs: ${caseData.evidence_event_ids.join(', ')}`
                  : 'No specific audit events linked to this case yet.'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {evidenceEvents.map(ev => (
                  <div key={ev.id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{ev.event_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {ev.actor_name || ev.actor_id} • {ev.resource_type}:{ev.resource_id.slice(0, 8)}
                      </div>
                    </div>
                    <Badge variant={ev.outcome === 'success' ? 'success' : 'error'}>
                      {ev.outcome}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Internal Notes & Timeline */}
          <Card className="p-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Reviewer Notes &amp; Activity Log
            </h2>

            <div className="space-y-3">
              {(caseData.internal_notes || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No notes recorded yet.</p>
              ) : (
                caseData.internal_notes.map(note => (
                  <div key={note.id} className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <PersonAvatar userId={note.author_id} name={note.author_name} size={20} />
                        <span>{note.author_name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {new Date(note.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-foreground/90 whitespace-pre-wrap pl-6">{note.note}</p>
                  </div>
                ))
              )}
            </div>

            {/* Append Note Form */}
            {caseData.status !== 'CLOSED' && (
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-border">
                <textarea
                  rows={2}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Record an internal finding or investigation note…"
                  className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <Button size="sm" type="submit" disabled={addingNote || !noteContent.trim()}>
                  {addingNote ? 'Saving…' : 'Add Note'}
                </Button>
              </form>
            )}
          </Card>
        </div>

        {/* Case Metadata Sidebar */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3 text-xs">
            <h2 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px]">
              Case Properties
            </h2>

            <div>
              <span className="text-muted-foreground">Case ID:</span>
              <div className="font-mono text-foreground font-semibold">{caseData.case_number}</div>
            </div>

            <div>
              <span className="text-muted-foreground">Severity:</span>
              <div className="mt-1">
                <Badge variant={caseData.severity === 'CRITICAL' ? 'error' : caseData.severity === 'HIGH' ? 'warning' : 'info'}>
                  {caseData.severity}
                </Badge>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground">Status:</span>
              <div className="mt-1">
                <Badge variant="outline" className="uppercase font-semibold">
                  {caseData.status}
                </Badge>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground">Assigned Reviewer:</span>
              <div className="mt-1 flex items-center gap-2">
                <PersonAvatar userId={caseData.assigned_to_user_id} name={caseData.assigned_to_name || 'Unassigned'} size={24} />
                <span className="font-semibold text-foreground">{caseData.assigned_to_name || 'Unassigned'}</span>
              </div>
            </div>

            {caseData.closed_at && (
              <div>
                <span className="text-muted-foreground">Resolution:</span>
                <div className="font-semibold text-emerald-600 uppercase text-[11px] mt-0.5">
                  {caseData.resolution_outcome}
                </div>
                {caseData.resolution && (
                  <p className="mt-1 text-muted-foreground text-[11px]">
                    {caseData.resolution}
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Investigation Case</DialogTitle>
            <DialogDescription>
              Record the verified outcome and close this case.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResolve} className="space-y-3 py-2 text-xs">
            <div>
              <label className="block text-muted-foreground font-semibold mb-1">
                Resolution Outcome *
              </label>
              <select
                value={resolutionOutcome}
                onChange={e => setResolutionOutcome(e.target.value as ZentraResolutionOutcome)}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground"
              >
                <option value="remediated">Remediated (Permissions/Actions Adjusted)</option>
                <option value="policy_updated">Policy Updated</option>
                <option value="false_positive">False Positive</option>
                <option value="no_action_needed">No Action Needed</option>
                <option value="escalated">Escalated to Management</option>
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-semibold mb-1">
                Resolution Summary &amp; Preventive Action *
              </label>
              <textarea
                required
                rows={3}
                value={resolutionSummary}
                onChange={e => setResolutionSummary(e.target.value)}
                placeholder="Detail what steps were taken or why this risk was resolved…"
                className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setResolveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={resolving || !resolutionSummary.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                {resolving ? 'Closing…' : 'Confirm Resolution'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
