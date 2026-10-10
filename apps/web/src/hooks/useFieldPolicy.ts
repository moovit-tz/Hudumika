import { useEffect, useState } from 'react';
import type { FieldPolicyResource, FieldGroup, FieldPolicyMatrix, UserRole } from '@hudumika/types';
import { FIELD_GROUPS, FIELD_GROUP_LABELS, RESOURCE_FIELD_MAP, DEFAULT_FIELD_POLICIES } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from './useAuth.js';

type Visibility = Record<FieldPolicyResource, FieldGroup[]>;

let cached: Visibility | null = null;
let cacheRole: string | null = null;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

export function useFieldPolicy(resource?: FieldPolicyResource) {
  const { user } = useAuth();
  const [visibility, setVisibility] = useState<Visibility | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!user) return;

    if (cached && cacheRole === user.role) {
      setVisibility(cached);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    apiFetch<Visibility>('/v1/field-policies/my-visibility')
      .then(result => {
        cached = result;
        cacheRole = user.role;
        if (alive) {
          setVisibility(result);
          setLoading(false);
        }
        notify();
      })
      .catch(() => {
        const fallback = buildFallback(user.role);
        cached = fallback;
        cacheRole = user.role;
        if (alive) {
          setVisibility(fallback);
          setLoading(false);
        }
      });

    return () => { alive = false; };
  }, [user?.role]);

  useEffect(() => {
    const handler = () => setVisibility(cached);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const groups = resource ? (visibility?.[resource] ?? []) : [];

  const canSee = (group: FieldGroup) =>
    !resource ? true : groups.includes(group);

  return {
    visibility,
    loading,
    canSee,
    visibleGroups: groups,
  };
}

export function useFieldPolicyAdmin() {
  const [matrix, setMatrix] = useState<FieldPolicyMatrix[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch<FieldPolicyMatrix[]>('/v1/field-policies')
      .then(result => { if (alive) setMatrix(result); })
      .catch(err => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function save(policies: { resource: string; field_group: string; allowed_roles: string[] }[]) {
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/field-policies', {
        method: 'PUT',
        body: JSON.stringify({ policies }),
      });
      cached = null;
      cacheRole = null;
      notify();
      const fresh = await apiFetch<FieldPolicyMatrix[]>('/v1/field-policies');
      setMatrix(fresh);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault(resource: FieldPolicyResource, group: FieldGroup) {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/field-policies/${resource}/${group}`, { method: 'DELETE' });
      cached = null;
      cacheRole = null;
      notify();
      const fresh = await apiFetch<FieldPolicyMatrix[]>('/v1/field-policies');
      setMatrix(fresh);
    } catch (err: any) {
      setError(err.message ?? 'Failed to reset.');
    } finally {
      setSaving(false);
    }
  }

  return { matrix, loading, saving, error, save, resetToDefault };
}

function buildFallback(role: UserRole): Visibility {
  const result = {} as Visibility;
  for (const resource of Object.keys(DEFAULT_FIELD_POLICIES) as FieldPolicyResource[]) {
    const groups: FieldGroup[] = [];
    for (const group of FIELD_GROUPS) {
      const allowed = DEFAULT_FIELD_POLICIES[resource][group];
      if (role === 'SUPER_ADMIN' || (allowed as readonly string[]).includes(role)) {
        groups.push(group);
      }
    }
    result[resource] = groups;
  }
  return result;
}
