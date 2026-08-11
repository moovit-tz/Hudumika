import { WorkflowTemplateService } from './workflow-template.service.js';

/**
 * Installs the platform default workflows (Sea/Air/Road/Sea-transit) into a
 * tenant. Kept as a stable entry point for the tenant-creation hooks
 * (onboarding.service.ts, superadmin create-tenant) and the backfill script;
 * the actual work now lives in WorkflowTemplateService, which sources the
 * defaults from the versioned `workflow_templates` library (falling back to the
 * code registry in config/default-workflows.ts until the library is seeded), so
 * a superadmin who publishes a new template version changes what new tenants
 * receive with no change here.
 *
 * Idempotent AND deletion-respecting: a template is (re)installed only if the
 * tenant has NO row for that template_key at all — deleted or live.
 */
export class DefaultWorkflowService {
  static seedForTenant(dbOrTrx: any, tenantId: string, createdBy: string | null = null) {
    return WorkflowTemplateService.seedForTenant(dbOrTrx, tenantId, createdBy);
  }
}
