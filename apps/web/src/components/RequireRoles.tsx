import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import type { UserRole } from '@hudumika/types';
import { roleHomePath } from '../lib/permissions.js';

interface RequireRolesProps {
  children: React.ReactNode;
  roles?: UserRole[];
  permissions?: string[];
}

export function RequireRoles({ children, roles = [], permissions = [] }: RequireRolesProps) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;

  const hasRole = roles.includes(user.role as UserRole);
  const hasPerm = permissions.some(p => user.org_permissions?.includes(p));

  if ((roles.length > 0 || permissions.length > 0) && !hasRole && !hasPerm) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return <>{children}</>;
}
