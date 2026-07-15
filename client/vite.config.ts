import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Treat & Cure:Medical Receipt System',
        short_name: 'T&C LIS',
        description: 'A comprehensive system for generating and managing medical receipts and estimates.',
        theme_color: '#ffffff',
        background_color: '#f0f2f5',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
          {
            src: 'screenshots/wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide'
          },
          {
            src: 'screenshots/mobile.png',
            sizes: '360x640',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/lab_reports/]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/lab_reports': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
