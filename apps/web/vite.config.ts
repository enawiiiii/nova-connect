import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:4000';
  const productName = env.VITE_PRODUCT_NAME || 'NOVA Connect';
  const productShortName = env.VITE_PRODUCT_SHORT_NAME || 'NOVA';
  const productTagline = env.VITE_PRODUCT_TAGLINE || 'Stay in your orbit';
  const productDescription = env.VITE_PRODUCT_DESCRIPTION || 'A private place for messages, calls, and the people who matter.';
  return {
  plugins: [
    {
      name: 'product-metadata',
      transformIndexHtml: (html) => html
        .replaceAll('__PRODUCT_NAME__', escapeHtml(productName))
        .replaceAll('__PRODUCT_TAGLINE__', escapeHtml(productTagline))
        .replaceAll('__PRODUCT_DESCRIPTION__', escapeHtml(productDescription)),
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: productName,
        short_name: productShortName,
        description: productDescription,
        theme_color: '#090b14',
        background_color: '#090b14',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        importScripts: ['/push-sw.js'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkOnly',
        }],
      },
    }),
  ],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  build: { target: ['es2018', 'safari13'] },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
  };
});
