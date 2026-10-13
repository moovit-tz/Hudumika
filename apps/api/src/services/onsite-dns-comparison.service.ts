import type { OnsiteDnsComparisonRecord as RecordValue, OnsiteDnsSyncProposal } from '@hudumika/types';
import { validateRecord } from './onsite-dns.service.js';

export function compareDnsRecords(domain: string, stored: RecordValue[], provider: RecordValue[]) {
  const zone = domain.toLowerCase().replace(/\.$/, '');
  const key = (record: RecordValue) => {
    let name = record.name.toLowerCase().replace(/\.$/, '');
    if (name === zone) name = '@';
    else if (name.endsWith(`.${zone}`)) name = name.slice(0, -(zone.length + 1));
    return JSON.stringify([name, record.type.toUpperCase(), record.ttl, record.value, record.priority ?? null]);
  };
  const remaining = [...stored];
  const providerOnly: RecordValue[] = [];
  let matched = 0;
  for (const record of provider.filter(row => !row.disabled)) {
    const index = remaining.findIndex(row => key(row) === key(record));
    if (index < 0) providerOnly.push(record);
    else { matched++; remaining.splice(index, 1); }
  }
  return { matched, storedOnly: remaining, providerOnly, disabledProviderRecords: provider.filter(row => row.disabled).length };
}

export function proposeDnsSync(domain: string, stored: RecordValue[], provider: RecordValue[]): OnsiteDnsSyncProposal[] {
  const comparison = compareDnsRecords(domain, stored, provider);
  const normalizeName = (name: string) => {
    const zone = domain.toLowerCase().replace(/\.$/, '');
    const value = name.toLowerCase().replace(/\.$/, '');
    return value === zone ? '@' : value.endsWith(`.${zone}`) ? value.slice(0, -(zone.length + 1)) : value;
  };
  const propose = (direction: 'import' | 'publish', records: RecordValue[], destination: RecordValue[]) => records.map(record => {
    const review: string[] = [];
    const invalid = validateRecord(record);
    if (invalid) review.push(invalid);
    const name = normalizeName(record.name);
    if (destination.some(row => !row.disabled && normalizeName(row.name) === name && row.type.toUpperCase() === record.type.toUpperCase())) {
      review.push('Destination has records at this name and type. Review the complete record set before merging.');
    }
    if (destination.some(row => !row.disabled && normalizeName(row.name) === name && (row.type.toUpperCase() === 'CNAME' || record.type.toUpperCase() === 'CNAME'))) {
      review.push('Potential CNAME conflict at this name.');
    }
    if (['MX', 'SRV'].includes(record.type.toUpperCase()) && record.priority == null) review.push('Confirm priority and provider-specific value format.');
    if (record.type.toUpperCase() === 'NS') review.push('Nameserver records require delegation review.');
    return { direction, record, review };
  });
  return [...propose('import', comparison.providerOnly, stored), ...propose('publish', comparison.storedOnly, provider)];
}
