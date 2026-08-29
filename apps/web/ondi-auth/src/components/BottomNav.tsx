"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { BOTTOM_NAV_ITEMS } from "@/lib/nav-items";

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/apps") {
    return (
      pathname === "/apps" ||
      pathname.startsWith("/apps/") ||
      pathname === "/applications" ||
      pathname.startsWith("/applications/")
    );
  }
  if (href === "/devices") {
    return (
      pathname === "/devices" ||
      pathname.startsWith("/devices/") ||
      pathname === "/sessions" ||
      pathname.startsWith("/sessions/")
    );
  }
  if (href === "/security") {
    return pathname === "/security" || pathname.startsWith("/security/");
  }
  if (href === "/authenticator") {
    return pathname === "/authenticator" || pathname.startsWith("/authenticator/");
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      role="navigation"
      aria-label="Main Navigation"
      className="fixed inset-x-0 bottom-0 z-40 select-none border-t border-ondi-border/60 bg-background/85 backdrop-blur-xl transition-colors md:hidden dark:border-ondi-border/40 dark:bg-[#0a0b12]/85 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-ondi-primary/25 before:to-transparent dark:before:via-ondi-primary/35 shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_25px_-2px_rgba(0,0,0,0.35)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <div className="flex h-14 items-center justify-around px-1 pt-1">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`group flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-center transition-transform duration-150 active:scale-90 ${
                active ? "text-ondi-primary" : "text-ondi-muted hover:text-foreground"
              }`}
            >
              <div
                className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 ease-out ${
                  active
                    ? "bg-ondi-primary/12 text-ondi-primary dark:bg-ondi-primary/25 shadow-xs"
                    : "bg-transparent text-ondi-muted group-hover:bg-ondi-mist/50 dark:group-hover:bg-ondi-mist/20"
                }`}
              >
                <HugeiconsIcon
                  icon={item.icon}
                  size={20}
                  strokeWidth={active ? 2.2 : 1.7}
                  className="transition-transform duration-200 group-active:scale-95"
                />
              </div>
              <span
                className={`text-[10px] tracking-tight transition-colors duration-150 ${
                  active ? "font-semibold text-ondi-primary" : "font-medium text-ondi-muted group-hover:text-foreground"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

