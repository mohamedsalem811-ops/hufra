// Plan 8.6: performance budget for the built website. For every page it adds
// up what a first visit downloads from our own build (HTML, CSS, scripts,
// preloaded fonts, logos), gzip-compressed as served, and fails when a limit
// is passed. Photos and figures from the API are not part of the build.
//   npm run build -w @hufra/web && npm run budget -w @hufra/web
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../dist/', import.meta.url).pathname
const KB = 1024
const LIMITS = {
  html: 25 * KB, // one page's HTML
  css: 12 * KB, // all stylesheets of a page
  js: 12 * KB, // all scripts of a page
  fonts: 75 * KB, // every font file in the build (already compressed)
  page: 150 * KB, // everything a first visit to one page downloads
}

const gz = (buf) => gzipSync(buf, { level: 9 }).length
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
const files = walk(DIST)
const fontBytes = files.filter((f) => f.endsWith('.woff2')).reduce((n, f) => n + statSync(f).size, 0)

const failures = []
if (fontBytes > LIMITS.fonts) failures.push(`fonts: ${(fontBytes / KB).toFixed(1)} KB > ${LIMITS.fonts / KB} KB`)

const rows = []
for (const page of files.filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(page, 'utf8')
  const refs = [...new Set([...html.matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)].map((m) => m[1]))]
  const size = { html: gz(Buffer.from(html)), css: 0, js: 0, fonts: 0, images: 0 }
  for (const ref of refs) {
    const file = join(DIST, ref)
    const buf = readFileSync(file)
    if (ref.endsWith('.css')) size.css += gz(buf)
    else if (ref.endsWith('.js')) size.js += gz(buf)
    else if (ref.endsWith('.woff2')) size.fonts += buf.length
    else size.images += /\.(svg)$/.test(ref) ? gz(buf) : buf.length
  }
  // Script modules import shared chunks: count those too.
  for (const ref of refs.filter((r) => r.endsWith('.js'))) {
    for (const m of readFileSync(join(DIST, ref), 'utf8').matchAll(/from\s*"\.\/([^"]+\.js)"/g)) size.js += gz(readFileSync(join(DIST, '_astro', m[1])))
  }
  const total = size.html + size.css + size.js + size.fonts + size.images
  const name = '/' + relative(DIST, page).replace(/index\.html$/, '')
  rows.push({ page: name, ...Object.fromEntries(Object.entries(size).map(([k, v]) => [k, +(v / KB).toFixed(1)])), total: +(total / KB).toFixed(1) })
  for (const key of ['html', 'css', 'js']) if (size[key] > LIMITS[key]) failures.push(`${name} ${key}: ${(size[key] / KB).toFixed(1)} KB > ${LIMITS[key] / KB} KB`)
  if (total > LIMITS.page) failures.push(`${name} total: ${(total / KB).toFixed(1)} KB > ${LIMITS.page / KB} KB`)
}

console.table(rows.sort((a, b) => b.total - a.total))
console.log(`fonts in the build: ${(fontBytes / KB).toFixed(1)} KB`)
if (failures.length) {
  console.error(`Over budget:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('Within budget.')
