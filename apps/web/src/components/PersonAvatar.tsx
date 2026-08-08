import React, { useEffect, useState } from 'react';
import { avatarObjectUrl, nameColor, nameInitials } from '../lib/identity.js';

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
 */
export function PersonAvatar({
  userId, name, size = 32, src, title, style, onClick,
}: {
  userId?: string | null;
  name: string;
  size?: number;
  /** An already-resolved image, when the caller has one. Skips the fetch. */
  src?: string | null;
  title?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src) { setUrl(src); return; }
    if (!userId) { setUrl(null); return; }
    let alive = true;
    avatarObjectUrl(userId).then(u => { if (alive) setUrl(u); });
    // Guarded so a picture arriving after the component unmounts does not set
    // state on it.
    return () => { alive = false; };
  }, [userId, src]);

  const common: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  };

  if (url && !failed) {
    return (
      <img
        src={url} alt={name} title={title ?? name} onClick={onClick}
        onError={() => setFailed(true)}
        style={{ ...common, objectFit: 'cover', background: nameColor(name) }}
      />
    );
  }

  return (
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
