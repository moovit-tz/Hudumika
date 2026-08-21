import crypto from 'crypto';
import { dbPlatform } from '../db/client.js';
import { env } from '../config/env.js';
import { validateSubdomain, isSubdomainAvailable, isEmailAvailable } from './onboarding.service.js';
import { MailService } from './mail.service.js';

/**
 * AgencyHost M1 — an agency tenant creates a brand-new, fully independent
 * Hudumika tenant on behalf of a client it will host sites for, and links
 * the two via agency_managed_tenants. Deliberately not a variant of
 * OnboardingService.completeOnboarding(): that flow requires a real active
 * package and a simulated payment, and logs the caller straight in as the
 * new tenant's admin — none of which fits here. The agency staff member's
 * own session is untouched; the client gets their own login later, through
 * the ordinary /auth/accept-invite flow, once they accept the emailed
 * invitation this creates.
 */

export class AgencyTenantError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CreateManagedClientInput {
  company_name: string;
  subdomain: string;
  admin_email: string;
}

/** Generates a slug unique against tenants.slug. Duplicated rather than
 *  imported from onboarding.service.ts, which doesn't export it — matches
 *  the existing precedent in scripts/create-aleka-tenant.ts. */
function slugifyBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'company';
}
async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyBase(name);
  let candidate = base;
  let n = 2;
  while (await dbPlatform.selectFrom('tenants').select('id').where('slug', '=', candidate).executeTakeFirst()) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

export class AgencyTenantService {
  static async createManagedClientTenant(
    agencyTenantId: string,
    actorUserId: string,
    input: CreateManagedClientInput,
  ): Promise<{ tenant: { id: string; name: string; slug: string; subdomain: string }; relationship_id: string }> {
    const email = input.admin_email.trim().toLowerCase();

    // The agency's own company name for the invite email — not the acting
    // staff member's personal name, which request.user carries but which
    // isn't what "X has set up your hosting account" should say.
    const agencyTenant = await dbPlatform.selectFrom('tenants').select('name')
      .where('id', '=', agencyTenantId).executeTakeFirst();
    const agencyName = agencyTenant?.name ?? 'Your agency';

    if (!(await isEmailAvailable(email))) {
      throw new AgencyTenantError(409, 'An account with this email already exists');
    }
    const subCheck = validateSubdomain(input.subdomain);
    if (!subCheck.ok) {
      throw new AgencyTenantError(400, subCheck.reason || 'Invalid subdomain');
    }
    if (!(await isSubdomainAvailable(input.subdomain))) {
      throw new AgencyTenantError(409, 'This subdomain is already taken');
    }

    const now = new Date();
    const slug = await uniqueSlug(input.company_name);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { tenant, relationship } = await dbPlatform.transaction().execute(async (trx) => {
      // No GLService.seedChartOfAccounts / DefaultWorkflowService.seedForTenant
      // here, unlike OnboardingService.completeOnboarding() — this tenant has
      // no ClearOS/FinOps footprint to seed. It's an Onsite-only tenant until
      // (if ever) it picks a real plan of its own.
      const tenant = await trx.insertInto('tenants').values({
        name: input.company_name,
        slug,
        subdomain: input.subdomain,
        plan: 'agency-managed',
        active: true,
        created_at: now,
        updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      // Scoped to the NEW tenant's id, not the agency's — the agency staff
      // member creating this isn't a member of it. hr_invitations carries no
      // RLS (see migration 040's own design), so this is a deliberate, new
      // caller of an existing table rather than a bypass of one.
      await trx.insertInto('hr_invitations').values({
        tenant_id: tenant.id,
        email,
        role: 'TENANT_ADMIN',
        token,
        invited_by: actorUserId,
        expires_at: expiresAt,
        created_at: now,
      }).execute();

      const relationship = await trx.insertInto('agency_managed_tenants').values({
        agency_tenant_id: agencyTenantId,
        client_tenant_id: tenant.id,
        created_by: actorUserId,
        created_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      return { tenant, relationship };
    });

    const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${token}`;
    await MailService.enqueueTemplated(
      tenant.id,
      'agency.client_tenant_ready',
      email,
      { agencyName, companyName: tenant.name, acceptUrl },
      'onsite',
    ).catch(() => { /* the tenant/invitation exist regardless; the admin can resend from the agency's client list */ });

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, subdomain: tenant.subdomain || tenant.slug },
      relationship_id: relationship.id,
    };
  }

  /** The agency's own dashboard of every tenant it manages, active and historical. */
  static async listManagedClients(agencyTenantId: string) {
    return dbPlatform.selectFrom('agency_managed_tenants')
      .innerJoin('tenants', 'tenants.id', 'agency_managed_tenants.client_tenant_id')
      .select([
        'agency_managed_tenants.id',
        'agency_managed_tenants.status',
        'agency_managed_tenants.attached_at',
        'agency_managed_tenants.detached_at',
        'tenants.id as tenant_id',
        'tenants.name as tenant_name',
        'tenants.subdomain as tenant_subdomain',
        'tenants.created_at as tenant_created_at',
      ])
      .where('agency_managed_tenants.agency_tenant_id', '=', agencyTenantId)
      .orderBy('agency_managed_tenants.attached_at', 'desc')
      .execute();
  }
}
