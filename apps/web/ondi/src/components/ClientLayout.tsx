'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Dashboard routes have their own persistent shell (DashboardShell: sidebar,
  // topbar, AuthGuard) that must survive in-app navigation — remounting it on
  // every click (which `key={pathname}` does, since this sits above
  // dashboard/layout.tsx in the tree) re-runs auth verification from scratch
  // each time. When the access token is near its 15-minute expiry, that fires
  // concurrent refresh-token requests from multiple remounted components;
  // since refresh rotation deletes the old session immediately, the losing
  // concurrent request gets `invalid_refresh_token` and hard-redirects to
  // /login — the "keeps getting redirected to login" bug. Marketing/public
  // pages still get the fade-in/out transition; dashboard pages render
  // directly, with no key-based remount.
  if (pathname.startsWith('/dashboard')) {
    return <div className="flex-1 flex flex-col">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col"
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
