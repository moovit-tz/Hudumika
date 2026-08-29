import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'PDPA Compliance Assessment | Ondi',
  description: 'Free 15-minute PDPA readiness assessment for East African businesses. Get your data protection maturity score, gap report, and a prioritised remediation plan.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
