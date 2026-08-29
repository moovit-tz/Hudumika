import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Resources',
  description: 'Guides, reports, and playbooks on digital identity, PDPA compliance, and trust scoring for East African organisations.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
