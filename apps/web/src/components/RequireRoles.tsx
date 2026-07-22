import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import type { UserRole } from '@hudumika/types';
import { roleHomePath } from '../lib/permissions.js';

interface RequireRolesProps {
  children: React.ReactNode;
  roles: UserRole[];
}

export function RequireRoles({ children, roles }: RequireRolesProps) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (!roles.includes(user.role as UserRole)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return <>{children}</>;
}
