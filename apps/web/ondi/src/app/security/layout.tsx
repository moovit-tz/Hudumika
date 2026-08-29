import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Security',
  description: 'How Ondi protects your data — encryption standards, certifications, penetration testing, and our responsible disclosure policy.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
