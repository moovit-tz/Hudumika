// Real Google OAuth 2.0 + People API integration — no mock/simulated data
// anywhere in this file. Requires a real Google Cloud OAuth client (Client
// ID/Secret), entered per-tenant in Workspace ▸ Settings ▸ Integrations ▸
// Google (Settings.tsx's GoogleSection, `int-google.oauthId`/`oauthSecret`
// — already existed for "Sign in with Google", reused here since it's the
// same OAuth client concept). That Google Cloud project's OAuth consent
// screen must have this API's redirect URI registered — see buildAuthUrl.

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_PEOPLE_URL = 'https://people.googleapis.com/v1/people/me/connections';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos,birthdays,urls';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleContact {
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

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // .readonly is enough to import/sync — this never writes back to the
    // user's real Google Contacts.
    scope: 'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',      // forces a fresh refresh_token even on a repeat connect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code',
    }).toString(),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Google rejected the authorization code');
  return data;
}

export async function refreshGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
    }).toString(),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Failed to refresh Google access token');
  return data;
}

export async function getGoogleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.email || null;
  } catch { return null; }
}

/** Fetches every connection from the user's real Google Contacts, paginating through the full list. */
export async function fetchAllGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  const results: GoogleContact[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: '200' });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${GOOGLE_PEOPLE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Google People API request failed');

    for (const person of data.connections || []) {
      const name = person.names?.[0];
      if (!name?.givenName && !name?.familyName) continue; // no usable name at all — skip
      const org = person.organizations?.[0];
      results.push({
        externalId: person.resourceName,
        firstName: name?.givenName || name?.displayName || 'Unnamed',
        lastName: name?.familyName || null,
        email: person.emailAddresses?.[0]?.value || null,
        phone: person.phoneNumbers?.[0]?.value || null,
        company: org?.name || null,
        jobTitle: org?.title || null,
        avatarUrl: person.photos?.find((p: any) => !p.default)?.url || person.photos?.[0]?.url || null,
        website: person.urls?.[0]?.value || null,
        birthday: person.birthdays?.[0]?.date
          ? [person.birthdays[0].date.year, person.birthdays[0].date.month, person.birthdays[0].date.day]
              .filter((v) => v != null)
              .map((v, i) => (i === 0 ? String(v) : String(v).padStart(2, '0')))
              .join('-')
          : null,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}
