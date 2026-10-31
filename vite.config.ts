import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// Cache-busting stamp: first-party CSS/JS are served as /static/...?v=<stamp>, so
// each deploy gets new URLs that can safely be cached for a year (see public/_headers).
const BUILD_ID =
  process.env.BUILD_ID ||
  (process.env.CF_PAGES_COMMIT_SHA ? process.env.CF_PAGES_COMMIT_SHA.slice(0, 8) : Date.now().toString(36))

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ]
})
