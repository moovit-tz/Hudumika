import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Customer Identity',
  description: 'Verify and authenticate your customers with NIDA-linked identity checks, adaptive MFA, and consent-driven onboarding flows.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
