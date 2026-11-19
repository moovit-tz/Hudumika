import { loadStaffContext } from '../services/staff-access.service.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { dbPlatform } from '../db/client.js';
import {
  PROVIDERS, type Provider, listIntegrations, testConnection,
  createExternalIssue, notifySlack, latestBuild,
} from '../services/lens-integration.service.js';
import { preflight } from '../services/lens-preflight.service.js';
import {
  PROVIDER_CAPABILITIES, testConnectionInstance, pushToExternalTracker,
} from '../services/lens-adapters.service.js';
import {
  encryptLensCredential, decryptLensCredential,
} from '../services/lens-crypto.service.js';
import { ingestWebhook } from '../services/lens-inbox.service.js';
import { emitLensOutboxEvent, processLensOutbox } from '../services/lens-outbox.service.js';
import {
  createSnapshot, getSnapshotContent, prepareSnapshotRestore,
} from '../services/lens-snapshot.service.js';
import { intakeReport } from '../services/lens-intake.service.js';
import type { LensProvider } from '@hudumika/types';

/**
 * Lens — the internal developer and engineering management system.
 *
 * Platform data, not tenant data.
 * Access to Lens engineering management is restricted to SUPER_ADMIN.
 * Defect reporting intake (POST /reports) is open to any authenticated user
 * in their active application session.
 * Incoming webhook endpoints (POST /webhooks/:provider) are open and signature-verified.
 */

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK' | 'EPIC';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK', 'EPIC'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'];
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const CONFIDENCES: Confidence[] = ['CONFIRMED', 'SUSPECTED', 'UNVERIFIED'];
const CLOSED: Status[] = ['DONE', 'WONTFIX'];

function validate(body: any, partial: boolean): string | null {
  if ((!partial || body.kind !== undefined) && !KINDS.includes(body.kind)) {
    return `kind must be one of ${KINDS.join(', ')}`;
  }
  if ((!partial || body.title !== undefined) && !String(body.title ?? '').trim()) {
    return 'title is required';
  }
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return `status must be one of ${STATUSES.join(', ')}`;
  }
  if (body.severity !== undefined && !SEVERITIES.includes(body.severity)) {
    return `severity must be one of ${SEVERITIES.join(', ')}`;
  }
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    return `priority must be one of ${PRIORITIES.join(', ')}`;
  }
  if (body.confidence !== undefined && !CONFIDENCES.includes(body.confidence)) {
    return `confidence must be one of ${CONFIDENCES.join(', ')}`;
  }
  if (CLOSED.includes(body.status) && !String(body.resolution ?? '').trim()) {
    return 'A resolution is required to close an item — how was it settled?';
  }
  return null;
}

const asJson = (v: unknown, fallback: unknown[]) =>
  JSON.stringify(Array.isArray(v) ? v : fallback);

const LENS_CYCLE_STATUSES = ['PLANNING', 'ACTIVE', 'CLOSED'] as const;
const cycleCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(LENS_CYCLE_STATUSES).optional(),
});
const cyclePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(LENS_CYCLE_STATUSES).optional(),
});

export async function lensRoutes(fastify: FastifyInstance) {
  // Single comprehensive security preHandler hook
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Webhooks are public endpoints (signature verified inside handler)
    if (request.url.includes('/webhooks/')) {
      return;
    }

    // 2. Authenticate all other endpoints
    await fastify.authenticate(request, reply);
    if (reply.sent) return;

    // 3. Reporting intake is open to any authenticated user in any app
    if (request.url.endsWith('/reports') && request.method === 'POST') {
      return;
    }
    if (request.url.endsWith('/reports/mine') && request.method === 'GET') {
      return;
    }

    // 4. All other Lens routes are SUPER_ADMIN only, except that platform
    //    staff granted `lens.view` (staff console, migration 919) may read.
    //    Writes stay SUPER_ADMIN-only; staff link cases through /v1/staff.
    if (request.user?.role !== 'SUPER_ADMIN') {
      if (request.method === 'GET' && !request.user?.impersonated_by) {
        const staff = await loadStaffContext(request.user!.sub, request.ip);
        if (staff?.permissions.has('lens.view')) return;
      }
      return reply.status(403).send({ error: 'SUPER_ADMIN role required for Lens management' });
    }
  });

  // =========================================================================
  // 1. WEBHOOK RECEIVER
  // =========================================================================
  fastify.post('/webhooks/:provider', async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: string };
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const payload = typeof request.body === 'object' && request.body !== null ? request.body : JSON.parse(rawBody || '{}');

    let deliveryId = (request.headers['x-github-delivery'] || request.headers['linear-delivery'] || request.headers['x-delivery-id']) as string;
    if (!deliveryId) deliveryId = `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const eventType = (request.headers['x-github-event'] || request.headers['linear-event'] || request.headers['x-event-type'] || 'event') as string;
    const signature = (request.headers['x-hub-signature-256'] || request.headers['linear-signature'] || request.headers['x-slack-signature']) as string;
    const timestamp = request.headers['x-slack-request-timestamp'] as string;

    const result = await ingestWebhook({
      provider,
      eventType,
      deliveryId,
      signature,
      timestamp,
      rawBody,
      payload,
    });

    return reply.status(result.accepted ? 200 : 400).send(result);
  });

  // =========================================================================
  // 2. ALL-APP REPORT INTAKE
  // =========================================================================
  fastify.post('/reports', async (request, reply) => {
    const user = request.user;
    const b = (request.body ?? {}) as any;

    if (!b.source_app || !String(b.title ?? '').trim() || !String(b.summary ?? '').trim()) {
      return reply.status(400).send({ error: 'source_app, title, and summary are required' });
    }

    try {
      const result = await intakeReport({
        sourceApp: b.source_app,
        sourceRoute: b.source_route,
        tenantId: user.tenant_id,
        reporter: {
          id: user.sub,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        title: b.title,
        summary: b.summary,
        stepsToReproduce: b.steps_to_reproduce,
        expectedBehavior: b.expected_behavior,
        actualBehavior: b.actual_behavior,
        severity: b.severity,
        clientContext: b.client_context,
        attachments: b.attachments,
        autoCreateLensItem: user.role === 'SUPER_ADMIN' ? Boolean(b.auto_create_item) : false,
      });

      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Report intake failed' });
    }
  });

  fastify.get('/reports/mine', async (request) => {
    const user = request.user;
    const rows = await dbPlatform.selectFrom('lens_reports')
      .selectAll()
      .where('reporter_id', '=', user.sub)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    return rows;
  });

  // =========================================================================
  // 3. PROJECTS & REPOSITORIES
  // =========================================================================
  fastify.get('/projects', async () =>
    dbPlatform.selectFrom('lens_projects').selectAll().orderBy('key', 'asc').execute());

  fastify.post('/projects', async (request, reply) => {
    const b = (request.body ?? {}) as any;
    if (!b.key || !b.name) return reply.status(400).send({ error: 'key and name are required' });
    const row = await dbPlatform.insertInto('lens_projects').values({
      key: String(b.key).toUpperCase().trim(),
      name: String(b.name).trim(),
      description: b.description ?? null,
      lead_id: b.lead_id ?? null,
      default_area_id: b.default_area_id ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(row);
  });

  fastify.patch('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as any;
    const updates: any = { updated_at: new Date() };
    for (const f of ['name', 'description', 'lead_id', 'default_area_id', 'is_active']) {
      if (b[f] !== undefined) updates[f] = b[f];
    }
    const updated = await dbPlatform.updateTable('lens_projects').set(updates)
      .where('id', '=', id).returningAll().executeTakeFirst();
    if (!updated) return reply.status(404).send({ error: 'Project not found' });
    return updated;
  });

  fastify.get('/repositories', async () =>
    dbPlatform.selectFrom('lens_repositories').selectAll().orderBy('full_name', 'asc').execute());

  fastify.post('/repositories', async (request, reply) => {
    const b = (request.body ?? {}) as any;
    if (!b.full_name) return reply.status(400).send({ error: 'full_name is required' });
    const row = await dbPlatform.insertInto('lens_repositories').values({
      provider: b.provider ?? 'github',
      full_name: String(b.full_name).trim(),
      default_branch: b.default_branch ?? 'master',
      clone_url: b.clone_url ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(row);
  });

  // =========================================================================
  // 4. CONNECTION INSTANCES
  // =========================================================================
  fastify.get('/capabilities', async () => PROVIDER_CAPABILITIES);

  fastify.get('/connections', async () => {
    const rows = await dbPlatform.selectFrom('lens_connection_instances')
      .selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(r => ({
      id: r.id,
      provider: r.provider,
      name: r.name,
      site_or_org: r.site_or_org,
      auth_type: r.auth_type,
      has_credential: Boolean(r.encrypted_credential),
      has_webhook_secret: Boolean(r.encrypted_webhook_secret),
      key_version: r.key_version,
      granted_scopes: typeof r.granted_scopes === 'string' ? JSON.parse(r.granted_scopes) : r.granted_scopes,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
      status: r.status,
      last_error: r.last_error,
      last_sync_at: r.last_sync_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  });

  fastify.post('/connections', async (request, reply) => {
    const user = request.user;
    const b = (request.body ?? {}) as any;
    if (!b.provider || !b.name || !b.credential) {
      return reply.status(400).send({ error: 'provider, name, and credential are required' });
    }

    const encryptedCred = encryptLensCredential(b.credential);
    const encryptedSec = b.webhook_secret ? encryptLensCredential(b.webhook_secret) : null;

    const row = await dbPlatform.insertInto('lens_connection_instances').values({
      provider: b.provider,
      name: String(b.name).trim(),
      site_or_org: b.site_or_org ?? null,
      auth_type: b.auth_type ?? 'oauth',
      encrypted_credential: encryptedCred,
      encrypted_webhook_secret: encryptedSec,
      key_version: 'v1',
      granted_scopes: asJson(b.granted_scopes, []) as any,
      config: JSON.stringify(b.config ?? {}) as any,
      status: 'connected',
      created_by: user.sub,
    }).returningAll().executeTakeFirstOrThrow();

    const test = await testConnectionInstance(b.provider as LensProvider, b.credential, b.config ?? {});
    if (!test.ok) {
      await dbPlatform.updateTable('lens_connection_instances').set({
        status: 'error',
        last_error: test.detail,
      }).where('id', '=', row.id).execute();
    }

    return reply.status(201).send({
      id: row.id,
      provider: row.provider,
      name: row.name,
      status: test.ok ? 'connected' : 'error',
      tested: true,
      test_detail: test.detail,
    });
  });

  fastify.patch('/connections/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as any;
    const existing = await dbPlatform.selectFrom('lens_connection_instances')
      .selectAll().where('id', '=', id).executeTakeFirst();
    if (!existing) return reply.status(404).send({ error: 'Connection not found' });

    const updates: any = { updated_at: new Date() };
    if (b.name) updates.name = String(b.name).trim();
    if (b.site_or_org !== undefined) updates.site_or_org = b.site_or_org;
    if (b.config !== undefined) updates.config = JSON.stringify(b.config);
    if (b.status !== undefined) updates.status = b.status;
    if (b.credential && typeof b.credential === 'string') {
      updates.encrypted_credential = encryptLensCredential(b.credential);
    }
    if (b.webhook_secret !== undefined) {
      updates.encrypted_webhook_secret = b.webhook_secret ? encryptLensCredential(b.webhook_secret) : null;
    }

    const updated = await dbPlatform.updateTable('lens_connection_instances').set(updates)
      .where('id', '=', id).returningAll().executeTakeFirstOrThrow();

    return reply.send({ id: updated.id, name: updated.name, status: updated.status });
  });

  fastify.post('/connections/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const conn = await dbPlatform.selectFrom('lens_connection_instances')
      .selectAll().where('id', '=', id).executeTakeFirst();
    if (!conn) return reply.status(404).send({ error: 'Connection not found' });

    let cred = '';
    try {
      cred = decryptLensCredential(conn.encrypted_credential);
    } catch (err: any) {
      return reply.status(500).send({ ok: false, detail: `Decryption error: ${err.message}` });
    }

    const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
    const res = await testConnectionInstance(conn.provider as LensProvider, cred, config);

    await dbPlatform.updateTable('lens_connection_instances').set({
      status: res.ok ? 'connected' : 'error',
      last_error: res.ok ? null : res.detail,
      last_sync_at: new Date(),
    }).where('id', '=', id).execute();

    return res;
  });

  fastify.delete('/connections/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await dbPlatform.deleteFrom('lens_connection_instances').where('id', '=', id).execute();
    return reply.status(204).send();
  });

  // =========================================================================
  // 5. RELEASES
  // =========================================================================
  fastify.get('/releases', async () =>
    dbPlatform.selectFrom('lens_releases as r')
      .leftJoin('lens_projects as p', 'p.id', 'r.project_id')
      .select([
        'r.id', 'r.project_id', 'r.version', 'r.title', 'r.description',
        'r.status', 'r.release_notes', 'r.git_tag', 'r.commit_sha',
        'r.released_at', 'r.released_by', 'r.created_at', 'r.updated_at',
        'p.name as project_name', 'p.key as project_key',
      ])
      .orderBy('r.created_at', 'desc').execute());

  fastify.post('/releases', async (request, reply) => {
    const user = request.user;
    const b = (request.body ?? {}) as any;
    if (!b.version || !b.title) return reply.status(400).send({ error: 'version and title are required' });

    const row = await dbPlatform.insertInto('lens_releases').values({
      project_id: b.project_id ?? null,
      version: String(b.version).trim(),
      title: String(b.title).trim(),
      description: b.description ?? null,
      status: b.status ?? 'PLANNED',
      release_notes: b.release_notes ?? null,
      git_tag: b.git_tag ?? null,
      commit_sha: b.commit_sha ?? null,
      released_by: user.sub,
      released_at: b.status === 'RELEASED' ? new Date() : null,
    }).returningAll().executeTakeFirstOrThrow();

    return reply.status(201).send(row);
  });

  fastify.patch('/releases/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as any;
    const updates: any = { updated_at: new Date() };
    for (const f of ['title', 'description', 'status', 'release_notes', 'git_tag', 'commit_sha']) {
      if (b[f] !== undefined) updates[f] = b[f];
    }
    if (b.status === 'RELEASED') updates.released_at = new Date();

    const updated = await dbPlatform.updateTable('lens_releases').set(updates)
      .where('id', '=', id).returningAll().executeTakeFirst();
    if (!updated) return reply.status(404).send({ error: 'Release not found' });
    return updated;
  });

  // =========================================================================
  // 6. SNAPSHOTS
  // =========================================================================
  fastify.get('/snapshots', async (request) => {
    const { item_id } = request.query as { item_id?: string };
    let q = dbPlatform.selectFrom('lens_snapshots as s')
      .leftJoin('lens_items as i', 'i.id', 's.item_id')
      .select([
        's.id', 's.item_id', 's.repo_id', 's.snapshot_type', 's.commit_sha',
        's.branch_label', 's.checksum_sha256', 's.size_bytes', 's.manifest',
        's.status', 's.reason', 's.created_by', 's.created_at', 'i.ref as item_ref',
      ]);
    if (item_id) q = q.where('s.item_id', '=', item_id);
    return q.orderBy('s.created_at', 'desc').limit(50).execute();
  });

  fastify.post('/snapshots', async (request, reply) => {
    const user = request.user;
    const b = (request.body ?? {}) as any;
    if (!b.snapshot_type || (!b.content && !b.raw_patch)) {
      return reply.status(400).send({ error: 'snapshot_type and content/raw_patch are required' });
    }

    try {
      const snap = await createSnapshot({
        itemId: b.item_id,
        repoId: b.repo_id,
        snapshotType: b.snapshot_type,
        commitSha: b.commit_sha,
        branchLabel: b.branch_label,
        reason: b.reason,
        createdBy: user.sub,
        rawContent: b.content || b.raw_patch,
        manifest: b.manifest,
      });
      return reply.status(201).send(snap);
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Snapshot capture failed' });
    }
  });

  fastify.get('/snapshots/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await dbPlatform.selectFrom('lens_snapshots').selectAll()
      .where('id', '=', id).executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Snapshot not found' });
    return row;
  });

  fastify.get('/snapshots/:id/restore-preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const preview = await prepareSnapshotRestore(id);
      return preview;
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Restore preview failed' });
    }
  });

  fastify.get('/snapshots/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { snapshot, content } = await getSnapshotContent(id);
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="snapshot-${snapshot.id}.bin"`);
      return reply.send(content);
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Download failed' });
    }
  });

  // =========================================================================
  // 7. REPORTS TRIAGE
  // =========================================================================
  fastify.get('/reports', async (request) => {
    const { status, app } = request.query as { status?: string; app?: string };
    let q = dbPlatform.selectFrom('lens_reports as r')
      .leftJoin('lens_items as i', 'i.id', 'r.item_id')
      .select([
        'r.id', 'r.source_app', 'r.source_route', 'r.tenant_id', 'r.reporter_id',
        'r.reporter_email', 'r.reporter_name', 'r.reporter_role', 'r.title',
        'r.summary', 'r.severity', 'r.status', 'r.item_id', 'r.created_at',
        'r.updated_at', 'i.ref as linked_item_ref',
      ]);
    if (status) q = q.where('r.status', '=', status as any);
    if (app) q = q.where('r.source_app', '=', app);
    return q.orderBy('r.created_at', 'desc').limit(100).execute();
  });

  fastify.patch('/reports/:id/triage', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as any;

    const report = await dbPlatform.selectFrom('lens_reports').selectAll()
      .where('id', '=', id).executeTakeFirst();
    if (!report) return reply.status(404).send({ error: 'Report not found' });

    let linkedItemId = report.item_id;

    if (b.create_lens_item && !linkedItemId) {
      const next = await dbPlatform.selectNoFrom(
        eb => eb.fn<number>('nextval', [eb.val('lens_item_ref_seq')]).as('n'),
      ).executeTakeFirstOrThrow();

      const ref = `LENS-${next.n}`;
      const item = await dbPlatform.insertInto('lens_items').values({
        ref,
        kind: 'BUG',
        title: `[${report.source_app.toUpperCase()}] ${report.title}`,
        body: `${report.summary}\n\nSteps:\n${report.steps_to_reproduce || 'N/A'}`,
        status: 'OPEN',
        severity: report.severity,
        confidence: 'CONFIRMED',
        source_report_id: report.id,
        created_by: user.sub,
        refs: JSON.stringify([]) as any,
        tags: JSON.stringify([report.source_app]) as any,
      }).returningAll().executeTakeFirstOrThrow();

      linkedItemId = item.id;
    }

    const updated = await dbPlatform.updateTable('lens_reports').set({
      status: b.status ?? (linkedItemId ? 'LINKED' : report.status),
      item_id: linkedItemId,
      resolution_notes: b.resolution_notes ?? report.resolution_notes,
      updated_at: new Date(),
    }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

    return updated;
  });

  // =========================================================================
  // 8. AREAS, ITEMS & BOARD
  // =========================================================================
  fastify.get('/areas', async () =>
    dbPlatform.selectFrom('lens_areas').selectAll().orderBy('sort_order', 'asc').execute());

  fastify.get('/items', async (request) => {
    const { status, kind, area, project_id, severity, priority, confidence, q, include_closed, limit, offset } = request.query as Record<string, string>;

    let query = dbPlatform.selectFrom('lens_items as i')
      .leftJoin('lens_areas as a', 'a.id', 'i.area_id')
      .leftJoin('lens_projects as p', 'p.id', 'i.project_id')
      .leftJoin('lens_releases as rel', 'rel.id', 'i.release_id')
      .select([
        'i.id', 'i.ref', 'i.kind', 'i.title', 'i.body', 'i.area_id', 'i.project_id',
        'i.release_id', 'i.environment', 'i.status', 'i.severity', 'i.priority',
        'i.confidence', 'i.evidence', 'i.waiting_on', 'i.assignee_id', 'i.assignee_name',
        'i.verification_status', 'i.reopen_count', 'i.labels', 'i.refs', 'i.tags',
        'i.resolution', 'i.resolved_at', 'i.created_at', 'i.updated_at',
        'a.name as area_name', 'p.name as project_name', 'p.key as project_key',
        'rel.version as release_version',
      ]);

    if (STATUSES.includes(status as Status)) query = query.where('i.status', '=', status as Status);
    if (KINDS.includes(kind as Kind)) query = query.where('i.kind', '=', kind as Kind);
    if (SEVERITIES.includes(severity as Severity)) query = query.where('i.severity', '=', severity as Severity);
    if (PRIORITIES.includes(priority as Priority)) query = query.where('i.priority', '=', priority as Priority);
    if (CONFIDENCES.includes(confidence as Confidence)) query = query.where('i.confidence', '=', confidence as Confidence);
    if (area) query = query.where('i.area_id', '=', area);
    if (project_id) query = query.where('i.project_id', '=', project_id);
    if (!status && include_closed !== '1') query = query.where('i.status', 'not in', CLOSED);

    let rows = await query.orderBy('i.created_at', 'desc').execute();

    if (q) {
      const s = q.toLowerCase();
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(s) ||
        (r.body ?? '').toLowerCase().includes(s) ||
        (r.evidence ?? '').toLowerCase().includes(s) ||
        r.ref.toLowerCase().includes(s));
    }

    if (limit) {
      const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
      const off = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
      return { data: rows.slice(off, off + lim), total: rows.length };
    }
    return rows;
  });

  fastify.get('/stats', async () => {
    const rows = await dbPlatform.selectFrom('lens_items')
      .select(['status', 'kind', 'severity', 'priority', 'confidence']).execute();
    const open = rows.filter(r => !CLOSED.includes(r.status));
    const count = (k: 'status' | 'kind' | 'severity' | 'priority' | 'confidence') =>
      open.reduce<Record<string, number>>((m, r) => {
        const v = String(r[k] ?? 'NORMAL');
        m[v] = (m[v] ?? 0) + 1;
        return m;
      }, {});
    return {
      total: rows.length,
      open: open.length,
      by_status: count('status'),
      by_kind: count('kind'),
      by_severity: count('severity'),
      by_priority: count('priority'),
      by_confidence: count('confidence'),
      unproven: open.filter(r => r.confidence !== 'CONFIRMED').length,
    };
  });

  fastify.get('/items/:ref', async (request, reply) => {
    const { ref } = request.params as { ref: string };
    const item = await dbPlatform.selectFrom('lens_items as i')
      .leftJoin('lens_areas as a', 'a.id', 'i.area_id')
      .leftJoin('lens_projects as p', 'p.id', 'i.project_id')
      .leftJoin('lens_releases as r', 'r.id', 'i.release_id')
      .select([
        'i.id', 'i.ref', 'i.kind', 'i.title', 'i.body', 'i.area_id', 'i.project_id',
        'i.release_id', 'i.environment', 'i.status', 'i.severity', 'i.priority',
        'i.confidence', 'i.evidence', 'i.waiting_on', 'i.assignee_id', 'i.assignee_name',
        'i.reproduction_steps', 'i.root_cause', 'i.fix_summary', 'i.verification_evidence',
        'i.verification_status', 'i.verified_by', 'i.verified_at', 'i.reopen_count',
        'i.reopen_reason', 'i.labels', 'i.refs', 'i.tags', 'i.resolution', 'i.resolved_at',
        'i.created_at', 'i.updated_at', 'i.created_by', 'i.parent_id', 'i.cycle_id',
        'a.name as area_name', 'p.name as project_name', 'p.key as project_key',
        'r.version as release_version',
      ])
      .where('i.ref', '=', ref.toUpperCase()).executeTakeFirst();

    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const events = await dbPlatform.selectFrom('lens_events').selectAll()
      .where('item_id', '=', item.id).orderBy('created_at', 'desc').execute();

    const comments = await dbPlatform.selectFrom('lens_comments').selectAll()
      .where('item_id', '=', item.id).orderBy('created_at', 'asc').execute();

    const links = await dbPlatform.selectFrom('lens_links').selectAll()
      .where('item_id', '=', item.id).execute();

    const snapshots = await dbPlatform.selectFrom('lens_snapshots').selectAll()
      .where('item_id', '=', item.id).orderBy('created_at', 'desc').execute();

    return { ...item, events, comments, links, snapshots };
  });

  fastify.post('/items', async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    const err = validate(body, false);
    if (err) return reply.status(400).send({ error: err });

    const next = await dbPlatform.selectNoFrom(
      eb => eb.fn<number>('nextval', [eb.val('lens_item_ref_seq')]).as('n')).executeTakeFirstOrThrow();

    const item = await dbPlatform.insertInto('lens_items').values({
      ref: `LENS-${next.n}`,
      kind: body.kind,
      title: String(body.title).trim(),
      body: body.body ?? null,
      area_id: body.area_id ?? null,
      project_id: body.project_id ?? null,
      release_id: body.release_id ?? null,
      environment: body.environment ?? 'production',
      status: body.status ?? 'OPEN',
      severity: body.severity ?? 'NORMAL',
      priority: body.priority ?? 'MEDIUM',
      confidence: body.confidence ?? 'SUSPECTED',
      evidence: body.evidence ?? null,
      waiting_on: body.waiting_on ?? null,
      assignee_id: body.assignee_id ?? null,
      assignee_name: body.assignee_name ?? null,
      reproduction_steps: body.reproduction_steps ?? null,
      parent_id: body.parent_id ?? null,
      cycle_id: body.cycle_id ?? null,
      labels: asJson(body.labels, []) as any,
      refs: asJson(body.refs, []) as any,
      tags: asJson(body.tags, []) as any,
      created_by: user.sub ?? null,
      resolution: body.resolution ?? null,
      resolved_at: CLOSED.includes(body.status) ? new Date() : null,
    }).returningAll().executeTakeFirstOrThrow();

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'created',
      detail: `${item.kind} opened at ${item.confidence.toLowerCase()} confidence`,
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).execute();

    await emitLensOutboxEvent({
      eventName: 'lens.item.created',
      aggregateId: item.id,
      payload: {
        ref: item.ref,
        kind: item.kind,
        title: item.title,
        severity: item.severity,
        confidence: item.confidence,
        body: item.body,
      },
    });

    return reply.status(201).send(item);
  });

  fastify.patch('/items/:ref', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const body = request.body as any;

    const existing = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!existing) return reply.status(404).send({ error: 'Item not found' });

    const merged = { ...existing, ...body };
    const err = validate(merged, false);
    if (err) return reply.status(400).send({ error: err });

    const updates: any = { updated_at: new Date() };
    for (const f of [
      'kind', 'title', 'body', 'area_id', 'project_id', 'release_id', 'environment',
      'status', 'severity', 'priority', 'confidence', 'evidence', 'waiting_on',
      'assignee_id', 'assignee_name', 'reproduction_steps', 'root_cause', 'fix_summary',
      'verification_evidence', 'verification_status', 'reopen_reason', 'resolution',
      'parent_id', 'cycle_id',
    ]) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    if (body.labels !== undefined) updates.labels = asJson(body.labels, []);
    if (body.refs !== undefined) updates.refs = asJson(body.refs, []);
    if (body.tags !== undefined) updates.tags = asJson(body.tags, []);

    if (CLOSED.includes(existing.status) && body.status && !CLOSED.includes(body.status)) {
      updates.reopen_count = (existing.reopen_count || 0) + 1;
      updates.resolved_at = null;
      updates.resolution = null;
    } else if (body.status !== undefined) {
      updates.resolved_at = CLOSED.includes(body.status) ? (existing.resolved_at ?? new Date()) : null;
    }

    if (body.verification_status === 'VERIFIED') {
      updates.verified_by = user.sub;
      updates.verified_at = new Date();
    }

    const item = await dbPlatform.updateTable('lens_items').set(updates)
      .where('ref', '=', ref.toUpperCase()).returningAll().executeTakeFirstOrThrow();

    const changes: string[] = [];
    if (body.status !== undefined && body.status !== existing.status) {
      changes.push(`status ${existing.status} → ${body.status}`);
    }
    if (body.severity !== undefined && body.severity !== existing.severity) {
      changes.push(`severity ${existing.severity} → ${body.severity}`);
    }
    if (body.priority !== undefined && body.priority !== existing.priority) {
      changes.push(`priority ${existing.priority} → ${body.priority}`);
    }
    if (body.verification_status !== undefined && body.verification_status !== existing.verification_status) {
      changes.push(`verification ${existing.verification_status} → ${body.verification_status}`);
    }

    if (changes.length > 0) {
      await dbPlatform.insertInto('lens_events').values({
        item_id: item.id, kind: 'updated', detail: changes.join(', '),
        actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
      }).execute();
    }

    return item;
  });

  // =========================================================================
  // 9. COMMENTS, BOARD, LINKS & PUSH
  // =========================================================================
  fastify.get('/items/:ref/comments', async (request, reply) => {
    const { ref } = request.params as { ref: string };
    const item = await dbPlatform.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    return dbPlatform.selectFrom('lens_comments').selectAll()
      .where('item_id', '=', item.id).orderBy('created_at', 'asc').execute();
  });

  fastify.post('/items/:ref/comments', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const { body, attachments } = (request.body ?? {}) as { body?: string; attachments?: any[] };
    if (!String(body ?? '').trim()) return reply.status(400).send({ error: 'body is required' });

    const item = await dbPlatform.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const row = await dbPlatform.insertInto('lens_comments').values({
      item_id: item.id,
      author_id: user.sub,
      author_name: user.name || user.email || 'Staff',
      author_email: user.email ?? null,
      body: String(body).trim(),
      attachments: asJson(attachments, []) as any,
    }).returningAll().executeTakeFirstOrThrow();

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id,
      kind: 'comment',
      detail: `Comment added by ${user.name || user.email || 'Staff'}`,
      actor_id: user.sub,
      actor_name: user.name || user.email || null,
    }).execute();

    return reply.status(201).send(row);
  });

  fastify.post('/items/:ref/notes', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const { note } = (request.body ?? {}) as { note?: string };
    if (!String(note ?? '').trim()) return reply.status(400).send({ error: 'note is required' });

    const item = await dbPlatform.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const ev = await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'note', detail: String(note).trim(),
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(ev);
  });

  fastify.get('/board', async (request) => {
    const { area, kind, project_id } = request.query as Record<string, string>;

    const columns = await dbPlatform.selectFrom('lens_columns').selectAll()
      .orderBy('sort_order', 'asc').execute();

    let q = dbPlatform.selectFrom('lens_items as i')
      .leftJoin('lens_areas as a', 'a.id', 'i.area_id')
      .leftJoin('lens_projects as p', 'p.id', 'i.project_id')
      .select(['i.id', 'i.ref', 'i.kind', 'i.title', 'i.status', 'i.severity',
               'i.priority', 'i.confidence', 'i.waiting_on', 'i.area_id', 'a.name as area_name',
               'p.name as project_name', 'i.updated_at'])
      .where('i.status', '!=', 'WONTFIX');

    if (area) q = q.where('i.area_id', '=', area);
    if (project_id) q = q.where('i.project_id', '=', project_id);
    if (KINDS.includes(kind as Kind)) q = q.where('i.kind', '=', kind as Kind);
    const items = await q.orderBy('i.updated_at', 'desc').execute();

    const links = await dbPlatform.selectFrom('lens_links')
      .select(['item_id', 'provider', 'kind', 'external_id', 'url', 'external_status'])
      .execute();
    const byItem = new Map<string, typeof links>();
    for (const l of links) byItem.set(l.item_id, [...(byItem.get(l.item_id) ?? []), l]);

    return columns.map(c => {
      const inColumn = items.filter(i => i.status === c.status)
        .map(i => ({ ...i, links: byItem.get(i.id) ?? [] }));
      return {
        ...c,
        items: inColumn,
        count: inColumn.length,
        over_wip: c.wip_limit != null && inColumn.length > c.wip_limit,
      };
    });
  });

  fastify.post('/items/:ref/links', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const b = (request.body ?? {}) as any;
    if (!String(b.external_id ?? '').trim()) {
      return reply.status(400).send({ error: 'external_id is required' });
    }
    const item = await dbPlatform.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const link = await dbPlatform.insertInto('lens_links').values({
      item_id: item.id,
      provider: b.provider || 'github',
      kind: b.kind || 'issue',
      external_id: String(b.external_id).trim(),
      url: b.url ?? null,
      title: b.title ?? null,
      external_status: b.external_status ?? null,
      synced_at: new Date(),
    }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing())
      .returningAll().executeTakeFirst();

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'linked',
      detail: `${b.provider} ${b.kind || 'issue'} ${b.external_id}`,
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).execute();

    return reply.status(201).send(link ?? { note: 'Link attached' });
  });

  fastify.post('/items/:ref/push', async (request, reply) => {
    const { ref } = request.params as { ref: string };
    const { provider, connection_id } = (request.body ?? {}) as { provider?: string; connection_id?: string };

    const item = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    if (connection_id) {
      const res = await pushToExternalTracker(connection_id, {
        ref: item.ref,
        title: item.title,
        body: item.body,
        kind: item.kind,
        severity: item.severity,
      });
      if (!res.ok) return reply.status(res.status || 502).send({ error: res.detail });
      await dbPlatform.insertInto('lens_links').values({
        item_id: item.id, provider: provider as any || 'github', kind: 'issue',
        external_id: res.external_id!, url: res.url ?? null,
        title: item.title, synced_at: new Date(),
      }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing()).execute();

      return { external_id: res.external_id, url: res.url };
    }

    const r = await createExternalIssue(provider as any || 'github', item);
    if (!r.ok) return reply.status(502).send({ error: r.detail, provider_status: r.status });
    await dbPlatform.insertInto('lens_links').values({
      item_id: item.id, provider: provider as any || 'github', kind: 'issue',
      external_id: r.external_id!, url: r.url ?? null,
      title: item.title, synced_at: new Date(),
    }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing()).execute();

    return { external_id: r.external_id, url: r.url };
  });

  // =========================================================================
  // 10. LEGACY INTEGRATIONS & PREFLIGHT
  // =========================================================================
  fastify.get('/integrations', async () => listIntegrations());

  fastify.put('/integrations/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!PROVIDERS.includes(provider as Provider)) {
      return reply.status(400).send({ error: 'Unknown provider' });
    }
    const b = (request.body ?? {}) as any;
    const values: any = { provider, config: JSON.stringify(b.config ?? {}), updated_at: new Date() };
    if (typeof b.credential === 'string' && b.credential.trim()) values.credential = b.credential.trim();
    if (typeof b.webhook_secret === 'string') values.webhook_secret = b.webhook_secret.trim() || null;

    await dbPlatform.insertInto('lens_integrations').values({ ...values, status: 'disconnected' })
      .onConflict(oc => oc.column('provider').doUpdateSet(values)).execute();

    const test = await testConnection(provider as Provider);
    return { provider, tested: true, ok: test.ok, detail: test.detail, status: test.status };
  });

  fastify.post('/integrations/:provider/preflight', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!PROVIDERS.includes(provider as Provider)) {
      return reply.status(400).send({ error: 'Unknown provider' });
    }
    return preflight(provider as Provider);
  });

  fastify.post('/integrations/:provider/test', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!PROVIDERS.includes(provider as Provider)) {
      return reply.status(400).send({ error: 'Unknown provider' });
    }
    const r = await testConnection(provider as Provider);
    return { ok: r.ok, status: r.status, detail: r.detail };
  });

  fastify.post('/items/:ref/notify', async (request, reply) => {
    const { ref } = request.params as { ref: string };
    const { event } = (request.body ?? {}) as { event?: string };
    const item = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    const r = await notifySlack(item, event || 'updated');
    if (!r.ok) return reply.status(502).send({ error: r.detail, provider_status: r.status });
    return { ok: true };
  });

  fastify.get('/ci', async () => {
    const r = await latestBuild();
    if (!r.ok) return { ok: false, detail: r.detail };
    const p = r.data?.items?.[0];
    return p ? {
      ok: true, number: p.number, state: p.state,
      created_at: p.created_at, vcs: p.vcs?.revision?.slice(0, 8) ?? null,
    } : { ok: true, empty: true };
  });

  // =========================================================================
  // 11. CYCLES & OUTBOX PROCESSOR
  // =========================================================================
  fastify.get('/cycles', async () =>
    dbPlatform.selectFrom('lens_cycles').selectAll().orderBy('created_at', 'desc').execute());

  fastify.post('/cycles', async (request, reply) => {
    const user = request.user;
    const body = cycleCreateSchema.parse(request.body);
    const cycle = await dbPlatform.insertInto('lens_cycles').values({
      name: body.name,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      status: body.status ?? 'PLANNING',
      created_by: user.sub ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(cycle);
  });

  fastify.patch('/cycles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = cyclePatchSchema.parse(request.body) as Record<string, unknown>;
    const updates: any = { updated_at: new Date() };
    for (const f of ['name', 'start_date', 'end_date', 'status']) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 1) return reply.send({ ok: true });
    const cycle = await dbPlatform.updateTable('lens_cycles').set(updates)
      .where('id', '=', id).returningAll().executeTakeFirst();
    if (!cycle) return reply.status(404).send({ error: 'Cycle not found' });
    return reply.send(cycle);
  });

  fastify.post('/outbox/process', async () => processLensOutbox(50));
}
