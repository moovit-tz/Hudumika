/**
 * DNS records: validation, import, export and setup templates.
 *
 * The record editor accepted anything. An unsupported type reached the CHECK
 * constraint and came back as a raw 500 carrying Postgres error 23514; an A
 * record would happily store "not an address"; an MX record could be saved
 * with no priority, which is not a valid MX record at all. And a delete was a
 * delete — removing the last MX record silently ended mail delivery for the
 * domain with nothing said about it.
 *
 * ONSITE.md asks for validation and dangerous-change warnings (§13), import
 * and export (§12), and templates that generate records but require
 * confirmation before applying them (§15). This is that, and nothing here
 * talks to a DNS provider: these are the records Onsite holds, which is what
 * the editor has always been editing.
 */

/** The types onsite_dns_records' CHECK constraint accepts. Keep the two in step. */
export const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR', 'ALIAS'] as const;
export type DnsType = (typeof DNS_TYPES)[number];

export interface DnsRecordInput {
  name: string;
  type: string;
  value: string;
  ttl?: number | null;
  priority?: number | null;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
// Deliberately permissive: enough to reject an IPv4 or a sentence, not a full
// RFC 4291 parser. A wrong-but-plausible address is the registrar's to refuse.
const IPV6 = /^[0-9a-fA-F:]+$/;
const HOSTNAME = /^(\*\.)?([a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)*[a-zA-Z]{2,}\.?$/;

/**
 * Why a record cannot be saved, in words that say what to do about it.
 * Returns null when the record is valid.
 */
export function validateRecord(r: DnsRecordInput): string | null {
  const name = (r.name ?? '').trim();
  const value = (r.value ?? '').trim();
  const type = (r.type ?? '').trim().toUpperCase();

  if (!name) return 'A record needs a name. Use "@" for the domain itself.';
  if (!type) return 'A record needs a type.';
  if (!DNS_TYPES.includes(type as DnsType)) {
    return `"${r.type}" is not a DNS record type Onsite stores. Use one of: ${DNS_TYPES.join(', ')}.`;
  }
  if (!value) return 'A record needs a value.';

  if (r.ttl != null && (!Number.isInteger(r.ttl) || r.ttl < 60 || r.ttl > 604800)) {
    return 'TTL must be a whole number of seconds between 60 and 604800 (one week).';
  }

  switch (type as DnsType) {
    case 'A':
      if (!IPV4.test(value)) return `An A record points at an IPv4 address. "${value}" is not one — use AAAA for IPv6, or CNAME for a hostname.`;
      break;
    case 'AAAA':
      if (IPV4.test(value) || !IPV6.test(value) || !value.includes(':')) {
        return `An AAAA record points at an IPv6 address. "${value}" is not one — use A for IPv4.`;
      }
      break;
    case 'CNAME':
    case 'ALIAS':
    case 'NS':
    case 'PTR':
      if (IPV4.test(value)) return `A ${type} record points at a hostname, not an IP address. Use an A record for "${value}".`;
      if (!HOSTNAME.test(value)) return `"${value}" is not a valid hostname for a ${type} record.`;
      break;
    case 'MX':
      if (IPV4.test(value)) return 'An MX record points at a mail server’s hostname, not an IP address.';
      if (!HOSTNAME.test(value)) return `"${value}" is not a valid mail server hostname.`;
      // Not a nicety: a resolver cannot order mail servers without it.
      if (r.priority == null || !Number.isInteger(r.priority) || r.priority < 0 || r.priority > 65535) {
        return 'An MX record needs a priority between 0 and 65535 — lower is tried first.';
      }
      break;
    case 'TXT':
      if (value.length > 4096) return 'A TXT value cannot exceed 4096 characters.';
      break;
    case 'SRV':
      // _service._proto.name, and the value carries weight/port/target.
      if (!name.startsWith('_')) return 'An SRV record’s name looks like _service._proto (for example _sip._tcp).';
      if (value.split(/\s+/).length < 3) return 'An SRV value is "weight port target" (for example "5 5060 sip.example.com").';
      break;
    case 'CAA':
      if (value.split(/\s+/).length < 3) return 'A CAA value is "flags tag value" (for example ‘0 issue "letsencrypt.org"’).';
      break;
  }
  return null;
}

/**
 * What breaks if this record goes.
 *
 * Returned for confirmation before a delete, per ONSITE.md §62 — the point is
 * that somebody removing the last MX record is told that mail stops, rather
 * than finding out from their customers.
 */
export function deletionImpact(
  record: { name: string; type: string; value: string },
  siblings: { name: string; type: string }[],
): string | null {
  const type = record.type.toUpperCase();
  const remaining = siblings.filter(
    s => s.type.toUpperCase() === type && !(s.name === record.name && s.type === record.type),
  ).length;

  if (type === 'MX' && remaining === 0) {
    return 'This is the last MX record for this domain. Removing it stops email delivery to this domain.';
  }
  if (type === 'NS' && remaining <= 1) {
    return 'Removing a nameserver record can make the whole domain unresolvable.';
  }
  if ((type === 'A' || type === 'AAAA' || type === 'CNAME') && (record.name === '@' || record.name === '')) {
    return 'This record points the domain itself at your site. Removing it takes the website offline.';
  }
  if (type === 'TXT' && /^v=spf1/i.test(record.value)) {
    return 'This is the SPF record. Removing it makes your outgoing mail more likely to be treated as spam.';
  }
  if (type === 'TXT' && /_dmarc/i.test(record.name)) {
    return 'This is the DMARC policy. Removing it weakens protection against others sending mail as your domain.';
  }
  return null;
}

/* ── Export ───────────────────────────────────────────────────── */

export interface StoredRecord {
  name: string;
  type: string;
  value: string;
  ttl: number | null;
  priority: number | null;
}

/**
 * A BIND-style zone file.
 *
 * Chosen over a bespoke format because every registrar and DNS host already
 * reads it — an export nobody else can import is a backup, not portability.
 */
export function toZoneFile(domain: string, records: StoredRecord[]): string {
  const lines = [
    `; Zone export for ${domain}`,
    `; Generated by Hudumika Onsite on ${new Date().toISOString()}`,
    `; ${records.length} record${records.length === 1 ? '' : 's'}`,
    '',
  ];
  for (const r of records) {
    const name = r.name === '@' ? '@' : r.name;
    const ttl = r.ttl ?? 3600;
    const type = r.type.toUpperCase();
    const value = type === 'TXT' && !r.value.startsWith('"') ? `"${r.value}"` : r.value;
    const priority = type === 'MX' && r.priority != null ? `${r.priority} ` : '';
    lines.push(`${name}\t${ttl}\tIN\t${type}\t${priority}${value}`);
  }
  return lines.join('\n') + '\n';
}

/* ── Import ───────────────────────────────────────────────────── */

export interface ParsedLine {
  line: number;
  raw: string;
  record: DnsRecordInput | null;
  error: string | null;
}

/**
 * Parse a zone file.
 *
 * Comments and blank lines are skipped; $ORIGIN/$TTL directives are
 * acknowledged and ignored, since Onsite stores records against a zone it
 * already knows the origin of. Every other line either produces a record or an
 * error naming its line number — an import that silently drops what it did not
 * understand is worse than one that refuses.
 */
export function parseZoneFile(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/;.*$/, '').trim();
    if (!stripped) continue;
    if (stripped.startsWith('$')) continue;

    // name [ttl] [IN] type [priority] value...
    const parts = stripped.split(/\s+/);
    let idx = 0;
    const name = parts[idx++] ?? '';
    let ttl: number | null = null;
    if (/^\d+$/.test(parts[idx] ?? '')) ttl = Number(parts[idx++]);
    if ((parts[idx] ?? '').toUpperCase() === 'IN') idx++;
    if (ttl === null && /^\d+$/.test(parts[idx] ?? '')) ttl = Number(parts[idx++]);

    const type = (parts[idx++] ?? '').toUpperCase();
    if (!type) {
      out.push({ line: i + 1, raw, record: null, error: 'No record type found on this line.' });
      continue;
    }

    let priority: number | null = null;
    if (type === 'MX' && /^\d+$/.test(parts[idx] ?? '')) priority = Number(parts[idx++]);

    const value = parts.slice(idx).join(' ').replace(/^"(.*)"$/, '$1');
    const record: DnsRecordInput = { name, type, value, ttl, priority };
    const error = validateRecord(record);
    out.push({ line: i + 1, raw, record: error ? null : record, error });
  }
  return out;
}

/** How an imported record compares with what is already stored. */
export type ImportAction = 'create' | 'unchanged';

export interface ImportPlanRow {
  action: ImportAction;
  record: DnsRecordInput;
}

/**
 * What an import would do, without doing it.
 *
 * A record's identity here is name+type+value (plus priority for MX), so
 * importing the same file twice creates nothing the second time — ONSITE.md
 * §63 asks for exactly this, and a DNS editor that duplicates every record on
 * a repeated import is actively dangerous.
 */
export function planImport(parsed: DnsRecordInput[], existing: StoredRecord[]): ImportPlanRow[] {
  const key = (r: { name: string; type: string; value: string; priority?: number | null }) =>
    `${r.name.toLowerCase()}|${r.type.toUpperCase()}|${r.value.toLowerCase()}|${r.priority ?? ''}`;
  const have = new Set(existing.map(key));
  return parsed.map(r => ({ action: have.has(key(r)) ? 'unchanged' : 'create', record: r }));
}

/* ── Templates ────────────────────────────────────────────────── */

export interface DnsTemplate {
  id: string;
  label: string;
  description: string;
  /** What the caller must supply, e.g. the server's IP. */
  inputs: { key: string; label: string; placeholder: string }[];
  build: (vars: Record<string, string>) => DnsRecordInput[];
}

/**
 * Common setups, as records to review.
 *
 * §15 is explicit that a template generates records and then requires
 * confirmation — so these are pure functions returning records. Nothing here
 * writes, and the caller posts back whichever rows the user accepted.
 */
export const DNS_TEMPLATES: DnsTemplate[] = [
  {
    id: 'website',
    label: 'Website',
    description: 'Point the domain and www at one server.',
    inputs: [{ key: 'ip', label: 'Server IPv4 address', placeholder: '203.0.113.10' }],
    build: ({ ip }) => [
      { name: '@', type: 'A', value: ip, ttl: 3600 },
      { name: 'www', type: 'A', value: ip, ttl: 3600 },
    ],
  },
  {
    id: 'google-workspace',
    label: 'Google Workspace',
    description: 'Mail routing and SPF for Google Workspace.',
    inputs: [],
    build: () => [
      { name: '@', type: 'MX', value: 'smtp.google.com', ttl: 3600, priority: 1 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 },
    ],
  },
  {
    id: 'microsoft-365',
    label: 'Microsoft 365',
    description: 'Mail routing, SPF and Autodiscover for Microsoft 365.',
    inputs: [{ key: 'tenant', label: 'Microsoft tenant name', placeholder: 'contoso' }],
    build: ({ tenant }) => [
      { name: '@', type: 'MX', value: `${tenant}.mail.protection.outlook.com`, ttl: 3600, priority: 0 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:spf.protection.outlook.com -all', ttl: 3600 },
      { name: 'autodiscover', type: 'CNAME', value: 'autodiscover.outlook.com', ttl: 3600 },
    ],
  },
  {
    id: 'email-security',
    label: 'Email security (DMARC)',
    description: 'A DMARC policy that reports without rejecting, which is where to start.',
    inputs: [{ key: 'report_to', label: 'Send reports to', placeholder: 'postmaster@example.com' }],
    build: ({ report_to }) => [
      { name: '_dmarc', type: 'TXT', value: `v=DMARC1; p=none; rua=mailto:${report_to}`, ttl: 3600 },
    ],
  },
];
