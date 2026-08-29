import AuthGuard from '@/components/AuthGuard';

export default function PersonalDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
