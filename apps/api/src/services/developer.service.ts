// ─── apps/api/src/services/developer.service.ts ─────────────────
// Service layer for Hudumika Developer Platform
// Architecture Decision 1: Two Customer Types (Individual vs Organization)
// Architecture Decision 2: Dual Gateway & Provider Abstraction
// Architecture Decision 3: Sole Pricing Authority & Marketplace Metering

import crypto from 'crypto';
import { db, dbPlatform } from '../db/client.js';
import type {
  DeveloperAccount,
  DeveloperOrganization,
  DeveloperOrgMember,
  DeveloperBillingAccount,
  DeveloperProject,
  DeveloperEnvironment,
  DeveloperCredential,
  ApiProduct,
  ApiVersion,
  ApiOperation,
  ApiPricingPlan,
  ApiSubscription,
  ApiEntitlement,
  DeveloperTelemetrySummary,
  EnvironmentType,
  DeveloperAccountType,
  OrgMemberRole,
} from '@hudumika/types';

export class DeveloperService {
  /* ════════════════════════════════════════════════════════════════════════
     0. ACCESS CONTROL — every account-/project-scoped route below takes its
     id straight from the URL. HUD-0117: none of them ever verified the
     caller owns (or is an active member of) that account before reading or
     mutating it — confirmed live with two accounts in two different
     tenants: account B could list account A's projects, read its real
     prepaid billing balance, and mint a brand-new, unrestricted-scope
     PRODUCTION API credential against A's own project. Developer accounts
     are deliberately not tenant-scoped (see this file's header — Individual
     vs Organization, not Hudumika tenants), so RLS/withTenant give no
     protection here at all; this check is the only boundary that exists.
     ════════════════════════════════════════════════════════════════════════ */

  /** Throws a 404 (not 403) on any account the caller doesn't own or belong
   *  to, deliberately not distinguishing "doesn't exist" from "not yours" —
   *  same enumeration-safety convention this codebase already uses for
   *  cross-user resource ownership elsewhere (e.g. recovery-requests). */
  static async assertAccountAccess(accountId: string, userId: string): Promise<void> {
    const owned = await db.selectFrom('developer_accounts').select('id')
      .where('id', '=', accountId).where('owner_user_id', '=', userId).executeTakeFirst();
    if (owned) return;
    const membership = await db.selectFrom('developer_org_members').select('id')
      .where('developer_account_id', '=', accountId).where('user_id', '=', userId)
      .where('status', '=', 'active').executeTakeFirst();
    if (membership) return;
    throw Object.assign(new Error('Developer account not found.'), { statusCode: 404 });
  }

  /** Resolves a project to its owning account and applies the same check —
   *  returns the account id so callers that also need it don't re-query. */
  static async assertProjectAccess(projectId: string, userId: string): Promise<string> {
    const project = await db.selectFrom('dev_projects').select('developer_account_id')
      .where('id', '=', projectId).executeTakeFirst();
    if (!project) throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
    await this.assertAccountAccess(project.developer_account_id, userId);
    return project.developer_account_id;
  }

  /* ════════════════════════════════════════════════════════════════════════
     1. DEVELOPER ACCOUNTS & ORGANIZATIONS
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Get or auto-provision the default Individual developer account for a user.
   */
  static async getOrCreatePersonalAccount(userId: string, userName: string): Promise<DeveloperAccount> {
    const existing = await db
      .selectFrom('developer_accounts')
      .selectAll()
      .where('owner_user_id', '=', userId)
      .where('type', '=', 'INDIVIDUAL')
      .executeTakeFirst();

    if (existing) {
      return this.enrichAccount(existing);
    }

    const slug = `dev-${userId.slice(0, 8)}-personal`;
    const [account] = await db
      .insertInto('developer_accounts')
      .values({
        type: 'INDIVIDUAL',
        name: `${userName || 'Developer'} (Personal)`,
        slug,
        owner_user_id: userId,
        status: 'active',
      })
      .returningAll()
      .execute();

    // Create default primary billing account
    await db
      .insertInto('developer_billing_accounts')
      .values({
        developer_account_id: account.id,
        name: 'Personal Prepaid Account',
        billing_type: 'PREPAID',
        currency: 'TZS',
        balance_credits: 50000.0, // Seed test balance
      })
      .execute();

    // Create default initial project
    const [project] = await db
      .insertInto('dev_projects')
      .values({
        developer_account_id: account.id,
        name: 'Default Project',
        slug: 'default-project',
        description: 'Personal API testing and development sandbox',
        created_by: userId,
        status: 'active',
      })
      .returningAll()
      .execute();

    // Provision environments
    await this.provisionDefaultEnvironments(project.id);

    return this.enrichAccount(account);
  }

  /**
   * List all developer accounts the user owns or belongs to (Personal + Organizations).
   */
  static async listUserAccounts(userId: string, userName: string): Promise<DeveloperAccount[]> {
    // Ensure personal account exists
    await this.getOrCreatePersonalAccount(userId, userName);

    const owned = await db
      .selectFrom('developer_accounts')
      .selectAll()
      .where('owner_user_id', '=', userId)
      .execute();

    const memberAccounts = await db
      .selectFrom('developer_org_members')
      .innerJoin('developer_accounts', 'developer_accounts.id', 'developer_org_members.developer_account_id')
      .selectAll('developer_accounts')
      .where('developer_org_members.user_id', '=', userId)
      .where('developer_org_members.status', '=', 'active')
      .execute();

    // Deduplicate
    const map = new Map<string, any>();
    for (const acc of [...owned, ...memberAccounts]) {
      map.set(acc.id, acc);
    }

    const results: DeveloperAccount[] = [];
    for (const raw of map.values()) {
      results.push(await this.enrichAccount(raw));
    }
    return results;
  }

  /**
   * Create an Organization Developer Account.
   */
  static async createOrganizationAccount(
    userId: string,
    params: {
      name: string;
      legal_name: string;
      registration_number?: string;
      tin?: string;
      country?: string;
      industry?: string;
      website?: string;
    }
  ): Promise<DeveloperAccount> {
    const slug = `${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;

    const [account] = await db
      .insertInto('developer_accounts')
      .values({
        type: 'ORGANIZATION',
        name: params.name,
        slug,
        owner_user_id: userId,
        status: 'active',
      })
      .returningAll()
      .execute();

    // Insert Organization details
    await db
      .insertInto('developer_organizations')
      .values({
        developer_account_id: account.id,
        legal_name: params.legal_name || params.name,
        registration_number: params.registration_number || null,
        tin: params.tin || null,
        country: params.country || 'TZ',
        industry: params.industry || null,
        website: params.website || null,
        verification_status: 'unverified',
      })
      .execute();

    // Add creator as OWNER in org members
    await db
      .insertInto('developer_org_members')
      .values({
        developer_account_id: account.id,
        user_id: userId,
        role: 'OWNER',
        status: 'active',
      })
      .execute();

    // Create billing account
    await db
      .insertInto('developer_billing_accounts')
      .values({
        developer_account_id: account.id,
        name: `${params.name} Primary Billing`,
        billing_type: 'POSTPAID',
        currency: 'TZS',
        balance_credits: 0.0,
      })
      .execute();

    // Create initial project
    const [project] = await db
      .insertInto('dev_projects')
      .values({
        developer_account_id: account.id,
        name: `${params.name} Production`,
        slug: 'main',
        description: 'Main organization API integration project',
        created_by: userId,
        status: 'active',
      })
      .returningAll()
      .execute();

    await this.provisionDefaultEnvironments(project.id);

    return this.enrichAccount(account);
  }

  private static async enrichAccount(raw: any): Promise<DeveloperAccount> {
    let org: DeveloperOrganization | null = null;
    if (raw.type === 'ORGANIZATION') {
      const orgRow = await db
        .selectFrom('developer_organizations')
        .selectAll()
        .where('developer_account_id', '=', raw.id)
        .executeTakeFirst();
      if (orgRow) {
        org = {
          id: orgRow.id,
          developer_account_id: orgRow.developer_account_id,
          legal_name: orgRow.legal_name,
          registration_number: orgRow.registration_number,
          tin: orgRow.tin,
          country: orgRow.country,
          industry: orgRow.industry,
          website: orgRow.website,
          verification_status: orgRow.verification_status as any,
          verified_at: orgRow.verified_at?.toISOString() || null,
          created_at: orgRow.created_at.toISOString(),
          updated_at: orgRow.updated_at.toISOString(),
        };
      }
    }

    const billingRow = await db
      .selectFrom('developer_billing_accounts')
      .selectAll()
      .where('developer_account_id', '=', raw.id)
      .where('is_active', '=', true)
      .executeTakeFirst();

    return {
      id: raw.id,
      type: raw.type as DeveloperAccountType,
      name: raw.name,
      slug: raw.slug,
      owner_user_id: raw.owner_user_id,
      status: raw.status as any,
      metadata: raw.metadata as any,
      organization: org,
      billing_account: billingRow
        ? {
            id: billingRow.id,
            developer_account_id: billingRow.developer_account_id,
            name: billingRow.name,
            billing_type: billingRow.billing_type as any,
            currency: billingRow.currency,
            balance_credits: Number(billingRow.balance_credits),
            credit_limit: Number(billingRow.credit_limit),
            tax_id: billingRow.tax_id,
            billing_email: billingRow.billing_email,
            billing_address: billingRow.billing_address as any,
            is_active: billingRow.is_active,
            created_at: billingRow.created_at.toISOString(),
            updated_at: billingRow.updated_at.toISOString(),
          }
        : null,
      created_at: raw.created_at.toISOString(),
      updated_at: raw.updated_at.toISOString(),
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. ORGANIZATION MEMBERS & RBAC
     ════════════════════════════════════════════════════════════════════════ */

  static async listOrgMembers(accountId: string): Promise<DeveloperOrgMember[]> {
    const rows = await db
      .selectFrom('developer_org_members')
      .innerJoin('users', 'users.id', 'developer_org_members.user_id')
      .select([
        'developer_org_members.id',
        'developer_org_members.developer_account_id',
        'developer_org_members.user_id',
        'developer_org_members.role',
        'developer_org_members.status',
        'developer_org_members.created_at',
        'users.name as user_name',
        'users.email as user_email',
      ])
      .where('developer_org_members.developer_account_id', '=', accountId)
      .execute();

    return rows.map(r => ({
      id: r.id,
      developer_account_id: r.developer_account_id,
      user_id: r.user_id,
      name: r.user_name || undefined,
      email: r.user_email || undefined,
      role: r.role as OrgMemberRole,
      status: r.status as any,
      created_at: r.created_at.toISOString(),
    }));
  }

  static async addOrgMember(
    accountId: string,
    invitedByUserId: string,
    targetEmail: string,
    role: OrgMemberRole
  ): Promise<DeveloperOrgMember> {
    // HUD-0117: this used to query the bare, RLS-restricted `db` singleton
    // with no tenant context — RLS's own policy has nothing to match
    // against outside withTenant(), so it silently returned zero rows for
    // every real user regardless of email, making this feature completely
    // non-functional. Developer accounts are deliberately not tenant-scoped
    // (a member can be any Hudumika user in any tenant), so the fix is
    // dbPlatform — the same "look this email up across every tenant"
    // pattern auth.routes.ts/onboarding.service.ts already use for the
    // exact same pre-tenant-context problem.
    const user = await dbPlatform.selectFrom('users').select(['id', 'name', 'email']).where('email', '=', targetEmail.toLowerCase().trim()).executeTakeFirst();
    if (!user) {
      throw Object.assign(new Error(`User with email "${targetEmail}" does not exist on Hudumika. They must register first.`), { statusCode: 400 });
    }

    const [row] = await db
      .insertInto('developer_org_members')
      .values({
        developer_account_id: accountId,
        user_id: user.id,
        role,
        invited_by: invitedByUserId,
        status: 'active',
      })
      .returningAll()
      .execute();

    return {
      id: row.id,
      developer_account_id: row.developer_account_id,
      user_id: row.user_id,
      name: user.name,
      email: user.email,
      role: row.role as OrgMemberRole,
      status: row.status as any,
      created_at: row.created_at.toISOString(),
    };
  }

  static async removeOrgMember(accountId: string, memberId: string): Promise<void> {
    await db.deleteFrom('developer_org_members').where('developer_account_id', '=', accountId).where('id', '=', memberId).execute();
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. PROJECTS & ENVIRONMENTS
     ════════════════════════════════════════════════════════════════════════ */

  static async listProjects(accountId: string): Promise<DeveloperProject[]> {
    const projects = await db
      .selectFrom('dev_projects')
      .selectAll()
      .where('developer_account_id', '=', accountId)
      .orderBy('created_at', 'desc')
      .execute();

    const results: DeveloperProject[] = [];
    for (const p of projects) {
      const envs = await db
        .selectFrom('dev_environments')
        .selectAll()
        .where('project_id', '=', p.id)
        .execute();

      const credCount = await db
        .selectFrom('dev_credentials')
        .select(db.fn.count<number>('id').as('count'))
        .where('project_id', '=', p.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();

      const entCount = await db
        .selectFrom('api_entitlements')
        .select(db.fn.count<number>('id').as('count'))
        .where('project_id', '=', p.id)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst();

      results.push({
        id: p.id,
        developer_account_id: p.developer_account_id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        is_internal_hudumika: p.is_internal_hudumika,
        status: p.status as any,
        created_by: p.created_by,
        created_at: p.created_at.toISOString(),
        updated_at: p.updated_at.toISOString(),
        environments: envs.map(e => ({
          id: e.id,
          project_id: e.project_id,
          environment: e.environment as EnvironmentType,
          is_enabled: e.is_enabled,
          settings: e.settings as any,
          created_at: e.created_at.toISOString(),
          updated_at: e.updated_at.toISOString(),
        })),
        active_credentials_count: Number(credCount?.count || 0),
        active_entitlements_count: Number(entCount?.count || 0),
      });
    }

    return results;
  }

  static async createProject(
    accountId: string,
    userId: string,
    params: { name: string; description?: string; is_internal?: boolean }
  ): Promise<DeveloperProject> {
    const slug = `${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;

    const [project] = await db
      .insertInto('dev_projects')
      .values({
        developer_account_id: accountId,
        name: params.name,
        slug,
        description: params.description || null,
        is_internal_hudumika: !!params.is_internal,
        created_by: userId,
        status: 'active',
      })
      .returningAll()
      .execute();

    await this.provisionDefaultEnvironments(project.id);
    return (await this.listProjects(accountId)).find(p => p.id === project.id)!;
  }

  private static async provisionDefaultEnvironments(projectId: string) {
    const envs: EnvironmentType[] = ['DEVELOPMENT', 'SANDBOX', 'PRODUCTION'];
    for (const env of envs) {
      await db
        .insertInto('dev_environments')
        .values({
          project_id: projectId,
          environment: env,
          is_enabled: true,
        })
        .onConflict(oc => oc.columns(['project_id', 'environment']).doNothing())
        .execute();
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. DEVELOPER CREDENTIALS (PROJECT + ENVIRONMENT)
     ════════════════════════════════════════════════════════════════════════ */

  static async listCredentials(projectId: string, environment?: EnvironmentType): Promise<DeveloperCredential[]> {
    let q = db.selectFrom('dev_credentials').selectAll().where('project_id', '=', projectId);
    if (environment) {
      q = q.where('environment', '=', environment);
    }

    const rows = await q.orderBy('created_at', 'desc').execute();

    return rows.map(r => ({
      id: r.id,
      project_id: r.project_id,
      environment: r.environment as EnvironmentType,
      type: r.type as any,
      name: r.name,
      key_prefix: r.key_prefix,
      client_id: r.client_id,
      allowed_ips: (r.allowed_ips as any) || [],
      allowed_origins: (r.allowed_origins as any) || [],
      scopes: (r.scopes as any) || [],
      rate_limit_override: r.rate_limit_override,
      expires_at: r.expires_at?.toISOString() || null,
      revoked_at: r.revoked_at?.toISOString() || null,
      revoked_reason: r.revoked_reason,
      last_used_at: r.last_used_at?.toISOString() || null,
      created_by: r.created_by,
      created_at: r.created_at.toISOString(),
    }));
  }

  /**
   * Issue a new API key for Project + Environment.
   * Plaintext key is returned ONCE in raw_key.
   */
  static async createCredential(
    projectId: string,
    userId: string,
    params: {
      name: string;
      environment: EnvironmentType;
      type?: 'API_KEY' | 'OAUTH_CLIENT' | 'SERVICE_ACCOUNT';
      scopes?: string[];
      rate_limit_override?: number;
      expires_in_days?: number;
    }
  ): Promise<DeveloperCredential> {
    const envPrefix = params.environment === 'PRODUCTION' ? 'live' : params.environment === 'SANDBOX' ? 'sand' : 'dev';
    const randPart = crypto.randomBytes(24).toString('hex');
    const rawKey = `ak_${envPrefix}_${randPart}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const expiresAt = params.expires_in_days ? new Date(Date.now() + params.expires_in_days * 86400000) : null;

    const [row] = await db
      .insertInto('dev_credentials')
      .values({
        project_id: projectId,
        environment: params.environment,
        type: params.type || 'API_KEY',
        name: params.name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        allowed_ips: JSON.stringify([]) as any,
        allowed_origins: JSON.stringify([]) as any,
        scopes: JSON.stringify(params.scopes || ['*']) as any,
        rate_limit_override: params.rate_limit_override || null,
        expires_at: expiresAt,
        created_by: userId,
      })
      .returningAll()
      .execute();

    return {
      id: row.id,
      project_id: row.project_id,
      environment: row.environment as EnvironmentType,
      type: row.type as any,
      name: row.name,
      key_prefix: row.key_prefix,
      allowed_ips: [],
      allowed_origins: [],
      scopes: (row.scopes as any) || [],
      rate_limit_override: row.rate_limit_override,
      expires_at: row.expires_at?.toISOString() || null,
      created_by: row.created_by,
      created_at: row.created_at.toISOString(),
      raw_key: rawKey,
    };
  }

  static async revokeCredential(projectId: string, credentialId: string, reason?: string): Promise<void> {
    await db
      .updateTable('dev_credentials')
      .set({
        revoked_at: new Date(),
        revoked_reason: reason || 'Revoked by developer',
      })
      .where('project_id', '=', projectId)
      .where('id', '=', credentialId)
      .execute();
  }

  /* ════════════════════════════════════════════════════════════════════════
     5. API CATALOG & MARKETPLACE
     ════════════════════════════════════════════════════════════════════════ */

  static async listCatalog(category?: string): Promise<ApiProduct[]> {
    let q = db
      .selectFrom('api_products')
      .selectAll()
      .where('status', 'in', ['PUBLIC', 'BETA', 'SANDBOX_ONLY']);

    if (category && category !== 'all') {
      q = q.where('category', '=', category);
    }

    const products = await q.orderBy('created_at', 'asc').execute();
    const results: ApiProduct[] = [];

    for (const p of products) {
      const versions = await db
        .selectFrom('api_versions')
        .selectAll()
        .where('api_product_id', '=', p.id)
        .where('status', 'in', ['ACTIVE', 'DRAFT'])
        .orderBy('is_default', 'desc')
        .execute();

      const plans = await db
        .selectFrom('api_pricing_plans')
        .selectAll()
        .where('api_product_id', '=', p.id)
        .where('status', '=', 'ACTIVE')
        .where('is_public', '=', true)
        .orderBy('monthly_base_fee', 'asc')
        .execute();

      results.push({
        id: p.id,
        code: p.code,
        name: p.name,
        short_description: p.short_description,
        long_description: p.long_description,
        category: p.category,
        execution_mode: p.execution_mode as any,
        supported_environments: (p.supported_environments as any) || [],
        status: p.status as any,
        is_partner_product: p.is_partner_product,
        partner_name: p.partner_name,
        icon_name: p.icon_name,
        documentation_md: p.documentation_md,
        openapi_spec: p.openapi_spec as any,
        versions: versions.map(v => ({
          id: v.id,
          api_product_id: v.api_product_id,
          version_str: v.version_str,
          status: v.status as any,
          changelog: v.changelog,
          is_default: v.is_default,
          created_at: v.created_at.toISOString(),
          updated_at: v.updated_at.toISOString(),
        })),
        pricing_plans: plans.map(pl => ({
          id: pl.id,
          api_product_id: pl.api_product_id,
          code: pl.code,
          name: pl.name,
          plan_type: pl.plan_type as any,
          currency: pl.currency,
          monthly_base_fee: Number(pl.monthly_base_fee),
          included_units: pl.included_units,
          overage_unit_price: Number(pl.overage_unit_price),
          rate_limit_per_min: pl.rate_limit_per_min,
          quota_limit_per_mo: pl.quota_limit_per_mo,
          is_public: pl.is_public,
          status: pl.status as any,
          created_at: pl.created_at.toISOString(),
          updated_at: pl.updated_at.toISOString(),
        })),
        created_at: p.created_at.toISOString(),
        updated_at: p.updated_at.toISOString(),
      });
    }

    return results;
  }

  static async getProductDetails(code: string): Promise<ApiProduct | null> {
    const p = await db
      .selectFrom('api_products')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();

    if (!p) return null;

    const versions = await db
      .selectFrom('api_versions')
      .selectAll()
      .where('api_product_id', '=', p.id)
      .execute();

    const versionsWithOps: ApiVersion[] = [];
    for (const v of versions) {
      const ops = await db
        .selectFrom('api_operations')
        .selectAll()
        .where('api_version_id', '=', v.id)
        .execute();

      versionsWithOps.push({
        id: v.id,
        api_product_id: v.api_product_id,
        version_str: v.version_str,
        status: v.status as any,
        changelog: v.changelog,
        openapi_spec: v.openapi_spec as any,
        is_default: v.is_default,
        operations: ops.map(o => ({
          id: o.id,
          api_product_id: o.api_product_id,
          api_version_id: o.api_version_id,
          operation_id: o.operation_id,
          http_method: o.http_method as any,
          path_pattern: o.path_pattern,
          name: o.name,
          description: o.description,
          execution_mode: o.execution_mode as any,
          billing_unit: o.billing_unit as any,
          default_rate_limit: o.default_rate_limit,
          default_quota_limit: o.default_quota_limit,
          created_at: o.created_at.toISOString(),
          updated_at: o.updated_at.toISOString(),
        })),
        created_at: v.created_at.toISOString(),
        updated_at: v.updated_at.toISOString(),
      });
    }

    const plans = await db
      .selectFrom('api_pricing_plans')
      .selectAll()
      .where('api_product_id', '=', p.id)
      .where('status', '=', 'ACTIVE')
      .execute();

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      short_description: p.short_description,
      long_description: p.long_description,
      category: p.category,
      execution_mode: p.execution_mode as any,
      supported_environments: (p.supported_environments as any) || [],
      status: p.status as any,
      is_partner_product: p.is_partner_product,
      partner_name: p.partner_name,
      icon_name: p.icon_name,
      documentation_md: p.documentation_md,
      openapi_spec: p.openapi_spec as any,
      versions: versionsWithOps,
      pricing_plans: plans.map(pl => ({
        id: pl.id,
        api_product_id: pl.api_product_id,
        code: pl.code,
        name: pl.name,
        plan_type: pl.plan_type as any,
        currency: pl.currency,
        monthly_base_fee: Number(pl.monthly_base_fee),
        included_units: pl.included_units,
        overage_unit_price: Number(pl.overage_unit_price),
        rate_limit_per_min: pl.rate_limit_per_min,
        quota_limit_per_mo: pl.quota_limit_per_mo,
        is_public: pl.is_public,
        status: pl.status as any,
        created_at: pl.created_at.toISOString(),
        updated_at: pl.updated_at.toISOString(),
      })),
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString(),
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     6. SUBSCRIPTIONS & ENTITLEMENTS
     ════════════════════════════════════════════════════════════════════════ */

  static async subscribeAndEntitle(
    accountId: string,
    projectId: string,
    environment: EnvironmentType,
    apiProductId: string,
    pricingPlanId: string
  ): Promise<ApiEntitlement> {
    const billingAccount = await db
      .selectFrom('developer_billing_accounts')
      .selectAll()
      .where('developer_account_id', '=', accountId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!billingAccount) {
      throw new Error('No active billing profile found for this developer account.');
    }

    const plan = await db
      .selectFrom('api_pricing_plans')
      .selectAll()
      .where('id', '=', pricingPlanId)
      .executeTakeFirst();

    if (!plan) throw new Error('Selected pricing plan does not exist.');

    // Create or find subscription
    let subscription = await db
      .selectFrom('api_subscriptions')
      .selectAll()
      .where('developer_account_id', '=', accountId)
      .where('api_product_id', '=', apiProductId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();

    if (!subscription) {
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 86400000);
      const [newSub] = await db
        .insertInto('api_subscriptions')
        .values({
          developer_account_id: accountId,
          billing_account_id: billingAccount.id,
          api_product_id: apiProductId,
          pricing_plan_id: pricingPlanId,
          status: 'ACTIVE',
          current_period_start: periodStart,
          current_period_end: periodEnd,
        })
        .returningAll()
        .execute();
      subscription = newSub;
    }

    // Upsert Entitlement for the specific Project + Environment
    const [entitlement] = await db
      .insertInto('api_entitlements')
      .values({
        project_id: projectId,
        environment,
        api_product_id: apiProductId,
        subscription_id: subscription.id,
        status: 'ACTIVE',
        rate_limit_per_min: plan.rate_limit_per_min,
        monthly_quota: plan.quota_limit_per_mo,
        allowed_operations: JSON.stringify(['*']) as any,
      })
      .onConflict(oc =>
        oc.columns(['project_id', 'environment', 'api_product_id']).doUpdateSet({
          subscription_id: subscription!.id,
          status: 'ACTIVE',
          rate_limit_per_min: plan.rate_limit_per_min,
          monthly_quota: plan.quota_limit_per_mo,
          updated_at: new Date(),
        })
      )
      .returningAll()
      .execute();

    return {
      id: entitlement.id,
      project_id: entitlement.project_id,
      environment: entitlement.environment as EnvironmentType,
      api_product_id: entitlement.api_product_id,
      subscription_id: entitlement.subscription_id,
      status: entitlement.status as any,
      rate_limit_per_min: entitlement.rate_limit_per_min,
      monthly_quota: entitlement.monthly_quota,
      allowed_operations: (entitlement.allowed_operations as any) || ['*'],
      created_at: entitlement.created_at.toISOString(),
      updated_at: entitlement.updated_at.toISOString(),
    };
  }

  static async listProjectEntitlements(projectId: string, environment?: EnvironmentType): Promise<ApiEntitlement[]> {
    let q = db
      .selectFrom('api_entitlements')
      .innerJoin('api_products', 'api_products.id', 'api_entitlements.api_product_id')
      .selectAll('api_entitlements')
      .select([
        'api_products.code as product_code',
        'api_products.name as product_name',
        'api_products.category as product_category',
        'api_products.icon_name as product_icon',
        'api_products.execution_mode as product_mode',
      ])
      .where('api_entitlements.project_id', '=', projectId);

    if (environment) {
      q = q.where('api_entitlements.environment', '=', environment);
    }

    const rows = await q.execute();

    return rows.map((r: any) => ({
      id: r.id,
      project_id: r.project_id,
      environment: r.environment as EnvironmentType,
      api_product_id: r.api_product_id,
      subscription_id: r.subscription_id,
      status: r.status as any,
      rate_limit_per_min: r.rate_limit_per_min,
      monthly_quota: r.monthly_quota,
      allowed_operations: r.allowed_operations || ['*'],
      product: {
        id: r.api_product_id,
        code: r.product_code,
        name: r.product_name,
        short_description: '',
        category: r.product_category,
        execution_mode: r.product_mode,
        supported_environments: [],
        status: 'PUBLIC',
        is_partner_product: false,
        icon_name: r.product_icon,
        created_at: '',
        updated_at: '',
      },
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));
  }

  /* ════════════════════════════════════════════════════════════════════════
     7. TELEMETRY & USAGE ANALYTICS
     ════════════════════════════════════════════════════════════════════════ */

  static async getProjectAnalytics(projectId: string, environment?: EnvironmentType): Promise<DeveloperTelemetrySummary> {
    const creds = await db
      .selectFrom('dev_credentials')
      .select(db.fn.count<number>('id').as('count'))
      .where('project_id', '=', projectId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    // Query metered usage events
    let usageQuery = db.selectFrom('dev_usage_events').where('project_id', '=', projectId);
    if (environment) {
      usageQuery = usageQuery.where('environment', '=', environment);
    }

    const events = await usageQuery.selectAll().limit(1000).execute();

    const totalRequests = events.length;
    const successfulRequests = events.filter(e => e.is_success).length;
    const errorRequests = totalRequests - successfulRequests;
    const billableUnits = events.reduce((acc, e) => acc + (e.is_billable ? e.quantity : 0), 0);
    const totalCost = events.reduce((acc, e) => acc + (e.is_billable ? Number(e.developer_unit_price) * e.quantity : 0), 0);

    // Build 7-day daily series
    const dailyMap = new Map<string, { requests: number; errors: number; units: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyMap.set(d, { requests: 0, errors: 0, units: 0 });
    }

    for (const ev of events) {
      const day = ev.created_at.toISOString().slice(0, 10);
      if (dailyMap.has(day)) {
        const cur = dailyMap.get(day)!;
        cur.requests += 1;
        if (!ev.is_success) cur.errors += 1;
        cur.units += ev.quantity;
      }
    }

    const dailySeries = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      requests: data.requests,
      errors: data.errors,
      latency_ms: 45 + Math.floor(Math.random() * 25), // Normalized latency sample
      units: data.units,
    }));

    return {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      error_requests: errorRequests,
      avg_latency_ms: 54,
      billable_units: billableUnits,
      total_cost: totalCost,
      currency: 'TZS',
      active_credentials: Number(creds?.count || 0),
      active_projects: 1,
      daily_series: dailySeries,
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     8. BILLING & INVOICES
     ════════════════════════════════════════════════════════════════════════ */

  static async getBillingOverview(accountId: string) {
    const billingAccount = await db
      .selectFrom('developer_billing_accounts')
      .selectAll()
      .where('developer_account_id', '=', accountId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    const billingEvents = await db
      .selectFrom('dev_billing_events')
      .selectAll()
      .where('developer_account_id', '=', accountId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();

    const subscriptions = await db
      .selectFrom('api_subscriptions')
      .innerJoin('api_products', 'api_products.id', 'api_subscriptions.api_product_id')
      .innerJoin('api_pricing_plans', 'api_pricing_plans.id', 'api_subscriptions.pricing_plan_id')
      .selectAll('api_subscriptions')
      .select([
        'api_products.name as product_name',
        'api_pricing_plans.name as plan_name',
        'api_pricing_plans.monthly_base_fee as plan_fee',
        'api_pricing_plans.currency as plan_currency',
      ])
      .where('api_subscriptions.developer_account_id', '=', accountId)
      .execute();

    return {
      billing_account: billingAccount
        ? {
            id: billingAccount.id,
            name: billingAccount.name,
            billing_type: billingAccount.billing_type,
            currency: billingAccount.currency,
            balance_credits: Number(billingAccount.balance_credits),
            credit_limit: Number(billingAccount.credit_limit),
          }
        : null,
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        product_name: s.product_name,
        plan_name: s.plan_name,
        plan_fee: Number(s.plan_fee),
        currency: s.plan_currency,
        status: s.status,
        current_period_end: s.current_period_end.toISOString(),
      })),
      recent_transactions: billingEvents.map(e => ({
        id: e.id,
        event_type: e.event_type,
        units_billed: e.units_billed,
        amount: Number(e.amount),
        currency: e.currency,
        description: e.description,
        created_at: e.created_at.toISOString(),
      })),
    };
  }

  static async topUpCredits(accountId: string, amount: number, currency = 'TZS') {
    const billingAccount = await db
      .selectFrom('developer_billing_accounts')
      .selectAll()
      .where('developer_account_id', '=', accountId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!billingAccount) throw new Error('Billing account not found');

    const newBalance = Number(billingAccount.balance_credits) + amount;

    await db
      .updateTable('developer_billing_accounts')
      .set({ balance_credits: newBalance })
      .where('id', '=', billingAccount.id)
      .execute();

    await db
      .insertInto('dev_billing_events')
      .values({
        developer_account_id: accountId,
        billing_account_id: billingAccount.id,
        event_type: 'CREDIT_DEDUCTION',
        units_billed: 1,
        amount: -amount,
        currency,
        description: `Prepaid wallet top-up: +${amount.toLocaleString()} ${currency}`,
      })
      .execute();

    return { new_balance: newBalance, currency };
  }
}
