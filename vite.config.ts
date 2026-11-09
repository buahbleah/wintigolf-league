import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { devApi } from './dev/apiMiddleware'

export default defineConfig(({ mode }) => {
  // Die API-Handler lesen ihre Zugangsdaten aus process.env — im Dev-Server
  // müssen sie also aus .env.local dorthin gehoben werden.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [
      react(),
      devApi(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
        manifest: {
          name: 'Wintigolf League',
          short_name: 'Wintigolf',
          description: 'Indoor-Golfliga am Simulator: zehn Wochen, zehn Kurse, Netto-Stableford.',
          lang: 'de-CH',
          theme_color: '#0B0F0D',
          background_color: '#0B0F0D',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5180 },
  }
})
