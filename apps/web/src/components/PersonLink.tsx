import React from 'react';
import { Link } from 'react-router-dom';
import { PersonAvatar } from './PersonAvatar.js';
import { useAuth } from '../hooks/useAuth.js';

/**
 * One person, shown the same way and reaching the same profile, from anywhere.
 *
 * A person turns up in ClearOS cases, CRM, tickets, tasks, overtime claims and
 * the org chart. Each place rendered them its own way — some initials, some a
 * bare name, none of them going anywhere — so there was no way to get from
 * "Fatuma approved this" to who Fatuma is. `PersonAvatar` fixed how a person
 * *looks*; this fixes where they *lead*.
 *
 * The route lives here and only here. When the profile URL changes, it changes
 * once instead of in every page that hardcoded `/nexushr/staff/${id}`.
 */

/** The one place a person's profile URL is decided. */
export const personProfilePath = (userId: string) => `/nexushr/staff/${userId}`;

/** Roles that may open somebody else's record — mirrors the API's own rule. */
const HR_VIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

export function PersonLink({
  userId, name, subtitle, size = 28, avatar = true, style, nameStyle,
}: {
  userId?: string | null;
  name?: string | null;
  /** Job title, email, role — whatever identifies them in this context. */
  subtitle?: string | null;
  size?: number;
  avatar?: boolean;
  style?: React.CSSProperties;
  nameStyle?: React.CSSProperties;
}) {
  const { user } = useAuth();
  const label = (name ?? '').trim();

  // Somebody who is recorded but not named — an unassigned ticket, a deleted
  // account — reads as "Unassigned", not as an empty row that looks like a bug.
  if (!label && !userId) {
    return <span style={{ color: 'var(--ink4)', fontSize: 13, ...style }}>Unassigned</span>;
  }

  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, ...style }}>
      {avatar && <PersonAvatar userId={userId ?? undefined} name={label || '?'} size={size} />}
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', ...nameStyle }}>
          {label || 'Unknown'}
        </span>
        {subtitle && (
          <span style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );

  /**
   * Only a link when it would actually open. The API refuses another person's
   * record to anyone outside the HR roles, so linking regardless would hand
   * most users a link to a 403 — which is worse than plain text, because it
   * looks like something they are being kept from rather than something that
   * was never theirs to see.
   */
  const mayOpen = !!userId && (user?.id === userId || HR_VIEWER_ROLES.includes(user?.role ?? ''));
  if (!mayOpen) return body;

  return (
    <Link
      to={personProfilePath(userId!)}
      style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', minWidth: 0 }}
      title={`Open ${label}’s profile`}
    >
      {body}
    </Link>
  );
}
