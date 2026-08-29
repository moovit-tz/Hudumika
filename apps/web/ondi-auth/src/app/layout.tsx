import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ondi Auth",
    template: "%s | Ondi Auth",
  },
  description:
    "Ondi Auth — the authentication engine applications integrate with for login, MFA, sessions, devices, and OAuth/OIDC.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    // "black-translucent" lets the app draw under the iOS status bar
    // instead of leaving a plain system-chrome band above it — closer to
    // how the native Ondi app presents.
    statusBarStyle: "black-translucent",
    title: "Ondi Auth",
  },
};

export const viewport: Viewport = {
  themeColor: "#4253d1",
  width: "device-width",
  initialScale: 1,
  // Content can extend into the safe areas (notch/home-indicator); layout
  // components add env(safe-area-inset-*) padding where it matters.
  viewportFit: "cover",
};

// Applies the saved/system theme before first paint (and before hydration,
// hence suppressHydrationWarning on <html>) — without this, the page always
// flashes light for a frame even when the user picked dark.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("ondi_theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) {
      document.documentElement.classList.add("dark");
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0a0b12");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
