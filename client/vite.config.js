import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['rj-icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'RJ Thrift Hub',
        short_name: 'RJ Thrift',
        description: 'A one-of-a-kind thrift shopping app.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f5f4ef',
        theme_color: '#24352d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{html,js,css,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === 'GET' &&
              url.hostname.endsWith('.supabase.co') &&
              url.pathname === '/rest/v1/products' &&
              url.searchParams.get('active') === 'eq.true',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rj-public-products-v1',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] }
            }
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rj-product-images-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
});
