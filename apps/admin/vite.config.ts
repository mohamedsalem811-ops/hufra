import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The admin panel is served at /admin on the same domain as the API, so the
// session cookies (HttpOnly, SameSite=Lax) work without CORS. In development
// Vite forwards /api to the local API (npm run dev:worker, port 3000
// by default; override with HUFRA_API).
const api = process.env.HUFRA_API ?? 'http://localhost:3000'

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }, dedupe: ['react', 'react-dom'] },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: api,
        changeOrigin: true,
        // Present the page as the API's own site, as it is in production
        // (one domain): cookie sessions and the cross-site check then behave
        // the same. Cookies ignore ports, so they work on localhost.
        configure: (proxy) => proxy.on('proxyReq', (req) => req.getHeader('origin') && req.setHeader('origin', api)),
      },
      // Report photos are served by the same Worker.
      '/media': { target: api, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true, assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 80, branches: 70, functions: 75, lines: 80 },
    },
  },
})
