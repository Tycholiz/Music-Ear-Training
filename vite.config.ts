/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app is an exercise you're in the middle of. Reloading underneath
      // the user would lose their question, so a new version waits and is
      // offered instead (see UpdatePrompt).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Music Ear Training',
        short_name: 'Ear Training',
        description:
          'Interval and chord ear training for musicians. Works offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#000000',
        background_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // The icon is drawn full-bleed with its content inside the middle
          // 60%, so the same file serves as the maskable variant rather than
          // shipping a byte-identical duplicate.
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // mp3 is the point: the 52 piano samples must be precached or the app
        // is silent on its first offline launch.
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
