import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Ondi Personal',
  description: 'Your NIDA-verified digital identity. One credential for every service across East Africa.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
