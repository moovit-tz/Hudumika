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
export function driverErrorResponse(code: string): { status: number; error: string } {
  switch (code) {
    case '22P02': // invalid_text_representation — e.g. a malformed uuid/number
    case '22001': // string_data_right_truncation
    case '22003': // numeric_value_out_of_range
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
    case '23502': // not_null_violation
    case '23514': // check_violation
      return { status: 400, error: 'One of the values provided is not valid.' };
    case '23505': // unique_violation
      return { status: 409, error: 'That already exists.' };
    case '23503': // foreign_key_violation
      return { status: 409, error: 'This refers to a record that does not exist, or is still in use by another record.' };
    default:
      return { status: 500, error: 'An unexpected error occurred. Please try again.' };
  }
}
