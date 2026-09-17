import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { NotificationService } from './notification.service.js';
import { emitDomainEvent } from './domain-events.service.js';
import { recordRevision } from './cms-revisions.service.js';
import { CMSWebhooksService } from './cms-webhooks.service.js';
import { callAI } from '../routes/ai.routes.js';
import type {
  CmsSite, CreateCmsSiteInput, UpdateCmsSiteInput,
  CmsWorkflowState, CmsWorkflowTransition, CreateCmsWorkflowStateInput, UpdateCmsWorkflowStateInput, CreateCmsWorkflowTransitionInput,
  CmsApproval, RequestCmsApprovalInput, DecideCmsApprovalInput,
  CmsRelease, CmsReleaseItem, CreateCmsReleaseInput, UpdateCmsReleaseInput, AddCmsReleaseItemInput,
  CmsContentComment, CreateCmsContentCommentInput, UpdateCmsContentCommentInput,
  TranslateContentInput,
} from '@hudumika/types';

export class CMSEnterpriseService {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Multisite (§23)
  // ───────────────────────────────────────────────────────────────────────────

  static async listSites(tenantId: string): Promise<CmsSite[]> {
    return await withTenant(tenantId, async (trx) => {
      const existing = await trx
        .selectFrom('cms_sites')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('is_default', 'desc')
        .orderBy('name', 'asc')
        .execute();

      if (existing.length === 0) {
        const [seeded] = await trx
          .insertInto('cms_sites')
          .values({
            tenant_id: tenantId,
            slug: 'default',
            name: 'Default Site',
            is_default: true,
            settings: '{}',
          })
          .returningAll()
          .execute();
        return [{
          id: seeded.id,
          tenant_id: seeded.tenant_id,
          slug: seeded.slug,
          name: seeded.name,
          domain: seeded.domain,
          is_default: seeded.is_default,
          settings: typeof seeded.settings === 'string' ? JSON.parse(seeded.settings) : (seeded.settings as Record<string, unknown>),
          created_at: seeded.created_at.toISOString(),
          updated_at: seeded.updated_at.toISOString(),
        }];
      }

      return existing.map(s => ({
        id: s.id,
        tenant_id: s.tenant_id,
        slug: s.slug,
        name: s.name,
        domain: s.domain,
        is_default: s.is_default,
        settings: typeof s.settings === 'string' ? JSON.parse(s.settings) : (s.settings as Record<string, unknown>),
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      }));
    });
  }

  static async getSite(tenantId: string, siteId: string): Promise<CmsSite | null> {
    return await withTenant(tenantId, async (trx) => {
      const s = await trx
        .selectFrom('cms_sites')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', siteId)
        .executeTakeFirst();
      if (!s) return null;
      return {
        id: s.id,
        tenant_id: s.tenant_id,
        slug: s.slug,
        name: s.name,
        domain: s.domain,
        is_default: s.is_default,
        settings: typeof s.settings === 'string' ? JSON.parse(s.settings) : (s.settings as Record<string, unknown>),
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      };
    });
  }

  // A genuinely cross-tenant lookup by design (see CLAUDE.md's own
  // dbPlatform carve-out): the caller is an anonymous visitor whose request
  // domain hasn't been resolved to a tenant yet — there is no tenant_id to
  // scope a withTenant() call by. The bare `db` singleton this used to read
  // through has no app.tenant_id session variable set, so cms_sites' own
  // FORCEd RLS policy silently filtered every row out — a real, live-
  // reproduced bug (every /sites/resolve call 404'd regardless of a
  // genuinely matching site), not merely a style nit.
  static async resolveSite(filter: { domain?: string; slug?: string; tenantId?: string }): Promise<CmsSite | null> {
    let q = dbPlatform.selectFrom('cms_sites').selectAll();
    if (filter.domain) {
      q = q.where('domain', '=', filter.domain.trim().toLowerCase());
    } else if (filter.slug && filter.tenantId) {
      q = q.where('tenant_id', '=', filter.tenantId).where('slug', '=', filter.slug.trim().toLowerCase());
    } else {
      return null;
    }
    const s = await q.executeTakeFirst();
    if (!s) return null;
    return {
      id: s.id,
      tenant_id: s.tenant_id,
      slug: s.slug,
      name: s.name,
      domain: s.domain,
      is_default: s.is_default,
      settings: typeof s.settings === 'string' ? JSON.parse(s.settings) : (s.settings as Record<string, unknown>),
      created_at: s.created_at.toISOString(),
      updated_at: s.updated_at.toISOString(),
    };
  }

  static async createSite(tenantId: string, input: CreateCmsSiteInput): Promise<CmsSite> {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!slug) throw new Error('Site slug is required');

    return await withTenant(tenantId, async (trx) => {
      if (input.is_default) {
        await trx
          .updateTable('cms_sites')
          .set({ is_default: false })
          .where('tenant_id', '=', tenantId)
          .execute();
      }

      const [row] = await trx
        .insertInto('cms_sites')
        .values({
          tenant_id: tenantId,
          slug,
          name: input.name.trim(),
          domain: input.domain ? input.domain.trim().toLowerCase() : null,
          is_default: !!input.is_default,
          settings: JSON.stringify(input.settings ?? {}),
        })
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        slug: row.slug,
        name: row.name,
        domain: row.domain,
        is_default: row.is_default,
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings as Record<string, unknown>),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async updateSite(tenantId: string, siteId: string, input: UpdateCmsSiteInput): Promise<CmsSite> {
    return await withTenant(tenantId, async (trx) => {
      const existing = await trx
        .selectFrom('cms_sites')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', siteId)
        .executeTakeFirst();
      if (!existing) throw new Error('Site not found');

      if (input.is_default) {
        await trx
          .updateTable('cms_sites')
          .set({ is_default: false })
          .where('tenant_id', '=', tenantId)
          .where('id', '!=', siteId)
          .execute();
      }

      const updates: any = { updated_at: new Date() };
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.domain !== undefined) updates.domain = input.domain ? input.domain.trim().toLowerCase() : null;
      if (input.is_default !== undefined) updates.is_default = input.is_default;
      if (input.settings !== undefined) updates.settings = JSON.stringify(input.settings);

      const [row] = await trx
        .updateTable('cms_sites')
        .set(updates)
        .where('tenant_id', '=', tenantId)
        .where('id', '=', siteId)
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        slug: row.slug,
        name: row.name,
        domain: row.domain,
        is_default: row.is_default,
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings as Record<string, unknown>),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async deleteSite(tenantId: string, siteId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const site = await trx
        .selectFrom('cms_sites')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', siteId)
        .executeTakeFirst();
      if (!site) throw new Error('Site not found');
      if (site.is_default) throw new Error('Cannot delete the default site');

      await trx
        .deleteFrom('cms_sites')
        .where('tenant_id', '=', tenantId)
        .where('id', '=', siteId)
        .execute();
    });
  }

  static async setDefaultSite(tenantId: string, siteId: string): Promise<CmsSite> {
    return await this.updateSite(tenantId, siteId, { is_default: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Configurable Workflow (§15)
  // ───────────────────────────────────────────────────────────────────────────

  static async ensureDefaultWorkflow(tenantId: string, siteId?: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('cms_workflow_states')
        .select('id')
        .where('tenant_id', '=', tenantId);
      if (siteId) q = q.where('site_id', '=', siteId);
      const existing = await q.executeTakeFirst();

      if (existing) return;

      const states = [
        { slug: 'draft', name: 'Draft', color: '#64748b', sort_order: 10, is_initial: true, is_published: false },
        { slug: 'in_review', name: 'In Review', color: '#f59e0b', sort_order: 20, is_initial: false, is_published: false },
        { slug: 'approved', name: 'Approved', color: '#10b981', sort_order: 30, is_initial: false, is_published: false },
        { slug: 'scheduled', name: 'Scheduled', color: '#0ea5e9', sort_order: 40, is_initial: false, is_published: false },
        { slug: 'published', name: 'Published', color: '#0d9488', sort_order: 50, is_initial: false, is_published: true },
        { slug: 'archived', name: 'Archived', color: '#475569', sort_order: 60, is_initial: false, is_published: false },
        { slug: 'trash', name: 'Trash', color: '#ef4444', sort_order: 70, is_initial: false, is_published: false },
      ];

      const inserted = await trx
        .insertInto('cms_workflow_states')
        .values(states.map(s => ({ ...s, tenant_id: tenantId, site_id: siteId ?? null })))
        .returningAll()
        .execute();

      const bySlug = new Map(inserted.map(s => [s.slug, s.id]));

      const transitions = [
        { from: 'draft', to: 'in_review', name: 'Submit for Review', requires_approval: true },
        { from: 'in_review', to: 'approved', name: 'Approve Content', requires_approval: false },
        { from: 'in_review', to: 'draft', name: 'Reject to Draft', requires_approval: false },
        { from: 'approved', to: 'scheduled', name: 'Schedule Publish', requires_approval: false },
        { from: 'approved', to: 'published', name: 'Publish Live', requires_approval: false },
        { from: 'draft', to: 'published', name: 'Direct Publish (Admin)', requires_approval: false },
        { from: 'published', to: 'archived', name: 'Archive', requires_approval: false },
        { from: 'draft', to: 'trash', name: 'Move to Trash', requires_approval: false },
        { from: 'in_review', to: 'trash', name: 'Move to Trash', requires_approval: false },
        { from: 'approved', to: 'trash', name: 'Move to Trash', requires_approval: false },
        { from: 'published', to: 'trash', name: 'Move to Trash', requires_approval: false },
        { from: 'trash', to: 'draft', name: 'Restore to Draft', requires_approval: false },
      ];

      for (const t of transitions) {
        const fromId = bySlug.get(t.from);
        const toId = bySlug.get(t.to);
        if (fromId && toId) {
          await trx
            .insertInto('cms_workflow_transitions')
            .values({
              tenant_id: tenantId,
              site_id: siteId ?? null,
              from_state_id: fromId,
              to_state_id: toId,
              name: t.name,
              allowed_roles: '[]',
              requires_approval: t.requires_approval,
            })
            .execute();
        }
      }
    });
  }

  static async seedDefaultWorkflow(tenantId: string, siteId?: string): Promise<{ ok: boolean }> {
    await this.ensureDefaultWorkflow(tenantId, siteId);
    return { ok: true };
  }

  static async listWorkflowStates(tenantId: string, siteId?: string): Promise<CmsWorkflowState[]> {
    await this.ensureDefaultWorkflow(tenantId, siteId);
    return await withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('cms_workflow_states')
        .selectAll()
        .where('tenant_id', '=', tenantId);
      if (siteId) q = q.where('site_id', '=', siteId);
      const rows = await q.orderBy('sort_order', 'asc').execute();

      return rows.map(r => ({
        id: r.id,
        tenant_id: r.tenant_id,
        site_id: r.site_id,
        slug: r.slug,
        name: r.name,
        color: r.color,
        sort_order: r.sort_order,
        is_initial: r.is_initial,
        is_published: r.is_published,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      }));
    });
  }

  static async createWorkflowState(tenantId: string, input: CreateCmsWorkflowStateInput): Promise<CmsWorkflowState> {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    return await withTenant(tenantId, async (trx) => {
      if (input.is_initial) {
        await trx.updateTable('cms_workflow_states').set({ is_initial: false }).where('tenant_id', '=', tenantId).execute();
      }

      const [row] = await trx
        .insertInto('cms_workflow_states')
        .values({
          tenant_id: tenantId,
          site_id: input.site_id ?? null,
          slug,
          name: input.name.trim(),
          color: input.color || '#64748b',
          sort_order: input.sort_order ?? 0,
          is_initial: !!input.is_initial,
          is_published: !!input.is_published,
        })
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        site_id: row.site_id,
        slug: row.slug,
        name: row.name,
        color: row.color,
        sort_order: row.sort_order,
        is_initial: row.is_initial,
        is_published: row.is_published,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async updateWorkflowState(tenantId: string, stateId: string, input: UpdateCmsWorkflowStateInput): Promise<CmsWorkflowState> {
    return await withTenant(tenantId, async (trx) => {
      const updates: any = { updated_at: new Date() };
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.color !== undefined) updates.color = input.color;
      if (input.sort_order !== undefined) updates.sort_order = input.sort_order;
      if (input.site_id !== undefined) updates.site_id = input.site_id;
      if (input.is_initial !== undefined) {
        if (input.is_initial) {
          await trx.updateTable('cms_workflow_states').set({ is_initial: false }).where('tenant_id', '=', tenantId).execute();
        }
        updates.is_initial = input.is_initial;
      }
      if (input.is_published !== undefined) updates.is_published = input.is_published;

      const [row] = await trx
        .updateTable('cms_workflow_states')
        .set(updates)
        .where('tenant_id', '=', tenantId)
        .where('id', '=', stateId)
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        site_id: row.site_id,
        slug: row.slug,
        name: row.name,
        color: row.color,
        sort_order: row.sort_order,
        is_initial: row.is_initial,
        is_published: row.is_published,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async deleteWorkflowState(tenantId: string, stateId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const state = await trx
        .selectFrom('cms_workflow_states')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', stateId)
        .executeTakeFirst();
      if (!state) throw new Error('State not found');
      if (['draft', 'published', 'trash'].includes(state.slug)) {
        throw new Error(`Cannot delete core state "${state.slug}"`);
      }
      await trx.deleteFrom('cms_workflow_states').where('tenant_id', '=', tenantId).where('id', '=', stateId).execute();
    });
  }

  static async listWorkflowTransitions(tenantId: string, siteId?: string): Promise<CmsWorkflowTransition[]> {
    await this.ensureDefaultWorkflow(tenantId, siteId);
    return await withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('cms_workflow_transitions')
        .selectAll()
        .where('tenant_id', '=', tenantId);
      if (siteId) q = q.where('site_id', '=', siteId);
      const rows = await q.execute();

      const states = await trx.selectFrom('cms_workflow_states').selectAll().where('tenant_id', '=', tenantId).execute();
      const stateMap = new Map(states.map(s => [s.id, {
        id: s.id,
        tenant_id: s.tenant_id,
        site_id: s.site_id,
        slug: s.slug,
        name: s.name,
        color: s.color,
        sort_order: s.sort_order,
        is_initial: s.is_initial,
        is_published: s.is_published,
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      }]));

      return rows.map(r => ({
        id: r.id,
        tenant_id: r.tenant_id,
        site_id: r.site_id,
        from_state_id: r.from_state_id,
        to_state_id: r.to_state_id,
        name: r.name,
        allowed_roles: Array.isArray(r.allowed_roles) ? r.allowed_roles : JSON.parse(r.allowed_roles || '[]'),
        requires_approval: r.requires_approval,
        created_at: r.created_at.toISOString(),
        from_state: stateMap.get(r.from_state_id),
        to_state: stateMap.get(r.to_state_id),
      }));
    });
  }

  static async createWorkflowTransition(tenantId: string, input: CreateCmsWorkflowTransitionInput): Promise<CmsWorkflowTransition> {
    return await withTenant(tenantId, async (trx) => {
      const [row] = await trx
        .insertInto('cms_workflow_transitions')
        .values({
          tenant_id: tenantId,
          site_id: input.site_id ?? null,
          from_state_id: input.from_state_id,
          to_state_id: input.to_state_id,
          name: input.name ? input.name.trim() : null,
          allowed_roles: JSON.stringify(input.allowed_roles ?? (input.required_role ? [input.required_role] : [])),
          requires_approval: !!input.require_approval || !!input.requires_approval,
        })
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        site_id: row.site_id,
        from_state_id: row.from_state_id,
        to_state_id: row.to_state_id,
        name: row.name,
        allowed_roles: Array.isArray(row.allowed_roles) ? row.allowed_roles : JSON.parse(row.allowed_roles || '[]'),
        requires_approval: row.requires_approval,
        created_at: row.created_at.toISOString(),
      };
    });
  }

  static async deleteWorkflowTransition(tenantId: string, transitionId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx.deleteFrom('cms_workflow_transitions').where('tenant_id', '=', tenantId).where('id', '=', transitionId).execute();
    });
  }

  static async validateTransition(
    tenantId: string,
    fromStateId: string,
    toStateId: string,
    userRole: string,
    siteId?: string
  ): Promise<{ allowed: boolean; reason?: string; requires_approval?: boolean }> {
    return await withTenant(tenantId, async (trx) => {
      if (['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
        return { allowed: true };
      }

      let q = trx
        .selectFrom('cms_workflow_transitions')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('from_state_id', '=', fromStateId)
        .where('to_state_id', '=', toStateId);
      if (siteId) q = q.where('site_id', '=', siteId);

      const transition = await q.executeTakeFirst();
      if (!transition) {
        return { allowed: false, reason: 'No valid workflow transition exists between these states.' };
      }

      const allowedRoles: string[] = Array.isArray(transition.allowed_roles)
        ? transition.allowed_roles
        : JSON.parse(transition.allowed_roles || '[]');

      if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
        return { allowed: false, reason: `Role ${userRole} is not permitted to perform this transition.` };
      }

      return { allowed: true, requires_approval: transition.requires_approval };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Approvals (§16)
  // ───────────────────────────────────────────────────────────────────────────

  static async listReviewers(tenantId: string): Promise<Array<{ id: string; name: string; email: string; role: string }>> {
    return await withTenant(tenantId, async (trx) => {
      const users = await trx
        .selectFrom('users')
        .select(['id', 'name', 'email', 'role'])
        .where('tenant_id', '=', tenantId)
        .where('active', '=', true)
        .orderBy('name', 'asc')
        .execute();

      return users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }));
    });
  }

  static async requestApproval(tenantId: string, requesterId: string, input: RequestCmsApprovalInput): Promise<CmsApproval> {
    return await withTenant(tenantId, async (trx) => {
      let resourceTitle = 'Untitled';
      if (input.resource_type === 'page') {
        const page = await trx.selectFrom('cms_pages').select(['id', 'title']).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).executeTakeFirst();
        if (!page) throw new Error('Page not found');
        resourceTitle = page.title;
        await trx.updateTable('cms_pages').set({ status: 'in_review', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).execute();
      } else if (input.resource_type === 'post') {
        const post = await trx.selectFrom('cms_posts').select(['id', 'title']).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).executeTakeFirst();
        if (!post) throw new Error('Post not found');
        resourceTitle = post.title;
        await trx.updateTable('cms_posts').set({ status: 'in_review', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).execute();
      } else if (input.resource_type === 'entry') {
        const entry = await trx.selectFrom('cms_content_entries').select(['id', 'title']).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).executeTakeFirst();
        if (!entry) throw new Error('Content entry not found');
        resourceTitle = entry.title;
        await trx.updateTable('cms_content_entries').set({ status: 'in_review', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).execute();
      }

      const [row] = await trx
        .insertInto('cms_approvals')
        .values({
          tenant_id: tenantId,
          resource_type: input.resource_type,
          resource_id: input.resource_id,
          assigned_to: input.assigned_to,
          assigned_by: requesterId,
          status: 'pending',
          due_date: input.due_date ? new Date(input.due_date) : null,
          decision_note: input.note ?? null,
        })
        .returningAll()
        .execute();

      NotificationService.createNotification({
        tenantId,
        userId: input.assigned_to,
        app: 'onesite',
        type: 'action_required',
        title: 'CMS Content Review Requested',
        message: `You were assigned to review "${resourceTitle}" (${input.resource_type}).`,
        link: `/cms?v=${input.resource_type === 'page' ? 'pages' : input.resource_type === 'post' ? 'posts' : 'content'}`,
        entityType: 'cms_approval',
        entityId: row.id,
        entityLabel: resourceTitle,
      }).catch(err => console.error('[Approval notification error]', err));

      emitDomainEvent(trx, tenantId, {
        type: 'cms.approval_requested',
        sourceApp: 'onesite',
        entityType: 'cms_approval',
        entityId: row.id,
        payload: { resource_type: input.resource_type, resource_id: input.resource_id, assigned_to: input.assigned_to, title: resourceTitle },
        actorId: requesterId,
      }).catch(console.error);

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        resource_type: row.resource_type as any,
        resource_id: row.resource_id,
        assigned_to: row.assigned_to,
        assigned_by: row.assigned_by,
        status: row.status as any,
        due_date: row.due_date ? row.due_date.toISOString() : null,
        decision_at: row.decision_at ? row.decision_at.toISOString() : null,
        decision_note: row.decision_note,
        resource_title: resourceTitle,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async listApprovals(tenantId: string, filter?: { resource_type?: string; resource_id?: string; assigned_to?: string; status?: string }): Promise<CmsApproval[]> {
    return await withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('cms_approvals as a')
        .leftJoin('users as reviewer', (join) => join.on(sql`reviewer.id`, '=', sql`a.assigned_to::uuid`))
        .leftJoin('users as requester', (join) => join.on(sql`requester.id`, '=', sql`a.assigned_by::uuid`))
        .select([
          'a.id', 'a.tenant_id', 'a.resource_type', 'a.resource_id', 'a.assigned_to', 'a.assigned_by',
          'a.status', 'a.due_date', 'a.decision_at', 'a.decision_note', 'a.created_at', 'a.updated_at',
          'reviewer.name as reviewer_name',
          'requester.name as requester_name',
        ])
        .where('a.tenant_id', '=', tenantId);

      if (filter?.resource_type) q = q.where('a.resource_type', '=', filter.resource_type);
      if (filter?.resource_id) q = q.where('a.resource_id', '=', filter.resource_id);
      if (filter?.assigned_to) q = q.where('a.assigned_to', '=', filter.assigned_to);
      if (filter?.status) q = q.where('a.status', '=', filter.status);

      const rows = await q.orderBy('a.created_at', 'desc').execute();

      return rows.map(r => ({
        id: r.id,
        tenant_id: r.tenant_id,
        resource_type: r.resource_type as any,
        resource_id: r.resource_id,
        assigned_to: r.assigned_to,
        assigned_to_name: r.reviewer_name || null,
        assigned_by: r.assigned_by,
        assigned_by_name: r.requester_name || null,
        status: r.status as any,
        due_date: r.due_date ? r.due_date.toISOString() : null,
        decision_at: r.decision_at ? r.decision_at.toISOString() : null,
        decision_note: r.decision_note,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      }));
    });
  }

  static async decideApproval(tenantId: string, approvalId: string, reviewerId: string, reviewerRole: string, input: DecideCmsApprovalInput): Promise<CmsApproval> {
    return await withTenant(tenantId, async (trx) => {
      const approval = await trx
        .selectFrom('cms_approvals')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', approvalId)
        .executeTakeFirst();
      if (!approval) throw new Error('Approval request not found');
      // HUD-0128: reviewerId was accepted but never checked against
      // approval.assigned_to — any authenticated staff member, not just the
      // assigned reviewer, could approve or reject a review request that
      // wasn't theirs. Live-reproduced before this guard existed.
      if (approval.assigned_to !== reviewerId && !['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(reviewerRole)) {
        throw new Error('Only the assigned reviewer or an admin can decide this approval');
      }
      if (approval.status !== 'pending') throw new Error(`Approval is already ${approval.status}`);

      const nextStatus = input.decision === 'approved' ? 'approved' : 'draft';

      if (approval.resource_type === 'page') {
        await trx.updateTable('cms_pages').set({ status: nextStatus, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', approval.resource_id).execute();
      } else if (approval.resource_type === 'post') {
        await trx.updateTable('cms_posts').set({ status: nextStatus, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', approval.resource_id).execute();
      } else if (approval.resource_type === 'entry') {
        await trx.updateTable('cms_content_entries').set({ status: nextStatus, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', approval.resource_id).execute();
      }

      const [row] = await trx
        .updateTable('cms_approvals')
        .set({
          status: input.decision,
          decision_at: new Date(),
          decision_note: input.note ?? null,
          updated_at: new Date(),
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', approvalId)
        .returningAll()
        .execute();

      if (approval.assigned_by) {
        NotificationService.createNotification({
          tenantId,
          userId: approval.assigned_by,
          app: 'onesite',
          type: input.decision === 'approved' ? 'success' : 'warning',
          title: `CMS Content ${input.decision === 'approved' ? 'Approved' : 'Rejected'}`,
          message: `Your ${approval.resource_type} was ${input.decision}${input.note ? `: "${input.note}"` : '.'}`,
          link: `/cms?v=${approval.resource_type === 'page' ? 'pages' : approval.resource_type === 'post' ? 'posts' : 'content'}`,
          entityType: 'cms_approval',
          entityId: row.id,
        }).catch(console.error);
      }

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        resource_type: row.resource_type as any,
        resource_id: row.resource_id,
        assigned_to: row.assigned_to,
        assigned_by: row.assigned_by,
        status: row.status as any,
        due_date: row.due_date ? row.due_date.toISOString() : null,
        decision_at: row.decision_at ? row.decision_at.toISOString() : null,
        decision_note: row.decision_note,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async cancelApproval(tenantId: string, approvalId: string, userId: string, userRole: string): Promise<CmsApproval> {
    return await withTenant(tenantId, async (trx) => {
      const approval = await trx
        .selectFrom('cms_approvals')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', approvalId)
        .executeTakeFirst();
      if (!approval) throw new Error('Approval not found');
      // HUD-0128: userId was accepted but never checked against
      // approval.assigned_by — any authenticated staff member, not just
      // whoever requested the review, could cancel it out from under them.
      // Also never checked the approval was still pending, so an
      // already-decided approval could be silently forced back to draft.
      if (approval.assigned_by !== userId && !['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
        throw new Error('Only the requester or an admin can cancel this approval');
      }
      if (approval.status !== 'pending') throw new Error(`Approval is already ${approval.status}`);

      const [row] = await trx
        .updateTable('cms_approvals')
        .set({
          status: 'cancelled',
          decision_at: new Date(),
          decision_note: 'Cancelled by user',
          updated_at: new Date(),
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', approvalId)
        .returningAll()
        .execute();

      // Reset item to draft
      if (approval.resource_type === 'page') {
        await trx.updateTable('cms_pages').set({ status: 'draft', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', approval.resource_id).execute();
      } else if (approval.resource_type === 'post') {
        await trx.updateTable('cms_posts').set({ status: 'draft', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', approval.resource_id).execute();
      } else if (approval.resource_type === 'entry') {
        await trx.updateTable('cms_content_entries').set({ status: 'draft', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', approval.resource_id).execute();
      }

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        resource_type: row.resource_type as any,
        resource_id: row.resource_id,
        assigned_to: row.assigned_to,
        assigned_by: row.assigned_by,
        status: row.status as any,
        due_date: row.due_date ? row.due_date.toISOString() : null,
        decision_at: row.decision_at ? row.decision_at.toISOString() : null,
        decision_note: row.decision_note,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Content Releases (§18)
  // ───────────────────────────────────────────────────────────────────────────

  static async listReleases(tenantId: string, filter?: { site_id?: string; status?: string }): Promise<CmsRelease[]> {
    return await withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('cms_releases as r')
        .leftJoin('cms_release_items as i', 'i.release_id', 'r.id')
        .select([
          'r.id', 'r.tenant_id', 'r.site_id', 'r.name', 'r.description', 'r.status',
          'r.publish_at', 'r.published_at', 'r.created_by', 'r.created_at', 'r.updated_at',
          sql<number>`count(i.id)::int`.as('item_count'),
        ])
        .where('r.tenant_id', '=', tenantId);

      if (filter?.site_id) q = q.where('r.site_id', '=', filter.site_id);
      if (filter?.status) q = q.where('r.status', '=', filter.status);

      const rows = await q
        .groupBy(['r.id', 'r.tenant_id', 'r.site_id', 'r.name', 'r.description', 'r.status', 'r.publish_at', 'r.published_at', 'r.created_by', 'r.created_at', 'r.updated_at'])
        .orderBy('r.created_at', 'desc')
        .execute();

      return rows.map(r => ({
        id: r.id,
        tenant_id: r.tenant_id,
        site_id: r.site_id,
        name: r.name,
        description: r.description,
        status: r.status as any,
        publish_at: r.publish_at ? r.publish_at.toISOString() : null,
        published_at: r.published_at ? r.published_at.toISOString() : null,
        created_by: r.created_by,
        item_count: r.item_count,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      }));
    });
  }

  // Reads a release + its resolved items against a transaction the CALLER
  // already holds open, rather than starting a new one. withTenant() always
  // opens a genuinely separate Postgres transaction/connection — calling it
  // a second time from *inside* an already-open withTenant callback (as
  // publishRelease used to, via getRelease) cannot see that outer
  // transaction's own not-yet-committed writes under Postgres's default
  // READ COMMITTED isolation. Live-reproduced: publishRelease's own HTTP
  // response reported every item and the release itself still "draft"
  // immediately after a publish that had, underneath, genuinely succeeded
  // (the writes really did land, once the outer transaction closed — only
  // the response describing them was stale). getRelease (below) is now a
  // thin wrapper opening its own transaction for a normal standalone read;
  // publishRelease calls this helper directly with its own open `trx`.
  private static async buildReleaseDetail(trx: any, tenantId: string, releaseId: string): Promise<CmsRelease | null> {
    const r = await trx
      .selectFrom('cms_releases')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', releaseId)
      .executeTakeFirst();
    if (!r) return null;

    const items = await trx
      .selectFrom('cms_release_items')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('release_id', '=', releaseId)
      .execute();

    const resolvedItems: CmsReleaseItem[] = [];
    for (const item of items) {
      let title = 'Untitled';
      let slug = '';
      let currentStatus = 'draft';
      if (item.resource_type === 'page') {
        const p = await trx.selectFrom('cms_pages').select(['title', 'slug', 'status']).where('tenant_id', '=', tenantId).where('id', '=', item.resource_id).executeTakeFirst();
        if (p) { title = p.title; slug = p.slug; currentStatus = p.status; }
      } else if (item.resource_type === 'post') {
        const p = await trx.selectFrom('cms_posts').select(['title', 'slug', 'status']).where('tenant_id', '=', tenantId).where('id', '=', item.resource_id).executeTakeFirst();
        if (p) { title = p.title; slug = p.slug; currentStatus = p.status; }
      } else if (item.resource_type === 'entry') {
        const e = await trx.selectFrom('cms_content_entries').select(['title', 'slug', 'status']).where('tenant_id', '=', tenantId).where('id', '=', item.resource_id).executeTakeFirst();
        if (e) { title = e.title; slug = e.slug; currentStatus = e.status; }
      }

      resolvedItems.push({
        id: item.id,
        tenant_id: item.tenant_id,
        release_id: item.release_id,
        resource_type: item.resource_type as any,
        resource_id: item.resource_id,
        target_status: item.target_status,
        title,
        slug,
        current_status: currentStatus,
        created_at: item.created_at.toISOString(),
      });
    }

    return {
      id: r.id,
      tenant_id: r.tenant_id,
      site_id: r.site_id,
      name: r.name,
      description: r.description,
      status: r.status as any,
      publish_at: r.publish_at ? r.publish_at.toISOString() : null,
      published_at: r.published_at ? r.published_at.toISOString() : null,
      created_by: r.created_by,
      item_count: resolvedItems.length,
      items: resolvedItems,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    };
  }

  static async getRelease(tenantId: string, releaseId: string): Promise<CmsRelease | null> {
    return await withTenant(tenantId, async (trx) => this.buildReleaseDetail(trx, tenantId, releaseId));
  }

  static async createRelease(tenantId: string, userId: string, input: CreateCmsReleaseInput): Promise<CmsRelease> {
    return await withTenant(tenantId, async (trx) => {
      const [row] = await trx
        .insertInto('cms_releases')
        .values({
          tenant_id: tenantId,
          site_id: input.site_id ?? null,
          name: input.name.trim(),
          description: input.description ? input.description.trim() : null,
          status: input.publish_at ? 'scheduled' : 'draft',
          publish_at: input.publish_at ? new Date(input.publish_at) : null,
          created_by: userId,
        })
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        site_id: row.site_id,
        name: row.name,
        description: row.description,
        status: row.status as any,
        publish_at: row.publish_at ? row.publish_at.toISOString() : null,
        published_at: row.published_at ? row.published_at.toISOString() : null,
        created_by: row.created_by,
        item_count: 0,
        items: [],
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async updateRelease(tenantId: string, releaseId: string, input: UpdateCmsReleaseInput): Promise<CmsRelease> {
    return await withTenant(tenantId, async (trx) => {
      const updates: any = { updated_at: new Date() };
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.description !== undefined) updates.description = input.description ? input.description.trim() : null;
      if (input.site_id !== undefined) updates.site_id = input.site_id;
      if (input.publish_at !== undefined) {
        updates.publish_at = input.publish_at ? new Date(input.publish_at) : null;
        if (input.publish_at) updates.status = 'scheduled';
      }

      await trx
        .updateTable('cms_releases')
        .set(updates)
        .where('tenant_id', '=', tenantId)
        .where('id', '=', releaseId)
        .execute();

      const updated = await this.buildReleaseDetail(trx, tenantId, releaseId);
      if (!updated) throw new Error('Release not found');
      return updated;
    });
  }

  static async deleteRelease(tenantId: string, releaseId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx.deleteFrom('cms_releases').where('tenant_id', '=', tenantId).where('id', '=', releaseId).execute();
    });
  }

  static async addReleaseItem(tenantId: string, releaseId: string, input: AddCmsReleaseItemInput): Promise<CmsReleaseItem> {
    return await withTenant(tenantId, async (trx) => {
      const [row] = await trx
        .insertInto('cms_release_items')
        .values({
          tenant_id: tenantId,
          release_id: releaseId,
          resource_type: input.resource_type,
          resource_id: input.resource_id,
          target_status: input.target_status || 'published',
        })
        .onConflict((oc) => oc.columns(['release_id', 'resource_type', 'resource_id']).doUpdateSet({ target_status: input.target_status || 'published' }))
        .returningAll()
        .execute();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        release_id: row.release_id,
        resource_type: row.resource_type as any,
        resource_id: row.resource_id,
        target_status: row.target_status,
        created_at: row.created_at.toISOString(),
      };
    });
  }

  static async removeReleaseItem(tenantId: string, releaseId: string, itemId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('cms_release_items')
        .where('tenant_id', '=', tenantId)
        .where('release_id', '=', releaseId)
        .where('id', '=', itemId)
        .execute();
    });
  }

  static async publishRelease(tenantId: string, releaseId: string, userId: string): Promise<CmsRelease> {
    return await withTenant(tenantId, async (trx) => {
      const release = await trx
        .selectFrom('cms_releases')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', releaseId)
        .executeTakeFirst();
      if (!release) throw new Error('Release not found');
      if (release.status === 'published') throw new Error('Release is already published');

      const items = await trx
        .selectFrom('cms_release_items')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('release_id', '=', releaseId)
        .execute();

      for (const item of items) {
        if (item.resource_type === 'page') {
          await trx
            .updateTable('cms_pages')
            .set({ status: item.target_status, publish_at: null, updated_at: new Date() })
            .where('tenant_id', '=', tenantId)
            .where('id', '=', item.resource_id)
            .execute();
          const page = await trx.selectFrom('cms_pages').selectAll().where('tenant_id', '=', tenantId).where('id', '=', item.resource_id).executeTakeFirst();
          if (page) {
            await recordRevision(trx, tenantId, 'page', item.resource_id, page as any, userId).catch(console.error);
            if (item.target_status === 'published') {
              CMSWebhooksService.dispatchEvent(tenantId, 'page.published', { id: page.id, slug: page.slug, title: page.title });
            }
          }
        } else if (item.resource_type === 'post') {
          await trx
            .updateTable('cms_posts')
            .set({ status: item.target_status, publish_at: null, updated_at: new Date() })
            .where('tenant_id', '=', tenantId)
            .where('id', '=', item.resource_id)
            .execute();
          const post = await trx.selectFrom('cms_posts').selectAll().where('tenant_id', '=', tenantId).where('id', '=', item.resource_id).executeTakeFirst();
          if (post) {
            await recordRevision(trx, tenantId, 'post', item.resource_id, post as any, userId).catch(console.error);
            if (item.target_status === 'published') {
              CMSWebhooksService.dispatchEvent(tenantId, 'post.published', { id: post.id, slug: post.slug, title: post.title });
            }
          }
        } else if (item.resource_type === 'entry') {
          await trx
            .updateTable('cms_content_entries')
            .set({ status: item.target_status, publish_at: null, updated_at: new Date() })
            .where('tenant_id', '=', tenantId)
            .where('id', '=', item.resource_id)
            .execute();
          const entry = await trx.selectFrom('cms_content_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', item.resource_id).executeTakeFirst();
          if (entry) {
            await recordRevision(trx, tenantId, 'entry', item.resource_id, entry as any, userId).catch(console.error);
            if (item.target_status === 'published') {
              CMSWebhooksService.dispatchEvent(tenantId, 'entry.published', { id: entry.id, slug: entry.slug, title: entry.title });
            }
          }
        }
      }

      await trx
        .updateTable('cms_releases')
        .set({
          status: 'published',
          published_at: new Date(),
          updated_at: new Date(),
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', releaseId)
        .execute();

      emitDomainEvent(trx, tenantId, {
        type: 'cms.release_published',
        sourceApp: 'onesite',
        entityType: 'cms_release',
        entityId: releaseId,
        payload: { release_id: releaseId, items_count: items.length, name: release.name },
        actorId: userId,
      }).catch(console.error);

      const updated = await this.buildReleaseDetail(trx, tenantId, releaseId);
      if (!updated) throw new Error('Release not found');
      return updated;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Editorial Collaboration Comments (§19–20)
  // ───────────────────────────────────────────────────────────────────────────

  static async listContentComments(tenantId: string, resourceType: string, resourceId: string, resolved?: boolean): Promise<CmsContentComment[]> {
    return await withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('cms_content_comments as c')
        .leftJoin('users as author', (join) => join.on(sql`author.id`, '=', sql`c.author_id::uuid`))
        .leftJoin('users as resolver', (join) => join.on(sql`resolver.id`, '=', sql`c.resolved_by::uuid`))
        .select([
          'c.id', 'c.tenant_id', 'c.resource_type', 'c.resource_id', 'c.author_id',
          'c.parent_id', 'c.content', 'c.block_id', 'c.resolved', 'c.resolved_by',
          'c.resolved_at', 'c.created_at', 'c.updated_at',
          'author.name as author_name',
          'resolver.name as resolved_by_name',
        ])
        .where('c.tenant_id', '=', tenantId)
        .where('c.resource_type', '=', resourceType)
        .where('c.resource_id', '=', resourceId);

      if (resolved !== undefined) {
        q = q.where('c.resolved', '=', resolved);
      }

      const rows = await q.orderBy('c.created_at', 'asc').execute();

      const topLevel: CmsContentComment[] = [];
      const repliesMap = new Map<string, CmsContentComment[]>();

      for (const r of rows) {
        const comment: CmsContentComment = {
          id: r.id,
          tenant_id: r.tenant_id,
          resource_type: r.resource_type as any,
          resource_id: r.resource_id,
          author_id: r.author_id,
          author_name: r.author_name || null,
          parent_id: r.parent_id,
          content: r.content,
          block_id: r.block_id,
          resolved: r.resolved,
          resolved_by: r.resolved_by,
          resolved_by_name: r.resolved_by_name || null,
          resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null,
          replies: [],
          created_at: r.created_at.toISOString(),
          updated_at: r.updated_at.toISOString(),
        };

        if (r.parent_id) {
          const list = repliesMap.get(r.parent_id) || [];
          list.push(comment);
          repliesMap.set(r.parent_id, list);
        } else {
          topLevel.push(comment);
        }
      }

      for (const t of topLevel) {
        t.replies = repliesMap.get(t.id) || [];
      }

      return topLevel;
    });
  }

  static async addContentComment(tenantId: string, authorId: string, input: CreateCmsContentCommentInput): Promise<CmsContentComment> {
    return await withTenant(tenantId, async (trx) => {
      const [row] = await trx
        .insertInto('cms_content_comments')
        .values({
          tenant_id: tenantId,
          resource_type: input.resource_type,
          resource_id: input.resource_id,
          author_id: authorId,
          parent_id: input.parent_id ?? null,
          content: input.content.trim(),
          block_id: input.block_id ?? null,
        })
        .returningAll()
        .execute();

      const user = await trx.selectFrom('users').select('name').where('id', '=', authorId).executeTakeFirst();

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        resource_type: row.resource_type as any,
        resource_id: row.resource_id,
        author_id: row.author_id,
        author_name: user?.name || null,
        parent_id: row.parent_id,
        content: row.content,
        block_id: row.block_id,
        resolved: row.resolved,
        resolved_by: null,
        resolved_by_name: null,
        resolved_at: null,
        replies: [],
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async createContentComment(tenantId: string, authorId: string, input: CreateCmsContentCommentInput): Promise<CmsContentComment> {
    return await this.addContentComment(tenantId, authorId, input);
  }

  static async updateContentComment(tenantId: string, commentId: string, userId: string, userRole: string, input: UpdateCmsContentCommentInput): Promise<CmsContentComment> {
    return await withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('cms_content_comments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', commentId).executeTakeFirst();
      if (!existing) throw new Error('Comment not found');
      // HUD-0128: userId was accepted but never checked against
      // existing.author_id — any authenticated staff member could edit or
      // mark-resolved someone else's editorial review comment.
      if (existing.author_id !== userId && !['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
        throw new Error('Only the comment author or an admin can edit this comment');
      }

      const updates: any = { updated_at: new Date() };
      if (input.content !== undefined) updates.content = input.content.trim();
      if (input.is_resolved !== undefined || input.resolved !== undefined) {
        const isResolved = input.is_resolved ?? input.resolved;
        updates.resolved = isResolved;
        updates.resolved_by = isResolved ? userId : null;
        updates.resolved_at = isResolved ? new Date() : null;
      }

      const [row] = await trx
        .updateTable('cms_content_comments')
        .set(updates)
        .where('tenant_id', '=', tenantId)
        .where('id', '=', commentId)
        .returningAll()
        .execute();

      const user = await trx.selectFrom('users').select('name').where('id', '=', row.author_id).executeTakeFirst();
      const resolver = row.resolved_by ? await trx.selectFrom('users').select('name').where('id', '=', row.resolved_by).executeTakeFirst() : null;

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        resource_type: row.resource_type as any,
        resource_id: row.resource_id,
        author_id: row.author_id,
        author_name: user?.name || null,
        parent_id: row.parent_id,
        content: row.content,
        block_id: row.block_id,
        resolved: row.resolved,
        resolved_by: row.resolved_by,
        resolved_by_name: resolver?.name || null,
        resolved_at: row.resolved_at ? row.resolved_at.toISOString() : null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  static async deleteContentComment(tenantId: string, commentId: string, userId: string, userRole: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const comment = await trx.selectFrom('cms_content_comments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', commentId).executeTakeFirst();
      if (!comment) throw new Error('Comment not found');
      // HUD-0128: same missing author-or-admin check as updateContentComment.
      if (comment.author_id !== userId && !['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
        throw new Error('Only the comment author or an admin can delete this comment');
      }
      await trx.deleteFrom('cms_content_comments').where('tenant_id', '=', tenantId).where('id', '=', commentId).execute();
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Localization & AI Translation Workflow (§25–26)
  // ───────────────────────────────────────────────────────────────────────────

  static async listTranslations(tenantId: string, resourceType: 'page' | 'post' | 'entry', translationGroupId: string): Promise<{ locale: string; id: string; title: string; status: string; updated_at: string }[]> {
    return await withTenant(tenantId, async (trx) => {
      if (resourceType === 'page') {
        const rows = await trx.selectFrom('cms_pages').select(['id', 'locale', 'title', 'status', 'updated_at']).where('tenant_id', '=', tenantId).where('translation_group_id', '=', translationGroupId).execute();
        return rows.map(r => ({ locale: r.locale, id: r.id, title: r.title, status: r.status, updated_at: r.updated_at.toISOString() }));
      } else if (resourceType === 'post') {
        const rows = await trx.selectFrom('cms_posts').select(['id', 'locale', 'title', 'status', 'updated_at']).where('tenant_id', '=', tenantId).where('translation_group_id', '=', translationGroupId).execute();
        return rows.map(r => ({ locale: r.locale, id: r.id, title: r.title, status: r.status, updated_at: r.updated_at.toISOString() }));
      } else {
        const rows = await trx.selectFrom('cms_content_entries').select(['id', 'locale', 'title', 'status', 'updated_at']).where('tenant_id', '=', tenantId).where('translation_group_id', '=', translationGroupId).execute();
        return rows.map(r => ({ locale: r.locale, id: r.id, title: r.title, status: r.status, updated_at: r.updated_at.toISOString() }));
      }
    });
  }

  static async listTranslationGroup(tenantId: string, translationGroupId: string): Promise<any> {
    return await withTenant(tenantId, async (trx) => {
      const pages = await trx.selectFrom('cms_pages').select(['id', 'locale', 'title', 'status', 'slug', 'updated_at']).where('tenant_id', '=', tenantId).where('translation_group_id', '=', translationGroupId).execute();
      const posts = await trx.selectFrom('cms_posts').select(['id', 'locale', 'title', 'status', 'slug', 'updated_at']).where('tenant_id', '=', tenantId).where('translation_group_id', '=', translationGroupId).execute();
      const entries = await trx.selectFrom('cms_content_entries').select(['id', 'locale', 'title', 'status', 'slug', 'updated_at']).where('tenant_id', '=', tenantId).where('translation_group_id', '=', translationGroupId).execute();

      return {
        translation_group_id: translationGroupId,
        pages: pages.map(p => ({ ...p, type: 'page', updated_at: p.updated_at.toISOString() })),
        posts: posts.map(p => ({ ...p, type: 'post', updated_at: p.updated_at.toISOString() })),
        entries: entries.map(e => ({ ...e, type: 'entry', updated_at: e.updated_at.toISOString() })),
      };
    });
  }

  static async linkTranslation(tenantId: string, input: { resource_type: string; resource_id: string; translation_group_id: string; locale: string }): Promise<{ ok: boolean }> {
    return await withTenant(tenantId, async (trx) => {
      if (input.resource_type === 'page') {
        await trx.updateTable('cms_pages').set({ translation_group_id: input.translation_group_id, locale: input.locale, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).execute();
      } else if (input.resource_type === 'post') {
        await trx.updateTable('cms_posts').set({ translation_group_id: input.translation_group_id, locale: input.locale, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).execute();
      } else if (input.resource_type === 'entry') {
        await trx.updateTable('cms_content_entries').set({ translation_group_id: input.translation_group_id, locale: input.locale, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).execute();
      }
      return { ok: true };
    });
  }

  static async translateContent(tenantId: string, userId: string, input: TranslateContentInput): Promise<{ id: string; locale: string; title: string; status: string }> {
    const targetLocale = input.target_locale.trim().toLowerCase();
    const targetLanguageName = targetLocale === 'sw' ? 'Swahili' : targetLocale === 'fr' ? 'French' : targetLocale === 'pt' ? 'Portuguese' : targetLocale === 'en' ? 'English' : targetLocale;

    const settings = await withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
      return (row?.settings as any) ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      throw new Error('AI is not configured. Please configure an Anthropic API Key in Settings > Integrations > AI Integration.');
    }

    return await withTenant(tenantId, async (trx) => {
      if (input.resource_type === 'page') {
        const page = await trx.selectFrom('cms_pages').selectAll().where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).executeTakeFirst();
        if (!page) throw new Error('Page not found');

        const prompt = `Translate the following web page title, HTML content, and SEO description into fluent, natural ${targetLanguageName}. Preserve all HTML tags and structural markup exactly.
Respond ONLY with a valid JSON object matching this schema:
{
  "title": "Translated title",
  "content": "<p>Translated HTML...</p>",
  "seo_description": "Translated SEO description"
}

TITLE: ${page.title}
SEO DESCRIPTION: ${page.seo_description || ''}
CONTENT:
${page.content || ''}`;

        const messages = [{ role: 'user', content: prompt }];
        const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic', messages, 2048, 0.2);
        let parsed: any;
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
          throw new Error('AI translation response could not be parsed.');
        }

        const newSlug = `${page.slug}-${targetLocale}`;

        const existingTrans = await trx
          .selectFrom('cms_pages')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .where('translation_group_id', '=', page.translation_group_id)
          .where('locale', '=', targetLocale)
          .executeTakeFirst();

        let resRow: any;
        if (existingTrans) {
          [resRow] = await trx
            .updateTable('cms_pages')
            .set({
              title: parsed.title || page.title,
              content: parsed.content || page.content,
              seo_description: parsed.seo_description || page.seo_description,
              status: 'draft',
              updated_at: new Date(),
            })
            .where('tenant_id', '=', tenantId)
            .where('id', '=', existingTrans.id)
            .returningAll()
            .execute();
        } else {
          [resRow] = await trx
            .insertInto('cms_pages')
            .values({
              tenant_id: tenantId,
              site_id: page.site_id,
              slug: newSlug,
              title: parsed.title || page.title,
              content: parsed.content || page.content,
              seo_description: parsed.seo_description || page.seo_description,
              template: page.template,
              status: 'draft',
              author_id: userId,
              locale: targetLocale,
              translation_group_id: page.translation_group_id,
            })
            .returningAll()
            .execute();
        }

        await recordRevision(trx, tenantId, 'page', resRow.id, resRow as any, userId).catch(console.error);

        return {
          id: resRow.id,
          locale: resRow.locale,
          title: resRow.title,
          status: resRow.status,
        };
      } else if (input.resource_type === 'post') {
        const post = await trx.selectFrom('cms_posts').selectAll().where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).executeTakeFirst();
        if (!post) throw new Error('Post not found');

        const prompt = `Translate the following blog post title, HTML content, category, tags, and SEO description into fluent, natural ${targetLanguageName}. Preserve all HTML tags.
Respond ONLY with a valid JSON object matching this schema:
{
  "title": "Translated title",
  "content": "<p>Translated HTML...</p>",
  "category": "Translated category",
  "tags": "tag1, tag2",
  "seo_description": "Translated SEO description"
}

TITLE: ${post.title}
CATEGORY: ${post.category || ''}
TAGS: ${post.tags || ''}
SEO DESCRIPTION: ${post.seo_description || ''}
CONTENT:
${post.content || ''}`;

        const messages = [{ role: 'user', content: prompt }];
        const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic', messages, 2048, 0.2);
        let parsed: any;
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
          throw new Error('AI translation response could not be parsed.');
        }

        const newSlug = `${post.slug}-${targetLocale}`;

        const existingTrans = await trx
          .selectFrom('cms_posts')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .where('translation_group_id', '=', post.translation_group_id)
          .where('locale', '=', targetLocale)
          .executeTakeFirst();

        let resRow: any;
        if (existingTrans) {
          [resRow] = await trx
            .updateTable('cms_posts')
            .set({
              title: parsed.title || post.title,
              content: parsed.content || post.content,
              category: parsed.category || post.category,
              tags: parsed.tags || post.tags,
              seo_description: parsed.seo_description || post.seo_description,
              status: 'draft',
              updated_at: new Date(),
            })
            .where('tenant_id', '=', tenantId)
            .where('id', '=', existingTrans.id)
            .returningAll()
            .execute();
        } else {
          [resRow] = await trx
            .insertInto('cms_posts')
            .values({
              tenant_id: tenantId,
              site_id: post.site_id,
              slug: newSlug,
              title: parsed.title || post.title,
              content: parsed.content || post.content,
              category: parsed.category || post.category,
              tags: parsed.tags || post.tags,
              seo_description: parsed.seo_description || post.seo_description,
              status: 'draft',
              author_id: userId,
              locale: targetLocale,
              translation_group_id: post.translation_group_id,
            })
            .returningAll()
            .execute();
        }

        await recordRevision(trx, tenantId, 'post', resRow.id, resRow as any, userId).catch(console.error);

        return {
          id: resRow.id,
          locale: resRow.locale,
          title: resRow.title,
          status: resRow.status,
        };
      } else {
        const entry = await trx.selectFrom('cms_content_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', input.resource_id).executeTakeFirst();
        if (!entry) throw new Error('Content entry not found');

        const prompt = `Translate the following content entry title, data JSON fields, and SEO description into fluent, natural ${targetLanguageName}. Keep JSON structure intact.
Respond ONLY with a valid JSON object matching this schema:
{
  "title": "Translated title",
  "data": { ...translated fields... },
  "seo_description": "Translated SEO description"
}

TITLE: ${entry.title}
SEO DESCRIPTION: ${entry.seo_description || ''}
DATA:
${JSON.stringify(entry.data, null, 2)}`;

        const messages = [{ role: 'user', content: prompt }];
        const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic', messages, 2048, 0.2);
        let parsed: any;
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
          throw new Error('AI translation response could not be parsed.');
        }

        const newSlug = `${entry.slug}-${targetLocale}`;

        const existingTrans = await trx
          .selectFrom('cms_content_entries')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .where('translation_group_id', '=', entry.translation_group_id)
          .where('locale', '=', targetLocale)
          .executeTakeFirst();

        let resRow: any;
        if (existingTrans) {
          [resRow] = await trx
            .updateTable('cms_content_entries')
            .set({
              title: parsed.title || entry.title,
              data: parsed.data ? JSON.stringify(parsed.data) : entry.data,
              seo_description: parsed.seo_description || entry.seo_description,
              status: 'draft',
              updated_at: new Date(),
            })
            .where('tenant_id', '=', tenantId)
            .where('id', '=', existingTrans.id)
            .returningAll()
            .execute();
        } else {
          [resRow] = await trx
            .insertInto('cms_content_entries')
            .values({
              tenant_id: tenantId,
              site_id: entry.site_id,
              model_id: entry.model_id,
              slug: newSlug,
              title: parsed.title || entry.title,
              data: parsed.data ? JSON.stringify(parsed.data) : entry.data,
              seo_description: parsed.seo_description || entry.seo_description,
              status: 'draft',
              author_id: userId,
              locale: targetLocale,
              translation_group_id: entry.translation_group_id,
            })
            .returningAll()
            .execute();
        }

        await recordRevision(trx, tenantId, 'entry', resRow.id, resRow as any, userId).catch(console.error);

        return {
          id: resRow.id,
          locale: resRow.locale,
          title: resRow.title,
          status: resRow.status,
        };
      }
    });
  }
}
