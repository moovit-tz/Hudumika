"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { NAV_ITEMS } from "@/lib/nav-items";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/components/Avatar";
import { getStoredUser } from "@/lib/api";

// Every screen gets its own appbar identity instead of a single generic
// "Ondi" bar everywhere — mirrors native apps, where only the root/home
// screen shows the brand mark and every other screen names itself, with a
// back target that goes to its logical parent (not just browser history,
// which is empty on a fresh deep link/reload).
const SCREEN_TITLES: Record<string, { title: string; back: string }> = {
  "/authenticator": { title: "Authenticator", back: "/" },
  "/apps": { title: "Apps", back: "/" },
  "/applications": { title: "Applications", back: "/apps" },
  "/sessions": { title: "Sessions", back: "/" },
  "/devices": { title: "Devices", back: "/" },
  "/security": { title: "Security", back: "/" },
  "/security/passkeys": { title: "Passkeys", back: "/security" },
  "/security/recovery": { title: "Recovery", back: "/security" },
  "/activity": { title: "Activity", back: "/" },
  "/profile": { title: "Profile", back: "/" },
};

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser();
  const screen = SCREEN_TITLES[pathname];

  return (
    <header
      className="sticky top-0 z-30 overflow-hidden border-b border-ondi-border bg-background/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Faint oversized mark bleeding off the top-right corner — a watermark,
          not a functional logo, so it's aria-hidden and purely decorative. */}
      <img
        src="/icon.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 opacity-[0.06] dark:opacity-[0.09]"
      />
      <div className="relative mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          {/* Mobile/tablet: brand mark on Overview, back + screen name everywhere
              else — this is the "appbar", not just a logo bar, below md. */}
          <div className="flex items-center gap-2 md:hidden">
            {screen ? (
              <button
                onClick={() => router.push(screen.back)}
                className="flex items-center gap-1 -ml-1.5 rounded-lg py-1.5 pl-1.5 pr-2.5 text-foreground active:bg-ondi-mist"
                aria-label={`Back to ${screen.back === "/" ? "Overview" : screen.back}`}
              >
                <HugeiconsIcon icon={ArrowLeft02Icon} size={20} strokeWidth={1.75} />
                <span className="text-lg font-semibold">{screen.title}</span>
              </button>
            ) : (
              <Link href="/" className="flex items-center">
                <img src="/ondi-wordmark.svg" alt="Ondi" className="block h-6 dark:hidden" />
                <img src="/ondi-wordmark-white.svg" alt="Ondi" className="hidden h-6 dark:block" />
              </Link>
            )}
          </div>

          {/* Desktop: brand mark + full nav always visible — active link
              already identifies the current screen, so no back/title swap
              is needed at this width. */}
          <Link href="/" className="hidden items-center md:flex">
            <img src="/ondi-wordmark.svg" alt="Ondi" className="block h-7 dark:hidden" />
            <img src="/ondi-wordmark-white.svg" alt="Ondi" className="hidden h-7 dark:block" />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-ondi-mist text-ondi-primary"
                      : "text-ondi-muted hover:bg-ondi-mist/60 hover:text-foreground"
                  }`}
                >
                  <HugeiconsIcon icon={item.icon} size={17} strokeWidth={active ? 2 : 1.5} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <ThemeToggle />
          <div className="mx-1 hidden h-6 w-px bg-ondi-border sm:block" />
          <Link href="/profile" aria-label="Profile" className="block rounded-full">
            <Avatar user={user} size={30} />
          </Link>
        </div>
      </div>
    </header>
  );
}
