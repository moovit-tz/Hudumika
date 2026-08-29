import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Verify Your Identity',
  description: 'Complete your NIDA identity verification to unlock your Ondi Trust Score and access connected services.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
