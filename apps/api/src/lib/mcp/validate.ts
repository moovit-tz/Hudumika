/**
 * Validates tool arguments against the subset of JSON Schema the catalog uses
 * (object/string/integer/number/boolean, enum, required, min/max, lengths,
 * uuid/date formats, additionalProperties: false). Returns an error message,
 * or null when valid. Kept local so the schema a client sees is exactly the
 * schema enforced.
 */
import type { JsonSchema } from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function typeOk(type: string, v: unknown): boolean {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return !!v && typeof v === 'object' && !Array.isArray(v);
    case 'null': return v === null;
    default: return true;
  }
}

function check(schema: any, v: unknown, path: string): string | null {
  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeOk(t, v))) return `${path} must be ${types.join(' or ')}.`;
  }
  if (schema.enum && !schema.enum.includes(v)) return `${path} must be one of: ${schema.enum.join(', ')}.`;
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && v.length < schema.minLength) return `${path} must be at least ${schema.minLength} characters.`;
    if (schema.maxLength !== undefined && v.length > schema.maxLength) return `${path} must be at most ${schema.maxLength} characters.`;
    if (schema.format === 'uuid' && !UUID.test(v)) return `${path} must be a UUID.`;
    if (schema.format === 'date' && (!DATE.test(v) || Number.isNaN(Date.parse(v)))) return `${path} must be a date (YYYY-MM-DD).`;
    if (schema.format === 'date-time' && (!DATE_TIME.test(v) || Number.isNaN(Date.parse(v)))) return `${path} must be an ISO 8601 date-time with a time zone.`;
    if (schema.format === 'email' && !EMAIL.test(v)) return `${path} must be an email address.`;
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) return `${path} has the wrong format.`;
  }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) return `${path} must be ≥ ${schema.minimum}.`;
    if (schema.maximum !== undefined && v > schema.maximum) return `${path} must be ≤ ${schema.maximum}.`;
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) return `${path} needs at least ${schema.minItems} item(s).`;
    if (schema.maxItems !== undefined && v.length > schema.maxItems) return `${path} can have at most ${schema.maxItems} items.`;
    if (schema.items && Object.keys(schema.items).length) {
      for (const [i, item] of v.entries()) {
        const err = check(schema.items, item, `${path}[${i}]`);
        if (err) return err;
      }
    }
  }
  if (schema.type === 'object' && v && typeof v === 'object' && !Array.isArray(v)) {
    const props = schema.properties ?? {};
    for (const r of schema.required ?? []) if ((v as any)[r] === undefined) return `${path === '$' ? '' : path + '.'}${r} is required.`;
    for (const [k, val] of Object.entries(v as object)) {
      if (!(k in props)) {
        if (schema.additionalProperties === false) return `Unknown argument: ${k}.`;
        continue;
      }
      if (val === undefined) continue;
      const err = check(props[k], val, k);
      if (err) return err;
    }
  }
  return null;
}

export function validateArgs(schema: JsonSchema, args: unknown): string | null {
  return check(schema, args ?? {}, '$');
}
