// Plan 9.1: everything the one Worker serves as static files, in one folder
// (site/, not committed):
//
//   public/            the old citizen pages' files (until plan 9.2)
//   apps/web/dist/     the website, at the root
//   apps/admin/dist/   the admin panel, under /admin/
//   _headers           security and caching headers (src/lib/security-headers.ts)
//
// Build the website and the admin panel first, or use `npm run build:site`.
// Any file both the old pages and the website would claim stops the build.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { staticHeadersFile } from '../src/lib/security-headers'

const api = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = join(api, 'site')
const LEGACY = join(api, 'public')
const WEB = join(api, '..', 'web', 'dist')
const ADMIN = join(api, '..', 'admin', 'dist')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

for (const [name, dir] of [['website', WEB], ['admin panel', ADMIN]] as const) {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`The ${name} is not built (${relative(api, dir)}): run npm run build:site`)
}

rmSync(SITE, { recursive: true, force: true })
mkdirSync(SITE, { recursive: true })

// Source maps stay out of the public site.
const keep = (src: string) => !src.endsWith('.map')
const claimed = new Map<string, string>()
function copy(from: string, to: string, label: string) {
  for (const file of walk(from).filter(keep)) {
    const rel = '/' + relative(from, file).split('\\').join('/')
    if (rel === '/_headers') continue
    const target = (to === '/' ? '' : to) + rel
    const owner = claimed.get(target)
    if (owner) throw new Error(`${target} is in both ${owner} and ${label}`)
    claimed.set(target, label)
  }
  cpSync(from, join(SITE, to), { recursive: true, filter: (src) => keep(src) && !src.endsWith(`${from}/_headers`) })
}
copy(LEGACY, '/', 'the old pages (public/)')
copy(WEB, '/', 'the website (apps/web/dist)')
copy(ADMIN, '/admin', 'the admin panel (apps/admin/dist)')

writeFileSync(join(SITE, '_headers'), staticHeadersFile(readFileSync(join(LEGACY, '_headers'), 'utf8')))

for (const required of ['index.html', 'en/index.html', 'r/index.html', 'en/r/index.html', '404.html', 'sitemap.xml', 'robots.txt', 'admin/index.html', '_headers']) {
  if (!existsSync(join(SITE, required))) throw new Error(`site/${required} is missing`)
}
const files = walk(SITE)
const bytes = files.reduce((n, f) => n + statSync(f).size, 0)
console.log(`site/: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (old pages, website, admin panel, _headers)`)
