import React from 'react';
import { Avatar, AvatarFallback } from '../../../components/ui/avatar.js';
import { avColor, initials } from '../lib/format.js';

/** A shared-with person has a name only, never a photo (SharedPerson is a
 *  free-text/principal record, not a real account with an avatar_url) — so
 *  this always renders the deterministic colour-and-initials fallback. */
export function PersonAvatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <Avatar style={{ width: size, height: size, border: '2px solid var(--white)' }}>
      <AvatarFallback style={{ background: avColor(name), color: '#fff', fontSize: size * 0.4, fontWeight: 700 }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
