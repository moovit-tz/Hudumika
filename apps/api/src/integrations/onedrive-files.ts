/**
 * OneDrive / Microsoft 365 file listing via Microsoft Graph, for the Drive
 * app's "Connected Apps" third-party sync.
 *
 * Per-tenant BYO OAuth app (its own consent screen + Files.Read scope) —
 * same convention as the Outlook contact sync (contacts-sync.routes.ts /
 * microsoft-contacts.ts), whose token exchange/refresh/account-email
 * helpers this reuses directly. Only the auth-URL scope and the actual
 * file-listing walk are OneDrive-specific.
 *
 * Read-only: it lists what's in the user's OneDrive into cloud_external_files
 * so it shows up in the connected-storage view; it never writes back.
 */
export {
  exchangeMicrosoftCode as exchangeOneDriveCode,
  refreshMicrosoftAccessToken as refreshOneDriveToken,
  getMicrosoftAccountEmail as getOneDriveAccountEmail,
} from './microsoft-contacts.js';

const MS_AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const GRAPH = 'https://graph.microsoft.com/v1.0';

export function buildOneDriveAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    // .Read only — never writes to the user's OneDrive.
    scope: 'offline_access Files.Read User.Read',
    state,
  });
  return `${MS_AUTHORIZE_URL}?${params.toString()}`;
}

export interface ExternalFile {
  externalId: string;
  name: string;
  type: string;            // 'folder' or a lowercase extension
  size: number | null;
  webUrl: string | null;
  path: string | null;
  parentExternalId: string | null;
}

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() || 'file';

/**
 * Walks the user's OneDrive breadth-first from the root, capped so a huge
 * drive can't run unbounded. Folders are included (as type 'folder') so the
 * connected view can show structure.
 */
export async function listOneDriveFiles(
  accessToken: string,
  opts: { maxItems?: number; maxDepth?: number } = {},
): Promise<ExternalFile[]> {
  const maxItems = opts.maxItems ?? 2000;
  const maxDepth = opts.maxDepth ?? 6;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const out: ExternalFile[] = [];
  // queue of [graphChildrenUrl, parentExternalId, depth]
  const queue: [string, string | null, number][] = [[`${GRAPH}/me/drive/root/children`, null, 0]];

  while (queue.length && out.length < maxItems) {
    const [startUrl, parentId, depth] = queue.shift()!;
    let url: string | undefined = `${startUrl}?$top=200&$select=id,name,size,folder,file,webUrl,parentReference`;
    while (url && out.length < maxItems) {
      const res: Response = await fetch(url, { headers });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Graph listing failed (${res.status})`);
      for (const item of data.value ?? []) {
        const isFolder = !!item.folder;
        out.push({
          externalId: item.id,
          name: item.name,
          type: isFolder ? 'folder' : extOf(item.name),
          size: typeof item.size === 'number' ? item.size : null,
          webUrl: item.webUrl ?? null,
          path: item.parentReference?.path ? `${item.parentReference.path}/${item.name}` : item.name,
          parentExternalId: parentId,
        });
        if (isFolder && depth + 1 < maxDepth) {
          queue.push([`${GRAPH}/me/drive/items/${item.id}/children`, item.id, depth + 1]);
        }
      }
      url = data['@odata.nextLink'];
    }
  }
  return out;
}
