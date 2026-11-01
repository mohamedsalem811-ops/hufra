// Writes dist/ from src/tokens.ts. `--check` exits non-zero if dist/ is out of date (used by CI).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toCss, toJson, toPreviewHtml } from '../src/generate'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const files: Record<string, string> = {
  'tokens.css': toCss(),
  'tokens.json': toJson(),
  'preview.html': toPreviewHtml(),
}

if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(
    ([name, content]) => !existsSync(join(dist, name)) || readFileSync(join(dist, name), 'utf8') !== content
  )
  if (stale.length) {
    console.error(`packages/brand: dist/ is out of date (${stale.map(([n]) => n).join(', ')}). Run: npm run build -w @hufra/brand`)
    process.exit(1)
  }
  console.log('packages/brand: dist/ is up to date')
} else {
  mkdirSync(dist, { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dist, name), content)
  console.log(`packages/brand: wrote ${Object.keys(files).map((n) => `dist/${n}`).join(', ')}`)
}
