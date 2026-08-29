import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Ondi for Business',
  description: 'Enterprise-grade identity verification, workforce SSO, compliance tools, and trust scoring for East African businesses.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
