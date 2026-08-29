import type { Metadata } from "next";
import ClientLayout from "@/components/ClientLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ondi — One Identity. Trusted Everywhere.",
    template: "%s | Ondi",
  },
  description: "Enterprise-grade identity verification, adaptive SSO, and trust scoring for East Africa.",
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased scroll-smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
