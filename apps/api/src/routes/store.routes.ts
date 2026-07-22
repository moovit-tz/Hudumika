import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { db } from '../db/client.js';

export const storeRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/store/apps (Public/Authenticated) -> returns approved apps
  app.get('/apps', async (request, reply) => {
    const result = await sql<any>`
      SELECT 
        id, name, developer_id, developer_name, category, 
        short_desc as "shortDesc", long_desc as "longDesc", 
        features, permissions, icon_url as "iconUrl", 
        rating, reviews_count as "reviewsCount", installs, status
      FROM marketplace_apps
      WHERE status = 'approved'
      ORDER BY created_at DESC
    `.execute(db);
    return result.rows;
  });

  // GET /v1/store/admin/apps (Admin) -> returns all apps including pending
  app.get('/admin/apps', async (request, reply) => {
    const result = await sql<any>`
      SELECT 
        id, name, developer_id, developer_name, category, 
        short_desc as "shortDesc", long_desc as "longDesc", 
        features, permissions, icon_url as "iconUrl", 
        rating, reviews_count as "reviewsCount", installs, status
      FROM marketplace_apps
      ORDER BY created_at DESC
    `.execute(db);
    return result.rows;
  });

  // POST /v1/store/apps (Submit new app)
  app.post('/apps', async (request, reply) => {
    const schema = z.object({
      name: z.string(),
      developer_name: z.string(),
      category: z.string(),
      short_desc: z.string(),
      long_desc: z.string(),
      features: z.array(z.string()),
      permissions: z.array(z.string()),
      icon_url: z.string().optional(),
      webhook_url: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const userId = (request.user as any)?.id || '00000000-0000-0000-0000-000000000000';

    const result = await sql<any>`
      INSERT INTO marketplace_apps 
        (name, developer_id, developer_name, category, short_desc, long_desc, features, permissions, icon_url, webhook_url, status)
      VALUES 
        (${body.name}, ${userId}, ${body.developer_name}, ${body.category}, ${body.short_desc}, ${body.long_desc}, ${JSON.stringify(body.features)}, ${JSON.stringify(body.permissions)}, ${body.icon_url || null}, ${body.webhook_url || null}, 'pending')
      RETURNING *
    `.execute(db);

    return result.rows[0];
  });

  // PATCH /v1/store/admin/apps/:id/status (Approve/Reject app)
  app.patch('/admin/apps/:id/status', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string() });
    const bodySchema = z.object({ status: z.enum(['approved', 'rejected']) });

    const { id } = paramsSchema.parse(request.params);
    const { status } = bodySchema.parse(request.body);

    const result = await sql<any>`
      UPDATE marketplace_apps 
      SET status = ${status}, updated_at = NOW() 
      WHERE id = ${id} 
      RETURNING *
    `.execute(db);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'App not found' });
    }

    return result.rows[0];
  });
};
