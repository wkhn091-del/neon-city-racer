import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'textures/waternormals.jpg', 'hdri/*', 'ui/*'],
      manifest: {
        name: 'Neon City Racer',
        short_name: 'NeonRacer',
        description: 'Offline neon coastal street racer',
        theme_color: '#0d1524',
        background_color: '#0d1524',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,jpg,jpeg,webp,glb,hdr,bin,wasm}'],
        globIgnores: ['**/models/stages/**', '**/world_map_raw*', '**/world_map_named*'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
