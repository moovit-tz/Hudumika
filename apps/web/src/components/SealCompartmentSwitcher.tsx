import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';

interface Compartment {
  id: string;
  code: string;
  name: string;
  warehouse_type?: string;
  logo_url?: string | null;
}

interface Props {
  collapsed?: boolean;
}

function getInitials(name: string, code?: string): string {
  if (code && code.length <= 3) return code.toUpperCase();
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function CompartmentAvatar({ compartment, size = 26 }: { compartment: Compartment | null; size?: number }) {
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  if (!compartment) {
    return (
      <div style={{ ...base, background: 'var(--seal)', color: '#fff', fontSize: 10, fontWeight: 800 }}>
        <Icon name="grid" size={size * 0.5} />
      </div>
    );
  }
  if (compartment.logo_url) {
    return (
      <div style={{ ...base, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--white)' }}>
        <img src={compartment.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    );
  }
  return (
    <div style={{ ...base, background: 'var(--teal-l)', border: '1px solid var(--teal-m)', color: 'var(--seal)', fontSize: 10, fontWeight: 800 }}>
      {getInitials(compartment.name, compartment.code)}
    </div>
  );
}

// Persistent "which warehouse am I viewing" context for SEAL — every
// multi-compartment list page (Lots, Dashboard, Stock Account, Yard Slots)
// reads useSealCompartmentId() and scopes its own fetch to it. Pages that
// are already single-compartment via their own route param (Heat Grid,
// Warehouse Layout) don't need this; they're unaffected.
export function SealCompartmentSwitcher({ collapsed }: Props) {
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [compartmentId, setCompartmentId] = useSealCompartmentId();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    apiFetch('/v1/seal/compartments').then(setCompartments).catch(() => setCompartments([]));
  }, []);

  if (compartments.length === 0) return null;

  const currentCompartment = compartments.find(c => c.id === compartmentId) ?? null;

  const dropdownList = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
      <button
        type="button"
        onClick={() => { setCompartmentId(null); setIsOpen(false); }}
        className="seal-switcher-item"
        data-selected={compartmentId === null}
      >
        <CompartmentAvatar compartment={null} />
        <span style={{ fontSize: 13, fontWeight: compartmentId === null ? 700 : 500, flex: 1, textAlign: 'left' }}>
          All Compartments
        </span>
        {compartmentId === null && <Icon name="check" size={14} style={{ color: 'var(--seal)' }} />}
      </button>

      {compartments.map(c => {
        const selected = compartmentId === c.id;
        return (
          <button
            type="button"
            key={c.id}
            onClick={() => { setCompartmentId(c.id); setIsOpen(false); }}
            className="seal-switcher-item"
            data-selected={selected}
          >
            <CompartmentAvatar compartment={c} />
            <span style={{
              fontSize: 13, fontWeight: selected ? 700 : 500, flex: 1, textAlign: 'left',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {c.name}
            </span>
            {c.code && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 6 }}>
                {c.code}
              </span>
            )}
            {selected && <Icon name="check" size={14} style={{ color: 'var(--seal)', marginLeft: 4 }} />}
          </button>
        );
      })}
    </div>
  );

  if (collapsed) {
    return (
      <div style={{ padding: '12px 0', display: 'flex', justifyContent: 'center' }}>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              style={{
                background: isOpen ? 'var(--teal-l)' : 'none', border: 'none', borderRadius: 'var(--r)',
                cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Warehouse Selection Menu"
            >
              <Icon name="menu" size={18} style={{ color: 'var(--seal)' }} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-60 p-2">
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', padding: '4px 8px 6px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              Select Warehouse
            </div>
            {dropdownList}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 18px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)' }}>
          Warehouse
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg)', color: 'var(--ink3)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border)' }}>
          {compartments.length} Available
        </span>
      </div>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            style={{
              width: '100%', height: 42, padding: '0 12px', fontSize: 13, fontWeight: 600,
              background: 'var(--white)', border: isOpen ? '1.5px solid var(--seal)' : '1px solid var(--border)',
              borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              <CompartmentAvatar compartment={currentCompartment} size={24} />
              <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentCompartment ? currentCompartment.name : 'All Compartments'}
              </span>
            </div>
            <Icon name="chevronDown" size={14} style={{ color: 'var(--ink3)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-2" style={{ width: 'var(--radix-popover-trigger-width)' }}>
          {dropdownList}
        </PopoverContent>
      </Popover>
    </div>
  );
}
