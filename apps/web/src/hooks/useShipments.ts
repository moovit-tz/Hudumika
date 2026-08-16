import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { useWebSocket } from './useWebSocket.js';
import type { CustomerShipmentGroup, ShipmentCase, KPIResponse } from '@hudumika/types';

/**
 * `declaration_status`, `selectivity_channel`, `has_declaration` and `search`
 * are resolved by the API, not in the browser — they came over from
 * /clearos/declarations, which pushed them to the server, and Ops replaces
 * that page. Filtering a loaded array instead would have quietly stopped
 * working once a tenant passes a few hundred shipments.
 */
export function useShipments(filters: {
  assigned_to?: string; stage?: string; workflow_id?: string;
  declaration_status?: string; selectivity_channel?: string;
  has_declaration?: boolean; search?: string;
  checked_in?: boolean;
  pending?: boolean;
} = {}) {
  const [groupedShipments, setGroupedShipments] = useState<CustomerShipmentGroup[]>([]);
  const [kpis, setKpis] = useState<KPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGrouped = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.assigned_to) params.append('assigned_to', filters.assigned_to);
      if (filters.stage) params.append('stage', filters.stage);
      if (filters.workflow_id) params.append('workflow_id', filters.workflow_id);
      if (filters.declaration_status) params.append('declaration_status', filters.declaration_status);
      if (filters.selectivity_channel) params.append('selectivity_channel', filters.selectivity_channel);
      if (filters.has_declaration !== undefined) params.append('has_declaration', String(filters.has_declaration));
      if (filters.search) params.append('search', filters.search);
      if (filters.checked_in) params.append('checked_in', 'true');
      if (filters.pending) params.append('pending', 'true');

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(`/v1/shipments/grouped${queryString}`);
      setGroupedShipments(response.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching grouped shipments:', err);
      setError(err.message || 'Failed to load shipments');
    }
  }, [filters.assigned_to, filters.stage, filters.workflow_id,
      filters.declaration_status, filters.selectivity_channel,
      filters.has_declaration, filters.search, filters.checked_in, filters.pending]);

  const fetchKPIs = useCallback(async () => {
    try {
      // KPIs are only for management, but safe to fetch or catch 403 gracefully
      const response = await apiFetch('/v1/analytics/kpi');
      setKpis(response);
    } catch (err) {
      console.log('User role not permitted to view KPIs or KPI fetch failed.');
    }
  }, []);

  /**
   * `silent` skips the loading flag — for the periodic background poll
   * (see CommandCenter's 15s auto-refresh) and the WebSocket-triggered
   * refetch, where the caller wants fresh data without the consumer
   * unmounting to a full-page skeleton every time. A user-initiated refresh
   * (initial mount, a filter change, "move shipment" completing) still
   * wants the loading state, since the user just did something and a beat
   * of feedback is expected there.
   */
  const refreshAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    await Promise.all([fetchGrouped(), fetchKPIs()]);
    if (!opts?.silent) setLoading(false);
  }, [fetchGrouped, fetchKPIs]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Listen for WebSocket updates
  useWebSocket(
    useCallback(
      (event) => {
        console.log('WebSocket event received on Ops Board:', event);
        // Trigger a silent background refetch when any case details change
        fetchGrouped();
        fetchKPIs();
      },
      [fetchGrouped, fetchKPIs]
    )
  );

  return {
    groupedShipments,
    kpis,
    loading,
    error,
    refresh: refreshAll,
  };
}
