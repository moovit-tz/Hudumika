import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Trust Assessment',
  description: 'Run a free PDPA readiness assessment. Get your maturity score, gap report, and a prioritised remediation plan in 15 minutes.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
