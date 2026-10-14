/**
 * A raw pg/Kysely driver error carries a 5-character SQLSTATE `code` plus
 * `severity`/`table`/`constraint` — fields no application-thrown Error has.
 * Its `.message` routinely leaks schema internals or literal row values, so it
 * must never reach a client; use this to tell it apart from a deliberate
 * `throw new Error('a clear, safe message')`.
 */
export function isDriverError(err: unknown): err is { code: string } {
  const e = err as { code?: unknown; severity?: unknown; table?: unknown; constraint?: unknown } | null | undefined;
  return !!e && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)
    && ('severity' in e || 'table' in e || 'constraint' in e);
}

/**
 * The HTTP status + a fixed, safe message for a driver error. Most Postgres
 * errors a route can hit are the caller's own input (a malformed id, a
 * duplicate, a record still in use), not a server fault, so they get the
 * accurate 4xx rather than an opaque 500 — with no driver text in the body.
 */
export function driverErrorResponse(err: { code: string; column?: string; constraint?: string; detail?: string }): { status: number; error: string } {
  const code = err.code;
  switch (code) {
    case '22P02': // invalid_text_representation — e.g. a malformed uuid/number
      return { status: 400, error: err.column ? `The value for "${err.column}" is not in the expected format.` : 'One of the values provided is not in the expected format.' };
    case '22001': // string_data_right_truncation
      return { status: 400, error: err.column ? `The value for "${err.column}" is too long.` : 'One of the values provided is too long.' };
    case '22003': // numeric_value_out_of_range
      return { status: 400, error: err.column ? `The number for "${err.column}" is out of range.` : 'A numeric value is out of range.' };
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return { status: 400, error: err.column ? `The date for "${err.column}" is not valid.` : 'One of the date values is not valid.' };
    case '23502': // not_null_violation
      return { status: 400, error: err.column ? `"${err.column}" is required.` : 'A required field is missing.' };
    case '23514': // check_violation
      return { status: 400, error: err.constraint ? `Validation failed (${err.constraint}).` : 'One of the values provided is not valid.' };
    case '23505': // unique_violation
      return { status: 409, error: 'That already exists.' };
    case '23503': // foreign_key_violation
      return { status: 409, error: 'This refers to a record that does not exist, or is still in use by another record.' };
    default:
      return { status: 500, error: 'An unexpected error occurred. Please try again.' };
  }
}
