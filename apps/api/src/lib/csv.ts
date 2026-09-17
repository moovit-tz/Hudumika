/** Escapes one CSV field — quoted only when it actually needs it (contains
 *  a comma, a quote, or a newline), matching the same rule every CSV
 *  producer in this codebase already applies inline (e.g.
 *  contacts.service.ts's own private csvField). Shared here instead of a
 *  third copy-pasted version, since the CMS export routes need this for
 *  three different resource types. */
export function csvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds a full CSV document (header row + data rows, CRLF line endings —
 *  the convention Excel and every other CSV producer here already uses)
 *  from plain arrays, so a caller never hand-joins rows itself. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) lines.push(row.map(csvField).join(','));
  return lines.join('\r\n');
}
