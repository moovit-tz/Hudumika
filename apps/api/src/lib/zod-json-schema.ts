import type { ZodTypeAny } from 'zod';

/**
 * A deliberately small zod(v3) → JSON Schema converter, so the agent runtime
 * can tell a model what arguments each tool takes (before this, every tool
 * was advertised with an empty `properties: {}` schema and the model had to
 * guess argument names). Covers the constructors this codebase's tool
 * schemas actually use — string (incl. uuid/min/max), number, boolean, enum,
 * array, object, optional, default, nullable, literal, union, record, and
 * refine/transform wrappers. Anything it doesn't recognise becomes `{}` (any
 * value) rather than throwing: an over-permissive advertised schema is safe
 * because every tool still validates its input with the real zod schema on
 * execution, whereas a converter crash would take the whole agent down.
 *
 * Not a dependency on zod-to-json-schema on purpose — that package is only
 * present transitively at the repo root, not declared by apps/api.
 */

type Json = Record<string, unknown>;

function unwrap(schema: ZodTypeAny): { inner: ZodTypeAny; optional: boolean; nullable: boolean; def?: unknown } {
  let cur: any = schema;
  let optional = false, nullable = false, def: unknown;
  for (let i = 0; i < 10; i++) {
    const t = cur._def?.typeName;
    if (t === 'ZodOptional') { optional = true; cur = cur._def.innerType; }
    else if (t === 'ZodNullable') { nullable = true; cur = cur._def.innerType; }
    else if (t === 'ZodDefault') { optional = true; def = cur._def.defaultValue(); cur = cur._def.innerType; }
    else if (t === 'ZodEffects') { cur = cur._def.schema; }
    else break;
  }
  return { inner: cur, optional, nullable, def };
}

export function zodToJsonSchema(schema: ZodTypeAny): Json {
  const { inner, nullable, def } = unwrap(schema);
  const d: any = (inner as any)._def;
  let out: Json;

  switch (d?.typeName) {
    case 'ZodString': {
      out = { type: 'string' };
      for (const c of d.checks ?? []) {
        if (c.kind === 'uuid') out.format = 'uuid';
        else if (c.kind === 'email') out.format = 'email';
        else if (c.kind === 'min') out.minLength = c.value;
        else if (c.kind === 'max') out.maxLength = c.value;
      }
      break;
    }
    case 'ZodNumber': {
      out = { type: (d.checks ?? []).some((c: any) => c.kind === 'int') ? 'integer' : 'number' };
      for (const c of d.checks ?? []) {
        if (c.kind === 'min') out.minimum = c.value;
        else if (c.kind === 'max') out.maximum = c.value;
      }
      break;
    }
    case 'ZodBoolean': out = { type: 'boolean' }; break;
    case 'ZodLiteral': out = { const: d.value }; break;
    case 'ZodEnum': out = { type: 'string', enum: [...d.values] }; break;
    case 'ZodArray': out = { type: 'array', items: zodToJsonSchema(d.type) }; break;
    case 'ZodRecord': out = { type: 'object', additionalProperties: zodToJsonSchema(d.valueType) }; break;
    case 'ZodUnion': out = { anyOf: (d.options as ZodTypeAny[]).map(zodToJsonSchema) }; break;
    case 'ZodObject': {
      const shape: Record<string, ZodTypeAny> = d.shape();
      const properties: Record<string, Json> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!unwrap(value).optional) required.push(key);
      }
      out = { type: 'object', properties, ...(required.length ? { required } : {}) };
      break;
    }
    default: out = {};
  }

  if (d?.description || (schema as any)._def?.description) out.description = d?.description ?? (schema as any)._def.description;
  if (def !== undefined) out.default = def;
  if (nullable) return { anyOf: [out, { type: 'null' }] };
  return out;
}

/** The "no parameters" schema — what a tool that takes nothing advertises. */
export const EMPTY_OBJECT_SCHEMA: Json = { type: 'object', properties: {} };
