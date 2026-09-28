/**
 * PII response filter — strips sensitive fields from API responses
 * based on the principal's policy decision.
 *
 * Routes opt in by calling applyPiiFilter() or using the withPiiFilter()
 * helper. Not applied globally (every route hits different tables).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  evaluate,
  principalFromRequest,
  applyFieldFilter,
  type PolicyAction,
} from '../services/pii-policy.service.js';
import { logPiiAccess, fromRequest } from '../lib/pii-access-logger.js';
import { getFieldMeta, maxSensitivity, PII_FIELDS } from '../lib/pii-field-registry.js';

export interface PiiFilterOptions {
  table: string;
  action?: PolicyAction;
  /** The record's owner user_id — set to enable isSelf detection. */
  subjectId?: string;
  /** The record's primary key for the audit log. */
  recordId?: string;
  purpose?: string;
}

/**
 * Filter a single record object (row) returned from a query, stripping
 * any PII columns the request principal is not authorised to receive.
 *
 * Also logs PII access when HIGH/CRITICAL fields are being returned.
 */
export function applyPiiFilter<T extends Record<string, unknown>>(
  request: FastifyRequest,
  record: T,
  opts: PiiFilterOptions,
): T {
  const user = (request as any).user;
  const isSelf = opts.subjectId ? opts.subjectId === (user?.id ?? user?.sub) : false;

  const principal = principalFromRequest(request as any, isSelf);
  const decision = evaluate({
    principal,
    action: opts.action ?? 'READ',
    table: opts.table,
    requestedColumns: Object.keys(record),
    purpose: opts.purpose,
  });

  const filtered = applyFieldFilter(record, decision);

  if (decision.requiresAudit && decision.allowedColumns.length > 0 && opts.subjectId) {
    const piiAllowed = decision.allowedColumns.filter(col => !!getFieldMeta(opts.table, col));
    if (piiAllowed.length > 0) {
      const highestMeta = piiAllowed.map(c => getFieldMeta(opts.table, c)).find(Boolean);
      if (highestMeta) {
        const sensitivity = maxSensitivity(opts.table, piiAllowed);
        logPiiAccess({
          tenantId: user?.tenant_id ?? '',
          accessorId: user?.id ?? user?.sub ?? null,
          subjectId: opts.subjectId,
          subjectTable: opts.table,
          subjectRecordId: opts.recordId ?? opts.subjectId ?? 'unknown',
          fieldsAccessed: piiAllowed,
          domain: highestMeta.domain,
          sensitivity,
          purpose: opts.purpose ?? null,
          route: request.url,
          ...fromRequest(request),
        });
      }
    }
  }

  return filtered as T;
}

/**
 * Filter an array of records, applying the same principal policy to each row.
 */
export function applyPiiFilterMany<T extends Record<string, unknown>>(
  request: FastifyRequest,
  records: T[],
  opts: PiiFilterOptions & { subjectIdField?: string },
): T[] {
  return records.map(r => {
    const subjectId = opts.subjectIdField ? (r[opts.subjectIdField] as string | undefined) : opts.subjectId;
    return applyPiiFilter(request, r, { ...opts, subjectId });
  });
}
