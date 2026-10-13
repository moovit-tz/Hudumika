import { describe, expect, it } from 'vitest';
import { compareDnsRecords, proposeDnsSync } from '../services/onsite-dns-comparison.service.js';
describe('Provider DNS comparison', () => {
  const record = { name: '@', type: 'A', ttl: 300, value: '192.0.2.1' };
  it('proposes alternative directions and flags same-name record-set drift', () => {
    const plan = proposeDnsSync('example.tz', [record], [{ ...record, value: '192.0.2.2' }]);
    expect(plan.map(item => item.direction)).toEqual(['import', 'publish']);
    expect(plan.every(item => item.review.some(reason => reason.includes('complete record set')))).toBe(true);
  });
  it('flags CNAME and MX conflicts without offering deletions', () => {
    const plan = proposeDnsSync('example.tz', [record], [{ ...record, type: 'CNAME', value: 'target.example.tz' }, { ...record, type: 'MX', value: '10 mail.example.tz' }]);
    expect(plan.some(item => item.review.some(reason => reason.includes('CNAME')))).toBe(true);
    expect(plan.some(item => item.review.some(reason => reason.includes('priority')))).toBe(true);
    expect(plan.every(item => ['import', 'publish'].includes(item.direction))).toBe(true);
  });
  it('normalizes zone names and preserves TTL drift', () => {
    expect(compareDnsRecords('example.tz', [record], [{ ...record, name: 'EXAMPLE.TZ.' }]).matched).toBe(1);
    expect(compareDnsRecords('example.tz', [record], [{ ...record, ttl: 600 }]).providerOnly).toHaveLength(1);
  });
  it('compares duplicate records as a multiset and excludes disabled provider records', () => {
    const result = compareDnsRecords('example.tz', [record, record], [record, { ...record, disabled: true }]);
    expect(result.matched).toBe(1);
    expect(result.storedOnly).toHaveLength(1);
    expect(result.disabledProviderRecords).toBe(1);
  });
  it('does not erase TXT case or MX priority differences', () => {
    expect(compareDnsRecords('example.tz', [{ ...record, type: 'TXT', value: 'AbC' }], [{ ...record, type: 'TXT', value: 'abc' }]).matched).toBe(0);
    expect(compareDnsRecords('example.tz', [{ ...record, type: 'MX', priority: 10 }], [{ ...record, type: 'MX' }]).matched).toBe(0);
  });
});
