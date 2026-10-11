import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
export const rowsOf = (response: any): any[] => Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
export const healthOf = (health?: string) => (({ green: 'on_track', amber: 'at_risk', red: 'critical' } as Record<string,string>)[health ?? ''] ?? health ?? 'on_track');
export function money(value: unknown, currency = 'TZS') {
  const amount = Number(value) || 0;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}
export function moneyTotals(projects: any[], field: string) {
  const totals: Record<string, number> = {};
  for (const project of projects) totals[project.currency || 'TZS'] = (totals[project.currency || 'TZS'] || 0) + (Number(project[field]) || 0);
  return Object.entries(totals).map(([currency, value]) => money(value, currency)).join(' · ') || money(0);
}
export function useProjectRows(endpoint?: string, projectId?: string) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const projects = rowsOf(await apiFetch('/v1/tasks/projects'));
      if (!endpoint) { setRows(projects); return; }
      const selected = projectId ? projects.filter(project => project.id === projectId) : projects;
      const results = await Promise.allSettled(selected.map(async project => rowsOf(await apiFetch(`/v1/project-os/projects/${project.id}/${endpoint}`)).map(row => ({ ...row, project_name: project.name, currency: row.currency ?? project.currency }))));
      setRows(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) setError(`${failures.length} project sections could not load. Retry to refresh the complete list.`);
    } catch (err: any) { setError(err.message || 'Unable to load project records'); }
    finally { setLoading(false); }
  }, [endpoint, projectId]);
  useEffect(() => { void load(); }, [load]);
  return { rows, loading, error, load };
}
