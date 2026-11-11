import { describe, expect, it } from 'vitest';
import { oauthOperationForRequest, oauthResourceForPath } from '../lib/ondi-oauth-access.js';

describe('Ondi OAuth shared API scope mapping', () => {
  it('maps only the explicitly delegated service prefixes', () => {
    expect(oauthResourceForPath('/v1/crm/leads')).toBe('crm');
    expect(oauthResourceForPath('/v1/contacts')).toBe('contacts');
    expect(oauthResourceForPath('/v1/emails')).toBe('email');
    expect(oauthResourceForPath('/v1/email/send')).toBe('email');
    expect(oauthResourceForPath('/v1/email/account')).toBeNull();
    expect(oauthResourceForPath('/v1/shipments/123')).toBe('orders');
    expect(oauthResourceForPath('/v1/admin/platform')).toBeNull();
  });

  it('keeps read, write, delete, and export operations separate', () => {
    expect(oauthOperationForRequest('GET', '/v1/crm/leads')).toBe('read');
    expect(oauthOperationForRequest('POST', '/v1/crm/leads')).toBe('write');
    expect(oauthOperationForRequest('DELETE', '/v1/crm/leads/123')).toBe('delete');
    expect(oauthOperationForRequest('GET', '/v1/crm/leads/export')).toBe('export');
  });
});
