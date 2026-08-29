import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Without this, Turbopack auto-detects the workspace root by scanning
    // upward for a lockfile — and picks up any stray pnpm-lock.yaml/etc it
    // finds first (e.g. one sitting in $HOME), landing on the wrong root
    // and failing to resolve the Next.js package entirely ("Next.js
    // package not found"). Pin it to the actual monorepo root instead.
    root: path.join(__dirname, "../../.."),
  },
  async rewrites() {
    return {
      // `fallback` only applies once filesystem routes (including our
      // dynamic app/api/admin/[...path]/route.ts handler) have been
      // checked and none matched. This used to be a bare array, which per
      // Next's rewrite-ordering rules is applied BEFORE dynamic routes —
      // that silently intercepted /api/admin/* and sent it straight to
      // ondi-api with no x-admin-key attached, bypassing the server-side
      // admin proxy entirely. Moving it to `fallback` lets the explicit
      // route handler win for /api/admin/*, while unrelated /api/* paths
      // still fall through to this passthrough as before.
      fallback: [
        {
          source: '/api/:path*',
          destination: 'http://localhost:7020/v1/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
