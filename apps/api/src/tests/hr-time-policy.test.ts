import { describe, expect, it } from 'vitest';
import { overtimeMultiplier, readHrTimePolicy, DEFAULT_HR_TIME_POLICY } from '../services/hr-time-policy.service.js';

describe('tenant HR time policy', () => {
  it('uses conservative defaults and safely falls back for malformed stored settings', () => {
    expect(readHrTimePolicy({})).toEqual(DEFAULT_HR_TIME_POLICY);
    expect(readHrTimePolicy('{broken')).toEqual(DEFAULT_HR_TIME_POLICY);
    expect(readHrTimePolicy({ 'hr-time-policy': { restDays: ['Sunday'] } })).toEqual(DEFAULT_HR_TIME_POLICY);
  });

  it('classifies multipliers from the saved tenant policy', () => {
    const policy = readHrTimePolicy({ 'hr-time-policy': {
      version: 4, restDays: [5], overtimeMultipliers: { normal: 1.25, restDay: 1.75, publicHoliday: 2.25 },
    } });
    expect(overtimeMultiplier(policy, 'NORMAL')).toBe(1.25);
    expect(overtimeMultiplier(policy, 'REST_DAY')).toBe(1.75);
    expect(overtimeMultiplier(policy, 'PUBLIC_HOLIDAY')).toBe(2.25);
  });
});
