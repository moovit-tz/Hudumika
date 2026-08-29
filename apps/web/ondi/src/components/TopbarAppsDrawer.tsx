"use client";

import { useEffect, useRef, useState } from "react";
import { Grip, Search, ArrowRight } from "lucide-react";
import { allProducts, type DrawerProduct } from "@/lib/products";

const WORKSPACE_URL =
  process.env.NEXT_PUBLIC_WORKSPACE_URL ?? "http://localhost:3010";

function ProductIcon({
  product,
  size,
  iconSize,
}: {
  product: DrawerProduct;
  size: string;
  iconSize: number;
}) {
  const Icon = product.Icon;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${size}`}
      style={{ backgroundColor: `${product.color}18` }}
    >
      <Icon size={iconSize} style={{ color: product.color }} />
    </span>
  );
}

// Shown briefly every time the apps drawer opens, before the real grid
// renders — matches Adobe's app-switcher loading state (and the same
// pattern in apps/web/workspace/src/components/mega-nav.tsx's AppsSkeleton).
function AppsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 p-2">
          <div className="h-12 w-12 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-2 w-10 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// Adobe-style app-switcher for browsing the rest of the Hudumika suite from
// inside Ondi — same structure, search, skeleton, and dark claude.com-style
// footer as the "Apps" drawer on the Hudumika Workspace landing page
// (apps/web/workspace/src/components/mega-nav.tsx), restyled to Ondi's
// plain navy/indigo topbar instead of that page's CSS-var theme.
export function TopbarAppsDrawer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadTimer.current = setTimeout(() => setLoading(false), 450);
    } else {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      setQuery("");
    }
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const normalized = query.trim().toLowerCase();
  const filteredApps = normalized
    ? allProducts
        .filter((p) => p.name.toLowerCase().includes(normalized))
        .slice(0, 12)
    : allProducts.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Hudumika apps"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`p-2 text-slate-500 hover:text-[#001633] hover:bg-slate-100 rounded-md transition-colors cursor-pointer ${
          open ? "bg-slate-100 text-[#001633]" : ""
        }`}
        title="Hudumika apps"
      >
        <Grip size={17} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-[500]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-extrabold tracking-tight text-[#001633]">
              Apps
            </p>
            <a
              href={`${WORKSPACE_URL}/products`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-[#4253D1] hover:underline"
            >
              View all
            </a>
          </div>

          {/* Search — filters the grid as you type */}
          <div className="border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an app"
                className="w-full bg-transparent text-sm text-[#001633] outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {loading ? (
            <AppsSkeleton />
          ) : (
            /* One flat, uniform grid of app tiles — no quick-access tier,
               no category grouping, matching Adobe's own app-switcher. */
            <div className="max-h-[360px] overflow-y-auto px-4 py-4">
              {filteredApps.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  No apps match &ldquo;{query.trim()}&rdquo;
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filteredApps.map((p) => (
                    <a
                      key={p.slug}
                      href={p.href}
                      target="_blank"
                      rel="noreferrer"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex flex-col items-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-slate-50"
                    >
                      <ProductIcon product={p} size="h-12 w-12" iconSize={24} />
                      <span className="text-[11px] font-semibold leading-tight text-[#001633]">
                        {p.name}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer — a dark bottom bar like claude.com's: logo + wordmark
              on the left, an icon-style link on the right. */}
          <div className="flex items-center justify-between px-5 py-3 bg-[#001633]">
            <a
              href={WORKSPACE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/hudumika-icon.png"
                alt=""
                className="h-[18px] w-[18px] rounded-[5px]"
              />
              Hudumika
            </a>
            <a
              href={`${WORKSPACE_URL}/products`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              aria-label="All apps"
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
            >
              <ArrowRight size={16} className="text-white" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
