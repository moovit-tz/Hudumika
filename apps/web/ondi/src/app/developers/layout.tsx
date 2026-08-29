import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Developer Platform',
  description: 'Ondi APIs, SDKs, and webhooks for integrating identity verification, SSO, and trust scoring into your applications.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
