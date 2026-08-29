import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Ondi developer documentation — guides, API reference, authentication flows, and integration tutorials.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
