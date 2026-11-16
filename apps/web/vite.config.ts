import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const API_HOST = { changeOrigin: false, headers: { host: 'localhost:3001' } };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5180,
    // Proxy to 127.0.0.1, not localhost: the API listens on IPv4 only, and on
    // Windows 'localhost' tries ::1 first, adding ~0.2-0.3 s of connection
    // setup to every proxied API call (perf audit 2026-11-16). The browser's
    // cookies belong to the page's own origin, so this doesn't change them, and
    // the API still sees Host: localhost:3001 — OAuth callback URLs are built
    // from it (accounting, calendar and mail connectors).
    host: true,
    proxy: {
      '/.well-known/openid-configuration': { target: 'http://127.0.0.1:3001', ...API_HOST },
      '/jwks.json': { target: 'http://127.0.0.1:3001', ...API_HOST },
      '/v1': { target: 'http://127.0.0.1:3001', ...API_HOST },
      '/auth': { target: 'http://127.0.0.1:3001', ...API_HOST },
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true, ...API_HOST },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — loaded by everything, must be separate and cached
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/') || id.includes('node_modules/scheduler/')) {
            return 'react-vendor';
          }
          // Tiny helpers shared by the app *and* by the heavy vendor libraries.
          // Left unassigned, Rollup moves a manual chunk's dependencies into
          // that chunk — so the use-sync-external-store shim landed in
          // three-vendor and Babel's _extends in charts-vendor, and the entry
          // chunk then statically imported both: every page, sign-in included,
          // downloaded ~1.4 MB of three.js and Recharts (perf audit 2026-11-16).
          // clsx is the same story: components/ui's cn() uses it, and so does
          // Recharts, so it was pulling the whole charts chunk into the entry.
          if (/node_modules\/(use-sync-external-store|@babel\/runtime|react-is|tslib|object-assign|prop-types|clsx|tailwind-merge|class-variance-authority)\//.test(id)) {
            return 'react-vendor';
          }
          // Radix UI headless primitives
          if (id.includes('node_modules/@radix-ui/')) {
            return 'radix-vendor';
          }
          // Charting libraries (Recharts + D3 internals) — large, only needed on analytics pages
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-') || id.includes('generateCategoricalChart')) {
            return 'charts-vendor';
          }
          // Three.js — only needed for 3D visualisation; 900 KB on its own
          if (id.includes('node_modules/three/') || id.includes('OrbitControls')) {
            return 'three-vendor';
          }
          // PDF generation (pdfkit, pdf.js canvas)
          if (id.includes('node_modules/pdfkit') || id.includes('node_modules/pdfjs-dist') || id.includes('PdfPageCanvas')) {
            return 'pdf-vendor';
          }
        },
      },
    },
  },
});
