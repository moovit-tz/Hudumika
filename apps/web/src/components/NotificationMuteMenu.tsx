import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { LAUNCHER_APPS } from './LauncherApps.js';
import { useBranding } from '../hooks/useBranding.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from './ui/dropdown-menu.js';

/**
 * Which apps a person hears from, in the bell and the header bar.
 *
 * The list offers the apps that have actually notified this person (plus any
 * they already muted), not every app on the platform — a switch for something
 * that has never spoken is noise. Muting hides, it does not delete: the
 * notifications are still written, so unmuting brings them back.
 */
export const NotificationMuteMenu: React.FC<{ onChange?: () => void }> = ({ onChange }) => {
  const branding = useBranding();
  const [apps, setApps] = useState<string[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch('/v1/notifications/mutes')
      .then((res: { apps?: string[]; muted?: string[] }) => { setApps(res.apps ?? []); setMuted(res.muted ?? []); })
      .catch(() => { /* the menu stays empty; the feed itself still works */ });
  }, []);
  useEffect(load, [load]);

  const nameOf = (id: string) => {
    const known = LAUNCHER_APPS.find(a => a.id === id)?.name;
    return branding.getAppName(id, known ?? id.charAt(0).toUpperCase() + id.slice(1));
  };

  async function toggle(app: string, hear: boolean) {
    const previous = muted;
    const next = hear ? muted.filter(a => a !== app) : [...muted, app];
    setMuted(next);
    setSaving(true);
    try {
      await apiFetch('/v1/notifications/mutes', { method: 'PUT', body: JSON.stringify({ apps: next }) });
      onChange?.();
    } catch (err: any) {
      setMuted(previous);
      showAlert(err?.message || 'Could not save your notification preferences.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Icon name="bell" size={13} />
          <span>{muted.length ? `Muted (${muted.length})` : 'Mute apps'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ minWidth: 220 }}>
        <DropdownMenuLabel>Notify me from</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {apps.length === 0 && (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink3)' }}>No app has notified you yet.</div>
        )}
        {apps.map(app => (
          <DropdownMenuCheckboxItem
            key={app}
            checked={!muted.includes(app)}
            disabled={saving}
            // Keep the menu open: people usually change more than one.
            onSelect={e => e.preventDefault()}
            onCheckedChange={checked => toggle(app, !!checked)}
          >
            {nameOf(app)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
