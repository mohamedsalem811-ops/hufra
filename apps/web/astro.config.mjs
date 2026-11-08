// HUFRA website (plan 8.4). Static pages; live figures are fetched from /api on
// the same domain. In development /api and /media go to a local API:
//   HUFRA_API=http://localhost:8788 npm run dev -w @hufra/web
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const api = process.env.HUFRA_API ?? 'http://localhost:8788'

// Shared report links /r/<id> use one page, /r/ (plan 8.5). The Worker serves it
// in production; this does the same in development.
const sharedLinks = {
  name: 'hufra-shared-links',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const m = /^(\/en)?\/r\/[1-9]\d{0,9}\/?(\?.*)?$/.exec(req.url ?? '')
      if (m) req.url = `${m[1] ?? ''}/r/`
      next()
    })
  },
}

export default defineConfig({
  // The public address. Set at the switch-over to the final domain (plan 1.2 / 9.1).
  site: process.env.HUFRA_SITE ?? 'https://hufra.mohamedsalem811.workers.dev',
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  i18n: { defaultLocale: 'ar', locales: ['ar', 'en'], routing: { prefixDefaultLocale: false } },
  vite: {
    plugins: [tailwindcss(), sharedLinks],
    server: { proxy: { '/api': { target: api, changeOrigin: true }, '/media': { target: api, changeOrigin: true } } },
  },
})
