import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import type { UserRole } from '@hudumika/types';
import { roleHomePath } from '../lib/permissions.js';

interface Props {
  children: React.ReactNode;
  /** Roles that may view anyone's record. */
  roles: UserRole[];
  /** The route param holding the person's id. */
  param?: string;
}

/**
 * A person may always reach their own record; anyone else's needs a role.
 *
 * `RequireRoles` alone is wrong for a profile route. Gating /staff/:id on the
 * management roles meant a junior could not open their own profile at all —
 * they were redirected to their home page, so the self-service payslip, their
 * own leave history and their own attendance were unreachable by the person
 * they belong to.
 *
 * Access level is meant to differentiate what someone *sees* on a profile, not
 * whether they can reach their own. The page itself, and every endpoint behind
 * it, still applies its own rules — this only decides who gets through the
 * door, and the API refuses independently for anything sensitive.
 */
export function RequireSelfOrRoles({ children, roles, param = 'id' }: Props) {
  const { user } = useAuth();
  const params = useParams();
  if (!user) return <Navigate to="/" replace />;

  const targetId = params[param];
  const isSelf = !!targetId && targetId === (user as any).id;
  if (isSelf || roles.includes(user.role as UserRole)) return <>{children}</>;

  return <Navigate to={roleHomePath(user.role)} replace />;
}
