import type { AppId, UserRole } from '@hudumika/types';
import {
  type FieldSpec, type JsonSchema, type McpActorType, type McpTool,
  LIMIT_PROP, QUERY_PROP, UUID_PROP, inputSchema, listOutputSchema, objectSchema, project, rowsOf, shapeList,
} from './types.js';

export const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
export const MANAGER_ROLES: UserRole[] = [...ADMIN_ROLES, 'MANAGER'];

interface Base {
  id: string;
  app: AppId;
  entitlement: string | string[] | null;
  title: string;
  description: string;
  actors?: McpActorType[];
  roles?: UserRole[];
}

type Filter = { schema: JsonSchema; param?: string };

/** A read tool over an existing list route. */
export function listTool(o: Base & {
  path: string;
  fields: FieldSpec;
  itemsKey?: string;
  filters?: Record<string, Filter>;
  /** Fixed query params, and whether the route accepts `limit`. */
  query?: Record<string, unknown>;
  serverLimit?: boolean;
  /** Drop rows the app itself hides from this view (e.g. items in the trash). Gets the tool arguments too. */
  rowFilter?: (row: any, args: Record<string, any>) => boolean;
  /** Extra input properties used only by rowFilter. */
  extraInputs?: Record<string, JsonSchema>;
}): McpTool {
  const filterProps = Object.fromEntries(Object.entries(o.filters ?? {}).map(([k, f]) => [k, f.schema]));
  return {
    id: o.id, app: o.app, entitlement: o.entitlement, title: o.title, description: o.description,
    access: 'read', actors: o.actors ?? ['staff'], roles: o.roles, routes: [`GET ${o.path}`],
    inputSchema: inputSchema({ ...filterProps, ...(o.extraInputs ?? {}), query: QUERY_PROP, limit: LIMIT_PROP }),
    outputSchema: listOutputSchema(o.fields),
    async run(ctx, args) {
      const q: Record<string, unknown> = { ...(o.query ?? {}) };
      for (const [k, f] of Object.entries(o.filters ?? {})) if (args[k] !== undefined && args[k] !== '') q[f.param ?? k] = args[k];
      // Ask for one more than needed so `truncated` is accurate, and more still
      // when the gateway filters by text afterwards.
      if (o.serverLimit) q.limit = args.query ? 100 : Math.min((Number(args.limit) || 25) + 1, 100);
      const body = await ctx.get(o.path, q);
      const rows = rowsOf(body, o.itemsKey);
      return shapeList(o.rowFilter ? rows.filter(r => o.rowFilter!(r, args)) : rows, o.fields, args);
    },
  };
}

/** A read tool over an existing `/:id` route. The route validates ownership. */
export function detailTool(o: Base & {
  path: (id: string) => string;
  routeLabel: string;
  idDescription: string;
  fields: FieldSpec;
  unwrap?: (body: any) => any;
}): McpTool {
  return {
    id: o.id, app: o.app, entitlement: o.entitlement, title: o.title, description: o.description,
    access: 'read', actors: o.actors ?? ['staff'], roles: o.roles, routes: [`GET ${o.routeLabel}`],
    inputSchema: inputSchema({ id: UUID_PROP(o.idDescription) }, ['id']),
    outputSchema: objectSchema(o.fields),
    async run(ctx, args) {
      const body = await ctx.get(o.path(encodeURIComponent(String(args.id))));
      return project(o.unwrap ? o.unwrap(body) : (body?.data && !Array.isArray(body.data) ? body.data : body), o.fields);
    },
  };
}

/** A read tool over a dashboard/summary route: its declared figures only. */
export function summaryTool(o: Base & {
  path: string;
  fields: FieldSpec;
  query?: Record<string, unknown>;
  pick?: (body: any) => any;
}): McpTool {
  return {
    id: o.id, app: o.app, entitlement: o.entitlement, title: o.title, description: o.description,
    access: 'read', actors: o.actors ?? ['staff'], roles: o.roles, routes: [`GET ${o.path}`],
    inputSchema: inputSchema({}),
    outputSchema: objectSchema(o.fields),
    async run(ctx) {
      const body = await ctx.get(o.path, o.query);
      return project(o.pick ? o.pick(body) : (body?.data && !Array.isArray(body.data) ? body.data : body), o.fields);
    },
  };
}
