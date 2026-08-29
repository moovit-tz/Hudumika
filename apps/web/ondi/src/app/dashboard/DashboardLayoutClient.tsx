'use client';

import { usePathname } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const type =
    pathname.startsWith('/dashboard/enterprise') ? 'enterprise' as const :
    'personal' as const;

  return <DashboardShell type={type}>{children}</DashboardShell>;
}
