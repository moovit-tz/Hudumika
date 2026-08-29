import type { Viewport } from "next";

// The root layout's theme-color (#4253d1, solid indigo) would show as a
// clashing flat band above the login screen's dark gradient — override it
// per-segment so the browser/PWA chrome blends into the gradient's own top
// tone instead of reading as a separate opaque bar.
export const viewport: Viewport = {
  themeColor: "#14183a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
