// Real Microsoft identity platform OAuth 2.0 + Graph API integration — same
// shape as google-contacts.ts (this file's own sibling), mirrored
// deliberately so contacts-sync.routes.ts can treat both providers
// uniformly. Requires a real Azure AD app registration (Client ID/Secret),
// entered per-tenant the same way Google's is (Settings ▸ Integrations),
// under its own `int-microsoft` key — mail-oauth.routes.ts and
// calendar-sync.routes.ts each already register their own separate Azure
// app for the same reason (different scopes, different consent screens);
// this follows that same established, if imperfectly unified, convention
// rather than inventing a fourth shape for the same problem.

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_ME_URL = 'https://graph.microsoft.com/v1.0/me';
const MS_CONTACTS_URL = 'https://graph.microsoft.com/v1.0/me/contacts';

export interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface MicrosoftContact {
  externalId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  website: string | null;
  birthday: string | null; // YYYY-MM-DD
}

export function buildMicrosoftAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    // .Read only — this never writes back to the user's real Outlook contacts.
    scope: 'offline_access Contacts.Read User.Read',
    state,
  });
  return `${MS_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeMicrosoftCode(clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<MicrosoftTokens> {
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code',
    }).toString(),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Microsoft rejected the authorization code');
  return data;
}

export async function refreshMicrosoftAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<MicrosoftTokens> {
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
    }).toString(),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Failed to refresh Microsoft access token');
  return data;
}

export async function getMicrosoftAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(MS_ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.mail || data.userPrincipalName || null;
  } catch { return null; }
}

/** Fetches every contact from the user's real Outlook/Microsoft 365 contacts, paginating through the full list. */
export async function fetchAllMicrosoftContacts(accessToken: string): Promise<MicrosoftContact[]> {
  const results: MicrosoftContact[] = [];
  let nextUrl: string | undefined = `${MS_CONTACTS_URL}?$top=100`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Microsoft Graph contacts request failed');

    for (const c of data.value || []) {
      if (!c.givenName && !c.surname && !c.displayName) continue; // no usable name — skip
      results.push({
        externalId: c.id,
        firstName: c.givenName || c.displayName || 'Unnamed',
        lastName: c.surname || null,
        email: c.emailAddresses?.[0]?.address || null,
        phone: c.mobilePhone || c.businessPhones?.[0] || null,
        company: c.companyName || null,
        jobTitle: c.jobTitle || null,
        avatarUrl: null, // Graph exposes photos via a separate binary endpoint per-contact — not worth N extra calls per sync
        website: c.businessHomePage || null,
        birthday: c.birthday ? String(c.birthday).slice(0, 10) : null,
      });
    }

    nextUrl = data['@odata.nextLink'];
  }

  return results;
}
