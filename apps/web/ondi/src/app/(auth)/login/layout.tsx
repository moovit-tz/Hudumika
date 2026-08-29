import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Ondi account to access your verified identity, dashboards, and connected applications.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
