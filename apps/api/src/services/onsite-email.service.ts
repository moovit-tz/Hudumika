import dns from 'node:dns/promises';
import type { MailDnsRecord } from '@hudumika/types';
import { z } from 'zod';

export const mailDnsRecordsSchema = z.array(z.object({
  name: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9_.@-]+$/),
  type: z.enum(['MX', 'TXT', 'CNAME']), value: z.string().trim().min(1).max(4096),
  priority: z.number().int().min(0).max(65535).optional(), ttl: z.number().int().min(60).max(86400).default(3600),
  purpose: z.enum(['mx', 'spf', 'dkim', 'dmarc', 'verification']),
})).max(30).superRefine((records, ctx) => {
  records.forEach((record, index) => {
    if (/REPLACE_WITH|\.\.\.|placeholder/i.test(record.value)) ctx.addIssue({ code: 'custom', path: [index, 'value'], message: 'Use the real provider-issued value.' });
    if ((record.purpose === 'mx' && record.type !== 'MX') ||
        (['spf', 'dmarc'].includes(record.purpose) && record.type !== 'TXT') ||
        (record.purpose === 'spf' && !record.value.startsWith('v=spf1 ')) ||
        (record.purpose === 'dmarc' && !/^v=DMARC1;.*\bp=(none|quarantine|reject)(;|$)/.test(record.value)) ||
        (record.purpose === 'dkim' && (record.type === 'MX' || !record.name.includes('._domainkey') ||
          (record.type === 'TXT' && !/\bp=[A-Za-z0-9+/]+={0,2}(;|$)/.test(record.value))))) {
      ctx.addIssue({ code: 'custom', path: [index], message: 'Record type, name or value does not match its mail purpose.' });
    }
  });
});

export interface MailDnsVerification {
  mx: { found: boolean; records: string[]; expected: string[] };
  spf: { found: boolean; record: string | null };
  dkim: { found: boolean; selector: string };
  dmarc: { found: boolean; record: string | null };
  checks: { name: string; type: string; purpose: string; matched: boolean; error: string | null }[];
}
const host = (value: string) => value.toLowerCase().replace(/\.$/, '');
const txt = (value: string) => value.trim().replace(/\s+/g, ' ');

export async function verifyMailDns(domain: string, expected: MailDnsRecord[]): Promise<MailDnsVerification> {
  const result: MailDnsVerification = {
    mx: { found: false, records: [], expected: expected.filter(record => record.purpose === 'mx').map(record => record.value) },
    spf: { found: false, record: null }, dkim: { found: false, selector: '' }, dmarc: { found: false, record: null }, checks: [],
  };
  for (const record of expected) {
    const name = record.name === '@' ? domain : host(record.name).endsWith(`.${domain}`) ? record.name : `${record.name}.${domain}`;
    let matched = false;
    let error: string | null = null;
    try {
      if (record.type === 'MX') {
        const values = await dns.resolveMx(name);
        result.mx.records = values.map(value => `${value.priority} ${value.exchange}`);
        matched = values.some(value => host(value.exchange) === host(record.value) && value.priority === (record.priority ?? 10));
      } else if (record.type === 'CNAME') matched = (await dns.resolveCname(name)).some(value => host(value) === host(record.value));
      else {
        // Chunks belong to one TXT RR; joining different RRs can falsely validate a DKIM key.
        const values = (await dns.resolveTxt(name)).map(chunks => chunks.join(''));
        matched = values.some(value => txt(value) === txt(record.value));
        if (record.purpose === 'spf') {
          const spf = values.filter(value => value.startsWith('v=spf1'));
          result.spf.record = spf[0] ?? null;
          matched = matched && spf.length === 1;
        }
        if (record.purpose === 'dmarc') result.dmarc.record = values.find(value => value.startsWith('v=DMARC1')) ?? null;
      }
    } catch { error = 'Record is unavailable from DNS.'; }
    result.checks.push({ name, type: record.type, purpose: record.purpose, matched, error });
  }
  for (const purpose of ['mx', 'spf', 'dkim', 'dmarc'] as const) {
    const checks = result.checks.filter(check => check.purpose === purpose);
    result[purpose].found = checks.length > 0 && checks.every(check => check.matched);
  }
  result.dkim.selector = expected.filter(record => record.purpose === 'dkim').map(record => record.name.split('._domainkey')[0]).join(', ');
  return result;
}
