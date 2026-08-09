/**
 * Shared identity for every app.
 *
 * Pictures are stored as base64 data URIs — one of them is 548KB — so they are
 * served from their own endpoint rather than embedded in every payload that
 * mentions a person. An `<img src>` cannot carry an Authorization header, so
 * the image is fetched with one and turned into an object URL.
 *
 * The cache below is what makes that cheap: one request per person per page
 * load, shared by every component that draws them, whichever app it belongs to.
 * Without it, a staff list of forty people would issue forty requests per
 * render.
 */
import { apiFetch, BASE_URL } from './api.js';

export interface Person {
  id: string;
  name: string;
  email?: string;
  role?: string;
  phone?: string;
  active?: boolean;
  has_avatar?: boolean;
  /** Path on the API, not a usable <img src> — see avatarObjectUrl. */
  avatar_url?: string;
  initials: string;
  avatar_color: string;
}

export interface Company {
  id: string;
  kind: string;
  name: string;
  email?: string;
  phone?: string;
  logo_url?: string;
  initials: string;
  avatar_color: string;
}

/** id -> object URL, or null once we know there is no picture. */
const avatarCache = new Map<string, Promise<string | null>>();

export function avatarObjectUrl(userId: string): Promise<string | null> {
  const hit = avatarCache.get(userId);
  if (hit) return hit;

  const p = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/v1/identity/people/${userId}/avatar`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('hudumika_token') ?? ''}` },
      });
      // 404 is the ordinary answer for someone who has not set a picture. It is
      // cached like any other, so we do not ask again on every render.
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  })();

  avatarCache.set(userId, p);
  return p;
}

/**
 * Forget a cached picture, after someone changes theirs, and tell every mounted
 * PersonAvatar to fetch again.
 *
 * The cache is what makes one picture serve every app without a request per
 * render — and it was also why a new picture did not appear anywhere until a
 * full reload: this function existed but nothing ever called it. Dropping the
 * entry is not enough on its own, because components that already resolved a
 * URL are holding it in state; they need to be told.
 */
const avatarSubs = new Set<(userId: string) => void>();

export function onAvatarChanged(fn: (userId: string) => void): () => void {
  avatarSubs.add(fn);
  return () => { avatarSubs.delete(fn); };
}

export function forgetAvatar(userId: string): void {
  const hit = avatarCache.get(userId);
  if (hit) hit.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
  avatarCache.delete(userId);
  avatarSubs.forEach(fn => { try { fn(userId); } catch { /* one listener must not stop the rest */ } });
}

export async function fetchPeople(opts: { ids?: string[]; q?: string; limit?: number } = {}): Promise<Person[]> {
  const params = new URLSearchParams();
  if (opts.ids?.length) params.set('ids', opts.ids.join(','));
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  try {
    return (await apiFetch(`/v1/identity/people?${params}`)) ?? [];
  } catch {
    return [];
  }
}

export async function fetchCompanies(opts: { ids?: string[]; q?: string; limit?: number } = {}): Promise<Company[]> {
  const params = new URLSearchParams();
  if (opts.ids?.length) params.set('ids', opts.ids.join(','));
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  try {
    return (await apiFetch(`/v1/identity/companies?${params}`)) ?? [];
  } catch {
    return [];
  }
}

/** Initials and colour, for anywhere that has a name but no record yet. */
const AVATAR_COLORS = ['#e8461a', '#0891b2', '#7c3aed', '#059669', '#d97706', '#9333ea', '#db2777', '#0284c7'];

export function nameColor(name: string): string {
  const n = name || '?';
  let sum = 0;
  for (let i = 0; i < n.length; i++) sum += n.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function nameInitials(name: string): string {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
}

/**
 * A picture file, centre-cropped square and downscaled, as a JPEG data URI.
 *
 * `users.avatar_url` is a text column holding the image itself, so whatever is
 * uploaded rides along in every payload carrying that user. Uploads used to go
 * in at full size — up to 5MB — for something usually drawn at 32px. 256px of
 * JPEG is about 20KB and indistinguishable at these sizes.
 *
 * Lives here rather than in a page so the self-service and admin paths cannot
 * drift into two different ideas of what an avatar is.
 */
export const AVATAR_EDGE = 256;

export async function squareAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  const bitmap = await createImageBitmap(file);
  const edge = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_EDGE;
  canvas.height = AVATAR_EDGE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image in this browser.');
  ctx.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
  bitmap.close?.();
  // JPEG, not PNG — a photo as PNG is several times larger for no visible gain.
  return canvas.toDataURL('image/jpeg', 0.85);
}
