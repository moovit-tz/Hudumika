import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'PDPA Compliance Suite',
  description: 'Live maturity score, automated consent flows, DPO workspace, and breach notification — PDPA compliance built for East Africa.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
