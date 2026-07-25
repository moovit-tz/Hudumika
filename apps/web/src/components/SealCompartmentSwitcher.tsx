import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';

interface Compartment { id: string; code: string; name: string; }

const ALL = '__all__';

// Persistent "which warehouse am I viewing" context for SEAL — every
// multi-compartment list page (Lots, Dashboard, Stock Account, Yard Slots)
// reads useSealCompartmentId() and scopes its own fetch to it. Pages that
// are already single-compartment via their own route param (Heat Grid,
// Warehouse Layout) don't need this; they're unaffected.
export function SealCompartmentSwitcher() {
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [compartmentId, setCompartmentId] = useSealCompartmentId();

  useEffect(() => {
    apiFetch('/v1/seal/compartments').then(setCompartments).catch(() => setCompartments([]));
  }, []);

  if (compartments.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px clamp(20px, 4vw, 48px)', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
      <Icon name="warehouse" size={14} style={{ color: 'var(--ink3)' }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Warehouse</span>
      <Select value={compartmentId ?? ALL} onValueChange={v => setCompartmentId(v === ALL ? null : v)}>
        <SelectTrigger className="input-field" style={{ width: 260, height: 32 }}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Compartments</SelectItem>
          {compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
