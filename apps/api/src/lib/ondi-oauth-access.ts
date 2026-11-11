/**
 * Maps the shared API surface exposed to Ondi-delegated applications onto the
 * resource-scope catalogue. Everything without an explicit mapping stays
 * session/API-key only until it has a reviewed scope contract.
 */
export function oauthResourceForPath(path: string): string | null {
  const pathname = path.split('?')[0].replace(/\/+$/, '') || '/';
  // `/v1/email` also hosts mailbox and provider-account administration. Only
  // expose the explicitly shared send endpoint; the broader `/v1/emails`
  // resource has its own reviewed scopes.
  if (pathname === '/v1/email/send') return 'email';
  const mappings: [string, string][] = [
    ['/v1/crm', 'crm'],
    ['/v1/contacts', 'contacts'],
    ['/v1/notes', 'notes'],
    ['/v1/emails', 'email'],
    ['/v1/sms', 'sms'],
    ['/v1/invoices', 'invoices'],
    ['/v1/hr/employees', 'employees'],
    ['/v1/comply', 'compliance'],
    ['/v1/compliance', 'compliance'],
    ['/v1/shipments', 'orders'],
    ['/v1/documents', 'documents'],
  ];
  return mappings.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null;
}

export function oauthOperationForRequest(method: string, path: string): string {
  const pathname = path.split('?')[0].toLowerCase();
  if (/\/(export|download|report)(\/|$)/.test(pathname)) return 'export';
  if (method.toUpperCase() === 'DELETE') return 'delete';
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return 'read';
  return 'write';
}

export const OIDC_IDENTITY_SCOPES = new Set(['openid', 'profile', 'email']);


