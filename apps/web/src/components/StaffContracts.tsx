import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { showAlert } from '../lib/alert.js';

/**
 * A person's contracts, and the people to ring if something happens.
 *
 * Both are read *and* written here. A list with no way to add to it is how
 * hr_documents ended up empty in every tenant while its screen worked
 * perfectly — the table was fine, nothing could ever get into it.
 */

const CONTRACT_TYPES = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'FIXED_TERM', label: 'Fixed term' },
  { value: 'PROBATION', label: 'Probation' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

const fmt = (d?: string | null) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
};

const inp: React.CSSProperties = {
  padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)',
  outline: 'none', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box',
};

const card: React.CSSProperties = {
  background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)',
  marginBottom: 16, overflow: 'hidden',
};

/** Days until a date, negative once it has passed. */
function daysUntil(iso: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((new Date(iso).getTime() - new Date(today).getTime()) / 86400000);
}

export function StaffContracts({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ contract_type: 'FIXED_TERM', start_date: '', end_date: '', reference: '' });

  const load = useCallback(async () => {
    try { setRows(await apiFetch(`/v1/hr/staff/${userId}/contracts`) ?? []); }
    catch { setRows([]); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  // A permanent contract has no end date, so the field goes away rather than
  // sitting there inviting a value the API will refuse.
  const openEnded = form.contract_type === 'PERMANENT';

  async function add() {
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/staff/${userId}/contracts`, {
        method: 'POST',
        body: JSON.stringify({
          contract_type: form.contract_type,
          start_date: form.start_date,
          end_date: openEnded ? null : (form.end_date || null),
          reference: form.reference || null,
        }),
      });
      setForm({ contract_type: 'FIXED_TERM', start_date: '', end_date: '', reference: '' });
      setAdding(false);
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'The contract could not be saved.');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    try { await apiFetch(`/v1/hr/staff/${userId}/contracts/${id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { showAlert(e?.message || 'Could not remove the contract.'); }
  }

  return (
    <div style={card}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Contracts</div>
        {canEdit && (
          <button type="button" onClick={() => setAdding(a => !a)}
            style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {adding ? 'Cancel' : 'Add'}
          </button>
        )}
      </div>

      {adding && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Type</label>
            <Select value={form.contract_type} onValueChange={v => setForm((f: any) => ({ ...f, contract_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Reference</label>
            <input style={inp} value={form.reference} onChange={e => setForm((f: any) => ({ ...f, reference: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Starts</label>
            <input style={inp} type="date" value={form.start_date} onChange={e => setForm((f: any) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>
              Ends {openEnded && <span style={{ color: 'var(--ink4)' }}>— permanent, so none</span>}
            </label>
            {!openEnded && (
              <input style={inp} type="date" value={form.end_date} onChange={e => setForm((f: any) => ({ ...f, end_date: e.target.value }))} />
            )}
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !form.start_date}
              style={{ background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }} onClick={add}>
              {saving ? 'Saving…' : 'Add contract'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: '20px', fontSize: 12.5, color: 'var(--ink3)' }}>
          No contract is on file. A person working without one recorded is not visible to anybody.
        </div>
      ) : rows.map(r => {
        const left = r.end_date ? daysUntil(r.end_date) : null;
        // Silence is the failure mode this whole table exists to prevent, so an
        // expiring or lapsed contract says so on the record itself.
        const warn = left !== null && left <= 30;
        return (
          <div key={r.id} style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                {CONTRACT_TYPES.find(t => t.value === r.contract_type)?.label ?? r.contract_type}
                {r.reference && <span style={{ fontWeight: 400, color: 'var(--ink3)' }}> · {r.reference}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                {fmt(r.start_date)} → {r.end_date ? fmt(r.end_date) : 'open-ended'}
              </div>
            </div>
            {warn && (
              <span style={{ padding: 'var(--badge-py) var(--badge-px)', borderRadius: 'var(--r-sm)', fontSize: 'var(--badge-fs)', fontWeight: 700,
                             background: left < 0 ? 'var(--red-l)' : 'var(--gold-l)', color: left < 0 ? 'var(--red)' : 'var(--gold)', whiteSpace: 'nowrap' }}>
                {left < 0 ? `Expired ${Math.abs(left)}d ago` : `Ends in ${left}d`}
              </span>
            )}
            {canEdit && (
              <button type="button" title="Remove" onClick={() => remove(r.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StaffEmergencyContacts({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ name: '', relationship: '', phone: '', is_primary: false });

  const load = useCallback(async () => {
    try { setRows(await apiFetch(`/v1/hr/staff/${userId}/emergency-contacts`) ?? []); }
    catch { setRows([]); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/staff/${userId}/emergency-contacts`, {
        method: 'POST', body: JSON.stringify(form),
      });
      setForm({ name: '', relationship: '', phone: '', is_primary: false });
      setAdding(false);
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'The contact could not be saved.');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    try { await apiFetch(`/v1/hr/staff/${userId}/emergency-contacts/${id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { showAlert(e?.message || 'Could not remove the contact.'); }
  }

  return (
    <div style={card}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Emergency contacts</div>
        {canEdit && (
          <button type="button" onClick={() => setAdding(a => !a)}
            style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {adding ? 'Cancel' : 'Add'}
          </button>
        )}
      </div>

      {adding && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Name</label>
            <input style={inp} value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Relationship</label>
            <input style={inp} value={form.relationship} onChange={e => setForm((f: any) => ({ ...f, relationship: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Phone</label>
            <input style={inp} value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="07XX XXX XXX" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
              <input type="checkbox" checked={form.is_primary} onChange={e => setForm((f: any) => ({ ...f, is_primary: e.target.checked }))} />
              Try this one first
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !form.name || !form.phone}
              style={{ background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }} onClick={add}>
              {saving ? 'Saving…' : 'Add contact'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: '20px', fontSize: 12.5, color: 'var(--ink3)' }}>
          Nobody to call. This is the field that matters on the day it is needed.
        </div>
      ) : rows.map(r => (
        <div key={r.id} style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
              {r.name}
              {r.relationship && <span style={{ fontWeight: 400, color: 'var(--ink3)' }}> · {r.relationship}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{r.phone}</div>
          </div>
          {r.is_primary && (
            <span style={{ padding: 'var(--badge-py) var(--badge-px)', borderRadius: 'var(--r-sm)', fontSize: 'var(--badge-fs)',
                           fontWeight: 700, background: 'var(--teal-l)', color: 'var(--teal)', whiteSpace: 'nowrap' }}>First call</span>
          )}
          {canEdit && (
            <button type="button" title="Remove" onClick={() => remove(r.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
