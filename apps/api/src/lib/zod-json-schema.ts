import { z, type ZodTypeAny } from 'zod';

/** Use the validator's supported converter so tool schemas cannot drift when
 * its private representation changes. Inputs must describe pre-transform data. */
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const { $schema: _dialect, ...definition } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  return definition;
}

export const EMPTY_OBJECT_SCHEMA: Record<string, unknown> = { type: 'object', properties: {} };
