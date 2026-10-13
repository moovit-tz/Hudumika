import { createHash } from 'node:crypto';
import type { OnsiteDnsComparisonRecord } from '@hudumika/types';
import { compareDnsRecords } from './onsite-dns-comparison.service.js';
import { validateRecord } from './onsite-dns.service.js';

export async function listHostingerWebsites(token: string, page = 1): Promise<{ domains: string[]; page: number }> {
  const response = await fetch(`https://developers.hostinger.com/api/hosting/v1/websites?page=${page}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Hostinger inventory request failed (HTTP ${response.status})`);
  const body = await response.json();
  const rows = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(rows) || rows.some(row => typeof row?.domain !== 'string')) {
    throw new Error('Hostinger returned an unexpected website inventory response');
  }
  // Return domain names only; account details and provider metadata stay server-side.
  return { domains: [...new Set<string>(rows.map(row => row.domain))], page };
}
export async function readHostingerDns(token: string, domain: string) {
  const response = await fetch(`https://developers.hostinger.com/api/dns/v1/zones/${encodeURIComponent(domain)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Hostinger DNS request failed (HTTP ${response.status})`);
  const body = await response.json();
  const groups = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(groups)) throw new Error('Unexpected Hostinger DNS response');
  return groups.flatMap(group => {
    if (typeof group.name !== 'string' || typeof group.type !== 'string' || !Number.isInteger(group.ttl) || !Array.isArray(group.records)) throw new Error('Unexpected Hostinger DNS record');
    return group.records.map((record: { content?: unknown; is_disabled?: unknown }) => {
      if (typeof record.content !== 'string' || (record.is_disabled !== undefined && typeof record.is_disabled !== 'boolean')) throw new Error('Unexpected Hostinger DNS value');
      return { name: group.name as string, type: group.type as string, ttl: group.ttl as number, ...normalizeHostingerDnsValue(group.type, record.content), disabled: record.is_disabled === true };
    });
  });
}
export function normalizeHostingerDnsValue(type: string, value: string): { value: string; priority: number | null } {
  const parts = value.trim().split(/\s+/);
  const validNumber = (part: string) => /^\d+$/.test(part) && Number(part) <= 65535;
  if (type.toUpperCase() === 'MX' && parts.length === 2 && validNumber(parts[0])) {
    return { priority: Number(parts[0]), value: parts[1] };
  }
  if (type.toUpperCase() === 'SRV' && parts.length === 4 && parts.slice(0, 3).every(validNumber)) {
    return { priority: Number(parts[0]), value: parts.slice(1).join(' ') };
  }
  return { value, priority: null };
}
export function dnsFingerprint(records: OnsiteDnsComparisonRecord[]): string {
  const rows = records.map(row => JSON.stringify([row.name, row.type, row.ttl, row.value, row.priority ?? null, row.disabled === true])).sort();
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export async function publishHostingerDns(token: string, domain: string, record: OnsiteDnsComparisonRecord, expectedFingerprint: string) {
  const invalid = validateRecord(record);
  if (invalid) throw new Error(invalid);
  if (['NS', 'MX', 'SRV'].includes(record.type.toUpperCase())) throw new Error('Publishing this record type requires manual review');
  const current = await readHostingerDns(token, domain);
  if (compareDnsRecords(domain, [record], current).matched === 1) return { published: false };
  if (dnsFingerprint(current) !== expectedFingerprint) throw new Error('Provider DNS changed. Reload the preview.');
  const normalizeName = (name: string) => {
    const value = name.toLowerCase().replace(/\.$/, '');
    const zone = domain.toLowerCase().replace(/\.$/, '');
    return value === zone ? '@' : value.endsWith(`.${zone}`) ? value.slice(0, -(zone.length + 1)) : value;
  };
  if (current.some(row => normalizeName(row.name) === normalizeName(record.name) && (row.type.toUpperCase() === record.type.toUpperCase() || row.type.toUpperCase() === 'CNAME' || record.type.toUpperCase() === 'CNAME'))) {
    throw new Error('Provider has a conflicting record set. Automatic overwrite is unavailable.');
  }
  const payload = { overwrite: false, zone: [{ name: record.name, type: record.type.toUpperCase(), ttl: record.ttl, records: [{ content: record.value }] }] };
  const request = async (suffix: string, method: string) => {
    const response = await fetch(`https://developers.hostinger.com/api/dns/v1/zones/${encodeURIComponent(domain)}${suffix}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Hostinger DNS ${method} failed (HTTP ${response.status})`);
  };
  await request('/validate', 'POST');
  if (dnsFingerprint(await readHostingerDns(token, domain)) !== expectedFingerprint) throw new Error('Provider DNS changed during validation. Reload the preview.');
  await request('', 'PUT');
  if (compareDnsRecords(domain, [record], await readHostingerDns(token, domain)).matched !== 1) throw new Error('Provider accepted the update but the record has not been verified. Reload DNS before retrying.');
  return { published: true };
}
