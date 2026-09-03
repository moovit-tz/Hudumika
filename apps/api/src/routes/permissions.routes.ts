import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

const RESOURCES = ['shipments','clearance','finance','hr','sales','crm','documents','reports','settings'] as const;
const ACTIONS   = ['view','create','edit','delete','approve','export'] as const;
const ROLES     = ['ADMIN','MANAGER','FINANCE','SALES','SENIOR','JUNIOR','OFFICER'] as const;

type Perm = { role: string; resource: string; action: string; allowed: boolean };

function defaultMatrix(): Perm[] {
  const perms: Perm[] = [];
  const grant = (role: string, resource: string, actions: string[]) => {
    for (const action of ACTIONS) {
      perms.push({ role, resource, action, allowed: actions.includes(action) });
    }
  };

  // ADMIN — everything except settings delete
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const allowed = !(resource === 'settings' && action === 'delete');
      perms.push({ role: 'ADMIN', resource, action, allowed });
    }
  }
  // MANAGER
  grant('MANAGER','shipments',  ['view','create','edit','approve','export']);
  grant('MANAGER','clearance',  ['view','create','edit','approve','export']);
  grant('MANAGER','finance',    ['view','approve','export']);
  grant('MANAGER','hr',         ['view','create','edit','approve']);
  grant('MANAGER','sales',      ['view','create','edit','approve','export']);
  grant('MANAGER','crm',        ['view','create','edit','approve']);
  grant('MANAGER','documents',  ['view','create','edit','delete','export']);
  grant('MANAGER','reports',    ['view','export']);
  grant('MANAGER','settings',   ['view']);

  // FINANCE
  grant('FINANCE','shipments',  ['view']);
  grant('FINANCE','clearance',  ['view']);
  grant('FINANCE','finance',    ['view','create','edit','delete','approve','export']);
  grant('FINANCE','hr',         ['view']);
  grant('FINANCE','sales',      ['view']);
  grant('FINANCE','crm',        ['view']);
  grant('FINANCE','documents',  ['view','create','export']);
  grant('FINANCE','reports',    ['view','export']);
  grant('FINANCE','settings',   []);

  // SALES
  grant('SALES','shipments',  ['view']);
  grant('SALES','clearance',  ['view']);
  grant('SALES','finance',    ['view']);
  grant('SALES','hr',         []);
  grant('SALES','sales',      ['view','create','edit','delete','export']);
  grant('SALES','crm',        ['view','create','edit','delete','export']);
  grant('SALES','documents',  ['view','create']);
  grant('SALES','reports',    ['view','export']);
  grant('SALES','settings',   []);

  // SENIOR
  grant('SENIOR','shipments',  ['view','create','edit']);
  grant('SENIOR','clearance',  ['view','create','edit','approve']);
  grant('SENIOR','finance',    ['view']);
  grant('SENIOR','hr',         ['view']);
  grant('SENIOR','sales',      ['view']);
  grant('SENIOR','crm',        ['view']);
  grant('SENIOR','documents',  ['view','create','edit']);
  grant('SENIOR','reports',    ['view']);
  grant('SENIOR','settings',   []);

  // JUNIOR / OFFICER — same basic access
  for (const role of ['JUNIOR','OFFICER']) {
    grant(role,'shipments',  ['view']);
    grant(role,'clearance',  ['view','create','edit']);
    grant(role,'finance',    []);
    grant(role,'hr',         []);
    grant(role,'sales',      ['view']);
    grant(role,'crm',        ['view']);
    grant(role,'documents',  ['view','create']);
    grant(role,'reports',    ['view']);
    grant(role,'settings',   []);
  }

  return perms;
}

export async function permissionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /permissions — returns full matrix seeded with defaults if empty
  fastify.get('/', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('org_permissions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .execute();

      if (existing.length === 0) {
        const defaults = defaultMatrix();
        await trx.insertInto('org_permissions')
          .values(defaults.map(p => ({ ...p, tenant_id: user.tenant_id })))
          .execute();
        return trx.selectFrom('org_permissions').selectAll()
          .where('tenant_id', '=', user.tenant_id).execute();
      }
      return existing;
    });
  });

  // GET /permissions/meta — returns available roles, resources, actions
  fastify.get('/meta', async () => ({
    roles:     ROLES,
    resources: RESOURCES,
    actions:   ACTIONS,
    resourceLabels: {
      shipments:  'Shipments', clearance: 'Customs & Clearance', finance: 'Finance & Billing',
      hr: 'HR & People', sales: 'Sales', crm: 'CRM & Customers',
      documents: 'Documents', reports: 'Reports & Analytics', settings: 'System Settings',
    },
  }));

  // PATCH /permissions is gone. org_permissions was never read by any
  // route's actual auth check — a save here toggled a checkbox that changed
  // nothing (see org-rbac.ts's own header comment, which documents the
  // mistake so it isn't repeated). Real, enforced role/permission
  // management is Ondi's Roles & Access (/v1/ondi/org/roles). 410 rather
  // than 404 so an old client is told where it went, not that it never
  // existed.
  fastify.patch('/', async (_request, reply) =>
    reply.status(410).send({
      error: 'This permission grid was never enforced by any route. Use Ondi ▸ Roles & Access instead.',
    }));

  // GET /permissions/users-by-role — count of users per role
  fastify.get('/users-by-role', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('users')
        .select(['role'])
        .select(trx.fn.count('id').as('count'))
        .where('tenant_id', '=', user.tenant_id)
        .groupBy('role')
        .execute();
      return rows;
    });
  });
}
