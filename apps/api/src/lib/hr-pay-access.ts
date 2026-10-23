import type { Kysely } from 'kysely';
import type { Database } from '../db/client.js';
import { hasOrgPermission, ORG_PERMISSIONS } from './org-rbac.js';
/** Pay visibility is independent of a reporting-line/operations-manager role. */
export const PAYROLL_READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;
export function canReadStaffPay(actor: { sub: string; role: string }, subjectId: string): boolean {
  return actor.sub === subjectId || (PAYROLL_READ_ROLES as readonly string[]).includes(actor.role);
}

export const HR_CONFIDENTIAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

export async function canManageHrDocuments(actor:{tenant_id:string;sub:string;role:string},transaction?:Kysely<Database>):Promise<boolean> {
  if (actor.role === 'CUSTOMER') return false;
  return (HR_CONFIDENTIAL_ROLES as readonly string[]).includes(actor.role)
    || await hasOrgPermission(actor.tenant_id,actor.sub,ORG_PERMISSIONS.HR_DOCUMENTS_MANAGE,transaction);
}
