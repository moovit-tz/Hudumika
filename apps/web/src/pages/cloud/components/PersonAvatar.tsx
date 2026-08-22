import React from 'react';
import { Avatar, AvatarFallback } from '../../../components/ui/avatar.js';
import { PersonAvatar as SharedPersonAvatar } from '../../../components/PersonAvatar.js';
import { avColor, initials } from '../lib/format.js';

/**
 * A file/folder's owner IS a real users.id (cloud_files.owner_id — see
 * files.routes.ts) for every staff-created row, so a real uploaded photo
 * should show here exactly like it does everywhere else in the platform.
 * This used to always draw plain initials from the raw owner_name string
 * with no way to look up a real photo at all — even for the owner's own
 * card — because it never received an id, only a name. Delegates to the
 * shared PersonAvatar (same real-photo fetch/cache every other app uses)
 * when a userId is given; a shared-with recipient (SharedPerson) is still
 * usually free text with no real account behind it, so callers that only
 * have a name keep getting the deterministic colour-and-initials fallback.
 */
export function PersonAvatar({ name, userId, size = 22 }: { name: string; userId?: string | null; size?: number }) {
  if (userId) {
    return <SharedPersonAvatar userId={userId} name={name} size={size} style={{ border: '2px solid var(--white)' }} />;
  }
  return (
    <Avatar title={name} style={{ width: size, height: size, border: '2px solid var(--white)' }}>
      <AvatarFallback style={{ background: avColor(name), color: '#fff', fontSize: size * 0.4, fontWeight: 700 }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
