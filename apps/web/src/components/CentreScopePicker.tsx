import React from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from './ui/select.js';
import { Icon } from './Icon.js';
import { useCentreScope, useSupportNetwork, zoneTree, type CentreScope } from '../lib/supportNetwork.js';

/**
 * "All centres ▾" — which centre or zone every Bliss screen is looking at.
 *
 * Lists only the centres and zones this person may see (the API decides).
 * Hidden entirely for a workspace that has not set up any centres, so a
 * single-desk workspace sees Bliss exactly as before.
 */
export function CentreScopePicker({ collapsed = false }: { collapsed?: boolean }) {
  const { data } = useSupportNetwork();
  const [scope, setScope] = useCentreScope();
  if (!data) return null;
  const centres = data.centres.filter(c => c.support_enabled);
  if (!centres.length) return null;

  const visibleSites = new Set(centres.map(c => c.id));
  const zoneIds = new Set(centres.map(c => c.zone_id).filter(Boolean) as string[]);
  // Show a zone if it holds a visible centre, or one of its descendants does.
  const byId = new Map(data.zones.map(z => [z.id, z]));
  const zonesWithCentres = new Set<string>();
  for (const id of zoneIds) {
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); zonesWithCentres.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  }
  const zones = zoneTree(data.zones).filter(z => zonesWithCentres.has(z.zone.id));

  // A stored choice that is no longer visible falls back to everything.
  const valid = scope.kind === 'all'
    || (scope.kind === 'centre' && visibleSites.has(scope.id))
    || (scope.kind === 'zone' && zonesWithCentres.has(scope.id));
  const value = valid ? (scope.kind === 'all' ? 'all' : `${scope.kind}:${scope.id}`) : 'all';

  const onChange = (v: string) => {
    if (v === 'all') return setScope({ kind: 'all' });
    const [kind, id] = v.split(':');
    setScope({ kind: kind as 'zone' | 'centre', id } as CentreScope);
  };

  if (collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }} title="Centre">
        <Icon name="mapPin" size={16} />
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 12px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.6, margin: '0 2px 4px' }}>
        Centre
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Which centre to show">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{data.scope.all ? 'All centres' : 'All my centres'}</SelectItem>
          {zones.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Zones</SelectLabel>
                {zones.map(({ zone, depth }) => (
                  <SelectItem key={zone.id} value={`zone:${zone.id}`}>
                    <span style={{ paddingLeft: depth * 12 }}>{zone.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Centres</SelectLabel>
            {centres.map(c => (
              <SelectItem key={c.id} value={`centre:${c.id}`}>
                {c.name}{c.city ? ` · ${c.city}` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
