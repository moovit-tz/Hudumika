import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5180,
    host: true,
    proxy: {
      '/v1': { target: 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
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
