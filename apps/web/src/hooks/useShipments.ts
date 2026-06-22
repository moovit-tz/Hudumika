import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { useWebSocket } from './useWebSocket.js';
import type { CustomerShipmentGroup, ShipmentCase, KPIResponse } from '@clearos/types';

export function useShipments(filters: { assigned_to?: string; stage?: string } = {}) {
  const [groupedShipments, setGroupedShipments] = useState<CustomerShipmentGroup[]>([]);
  const [kpis, setKpis] = useState<KPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGrouped = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.assigned_to) params.append('assigned_to', filters.assigned_to);
      if (filters.stage) params.append('stage', filters.stage);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(`/v1/shipments/grouped${queryString}`);
      setGroupedShipments(response.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching grouped shipments:', err);
      setError(err.message || 'Failed to load shipments');
    }
  }, [filters.assigned_to, filters.stage]);

  const fetchKPIs = useCallback(async () => {
    try {
      // KPIs are only for management, but safe to fetch or catch 403 gracefully
      const response = await apiFetch('/v1/analytics/kpi');
      setKpis(response);
    } catch (err) {
      console.log('User role not permitted to view KPIs or KPI fetch failed.');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchGrouped(), fetchKPIs()]);
    setLoading(false);
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
