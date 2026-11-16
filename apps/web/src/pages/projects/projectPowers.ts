import { useAuth } from '../../hooks/useAuth.js';

/** Mirrors PROJECT_CREATOR_ROLES in apps/api/src/routes/task-projects.routes.ts.
 *  The server is the real gate; this only hides buttons that would be refused. */
const PROJECT_CREATOR_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN', 'MANAGER'];

export function useCanCreateProjects(): boolean {
  const { user } = useAuth();
  return PROJECT_CREATOR_ROLES.includes(user?.role ?? '');
}
