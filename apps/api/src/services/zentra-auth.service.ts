import type { JWTPayload } from '@hudumika/types';
import { withTenant, dbPlatform } from '../db/client.js';
import type { ZentraPolicy } from '@hudumika/types';
import { emitZentraAuditEvent } from './zentra-event.service.js';
import { loadRecs, withTeam, departmentsFor } from './zentra-enforce.service.js';

export interface ZentraAuthSubject {
  id: string; // user.sub
  role: string;
  tenant_id: string;
  name?: string;
  team_id?: string | null;
  assigned_records?: string[];
}

export interface ZentraAuthResource {
  type: string; // 'shipment' | 'invoice' | 'customer' | 'employee' | 'document' | 'declaration'
  id: string;
  owner_id?: string | null;
  assigned_to_user_id?: string | null;
  team_id?: string | null;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  amount?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ZentraAuthContext {
  tenant_id: string;
  app_id: string;
  ip?: string;
  correlation_id?: string;
}

export interface ZentraAuthDecision {
  allowed: boolean;
  reason: string;
  policy_id?: string;
}

/**
 * Roles with unrestricted administrative operational view within their tenant.
 * Note: Platform SUPER_ADMIN has cross-tenant oversight only through explicit platform audit.
 */
const TENANT_ADMIN_ROLES = new Set(['ADMIN', 'TENANT_ADMIN']);

/**
 * Roles restricted to records they own or are assigned. These are the role
 * names users actually carry (packages/types UserRole): JUNIOR, and OFFICER,
 * its deprecated alias. OPS_JUNIOR/STAFF/ASSISTANT were never real roles —
 * with only those listed, a JUNIOR fell through to the general staff read
 * rule and could read any non-confidential record.
 */
const RESTRICTED_OPERATIONAL_ROLES = new Set(['JUNIOR', 'OFFICER', 'CUSTOMER', 'ORG', 'GUEST', 'OPS_JUNIOR', 'STAFF', 'ASSISTANT']);

const CLASSIFICATION_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

/**
 * Evaluate record-level authorization.
 * Deny-by-default for protected records and actions.
 */
export async function evaluateZentraRecordAuth(
  subject: ZentraAuthSubject,
  action: string,
  resource: ZentraAuthResource,
  context: ZentraAuthContext
): Promise<ZentraAuthDecision> {
  // 1. Strict Tenant Isolation check
  if (!subject.tenant_id || subject.tenant_id !== context.tenant_id) {
    await logAuthDenial(subject, action, resource, context, 'Tenant mismatch');
    return { allowed: false, reason: 'Cross-tenant access forbidden' };
  }

  // 2. Platform SUPER_ADMIN is a platform role — cannot act as an arbitrary tenant member
  // without explicit platform oversight audit recording.
  if (subject.role === 'SUPER_ADMIN') {
    return { allowed: true, reason: 'Platform administrator oversight authorized' };
  }

  // 3. Query tenant policies configured in Zentra for custom overrides
  try {
    const customPolicies = await withTenant(subject.tenant_id, trx =>
      trx.selectFrom('zentra_policies')
        .selectAll()
        .where('tenant_id', '=', subject.tenant_id)
        .where('resource_type', '=', resource.type)
        .where('action', '=', action)
        .where('enabled', '=', true)
        .execute()
    );

    // Explicit policies. An ALLOW that matches is an exception to any DENY
    // (e.g. deny JUNIOR invoices always + allow when assigned = only their
    // own) — the same rule the apps enforce (zentra-enforce.service.ts).
    const matching = customPolicies.filter(policy =>
      ((policy.subject_type === 'role' && policy.subject_id === subject.role) ||
       (policy.subject_type === 'user' && policy.subject_id === subject.id) ||
       (policy.subject_type === 'team' && !!subject.team_id && policy.subject_id === subject.team_id))
      && evaluatePolicyCondition(policy.condition_type, policy.condition_value, subject, resource));
    const allow = matching.find(p => p.effect === 'allow');
    const deny = matching.find(p => p.effect === 'deny');
    if (deny && !allow) {
      await logAuthDenial(subject, action, resource, context, `Explicit policy deny: ${deny.name}`);
      return { allowed: false, reason: `Policy '${deny.name}' denied access`, policy_id: deny.id };
    }
    if (allow) return { allowed: true, reason: deny ? `Policy '${allow.name}' is an exception to '${deny.name}'` : `Policy '${allow.name}' granted access`, policy_id: allow.id };
  } catch (err) {
    // Fail closed. Falling through to the baseline rules here would ignore a
    // tenant's own deny policies whenever the policy read failed.
    await logAuthDenial(subject, action, resource, context, 'Policy store unavailable');
    return { allowed: false, reason: 'Access policies could not be checked; denied for safety.' };
  }

  // 4. Default baseline rules:
  // Tenant Admins / Managers have legitimate workspace-wide visibility
  if (TENANT_ADMIN_ROLES.has(subject.role) || subject.role === 'MANAGER' || subject.role === 'OPS') {
    return { allowed: true, reason: 'Authorized by organizational role' };
  }

  // Restricted roles (e.g. OPS_JUNIOR) MUST be assigned or owner of the resource
  if (RESTRICTED_OPERATIONAL_ROLES.has(subject.role)) {
    const isOwner = resource.owner_id && resource.owner_id === subject.id;
    const isAssigned = resource.assigned_to_user_id && resource.assigned_to_user_id === subject.id;
    const isTeamMember = resource.team_id && subject.team_id && resource.team_id === subject.team_id;

    if (isOwner || isAssigned || isTeamMember) {
      return { allowed: true, reason: 'Direct assignment/ownership verification succeeded' };
    }

    // Deny-by-default for Junior attempting to read unassigned operational records
    await logAuthDenial(subject, action, resource, context, `Role '${subject.role}' requires record assignment`);
    return {
      allowed: false,
      reason: `Record-level restriction: users with role '${subject.role}' can only access records assigned to them.`
    };
  }

  // General authenticated staff fallback for standard operational reads
  if (action.endsWith('.read') || action === 'read' || action === 'view') {
    if (resource.classification === 'restricted' || resource.classification === 'confidential') {
      await logAuthDenial(subject, action, resource, context, `Classification '${resource.classification}' requires elevation`);
      return { allowed: false, reason: 'Confidential record requires managerial elevation' };
    }
    return { allowed: true, reason: 'Standard staff operational read' };
  }

  // Sensitive actions (export, approve, delete, write) require explicit permission or manager/admin
  await logAuthDenial(subject, action, resource, context, `Protected action '${action}' denied by default`);
  return { allowed: false, reason: `Action '${action}' requires higher administrative entitlement` };
}

function evaluatePolicyCondition(
  conditionType: string,
  conditionValue: unknown,
  subject: ZentraAuthSubject,
  resource: ZentraAuthResource
): boolean {
  switch (conditionType) {
    case 'always':
      return true;
    case 'owner_only':
      return !!(resource.owner_id && resource.owner_id === subject.id);
    case 'assigned_only':
      return !!(resource.assigned_to_user_id && resource.assigned_to_user_id === subject.id);
    case 'team_only':
      return !!(resource.team_id && subject.team_id && resource.team_id === subject.team_id);
    case 'classification_le': {
      const parsedVal = typeof conditionValue === 'string' ? JSON.parse(conditionValue) : conditionValue;
      const max = CLASSIFICATION_RANK[String((parsedVal as any)?.max ?? 'internal')] ?? 1;
      return CLASSIFICATION_RANK[resource.classification ?? 'internal'] <= max;
    }
    case 'amount_lt': {
      const parsedVal = typeof conditionValue === 'string' ? JSON.parse(conditionValue) : conditionValue;
      const maxAmount = Number((parsedVal as any)?.max ?? Infinity);
      return typeof resource.amount === 'number' && resource.amount <= maxAmount;
    }
    default:
      return false;
  }
}

async function logAuthDenial(
  subject: ZentraAuthSubject,
  action: string,
  resource: ZentraAuthResource,
  context: ZentraAuthContext,
  reason: string
) {
  try {
    await emitZentraAuditEvent({
      tenant_id: subject.tenant_id,
      app_id: context.app_id || 'core',
      event_name: 'permission.denied',
      actor_id: subject.id,
      actor_role: subject.role,
      actor_name: subject.name,
      actor_ip: context.ip,
      resource_type: resource.type,
      resource_id: resource.id,
      action,
      outcome: 'denied',
      correlation_id: context.correlation_id,
      safe_summary: `Access denied for ${action} on ${resource.type}:${resource.id} (${reason})`,
      safe_metadata: {
        denial_reason: reason,
        resource_classification: resource.classification,
        assigned_to: resource.assigned_to_user_id,
      },
    });
  } catch {
    // Audit logging failure must never block or mask authorization denial
  }
}

/**
 * Filter an array of records to only those the subject is authorized to view.
 * Used by search results, lists, exports, and count calculations to prevent metadata leakage.
 */
export async function filterAuthorizedRecords<T extends { id: string; owner_id?: string | null; assigned_to_user_id?: string | null; team_id?: string | null; classification?: any }>(
  subject: ZentraAuthSubject,
  resourceType: string,
  action: string,
  records: T[],
  context: ZentraAuthContext
): Promise<T[]> {
  // If subject has unrestricted admin role within tenant, bypass per-item checks
  if (TENANT_ADMIN_ROLES.has(subject.role) || subject.role === 'SUPER_ADMIN') {
    return records;
  }

  const results: T[] = [];
  for (const record of records) {
    const decision = await evaluateZentraRecordAuth(
      subject,
      action,
      {
        type: resourceType,
        id: record.id,
        owner_id: record.owner_id,
        assigned_to_user_id: record.assigned_to_user_id,
        team_id: record.team_id,
        classification: record.classification,
      },
      context
    );
    if (decision.allowed) {
      results.push(record);
    }
  }
  return results;
}

/**
 * The real owner/assignee/amount of a record, read from the app's own table —
 * so a policy check is about the record as it is, not as a caller describes
 * it. Returns null for a type this doesn't know how to load yet (the caller
 * then says the decision used the fields as supplied).
 */
export async function loadCanonicalResource(tenantId: string, type: string, id: string): Promise<ZentraAuthResource | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  // Same lookup the apps' policy enforcement uses, so the simulator and the
  // apps judge a record identically (team = assignee's/owner's department).
  const rec = (await loadRecs(tenantId, type, [id])).get(id);
  if (!rec) return null;
  const r = withTeam(rec, await departmentsFor(tenantId));
  return { type, id, owner_id: r.owner_id ?? null, assigned_to_user_id: r.assigned_to_user_id ?? null, team_id: r.team_id ?? null, amount: r.amount ?? null };
}

export const CANONICAL_RESOURCE_TYPES = ['shipment', 'support_ticket', 'invoice', 'customer', 'employee'] as const;
