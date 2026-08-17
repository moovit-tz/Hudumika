/**
 * Governs how a stored file is served back — Content-Type and whether
 * Content-Disposition may be "inline" at all.
 *
 * The stored `mime_type` column is never trustworthy: it's whatever the
 * uploader's multipart request claimed at upload time, and nothing stops a
 * client from uploading real HTML/SVG bytes while labelling the request
 * `text/html`. Serving that back with `Content-Type: text/html` and
 * `Content-Disposition: inline` — which every /preview and the public
 * unauthenticated /:token/download route did until this file existed — is a
 * same-origin stored-XSS primitive: a script tag in an "inline preview" runs
 * with access to this app's own localStorage (where the JWT lives), for any
 * file an attacker gets a victim to open, including a public share link
 * nobody had to log in to view.
 *
 * The fix is to never let a served Content-Type come from client input.
 * INLINE_MIME is a fixed, hand-picked allowlist keyed by the file's
 * extension (itself attacker-influenced, but only ever used here as a
 * lookup key into this table — never interpolated into a header) mirroring
 * exactly the set the frontend already treats as inline-previewable
 * (apps/web/src/pages/cloud/lib/fileTypeStyle.ts's previewKind). Anything
 * else is served as application/octet-stream with a forced attachment
 * disposition — a browser will save it, never execute it, no matter what
 * bytes are actually inside. Paired with the global X-Content-Type-Options:
 * nosniff header (index.ts), a browser can't second-guess an
 * octet-stream/image/pdf label back into HTML either.
 */
const INLINE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav',
};

export function resolveServedContentType(fileType: string): { contentType: string; inlineAllowed: boolean } {
  const ext = (fileType || '').toLowerCase();
  const safe = INLINE_MIME[ext];
  return safe ? { contentType: safe, inlineAllowed: true } : { contentType: 'application/octet-stream', inlineAllowed: false };
}
