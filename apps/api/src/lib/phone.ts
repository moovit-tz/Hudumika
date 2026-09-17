/** Last 9 digits only, digits stripped of everything else. Catches the same
 *  number reformatted as +255712345678 / 255712345678 / 0712345678 /
 *  712345678 — the same normalization referral.service.ts's self-referral
 *  detection already relied on, extracted here so sms_opt_outs' compliance
 *  check (HUD-0125) can share it instead of drifting its own copy. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}
