import { z } from 'zod';

/** Tenant-configurable inputs used when classifying and valuing overtime.
 * Time allocation, billability and corrections intentionally have fixed,
 * conservative behavior because their invariants protect historical records. */
export const hrTimePolicySchema = z.object({
  version: z.number().int().positive().default(1),
  restDays: z.array(z.number().int().min(0).max(6)).max(7).default([0, 6]),
  overtimeMultipliers: z.object({
    normal: z.number().min(1).max(3).default(1.5),
    restDay: z.number().min(1).max(3).default(2),
    publicHoliday: z.number().min(1).max(3).default(2),
  }).strict().default({ normal: 1.5, restDay: 2, publicHoliday: 2 }),
}).strict();

export type HrTimePolicy = z.infer<typeof hrTimePolicySchema>;

export const DEFAULT_HR_TIME_POLICY: HrTimePolicy = hrTimePolicySchema.parse({});

export function readHrTimePolicy(settings: unknown): HrTimePolicy {
  const root = typeof settings === 'string'
    ? (() => { try { return JSON.parse(settings) as Record<string, unknown>; } catch { return {}; } })()
    : settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
  const saved = root['hr-time-policy'];
  const parsed = hrTimePolicySchema.safeParse(saved && typeof saved === 'object' ? saved : {});
  return parsed.success ? parsed.data : DEFAULT_HR_TIME_POLICY;
}

export function overtimeMultiplier(policy: HrTimePolicy, kind: 'NORMAL' | 'REST_DAY' | 'PUBLIC_HOLIDAY'): number {
  if (kind === 'PUBLIC_HOLIDAY') return policy.overtimeMultipliers.publicHoliday;
  if (kind === 'REST_DAY') return policy.overtimeMultipliers.restDay;
  return policy.overtimeMultipliers.normal;
}
