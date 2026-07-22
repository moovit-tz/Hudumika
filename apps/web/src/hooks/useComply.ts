import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import type {
  CompDashboardStats,
  CompCertificate,
  CompApplication,
  CompObligation,
  CompRenewal,
  CreateApplicationInput,
  UpdateApplicationInput,
  CompAgencyDirectoryEntry,
  CompCalendarEvent,
  CreateCertificateInput,
  CreateReminderInput,
  CompLegalFirm,
  CompLegalEngagement,
  CreateEngagementInput,
  ObligationScanInput,
  ObligationScanResult,
  CompProfile,
  UpdateCertificateInput,
  CompBrelaSearchHistoryEntry,
  CompLicenseCatalogEntry,
} from '@hudumika/types';

// ── useComplyDashboard ────────────────────────────────────────────────────────

export function useComplyDashboard() {
  const [data, setData]       = useState<CompDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch('/v1/comply/dashboard');
      setData(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refresh: load };
}

// ── useComplyCertificates ─────────────────────────────────────────────────────

export function useComplyCertificates(status?: string) {
  const [certs, setCerts]     = useState<CompCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const qs = status ? `?status=${status}` : '';
      const result = await apiFetch(`/v1/comply/certificates${qs}`);
      setCerts(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const sync = useCallback(async (agencyCode: string, tin: string) => {
    await apiFetch(`/v1/comply/sync/${agencyCode}`, {
      method: 'POST',
      body: JSON.stringify({ tin }),
    });
    await load();
  }, [load]);

  const create = useCallback(async (input: CreateCertificateInput) => {
    const created = await apiFetch('/v1/comply/certificates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await load();
    return created as CompCertificate;
  }, [load]);

  const update = useCallback(async (id: string, input: UpdateCertificateInput) => {
    await apiFetch(`/v1/comply/certificates/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    await load();
  }, [load]);

  const revoke = useCallback(async (id: string) => {
    await apiFetch(`/v1/comply/certificates/${id}`, { method: 'DELETE' });
    await load();
  }, [load]);

  return { certs, loading, error, refresh: load, sync, create, update, revoke };
}

// ── useComplyApplications ─────────────────────────────────────────────────────

export function useComplyApplications(statusFilter?: string) {
  const [apps, setApps]       = useState<CompApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const result = await apiFetch(`/v1/comply/applications${qs}`);
      setApps(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: CreateApplicationInput) => {
    const created = await apiFetch('/v1/comply/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await load();
    return created as CompApplication;
  }, [load]);

  const update = useCallback(async (id: string, input: UpdateApplicationInput) => {
    await apiFetch(`/v1/comply/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/v1/comply/applications/${id}`, { method: 'DELETE' });
    await load();
  }, [load]);

  return { apps, loading, error, refresh: load, create, update, remove };
}

// ── useComplyObligations ──────────────────────────────────────────────────────

export function useComplyObligations() {
  const [obligations, setObligations] = useState<CompObligation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch('/v1/comply/obligations');
      setObligations(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: { obligation_code: string; agency_code: string; name: string; frequency: string; mandatory?: boolean; due_date?: string | null; customer_id?: string | null }) => {
    const created = await apiFetch('/v1/comply/obligations', { method: 'POST', body: JSON.stringify(input) });
    await load();
    return created as CompObligation;
  }, [load]);

  const update = useCallback(async (id: string, input: { status?: string; due_date?: string | null; last_fulfilled_date?: string | null; customer_id?: string | null }) => {
    await apiFetch(`/v1/comply/obligations/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/v1/comply/obligations/${id}`, { method: 'DELETE' });
    await load();
  }, [load]);

  return { obligations, loading, error, refresh: load, create, update, remove };
}

// ── useComplyRenewals ─────────────────────────────────────────────────────────

export function useComplyRenewals() {
  const [renewals, setRenewals] = useState<CompRenewal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch('/v1/comply/renewals');
      setRenewals(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startRenewal = useCallback(async (certId: string) => {
    await apiFetch('/v1/comply/renewals', {
      method: 'POST',
      body: JSON.stringify({ cert_id: certId, trigger: 'manual' }),
    });
    await load();
  }, [load]);

  const approveRenewal = useCallback(async (renewalId: string) => {
    await apiFetch(`/v1/comply/renewals/${renewalId}/approve`, { method: 'POST' });
    await load();
  }, [load]);

  return { renewals, loading, error, refresh: load, startRenewal, approveRenewal };
}

// ── useComplyAgencyDirectory ───────────────────────────────────────────────────

export function useComplyAgencyDirectory() {
  const [agencies, setAgencies] = useState<CompAgencyDirectoryEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/comply/agency-directory')
      .then(result => { setAgencies(result); setError(null); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { agencies, loading, error };
}

// ── useComplyLicenseCatalog ───────────────────────────────────────────────────

export function useComplyLicenseCatalog() {
  const [catalog, setCatalog] = useState<CompLicenseCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/comply/license-catalog')
      .then(result => { setCatalog(result); setError(null); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { catalog, loading, error };
}

// ── useComplyBrelaHistory ────────────────────────────────────────────────────

export function useComplyBrelaHistory() {
  const [history, setHistory] = useState<CompBrelaSearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch('/v1/comply/brela-search-history');
      setHistory(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { history, loading, error, refresh: load };
}

// ── useComplyCalendar ──────────────────────────────────────────────────────────

export function useComplyCalendar(year: number, month: number) {
  const [events, setEvents]   = useState<CompCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch(`/v1/comply/calendar?year=${year}&month=${month}`);
      setEvents(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const addReminder = useCallback(async (input: CreateReminderInput) => {
    await apiFetch('/v1/comply/reminders', { method: 'POST', body: JSON.stringify(input) });
    await load();
  }, [load]);

  const deleteReminder = useCallback(async (id: string) => {
    await apiFetch(`/v1/comply/reminders/${id}`, { method: 'DELETE' });
    await load();
  }, [load]);

  return { events, loading, error, refresh: load, addReminder, deleteReminder };
}

// ── useComplyLegalMarketplace ─────────────────────────────────────────────────

export function useComplyLegalFirms() {
  const [firms, setFirms]     = useState<CompLegalFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/comply/legal/firms')
      .then(result => { setFirms(result); setError(null); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { firms, loading, error };
}

export function useComplyLegalEngagements() {
  const [engagements, setEngagements] = useState<CompLegalEngagement[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch('/v1/comply/legal/engagements');
      setEngagements(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: CreateEngagementInput) => {
    const created = await apiFetch('/v1/comply/legal/engagements', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await load();
    return created as CompLegalEngagement;
  }, [load]);

  const sendMessage = useCallback(async (engagementId: string, body: string) => {
    await apiFetch(`/v1/comply/legal/engagements/${engagementId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    await load();
  }, [load]);

  const setMilestoneStatus = useCallback(async (engagementId: string, milestoneId: string, status: string) => {
    await apiFetch(`/v1/comply/legal/engagements/${engagementId}/milestones/${milestoneId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }, [load]);

  const setStatus = useCallback(async (engagementId: string, status: string) => {
    await apiFetch(`/v1/comply/legal/engagements/${engagementId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }, [load]);

  const remove = useCallback(async (engagementId: string) => {
    await apiFetch(`/v1/comply/legal/engagements/${engagementId}`, { method: 'DELETE' });
    await load();
  }, [load]);

  return { engagements, loading, error, refresh: load, create, sendMessage, setMilestoneStatus, setStatus, remove };
}

// ── useComplyObligationScan ────────────────────────────────────────────────────

export function useComplyObligationScan() {
  const [scanning, setScanning] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const scan = useCallback(async (input: ObligationScanInput) => {
    setScanning(true);
    setError(null);
    try {
      const result = await apiFetch('/v1/comply/obligation-scan', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return result as ObligationScanResult;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setScanning(false);
    }
  }, []);

  return { scan, scanning, error };
}

// ── useComplyProfile ───────────────────────────────────────────────────────────

export function useComplyProfile() {
  const [profile, setProfile] = useState<CompProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch('/v1/comply/profile');
      setProfile(result);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { profile, loading, refresh: load };
}
