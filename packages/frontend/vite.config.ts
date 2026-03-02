import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { execSync } from 'child_process';

function getVersion(): string {
  if (process.env['APP_VERSION']) return process.env['APP_VERSION'];
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sectorama — Disk Monitor',
        short_name: 'Sectorama',
        description: 'Self-hosted disk benchmark and health monitor',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-64x64.png',              sizes: '64x64',   type: 'image/png', purpose: 'any' },
          { src: '/pwa-192x192.png',             sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png',             sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-icon-512x512.png',   sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8888',
        ws: true,
      },
      '/drive-images': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', '@tanstack/react-table'],
          charts: ['recharts'],
        },
      },
    },
  },
});
