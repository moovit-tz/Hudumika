import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn how Ondi is building East Africa\'s digital trust infrastructure — our mission, team, and the vision behind the platform.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
