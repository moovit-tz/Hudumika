"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { Nav } from "@/components/Nav";
import { BottomNav } from "@/components/BottomNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Overview is meant to read as a fixed dashboard summary, not a scrolling
  // page — every other screen (Devices, Activity, ...) has genuinely
  // unbounded list content and keeps normal document scrolling.
  const isOverview = pathname === "/";

  return (
    <AuthGuard>
      <div className={`bg-background ${isOverview ? "h-dvh overflow-hidden" : "min-h-screen"}`}>
        <Nav />
        {/* pb-20 keeps content clear of the fixed mobile bottom nav; md:pb-8 drops it on desktop, where BottomNav is hidden */}
        <main
          className={`mx-auto max-w-5xl px-4 sm:px-6 ${
            isOverview
              ? "flex h-[calc(100dvh-4rem)] flex-col overflow-hidden py-4 pb-24 md:pb-8"
              : "pb-24 pt-6 sm:py-8 md:pb-8"
          }`}
        >
          {children}
        </main>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
