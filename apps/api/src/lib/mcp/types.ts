/**
 * Hudumika MCP gateway — tool contract.
 *
 * Every tool is keyed by a canonical app id (packages/types ALL_APP_IDS) and
 * runs through an existing REST route in-process as the verified caller, so
 * the route's own entitlement, role and record rules (customer scoping,
 * assignment, ownership) apply exactly as they do in the app. The gateway adds
 * its own checks on top — connection, scope, workspace policy, tool enablement,
 * actor type, role — at discovery and again on every call. See
 * services/mcp-gateway.service.ts.
 */
import type { AppId, UserRole } from '@hudumika/types';

export type McpActorType = 'staff' | 'customer';
export type McpAccess = 'read' | 'write';
export type JsonSchema = Record<string, unknown>;

/** Field type for projected output. All projected fields are nullable. */
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
export type FieldSpec = Record<string, FieldType | readonly [FieldType, string]>;

export interface McpCallContext {
  tenantId: string;
  userId: string;
  role: UserRole;
  actorType: McpActorType;
  customerId: string | null;
  connectionId: string;
  clientId: string;
  /** GET an existing route as the caller. Throws McpToolError on non-2xx. */
  get(path: string, query?: Record<string, unknown>): Promise<any>;
  /** Write to an existing route as the caller (POST/PATCH). Throws on non-2xx. */
  send(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown, headers?: Record<string, string>): Promise<any>;
  /** Run another tool with its own policy checks (cross-app tools). */
  callTool(toolId: string, args: Record<string, unknown>): Promise<{ ok: true; result: any } | { ok: false; reason: string }>;
}

export interface McpTool {
  /** Stable namespaced id: `<app>.<verb_noun>`. Never renamed once shipped. */
  id: string;
  /** Public MCP name when it must differ from `<app>__<action>` (ChatGPT's `search`/`fetch`). */
  name?: string;
  app: AppId;
  /** Entitlement feature key(s); any one grants. null = platform app with no entitlement gate. */
  entitlement: string | string[] | null;
  title: string;
  description: string;
  access: McpAccess;
  actors: McpActorType[];
  /** Staff roles allowed. Omitted = any staff role the underlying route accepts. */
  roles?: UserRole[];
  /** The REST route(s) the tool runs through — shown in the console and coverage matrix. */
  routes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  /** Write tools: the change removes something (to the app's trash). Shown to clients as destructiveHint. */
  destructive?: boolean;
  /** Write tools: the change reaches people outside Hudumika (email, SMS, WhatsApp). Shown as openWorldHint. */
  openWorld?: boolean;
  /** Default on for read tools, off for write tools, unless set. */
  defaultEnabled?: boolean;
  run(ctx: McpCallContext, args: Record<string, any>): Promise<Record<string, unknown>>;
  /** Write tools only: a human-readable summary shown before confirmation. */
  preview?(ctx: McpCallContext, args: Record<string, any>): Promise<string>;
}

export class McpToolError extends Error {
  constructor(public code: 'denied' | 'not_found' | 'invalid' | 'unavailable' | 'error', message: string, public httpStatus?: number) {
    super(message);
  }
}

// ── Schema helpers ────────────────────────────────────────────────────────

function fieldSchema(spec: FieldType | readonly [FieldType, string]): JsonSchema {
  const [type, description] = typeof spec === 'string' ? [spec, undefined] : spec;
  const base: JsonSchema = type === 'array' ? { type: ['array', 'null'], items: {} }
    : type === 'object' ? { type: ['object', 'null'] }
    : { type: [type, 'null'] };
  if (description) base.description = description;
  return base;
}

export function objectSchema(fields: FieldSpec): JsonSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldSchema(v)])),
    additionalProperties: false,
  };
}

export function listOutputSchema(fields: FieldSpec): JsonSchema {
  return {
    type: 'object',
    properties: {
      items: { type: 'array', items: objectSchema(fields) },
      count: { type: 'integer', description: 'Number of items returned.' },
      truncated: { type: 'boolean', description: 'True when more matching items exist than were returned.' },
    },
    required: ['items', 'count', 'truncated'],
    additionalProperties: false,
  };
}

export const LIMIT_PROP = { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Maximum items to return (1–100).' };
export const QUERY_PROP = { type: 'string', maxLength: 200, description: 'Optional text to match against the returned fields.' };
export const UUID_PROP = (description: string) => ({ type: 'string', format: 'uuid', description });

export function inputSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

// ── Projection ────────────────────────────────────────────────────────────

function coerce(value: unknown, type: FieldType): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'number': case 'integer': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      return type === 'integer' ? Math.trunc(n) : n;
    }
    case 'boolean': return typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : Boolean(value);
    case 'string': return value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
    case 'array': return Array.isArray(value) ? value : null;
    case 'object': return typeof value === 'object' && !Array.isArray(value) ? value : null;
  }
}

/** Keep only the declared fields, typed as declared. `a.b` reads a nested path. */
export function project(row: any, fields: FieldSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(fields)) {
    const type = typeof spec === 'string' ? spec : spec[0];
    out[name] = coerce(row?.[name], type);
  }
  return out;
}

/** Pull the row array out of the common response envelopes. */
export function rowsOf(body: any, key?: string): any[] {
  if (key) return Array.isArray(body?.[key]) ? body[key] : [];
  if (Array.isArray(body)) return body;
  for (const k of ['data', 'items', 'rows', 'results']) if (Array.isArray(body?.[k])) return body[k];
  return [];
}

export function shapeList(rows: any[], fields: FieldSpec, args: { limit?: number; query?: string }): Record<string, unknown> {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  let projected = rows.map(r => project(r, fields));
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  if (q) projected = projected.filter(r => Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(q)));
  return { items: projected.slice(0, limit), count: Math.min(projected.length, limit), truncated: projected.length > limit };
}
