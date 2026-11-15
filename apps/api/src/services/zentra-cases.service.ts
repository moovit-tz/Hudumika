import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import type {
  ZentraInvestigationCase,
  ZentraCaseStatus,
  ZentraSeverity,
  ZentraResolutionOutcome,
  ZentraCaseNote,
  ZentraCaseTimelineEvent,
  ZentraAuditEvent,
} from '@hudumika/types';

type Trx = Transaction<Database>;
type CaseEventKind = 'created' | 'note' | 'status' | 'assignment' | 'severity' | 'evidence_added' | 'resolved';

export interface CreateCaseInput {
  title: string;
  summary: string;
  severity: ZentraSeverity;
  lead_signal_id?: string;
  evidence_event_ids?: string[];
  assigned_to_user_id?: string;
  assigned_to_name?: string;
  created_by: string;
  created_by_id?: string;
}

/**
 * Investigation cases.
 *
 * What happened on a case — creation, every note, status/severity/assignee
 * change, evidence link and the resolution — is written to
 * zentra_case_events (migration 765): one row each, never updated or
 * deleted (a database trigger refuses), and hash-chained so a row edited or
 * removed underneath shows up as a broken chain. The case row itself only
 * holds the current state. Cases made before 765 still have notes/timeline
 * in JSON columns; those are read and shown ahead of the event rows.
 */

/** JSON with object keys sorted at every level — jsonb reorders keys, so hashing must not depend on order. */
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);
const hashOf = (prev: string | null, kind: string, actor: string, body: string | null, data: unknown, at: string) =>
  createHash('sha256').update(stable([prev, kind, actor, body, data, at])).digest('hex');

async function appendEvent(trx: Trx, tenantId: string, caseId: string, e: {
  kind: CaseEventKind; actorId?: string | null; actorName: string; body?: string | null; data?: Record<string, unknown>;
}) {
  // Serialise appends per case so two writers can't both chain off the same "last" row.
  await trx.selectFrom('zentra_investigation_cases').select('id')
    .where('tenant_id', '=', tenantId).where('id', '=', caseId).forUpdate().executeTakeFirst();
  const last = await trx.selectFrom('zentra_case_events').select('hash')
    .where('tenant_id', '=', tenantId).where('case_id', '=', caseId)
    .orderBy('created_at', 'desc').orderBy('id', 'desc').limit(1).executeTakeFirst();
  const at = new Date();
  const data = e.data ?? {};
  const prev = last?.hash ?? null;
  await trx.insertInto('zentra_case_events').values({
    tenant_id: tenantId, case_id: caseId, kind: e.kind, actor_id: isUuid(e.actorId) ? e.actorId! : null,
    actor_name: e.actorName, body: e.body ?? null, data: JSON.stringify(data) as any,
    prev_hash: prev, hash: hashOf(prev, e.kind, e.actorName, e.body ?? null, data, at.toISOString()), created_at: at,
  }).execute();
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Next ZEN-YYYY-NNNN: highest existing number + 1, not a count (a count repeats once a case is deleted). */
async function nextCaseNumber(trx: Trx, tenantId: string): Promise<string> {
  const prefix = `ZEN-${new Date().getFullYear()}-`;
  const rows = await trx.selectFrom('zentra_investigation_cases').select('case_number')
    .where('tenant_id', '=', tenantId).where('case_number', 'like', `${prefix}%`).execute();
  const max = rows.reduce((m, r) => Math.max(m, Number(r.case_number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Keep only evidence ids that are this tenant's audit events. */
async function ownEventIds(trx: Trx, tenantId: string, ids: string[] | undefined): Promise<string[]> {
  const wanted = [...new Set((ids ?? []).filter(isUuid))];
  if (!wanted.length) return [];
  const rows = await trx.selectFrom('zentra_audit_events').select('id')
    .where('tenant_id', '=', tenantId).where('id', 'in', wanted).execute();
  return rows.map(r => r.id);
}

export async function createZentraCase(tenantId: string, input: CreateCaseInput): Promise<ZentraInvestigationCase> {
  return withTenant(tenantId, async trx => {
    const evidence = await ownEventIds(trx, tenantId, input.evidence_event_ids);
    const inserted = await trx.insertInto('zentra_investigation_cases')
      .values({
        tenant_id: tenantId,
        case_number: await nextCaseNumber(trx, tenantId),
        title: input.title,
        summary: input.summary,
        severity: input.severity,
        status: 'OPEN',
        assigned_to_user_id: isUuid(input.assigned_to_user_id) ? input.assigned_to_user_id : null,
        assigned_to_name: input.assigned_to_name ?? null,
        lead_signal_id: isUuid(input.lead_signal_id) ? input.lead_signal_id : null,
        evidence_event_ids: JSON.stringify(evidence),
        internal_notes: JSON.stringify([]),
        timeline: JSON.stringify([]),
        created_by: input.created_by,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await appendEvent(trx, tenantId, inserted.id, {
      kind: 'created', actorId: input.created_by_id, actorName: input.created_by,
      body: 'Investigation case opened', data: { severity: input.severity, lead_signal_id: inserted.lead_signal_id, evidence_event_ids: evidence },
    });
    if (inserted.assigned_to_name) {
      await appendEvent(trx, tenantId, inserted.id, { kind: 'assignment', actorId: input.created_by_id, actorName: input.created_by, body: `Assigned to ${inserted.assigned_to_name}`, data: { to: inserted.assigned_to_user_id } });
    }

    if (inserted.lead_signal_id) {
      await trx.updateTable('zentra_risk_signals')
        .set({ status: 'CASE_OPEN', case_id: inserted.id, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', inserted.lead_signal_id)
        .execute();
    }
    return withHistory(trx, tenantId, inserted);
  });
}

export async function getZentraCases(
  tenantId: string,
  filters: { status?: ZentraCaseStatus; severity?: ZentraSeverity; assigned_to?: string; limit?: number; offset?: number } = {}
): Promise<{ cases: ZentraInvestigationCase[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  return withTenant(tenantId, async trx => {
    let query = trx.selectFrom('zentra_investigation_cases').where('tenant_id', '=', tenantId);
    if (filters.status) query = query.where('status', '=', filters.status);
    if (filters.severity) query = query.where('severity', '=', filters.severity);
    if (filters.assigned_to) query = query.where('assigned_to_user_id', '=', filters.assigned_to);

    const [rows, countRow] = await Promise.all([
      query.selectAll().orderBy('created_at', 'desc').limit(limit).offset(offset).execute(),
      // The total matches the filters, so "showing x of y" is about the same list.
      query.select(trx.fn.count<number>('id').as('count')).executeTakeFirst(),
    ]);
    return { cases: rows.map(r => mapCaseRow(r, [])), total: Number(countRow?.count ?? rows.length) };
  });
}

export async function getZentraCaseById(
  tenantId: string,
  caseId: string
): Promise<{ case: ZentraInvestigationCase; evidence: ZentraAuditEvent[]; chain_intact: boolean } | null> {
  if (!isUuid(caseId)) return null;
  return withTenant(tenantId, async trx => {
    const row = await trx.selectFrom('zentra_investigation_cases').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).executeTakeFirst();
    if (!row) return null;

    const events = await caseEvents(trx, tenantId, caseId);
    const caseItem = mapCaseRow(row, events);
    let evidence: ZentraAuditEvent[] = [];
    if (caseItem.evidence_event_ids.length > 0) {
      const eventRows = await trx.selectFrom('zentra_audit_events').selectAll()
        .where('tenant_id', '=', tenantId).where('id', 'in', caseItem.evidence_event_ids)
        .orderBy('created_at', 'asc').execute();
      evidence = eventRows.map(r => ({
        id: r.id, tenant_id: r.tenant_id, app_id: r.app_id, event_name: r.event_name,
        actor_id: r.actor_id, actor_role: r.actor_role, actor_name: r.actor_name, actor_ip: r.actor_ip,
        actor_user_agent: r.actor_user_agent, resource_type: r.resource_type, resource_id: r.resource_id,
        action: r.action, outcome: r.outcome, correlation_id: r.correlation_id, schema_version: r.schema_version,
        safe_summary: r.safe_summary,
        safe_metadata: typeof r.safe_metadata === 'string' ? JSON.parse(r.safe_metadata) : (r.safe_metadata || {}),
        created_at: r.created_at,
      }));
    }
    return { case: caseItem, evidence, chain_intact: verifyChain(events) };
  });
}

export async function updateZentraCase(
  tenantId: string,
  caseId: string,
  updates: {
    status?: ZentraCaseStatus;
    severity?: ZentraSeverity;
    assigned_to_user_id?: string | null;
    assigned_to_name?: string | null;
    actor_name: string;
    actor_id?: string;
  }
): Promise<ZentraInvestigationCase | null> {
  if (!isUuid(caseId)) return null;
  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('zentra_investigation_cases').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).executeTakeFirst();
    if (!existing) return null;
    // A closed case is closed: reopening is a status change, everything else waits.
    if (existing.status === 'CLOSED' && !updates.status) return withHistory(trx, tenantId, existing);

    const actor = { actorId: updates.actor_id, actorName: updates.actor_name };
    if (updates.status && updates.status !== existing.status) {
      await appendEvent(trx, tenantId, caseId, { ...actor, kind: 'status', body: `Status ${existing.status} → ${updates.status}`, data: { from: existing.status, to: updates.status } });
    }
    if (updates.severity && updates.severity !== existing.severity) {
      await appendEvent(trx, tenantId, caseId, { ...actor, kind: 'severity', body: `Severity ${existing.severity} → ${updates.severity}`, data: { from: existing.severity, to: updates.severity } });
    }
    if (updates.assigned_to_user_id !== undefined && updates.assigned_to_user_id !== existing.assigned_to_user_id) {
      await appendEvent(trx, tenantId, caseId, { ...actor, kind: 'assignment', body: updates.assigned_to_name ? `Assigned to ${updates.assigned_to_name}` : 'Unassigned', data: { from: existing.assigned_to_user_id, to: updates.assigned_to_user_id } });
    }

    const updated = await trx.updateTable('zentra_investigation_cases')
      .set({
        status: updates.status ?? existing.status,
        severity: updates.severity ?? existing.severity,
        assigned_to_user_id: updates.assigned_to_user_id !== undefined ? (isUuid(updates.assigned_to_user_id) ? updates.assigned_to_user_id : null) : existing.assigned_to_user_id,
        assigned_to_name: updates.assigned_to_name !== undefined ? updates.assigned_to_name : existing.assigned_to_name,
        ...(updates.status && updates.status !== 'CLOSED' && existing.status === 'CLOSED' ? { closed_at: null, closed_by: null } : {}),
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId).where('id', '=', caseId)
      .returningAll().executeTakeFirst();
    return updated ? withHistory(trx, tenantId, updated) : null;
  });
}

export async function addZentraCaseNote(
  tenantId: string,
  caseId: string,
  authorId: string,
  authorName: string,
  noteText: string
): Promise<ZentraInvestigationCase | null> {
  if (!isUuid(caseId)) return null;
  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('zentra_investigation_cases').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).executeTakeFirst();
    if (!existing) return null;
    await appendEvent(trx, tenantId, caseId, { kind: 'note', actorId: authorId, actorName: authorName, body: noteText });
    await trx.updateTable('zentra_investigation_cases').set({ updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).execute();
    return withHistory(trx, tenantId, existing);
  });
}

/** Link more audit events to a case as evidence; recorded as an event, never silently. */
export async function addZentraCaseEvidence(
  tenantId: string,
  caseId: string,
  eventIds: string[],
  actor: { id?: string; name: string; note?: string },
): Promise<ZentraInvestigationCase | null> {
  if (!isUuid(caseId)) return null;
  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('zentra_investigation_cases').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).executeTakeFirst();
    if (!existing) return null;
    const current: string[] = typeof existing.evidence_event_ids === 'string' ? JSON.parse(existing.evidence_event_ids) : ((existing.evidence_event_ids as any) || []);
    const added = (await ownEventIds(trx, tenantId, eventIds)).filter(id => !current.includes(id));
    if (!added.length) return withHistory(trx, tenantId, existing);
    await appendEvent(trx, tenantId, caseId, {
      kind: 'evidence_added', actorId: actor.id, actorName: actor.name,
      body: actor.note || `${added.length} event${added.length === 1 ? '' : 's'} linked as evidence`, data: { event_ids: added },
    });
    const updated = await trx.updateTable('zentra_investigation_cases')
      .set({ evidence_event_ids: JSON.stringify([...current, ...added]), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).returningAll().executeTakeFirstOrThrow();
    return withHistory(trx, tenantId, updated);
  });
}

export async function resolveZentraCase(
  tenantId: string,
  caseId: string,
  input: { resolution: string; resolution_outcome: ZentraResolutionOutcome; closed_by: string; closed_by_id?: string }
): Promise<ZentraInvestigationCase | null> {
  if (!isUuid(caseId)) return null;
  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('zentra_investigation_cases').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).executeTakeFirst();
    if (!existing) return null;

    await appendEvent(trx, tenantId, caseId, {
      kind: 'resolved', actorId: input.closed_by_id, actorName: input.closed_by,
      body: input.resolution, data: { outcome: input.resolution_outcome, previous_status: existing.status },
    });
    const updated = await trx.updateTable('zentra_investigation_cases')
      .set({
        status: 'CLOSED', resolution: input.resolution, resolution_outcome: input.resolution_outcome,
        closed_by: input.closed_by, closed_at: new Date(), updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId).where('id', '=', caseId)
      .returningAll().executeTakeFirst();

    if (existing.lead_signal_id) {
      await trx.updateTable('zentra_risk_signals')
        .set({
          status: input.resolution_outcome === 'false_positive' ? 'FALSE_POSITIVE' : 'RESOLVED',
          resolved_by: input.closed_by, resolved_at: new Date(),
          resolution_notes: `Resolved via case ${existing.case_number}: ${input.resolution}`,
          updated_at: new Date(),
        })
        .where('tenant_id', '=', tenantId).where('id', '=', existing.lead_signal_id)
        .execute();
    }
    return updated ? withHistory(trx, tenantId, updated) : null;
  });
}

// ── History ─────────────────────────────────────────────────────────────

type EventRow = { id: string; kind: string; actor_id: string | null; actor_name: string; body: string | null; data: unknown; prev_hash: string | null; hash: string; created_at: Date };

async function caseEvents(trx: Trx, tenantId: string, caseId: string): Promise<EventRow[]> {
  return trx.selectFrom('zentra_case_events')
    .select(['id', 'kind', 'actor_id', 'actor_name', 'body', 'data', 'prev_hash', 'hash', 'created_at'])
    .where('tenant_id', '=', tenantId).where('case_id', '=', caseId)
    .orderBy('created_at', 'asc').orderBy('id', 'asc').execute() as Promise<EventRow[]>;
}

async function withHistory(trx: Trx, tenantId: string, row: any): Promise<ZentraInvestigationCase> {
  return mapCaseRow(row, await caseEvents(trx, tenantId, row.id));
}

/** True when every event's hash matches its content and links to the one before. */
function verifyChain(events: EventRow[]): boolean {
  let prev: string | null = null;
  for (const e of events) {
    const data = typeof e.data === 'string' ? JSON.parse(e.data) : (e.data ?? {});
    if (e.prev_hash !== prev) return false;
    if (hashOf(prev, e.kind, e.actor_name, e.body, data, new Date(e.created_at).toISOString()) !== e.hash) return false;
    prev = e.hash;
  }
  return true;
}

function mapCaseRow(r: any, events: EventRow[]): ZentraInvestigationCase {
  const legacyNotes: ZentraCaseNote[] = typeof r.internal_notes === 'string' ? JSON.parse(r.internal_notes) : (r.internal_notes || []);
  const legacyTimeline: ZentraCaseTimelineEvent[] = typeof r.timeline === 'string' ? JSON.parse(r.timeline) : (r.timeline || []);
  const iso = (d: Date) => new Date(d).toISOString();
  const ACTION: Record<string, string> = {
    created: 'case_created', status: 'status_changed', severity: 'severity_changed', assignment: 'assigned',
    evidence_added: 'evidence_added', resolved: 'case_closed', note: 'note_added',
  };
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    case_number: r.case_number,
    title: r.title,
    summary: r.summary,
    severity: r.severity,
    status: r.status,
    assigned_to_user_id: r.assigned_to_user_id,
    assigned_to_name: r.assigned_to_name,
    lead_signal_id: r.lead_signal_id,
    evidence_event_ids: typeof r.evidence_event_ids === 'string' ? JSON.parse(r.evidence_event_ids) : (r.evidence_event_ids || []),
    internal_notes: [
      ...legacyNotes,
      ...events.filter(e => e.kind === 'note').map(e => ({
        id: e.id, author_id: e.actor_id ?? '', author_name: e.actor_name, note: e.body ?? '', created_at: iso(e.created_at),
      })),
    ],
    timeline: [
      ...legacyTimeline,
      ...events.filter(e => e.kind !== 'note').map(e => ({
        id: e.id, action: ACTION[e.kind] ?? e.kind, actor_name: e.actor_name, timestamp: iso(e.created_at), details: e.body ?? undefined,
      })),
    ],
    resolution: r.resolution,
    resolution_outcome: r.resolution_outcome,
    closed_by: r.closed_by,
    closed_at: r.closed_at,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
