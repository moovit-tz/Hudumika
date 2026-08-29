import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your Ondi account — get a verified digital identity backed by NIDA for individuals and BRELA for businesses.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
