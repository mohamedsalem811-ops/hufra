// Compares the production D1 database's structure with what the migrations
// build from scratch, and lists every difference.
//
// Why: the production database is older than this repository. One migration
// (0006) had been applied to it in an earlier form, so a column every report
// needs (potholes.upvotes_count) was missing and lists failed on the live site
// while every test passed on a fresh database. CI runs this after applying the
// migrations and before deploying the Worker, so code never goes live against a
// database that differs from the one it was tested on.
//
//   npx tsx scripts/check-schema.ts           exit 1 if production lacks anything
//   npx tsx scripts/check-schema.ts --report  print the differences, always exit 0
//
// Read-only on production: it only lists tables, columns, indexes and triggers
// (names and column types), never any rows. Needs CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID, like `wrangler d1 migrations apply --remote`.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DB = 'hufra-production'
const reportOnly = process.argv.includes('--report')

const SQL = `
SELECT m.type AS kind, m.name AS name, COALESCE(p.name, '') AS col,
       COALESCE(p.type, '') AS col_type, COALESCE(p."notnull", 0) AS not_null
FROM sqlite_master m
LEFT JOIN pragma_table_info(m.name) p ON m.type = 'table'
WHERE m.type IN ('table', 'index', 'trigger')
  AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name <> 'd1_migrations'
ORDER BY kind, name, col`

type Row = { kind: string; name: string; col: string; col_type: string; not_null: number }

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 })
}

function query(where: string[]): Row[] {
  const out = wrangler(['d1', 'execute', DB, ...where, '--json', '--command', SQL])
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  return (parsed[0]?.results ?? []) as Row[]
}

// The structure the migrations produce, on a throwaway local database.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hufra-schema-'))
let expected: Row[]
try {
  wrangler(['d1', 'migrations', 'apply', DB, '--local', '--persist-to', scratch])
  expected = query(['--local', '--persist-to', scratch])
} finally {
  fs.rmSync(scratch, { recursive: true, force: true })
}
const actual = query(['--remote'])

const objects = (rows: Row[]) => new Set(rows.map((r) => `${r.kind} ${r.name}`))
const columns = (rows: Row[]) => new Map(rows.filter((r) => r.kind === 'table' && r.col).map((r) => [`${r.name}.${r.col}`, r]))

const wantObjects = objects(expected)
const haveObjects = objects(actual)
const wantCols = columns(expected)
const haveCols = columns(actual)

const missing: string[] = []
const extra: string[] = []
const different: string[] = []
for (const o of wantObjects) if (!haveObjects.has(o)) missing.push(o)
for (const [k, want] of wantCols) {
  const have = haveCols.get(k)
  if (!have) {
    if (haveObjects.has(`table ${want.name}`)) missing.push(`column ${k} ${want.col_type}${want.not_null ? ' NOT NULL' : ''}`)
  } else if (have.col_type.toUpperCase() !== want.col_type.toUpperCase() || Number(have.not_null) !== Number(want.not_null)) {
    different.push(`column ${k}: production ${have.col_type}${have.not_null ? ' NOT NULL' : ''}, migrations ${want.col_type}${want.not_null ? ' NOT NULL' : ''}`)
  }
}
for (const o of haveObjects) if (!wantObjects.has(o)) extra.push(o)
for (const k of haveCols.keys()) if (!wantCols.has(k) && wantObjects.has(`table ${k.split('.')[0]}`)) extra.push(`column ${k}`)

const list = (title: string, items: string[]) => {
  console.log(`${title}: ${items.length ? '' : 'none'}`)
  for (const i of items.sort()) console.log(`  - ${i}`)
}
console.log(`Production database "${DB}" compared with a fresh database built from migrations/:`)
list('Missing in production', missing)
list('Different in production', different)
list('Only in production (left alone)', extra)

if (missing.length && !reportOnly) {
  console.error('\nProduction is missing parts of the schema the code expects. Add a migration that repairs it; the Worker was not deployed.')
  process.exit(1)
}
