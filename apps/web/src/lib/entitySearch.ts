import { apiFetch } from './api.js';
import type { PickerItem } from '../components/EntityPicker.js';

/**
 * Shared AJAX search helpers for EntityPicker — one place to add avatar data,
 * so every customer/staff/supplier picker across every app shows the real photo.
 */

export async function searchCustomers(q: string): Promise<PickerItem[]> {
  const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}&active=true` : '?active=true';
  const res = await apiFetch(`/v1/customers${qs}`).catch(() => ({ data: [] }));
  const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.email || c.phone || undefined,
    avatarUserId: c.id,
    avatarKind: 'customers' as const,
    avatarType: 'company' as const,
    avatarUrl: c.logo_url || c.avatar_url || undefined,
  }));
}

export async function searchStaff(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({
    id: u.id,
    label: u.name,
    sublabel: u.email,
    avatarUserId: u.id,
    avatarKind: 'people' as const,
    avatarType: 'person' as const,
    avatarUrl: u.avatar_url || undefined,
  }));
}

export async function searchSuppliers(q: string): Promise<PickerItem[]> {
  const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
  const res = await apiFetch(`/v1/suppliers${qs}`).catch(() => ({ data: [] }));
  const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((s) => ({
    id: s.id,
    label: s.name,
    sublabel: s.email || s.phone || undefined,
    avatarUserId: s.id,
    avatarKind: 'suppliers' as const,
    avatarType: 'company' as const,
    avatarUrl: s.avatar_url || s.logo_url || undefined,
  }));
}

export async function searchContacts(q: string): Promise<PickerItem[]> {
  const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
  const res = await apiFetch(`/v1/contacts${qs}`).catch(() => ({ data: [] }));
  const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((c) => ({
    id: c.id,
    label: c.name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    sublabel: c.email || c.phone || undefined,
    avatarUserId: c.id,
    avatarKind: 'contacts' as const,
    avatarType: 'person' as const,
    avatarUrl: c.avatar_url || undefined,
  }));
}

export async function searchLeads(q: string): Promise<PickerItem[]> {
  const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
  const res = await apiFetch(`/v1/leads${qs}`).catch(() => ({ data: [] }));
  const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((l) => ({
    id: l.id,
    label: l.name || l.company_name || l.email || 'Unnamed',
    sublabel: l.email || l.phone || undefined,
    avatarUserId: l.id,
    avatarKind: 'leads' as const,
    avatarType: 'person' as const,
    avatarUrl: l.avatar_url || undefined,
  }));
}

export async function searchDrivers(q: string): Promise<PickerItem[]> {
  const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
  const res = await apiFetch(`/v1/tracking/drivers${qs}`).catch(() => []);
  const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((d) => ({
    id: d.id,
    label: d.name,
    sublabel: d.license_number || d.phone || undefined,
    avatarUserId: d.id,
    avatarKind: 'drivers' as const,
    avatarType: 'person' as const,
    avatarUrl: d.avatar_url || undefined,
  }));
}
