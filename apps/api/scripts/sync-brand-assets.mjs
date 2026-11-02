// Copies the brand kit (packages/brand) into public/static/brand so the
// website serves the same colours, font and logo as the app (Civic Clarity).
//   node scripts/sync-brand-assets.mjs          copy
//   node scripts/sync-brand-assets.mjs --check  fail if public/ is out of date (CI)
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const brand = path.resolve(here, '../../../packages/brand')
const out = path.resolve(here, '../public/static/brand')

const files = [
  ['dist/tokens.css', 'tokens.css'],
  ['assets/fonts/ReadexPro-Regular.ttf', 'fonts/ReadexPro-Regular.ttf'],
  ['assets/fonts/ReadexPro-SemiBold.ttf', 'fonts/ReadexPro-SemiBold.ttf'],
  ['assets/fonts/ReadexPro-Bold.ttf', 'fonts/ReadexPro-Bold.ttf'],
  ['assets/fonts/OFL.txt', 'fonts/OFL.txt'],
  ['assets/logo/lockup-horizontal-colour.svg', 'logo/lockup-horizontal-colour.svg'],
  ['assets/logo/lockup-horizontal-colour-on-dark.svg', 'logo/lockup-horizontal-colour-on-dark.svg'],
]

const check = process.argv.includes('--check')
const hash = (p) => (fs.existsSync(p) ? createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null)
let stale = 0
for (const [from, to] of files) {
  const src = path.join(brand, from)
  const dst = path.join(out, to)
  if (hash(src) === hash(dst)) continue
  if (check) {
    console.error(`out of date: public/static/brand/${to}`)
    stale++
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
    console.log(`copied ${to}`)
  }
}
if (check && stale) {
  console.error('Run: npm run brand:sync -w @hufra/api')
  process.exit(1)
}
if (check) console.log('public/static/brand is up to date')
