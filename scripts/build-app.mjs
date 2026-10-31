// Builds the offline-capable web bundle that ships INSIDE the native app (www/).
//
// The app pages are pre-rendered from the real worker (dist/_worker.js), so the
// app and the website can never drift apart. Only data (API, photos, map tiles)
// comes from the network; the interface itself opens instantly from the device.
//
//   npm run build:app                      -> www/
//   CAPACITOR_SERVER_URL=https://my.site   -> API base baked into the app
//
// `cap sync` runs this automatically via the "capacitor:sync:before" npm hook.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const out = join(root, 'www')
const apiBase = (process.env.CAPACITOR_SERVER_URL || 'https://hufra.pages.dev').replace(/\/+$/, '')

if (!existsSync(join(dist, '_worker.js'))) {
  console.error('dist/_worker.js not found - run "npm run build" first')
  process.exit(1)
}

const worker = (await import(pathToFileURL(join(dist, '_worker.js')).href)).default
const env = { ADMIN_WHATSAPP: process.env.ADMIN_WHATSAPP || '' }
const ctx = { waitUntil() {}, passThroughOnException() {} }

const PAGES = {
  '/': 'index.html',
  '/map': 'map.html',
  '/report': 'report.html',
  '/transparency': 'transparency.html',
  '/trust': 'trust.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/account': 'account.html',
  '/admin': 'admin.html',
  '/pothole/0': 'pothole.html', // shared template; id comes from ?id=
}

// Clean generated files but keep the folder (Capacitor needs www/ to exist).
mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true })

const flag =
  `<script>window.HUFRA_NATIVE_BUNDLE=true;window.HUFRA_API_BASE=${JSON.stringify(apiBase)};</script>`

function toBundleLinks(html) {
  return html.replace(/href="(\/(?:map|report|transparency|trust|login|register|account|admin|pothole\/\d+)?)(\?[^"]*)?"/g,
    (_m, path, query = '') => {
      if (path === '/') return `href="/index.html${query}"`
      const m = path.match(/^\/pothole\/(\d+)$/)
      if (m) return `href="/pothole.html?id=${m[1]}"`
      return `href="${path}.html${query}"`
    })
}

for (const [route, file] of Object.entries(PAGES)) {
  const res = await worker.fetch(new Request('http://hufra.local' + route), env, ctx)
  if (res.status !== 200) throw new Error(`Pre-render of ${route} failed: HTTP ${res.status}`)
  let html = await res.text()
  html = html.replace('<head>', '<head>\n' + flag)
  html = html.replace(/<script>window\.__HUFRA_POTHOLE_ID__ = [^<]*<\/script>/, '')
  html = toBundleLinks(html)
  writeFileSync(join(out, file), html)
}

cpSync(join(dist, 'static'), join(out, 'static'), { recursive: true })
for (const f of ['favicon.svg', 'manifest.webmanifest']) {
  if (existsSync(join(dist, f))) cpSync(join(dist, f), join(out, f))
}

console.log(`App bundle ready in www/ (${Object.keys(PAGES).length} pages, API ${apiBase})`)
