/**
 * Non-blocking PII access logger.
 * Call this from any route that returns HIGH or CRITICAL sensitivity fields.
 * Writes to pii_access_log and fans out to the SIEM webhook — both fire-and-
 * forget so audit latency never adds to API response time.
 */
import { withTenant } from '../db/client.js';
import { dispatchSiemExport } from './siem-export.js';
import type { PiiDomain, PiiSensitivity } from './pii-field-registry.js';

export interface PiiAccessEvent {
  tenantId: string;
  accessorId: string | null;
  accessorType?: 'USER' | 'API_KEY' | 'AGENT' | 'SERVICE';
  accessorRef?: string | null;
  subjectId?: string | null;
  subjectTable: string;
  subjectRecordId: string;
  fieldsAccessed: string[];
  domain: PiiDomain;
  sensitivity: PiiSensitivity;
  purpose?: string | null;
  route?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function logPiiAccess(event: PiiAccessEvent): void {
  const {
    tenantId, accessorId, accessorType = 'USER', accessorRef = null,
    subjectId = null, subjectTable, subjectRecordId, fieldsAccessed,
    domain, sensitivity, purpose = null, route = null, ip = null, userAgent = null,
  } = event;

  // Only log HIGH and CRITICAL fields — avoid noise from routine LOW/MEDIUM reads.
  if (sensitivity !== 'HIGH' && sensitivity !== 'CRITICAL') return;

  withTenant(tenantId, async (trx) => {
    const row = await trx
      .insertInto('pii_access_log')
      .values({
        tenant_id: tenantId,
        accessor_id: accessorId,
        accessor_type: accessorType,
        accessor_ref: accessorRef,
        subject_id: subjectId,
        subject_table: subjectTable,
        subject_record_id: subjectRecordId,
        fields_accessed: fieldsAccessed,
        data_domain: domain,
        sensitivity_level: sensitivity,
        purpose,
        route,
        ip,
        user_agent: userAgent,
      })
      .returning(['id', 'created_at'])
      .executeTakeFirst();

    if (row && (sensitivity === 'CRITICAL' || domain === 'IDENTITY' || domain === 'PAYROLL')) {
      // Fan out to SIEM for the most sensitive accesses.
      dispatchSiemExport(tenantId, {
        id: row.id,
        eventType: 'pii_access' as any,
        userId: accessorId,
        metadata: {
          subject_table: subjectTable,
          subject_record_id: subjectRecordId,
          fields_accessed: fieldsAccessed,
          data_domain: domain,
          sensitivity,
          purpose,
          route,
          accessor_type: accessorType,
        },
        createdAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      });
    }
  }).catch((err) => {
    // Never block the request — just emit a diagnostic log.
    console.error('[pii-access-logger] failed to record PII access:', err?.message ?? err);
  });
}

/**
 * Extract ip and userAgent from a Fastify request for convenience.
 * Usage: logPiiAccess({ ...fromRequest(request), tenantId, ... })
 */
export function fromRequest(req: { ip?: string; headers?: Record<string, unknown> }): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers?.['user-agent'] as string | undefined) ?? null,
  };
}
