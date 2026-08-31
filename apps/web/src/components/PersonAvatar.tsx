import React, { useEffect, useState } from 'react';
import { avatarObjectUrl, nameColor, nameInitials, onAvatarChanged } from '../lib/identity.js';
import type { SubjectKind } from '../lib/identity.js';
import { subscribePresence } from '../lib/presence.js';
import type { PresenceStatus } from '../lib/presence.js';
import { Tip } from './ui/tooltip.js';

const STATUS_COLOR: Record<PresenceStatus, string> = {
  offline: 'var(--ink3)',
  online: 'var(--gold)',
  clocked_in: 'var(--green)',
};

const STATUS_LABEL: Record<PresenceStatus, string> = {
  offline: 'Offline',
  online: 'Online · clocked out',
  clocked_in: 'Online · clocked in',
};

/**
 * The presence dot — a real, API-linked status (lib/presence.ts), not a
 * fabricated local flag. Only meaningful for `people` (real accounts with a
 * login session); a CRM lead or a candidate has no session to be online in.
 */
function StatusDot({ userId, size, ringColor }: { userId: string; size: number; ringColor: string }) {
  const [status, setStatus] = useState<PresenceStatus | null>(null);
  useEffect(() => subscribePresence(userId, setStatus), [userId]);
  if (!status) return null;

  const dot = Math.max(7, Math.round(size * 0.28));
  const border = Math.max(1.5, Math.round(dot * 0.18));
  return (
    <Tip label={STATUS_LABEL[status]} side="bottom">
      <span
        style={{
          position: 'absolute', bottom: -1, right: -1,
          width: dot, height: dot, borderRadius: '50%',
          background: STATUS_COLOR[status],
          border: `${border}px solid ${ringColor}`,
          boxSizing: 'content-box',
        }}
      />
    </Tip>
  );
}

/**
 * One person's face, drawn the same way in every app.
 *
 * Each app had its own version of this — HRM had `Avatar`, StaffDetail had
 * another, the header inlined a third, and CRM drew companies from stored
 * `avatar_color` / `avatar_initials` columns. They disagreed: the same person
 * appeared in different colours in different apps, and only the ones that
 * happened to fetch `avatar_url` showed a picture at all. That is why the
 * SuperAdmin's photo appeared in NexusHR and nowhere else.
 *
 * Pass a `userId` and the picture is fetched once and shared from a module
 * cache. Pass only a `name` and it draws initials, which is the correct
 * rendering for someone who has not set one — not a fallback, an answer.
 *
 * `kind` says which table the id belongs to. It defaults to `people` because
 * that is all this could address originally; a CRM lead, a contact or a
 * HuduFreight driver passes its own kind and gets the same treatment.
 */
export function PersonAvatar({
  userId, kind = 'people', name, size = 32, src, title, style, onClick, hideStatus, statusRingColor,
}: {
  userId?: string | null;
  kind?: SubjectKind;
  name: string;
  size?: number;
  /** An already-resolved image, when the caller has one. Skips the fetch. */
  src?: string | null;
  title?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  /** Opt out of the online/clocked-in status dot for this one avatar — e.g.
      a giant profile-header photo, or a place a colored dot would clash. On
      by default for real accounts (`kind === 'people'` with a `userId`);
      a CRM lead/candidate/etc. never has one, since they have no session. */
  hideStatus?: boolean;
  /** The dot's ring colour, which should match whatever surface the avatar
      sits on so the dot reads as "cut into" it. Defaults to var(--card-bg),
      right for the overwhelming majority of call sites (table rows, list
      items, plain cards); a colored hero/banner surface should pass its own
      surface color explicitly, the way AttendanceStatusBanner does. */
  statusRingColor?: string;
}) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src) { setUrl(src); return; }
    if (!userId) { setUrl(null); return; }
    let alive = true;
    const load = () => { setFailed(false); avatarObjectUrl(userId, kind).then(u => { if (alive) setUrl(u); }); };
    load();
    // When this person's picture changes anywhere in the app, re-fetch. Without
    // this the module cache — the thing that makes one picture serve every app —
    // also pinned the old one until a full reload.
    const off = onAvatarChanged((changed, changedKind) => {
      if (changed === userId && changedKind === kind) load();
    });
    // Guarded so a picture arriving after the component unmounts does not set
    // state on it.
    return () => { alive = false; off(); };
  }, [userId, kind, src]);

  const common: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  };

  const showStatus = !hideStatus && kind === 'people' && !!userId;

  const avatar = (url && !failed) ? (
    <img
      src={url} alt={name} title={title ?? name} onClick={onClick}
      onError={() => setFailed(true)}
      style={{ ...common, objectFit: 'cover', background: nameColor(name) }}
    />
  ) : (
    <div
      title={title ?? name} onClick={onClick}
      style={{
        ...common,
        background: nameColor(name), color: '#fff',
        fontSize: Math.max(9, Math.round(size * 0.38)), fontWeight: 700,
        letterSpacing: '0.02em', userSelect: 'none',
      }}
    >
      {nameInitials(name)}
    </div>
  );

  if (!showStatus) return avatar;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      {avatar}
      <StatusDot userId={userId!} size={size} ringColor={statusRingColor ?? 'var(--card-bg)'} />
    </span>
  );
}

/**
 * A company's mark. Same rules, square corners.
 *
 * Initials and colour are derived from the name rather than read from the
 * stored `avatar_color` / `avatar_initials` columns, so they stay right when a
 * company is renamed — a stored initial does not follow a rename.
 */
export function CompanyAvatar({
  name, logoUrl, size = 32, shape = 'square', style,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  shape?: 'square' | 'circle';
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const radius = shape === 'circle' ? '50%' : Math.max(4, Math.round(size * 0.22));
  const common: React.CSSProperties = {
    width: size, height: size, borderRadius: radius, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style,
  };

  if (logoUrl && !failed) {
    return (
      <img src={logoUrl} alt={name} title={name} onError={() => setFailed(true)}
        style={{ ...common, objectFit: 'contain', background: 'var(--white)' }} />
    );
  }
  return (
    <div title={name} style={{
      ...common, background: nameColor(name), color: '#fff',
      fontSize: Math.max(9, Math.round(size * 0.36)), fontWeight: 700, userSelect: 'none',
    }}>
      {nameInitials(name)}
    </div>
  );
}
