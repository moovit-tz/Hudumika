import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'The Ondi Platform',
  description: 'Trust infrastructure for East Africa — identity verification, adaptive SSO, data privacy compliance, and the Trust Score engine.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
