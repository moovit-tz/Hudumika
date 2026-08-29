import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Ondi — talk to an identity expert, request a demo, or reach our DPO support team.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
