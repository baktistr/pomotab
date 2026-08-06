import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Every route is served by index.html (SPA); the app has no network
        // calls at all, so a precache-only strategy is enough for full offline.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Take control as soon as the worker activates so the very first visit
        // is already offline-capable. Safe with registerType 'prompt': a new
        // worker still waits for the user to accept the update before it
        // activates at all.
        clientsClaim: true,
      },
      manifest: {
        name: 'PomoTab — private focus workspace',
        short_name: 'PomoTab',
        description:
          'Pomodoro timer, kanban board and activity history. All data stays on your device.',
        theme_color: '#18181b',
        background_color: '#18181b',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Board and Activity are lazy routes, so dnd-kit and recharts already land
    // in their own chunks. Splitting the framework out too means a deploy that
    // only touches app code leaves the biggest chunk cached.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler|react-router)/.test(id)) return 'react'
          if (id.includes('node_modules/dexie')) return 'db'
          return undefined
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})
