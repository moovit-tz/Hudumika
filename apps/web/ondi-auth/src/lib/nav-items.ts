import {
  Activity01Icon,
  Clock01Icon,
  Grid2X2Icon,
  Home03Icon,
  QrCode01Icon,
  ShieldKeyIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface NavItem {
  href: string;
  label: string;
  icon: IconSvgElement;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: Home03Icon },
  { href: "/authenticator", label: "Authenticator", icon: QrCode01Icon },
  { href: "/apps", label: "Apps", icon: Grid2X2Icon },
  { href: "/sessions", label: "Sessions", icon: Clock01Icon },
  { href: "/devices", label: "Devices", icon: SmartPhone01Icon },
  { href: "/security", label: "Security", icon: ShieldKeyIcon },
  { href: "/activity", label: "Activity", icon: Activity01Icon },
];

// Back to 5 tabs (iOS/Android guidance tops out there for a comfortable bar).
// Sessions is folded into Devices (each device card shows its own session +
// a sign-out action) rather than kept as a separate screen; Activity is
// reachable via "See all" links from Overview and Security instead of a
// dedicated tab — same fix as giving it a tab, without crowding the bar.
export const BOTTOM_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter((item) =>
  ["/", "/authenticator", "/apps", "/devices", "/security"].includes(item.href)
);
