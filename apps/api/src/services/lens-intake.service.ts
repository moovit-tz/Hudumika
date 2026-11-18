import { dbPlatform, withTenant } from '../db/client.js';
import { ALL_APP_IDS, type AppId } from '@hudumika/types';
import { emitLensOutboxEvent } from './lens-outbox.service.js';
import type { LensReport, LensItemSeverity } from '@hudumika/types';

export interface SubmitReportInput {
  sourceApp: string;
  sourceRoute?: string;
  tenantId?: string;
  reporter: {
    id: string;
    email?: string;
    name?: string;
    role?: string;
  };
  title: string;
  summary: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  severity?: LensItemSeverity;
  clientContext?: Record<string, any>;
  attachments?: Array<{ filename: string; path: string; size: number; content_type?: string }>;
  autoCreateLensItem?: boolean;
}

/**
 * Sanitize client context so tokens, passwords, session cookies or auth headers are never recorded.
 */
function sanitizeContext(ctx: Record<string, any> = {}): Record<string, any> {
  const SENSITIVE_KEYS = ['token', 'password', 'secret', 'authorization', 'cookie', 'session', 'bearer', 'key'];
  const clean: Record<string, any> = {};

  for (const [k, v] of Object.entries(ctx)) {
    const isSensitive = SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk));
    if (isSensitive) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      clean[k] = sanitizeContext(v);
    } else {
      clean[k] = v;
    }
  }

  return clean;
}

/**
 * Intake an engineering defect report across all platform apps.
 */
export async function intakeReport(input: SubmitReportInput): Promise<{
  report: LensReport;
  lensItemRef?: string;
}> {
  // Validate app id
  const appClean = input.sourceApp.toLowerCase().trim();
  const isValidApp = (ALL_APP_IDS as string[]).includes(appClean) || appClean === 'platform' || appClean === 'lens';
  if (!isValidApp) {
    throw new Error(`Invalid source app: ${input.sourceApp}`);
  }

  const cleanContext = sanitizeContext(input.clientContext);
  const severity: LensItemSeverity = input.severity ?? 'NORMAL';

  let createdItemId: string | null = null;
  let createdItemRef: string | null = null;

  // If auto-creation of a Lens item is requested
  if (input.autoCreateLensItem) {
    const next = await dbPlatform.selectNoFrom(
      eb => eb.fn<number>('nextval', [eb.val('lens_item_ref_seq')]).as('n'),
    ).executeTakeFirstOrThrow();

    const ref = `LENS-${next.n}`;
    createdItemRef = ref;

    const item = await dbPlatform.insertInto('lens_items').values({
      ref,
      kind: 'BUG',
      title: `[${appClean.toUpperCase()}] ${input.title.trim()}`,
      body: `${input.summary}\n\n### Steps to reproduce:\n${input.stepsToReproduce || 'N/A'}\n\n### Expected:\n${input.expectedBehavior || 'N/A'}\n\n### Actual:\n${input.actualBehavior || 'N/A'}`,
      area_id: null,
      status: 'OPEN',
      severity,
      priority: severity === 'CRITICAL' ? 'URGENT' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      confidence: 'CONFIRMED',
      created_by: input.reporter.id,
      reproduction_steps: input.stepsToReproduce ?? null,
      environment: cleanContext.environment || 'production',
      refs: JSON.stringify([]) as any,
      tags: JSON.stringify([appClean, 'defect-intake']) as any,
    }).returningAll().executeTakeFirstOrThrow();

    createdItemId = item.id;

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id,
      kind: 'created',
      detail: `Defect reported via ${appClean} intake (${severity})`,
      actor_id: input.reporter.id,
      actor_name: input.reporter.name || input.reporter.email || 'Reporter',
    }).execute();
  }

  // Insert into lens_reports
  const reportRow = await dbPlatform.insertInto('lens_reports').values({
    source_app: appClean,
    source_route: input.sourceRoute ?? null,
    tenant_id: input.tenantId ?? null,
    reporter_id: input.reporter.id,
    reporter_email: input.reporter.email ?? null,
    reporter_name: input.reporter.name ?? null,
    reporter_role: input.reporter.role ?? null,
    title: input.title.trim(),
    summary: input.summary.trim(),
    steps_to_reproduce: input.stepsToReproduce ?? null,
    expected_behavior: input.expectedBehavior ?? null,
    actual_behavior: input.actualBehavior ?? null,
    severity,
    client_context: JSON.stringify(cleanContext) as any,
    attachments: JSON.stringify(input.attachments ?? []) as any,
    status: createdItemId ? 'LINKED' : 'NEW',
    item_id: createdItemId,
  }).returningAll().executeTakeFirstOrThrow();

  // Link back item to report
  if (createdItemId) {
    await dbPlatform.updateTable('lens_items')
      .set({ source_report_id: reportRow.id })
      .where('id', '=', createdItemId)
      .execute();
  }

  // Emit durable outbox event for notifications / triage
  await emitLensOutboxEvent({
    eventName: 'lens.report.created',
    aggregateType: 'lens_report',
    aggregateId: reportRow.id,
    payload: {
      reportId: reportRow.id,
      source_app: appClean,
      source_route: input.sourceRoute,
      title: reportRow.title,
      summary: reportRow.summary,
      severity,
      reporter_name: input.reporter.name,
      reporter_email: input.reporter.email,
      lensItemRef: createdItemRef,
    },
  });

  return {
    report: formatReportRow(reportRow),
    lensItemRef: createdItemRef ?? undefined,
  };
}

function formatReportRow(row: any): LensReport {
  return {
    id: row.id,
    source_app: row.source_app,
    source_route: row.source_route,
    tenant_id: row.tenant_id,
    reporter_id: row.reporter_id,
    reporter_email: row.reporter_email,
    reporter_name: row.reporter_name,
    reporter_role: row.reporter_role,
    title: row.title,
    summary: row.summary,
    steps_to_reproduce: row.steps_to_reproduce,
    expected_behavior: row.expected_behavior,
    actual_behavior: row.actual_behavior,
    severity: row.severity,
    client_context: typeof row.client_context === 'string' ? JSON.parse(row.client_context) : (row.client_context ?? {}),
    attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : (row.attachments ?? []),
    status: row.status,
    item_id: row.item_id,
    resolution_notes: row.resolution_notes,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}
