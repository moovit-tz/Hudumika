import type { Metadata } from 'next';
import DashboardLayoutClient from './DashboardLayoutClient';
import AuthGuard from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your Ondi dashboard — manage your verified identity, connected apps, and trust score.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </AuthGuard>
  );
}
