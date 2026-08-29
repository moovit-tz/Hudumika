import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    // Pin the workspace root to the monorepo root — otherwise Turbopack
    // auto-detects it by scanning upward for a lockfile and can land on the
    // wrong one, failing to resolve the Next.js package (see apps/web/ondi
    // for the same fix and rationale).
    root: path.join(__dirname, "../../.."),
  },
};

export default nextConfig;
