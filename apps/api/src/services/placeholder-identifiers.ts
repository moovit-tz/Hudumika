/**
 * Identifiers that exist so a path could be tested, and must never be filed.
 *
 * Six tenants carry `registration_number = 'TEST-VRN-NOT-REAL'` so the
 * VAT-registered path could be exercised before go-live. That was a reasonable
 * thing to do and a genuinely dangerous thing to leave: the note explaining it
 * lives in the database and in a backlog item, neither of which is consulted at
 * the moment an invoice is fiscalised. "Remember to clear these before go-live"
 * is a plan, not a control — the whole class of go-live incident is somebody not
 * remembering.
 *
 * So the check moves to the point of use. A placeholder is refused where it
 * would reach a real authority, and allowed everywhere else, which keeps the
 * seeded tenants useful for exactly what they were seeded for.
 */

/**
 * Patterns that no genuine TIN, VRN or EFD identifier matches. Deliberately
 * narrow: this refuses submissions, so a false positive stops a real filing.
 * Each entry is a string that a real authority-issued number would never
 * contain, not a guess at a format.
 */
const PLACEHOLDER_MARKERS = [
  'TEST-VRN-NOT-REAL',
  'NOT-REAL',
  'NOTREAL',
  'PLACEHOLDER',
  'DUMMY',
  'SAMPLE',
  'XXXXXXXX',
  '00000000',
];

/** True when this identifier is one nobody should be filing under. */
export function isPlaceholderIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = String(value).trim().toUpperCase();
  if (!v) return false;
  return PLACEHOLDER_MARKERS.some(m => v.includes(m));
}

/**
 * The refusal message, written for whoever hits it — which is likely somebody
 * who does not know a test number was ever seeded.
 */
export function placeholderRefusal(kind: string, value: string): string {
  return `Refusing to submit: the ${kind} on this workspace is "${value}", a placeholder left from ` +
    `pre-go-live testing rather than a number issued by the authority. Replace it with the real ` +
    `registration before filing anything.`;
}

/**
 * Guard for a submission path. Returns null when everything is fine, or the
 * message to refuse with.
 *
 * Only bites when the submission is going somewhere real: a placeholder in the
 * TRA test environment is exactly what the test environment is for.
 */
export function guardPlaceholders(
  environment: 'test' | 'production' | string | null | undefined,
  identifiers: Record<string, string | null | undefined>,
): string | null {
  if (environment !== 'production') return null;
  for (const [kind, value] of Object.entries(identifiers)) {
    if (isPlaceholderIdentifier(value)) return placeholderRefusal(kind, String(value).trim());
  }
  return null;
}
