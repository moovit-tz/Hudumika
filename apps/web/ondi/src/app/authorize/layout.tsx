import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Authorise Access',
  description: 'Review and approve access permissions for a connected application.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
