/**
 * PII Privacy Policy Engine — implements the principal-based policy evaluation
 * described in the zero-trust access document (section 41).
 *
 * policy.evaluate({ principal, action, table, requestedColumns, purpose })
 * → { permitted, allowedColumns, deniedColumns, requiresAudit, auditLevel }
 *
 * The engine sits above the existing three-layer RBAC; it does not replace
 * requireRole() / requireEntitlement() — those gate route entry; this gates
 * *which fields* a permitted principal may actually receive from that route.
 */

import type { UserRole } from '@hudumika/types';
import { PII_FIELDS, getFieldMeta, type PiiDomain, type PiiSensitivity } from '../lib/pii-field-registry.js';

// ── Domain access rules ───────────────────────────────────────────────────────

/** Roles that may access each domain without a special grant. */
const DOMAIN_ALLOWED_ROLES: Record<PiiDomain, UserRole[]> = {
  GENERAL:              ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER', 'TENANT_ADMIN', 'OFFICER'],
  CUSTOMER:             ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'TENANT_ADMIN'],
  FINANCIAL:            ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'TENANT_ADMIN'],
  HR:                   ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TENANT_ADMIN'],
  HR_SENSITIVE:         ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  PAYROLL:              ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'TENANT_ADMIN'],
  IDENTITY:             ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  HEALTH:               ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  LEGAL:                ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  PRIVACY:              ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  BIOMETRIC:            ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  SECURITY:             ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  WHISTLEBLOWER:        ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  EXECUTIVE_CONFIDENTIAL: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
};

/** Scope strings that grant read access to a domain for APPLICATION principals. */
const SCOPE_DOMAIN_MAP: Partial<Record<string, PiiDomain[]>> = {
  'employees.basic.read':    ['HR'],
  'employees.payroll.read':  ['PAYROLL'],
  'employees.identity.read': ['IDENTITY'],
  'employees.banking.read':  ['FINANCIAL'],
  'contacts.basic.read':     ['CUSTOMER'],
  'contacts.email.read':     ['CUSTOMER'],
  'contacts.phone.read':     ['CUSTOMER'],
  'invoices.read':           ['FINANCIAL'],
  'identity.government_id.read': ['IDENTITY'],
  'financial.bank.read':     ['FINANCIAL'],
};

// ── Public types ──────────────────────────────────────────────────────────────

export type PrincipalType = 'USER' | 'APPLICATION' | 'SERVICE' | 'AGENT';
export type PolicyAction  = 'READ' | 'WRITE' | 'DELETE' | 'EXPORT';
export type AuditLevel    = 'NONE' | 'STANDARD' | 'ENHANCED';

export interface PolicyPrincipal {
  type: PrincipalType;
  id: string;
  tenantId: string;
  /** The platform role (for USER principals). */
  role?: UserRole;
  /** OAuth/API key scopes (for APPLICATION principals). */
  scopes?: string[];
  /** Whether this principal is the subject of the data (viewing their own record). */
  isSelf?: boolean;
}

export interface PolicyContext {
  principal: PolicyPrincipal;
  action: PolicyAction;
  table: string;
  requestedColumns?: string[];
  purpose?: string;
}

export interface PolicyDecision {
  permitted: boolean;
  /** Columns the principal is allowed to receive. Empty means all non-PII columns. */
  allowedColumns: string[];
  /** PII columns that were stripped. */
  deniedColumns: string[];
  requiresAudit: boolean;
  auditLevel: AuditLevel;
  /** The highest sensitivity among the allowed PII columns. */
  maxSensitivity: PiiSensitivity | null;
}

// ── Core engine ───────────────────────────────────────────────────────────────

export function evaluate(ctx: PolicyContext): PolicyDecision {
  const { principal, action, table, requestedColumns, purpose } = ctx;
  const tableMeta = PII_FIELDS[table] ?? [];

  // If there's no PII catalog for this table, pass everything through.
  if (tableMeta.length === 0) {
    return {
      permitted: true,
      allowedColumns: requestedColumns ?? [],
      deniedColumns: [],
      requiresAudit: false,
      auditLevel: 'NONE',
      maxSensitivity: null,
    };
  }

  const sensitivityLevels: PiiSensitivity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const allowedColumns: string[] = [];
  const deniedColumns: string[] = [];

  const piiColumnsRequested = requestedColumns
    ? tableMeta.filter(f => requestedColumns.includes(f.column))
    : tableMeta;

  for (const field of piiColumnsRequested) {
    if (canAccessDomain(principal, field.domain, action)) {
      allowedColumns.push(field.column);
    } else {
      deniedColumns.push(field.column);
    }
  }

  // Add any non-PII requested columns to the allow list.
  const piiColumnNames = new Set(tableMeta.map(f => f.column));
  if (requestedColumns) {
    for (const col of requestedColumns) {
      if (!piiColumnNames.has(col) && !allowedColumns.includes(col)) {
        allowedColumns.push(col);
      }
    }
  }

  const maxSens = (() => {
    let max: PiiSensitivity = 'LOW';
    for (const col of allowedColumns) {
      const meta = getFieldMeta(table, col);
      if (meta && sensitivityLevels.indexOf(meta.sensitivity) > sensitivityLevels.indexOf(max)) {
        max = meta.sensitivity;
      }
    }
    return allowedColumns.some(c => piiColumnNames.has(c)) ? max : null;
  })();

  const requiresAudit = allowedColumns.some(col => {
    const meta = getFieldMeta(table, col);
    return meta && (meta.sensitivity === 'HIGH' || meta.sensitivity === 'CRITICAL');
  });

  const auditLevel: AuditLevel = (() => {
    if (!requiresAudit) return 'NONE';
    if (maxSens === 'CRITICAL') return 'ENHANCED';
    return 'STANDARD';
  })();

  return {
    permitted: true,
    allowedColumns,
    deniedColumns,
    requiresAudit,
    auditLevel,
    maxSensitivity: maxSens,
  };
}

function canAccessDomain(principal: PolicyPrincipal, domain: PiiDomain, action: PolicyAction): boolean {
  // Users can always read their own data regardless of domain.
  if (principal.isSelf && action === 'READ') return true;

  if (principal.type === 'USER') {
    const role = principal.role;
    if (!role) return false;
    const allowedRoles = DOMAIN_ALLOWED_ROLES[domain] ?? [];
    return allowedRoles.includes(role);
  }

  if (principal.type === 'APPLICATION') {
    const scopes = principal.scopes ?? [];
    for (const scope of scopes) {
      const domains = SCOPE_DOMAIN_MAP[scope];
      if (domains?.includes(domain)) return true;
    }
    return false;
  }

  if (principal.type === 'SERVICE') {
    // Internal platform services get full access (SUPER_ADMIN equivalent).
    return true;
  }

  if (principal.type === 'AGENT') {
    // Agents only get what their granted scopes cover, same as APPLICATION.
    const scopes = principal.scopes ?? [];
    for (const scope of scopes) {
      const domains = SCOPE_DOMAIN_MAP[scope];
      if (domains?.includes(domain)) return true;
    }
    return false;
  }

  return false;
}

/**
 * Convenience: given an object returned from a DB query, strip all PII columns
 * the principal is not allowed to receive. Returns the filtered object.
 */
export function applyFieldFilter<T extends Record<string, unknown>>(
  record: T,
  decision: PolicyDecision,
): T {
  if (decision.deniedColumns.length === 0) return record;
  const out = { ...record };
  for (const col of decision.deniedColumns) {
    delete out[col];
  }
  return out as T;
}

/**
 * Build a PolicyPrincipal from a Fastify request's authenticated user.
 * Pass `isSelf = true` when the route is serving the authenticated user's own data.
 */
export function principalFromRequest(
  request: { user?: { id?: string; sub?: string; tenant_id?: string; role?: UserRole }; apiKeyScopes?: string[] | null },
  isSelf = false,
): PolicyPrincipal {
  const user = request.user;
  if (request.apiKeyScopes) {
    return {
      type: 'APPLICATION',
      id: 'api_key',
      tenantId: user?.tenant_id ?? '',
      scopes: request.apiKeyScopes ?? [],
    };
  }
  return {
    type: 'USER',
    id: user?.id ?? user?.sub ?? '',
    tenantId: user?.tenant_id ?? '',
    role: user?.role,
    isSelf,
  };
}
