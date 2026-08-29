"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { UserCircleIcon } from "@hugeicons/core-free-icons";
import type { StoredUser } from "@/lib/api";

export function Avatar({ user, size = 32 }: { user: StoredUser | null; size?: number }) {
  if (user?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Google-hosted avatar, not a local/optimizable asset
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary"
      style={{ width: size, height: size }}
    >
      <HugeiconsIcon icon={UserCircleIcon} size={size * 0.75} strokeWidth={1.5} />
    </div>
  );
}
