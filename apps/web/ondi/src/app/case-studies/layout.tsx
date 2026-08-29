import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Case Studies',
  description: 'Real outcomes from East African organisations using Ondi for identity verification, PDPA compliance, and workforce access management.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
