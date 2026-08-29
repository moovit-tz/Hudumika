import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Support',
  description: 'Ondi support centre — find answers, contact our team, or access the developer help desk.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
