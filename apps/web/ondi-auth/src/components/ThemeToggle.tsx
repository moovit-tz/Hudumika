"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0b12" : "#4253d1");
  localStorage.setItem("ondi_theme", dark ? "dark" : "light");
}

export function ThemeToggle() {
  // Real value depends on localStorage/the inline anti-flash script in
  // layout.tsx, which has already run by the time this component ever
  // mounts (it's only rendered post-auth, never in the initial SSR pass —
  // see Nav.tsx) — read it lazily on first render instead of via an effect.
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
    >
      <HugeiconsIcon icon={dark ? Sun03Icon : Moon02Icon} size={18} strokeWidth={1.5} />
    </button>
  );
}
